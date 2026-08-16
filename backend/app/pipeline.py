"""Gemini multimodal pipeline with mode-specific accessibility prompts."""

from __future__ import annotations

import re
from typing import Optional

from google import genai
from google.genai import types

from .config import Settings
from .schemas import AnalyzeMode

DISCLAIMER = (
    "AI interpretations can contain errors. Do not rely on AccessLens for "
    "medical advice, guaranteed hazard detection, or legal decisions."
)

SHARED_RULES = """
You are AccessLens, a multimodal AI accessibility copilot.
Your job: turn visual information into clear, useful, actionable understanding.

Always follow these rules:
1. Prioritize what the user needs to know — not every visible object.
2. If the image is blurry, dark, or ambiguous, say so clearly and share what you can.
3. Never give personalized medical advice or change dosage instructions. For medicine labels, only read what is visible.
4. For hazards, be calm and direct, and remember detection can be imperfect.
5. Use plain language unless the mode asks for more detail.
6. Prefer short spoken-friendly sentences.
7. If currency, dates, names, or amounts are visible and important, include them.
8. Do not invent text that is not visible on the image.
"""

MODE_INSTRUCTIONS: dict[AnalyzeMode, str] = {
    AnalyzeMode.simple: """
Mode: SIMPLE
Give a short, easy-to-understand answer (1–3 sentences).
Focus on what this is and the single most useful fact.
""",
    AnalyzeMode.detailed: """
Mode: DETAILED
Provide useful contextual information: what it is, key visible details,
and anything the user should notice. Keep it organized and readable aloud.
Avoid listing irrelevant background objects.
""",
    AnalyzeMode.alert: """
Mode: ALERT
Prioritize hazards and urgent information only:
stairs, obstacles, vehicles, warning signs, wet floors, open doors,
road crossings, restricted areas, emergency signs.
Lead with caution when relevant.
If nothing hazardous is apparent, say that clearly and mention one useful environmental cue.
Always imply that AI detection is imperfect and not a guaranteed safety system.
""",
    AnalyzeMode.read: """
Mode: READ
Extract and read the important visible text.
Summarize the key facts first (amounts, deadlines, titles, warnings).
Then briefly note other visible text if useful.
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
""",
    AnalyzeMode.simplify: """
Mode: SIMPLIFY
Convert dense or complex visible information into plain language steps or a short summary.
Use short sentences. Prefer "first / then / finally" for instructions.
""",
}


def build_prompt(mode: AnalyzeMode, question: Optional[str]) -> str:
    parts = [SHARED_RULES.strip(), MODE_INSTRUCTIONS[mode].strip()]
    if mode in (AnalyzeMode.ask, AnalyzeMode.explain) and question:
        parts.append(f"User question: {question.strip()}")
    elif mode == AnalyzeMode.ask and not question:
        parts.append(
            "The user did not ask a specific question. "
            "Answer: what is this, and what do they most need to know?"
        )
    elif question and mode not in (AnalyzeMode.ask, AnalyzeMode.explain):
        parts.append(f"Additional user note: {question.strip()}")

    parts.append(
        "Respond with the accessibility answer only. "
        "Do not include markdown headings unless helpful for a long document summary."
    )
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


def analyze_image(
    settings: Settings,
    image_bytes: bytes,
    mode: AnalyzeMode,
    question: Optional[str] = None,
    filename: Optional[str] = None,
    content_type: Optional[str] = None,
) -> tuple[str, Optional[str]]:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    client = genai.Client(api_key=settings.gemini_api_key)
    mime = _guess_mime(filename, content_type)
    prompt = build_prompt(mode, question)

    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime),
                    types.Part.from_text(text=prompt),
                ],
            )
        ],
        config=types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=1024,
        ),
    )

    text = (response.text or "").strip()
    if not text:
        text = (
            "I could not produce a clear reading of this image. "
            "Please try again with better lighting or a closer capture."
        )

    return text, extract_confidence_note(text)
