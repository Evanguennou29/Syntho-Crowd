from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: SecretStr
    api_token: SecretStr = Field(min_length=32)
    redis_url: str = "redis://redis:6379/0"
    supabase_url: str = ""
    supabase_service_role_key: SecretStr = SecretStr("")
    storage_bucket: str = "test-videos"
    gemini_api_key: SecretStr = SecretStr("")
    llm_model: str = "gemini/gemini-2.5-flash"
    max_campaign_runs: int = Field(default=100, ge=1, le=1000)
    max_steps: int = Field(default=40, ge=1, le=100)
    session_timeout: int = Field(default=600, ge=30, le=900)
    max_rpm: int = Field(default=15, ge=1)
    lease_seconds: int = Field(default=1200, ge=1000)
    max_attempts: int = Field(default=3, ge=1, le=5)
    artifact_dir: Path = Path("/tmp/synthocrowd")
    target_allowed_hosts: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
