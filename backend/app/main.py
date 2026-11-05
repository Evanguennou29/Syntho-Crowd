import logging
import secrets
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis import Redis
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Campaign, Profile, Run
from app.schemas import CampaignCreate
from app.services import campaign_data, cancel_campaign, create_campaign
from app.storage import Storage
from app.targets import validate_target

logger = logging.getLogger(__name__)
bearer = HTTPBearer(auto_error=False)


def authenticate(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if not credentials or not secrets.compare_digest(
        credentials.credentials,
        get_settings().api_token.get_secret_value(),
    ):
        raise HTTPException(
            401, "Authentification requise.", headers={"WWW-Authenticate": "Bearer"}
        )


app = FastAPI(title="SynthoCrowd API", version="2.0.0", dependencies=[Depends(authenticate)])
DB = Annotated[Session, Depends(get_db)]


@app.get("/health/live", dependencies=[])
def live():
    return {"status": "ok"}


@app.get("/health/ready")
def ready(db: DB):
    try:
        db.execute(text("SELECT 1 FROM syntho.campaigns LIMIT 1"))
        with Redis.from_url(get_settings().redis_url, socket_connect_timeout=2) as client:
            client.ping()
    except Exception:
        raise HTTPException(503, "Base de données ou file indisponible.") from None
    return {"status": "ready"}


@app.post("/api/v1/campaigns", status_code=202)
def launch(payload: CampaignCreate, db: DB):
    settings = get_settings()
    if sum(persona.multiplier for persona in payload.profiles) > settings.max_campaign_runs:
        raise HTTPException(422, f"Limite de {settings.max_campaign_runs} sessions par campagne.")
    try:
        validate_target(str(payload.url), settings.target_allowed_hosts)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    campaign = create_campaign(db, payload)
    # The committed queued rows are the durable outbox. Beat republishes pending work.
    try:
        from app.tasks import dispatch_pending

        dispatch_pending.delay()
    except Exception:
        logger.warning("Queue unavailable; campaign %s will be dispatched by beat", campaign.id)
    return {"campaign_id": campaign.id, **campaign_data(db, campaign)}


@app.get("/api/v1/campaigns")
def history(db: DB, limit: int = Query(default=5, ge=1, le=100)):
    campaigns = db.scalars(select(Campaign).order_by(Campaign.created_at.desc()).limit(limit))
    return [campaign_data(db, campaign) for campaign in campaigns]


def require_campaign(db: Session, campaign_id: UUID) -> Campaign:
    campaign = db.get(Campaign, str(campaign_id))
    if not campaign:
        raise HTTPException(404, "Campagne introuvable.")
    return campaign


@app.get("/api/v1/campaigns/{campaign_id}")
def detail(campaign_id: UUID, db: DB):
    return campaign_data(db, require_campaign(db, campaign_id))


@app.get("/api/v1/campaigns/{campaign_id}/runs")
def runs(campaign_id: UUID, db: DB):
    require_campaign(db, campaign_id)
    rows = db.execute(
        select(Run, Profile)
        .join(Profile)
        .where(
            Run.campaign_id == str(campaign_id),
        )
        .order_by(Run.ordinal)
    )
    return [
        {
            "id": run.id,
            "status": run.status,
            "profile": profile.data,
            "ai_report": run.ai_report,
            "action_logs": run.action_logs,
            "outcome": run.outcome,
            "error": run.error,
            "attempts": run.attempts,
            "artifacts": list(run.artifacts),
            "video_url": f"/api/backend/campaigns/{campaign_id}/runs/{run.id}/artifacts/video"
            if "video" in run.artifacts
            else None,
        }
        for run, profile in rows
    ]


@app.get("/api/v1/campaigns/{campaign_id}/runs/{run_id}/artifacts/{kind}")
def artifact(campaign_id: UUID, run_id: UUID, kind: str, db: DB):
    run = db.get(Run, str(run_id))
    if not run or run.campaign_id != str(campaign_id) or kind not in run.artifacts:
        raise HTTPException(404, "Fichier introuvable.")
    try:
        return {"url": Storage(get_settings()).signed_url(run.artifacts[kind])}
    except httpx.HTTPError:
        raise HTTPException(503, "Stockage indisponible.") from None


@app.post("/api/v1/campaigns/{campaign_id}/cancel")
def cancel(campaign_id: UUID, db: DB):
    campaign = cancel_campaign(db, str(campaign_id))
    if not campaign:
        raise HTTPException(404, "Campagne introuvable.")
    return campaign_data(db, campaign)
