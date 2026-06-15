"""Shared pytest fixtures: import the server module and run it as a subprocess."""
from __future__ import annotations

import importlib.util
import json
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVE = REPO_ROOT / "serve_plan.py"


@pytest.fixture(scope="session")
def serve_module():
    """Import serve_plan.py as a module for unit-testing its pure functions."""
    spec = importlib.util.spec_from_file_location("serve_plan", SERVE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


SAMPLE_PLAN = {
    "title": "Test plan",
    "slug": "test",
    "round": 1,
    "rev": 0,
    "goal": "Prove the server works",
    "intents": [
        {"id": "i1", "title": "An intent", "intent": "I want X",
         "verify": {"method": "e2e", "command": "run", "expected": "ok"}}
    ],
    "decisions": [
        {"id": "d1", "title": "A fork", "status": "needs-you",
         "summary": "pick", "building": "stuff", "options": ["A", "B"]}
    ],
    "steps": [{"title": "Do it", "description": "desc", "intent": "i1"}],
    "finalVerify": [{"intent": "i1", "method": "e2e",
                     "command": "run", "expected": "ok"}],
    "diagramSvg": "<rect class='node' x='10' y='10' width='140' height='48'/>",
    "diagramViewBox": "0 0 200 80",
}


def http_get(url: str, timeout: float = 5.0):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8")


def http_post(url: str, payload: dict, timeout: float = 5.0):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8")


class ServerHandle:
    def __init__(self, proc: subprocess.Popen, port: int, plan_path: Path):
        self.proc = proc
        self.port = port
        self.plan_path = plan_path
        self.base = f"http://127.0.0.1:{port}"

    def url(self, path: str) -> str:
        return self.base + path

    def wait_for_ready(self, timeout: float = 10.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                http_get(self.url("/"), timeout=1.0)
                return
            except Exception:
                time.sleep(0.1)
        raise RuntimeError("server did not become ready")

    def read_stdout_line(self, timeout: float = 10.0) -> dict | None:
        """Block until the server prints a JSON line on stdout, return it parsed."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            line = self.proc.stdout.readline()
            if line:
                line = line.strip()
                if line:
                    return json.loads(line)
            if self.proc.poll() is not None:
                break
            time.sleep(0.02)
        return None


@pytest.fixture
def server(tmp_path):
    """Spin up serve_plan.py --live on a free port; yields a ServerHandle."""
    plan_path = tmp_path / "plan.json"
    plan_path.write_text(json.dumps(SAMPLE_PLAN), encoding="utf-8")
    port = _free_port()
    proc = subprocess.Popen(
        [sys.executable, str(SERVE), "--plan", str(plan_path),
         "--no-open", "--live", "--host", "127.0.0.1", "--timeout", "30"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        env={"PLAN_HTML_PORT": str(port)},  # informational; server picks its own
    )
    # serve_plan picks its own free port and logs it on stderr; parse it
    handle_port = None
    deadline = time.time() + 10
    while time.time() < deadline and handle_port is None:
        line = proc.stderr.readline()
        if "at http://127.0.0.1:" in line:
            handle_port = int(line.split("http://127.0.0.1:")[1].split("/")[0])
            break
        if proc.poll() is not None:
            break
    if handle_port is None:
        proc.kill()
        raise RuntimeError("could not detect server port from stderr")
    handle = ServerHandle(proc, handle_port, plan_path)
    handle.wait_for_ready()
    yield handle
    try:
        proc.kill()
    except Exception:
        pass
