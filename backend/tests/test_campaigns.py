from datetime import timedelta
from unittest.mock import Mock

from sqlalchemy import select

from app.config import get_settings
from app.models import Campaign, Run, now
from app.schemas import CampaignCreate
from app.services import (
    cancel_campaign,
    claim_run,
    create_campaign,
    finish_run,
    recover_stale,
    save_progress,
)


def seed(db, payload):
    campaign = create_campaign(db, CampaignCreate.model_validate(payload))
    runs = list(db.scalars(select(Run).where(Run.campaign_id == campaign.id).order_by(Run.ordinal)))
    return campaign, runs


def test_api_accepts_and_persists_campaign_when_broker_is_down(client, db, payload, monkeypatch):
    publish = Mock(side_effect=ConnectionError("broker down"))
    monkeypatch.setattr("app.tasks.dispatch_pending.delay", publish)
    response = client.post("/api/v1/campaigns", json=payload)
    assert response.status_code == 202
    data = response.json()
    assert data["total_runs"] == 2 and data["status"] == "queued"
    assert db.get(Campaign, data["campaign_id"])
    sessions = client.get(f"/api/v1/campaigns/{data['campaign_id']}/runs").json()
    assert len(sessions) == 2 and all(run["status"] == "queued" for run in sessions)


def test_api_rejects_unauthenticated_requests(client):
    assert (
        client.get("/api/v1/campaigns", headers={"Authorization": "Bearer wrong"}).status_code
        == 401
    )


def test_validation_and_campaign_limit(client, payload):
    payload["profiles"][0]["tech_level"] = 11
    assert client.post("/api/v1/campaigns", json=payload).status_code == 422
    payload["profiles"][0]["tech_level"] = 5
    payload["profiles"] *= 3
    for profile in payload["profiles"]:
        profile["multiplier"] = 50
    assert client.post("/api/v1/campaigns", json=payload).status_code == 422
    assert client.get("/api/v1/campaigns/not-a-uuid").status_code == 422


def test_duplicate_delivery_cannot_claim_running_or_finished_session(db, payload):
    campaign, runs = seed(db, payload)
    assert claim_run(db, runs[0].id)
    assert claim_run(db, runs[0].id) is None
    assert finish_run(db, runs[0].id, 1, status="success", outcome="blocked")
    assert claim_run(db, runs[0].id) is None
    assert db.get(Campaign, campaign.id).status == "queued"


def test_campaign_reports_partial_failure_and_preserves_mission_outcome(db, payload):
    campaign, runs = seed(db, payload)
    for run, status in zip(runs, ["success", "failure"], strict=True):
        claim_run(db, run.id)
        finish_run(db, run.id, 1, status=status, outcome="blocked")
    assert db.get(Campaign, campaign.id).status == "partial"
    assert db.get(Run, runs[0].id).outcome == "blocked"


def test_cancel_stops_queued_work_and_rejects_late_progress(db, payload):
    campaign, runs = seed(db, payload)
    claim_run(db, runs[0].id)
    cancel_campaign(db, campaign.id)
    assert not save_progress(db, runs[0].id, 1, [{"step": 1}])
    assert not finish_run(db, runs[0].id, 1, status="success")
    assert claim_run(db, runs[1].id) is None
    assert all(run.status == "cancelled" for run in db.scalars(select(Run)))
    assert db.get(Campaign, campaign.id).status == "cancelled"


def test_interrupted_worker_is_recovered_without_accepting_obsolete_attempt(db, payload):
    _, runs = seed(db, payload)
    run_id = runs[0].id
    claim_run(db, run_id)
    run = db.get(Run, run_id)
    run.heartbeat_at = now() - timedelta(hours=1)
    db.commit()
    recover_stale(db, get_settings())
    assert db.get(Run, run_id).status == "queued"
    assert claim_run(db, run_id)[0].attempts == 2
    assert not finish_run(db, run_id, 1, status="success")
    assert save_progress(db, run_id, 2, [{"step": 1, "success": True}])
    assert finish_run(db, run_id, 2, status="success")


def test_recovery_is_bounded_and_marks_failed_campaign(db, payload):
    payload["profiles"][0]["multiplier"] = 1
    campaign, runs = seed(db, payload)
    claim_run(db, runs[0].id)
    run = db.get(Run, runs[0].id)
    run.attempts = get_settings().max_attempts
    run.heartbeat_at = now() - timedelta(hours=1)
    db.commit()
    recover_stale(db, get_settings())
    assert db.get(Run, run.id).status == "failure"
    assert db.get(Campaign, campaign.id).status == "failure"


def test_cancel_is_idempotent_and_does_not_change_completed_campaign(db, payload):
    campaign, runs = seed(db, payload)
    for run in runs:
        claim_run(db, run.id)
        finish_run(db, run.id, 1, status="success")
    assert cancel_campaign(db, campaign.id).status == "completed"


def test_dispatcher_republishes_durable_pending_rows(factory, db, payload, monkeypatch):
    from app.tasks import dispatch_pending

    _, runs = seed(db, payload)
    monkeypatch.setattr("app.tasks.session_factory", lambda: factory)
    publish = Mock()
    monkeypatch.setattr("app.tasks.execute_run.delay", publish)
    dispatch_pending.run()
    assert {call.args[0] for call in publish.call_args_list} == {run.id for run in runs}
    publish.reset_mock()
    dispatch_pending.run()
    publish.assert_not_called()


def test_failed_publication_remains_dispatchable(factory, db, payload, monkeypatch):
    from app.tasks import dispatch_pending

    _, runs = seed(db, payload)
    monkeypatch.setattr("app.tasks.session_factory", lambda: factory)
    monkeypatch.setattr("app.tasks.execute_run.delay", Mock(side_effect=ConnectionError))
    dispatch_pending.run()
    db.expire_all()
    assert all(db.get(Run, run.id).enqueued_at is None for run in runs)
