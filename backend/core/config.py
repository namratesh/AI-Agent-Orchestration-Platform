"""
Application settings loaded from environment variables and an optional .env file.

All configuration is centralised here via Pydantic BaseSettings so that:
  - Values can be overridden per-environment without code changes.
  - Missing required secrets surface as clear validation errors at startup.
  - Type coercion (e.g. comma-separated lists) is handled automatically.

Sensitive fields (API keys, tokens) default to empty strings so the platform
starts safely in local development without any credentials configured.
"""
from typing import List, Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Platform-wide configuration.

    Loaded from the process environment and an optional ``.env`` file in the
    current working directory.  Unknown env vars are silently ignored so
    container environments with extra variables do not break startup.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"

    # ── Auth — leave empty to disable (safe for fully local deployments) ──────
    API_SECRET_KEY: str = ""

    # ── CORS — comma-separated list of allowed origins ────────────────────────
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # ── LLM provider selection ────────────────────────────────────────────────
    LLM_PROVIDER: Literal["openai", "openrouter", "groq", "ollama"] = "openrouter"

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4-turbo"

    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "openai/gpt-3.5-turbo"

    GROQ_API_KEY: str = ""

    OLLAMA_BASE_URL: str = "http://localhost:11434"

    # ── Tool integrations ─────────────────────────────────────────────────────
    TAVILY_API_KEY: str = ""

    # ── Encryption — required when tools store API keys in the database ───────
    TOOL_ENCRYPTION_KEY: str = ""

    # ── Messaging ─────────────────────────────────────────────────────────────
    TELEGRAM_BOT_TOKEN: str = ""

    # ── Infrastructure ────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/agent_db"
    REDIS_URL: str = "redis://localhost:6379"


settings = Settings()
