import logging
import shutil
from datetime import timedelta

from celery import Celery
from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy import or_, select

from app.config import get_settings
from app.db import session_factory
from app.models import Campaign, Run, as_utc, now
from app.services import claim_run, finish_run, lock_campaign, recover_stale, save_progress
from app.storage import Storage

logger = logging.getLogger(__name__)
settings = get_settings()
celery_app = Celery("synthocrowd", broker=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_ignore_result=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=850,
    task_time_limit=900,
    broker_connection_retry_on_startup=True,
    broker_connection_timeout=2,
    task_publish_retry=False,
    broker_transport_options={"visibility_timeout": 1800},
    beat_schedule={"dispatch-outbox": {"task": "syntho.dispatch", "schedule": 15.0}},
)


@celery_app.task(name="syntho.dispatch")
def dispatch_pending():
    with session_factory()() as db:
        recover_stale(db, settings)
        due = now() - timedelta(minutes=30)
        pending = list(
            db.scalars(
                select(Run)
                .where(
                    Run.status == "queued",
                    or_(Run.enqueued_at.is_(None), Run.enqueued_at < due),
                )
                .with_for_update(skip_locked=True)
                .limit(200)
            )
        )
        pending_ids = [run.id for run in pending]
        for run in pending:
            run.enqueued_at = now()
        db.commit()
        campaigns = list(
            db.scalars(
                select(Campaign.id)
                .where(
                    Campaign.status.in_(["completed", "partial", "failure"]),
                    Campaign.summary_status.in_(["pending", "running"]),
                )
                .limit(100)
            )
        )
    # Duplicate delivery is expected: the database claim serializes workers per campaign.
    for run_id in pending_ids:
        try:
            execute_run.delay(run_id)
        except Exception:
            with session_factory()() as db:
                run = db.get(Run, run_id)
                if run and run.status == "queued":
                    run.enqueued_at = None
                    db.commit()
            logger.warning("Could not publish run %s; scheduler will retry", run_id)
    for campaign_id in campaigns:
        build_summary.delay(campaign_id)


@celery_app.task(name="syntho.run")
def execute_run(run_id: str):
    with session_factory()() as db:
        claimed = claim_run(db, run_id)
        if not claimed:
            return
        run, campaign, profile = claimed
        attempt = run.attempts
        url, goal, persona = campaign.url, campaign.goal, profile.data
        campaign_id = campaign.id
    from app.browser import BrowserSession, SessionStopped
    from app.crews import run_session

    def progress(logs):
        with session_factory()() as db:
            return save_progress(db, run_id, attempt, logs)

    directory = settings.artifact_dir / run_id / str(attempt)
    shutil.rmtree(settings.artifact_dir / run_id, ignore_errors=True)
    browser = BrowserSession(url, persona, directory, settings, progress)
    report, status, error, artifacts = None, "failure", None, {}
    try:
        if not settings.gemini_api_key.get_secret_value():
            raise ValueError("GEMINI_API_KEY manquante dans le worker.")
        browser.open()
        report = run_session(browser, goal, persona, settings).model_dump()
        browser.check()
        status = "success"
    except SessionStopped:
        status = "cancelled"
    except (Exception, SoftTimeLimitExceeded) as exc:
        # Never store raw exceptions: provider errors can include credentials or page contents.
        logger.exception("Session %s failed on attempt %s", run_id, attempt)
        error = f"Erreur technique : {type(exc).__name__}. Consultez les logs du worker."
    finally:
        try:
            browser.close()
            storage = Storage(settings)
            paths = {
                "video": (browser.video_path, "video/webm"),
                "trace": (directory / "trace.zip", "application/zip"),
                "screenshot": (directory / "screenshot.jpg", "image/jpeg"),
            }
            if not progress(browser.logs):
                paths = {}
            for kind, (path, mime) in paths.items():
                if path and path.exists():
                    key = f"{campaign_id}/{run_id}/{attempt}/{path.name}"
                    artifacts[kind] = storage.upload(key, path, mime)
        except Exception:
            logger.exception("Artifact upload/cleanup failed for %s", run_id)
            error = error or "Certains médias n’ont pas pu être enregistrés."
        finally:
            with session_factory()() as db:
                finish_run(
                    db,
                    run_id,
                    attempt,
                    status=status,
                    ai_report=report,
                    action_logs=browser.logs,
                    artifacts=artifacts,
                    error=error,
                    outcome=browser.outcome,
                )
            shutil.rmtree(directory, ignore_errors=True)


@celery_app.task(name="syntho.summary", soft_time_limit=240, time_limit=300)
def build_summary(campaign_id: str):
    with session_factory()() as db:
        campaign = lock_campaign(db, campaign_id)
        if not campaign or campaign.status not in {"completed", "partial", "failure"}:
            return
        if campaign.summary_status in {"completed", "failure", "skipped"}:
            return
        stamp = campaign.summary_updated_at
        if (
            stamp
            and campaign.summary_status == "running"
            and (as_utc(stamp) > now() - timedelta(minutes=6))
        ):
            return
        if campaign.summary_attempts >= settings.max_attempts:
            campaign.summary_status = "failure"
            db.commit()
            return
        campaign.summary_attempts += 1
        attempt = campaign.summary_attempts
        campaign.summary_status = "running"
        campaign.summary_updated_at = now()
        rows = list(db.scalars(select(Run).where(Run.campaign_id == campaign_id)))
        reports = [
            {
                "run_id": run.id,
                "status": run.status,
                "outcome": run.outcome,
                "report": run.ai_report,
                "error": run.error,
            }
            for run in rows
        ]
        db.commit()
    try:
        from app.crews import summarize

        summary = summarize(reports, settings).model_dump()
        summary_status = "completed"
    except (Exception, SoftTimeLimitExceeded):
        logger.exception("Summary failed for %s", campaign_id)
        summary, summary_status = None, "failure"
    with session_factory()() as db:
        campaign = lock_campaign(db, campaign_id)
        if campaign.summary_attempts == attempt and campaign.summary_status == "running":
            campaign.summary, campaign.summary_status = summary, summary_status
            db.commit()
