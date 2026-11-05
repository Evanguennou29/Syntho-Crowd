import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://unused:unused@localhost/unused")
os.environ.setdefault("API_TOKEN", "test-token-" + "x" * 32)
os.environ.setdefault("CREWAI_TELEMETRY_DISABLED", "true")
os.environ.setdefault("OTEL_SDK_DISABLED", "true")

from app.db import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture
def factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        execution_options={"schema_translate_map": {"syntho": None}},
    )
    Base.metadata.create_all(engine)
    yield sessionmaker(engine, expire_on_commit=False)
    engine.dispose()


@pytest.fixture
def db(factory):
    with factory() as session:
        yield session


@pytest.fixture
def payload():
    return {
        "url": "https://example.com",
        "goal": "Trouver le formulaire de contact.",
        "profiles": [
            {
                "age": 35,
                "gender": "Femme",
                "tech_level": 5,
                "device_type": "mobile",
                "traits": "Curieuse",
                "multiplier": 2,
            }
        ],
    }


@pytest.fixture
def client(factory, monkeypatch):
    def override():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override
    monkeypatch.setattr("app.main.validate_target", lambda url, _hosts: url)
    with TestClient(app, headers={"Authorization": f"Bearer {os.environ['API_TOKEN']}"}) as test:
        yield test
    app.dependency_overrides.clear()
