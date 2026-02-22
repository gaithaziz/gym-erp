from typing import List, cast
from pydantic import AnyHttpUrl, PostgresDsn, computed_field
from pydantic_core import MultiHostUrl
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Application
    PROJECT_NAME: str = "Gym ERP"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    KIOSK_SIGNING_KEY: str | None = None
    KIOSK_TOKEN_EXPIRE_MINUTES: int = 60
    GYM_TIMEZONE: str = "UTC"

    # Validation
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = []

    # Notifications
    WHATSAPP_ENABLED: bool = False
    WHATSAPP_DRY_RUN: bool = True
    WHATSAPP_PROVIDER: str = "mock"
    WHATSAPP_API_URL: str | None = None
    WHATSAPP_API_TOKEN: str | None = None
    WHATSAPP_TIMEOUT_SECONDS: int = 10

    # Database
    POSTGRES_HOST: str
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str

    @computed_field
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        return cast(PostgresDsn, MultiHostUrl.build(
            scheme="postgresql+asyncpg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_HOST,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        ))

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

settings = Settings()  # type: ignore
