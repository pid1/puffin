import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_PATH = os.environ.get(
    "PUFFIN_DB_PATH",
    str(Path(__file__).resolve().parent.parent.parent / "puffin.db"),
)
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _run_migrations(bind=None) -> None:
    """Apply incremental schema changes to existing databases.

    SQLAlchemy's ``create_all`` only creates missing tables; it does not add
    new columns to tables that already exist.  Any column added to a model
    after the initial release must be handled here so that deployed databases
    are automatically brought up to date on startup.

    *bind* defaults to the module-level ``engine`` and can be overridden for
    testing.
    """
    target = bind if bind is not None else engine
    with target.connect() as conn:
        existing_cols = {c["name"] for c in inspect(conn).get_columns("feedings")}
        if "session_id" not in existing_cols:
            conn.execute(text("ALTER TABLE feedings ADD COLUMN session_id TEXT"))
            conn.commit()


def init_db():
    """Create all tables, disposing stale connections first."""
    engine.dispose()
    Base.metadata.create_all(bind=engine)
    _run_migrations()
