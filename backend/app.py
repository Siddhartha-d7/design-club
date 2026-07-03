import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from bson import ObjectId
from datetime import datetime, timedelta

from config import Config
from db import init_db, users_col, uploads_col, topics_col, polls_col, db_mode
from auth import generate_token, token_required

app = Flask(__name__)
app.config.from_object(Config)

# Enable CORS for frontend integration
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.route('/')
def home():
    return jsonify({
        "status": "live",
        "message": "Design Club Backend Server is running!",
        "database_mode": db_mode
    }), 200

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# 2026-2027 Monthly cycles starting from June 15, 2026
CYCLES = [
    {"id": "2026-07-06", "name": "July 6, 2026 — August 6, 2026"},
    {"id": "2026-08-06", "name": "August 6, 2026 — September 6, 2026"},
    {"id": "2026-09-06", "name": "September 6, 2026 — October 6, 2026"},
    {"id": "2026-10-06", "name": "October 6, 2026 — November 6, 2026"},
    {"id": "2026-11-06", "name": "November 6, 2026 — December 6, 2026"},
    {"id": "2026-12-06", "name": "December 6, 2026 — January 6, 2027"},
    {"id": "2027-01-06", "name": "January 6, 2027 — February 6, 2027"},
    {"id": "2027-02-06", "name": "February 6, 2027 — March 6, 2027"},
    {"id": "2027-03-06", "name": "March 6, 2027 — April 6, 2027"},
    {"id": "2027-04-06", "name": "April 6, 2027 — May 6, 2027"},
    {"id": "2027-05-06", "name": "May 6, 2027 — June 6, 2027"},
]

def get_default_cycle():
    """
    Returns the cycle_id that the current date falls into.
    """
    today = datetime.utcnow().date()
    
    for i, cycle in enumerate(CYCLES):
        start_dt = datetime.strptime(cycle["id"], "%Y-%m-%d").date()
        if i < len(CYCLES) - 1:
            next_start_dt = datetime.strptime(CYCLES[i+1]["id"], "%Y-%m-%d").date()
        else:
            next_start_dt = start_dt + timedelta(days=31)
            
        if start_dt <= today < next_start_dt:
            return cycle["id"]
            
    # Fallback bounds
    first_start = datetime.strptime(CYCLES[0]["id"], "%Y-%m-%d").date()
    if today < first_start:
        return CYCLES[0]["id"]
    return CYCLES[-1]["id"]

# Helper function to check allowed file extensions
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def recalculate_student_points(student_id, cycle_id):
    """
    Recalculates a student's total points based on their uploads and manual adjustments for a specific cycle.
    """
    student_id_obj = ObjectId(student_id)
    
    # Calculate sum of points from all uploads in this cycle
    pipeline = [
        {"$match": {"student_id": student_id_obj, "cycle_id": cycle_id}},
        {"$group": {"_id": None, "total": {"$sum": "$points_awarded"}}}
    ]
    result = list(uploads_col.aggregate(pipeline))
    uploads_total = result[0]['total'] if result else 0
    
    # Fetch manual adjustments / feedback points for this cycle
    student = users_col.find_one({"_id": student_id_obj})
    if not student:
        return 0
        
    adjusts = student.get("cycle_adjustments", {}).get(cycle_id, {})
    feedback_points = adjusts.get("feedback_points", 0)
    manual_bonus = adjusts.get("manual_bonus", 0)
    
    total_points = uploads_total + feedback_points + manual_bonus
    
    # Save back to student document
    points_by_cycle = student.get("points_by_cycle", {})
    if not isinstance(points_by_cycle, dict):
        points_by_cycle = {}
        
    points_by_cycle[cycle_id] = total_points
    
    users_col.update_one(
        {"_id": student_id_obj},
        {"$set": {
            "points_by_cycle": points_by_cycle,
            "points": total_points # Update legacy/primary points field to the active cycle value
        }}
    )
    return total_points

def compute_leaderboard_ranks(cycle_id):
    """
    Query all students, compute their points for the specific cycle_id,
    sort them, and assign ranks and titles dynamically.
    Returns a list of students with calculated ranks and titles.
    """
    students = list(users_col.find({"role": "student"}))
    
    # Calculate points for each student for this cycle
    student_points_map = {}
    for s in students:
        s_id = s["_id"]
        # Sum uploads for this student and this cycle
        pipeline = [
            {"$match": {"student_id": s_id, "cycle_id": cycle_id}},
            {"$group": {"_id": None, "total": {"$sum": "$points_awarded"}}}
        ]
        res = list(uploads_col.aggregate(pipeline))
        uploads_total = res[0]['total'] if res else 0
        
        # Fetch cycle adjustments
        adjusts = s.get("cycle_adjustments", {}).get(cycle_id, {})
        feedback_points = adjusts.get("feedback_points", 0)
        manual_bonus = adjusts.get("manual_bonus", 0)
        
        total_points = uploads_total + feedback_points + manual_bonus
        student_points_map[str(s_id)] = total_points
        
    # Identify the most consistent student (most total submissions in this cycle)
    pipeline = [
        {"$match": {"cycle_id": cycle_id}},
        {"$group": {"_id": "$student_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1}
    ]
    most_consistent_result = list(uploads_col.aggregate(pipeline))
    most_consistent_id = str(most_consistent_result[0]['_id']) if most_consistent_result else None
    
    # Update current points value for sorting
    for s in students:
        s["points"] = student_points_map[str(s["_id"])]
        
    # Sort students by points descending
    students.sort(key=lambda x: x["points"], reverse=True)
    
    # Identify poll-based titles from the latest ended poll in this cycle
    poll_titles = {}
    polls = list(polls_col.find({"cycle_id": cycle_id, "status": "ended"}).sort("created_at", -1))
    latest_poll = polls[0] if polls else None
    if latest_poll:
        options = latest_poll.get("options", [])
        # Sort options by votes descending
        sorted_opts = sorted(options, key=lambda x: x.get("votes", 0), reverse=True)
        for idx, opt in enumerate(sorted_opts[:3]):
            upload_id = opt.get("upload_id")
            if upload_id:
                upload = uploads_col.find_one({"_id": ObjectId(upload_id)})
                if upload:
                    s_id = str(upload["student_id"])
                    if s_id not in poll_titles:
                        if idx == 0:
                            poll_titles[s_id] = "🥇 MONTHLY BEST DESIGNER"
                        elif idx == 1:
                            poll_titles[s_id] = "🥈 RISING STAR"
                        elif idx == 2:
                            poll_titles[s_id] = "🥉 CREATIVE SPARK"
                        
    leaderboard = []
    for index, student in enumerate(students):
        student_id_str = str(student["_id"])
        
        # Rank is 1-indexed
        rank = index + 1
        
        # Calculate Title based on Poll results first, or fallback to Points/Ranks
        if student_id_str in poll_titles:
            title = poll_titles[student_id_str]
        else:
            if not latest_poll:
                if rank == 1 and student["points"] > 0:
                    title = "🥇 MONTHLY BEST DESIGNER"
                elif rank == 2 and student["points"] > 0:
                    title = "🥈 RISING STAR"
                elif rank == 3 and student["points"] > 0:
                    title = "🥉 CREATIVE SPARK"
                else:
                    if student["points"] >= 100:
                        title = "CREATIVE BEAST"
                    elif student["points"] >= 50:
                        title = "DESIGN ENTHUSIAST"
                    elif student["points"] >= 20:
                        title = "RISING TALENT"
                    else:
                        title = "CLUB MEMBER"
            else:
                if student["points"] >= 100:
                    title = "CREATIVE BEAST"
                elif student["points"] >= 50:
                    title = "DESIGN ENTHUSIAST"
                elif student["points"] >= 20:
                    title = "RISING TALENT"
                else:
                    title = "CLUB MEMBER"
                    
        # Persist the calculated title to the student's document
        users_col.update_one(
            {"_id": student["_id"]},
            {"$set": {"title": title}}
        )
                
        # Append special badge for consistency
        badges = []
        if student_id_str == most_consistent_id and student["points"] > 0:
            badges.append("⭐ MOST CONSISTENT")
            
        adjusts = student.get("cycle_adjustments", {}).get(cycle_id, {})
        custom_badge = adjusts.get("custom_badge", "")
        if custom_badge:
            badges.append(custom_badge)
            
        leaderboard.append({
            "id": student_id_str,
            "name": student["name"],
            "email": student["email"],
            "college_name": student["college_name"],
            "passout_year": student["passout_year"],
            "points": student["points"],
            "rank": rank,
            "title": title,
            "badges": badges
        })
        
    return leaderboard

# ==========================================
# AUTHENTICATION ENDPOINTS
# ==========================================

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    college_name = data.get('college_name')
    passout_year = data.get('passout_year')
    role = data.get('role', 'student') # Default to student
    
    if not name or not email or not password:
        return jsonify({'error': 'Name, email, and password are required!'}), 400
        
    if role == 'leader':
        passcode = data.get('passcode')
        if passcode != Config.LEADER_PASSCODE:
            return jsonify({'error': 'Invalid Team Lead verification passcode!'}), 403
            
    # Check if user already exists
    if users_col.find_one({"email": email.lower()}):
        return jsonify({'error': 'Email address already registered!'}), 400
        
    user_doc = {
        "name": name,
        "email": email.lower(),
        "password_hash": generate_password_hash(password),
        "college_name": college_name or "N/A",
        "passout_year": passout_year or "N/A",
        "role": role,
        "points": 0,
        "feedback_points": 0, # +2 pts for feedback, max 3/day
        "manual_bonus": 0,
        "custom_badge": "",
        "created_at": datetime.utcnow()
    }
    
    result = users_col.insert_one(user_doc)
    token = generate_token(result.inserted_id, role)
    
    return jsonify({
        'message': 'Registration successful!',
        'token': token,
        'user': {
            'id': str(result.inserted_id),
            'name': name,
            'email': email,
            'role': role,
            'points': 0
        }
    }), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({'error': 'Email and password are required!'}), 400
        
    user = users_col.find_one({"email": email.lower()})
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid email or password!'}), 401
        
    token = generate_token(user['_id'], user['role'])
    
    cycle_id = get_default_cycle()
    points = user.get("points_by_cycle", {}).get(cycle_id, 0)
    
    return jsonify({
        'message': 'Login successful!',
        'token': token,
        'user': {
            'id': str(user['_id']),
            'name': user['name'],
            'email': user['email'],
            'role': user['role'],
            'points': points
        }
    }), 200

# ==========================================
# TOPIC ENDPOINTS
# ==========================================

@app.route('/api/topics', methods=['GET'])
@token_required
def get_topics(current_user):
    topics = list(topics_col.find({}).sort("day", 1))
    for t in topics:
        t['_id'] = str(t['_id'])
    return jsonify(topics), 200

@app.route('/api/topics/<day_number>', methods=['PUT'])
@token_required
def update_topic(current_user, day_number):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    data = request.get_json() or {}
    title = data.get('title')
    desc = data.get('desc')
    
    if not title or not desc:
        return jsonify({'error': 'Title and description are required!'}), 400
        
    result = topics_col.update_one(
        {"day": int(day_number)},
        {"$set": {"title": title, "desc": desc}}
    )
    
    if result.matched_count == 0:
        return jsonify({'error': 'Topic day not found!'}), 404
        
    return jsonify({'message': f'Topic for Day {day_number} updated successfully!'}), 200

# ==========================================
# STUDENT ENDPOINTS
# ==========================================

@app.route('/api/student/dashboard', methods=['GET'])
@token_required
def get_student_dashboard(current_user):
    if current_user['role'] != 'student':
        return jsonify({'error': 'Student portal access only!'}), 403
        
    cycle_id = request.args.get('cycle')
    if not cycle_id:
        cycle_id = get_default_cycle()
        
    student_id = ObjectId(current_user['_id'])
    
    # Get all uploads for student in this cycle
    uploads = list(uploads_col.find({"student_id": student_id, "cycle_id": cycle_id}).sort("day_number", 1))
    for u in uploads:
        u['_id'] = str(u['_id'])
        u['student_id'] = str(u['student_id'])
        
    # Get current leaderboard to find rank & title
    leaderboard = compute_leaderboard_ranks(cycle_id)
    student_stats = next((s for s in leaderboard if s['id'] == current_user['_id']), None)
    
    rank = student_stats['rank'] if student_stats else 0
    title = student_stats['title'] if student_stats else "CLUB MEMBER"
    badges = student_stats['badges'] if student_stats else []
    
    # Fetch student document to get adjustments for this cycle
    user_doc = users_col.find_one({"_id": student_id})
    adjusts = user_doc.get("cycle_adjustments", {}).get(cycle_id, {})
    feedback_points = adjusts.get("feedback_points", 0)
    manual_bonus = adjusts.get("manual_bonus", 0)
    
    # Calculate daily submission state (for the visual tracker)
    submission_tracker = {}
    for upload in uploads:
        submission_tracker[upload['day_number']] = upload['type']
        
    # Generate daily graph points (dates vs points earned)
    graph_data = []
    cumulative_points = 0
    
    # Seed base state
    graph_data.append({
        "day": 0,
        "date": "Start",
        "points": 0,
        "cumulative": 0
    })
    
    for upload in sorted(uploads, key=lambda x: x['day_number']):
        cumulative_points += upload['points_awarded']
        graph_data.append({
            "day": upload['day_number'],
            "date": upload['date'],
            "points": upload['points_awarded'],
            "cumulative": cumulative_points
        })
        
    # Add final step for adjustments
    extra_points = feedback_points + manual_bonus
    if extra_points > 0:
        cumulative_points += extra_points
        graph_data.append({
            "day": 32, # Out of typical range to show final adjustments
            "date": "Adjustments",
            "points": extra_points,
            "cumulative": cumulative_points
        })
        
    cycle_points = sum(u['points_awarded'] for u in uploads) + extra_points
    
    return jsonify({
        "metrics": {
            "total_posts": len(uploads),
            "total_points": cycle_points,
            "rank": rank,
            "title": title,
            "badges": badges,
            "feedback_points": feedback_points,
            "manual_bonus": manual_bonus
        },
        "submission_tracker": submission_tracker,
        "graph_data": graph_data,
        "uploads": uploads
    }), 200

@app.route('/api/student/upload', methods=['POST'])
@token_required
def student_upload(current_user):
    if current_user['role'] != 'student':
        return jsonify({'error': 'Unauthorized! Students only.'}), 403
        
    cycle_id = request.form.get('cycle_id')
    day_number_raw = request.form.get('day_number')
    submission_type = request.form.get('type') # 'task', 'meme', or 'both'
    tool_used = request.form.get('tool_used')
    time_taken_raw = request.form.get('time_taken')
    custom_topic = request.form.get('topic') # Student-entered custom topic
    
    if not cycle_id or not day_number_raw or not submission_type or not tool_used or not time_taken_raw or not custom_topic:
        return jsonify({'error': 'Missing form fields!'}), 400
        
    try:
        start_date = datetime.strptime(cycle_id, "%Y-%m-%d").date()
    except Exception:
        return jsonify({'error': 'Invalid cycle ID format!'}), 400
        
    day_number = int(day_number_raw)
    time_taken = int(time_taken_raw)
    
    # Check if user already submitted for this day in this cycle
    existing = uploads_col.find_one({
        "student_id": ObjectId(current_user['_id']),
        "cycle_id": cycle_id,
        "day_number": day_number
    })
    if existing:
        return jsonify({'error': f'You have already submitted an entry for Day {day_number} in this cycle!'}), 400
        
    # Validate primary file
    if 'image' not in request.files:
        return jsonify({'error': 'No image file uploaded!'}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected image file!'}), 400
        
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid design image type. Allowed types: PNG, JPG, JPEG, GIF, WEBP.'}), 400
        
    # Save design image
    ext = file.filename.rsplit('.', 1)[1].lower()
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_name = f"{current_user['_id']}_cycle_{cycle_id}_day{day_number}_{timestamp}.{ext}"
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], safe_name)
    file.save(file_path)
    image_url = f"/uploads/{safe_name}"
    
    # Save meme image if submission type is both
    image_meme_url = None
    if submission_type == "both":
        if 'image_meme' not in request.files:
            return jsonify({'error': 'Please select both design task and meme graphic images!'}), 400
        file_meme = request.files['image_meme']
        if file_meme.filename == '':
            return jsonify({'error': 'No selected meme graphic image!'}), 400
        if not allowed_file(file_meme.filename):
            return jsonify({'error': 'Invalid meme image type. Allowed types: PNG, JPG, JPEG, GIF, WEBP.'}), 400
            
        ext_meme = file_meme.filename.rsplit('.', 1)[1].lower()
        safe_name_meme = f"{current_user['_id']}_cycle_{cycle_id}_day{day_number}_meme_{timestamp}.{ext_meme}"
        file_path_meme = os.path.join(app.config['UPLOAD_FOLDER'], safe_name_meme)
        file_meme.save(file_path_meme)
        image_meme_url = f"/uploads/{safe_name_meme}"

    # Calculate date based on cycle_id + day_number (1-indexed)
    topic_date = start_date + timedelta(days=day_number - 1)
    topic_date_str = topic_date.strftime("%Y-%m-%d")
    
    # Current date based on server
    current_date = datetime.utcnow().date()
    is_late = current_date > topic_date
    
    # Points Logic
    if is_late:
        # Late posts receive +2 points (late bonus) or +4 points if both
        points = 2 if submission_type != "both" else 4
    else:
        # On time
        if submission_type == "both":
            points = 10
        elif submission_type == "task":
            points = 5
        elif submission_type == "meme":
            points = 3
        else:
            points = 0
            
    upload_doc = {
        "student_id": ObjectId(current_user['_id']),
        "student_name": current_user['name'],
        "college_name": current_user['college_name'],
        "cycle_id": cycle_id,
        "day_number": day_number,
        "date": topic_date_str,
        "topic": custom_topic,
        "type": submission_type,
        "tool_used": tool_used,
        "time_taken": time_taken,
        "image_url": image_url,
        "image_meme_url": image_meme_url,
        "points_awarded": points,
        "status": "pending", # 'pending' or 'reviewed'
        "feedback": "",
        "showcase_award": "none",
        "is_insta_pick": False,
        "is_late": is_late,
        "submitted_at": datetime.utcnow(),
        "points_breakdown": {
            "base_points": points,
            "showcase_bonus": 0,
            "manual_bonus": 0
        }
    }
    
    uploads_col.insert_one(upload_doc)
    
    # Recalculate total student points for this cycle
    new_total = recalculate_student_points(current_user['_id'], cycle_id)
    
    return jsonify({
        'message': 'Task uploaded successfully!',
        'points_earned': points,
        'total_points': new_total,
        'image_url': image_url
    }), 201

# ==========================================
# LEADERBOARD ENDPOINT
# ==========================================

@app.route('/api/leaderboard', methods=['GET'])
@token_required
def get_leaderboard(current_user):
    cycle_id = request.args.get('cycle')
    if not cycle_id:
        cycle_id = get_default_cycle()
    leaderboard = compute_leaderboard_ranks(cycle_id)
    return jsonify(leaderboard), 200

# ==========================================
# TEAM LEAD (COORDINATOR) ENDPOINTS
# ==========================================

@app.route('/api/admin/students', methods=['GET'])
@token_required
def admin_get_students(current_user):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    cycle_id = request.args.get('cycle')
    if not cycle_id:
        cycle_id = get_default_cycle()
        
    students = compute_leaderboard_ranks(cycle_id)
    return jsonify(students), 200

@app.route('/api/admin/uploads', methods=['GET'])
@token_required
def admin_get_uploads(current_user):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    cycle_id = request.args.get('cycle')
    query = {}
    if cycle_id:
        query["cycle_id"] = cycle_id
        
    uploads = list(uploads_col.find(query).sort("submitted_at", -1))
    for u in uploads:
        u['_id'] = str(u['_id'])
        u['student_id'] = str(u['student_id'])
    return jsonify(uploads), 200

@app.route('/api/admin/student/<student_id>/uploads', methods=['GET'])
@token_required
def admin_student_uploads(current_user, student_id):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    cycle_id = request.args.get('cycle')
    if not cycle_id:
        cycle_id = get_default_cycle()
        
    student = users_col.find_one({"_id": ObjectId(student_id)})
    if not student:
        return jsonify({'error': 'Student not found!'}), 404
        
    uploads = list(uploads_col.find({
        "student_id": ObjectId(student_id),
        "cycle_id": cycle_id
    }).sort("day_number", 1))
    
    for u in uploads:
        u['_id'] = str(u['_id'])
        u['student_id'] = str(u['student_id'])
        
    # Get current ranks and student stats in this cycle
    leaderboard = compute_leaderboard_ranks(cycle_id)
    student_stats = next((s for s in leaderboard if s['id'] == student_id), None)
    
    rank = student_stats['rank'] if student_stats else 0
    title = student_stats['title'] if student_stats else "CLUB MEMBER"
    points = student_stats['points'] if student_stats else 0
    
    adjusts = student.get("cycle_adjustments", {}).get(cycle_id, {})
    feedback_points = adjusts.get("feedback_points", 0)
    manual_bonus = adjusts.get("manual_bonus", 0)
    custom_badge = adjusts.get("custom_badge", "")
    
    return jsonify({
        "student": {
            "id": str(student["_id"]),
            "name": student["name"],
            "email": student["email"],
            "college_name": student["college_name"],
            "passout_year": student["passout_year"],
            "points": points,
            "feedback_points": feedback_points,
            "manual_bonus": manual_bonus,
            "custom_badge": custom_badge,
            "rank": rank,
            "title": title
        },
        "uploads": uploads
    }), 200

@app.route('/api/admin/uploads/<upload_id>/evaluate', methods=['POST'])
@token_required
def admin_evaluate_upload(current_user, upload_id):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    data = request.get_json() or {}
    
    # Evaluation details
    feedback = data.get('feedback', '')
    showcase_award = data.get('showcase_award') # 'none', 'top3' (+15), 'win1' (+25)
    extra_points = int(data.get('extra_points', 0))
    base_points_adjustment = data.get('base_points') # Optional override of auto points
    
    upload = uploads_col.find_one({"_id": ObjectId(upload_id)})
    if not upload:
        return jsonify({'error': 'Upload not found!'}), 404
        
    # Calculate points
    points_breakdown = upload.get('points_breakdown') or {}
    base_points = int(base_points_adjustment) if base_points_adjustment is not None else points_breakdown.get('base_points', upload.get('points_awarded', 0))
    
    showcase_bonus = 0
    if showcase_award == 'top3':
        showcase_bonus = 15
    elif showcase_award == 'win1':
        showcase_bonus = 25
        
    new_points = base_points + showcase_bonus + extra_points
    
    # Update upload doc
    uploads_col.update_one(
        {"_id": ObjectId(upload_id)},
        {"$set": {
            "status": "reviewed",
            "feedback": feedback,
            "points_awarded": new_points,
            "showcase_award": showcase_award,
            "points_breakdown": {
                "base_points": base_points,
                "showcase_bonus": showcase_bonus,
                "manual_bonus": extra_points
            }
        }}
    )
    
    # Recalculate student total score for this cycle
    cycle_id = upload.get("cycle_id", "2026-07-06")
    new_total = recalculate_student_points(upload['student_id'], cycle_id)
    
    return jsonify({'message': 'Evaluation updated successfully!', 'points_awarded': new_points, 'total_points': new_total}), 200

@app.route('/api/admin/students/<student_id>/adjust-points', methods=['POST'])
@token_required
def admin_adjust_student_points(current_user, student_id):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    data = request.get_json() or {}
    cycle_id = data.get('cycle')
    if not cycle_id:
        cycle_id = get_default_cycle()
        
    feedback_points = int(data.get('feedback_points', 0))
    manual_bonus = int(data.get('manual_bonus', 0))
    custom_badge = data.get('custom_badge', '')
    
    student = users_col.find_one({"_id": ObjectId(student_id)})
    if not student:
        return jsonify({'error': 'Student not found!'}), 404
        
    # Fetch existing adjustments and update nested structure
    cycle_adjustments = student.get("cycle_adjustments", {})
    if not isinstance(cycle_adjustments, dict):
        cycle_adjustments = {}
        
    new_adjusts = dict(cycle_adjustments.get(cycle_id, {}))
    if 'feedback_points' in data:
        new_adjusts['feedback_points'] = feedback_points
    if 'manual_bonus' in data:
        new_adjusts['manual_bonus'] = manual_bonus
    if 'custom_badge' in data:
        new_adjusts['custom_badge'] = custom_badge
        
    cycle_adjustments[cycle_id] = new_adjusts
    
    users_col.update_one(
        {"_id": ObjectId(student_id)},
        {"$set": {"cycle_adjustments": cycle_adjustments}}
    )
    
    # Recalculate and fetch new score
    new_total = recalculate_student_points(student_id, cycle_id)
    
    return jsonify({
        'message': 'Student points updated successfully!',
        'total_points': new_total
    }), 200

# ==========================================
# POLL HELPERS
# ==========================================

def close_poll_and_award_points(poll):
    """
    Closes the active poll and automatically assigns Saturday Showcase Winner / Top 3 awards 
    based on vote count descending.
    1st: Showcase Winner (win1, +25 pts)
    2nd: Saturday Top 3 (top3, +15 pts)
    3rd: Saturday Top 3 (top3, +15 pts)
    """
    options = poll.get("options", [])
    if not options:
        polls_col.update_one({"_id": poll["_id"] if isinstance(poll["_id"], ObjectId) else ObjectId(poll["_id"])}, {"$set": {"status": "ended"}})
        return
        
    # Sort options by votes descending
    options.sort(key=lambda x: x.get("votes", 0), reverse=True)
    
    awards = [
        {"award": "win1", "bonus": 25},  # 1st
    ]
    
    for idx, opt in enumerate(options[:1]):
        upload_id = opt.get("upload_id")
        if not upload_id:
            continue
        award_details = awards[idx]
        award_type = award_details["award"]
        showcase_bonus = award_details["bonus"]
        
        # Load the upload doc
        upload = uploads_col.find_one({"_id": ObjectId(upload_id)})
        if not upload:
            continue
            
        # Update points breakdown
        points_breakdown = upload.get('points_breakdown') or {}
        base_points = points_breakdown.get('base_points', upload.get('points_awarded', 0))
        manual_bonus = points_breakdown.get('manual_bonus', 0)
        new_points = base_points + showcase_bonus + manual_bonus
        
        # Add feedback congratulating them
        orig_feedback = upload.get("feedback", "") or ""
        # Remove any previous [POLL RESULTS] lines to prevent duplicates
        clean_lines = [line for line in orig_feedback.split('\n') if "[POLL RESULTS]" not in line and "Showcase Poll!" not in line]
        orig_feedback = "\n".join(clean_lines).strip()
        
        congrats_message = f"\n\n[POLL RESULTS] Congratulations! This post was selected as the Showcase Winner in the Saturday Showcase Poll! (+{showcase_bonus} pts showcase award)"
        feedback = (orig_feedback + congrats_message).strip()
        
        # Update upload document
        uploads_col.update_one(
            {"_id": ObjectId(upload_id)},
            {"$set": {
                "status": "reviewed",
                "feedback": feedback,
                "points_awarded": new_points,
                "showcase_award": award_type,
                "points_breakdown": {
                    "base_points": base_points,
                    "showcase_bonus": showcase_bonus,
                    "manual_bonus": manual_bonus
                }
            }}
        )
        
        # Recalculate student points
        recalculate_student_points(str(upload["student_id"]), upload.get("cycle_id", "2026-07-06"))
        
    # Mark poll as ended
    poll_id_obj = poll["_id"] if isinstance(poll["_id"], ObjectId) else ObjectId(poll["_id"])
    polls_col.update_one({"_id": poll_id_obj}, {"$set": {"status": "ended", "options": options}})

def check_active_poll_status():
    """
    Finds if there is an active poll. If active poll exists but expires_at has passed,
    it automatically closes it and awards the points.
    Returns the active poll doc if active and not expired, else None.
    """
    active_poll = polls_col.find_one({"status": "active"})
    if not active_poll:
        return None
        
    expires_at_raw = active_poll.get("expires_at")
    if not expires_at_raw:
        return active_poll
        
    if isinstance(expires_at_raw, str):
        try:
            expires_at = datetime.fromisoformat(expires_at_raw)
        except Exception:
            expires_at = None
    else:
        expires_at = expires_at_raw
        
    if expires_at and datetime.utcnow() >= expires_at:
        close_poll_and_award_points(active_poll)
        return None
        
    return active_poll

# ==========================================
# POLL & INSTAGRAM ROUTE HANDLERS
# ==========================================

@app.route('/api/admin/uploads/<upload_id>/pick-insta', methods=['POST'])
@token_required
def admin_pick_insta(current_user, upload_id):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    upload = uploads_col.find_one({"_id": ObjectId(upload_id)})
    if not upload:
        return jsonify({'error': 'Upload not found!'}), 404
        
    data = request.get_json(silent=True) or {}
    pick_type = data.get("pick_type") # 'task' or 'meme'
    
    upload_type = upload.get("type", "task")
    if upload_type != "both":
        pick_type = upload_type
    elif not pick_type:
        pick_type = "task"
        
    current_pick = upload.get("is_insta_pick", False)
    current_pick_type = upload.get("insta_pick_type")
    
    if current_pick and current_pick_type == pick_type:
        new_pick = False
        new_pick_type = None
    else:
        new_pick = True
        new_pick_type = pick_type
        
    uploads_col.update_one(
        {"_id": ObjectId(upload_id)},
        {"$set": {
            "is_insta_pick": new_pick,
            "insta_pick_type": new_pick_type
        }}
    )
    
    return jsonify({
        'message': f'Post {"picked" if new_pick else "unpicked"} for Instagram successfully!',
        'is_insta_pick': new_pick,
        'insta_pick_type': new_pick_type
    }), 200

@app.route('/api/admin/insta-picks', methods=['GET'])
@token_required
def admin_get_insta_picks(current_user):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    cycle_id = request.args.get('cycle')
    if not cycle_id:
        cycle_id = get_default_cycle()
        
    picks = list(uploads_col.find({
        "cycle_id": cycle_id,
        "is_insta_pick": True
    }))
    
    for p in picks:
        p['_id'] = str(p['_id'])
        p['student_id'] = str(p['student_id'])
        
    return jsonify(picks), 200

@app.route('/api/admin/polls/create', methods=['POST'])
@token_required
def admin_create_poll(current_user):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    cycle_id = request.args.get('cycle')
    if not cycle_id:
        cycle_id = get_default_cycle()
        
    # End any currently active polls
    active_polls = list(polls_col.find({"status": "active"}))
    for p in active_polls:
        close_poll_and_award_points(p)
        
    # Get all picked posts for Instagram in this cycle
    picks = list(uploads_col.find({
        "cycle_id": cycle_id,
        "is_insta_pick": True
    }))
    
    if not picks:
        return jsonify({'error': 'Cannot create a poll because no posts are picked for Instagram!'}), 400
        
    # Generate poll options
    options = []
    for p in picks:
        # Check which image was picked for Insta
        pick_type = p.get('insta_pick_type', 'task')
        image_url = p.get('image_url', '')
        if p.get('type') == 'both':
            if pick_type == 'meme':
                image_url = p.get('image_meme_url', '')
            else:
                image_url = p.get('image_url', '')
        elif p.get('type') == 'meme':
            image_url = p.get('image_meme_url', '')
            
        options.append({
            "upload_id": str(p['_id']),
            "student_name": p.get('student_name', 'Student'),
            "topic": p.get('topic', 'Daily Design'),
            "image_url": image_url,
            "day_number": p.get('day_number', 1),
            "image_meme_url": None, # Force only the single picked image to display in student poll UI
            "votes": 0
        })
        
    # Create the poll document
    now = datetime.utcnow()
    expires_at = (now + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
    
    poll_doc = {
        "cycle_id": cycle_id,
        "status": "active",
        "created_at": now,
        "expires_at": expires_at,
        "options": options,
        "voted_students": []
    }
    
    result = polls_col.insert_one(poll_doc)
    
    return jsonify({
        'message': 'Weekly Saturday Showcase Poll posted successfully!',
        'poll_id': str(result.inserted_id),
        'expires_at': expires_at.isoformat()
    }), 201

@app.route('/api/polls/active', methods=['GET'])
@token_required
def get_active_poll(current_user):
    active_poll = check_active_poll_status()
    if not active_poll:
        return jsonify(None), 200
        
    # Convert ObjectId to string
    active_poll['_id'] = str(active_poll['_id'])
    
    return jsonify(active_poll), 200

@app.route('/api/polls/<poll_id>/vote', methods=['POST'])
@token_required
def submit_poll_vote(current_user, poll_id):
    student_id = current_user['_id']
    data = request.get_json() or {}
    option_upload_id = data.get("upload_id")
    
    if not option_upload_id:
        return jsonify({'error': 'Please select an option to vote!'}), 400
        
    poll = polls_col.find_one({"_id": ObjectId(poll_id)})
    if not poll:
        return jsonify({'error': 'Poll not found!'}), 404
        
    if poll.get("status") != "active":
        return jsonify({'error': 'This poll has already ended!'}), 400
        
    # Check expiration date
    expires_at_raw = poll.get("expires_at")
    if expires_at_raw:
        if isinstance(expires_at_raw, str):
            expires_at = datetime.fromisoformat(expires_at_raw)
        else:
            expires_at = expires_at_raw
        if datetime.utcnow() >= expires_at:
            close_poll_and_award_points(poll)
            return jsonify({'error': 'This poll has closed automatically!'}), 400
            
    # Check if student has already voted
    voted_list = poll.get("voted_students", [])
    if str(student_id) in [str(x) for x in voted_list]:
        return jsonify({'error': 'You have already voted in this poll!'}), 400
        
    # Increment vote count in the matching option
    options = poll.get("options", [])
    updated = False
    for opt in options:
        if opt.get("upload_id") == option_upload_id:
            opt["votes"] = opt.get("votes", 0) + 1
            updated = True
            break
            
    if not updated:
        return jsonify({'error': 'Invalid option selected!'}), 400
        
    voted_list.append(str(student_id))
    
    polls_col.update_one(
        {"_id": ObjectId(poll_id)},
        {"$set": {
            "options": options,
            "voted_students": voted_list
        }}
    )
    
    return jsonify({'message': 'Vote submitted successfully!'}), 200

@app.route('/api/admin/polls', methods=['GET'])
@token_required
def admin_get_polls(current_user):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    cycle_id = request.args.get('cycle')
    query = {}
    if cycle_id:
        query["cycle_id"] = cycle_id
        
    # Retrieve active/past polls
    polls = list(polls_col.find(query).sort("created_at", -1))
    for p in polls:
        p['_id'] = str(p['_id'])
        
    return jsonify(polls), 200

@app.route('/api/admin/polls/<poll_id>/end', methods=['POST'])
@token_required
def admin_end_poll(current_user, poll_id):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    poll = polls_col.find_one({"_id": ObjectId(poll_id)})
    if not poll:
        return jsonify({'error': 'Poll not found!'}), 404
        
    close_poll_and_award_points(poll)
    
    return jsonify({'message': 'Poll closed and points awarded successfully!'}), 200

# ==========================================
# STATIC FILE SERVING
# ==========================================

@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# Run initialization
init_db()

if __name__ == '__main__':
    # Flask runs on http://localhost:5000 by default
    app.run(host='0.0.0.0', port=5000, debug=True)
