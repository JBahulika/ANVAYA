"""Unit tests for ANVAYA pipeline helpers (no Gemini network calls)."""

import json

from app.document_playbook import DOCUMENT_READ_PLAYBOOK
from app.pipeline import parse_model_output
from app.rate_limit import SlidingWindowRateLimiter
from app.schemas import AimHint


def test_parse_json_aim_and_text():
    text, aim, kind = parse_model_output(
        '{"aim":"more_light","document_kind":"utility_bill","text":"A bill. Amount due 20."}'
    )
    assert aim == AimHint.more_light
    assert "20" in text
    assert kind == "utility_bill"


def test_parse_plain_text_fallback():
    text, aim, kind = parse_model_output("Stairs ahead at 12 o'clock.")
    assert aim == AimHint.ok
    assert "Stairs" in text
    assert kind is None


def test_parse_recovers_truncated_json():
    text, aim, kind = parse_model_output(
        '{ "aim": "ok", "document_kind": "product_label", "text": "Cotton shirt, size M, 799 rupees.'
    )
    assert aim == AimHint.ok
    assert kind == "product_label"
    assert "Cotton shirt" in text
    assert "{" not in text


def test_parse_unwraps_nested_json_text():
    inner = '{"aim":"ok","document_kind":"product_label","text":"Blue jeans, size 32."}'
    wrapped = json.dumps(
        {"aim": "ok", "document_kind": "product_label", "text": inner}
    )
    text, aim, kind = parse_model_output(wrapped)
    assert aim == AimHint.ok
    assert kind == "product_label"
    assert text == "Blue jeans, size 32."


def test_playbook_covers_core_bill_types():
    for needle in (
        "Utility bills",
        "Credit card",
        "Hospital",
        "Prescription",
        "Tickets",
        "Forms",
        "IDs",
        "hang tag",
    ):
        assert needle in DOCUMENT_READ_PLAYBOOK


def test_rate_limiter_blocks_after_limit():
    limiter = SlidingWindowRateLimiter(limit=2, window_seconds=60)
    assert limiter.allow("a") is True
    assert limiter.allow("a") is True
    assert limiter.allow("a") is False
    assert limiter.allow("b") is True
