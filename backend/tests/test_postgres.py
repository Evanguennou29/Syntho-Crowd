import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from app.models import Run
from app.schemas import CampaignCreate
from app.services import claim_run, create_campaign, finish_run

pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="Requires an isolated PostgreSQL test database",
)


def test_real_migration_and_concurrent_claims(payload):
    # Use a disposable database ONLY. Existing schemas are never overwritten or erased.
    engine = create_engine(os.environ["TEST_DATABASE_URL"])
    factory = sessionmaker(engine, expire_on_commit=False)
    try:
        with engine.begin() as connection:
            assert not connection.execute(
                text(
                    "SELECT schema_name FROM information_schema.schemata "
                    "WHERE schema_name='syntho'",
                )
            ).scalar(), "Use a fresh isolated test database."
            connection.execute(text("CREATE SCHEMA syntho"))
            sql = Path(__file__).resolve().parents[2] / "migrations/001_initial.sql"
            connection.exec_driver_sql(sql.read_text(encoding="utf-8"))
        with factory() as db:
            campaign = create_campaign(db, CampaignCreate.model_validate(payload))
            run_id = db.scalar(select(Run.id).where(Run.campaign_id == campaign.id))

        def claim(_index):
            with factory() as db:
                return claim_run(db, run_id) is not None

        with ThreadPoolExecutor(max_workers=4) as executor:
            assert sum(executor.map(claim, range(4))) == 1
        with factory() as db:
            assert finish_run(db, run_id, 1, status="success")
    finally:
        engine.dispose()
