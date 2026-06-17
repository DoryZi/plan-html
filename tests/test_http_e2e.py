"""HTTP-level e2e: drive a real serve_plan.py process over HTTP."""
from __future__ import annotations

import json
import time

from conftest import http_get, http_post


def test_serves_deck_html(server):
    status, body = http_get(server.url("/"))
    assert status == 200
    assert "<title>Plan" in body
    assert "{{PLAN_JSON}}" not in body  # plan was injected


def test_plan_endpoint_returns_current_plan(server):
    # the polling fallback reads GET /plan; it must return the live plan JSON
    status, body = http_get(server.url("/plan"))
    assert status == 200
    plan = json.loads(body)
    assert plan["title"]  # a real plan object, not the deck HTML
    # reflects edits to the plan file (what the poller diffs on `rev`)
    edited = json.loads(server.plan_path.read_text())
    edited["rev"] = (edited.get("rev") or 0) + 1
    server.plan_path.write_text(json.dumps(edited))
    status2, body2 = http_get(server.url("/plan"))
    assert json.loads(body2)["rev"] == edited["rev"]


def test_save_writes_answers_json(server):
    answers = {"round": 1, "answers": {"i1": {"choice": "approve"}}}
    status, _ = http_post(server.url("/save"), answers)
    assert status == 200
    saved = json.loads(
        (server.plan_path.parent / f"{server.plan_path.stem}.answers.json").read_text())
    assert saved["answers"]["i1"]["choice"] == "approve"


def test_ask_queues_question_and_emits_stdout(server):
    status, _ = http_post(server.url("/ask"),
                          {"id": "q1", "cardId": "i1", "text": "what about X?"})
    assert status == 200
    # queued to <stem>.questions.json
    qpath = server.plan_path.parent / f"{server.plan_path.stem}.questions.json"
    deadline = time.time() + 5
    while time.time() < deadline and not qpath.exists():
        time.sleep(0.05)
    items = json.loads(qpath.read_text())
    assert any(q["text"] == "what about X?" and q["status"] == "pending" for q in items)
    # emitted on stdout as an ask event
    evt = server.read_stdout_line(timeout=5)
    assert evt is not None
    assert evt["action"] == "ask"
    assert evt["cardId"] == "i1"
    assert evt["text"] == "what about X?"


def test_ask_rejects_empty_text(server):
    import urllib.error
    try:
        http_post(server.url("/ask"), {"id": "q", "cardId": "i1", "text": "   "})
        assert False, "expected 400"
    except urllib.error.HTTPError as e:
        assert e.code == 400


def test_submit_prints_round_on_stdout(server):
    round_payload = {
        "action": "send-round", "round": 1,
        "agentActions": {"reexplore": False, "note": ""},
        "cards": [{"id": "i1", "kind": "intent", "choice": "approve",
                   "answer": "", "priority": 0}],
    }
    status, _ = http_post(server.url("/submit"), round_payload)
    assert status == 200
    evt = server.read_stdout_line(timeout=5)
    assert evt is not None
    assert evt["action"] == "send-round"
    assert evt["cards"][0]["id"] == "i1"
    # the process exits 0 after a submit
    assert server.proc.wait(timeout=5) == 0


def test_sse_pushes_on_plan_change(server):
    """Editing plan.json should push a plan-updated SSE frame to a connected client."""
    import urllib.request
    req = urllib.request.Request(server.url("/events"))
    stream = urllib.request.urlopen(req, timeout=5)
    # initial frame: server pushes current plan immediately
    first = stream.readline().decode("utf-8")
    assert first.startswith(":") or first.startswith("event:") or first.strip() == ""
    # now mutate the plan; the watcher should push an update
    plan = json.loads(server.plan_path.read_text())
    plan["rev"] = plan.get("rev", 0) + 1
    plan["title"] = "Mutated"
    server.plan_path.write_text(json.dumps(plan))
    # read frames until we see a plan-updated event carrying the new title
    saw_update = False
    deadline = time.time() + 8
    while time.time() < deadline:
        line = stream.readline().decode("utf-8")
        if "Mutated" in line:
            saw_update = True
            break
        if not line:
            time.sleep(0.05)
    stream.close()
    assert saw_update, "expected a plan-updated SSE frame with the new title"


def test_unknown_path_404(server):
    import urllib.error
    try:
        http_get(server.url("/nope"))
        assert False, "expected 404"
    except urllib.error.HTTPError as e:
        assert e.code == 404
