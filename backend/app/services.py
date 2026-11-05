from collections import Counter
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Campaign, Profile, Run, as_utc, now
from app.schemas import CampaignCreate

TERMINAL = {"success", "failure", "cancelled"}
ACTIVE = {"queued", "running"}


def create_campaign(db: Session, payload: CampaignCreate) -> Campaign:
    campaign = Campaign(url=str(payload.url), goal=payload.goal)
    db.add(campaign)
    db.flush()
    ordinal = 0
    for persona in payload.profiles:
        profile = Profile(campaign_id=campaign.id, data=persona.model_dump())
        db.add(profile)
        db.flush()
        for _ in range(persona.multiplier):
            ordinal += 1
            db.add(Run(campaign_id=campaign.id, profile_id=profile.id, ordinal=ordinal))
    db.commit()
    return campaign


def lock_campaign(db: Session, campaign_id: str) -> Campaign | None:
    return db.scalar(
        select(Campaign)
        .where(Campaign.id == campaign_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def aggregate(db: Session, campaign: Campaign) -> None:
    db.flush()
    statuses = list(db.scalars(select(Run.status).where(Run.campaign_id == campaign.id)))
    if campaign.status == "cancelled":
        return
    if any(status in ACTIVE for status in statuses):
        campaign.status = "running" if "running" in statuses else "queued"
    elif statuses and all(status == "success" for status in statuses):
        campaign.status = "completed"
    elif "success" in statuses:
        campaign.status = "partial"
    else:
        campaign.status = "failure"


def claim_run(db: Session, run_id: str) -> tuple[Run, Campaign, Profile] | None:
    run = db.get(Run, run_id)
    if not run:
        return None
    campaign = lock_campaign(db, run.campaign_id)
    db.refresh(run)
    if not campaign or campaign.status == "cancelled" or run.status != "queued":
        return None
    run.status = "running"
    run.attempts += 1
    run.heartbeat_at = now()
    run.error = None
    run.action_logs = []
    campaign.status = "running"
    profile = db.get(Profile, run.profile_id)
    db.commit()
    return run, campaign, profile


def save_progress(db: Session, run_id: str, attempt: int, logs: list) -> bool:
    run = db.get(Run, run_id)
    if not run:
        return False
    campaign = lock_campaign(db, run.campaign_id)
    db.refresh(run)
    if campaign.status == "cancelled" or run.status != "running" or run.attempts != attempt:
        db.rollback()
        return False
    run.action_logs = list(logs)
    run.heartbeat_at = now()
    db.commit()
    return True


def finish_run(db: Session, run_id: str, attempt: int, **values) -> bool:
    run = db.get(Run, run_id)
    if not run:
        return False
    campaign = lock_campaign(db, run.campaign_id)
    db.refresh(run)
    if run.status != "running" or run.attempts != attempt:
        db.rollback()
        return False
    for key, value in values.items():
        setattr(run, key, value)
    if campaign.status == "cancelled":
        run.status = "cancelled"
    aggregate(db, campaign)
    db.commit()
    return True


def cancel_campaign(db: Session, campaign_id: str) -> Campaign | None:
    campaign = lock_campaign(db, campaign_id)
    if not campaign:
        return None
    if campaign.status in ACTIVE:
        campaign.status = "cancelled"
        campaign.summary_status = "skipped"
        for run in db.scalars(select(Run).where(Run.campaign_id == campaign_id)):
            if run.status in ACTIVE:
                run.status = "cancelled"
    db.commit()
    return campaign


def recover_stale(db: Session, settings: Settings) -> None:
    cutoff = now() - timedelta(seconds=settings.lease_seconds)
    ids = list(
        db.scalars(
            select(Run.id).where(
                Run.status == "running",
                Run.heartbeat_at < cutoff,
            )
        )
    )
    for run_id in ids:
        run = db.get(Run, run_id)
        campaign = lock_campaign(db, run.campaign_id)
        db.refresh(run)
        heartbeat = as_utc(run.heartbeat_at) if run.heartbeat_at else now()
        if run.status == "running" and heartbeat < cutoff:
            run.status = "queued" if run.attempts < settings.max_attempts else "failure"
            run.enqueued_at = None
            run.error = (
                "Worker interrompu ; reprise programmée."
                if run.status == "queued"
                else ("Nombre maximal de reprises atteint après interruption du worker.")
            )
            aggregate(db, campaign)
        db.commit()


def campaign_data(db: Session, campaign: Campaign) -> dict:
    counts = Counter(db.scalars(select(Run.status).where(Run.campaign_id == campaign.id)))
    return {
        "id": campaign.id,
        "url": campaign.url,
        "goal": campaign.goal,
        "status": campaign.status,
        "created_at": campaign.created_at,
        "total_runs": sum(counts.values()),
        "finished_runs": sum(counts[status] for status in TERMINAL),
        "counts": dict(counts),
        "summary": campaign.summary,
        "summary_status": campaign.summary_status,
    }
