# db models
from enum import unique

from app.db import db
from datetime import datetime


class GameResult(db.Model):
    __tablename__ = 'game_results'

    id = db.Column(db.Integer, primary_key=True)
    player_id = db.Column(db.String(100), nullable=True, unique=True)  # Session token for player
    nickname = db.Column(db.String(50), nullable=False, unique=True)
    initial_years = db.Column(db.Integer, nullable=False)  # init planet lifespan ?? tbh optional
    final_years = db.Column(db.Float, nullable=False)  # final planet lifespan
    total_score = db.Column(db.Float, nullable=False)  # sum of all action scores
    actions_count = db.Column(db.Integer, default=0)  # number of actions taken
    status = db.Column(db.String(20), nullable=False)  # 'won' or 'lost'
    played_at = db.Column(db.DateTime, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'nickname': self.nickname,
            'initial_years': self.initial_years,
            'final_years': self.final_years,
            'total_score': self.total_score,
            'actions_count': self.actions_count,
            'status': self.status,
            'played_at': self.played_at.isoformat() if self.played_at else None,
            'years_saved': self.final_years - self.initial_years
        }