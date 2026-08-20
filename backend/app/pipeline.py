"""Gemini multimodal pipeline with mode-specific accessibility prompts."""

from __future__ import annotations

import json
import re
from typing import Optional

from google import genai
from google.genai import types

from .config import Settings
from .schemas import AimHint, AnalyzeMode

DISCLAIMER = (
    "Photo is processed and not stored. Not medical advice. Not a safety system."
)

AIM_COACHING: dict[AimHint, str] = {
    AimHint.ok: "",
    AimHint.move_closer: "Too far or off-frame. Move closer and tap again.",
    AimHint.more_light: "Too dark. Face a light and tap again.",
    AimHint.hold_still: "Blurry. Hold still and tap again.",
    AimHint.no_subject: "Nothing clear in view. Point at the page or object and tap again.",
}

SHARED_RULES = """
You are ANVAYA, a multimodal AI accessibility copilot for people who may not see the image.
Turn visual information into what they need to know right now — not a list of objects.

Always follow these rules:
1. Lead with the single most useful fact (amount, date, hazard, what it is).
2. Keep the answer to 1–3 short spoken sentences unless the mode is detailed.
3. If the photo is blurry, dark, too far, or empty, set aim accordingly and still share anything useful.
4. Never give personalized medical advice or change dosage. For medicine labels, only read what is visible.
5. Do not invent text that is not visible.
6. Include currency, dates, names, or amounts when they matter.
7. Do not include disclaimers; the app adds those.
8. Do not use markdown headings.
"""

JSON_CONTRACT = """
Respond with JSON only, no markdown fences:
{
  "aim": "ok" | "move_closer" | "more_light" | "hold_still" | "no_subject",
  "text": "spoken answer"
}

aim:
- ok: subject is clear enough to answer
- move_closer: too far, cropped, or off-center
- more_light: too dark to trust
- hold_still: motion blur
- no_subject: no readable document, object, or scene
"""

MODE_INSTRUCTIONS: dict[AnalyzeMode, str] = {
    AnalyzeMode.auto: """
Mode: AUTO
Infer the job from the image.
If it is a document, bill, sign, label, or printed text: behave like READ (facts first).
If it is a hallway, stairs, street, doorway, or space: behave like ALERT (orientation).
If the user asked a question, answer that question from what is visible.
1–3 short sentences.
""",
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
Extract the important visible text.
Lead with key facts (amounts, deadlines, titles, warnings).
Then one brief extra line only if useful.
Do not dump every word unless the content is short.
""",
    AnalyzeMode.ask: """
Mode: ASK
Answer the user's question about the image using only what you can see.
If the answer is not visible, say so.
""",
    AnalyzeMode.explain: """
Mode: EXPLAIN
Explain what the user is looking at so they understand it.
For documents/forms: what it is, what it asks for, what matters.
For objects/signs: purpose and key meaning.
Keep it speakable.
""",
    AnalyzeMode.simplify: """
Mode: SIMPLIFY
Convert dense visible information into plain language.
Use short sentences. Prefer "First / Then / Finally" for instructions.
""",
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


def parse_model_output(raw: str) -> tuple[str, AimHint]:
    """Split a model reply into spoken text and an aim hint."""
    data = _parse_model_json(raw)
    if data:
        text = str(data.get("text") or "").strip()
        aim = _aim_from_value(data.get("aim"))
        if text:
            return text, aim

    fallback = (raw or "").strip()
    return fallback, AimHint.ok


def analyze_image(
    settings: Settings,
    image_bytes: bytes,
    mode: AnalyzeMode,
    question: Optional[str] = None,
    filename: Optional[str] = None,
    content_type: Optional[str] = None,
) -> tuple[str, Optional[str], AimHint, Optional[str]]:
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
        max_output_tokens=1024,
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
                max_output_tokens=1024,
            ),
        )

    raw = (response.text or "").strip()
    text, aim_hint = parse_model_output(raw)
    if not text:
        text = (
            "I could not produce a clear reading of this image. "
            "Please try again with better lighting or a closer capture."
        )
        if aim_hint == AimHint.ok:
            aim_hint = AimHint.no_subject

    aim_instruction = AIM_COACHING.get(aim_hint) or None
    if aim_hint == AimHint.ok:
        aim_instruction = None

    return text, extract_confidence_note(text), aim_hint, aim_instruction
