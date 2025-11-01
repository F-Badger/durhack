from app import create_app
from app.db import db


def init_db():
    app = create_app()

    with app.app_context():
        # create tables
        db.create_all()
        print("Database tables created successfully!")

        # Print created tables
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        tables = inspector.get_table_names()


if __name__ == '__main__':
    init_db()