import jwt
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify
from config import Config
from db import users_col
from bson import ObjectId

def generate_token(user_id, role):
    """
    Generate a JWT token for the user.
    """
    try:
        payload = {
            'exp': datetime.utcnow() + timedelta(days=7),
            'iat': datetime.utcnow(),
            'sub': str(user_id),
            'role': role
        }
        return jwt.encode(
            payload,
            Config.SECRET_KEY,
            algorithm='HS256'
        )
    except Exception as e:
        return str(e)

def token_required(f):
    """
    Decorator to protect routes and verify JWT tokens.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Look for token in Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                # Expecting: "Bearer <token>"
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Invalid Authorization header format. Use Bearer <token>'}), 401
                
        if not token:
            return jsonify({'error': 'Authentication token is missing!'}), 401
            
        try:
            # Decode the token
            payload = jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])
            user_id = payload['sub']
            
            # Fetch user details
            current_user = users_col.find_one({"_id": ObjectId(user_id)})
            if not current_user:
                return jsonify({'error': 'User not found in database!'}), 401
                
            # Convert ObjectId to string for easy JSON serialization in routes
            current_user['_id'] = str(current_user['_id'])
            
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired!'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token!'}), 401
        except Exception as e:
            return jsonify({'error': f'Authentication error: {str(e)}'}), 401
            
        return f(current_user, *args, **kwargs)
        
    return decorated
