from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    tavily_api_key: str = ""
    tavily_search_depth: str = "basic"
    tavily_fetch_size: int = 8
    max_claims: int = 6
    web_results_per_claim: int = 3
    web_results_cap: int = 5
    factcheck_timeout_seconds: float = 118.0
    max_concurrent_searches: int = 4
    search_cache_ttl_seconds: int = 3600
    search_cache_pool_size: int = 8
    max_pdf_chars: int = 10000
    max_snippet_chars: int = 320
    cache_ttl_seconds: int = 1200

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
