import os

# Manual .env loader to prevent dependencies on python-dotenv
def load_dotenv(env_path):
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    os.environ[key] = val

# Load .env relative to config.py file path
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

class Config:
    # MongoDB connection URI (with possible whitespace removed in processing)
    RAW_MONGO_URI = os.environ.get("MONGO_URI", "")
    
    # Process the URI to handle any accidental spaces safely
    MONGO_URI = RAW_MONGO_URI.replace(" ", "")
    
    SECRET_KEY = os.environ.get("SECRET_KEY", "design-club-monochrome-secret-2026")
    
    # Verification passcode for coordinator/leader registration
    LEADER_PASSCODE = os.environ.get("LEADER_PASSCODE", "LEADER2026")
    
    # Upload parameters
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max upload size
    
    # Allowed image formats
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
