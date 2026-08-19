from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Gemini (OpenAI-compatible endpoint)
    gemini_api_key: str
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    gemini_model: str = "gemini-3.7-flash"

    # Document AI
    gcp_project_id: str
    docai_location: str = "eu"
    docai_processor_id: str


settings = Settings()