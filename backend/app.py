import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from bson import ObjectId
from datetime import datetime, timedelta

from config import Config
from db import init_db, users_col, uploads_col, topics_col, polls_col, attendance_col, db_mode
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
            "badges": badges,
            "is_sap_member": student.get("is_sap_member", False),
            "profile_pic": student.get("profile_pic", "")
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
    is_sap_member = data.get('is_sap_member', False)
    sap_secret_key = data.get('sap_secret_key', '')
    
    if not name or not email or not password:
        return jsonify({'error': 'Name, email, and password are required!'}), 400
        
    if role == 'leader':
        passcode = data.get('passcode')
        if passcode != Config.LEADER_PASSCODE:
            return jsonify({'error': 'Invalid Team Lead verification passcode!'}), 403
            
    if is_sap_member:
        if sap_secret_key != "CCH-001":
            return jsonify({'error': 'Invalid SAP member secret key!'}), 400
            
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
        "is_sap_member": is_sap_member,
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
            'points': 0,
            'is_sap_member': is_sap_member
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
            'points': points,
            'is_sap_member': user.get("is_sap_member", False),
            'profile_pic': user.get("profile_pic", "")
        }
    }), 200

# ==========================================
# TOPIC ENDPOINTS
# ==========================================

@app.route('/api/topics', methods=['GET'])
@token_required
def get_topics(current_user):
    cycle_id = request.args.get('cycle')
    query = {}
    if cycle_id:
        query["cycle_id"] = cycle_id
        
    topics = list(topics_col.find(query).sort("day", 1))
    for t in topics:
        t['_id'] = str(t['_id'])
        t['announced'] = t.get('announced', False)
        t['announced_at'] = t.get('announced_at', None)
        t['is_updated'] = t.get('is_updated', False)
        t['prev_title'] = t.get('prev_title', None)
        t['prev_desc'] = t.get('prev_desc', None)
    return jsonify(topics), 200

@app.route('/api/topics/<day_number>', methods=['PUT'])
@token_required
def update_topic(current_user, day_number):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    data = request.get_json() or {}
    title = data.get('title')
    desc = data.get('desc')
    announced = data.get('announced', True)
    cycle_id = data.get('cycle_id')
    is_skipped = data.get('is_skipped', False)
    
    if not title or not desc:
        return jsonify({'error': 'Title and description are required!'}), 400
        
    query = {"day": int(day_number)}
    if cycle_id:
        query["cycle_id"] = cycle_id
        
    existing = topics_col.find_one(query)
    is_updated = False
    prev_title = None
    prev_desc = None
    if existing and existing.get("announced"):
        is_updated = True
        prev_title = existing.get("title")
        prev_desc = existing.get("desc")
        
    update_fields = {
        "title": title,
        "desc": desc,
        "announced": announced,
        "is_updated": is_updated,
        "is_skipped": is_skipped
    }
    if is_updated:
        update_fields["prev_title"] = prev_title
        update_fields["prev_desc"] = prev_desc
    if announced:
        update_fields["announced_at"] = datetime.utcnow()
        
    result = topics_col.update_one(
        query,
        {"$set": update_fields}
    )
    
    if result.matched_count == 0:
        return jsonify({'error': 'Topic day not found!'}), 404
        
    return jsonify({'message': f'Topic for Day {day_number} updated and announced successfully!'}), 200

@app.route('/api/topics', methods=['POST'])
@token_required
def add_topic(current_user):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    data = request.get_json() or {}
    date_str = data.get('date')
    day_number_raw = data.get('day')
    title = data.get('title')
    desc = data.get('desc')
    cycle_id = data.get('cycle_id')
    is_skipped = data.get('is_skipped', False)
    
    if not date_str or not title or not desc or not cycle_id:
        return jsonify({'error': 'Date, title, description, and cycle_id are required!'}), 400
        
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return jsonify({'error': 'Invalid date format! Use YYYY-MM-DD.'}), 400
        
    day_number = int(day_number_raw) if day_number_raw is not None else 1
    
    query = {"cycle_id": cycle_id, "day": day_number}
    existing = topics_col.find_one(query)
    
    is_updated = False
    prev_title = None
    prev_desc = None
    if existing and existing.get("announced"):
        is_updated = True
        prev_title = existing.get("title")
        prev_desc = existing.get("desc")
        
    update_fields = {
        "cycle_id": cycle_id,
        "day": day_number,
        "date": date_str,
        "title": title,
        "desc": desc,
        "announced": True,
        "announced_at": datetime.utcnow(),
        "is_updated": is_updated,
        "is_skipped": is_skipped
    }
    if is_updated:
        update_fields["prev_title"] = prev_title
        update_fields["prev_desc"] = prev_desc
        
    topics_col.update_one(
        query,
        {"$set": update_fields},
        upsert=True
    )
    
    return jsonify({'message': f'Task for Day {day_number} ({date_str}) added and announced successfully!'}), 201

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

@app.route('/api/student/profile-pic', methods=['POST'])
@token_required
def student_upload_profile_pic(current_user):
    if current_user['role'] != 'student':
        return jsonify({'error': 'Unauthorized! Students only.'}), 403
        
    # Check if they sent a preset name in JSON body
    if request.is_json:
        data = request.get_json(silent=True) or {}
        preset = data.get('preset')
        if preset:
            from bson import ObjectId
            users_col.update_one(
                {"_id": ObjectId(current_user['_id'])},
                {"$set": {"profile_pic": f"preset_{preset}"}}
            )
            return jsonify({
                'message': 'Profile preset updated successfully!',
                'profile_pic': f"preset_{preset}"
            }), 200

    if 'profile_pic' not in request.files:
        return jsonify({'error': 'No file part or preset in request!'}), 400
        
    file = request.files['profile_pic']
    if file.filename == '':
        return jsonify({'error': 'No selected file!'}), 400
        
    # Read the file size by seeking
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)
    
    # 5MB limit
    if file_size > 5 * 1024 * 1024:
        return jsonify({'error': 'File size exceeds 5MB limit!'}), 400
        
    filename = file.filename
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    if ext not in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
        return jsonify({'error': 'Only JPG, JPEG, PNG, GIF, and WEBP images are allowed!'}), 400
        
    # Convert to base64 for database storage to support shared DB serving without disk storage
    import base64
    file_data = file.read()
    base64_data = base64.b64encode(file_data).decode('utf-8')
    mime_type = file.mimetype or f"image/{ext}"
    db_profile_pic = f"data:{mime_type};base64,{base64_data}"
    
    from bson import ObjectId
    users_col.update_one(
        {"_id": ObjectId(current_user['_id'])},
        {"$set": {"profile_pic": db_profile_pic}}
    )
    
    return jsonify({
        'message': 'Profile picture uploaded successfully!',
        'profile_pic': db_profile_pic
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
    is_update = False
    if existing:
        if existing.get('status') == 'reviewed':
            return jsonify({'error': f'Your submission for Day {day_number} has already been reviewed and cannot be modified!'}), 400
        is_update = True
        
    # Validate primary file
    if 'image' not in request.files:
        return jsonify({'error': 'No image file uploaded!'}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected image file!'}), 400
        
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid design image type. Allowed types: PNG, JPG, JPEG, GIF, WEBP.'}), 400
        
    # Check primary file size (8MB max for single, 4.5MB max for both)
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)
    max_size = 4.5 * 1024 * 1024 if submission_type == 'both' else 8 * 1024 * 1024
    if file_size > max_size:
        return jsonify({'error': f"Design image size exceeds limit of {max_size / (1024*1024)}MB. Please compress your image."}), 400
        
    import base64
    ext = file.filename.rsplit('.', 1)[1].lower()
    
    # Convert file data to Base64 data URL for database storage
    file_data = file.read()
    base64_data = base64.b64encode(file_data).decode('utf-8')
    mime_type = file.mimetype or f"image/{ext}"
    image_url = f"data:{mime_type};base64,{base64_data}"
    
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
            
        # Check meme file size (4.5MB max)
        file_meme.seek(0, os.SEEK_END)
        file_meme_size = file_meme.tell()
        file_meme.seek(0)
        max_meme_size = 4.5 * 1024 * 1024
        if file_meme_size > max_meme_size:
            return jsonify({'error': f"Meme image size exceeds limit of {max_meme_size / (1024*1024)}MB. Please compress your image."}), 400
            
        ext_meme = file_meme.filename.rsplit('.', 1)[1].lower()
        
        # Convert meme file data to Base64 data URL for database storage
        file_meme_data = file_meme.read()
        base64_meme_data = base64.b64encode(file_meme_data).decode('utf-8')
        mime_type_meme = file_meme.mimetype or f"image/{ext_meme}"
        image_meme_url = f"data:{mime_type_meme};base64,{base64_meme_data}"

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
    
    if is_update:
        uploads_col.update_one({"_id": existing["_id"]}, {"$set": upload_doc})
    else:
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
    
    # Pre-fetch students to map is_sap_member status
    from bson import ObjectId
    student_ids = []
    for u in uploads:
        sid_str = str(u.get('student_id'))
        if len(sid_str) == 24:
            try:
                student_ids.append(ObjectId(sid_str))
            except Exception:
                pass
                
    students_list = list(users_col.find({"_id": {"$in": student_ids}}))
    student_sap_map = {str(s['_id']): s.get("is_sap_member", False) for s in students_list}
    
    for u in uploads:
        u['_id'] = str(u['_id'])
        u['student_id'] = str(u['student_id'])
        u['is_sap_member'] = student_sap_map.get(u['student_id'], False)
    return jsonify(uploads), 200

@app.route('/api/admin/attendance', methods=['GET'])
@token_required
def admin_get_attendance(current_user):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    cycle_id = request.args.get('cycle')
    if not cycle_id:
        cycle_id = get_default_cycle()
        
    sessions = list(attendance_col.find({"cycle_id": cycle_id}))
    for s in sessions:
        s['_id'] = str(s['_id'])
    return jsonify(sessions), 200

@app.route('/api/admin/attendance', methods=['POST'])
@token_required
def admin_create_attendance_session(current_user):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    data = request.get_json() or {}
    cycle_id = data.get('cycle_id')
    session_type = data.get('type') # 'meeting' or 'workshop'
    name = data.get('name')
    date_str = data.get('date') # YYYY-MM-DD
    
    if not cycle_id or not session_type or not name or not date_str:
        return jsonify({'error': 'cycle_id, type, name, and date are required.'}), 400
        
    if session_type not in ['meeting', 'workshop']:
        return jsonify({'error': 'Type must be "meeting" or "workshop".'}), 400
        
    new_session = {
        "cycle_id": cycle_id,
        "type": session_type,
        "name": name,
        "date": date_str,
        "present_students": []
    }
    
    result = attendance_col.insert_one(new_session)
    inserted_id = str(result.inserted_id) if hasattr(result, 'inserted_id') else str(result)
    
    return jsonify({
        'message': 'Attendance session created successfully!',
        'session_id': inserted_id
    }), 201

@app.route('/api/admin/attendance/<session_id>', methods=['PUT'])
@token_required
def admin_update_attendance(current_user, session_id):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    data = request.get_json() or {}
    present_students = data.get('present_students')
    if present_students is None or not isinstance(present_students, list):
        return jsonify({'error': 'present_students must be a list.'}), 400
        
    present_students = [str(sid) for sid in present_students]
    
    try:
        query = {"_id": ObjectId(session_id)}
    except Exception:
        query = {"_id": session_id}
        
    attendance_col.update_one(query, {"$set": {"present_students": present_students}})
    
    return jsonify({'message': 'Attendance updated successfully!'}), 200

@app.route('/api/admin/attendance/<session_id>', methods=['DELETE'])
@token_required
def admin_delete_attendance_session(current_user, session_id):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    try:
        query = {"_id": ObjectId(session_id)}
    except Exception:
        query = {"_id": session_id}
        
    attendance_col.delete_one(query)
    return jsonify({'message': 'Attendance session deleted successfully!'}), 200


# Helper to parse dates dynamically from ISO-8601 strings or Python datetime objects
def parse_date(date_val):
    if not date_val:
        return None
    if isinstance(date_val, datetime):
        return date_val
    if isinstance(date_val, str):
        if date_val.endswith('Z'):
            date_val = date_val[:-1]
        try:
            return datetime.fromisoformat(date_val)
        except ValueError:
            pass
    return None

# Gathers aggregated stats for dynamic dashboards & reports (JSON-DB fallback compatible)
def get_aggregated_stats(cycle_id='all', timeframe='30days'):
    students = list(users_col.find({"role": "student"}))
    total_students = len(students)
    
    sap_students = [s for s in students if s.get("is_sap_member", False)]
    normal_students = [s for s in students if not s.get("is_sap_member", False)]
    
    sap_student_ids = {str(s["_id"]) for s in sap_students}
    normal_student_ids = {str(s["_id"]) for s in normal_students}
    
    college_counts = {}
    for s in students:
        college = s.get("college_name", "N/A").strip()
        if not college:
            college = "N/A"
        college_counts[college] = college_counts.get(college, 0) + 1
        
    college_breakdown = sorted(
        [{"college": k, "count": v} for k, v in college_counts.items()],
        key=lambda x: x["count"],
        reverse=True
    )
    
    query = {}
    if cycle_id != 'all':
        query["cycle_id"] = cycle_id
        
    uploads = list(uploads_col.find(query))
    now = datetime.utcnow()
    
    if timeframe == '7days':
        delta_days = 7
    elif timeframe == '30days':
        delta_days = 30
    elif timeframe == '90days':
        delta_days = 90
    else:
        delta_days = None

    filtered_uploads = []
    active_student_ids = set()
    posts_in_period = 0
    insta_picks_in_period = 0

    for u in uploads:
        sub_time = parse_date(u.get("submitted_at"))
        if not sub_time:
            continue
            
        in_range = True
        if cycle_id == 'all' and delta_days is not None:
            cutoff = now - timedelta(days=delta_days)
            if sub_time < cutoff:
                in_range = False
                
        if in_range:
            filtered_uploads.append(u)
            active_student_ids.add(str(u.get("student_id")))
            posts_in_period += 1
            if u.get("is_insta_pick", False):
                insta_picks_in_period += 1

    active_last_month_ids = set()
    if cycle_id != 'all':
        for u in uploads:
            active_last_month_ids.add(str(u.get("student_id")))
    else:
        cutoff_30d = now - timedelta(days=30)
        for u in uploads:
            sub_time = parse_date(u.get("submitted_at"))
            if sub_time and sub_time >= cutoff_30d:
                active_last_month_ids.add(str(u.get("student_id")))
    active_members_last_month = len(active_last_month_ids)

    posts_last_week = 0
    cutoff_7d = now - timedelta(days=7)
    for u in uploads:
        sub_time = parse_date(u.get("submitted_at"))
        if sub_time and sub_time >= cutoff_7d:
            posts_last_week += 1

    insta_last_week = 0
    for u in uploads:
        sub_time = parse_date(u.get("submitted_at"))
        if sub_time and sub_time >= cutoff_7d and u.get("is_insta_pick", False):
            insta_last_week += 1

    daily_groups = {}
    if cycle_id != 'all':
        # Parse cycle start date
        try:
            cycle_start = datetime.strptime(cycle_id, "%Y-%m-%d").date()
        except ValueError:
            cycle_start = now.date()
            
        # Determine the earliest date from either the cycle start or the earliest upload in this cycle
        earliest_date = cycle_start
        for u in uploads:
            sub_time = parse_date(u.get("submitted_at"))
            if sub_time:
                sub_date = sub_time.date()
                if sub_date < earliest_date:
                    earliest_date = sub_date
                    
        # End date of the cycle is start + 31 days
        cycle_end = cycle_start + timedelta(days=31)
        
        if now.date() < cycle_start:
            # We are before the cycle start, so show from the earliest upload up to today
            end_date = now.date()
        elif now.date() <= cycle_end:
            # We are within the active cycle, so show from start_date up to today
            end_date = now.date()
        else:
            # Cycle is in the past, show the full range
            end_date = cycle_end
            
        # Avoid huge ranges if there's any anomaly
        start_date = earliest_date
        if (end_date - start_date).days > 60:
            start_date = end_date - timedelta(days=30)
            
        curr = start_date
        while curr <= end_date:
            daily_groups[curr.isoformat()] = {"posts": 0, "insta_picks": 0, "label": curr.strftime("%b %d")}
            curr += timedelta(days=1)
    else:
        # If 'all', default to last N days
        if delta_days is not None:
            for i in range(delta_days - 1, -1, -1):
                day_date = (now - timedelta(days=i)).date()
                daily_groups[day_date.isoformat()] = {"posts": 0, "insta_picks": 0, "label": day_date.strftime("%b %d")}

    for u in filtered_uploads:
        sub_time = parse_date(u.get("submitted_at"))
        if sub_time:
            day_str = sub_time.date().isoformat()
            if day_str not in daily_groups:
                if cycle_id == 'all' and delta_days is None:
                    daily_groups[day_str] = {"posts": 0, "insta_picks": 0, "label": sub_time.strftime("%b %d")}
                else:
                    continue
            daily_groups[day_str]["posts"] += 1
            if u.get("is_insta_pick", False):
                daily_groups[day_str]["insta_picks"] += 1

    chart_data = []
    for k in sorted(daily_groups.keys()):
        item = daily_groups[k]
        chart_data.append({
            "date": k,
            "label": item["label"],
            "posts": item["posts"],
            "insta_picks": item["insta_picks"]
        })

    return {
        "total_students": total_students,
        "total_students_sap": len(sap_students),
        "total_students_normal": len(normal_students),
        "college_breakdown": college_breakdown,
        "active_members_last_month": active_members_last_month,
        "active_sap_last_month": len(active_last_month_ids.intersection(sap_student_ids)),
        "active_normal_last_month": len(active_last_month_ids.intersection(normal_student_ids)),
        "posts_last_week": posts_last_week,
        "insta_picks_last_week": insta_last_week,
        "timeframe_stats": {
            "posts_count": posts_in_period,
            "posts_count_sap": sum(1 for u in filtered_uploads if str(u.get("student_id")) in sap_student_ids),
            "posts_count_normal": sum(1 for u in filtered_uploads if str(u.get("student_id")) in normal_student_ids),
            "insta_picks_count": insta_picks_in_period,
            "insta_picks_count_sap": sum(1 for u in filtered_uploads if str(u.get("student_id")) in sap_student_ids and u.get("is_insta_pick", False)),
            "insta_picks_count_normal": sum(1 for u in filtered_uploads if str(u.get("student_id")) in normal_student_ids and u.get("is_insta_pick", False)),
            "active_members_count": len(active_student_ids),
            "active_members_count_sap": len(active_student_ids.intersection(sap_student_ids)),
            "active_members_count_normal": len(active_student_ids.intersection(normal_student_ids))
        },
        "chart_data": chart_data
    }

def generate_stats_html_report(stats, timeframe, cycle_name):
    college_rows = ""
    for c in stats["college_breakdown"][:10]:
        percent = (c["count"] / max(stats["total_students"], 1)) * 100
        college_rows += f"""
        <tr>
            <td style="padding: 8px 12px; font-family: monospace; font-size: 13px; color: #1f2937; border-bottom: 1px solid #f3f4f6;">{c["college"]}</td>
            <td style="padding: 8px 12px; font-family: monospace; font-size: 13px; color: #4b5563; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: bold;">{c["count"]}</td>
            <td style="padding: 8px 12px; font-family: monospace; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6; text-align: right;">{percent:.1f}%</td>
        </tr>
        """

    timeframe_labels = {
        "7days": "Last 7 Days",
        "30days": "Last 30 Days",
        "90days": "Last 90 Days",
        "all": "All Time"
    }
    tf_label = timeframe_labels.get(timeframe, timeframe)

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Design Club Analytics Report</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; padding: 30px 15px;">
            <tr>
                <td align="center">
                    <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                        <!-- Header -->
                        <tr>
                            <td style="background-color: #4f46e5; padding: 32px; text-align: center;">
                                <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.025em; text-transform: uppercase;">Design Club Insights</h1>
                                <p style="margin: 8px 0 0 0; color: #c7d2fe; font-size: 14px;">Automated Coordinator Analytics Report</p>
                            </td>
                        </tr>
                        
                        <!-- Content Body -->
                        <tr>
                            <td style="padding: 32px;">
                                <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.5; color: #374151;">
                                    Hello Manager,
                                </p>
                                <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.5; color: #374151;">
                                    Here is the activity and participation summary for the Design Club dashboard.
                                </p>
                                
                                <div style="margin-bottom: 24px; padding: 12px 16px; background-color: #f3f4f6; border-left: 4px solid #4f46e5; border-radius: 4px;">
                                    <span style="font-size: 11px; font-weight: bold; color: #4b5563; text-transform: uppercase; font-family: monospace;">Scope Parameters</span>
                                    <div style="font-size: 13px; color: #1f2937; margin-top: 4px; font-family: monospace;">
                                        <strong>Cycle:</strong> {cycle_name}<br>
                                        <strong>Period Filter:</strong> {tf_label}
                                    </div>
                                </div>

                                <!-- Key Statistics Grid -->
                                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                                    <tr>
                                        <!-- Card 1 -->
                                        <td width="48%" style="background-color: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 12px; padding: 16px; text-align: center; vertical-align: top;">
                                            <span style="font-size: 10px; font-weight: bold; color: #6d28d9; text-transform: uppercase; font-family: monospace; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Total Registered Students</span>
                                            <span style="font-size: 28px; font-weight: 900; color: #1e1b4b; font-family: monospace; display: block;">{stats["total_students"]}</span>
                                        </td>
                                        <td width="4%">&nbsp;</td>
                                        <!-- Card 2 -->
                                        <td width="48%" style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; text-align: center; vertical-align: top;">
                                            <span style="font-size: 10px; font-weight: bold; color: #047857; text-transform: uppercase; font-family: monospace; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Active Members (Last Month)</span>
                                            <span style="font-size: 28px; font-weight: 900; color: #064e3b; font-family: monospace; display: block;">{stats["active_members_last_month"]}</span>
                                        </td>
                                    </tr>
                                    <tr><td height="16" colspan="3"></td></tr>
                                    <tr>
                                        <!-- Card 3 -->
                                        <td width="48%" style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 16px; text-align: center; vertical-align: top;">
                                            <span style="font-size: 10px; font-weight: bold; color: #0369a1; text-transform: uppercase; font-family: monospace; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Uploads (Last Week)</span>
                                            <span style="font-size: 28px; font-weight: 900; color: #0c4a6e; font-family: monospace; display: block;">{stats["posts_last_week"]}</span>
                                        </td>
                                        <td width="4%">&nbsp;</td>
                                        <!-- Card 4 -->
                                        <td width="48%" style="background-color: #fdf2f8; border: 1px solid #fbcfe8; border-radius: 12px; padding: 16px; text-align: center; vertical-align: top;">
                                            <span style="font-size: 10px; font-weight: bold; color: #be185d; text-transform: uppercase; font-family: monospace; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Insta Picks (Last Week)</span>
                                            <span style="font-size: 28px; font-weight: 900; color: #500724; font-family: monospace; display: block;">{stats["insta_picks_last_week"]}</span>
                                        </td>
                                    </tr>
                                </table>

                                <!-- Period Summary Header -->
                                <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 700; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.025em;">Period Activity Stats ({tf_label})</h3>
                                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 32px; background-color: #fafafa; border-radius: 8px; padding: 16px; border: 1px solid #f3f4f6;">
                                    <tr>
                                        <td style="font-size: 14px; padding: 6px 0; color: #4b5563;">Submissions in Period:</td>
                                        <td align="right" style="font-size: 14px; padding: 6px 0; font-weight: bold; color: #111827; font-family: monospace;">{stats["timeframe_stats"]["posts_count"]}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-size: 14px; padding: 6px 0; color: #4b5563;">Instagram Picks in Period:</td>
                                        <td align="right" style="font-size: 14px; padding: 6px 0; font-weight: bold; color: #111827; font-family: monospace;">{stats["timeframe_stats"]["insta_picks_count"]}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-size: 14px; padding: 6px 0; color: #4b5563;">Unique Participating Students:</td>
                                        <td align="right" style="font-size: 14px; padding: 6px 0; font-weight: bold; color: #111827; font-family: monospace;">{stats["timeframe_stats"]["active_members_count"]}</td>
                                    </tr>
                                </table>

                                <!-- College Breakdown Table -->
                                <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 700; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.025em;">College Distribution (Top 10)</h3>
                                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; border-collapse: collapse;">
                                    <tr style="background-color: #f9fafb;">
                                        <th align="left" style="padding: 10px 12px; font-size: 11px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb; text-transform: uppercase;">College Name</th>
                                        <th align="right" style="padding: 10px 12px; font-size: 11px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb; text-transform: uppercase; width: 80px;">Students</th>
                                        <th align="right" style="padding: 10px 12px; font-size: 11px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb; text-transform: uppercase; width: 70px;">Ratio</th>
                                    </tr>
                                    {college_rows}
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f3f4f6; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                                <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
                                    This report was generated and triggered from the Coordinator Dashboard of the Design Club application.
                                </p>
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: #9ca3af; font-family: monospace;">
                                    System Time: {datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")}
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    return html_content

def send_email_report(html_content, recipient):
    server = app.config.get("SMTP_SERVER") or Config.SMTP_SERVER
    port = app.config.get("SMTP_PORT") or Config.SMTP_PORT
    username = app.config.get("SMTP_USERNAME") or Config.SMTP_USERNAME
    password = app.config.get("SMTP_PASSWORD") or Config.SMTP_PASSWORD
    sender = (app.config.get("SMTP_SENDER") or Config.SMTP_SENDER) or username
    
    if not username or not password:
        return False, "SMTP username or password not configured"
        
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = "Design Club Coordinator Analytics Report"
        msg['From'] = f"Design Club Dashboard <{sender}>"
        msg['To'] = recipient
        msg.attach(MIMEText(html_content, 'html'))
        
        if port == 465:
            smtp_conn = smtplib.SMTP_SSL(server, port, timeout=5)
        else:
            smtp_conn = smtplib.SMTP(server, port, timeout=5)
            smtp_conn.ehlo()
            smtp_conn.starttls()
            smtp_conn.ehlo()
            
        smtp_conn.login(username, password)
        smtp_conn.sendmail(sender, [recipient], msg.as_string())
        smtp_conn.quit()
        return True, "Email sent successfully"
    except Exception as e:
        return False, str(e)

@app.route('/api/admin/dashboard-stats', methods=['GET'])
@token_required
def admin_get_dashboard_stats(current_user):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    cycle_id = request.args.get('cycle', 'all')
    timeframe = request.args.get('timeframe', '30days')
    
    stats = get_aggregated_stats(cycle_id, timeframe)
    return jsonify(stats), 200

@app.route('/api/admin/send-stats-email', methods=['POST'])
@token_required
def admin_send_stats_email(current_user):
    if current_user['role'] != 'leader':
        return jsonify({'error': 'Unauthorized! Team Leads only.'}), 403
        
    data = request.get_json(silent=True) or {}
    cycle_id = data.get('cycle', 'all')
    timeframe = data.get('timeframe', '30days')
    recipient = "madhu@codegnan.com"
    
    cycle_name = next((c["name"] for c in CYCLES if c["id"] == cycle_id), cycle_id)
    if cycle_id == "all":
        cycle_name = "All Cycles"
        
    stats = get_aggregated_stats(cycle_id, timeframe)
    html_content = generate_stats_html_report(stats, timeframe, cycle_name)
    
    success, reason = send_email_report(html_content, recipient)
    
    if not success:
        debug_filename = "last_sent_report.html"
        debug_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), debug_filename)
        try:
            with open(debug_path, "w", encoding="utf-8") as f:
                f.write(html_content)
            return jsonify({
                'message': f'SMTP credentials not set or failed ({reason}). Report written locally to backend/{debug_filename}',
                'saved_local': True,
                'error_detail': reason
            }), 200
        except Exception as file_err:
            return jsonify({
                'error': f'Failed to send email ({reason}) and failed to write local file: {str(file_err)}'
            }), 500
            
    return jsonify({
        'message': f'Report successfully emailed to {recipient}!',
        'saved_local': False
    }), 200


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
            "title": title,
            "is_sap_member": student.get("is_sap_member", False)
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
            image_url = p.get('image_meme_url') or p.get('image_url', '')
            
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
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(file_path):
        from flask import Response
        is_profile = filename.startswith("profile_pic_")
        is_meme = "meme" in filename.lower()
        if is_profile:
            label = "Profile Picture"
            svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
                <rect width="100%" height="100%" fill="#27272a"/>
                <circle cx="75" cy="55" r="25" fill="#71717a"/>
                <path d="M35 115 C35 90, 115 90, 115 115" fill="#71717a"/>
                <text x="50%" y="140" font-family="sans-serif" font-size="9" fill="#a1a1aa" text-anchor="middle">
                    Missing Profile Pic
                </text>
            </svg>'''
        else:
            label = "Meme Graphic" if is_meme else "Design Submission"
            svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
                <rect width="100%" height="100%" fill="#18181b"/>
                <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#ec4899;stop-opacity:1" />
                    </linearGradient>
                </defs>
                <circle cx="400" cy="250" r="70" fill="url(#grad)" opacity="0.15"/>
                <text x="50%" y="260" font-family="sans-serif" font-size="48" font-weight="bold" fill="url(#grad)" text-anchor="middle">
                    🖼️
                </text>
                <text x="50%" y="360" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="28" font-weight="bold" fill="#f4f4f5" text-anchor="middle">
                    {label}
                </text>
                <text x="50%" y="410" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="16" fill="#a1a1aa" text-anchor="middle">
                    File: {filename}
                </text>
                <text x="50%" y="440" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="14" fill="#52525b" text-anchor="middle" font-style="italic">
                    (Physical file missing on local server)
                </text>
            </svg>'''
        return Response(svg_content, mimetype='image/svg+xml')
        
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# Run initialization
init_db()

if __name__ == '__main__':
    # Flask runs on http://localhost:5000 by default
    app.run(host='0.0.0.0', port=5000, debug=True)
