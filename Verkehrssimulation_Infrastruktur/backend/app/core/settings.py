# backend/app/core/settings.py
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    DB_DSN: str = "postgresql://masteruser:masterpass@postgres:5432/traffic_data"

    # ✅ STRING aus ENV → List[str] parsen
    CORS_ORIGINS: str = "http://localhost:5173"

    SIM_UPDATE_INTERVAL: float = 1.0
    USE_SUMO: bool = True
    SUMO_HOST: str = "sumo"
    SUMO_PORT: int = 8813

    def cors_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

settings = Settings()

