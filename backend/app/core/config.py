from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RECEIPTIQ_", env_file=".env")

    database_url: str = "sqlite:///./receiptiq.sqlite3"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    receipt_originals_dir: str = "../data/receipts/originals"
    ocr_cache_dir: str = "../data/ocr"
    max_receipt_file_size: int = 25 * 1024 * 1024


settings = Settings()
