from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os

# env vars
load_dotenv()

def create_app():
    app = Flask(__name__)
    CORS(app)

    # Secret key for sessions
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

    # db
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///db.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # init db
    from .db import db
    db.init_app(app)

    from .models import GameResult

    # bps
    from .api.routes import api
    app.register_blueprint(api)

    return app