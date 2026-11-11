"""finalize_plan.py: the last round folded into the final plan.

Run: uv run --directory <this skill> --with pytest pytest tests/test_finalize.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finalize_plan import fold  # noqa: E402


def test_a_card_struck_in_the_last_round_is_not_in_the_final_plan() -> None:
    """The deck leaves struck cards out of the round; Finalize must not build them."""
    plan = {"intents": [{"id": "i-keep", "title": "Keep"}, {"id": "i-struck", "title": "Struck"}],
            "steps": [{"id": "s-1", "title": "Build it"}]}
    rnd = {"action": "finalize", "cards": [{"id": "i-keep", "choice": "approve"}, {"id": "s-1"}]}
    final = fold(plan, rnd)
    assert [i["id"] for i in final["intents"]] == ["i-keep"]
    assert final["intents"][0]["final"] == {"choice": "approve"}
    assert [s["id"] for s in final["steps"]] == ["s-1"]


def test_a_round_without_cards_keeps_every_card() -> None:
    plan = {"intents": [{"id": "i-1", "title": "One"}]}
    assert fold(plan, {"action": "finalize"})["intents"] == [{"id": "i-1", "title": "One"}]
