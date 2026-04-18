"""Application settings, loaded from environment variables."""
from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All application configuration, pulled from .env or the environment."""

    # MongoDB
    mongo_url: str = Field(alias="MONGO_URL")
    db_name: str = Field(default="cashflow_pilot", alias="DB_NAME")

    # Auth
    jwt_secret: str = Field(alias="JWT_SECRET")
    jwt_access_ttl_minutes: int = Field(default=60, alias="JWT_ACCESS_TTL_MINUTES")
    jwt_refresh_ttl_days: int = Field(default=7, alias="JWT_REFRESH_TTL_DAYS")
    cookie_secure: bool = Field(default=False, alias="COOKIE_SECURE")
    cookie_samesite: str = Field(default="lax", alias="COOKIE_SAMESITE")
    cookie_domain: str = Field(default="", alias="COOKIE_DOMAIN")

    # CORS
    cors_origins: str = Field(default="http://localhost:5173", alias="CORS_ORIGINS")

    # AI
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-opus-4-7", alias="ANTHROPIC_MODEL")
    ai_suggestions_cache_ttl_seconds: int = Field(default=3600, alias="AI_SUGGESTIONS_CACHE_TTL_SECONDS")

    # Email
    resend_api_key: str = Field(default="", alias="RESEND_API_KEY")
    resend_from_email: str = Field(default="noreply@example.com", alias="RESEND_FROM_EMAIL")
    resend_from_name: str = Field(default="CashFlow Pilot", alias="RESEND_FROM_NAME")

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent.parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def email_enabled(self) -> bool:
        return bool(self.resend_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
