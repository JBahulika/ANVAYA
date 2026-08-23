from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Always load backend/.env even if uvicorn is started from another directory
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    max_image_bytes: int = 8 * 1024 * 1024  # 8 MB
    environment: str = "development"
    rate_limit_per_minute: int = 10
    rate_limit_per_hour: int = 40
    rate_limit_per_day: int = 100
    # Process-wide Gemini budget so rotating IPs cannot drain the key
    global_daily_analyze_limit: int = 100
    max_concurrent_analyze: int = 2

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"


def get_settings() -> Settings:
    # Re-read each call so backend/.env edits apply without a full process restart
    return Settings()
