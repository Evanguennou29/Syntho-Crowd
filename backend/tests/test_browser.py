import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_BROWSER_TESTS") != "1",
    reason="Set RUN_BROWSER_TESTS=1 after browser install",
)


class Website(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"""<!doctype html><title>Local UX fixture</title>
          <label>Name <input placeholder="Name" id="name"></label>
          <button onclick="document.querySelector('#result').textContent='Saved'">Save</button>
          <div id="result"></div>""")

    def log_message(self, *_args):
        pass


def test_real_browser_actions_evidence_video_and_persona_isolation(tmp_path, monkeypatch):
    from app.browser import BrowserSession, SessionStopped
    from app.config import get_settings

    # Only this local fixture bypasses production URL policy; the model/vision is stubbed.
    monkeypatch.setattr("app.browser.validate_target", lambda url, _hosts: url)
    monkeypatch.setattr(
        BrowserSession, "_describe", lambda _self, _image: "Name field and Save button"
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), Website)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}"
    persona = {"device_type": "mobile"}
    browser = BrowserSession(url, persona, tmp_path / "one", get_settings(), lambda _logs: True)
    second = BrowserSession(url, persona, tmp_path / "two", get_settings(), lambda _logs: True)
    try:
        browser.open()
        observation = browser.perform("observe")
        field = next(item["id"] for item in observation["elements"] if item["tag"] == "INPUT")
        button = next(item["id"] for item in observation["elements"] if item["tag"] == "BUTTON")
        assert browser.perform("type", field, "Synthetic User")["executed"]
        assert browser.perform("click", button)["executed"]
        assert "Saved" in browser.perform("observe")["text"]
        assert "Synthetic User" not in str(browser.logs)  # typed data is not logged
        assert browser.perform("click", 999)["error"]
        assert browser.logs[-1]["success"] is False
        browser.perform("finish", value="achieved")
        assert browser.outcome == "achieved"
        second.open()
        assert "Saved" not in second.perform("observe")["text"]
        second.progress = lambda _logs: False
        with pytest.raises(SessionStopped):
            second.perform("observe")
        assert not second.browser.is_connected()
    finally:
        browser.close()
        second.close()
        server.shutdown()
        server.server_close()
    assert browser.video_path and browser.video_path.exists()
    assert (tmp_path / "one" / "trace.zip").exists()
    assert (tmp_path / "one" / "screenshot.jpg").exists()
