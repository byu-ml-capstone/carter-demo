"""SQLite connection and startup migrations."""

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def sqlite_path(database_url: str) -> str:
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        raise ValueError(f"DATABASE_URL must start with {prefix}")
    return database_url[len(prefix) :]


class Database:
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.path = Path(sqlite_path(database_url))

    @contextmanager
    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.isolation_level = None
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 5000")
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    def apply_migrations(self) -> list[str]:
        """Apply hello/migrations/*.sql in filename order.

        sqlite3 executescript commits any open transaction, so the migration
        record is written in its own transaction after each script.
        """
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.isolation_level = None
        conn.execute("PRAGMA foreign_keys = ON")
        applied_now: list[str] = []
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS _migrations (
                    name TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            rows = conn.execute("SELECT name FROM _migrations").fetchall()
            pending = [
                path
                for path in sorted(MIGRATIONS_DIR.glob("*.sql"))
                if path.name not in {row["name"] for row in rows}
            ]
            conn.execute("COMMIT")
            for path in pending:
                conn.executescript(path.read_text())
                conn.execute("BEGIN IMMEDIATE")
                conn.execute(
                    "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
                    (path.name, now()),
                )
                conn.execute("COMMIT")
                applied_now.append(path.name)
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise
        finally:
            conn.close()
        return applied_now
