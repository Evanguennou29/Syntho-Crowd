from pathlib import Path
from urllib.parse import quote

import httpx

from app.config import Settings


class Storage:
    def __init__(self, settings: Settings):
        self.url = settings.supabase_url.rstrip("/")
        self.bucket = settings.storage_bucket
        key = settings.supabase_service_role_key.get_secret_value()
        self.headers = {"Authorization": f"Bearer {key}", "apikey": key}

    def upload(self, key: str, path: Path, content_type: str) -> str:
        with path.open("rb") as stream, httpx.Client(timeout=120) as client:
            response = client.post(
                f"{self.url}/storage/v1/object/{self.bucket}/{quote(key, safe='/')}",
                headers={**self.headers, "Content-Type": content_type, "x-upsert": "true"},
                content=stream,
            )
            response.raise_for_status()
        return key

    def signed_url(self, key: str) -> str:
        response = httpx.post(
            f"{self.url}/storage/v1/object/sign/{self.bucket}/{quote(key, safe='/')}",
            headers=self.headers,
            json={"expiresIn": 3600},
            timeout=15,
        )
        response.raise_for_status()
        path = response.json()["signedURL"]
        return f"{self.url}/storage/v1{path}"
