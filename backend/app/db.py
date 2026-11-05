from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


@lru_cache
def session_factory() -> sessionmaker[Session]:
    engine = create_engine(
        get_settings().database_url.get_secret_value(),
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10},
    )
    return sessionmaker(engine, expire_on_commit=False)


def get_db():
    with session_factory()() as session:
        yield session
