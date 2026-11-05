import json

import pytest

pytest.importorskip("crewai")
from crewai import BaseLLM  # noqa: E402
from pydantic import Field  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.crews import language_model, run_session  # noqa: E402


class ScriptedLLM(BaseLLM):
    model: str = "test/scripted"
    replies: list[str] = Field(default_factory=list)

    def call(self, messages, **kwargs):
        assert self.replies, "Unexpected extra model call"
        return self.replies.pop(0)


class BrowserFixture:
    def __init__(self):
        self.logs = []
        self.outcome = "incomplete"

    def perform(self, action, element_id=0, value=""):
        self.logs.append({"step": len(self.logs) + 1, "action": action, "success": True})
        if action == "finish":
            self.outcome = value
        return {"text": "Contact form visible", "executed": True}


def tool_call(name, arguments):
    return (
        f"Thought: Use the observed evidence.\nAction: {name}\n"
        f"Action Input: {json.dumps(arguments)}"
    )


def test_real_crewai_loop_executes_tools_without_cached_observations(monkeypatch):
    report = {
        "ux_score": 80,
        "summary": "Formulaire trouvé.",
        "frustrations": [],
        "positive_points": ["Contact visible"],
        "improvements": [],
        "findings": [],
    }
    llm = ScriptedLLM(
        model="test/scripted",
        replies=[
            tool_call("browser_action", {"action": "observe", "step": 1}),
            tool_call("browser_action", {"action": "observe", "step": 2}),
            tool_call("browser_action", {"action": "finish", "value": "achieved", "step": 3}),
            "Thought: Done.\nFinal Answer: Le formulaire de contact est visible.",
            tool_call("session_evidence", {}),
            f"Thought: Evidence reviewed.\nFinal Answer: {json.dumps(report)}",
        ],
    )
    monkeypatch.setattr("app.crews.language_model", lambda _settings: llm)
    browser = BrowserFixture()
    result = run_session(browser, "Trouver le contact", {"tech_level": 5}, get_settings())
    assert result.ux_score == 80
    assert [log["action"] for log in browser.logs] == ["observe", "observe", "finish"]
    assert browser.outcome == "achieved"
    assert llm.replies == []


def test_native_gemini_client_can_be_constructed_without_paid_call():
    settings = get_settings().model_copy(update={"gemini_api_key": "not-a-real-key"})
    from pydantic import SecretStr

    settings.gemini_api_key = SecretStr("not-a-real-key")
    assert language_model(settings).model.endswith("gemini-2.5-flash")
