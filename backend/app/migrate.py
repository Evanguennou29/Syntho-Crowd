"""Apply the versioned SQL migrations before API/worker startup (one-shot container)."""

from pathlib import Path

from sqlalchemy import text

from app.db import session_factory


def main():
    engine = session_factory().kw["bind"]
    directory = Path(__file__).resolve().parents[2] / "migrations"
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(738201502)"))
        connection.exec_driver_sql("CREATE SCHEMA IF NOT EXISTS syntho")
        connection.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS syntho.schema_versions (version text PRIMARY KEY)",
        )
        for file in sorted(directory.glob("*.sql")):
            if connection.execute(
                text(
                    "SELECT 1 FROM syntho.schema_versions WHERE version = :version",
                ),
                {"version": file.name},
            ).scalar():
                continue
            connection.exec_driver_sql(file.read_text(encoding="utf-8"))
            connection.execute(
                text(
                    "INSERT INTO syntho.schema_versions (version) VALUES (:version)",
                ),
                {"version": file.name},
            )
            print(f"Applied {file.name}")


if __name__ == "__main__":
    main()
