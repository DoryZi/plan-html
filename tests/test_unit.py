"""Unit tests for serve_plan.py pure functions (no server)."""
from __future__ import annotations

import json


def test_round_to_answers_shape(serve_module):
    payload = {
        "round": 2,
        "cards": [
            {"id": "i1", "choice": "approve", "answer": "yes", "priority": 0},
            {"id": "d1", "answer": "", "dismissed": True, "priority": 1},
        ],
        "agentActions": {"reexplore": True, "note": "go"},
    }
    out = serve_module.round_to_answers(payload)
    assert out["round"] == 2
    assert out["answers"]["i1"]["choice"] == "approve"
    assert out["answers"]["i1"]["answer"] == "yes"
    assert out["answers"]["d1"]["dismissed"] is True
    assert out["agentActions"] == {"reexplore": True, "note": "go"}


def test_round_to_answers_preserves_order(serve_module):
    payload = {"round": 1, "cards": [
        {"id": "a", "priority": 0}, {"id": "b", "priority": 1}]}
    out = serve_module.round_to_answers(payload)
    assert out["answers"]["a"]["order"] == 0
    assert out["answers"]["b"]["order"] == 1


def test_save_and_load_answers_atomic(serve_module, tmp_path):
    p = tmp_path / "answers.json"
    data = {"round": 1, "answers": {"x": {"choice": "y"}}}
    serve_module.save_answers_atomic(p, data)
    assert json.loads(p.read_text()) == data
    assert serve_module.load_saved_answers(p) == data


def test_load_saved_answers_missing_returns_none(serve_module, tmp_path):
    assert serve_module.load_saved_answers(tmp_path / "nope.json") is None


def test_load_saved_answers_corrupt_returns_none(serve_module, tmp_path):
    p = tmp_path / "answers.json"
    p.write_text("{ not json")
    assert serve_module.load_saved_answers(p) is None


def test_append_question(serve_module, tmp_path):
    p = tmp_path / "questions.json"
    serve_module.append_question(p, {"id": "q1", "cardId": "c1", "text": "why?"})
    items = json.loads(p.read_text())
    assert len(items) == 1
    assert items[0]["status"] == "pending"
    assert items[0]["text"] == "why?"
    serve_module.append_question(p, {"id": "q2", "cardId": "c2", "text": "how?"})
    assert len(json.loads(p.read_text())) == 2


def test_render_html_substitutes_anchors(serve_module, tmp_path):
    out = tmp_path / "deck.html"
    plan = {"title": "T", "round": 1}
    serve_module.render_html(plan, {"round": 1, "answers": {}}, out)
    html = out.read_text()
    assert "{{PLAN_JSON}}" not in html
    assert "{{SAVED_ANSWERS}}" not in html
    assert '"title": "T"' in html or '"title":"T"' in html


def test_render_html_escapes_script_breakers(serve_module, tmp_path):
    out = tmp_path / "deck.html"
    # a hi-fi mock containing </script> must not break out of the script tag
    plan = {"title": "T", "round": 1,
            "decisions": [{"id": "d", "options": [
                {"label": "x", "html": "<div></script><script>alert(1)</script></div>"}]}]}
    serve_module.render_html(plan, None, out)
    html = out.read_text()
    # the raw closing tag must be escaped inside the injected JSON
    assert "</script><script>alert(1)" not in html


def test_sse_frame_format(serve_module):
    frame = serve_module.sse_frame("plan-updated", '{"a":1}')
    text = frame.decode("utf-8")
    assert text.startswith("event: plan-updated\n")
    assert "data: {\"a\":1}\n" in text
    assert text.endswith("\n\n")


def test_answers_and_questions_path_helpers(serve_module, tmp_path):
    plan = tmp_path / "plan.json"
    assert serve_module.answers_path_for(plan).name == "answers.json"
    assert serve_module.questions_path_for(plan).name == "questions.json"
    assert serve_module.answers_path_for(plan).parent == tmp_path
