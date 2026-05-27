from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    LOG_LEVEL: str = "INFO"

    LLM_PROVIDER: Literal["openai", "openrouter", "groq", "ollama"] = "openrouter"

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4-turbo"

    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "openai/gpt-3.5-turbo"

    GROQ_API_KEY: str = ""

    OLLAMA_BASE_URL: str = "http://localhost:11434"

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/agent_db"
    REDIS_URL: str = "redis://localhost:6379"


settings = Settings()
