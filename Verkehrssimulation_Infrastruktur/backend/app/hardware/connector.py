# backend/app/hardware/connector.py
from typing import Any, Dict, Optional
from app.core.settings import settings

class HardwareConnector:
    def __init__(self) -> None:
        self.connected: bool = False
        self.last_error: Optional[str] = None
        self.endpoint: Optional[str] = None

    def connect(self, endpoint: str) -> None:
        self.endpoint = endpoint
        self.connected = False
        self.last_error = "not implemented"

    def disconnect(self) -> None:
        self.connected = False

    def status(self) -> Dict[str, Any]:
        return {
            "enabled": getattr(settings, "HARDWARE_ENABLED", False),
            "connected": self.connected,
            "endpoint": self.endpoint,
            "last_error": self.last_error,
        }

hardware = HardwareConnector()
