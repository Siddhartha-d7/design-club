import os
import json
import urllib.parse
from datetime import datetime
from bson import ObjectId
from pymongo import MongoClient
from werkzeug.security import generate_password_hash
from config import Config

# Fallback JSON database implementation for resilience
class JSONCollection:
    def __init__(self, db_file, collection_name):
        self.db_file = db_file
        self.collection_name = collection_name

    def _load_data(self):
        if not os.path.exists(self.db_file):
            return {}
        try:
            with open(self.db_file, 'r') as f:
                return json.load(f)
        except Exception:
            return {}

    def _save_data(self, data):
        try:
            with open(self.db_file, 'w') as f:
                json.dump(data, f, default=str, indent=2)
        except Exception as e:
            print(f"Error saving to JSON DB: {e}")

    def _get_items(self):
        data = self._load_data()
        return data.get(self.collection_name, [])

    def _set_items(self, items):
        data = self._load_data()
        data[self.collection_name] = items
        self._save_data(data)

    def find_one(self, query):
        items = self._get_items()
        for item in items:
            match = True
            for k, v in query.items():
                val = item.get(k)
                # Handle ObjectId conversions
                if isinstance(v, ObjectId):
                    v = str(v)
                if isinstance(val, ObjectId):
                    val = str(val)
                if str(val) != str(v):
                    match = False
                    break
            if match:
                # return a copy to prevent mutation
                return dict(item)
        return None

    def insert_one(self, doc):
        items = self._get_items()
        if "_id" not in doc:
            doc["_id"] = str(ObjectId())
        else:
            doc["_id"] = str(doc["_id"])
            
        # Standardize datetime values
        for k, v in doc.items():
            if isinstance(v, datetime):
                doc[k] = v.isoformat()
            elif isinstance(v, dict):
                for sub_k, sub_v in v.items():
                    if isinstance(sub_v, datetime):
                        v[sub_k] = sub_v.isoformat()
                        
        items.append(doc)
        self._set_items(items)
        class InsertResult:
            def __init__(self, inserted_id):
                self.inserted_id = inserted_id
        return InsertResult(doc["_id"])

    def insert_many(self, docs):
        items = self._get_items()
        for doc in docs:
            if "_id" not in doc:
                doc["_id"] = str(ObjectId())
            else:
                doc["_id"] = str(doc["_id"])
            for k, v in doc.items():
                if isinstance(v, datetime):
                    doc[k] = v.isoformat()
            items.append(doc)
        self._set_items(items)
        return True

    def update_one(self, query, update_op):
        items = self._get_items()
        matched = 0
        for item in items:
            match = True
            for k, v in query.items():
                val = item.get(k)
                if isinstance(v, ObjectId):
                    v = str(v)
                if isinstance(val, ObjectId):
                    val = str(val)
                if str(val) != str(v):
                    match = False
                    break
            if match:
                matched += 1
                # Apply updates
                if "$set" in update_op:
                    for k, v in update_op["$set"].items():
                        if isinstance(v, datetime):
                            v = v.isoformat()
                        elif isinstance(v, ObjectId):
                            v = str(v)
                        item[k] = v
                self._set_items(items)
                break
        class UpdateResult:
            def __init__(self, matched_count):
                self.matched_count = matched_count
        return UpdateResult(matched)

    def count_documents(self, query):
        items = self._get_items()
        count = 0
        for item in items:
            match = True
            for k, v in query.items():
                val = item.get(k)
                if isinstance(v, ObjectId):
                    v = str(v)
                if isinstance(val, ObjectId):
                    val = str(val)
                if str(val) != str(v):
                    match = False
                    break
            if match:
                count += 1
        return count

    def find(self, query=None):
        query = query or {}
        items = self._get_items()
        results = []
        for item in items:
            match = True
            for k, v in query.items():
                val = item.get(k)
                if isinstance(v, ObjectId):
                    v = str(v)
                if isinstance(val, ObjectId):
                    val = str(val)
                if str(val) != str(v):
                    match = False
                    break
            if match:
                results.append(dict(item))
                
        class Cursor:
            def __init__(self, data_list):
                self.data_list = data_list
            def sort(self, key, direction=-1):
                reverse = True if direction == -1 else False
                # Sort helper
                self.data_list.sort(key=lambda x: x.get(key, ""), reverse=reverse)
                return self
            def __iter__(self):
                return iter(self.data_list)
            def __len__(self):
                return len(self.data_list)
                
        return Cursor(results)

    def aggregate(self, pipeline):
        # Basic aggregation support for our specific backend pipelines
        items = self._get_items()
        
        # 1. Pipeline match stage
        match_stage = next((stage["$match"] for stage in pipeline if "$match" in stage), None)
        if match_stage:
            filtered = []
            for item in items:
                match = True
                for k, v in match_stage.items():
                    val = item.get(k)
                    if isinstance(v, ObjectId):
                        v = str(v)
                    if isinstance(val, ObjectId):
                        val = str(val)
                    if str(val) != str(v):
                        match = False
                        break
                if match:
                    filtered.append(item)
            items = filtered

        # 2. Pipeline group stage
        group_stage = next((stage["$group"] for stage in pipeline if "$group" in stage), None)
        if group_stage:
            group_id = group_stage.get("_id")
            # For student point summation
            if group_id is None and "total" in group_stage:
                total_sum = sum(int(item.get("points_awarded", 0)) for item in items)
                return [{"_id": None, "total": total_sum}]
            # For most consistent grouping
            elif group_id == "$student_id" and "count" in group_stage:
                counts = {}
                for item in items:
                    sid = str(item.get("student_id"))
                    counts[sid] = counts.get(sid, 0) + 1
                result = [{"_id": sid, "count": count} for sid, count in counts.items()]
                # Sort if next stage is sort
                sort_stage = next((stage["$sort"] for stage in pipeline if "$sort" in stage), None)
                if sort_stage:
                    sort_key = list(sort_stage.keys())[0]
                    reverse = True if sort_stage[sort_key] == -1 else False
                    result.sort(key=lambda x: x.get(sort_key, 0), reverse=reverse)
                return result
                
        return items

# Initialize database connections with fallback
db_mode = "JSON_FALLBACK"
db = None
users_col = None
uploads_col = None
topics_col = None
polls_col = None

# 1. Try MongoDB Atlas connection
try:
    print("Connecting to MongoDB Atlas...")
    # Normalize the connection string
    atlas_uri = Config.MONGO_URI
    client = MongoClient(atlas_uri, serverSelectionTimeoutMS=2000)
    # Check if connection is authenticating successfully
    client.admin.command('ping')
    
    db = client.get_database("design_club")
    users_col = db.get_collection("users")
    uploads_col = db.get_collection("uploads")
    topics_col = db.get_collection("topics")
    polls_col = db.get_collection("polls")
    db_mode = "MONGODB_ATLAS"
    print("Successfully connected to MongoDB Atlas!")
except Exception as atlas_err:
    print(f"MongoDB Atlas connection failed: {atlas_err}")
    
    # 2. Try Local MongoDB Connection
    try:
        print("Connecting to Local MongoDB (localhost:27017)...")
        client = MongoClient("mongodb://localhost:27017/design_club", serverSelectionTimeoutMS=2000)
        client.admin.command('ping')
        
        db = client.get_database("design_club")
        users_col = db.get_collection("users")
        uploads_col = db.get_collection("uploads")
        topics_col = db.get_collection("topics")
        polls_col = db.get_collection("polls")
        db_mode = "MONGODB_LOCAL"
        print("Successfully connected to Local MongoDB!")
    except Exception as local_err:
        print(f"Local MongoDB connection failed: {local_err}")
        
        # 3. Fallback to Local JSON DB
        db_mode = "JSON_FALLBACK"
        print("FALLBACK: Initializing resilient JSON database (db_fallback.json)...")
        db_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'db_fallback.json')
        users_col = JSONCollection(db_file, "users")
        uploads_col = JSONCollection(db_file, "uploads")
        topics_col = JSONCollection(db_file, "topics")
        polls_col = JSONCollection(db_file, "polls")

def init_db():
    """
    Initialize indexes and seed default data.
    """
    print(f"Initializing database. Mode: {db_mode}")
    
    # Create indexes if on MongoDB
    if db_mode in ["MONGODB_ATLAS", "MONGODB_LOCAL"]:
        try:
            users_col.create_index("email", unique=True)
        except Exception as e:
            print(f"Index creation skipped/failed: {e}")

    # Seed Default Coordinator if not present
    if users_col.count_documents({"role": "leader"}) == 0:
        lead_user = {
            "name": "Design Club Coordinator",
            "email": "lead@designclub.com",
            "password_hash": generate_password_hash("leadpassword"),
            "college_name": "Core Committee",
            "passout_year": "N/A",
            "role": "leader",
            "points": 0,
            "title": "LEAD COORDINATOR",
            "created_at": datetime.utcnow()
        }
        users_col.insert_one(lead_user)
        print("Seeded Default Team Lead: lead@designclub.com / leadpassword")

    # Seed 31 Days of Daily Tech News Topics
    if topics_col.count_documents({}) == 0:
        topics_data = [
            {"day": 1, "date": "2026-06-15", "title": "Apple WWDC 2026", "desc": "Design a concept showing off Apple's new AI features or Siri overhaul."},
            {"day": 2, "date": "2026-06-16", "title": "Figma's New Interface", "desc": "Create a graphic or meme showcasing Figma's dark mode or UI changes."},
            {"day": 3, "date": "2026-06-17", "title": "AI Coding Assistants", "desc": "Design an illustration showing human + AI pair programming."},
            {"day": 4, "date": "2026-06-18", "title": "Sustainable Tech", "desc": "Design a green energy charging icon or interface concept."},
            {"day": 5, "date": "2026-06-19", "title": "Spatial Computing (Vision Pro)", "desc": "Create a layout or concept for an augmented reality app interface."},
            {"day": 6, "date": "2026-06-20", "title": "Showcase Day! (Sat)", "desc": "Submit a recap of your best design work from the week."},
            {"day": 7, "date": "2026-06-21", "title": "Tech Detox & Minimalism (Sun)", "desc": "Design a minimalist interface that encourages users to put down their phones."},
            {"day": 8, "date": "2026-06-22", "title": "Cybersecurity and Privacy", "desc": "Design a security status screen or lock animation concept."},
            {"day": 9, "date": "2026-06-23", "title": "Voice User Interfaces", "desc": "Create a voice assistant visual feedback wave or interface."},
            {"day": 10, "date": "2026-06-24", "title": "Crypto & Web3 Redesigns", "desc": "Redesign a cryptocurrency transaction success screen or receipt."},
            {"day": 11, "date": "2026-06-25", "title": "Interactive Storytelling", "desc": "Design a screen for an interactive audio book or visual novel."},
            {"day": 12, "date": "2026-06-26", "title": "Autonomous Vehicles UI", "desc": "Design a dashboard widget for a self-driving car screen."},
            {"day": 13, "date": "2026-06-27", "title": "Showcase Day! (Sat)", "desc": "Submit your weekly highlights or a custom meme about teamwork."},
            {"day": 14, "date": "2026-06-28", "title": "Nostalgic Tech (Sun)", "desc": "Recreate a modern app interface (like Spotify or WhatsApp) in a 95-retro design."},
            {"day": 15, "date": "2026-06-29", "title": "Robotics in Daily Life", "desc": "Create a dashboard screen to control your home vacuum or butler robot."},
            {"day": 16, "date": "2026-06-30", "title": "Neuralink & BCI UI", "desc": "Design a conceptual interface representing mind-controlled actions."},
            {"day": 17, "date": "2026-07-01", "title": "Quantum Computing", "desc": "Create a futuristic interface displaying quantum processing grid states."},
            {"day": 18, "date": "2026-07-02", "title": "Digital Therapeutics (Health)", "desc": "Design a dynamic heart rate tracker or mental health breathing bubble UI."},
            {"day": 19, "date": "2026-07-03", "title": "E-Learning Overhaul", "desc": "Redesign a course progress indicator or student dashboard card."},
            {"day": 20, "date": "2026-07-04", "title": "Showcase Day! (Sat)", "desc": "Weekly showcase of tasks/memes. Submit your top choice."},
            {"day": 21, "date": "2026-07-05", "title": "Micro-interactions (Sun)", "desc": "Design a beautiful, detailed toggle switch or download button."},
            {"day": 22, "date": "2026-07-06", "title": "Wearable Devices", "desc": "Design a widget for a smart ring or smart watch tracker screen."},
            {"day": 23, "date": "2026-07-07", "title": "Smart Smart-Home Controls", "desc": "Design an smart thermostat control ring UI."},
            {"day": 24, "date": "2026-07-08", "title": "Space Tech & Exploration", "desc": "Design a display showing telemetry for a spacecraft landing on Mars."},
            {"day": 25, "date": "2026-07-09", "title": "AR Shopping Assistant", "desc": "Create a design for trying on shoes or apparel using AR overlays."},
            {"day": 26, "date": "2026-07-10", "title": "Digital Art Collectibles", "desc": "Create an immersive bidding page for an art auction."},
            {"day": 27, "date": "2026-07-11", "title": "Showcase Day! (Sat)", "desc": "Showcase Saturday. Compile and upload your design compilation."},
            {"day": 28, "date": "2026-07-12", "title": "Gamified Habits (Sun)", "desc": "Design a reward badge or progress road for a habit tracking app."},
            {"day": 29, "date": "2026-07-13", "title": "Climate Change Visualizers", "desc": "Create a dashboard dashboard displaying real-time global emission levels."},
            {"day": 30, "date": "2026-07-14", "title": "AI Search Engines", "desc": "Design an AI search results page layout with dynamic text formatting."},
            {"day": 31, "date": "2026-07-15", "title": "Grand Finale Showcase", "desc": "Submit your final month-end masterpiece and portfolio compile!"}
        ]
        topics_col.insert_many(topics_data)
        print("Seeded 31 days of Daily Tech Topics.")

if __name__ == "__main__":
    init_db()
