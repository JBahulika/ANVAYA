"""Gemini multimodal pipeline with mode-specific accessibility prompts."""

from __future__ import annotations

import json
import re
from typing import Optional

from google import genai
from google.genai import types

from .config import Settings
from .document_playbook import (
    DOCUMENT_EXPLAIN_PLAYBOOK,
    DOCUMENT_READ_PLAYBOOK,
    DOCUMENT_SIMPLIFY_PLAYBOOK,
)
from .schemas import AimHint, AnalyzeMode

DISCLAIMER = (
    "Photo is processed and not stored. Not medical, legal, or financial advice."
)

AIM_COACHING: dict[AimHint, str] = {
    AimHint.ok: "",
    AimHint.move_closer: "Too far or off-frame. Move closer and tap again.",
    AimHint.more_light: "Too dark. Face a light and tap again.",
    AimHint.hold_still: "Blurry. Hold still and tap again.",
    AimHint.no_subject: "Nothing clear in view. Point at the bill or page and tap again.",
}

SHARED_RULES = """
You are ANVAYA, a reader for people who are blind or have low vision.
Read what is actually in the photo: bill, form, letter, ticket, product label, hang tag, or object.

Always follow these rules:
1. First say what it is. Then the most useful printed fact for that thing
   (bill → amount due / date; label/tag → brand, item, size, price, care; ticket → time/place).
2. Keep the spoken answer to 1–3 short sentences unless they asked to list everything.
3. Never pretend a product label, hang tag, or price sticker is a bill. Do not invent amount due or due date.
4. If the photo is blurry, dark, too far, cropped, or empty, set aim accordingly and still share anything useful.
5. Never invent text, amounts, or dates. Never give medical, legal, or financial advice.
6. For medicine labels and prescriptions, only read what is printed.
7. Mask long ID and account numbers — last 4 digits only.
8. Do not include disclaimers; the app adds those.
9. Do not use markdown. The "text" field must be plain spoken English only — no braces, no JSON keys.
"""

JSON_CONTRACT = """
Respond with JSON only, no markdown fences:
{
  "aim": "ok" | "move_closer" | "more_light" | "hold_still" | "no_subject",
  "document_kind": "short snake_case type or unknown",
  "text": "spoken answer"
}

aim:
- ok: subject is clear enough to answer
- move_closer: too far, cropped, or off-center
- more_light: too dark to trust
- hold_still: motion blur
- no_subject: no readable document or page

document_kind examples:
utility_bill, credit_card, loan_emi, insurance, hospital_bill, rent,
tax_notice, school_fee, subscription, receipt, invoice, payslip, cheque,
shipping_label, product_label, clothing_tag, price_tag, ticket, appointment,
form, official_letter, id_document, prescription, medicine_label, menu,
contract, admit_card, other_document, not_a_document

The "text" value is spoken English only. Never nest JSON inside text.
"""

MODE_INSTRUCTIONS: dict[AnalyzeMode, str] = {
    AnalyzeMode.auto: """
Mode: AUTO
Prefer the document reader.
If this is a bill, form, letter, ticket, ID, label, receipt, or other printed/screen text: behave exactly like READ.
If the user asked a question, answer from what is visible.
If it is clearly not a document (hallway, object): one sentence on what it is plus one useful fact.
"""
    + DOCUMENT_READ_PLAYBOOK,
    AnalyzeMode.simple: """
Mode: SIMPLE
Give a short, easy-to-understand answer (1–3 sentences).
Focus on what this is and the single most useful fact.
""",
    AnalyzeMode.detailed: """
Mode: DETAILED
Provide useful contextual information: what it is, key visible details,
and anything the user should notice. Keep it organized and readable aloud.
Avoid listing irrelevant background objects. Still lead with the most useful fact.
""",
    AnalyzeMode.alert: """
Mode: ALERT
Speak like orientation and mobility guidance, not a scene caption.
Use this order, in short sentences:
1. Hazard first — or say "No hazard obvious" if none is apparent.
2. Clock-face direction and rough distance (example: "12 o'clock, about two steps").
3. One next action (example: "Stop. Cane the edge.").
4. End the text with exactly: "This can miss things."
Prioritize: stairs, drop-offs, obstacles, vehicles, warning signs, wet floors,
open doors, road crossings, restricted areas, emergency signs.
Do not describe the whole scene. You are not a guaranteed safety system.
""",
    AnalyzeMode.read: """
Mode: READ
This is the hero path: read a bill or document out loud, facts first.
"""
    + DOCUMENT_READ_PLAYBOOK,
    AnalyzeMode.ask: """
Mode: ASK
Answer the user's question from the current image only. Do not invent fields.
Match the object: bill fields only if it is a bill; label/tag fields if it is a label.

SHORT answers (1–3 sentences) for a single ask: amount due, due date, how many items,
brand, size, price, colour, care, what is this, who is it from.

FULL RECITE — if they ask to list items, list everything, read everything, what is on it,
what did you see, recite, or line by line:
If it is a bill/receipt: issuer, each line + price, tax/fees, total, due date.
If it is a product or clothing label: brand, product name, size, colour, price, material,
care instructions, and any other printed lines. Do not invent bill totals.
If a line is unreadable, say so and continue.
""",
    AnalyzeMode.explain: """
Mode: EXPLAIN
"""
    + DOCUMENT_EXPLAIN_PLAYBOOK,
    AnalyzeMode.simplify: """
Mode: SIMPLIFY
"""
    + DOCUMENT_SIMPLIFY_PLAYBOOK,
}


def build_prompt(mode: AnalyzeMode, question: Optional[str]) -> str:
    parts = [
        SHARED_RULES.strip(),
        MODE_INSTRUCTIONS[mode].strip(),
        JSON_CONTRACT.strip(),
    ]
    if mode in (AnalyzeMode.ask, AnalyzeMode.explain) and question:
        parts.append(f"User question: {question.strip()}")
    elif mode == AnalyzeMode.ask and not question:
        parts.append(
            "The user did not ask a specific question. "
            "Answer: what is this, and what do they most need to know?"
        )
    elif question:
        parts.append(f"Additional user note: {question.strip()}")

    return "\n\n".join(parts)


def _guess_mime(filename: Optional[str], content_type: Optional[str]) -> str:
    if content_type and content_type.startswith("image/"):
        return content_type
    if filename:
        lower = filename.lower()
        if lower.endswith(".png"):
            return "image/png"
        if lower.endswith(".webp"):
            return "image/webp"
        if lower.endswith(".gif"):
            return "image/gif"
        if lower.endswith((".jpg", ".jpeg")):
            return "image/jpeg"
    return "image/jpeg"


def extract_confidence_note(text: str) -> Optional[str]:
    """Pull a short uncertainty note if the model signals ambiguity."""
    patterns = [
        r"(?i)(the image (is|appears|seems) (unclear|blurry|dark|ambiguous)[^.]*\.)",
        r"(?i)(this appears to be[^.]*but[^.]*\.)",
        r"(?i)(i('m| am) not (fully )?sure[^.]*\.)",
        r"(?i)(uncertain[^.]*\.)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip()
    return None


def _parse_model_json(raw: str) -> Optional[dict]:
    text = (raw or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return data if isinstance(data, dict) else None


def _aim_from_value(value: object) -> AimHint:
    if isinstance(value, str):
        try:
            return AimHint(value.strip().lower())
        except ValueError:
            return AimHint.ok
    return AimHint.ok


def _kind_from_value(value: object) -> Optional[str]:
    if not value:
        return None
    kind = str(value).strip().lower().replace(" ", "_")
    if kind in {"", "none", "null", "unknown"}:
        return None
    return kind


def _recover_broken_json(raw: str) -> tuple[str, AimHint, Optional[str]]:
    """Pull aim / kind / text out of truncated or badly escaped JSON."""
    aim = AimHint.ok
    kind = None
    aim_match = re.search(r'"aim"\s*:\s*"([^"]+)"', raw)
    if aim_match:
        aim = _aim_from_value(aim_match.group(1))
    kind_match = re.search(r'"document_kind"\s*:\s*"([^"]+)"', raw)
    if kind_match:
        kind = _kind_from_value(kind_match.group(1))
    text_match = re.search(
        r'"text"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)',
        raw,
        re.DOTALL,
    )
    if text_match:
        spoken = (
            text_match.group(1)
            .replace("\\n", " ")
            .replace('\\"', '"')
            .replace("\\t", " ")
            .strip()
        )
        if spoken:
            return spoken, aim, kind
    return "", aim, kind


def _looks_like_json(text: str) -> bool:
    stripped = text.lstrip()
    return stripped.startswith("{") and '"aim"' in stripped


def parse_model_output(raw: str) -> tuple[str, AimHint, Optional[str]]:
    """Split a model reply into spoken text, aim hint, and document kind."""
    data = _parse_model_json(raw)
    if data:
        text = str(data.get("text") or "").strip()
        # Model sometimes nests the JSON contract inside text
        if text and _looks_like_json(text):
            nested = _parse_model_json(text)
            if nested and nested.get("text"):
                text = str(nested.get("text") or "").strip()
            else:
                recovered, _, _ = _recover_broken_json(text)
                text = recovered or text
        aim = _aim_from_value(data.get("aim"))
        kind = _kind_from_value(data.get("document_kind"))
        if text and not _looks_like_json(text):
            return text, aim, kind

    recovered, aim, kind = _recover_broken_json(raw or "")
    if recovered and not _looks_like_json(recovered):
        return recovered, aim, kind

    fallback = (raw or "").strip()
    if _looks_like_json(fallback):
        return (
            "I could not finish reading that page. Hold it still and try again.",
            AimHint.hold_still,
            kind,
        )
    return fallback, AimHint.ok, None


def analyze_image(
    settings: Settings,
    image_bytes: bytes,
    mode: AnalyzeMode,
    question: Optional[str] = None,
    filename: Optional[str] = None,
    content_type: Optional[str] = None,
) -> tuple[str, Optional[str], AimHint, Optional[str], Optional[str]]:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    client = genai.Client(api_key=settings.gemini_api_key)
    mime = _guess_mime(filename, content_type)
    prompt = build_prompt(mode, question)

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime),
                types.Part.from_text(text=prompt),
            ],
        )
    ]
    config = types.GenerateContentConfig(
        temperature=0.3,
        max_output_tokens=2048,
        response_mime_type="application/json",
    )
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=config,
        )
    except Exception:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=2048,
            ),
        )

    raw = (response.text or "").strip()
    text, aim_hint, document_kind = parse_model_output(raw)
    if not text:
        text = (
            "I could not produce a clear reading of this page. "
            "Move closer to the document, add light, and try again."
        )
        if aim_hint == AimHint.ok:
            aim_hint = AimHint.no_subject

    aim_instruction = AIM_COACHING.get(aim_hint) or None
    if aim_hint == AimHint.ok:
        aim_instruction = None

    return text, extract_confidence_note(text), aim_hint, aim_instruction, document_kind
