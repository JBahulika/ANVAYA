from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class AnalyzeMode(str, Enum):
    simple = "simple"
    detailed = "detailed"
    alert = "alert"
    read = "read"
    ask = "ask"
    explain = "explain"
    simplify = "simplify"


class AnalyzeResponse(BaseModel):
    text: str = Field(..., description="Accessible response for the user")
    mode: AnalyzeMode
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
