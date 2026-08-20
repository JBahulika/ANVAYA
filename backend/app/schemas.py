from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class AnalyzeMode(str, Enum):
    auto = "auto"
    simple = "simple"
    detailed = "detailed"
    alert = "alert"
    read = "read"
    ask = "ask"
    explain = "explain"
    simplify = "simplify"


class AimHint(str, Enum):
    ok = "ok"
    move_closer = "move_closer"
    more_light = "more_light"
    hold_still = "hold_still"
    no_subject = "no_subject"


class AnalyzeResponse(BaseModel):
    text: str = Field(..., description="Accessible response for the user")
    mode: AnalyzeMode
    aim_hint: AimHint = Field(
        AimHint.ok,
        description="Whether the photo is usable or the user should recapture",
    )
    aim_instruction: Optional[str] = Field(
        None,
        description="Spoken recapture coaching when aim_hint is not ok",
    )
    confidence_note: Optional[str] = Field(
        None, description="Uncertainty or clarity note when relevant"
    )
    disclaimer: str = Field(
        ...,
        description="Safety / responsibility disclaimer",
    )


class HealthResponse(BaseModel):
    status: str
    gemini_configured: bool
    model: str
