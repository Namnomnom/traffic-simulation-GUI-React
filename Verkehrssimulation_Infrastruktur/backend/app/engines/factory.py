# backend/app/engines/factory.py
from app.core.settings import settings
from .engine_base import SimulationEngine
from .mock_engine import MockSimulationEngine
from .sumo_engine import SumoEngine


def create_engine() -> SimulationEngine:
    """
    Wählt anhand der Settings die passende Simulations-Engine aus.
    """
    if settings.USE_SUMO:
        return SumoEngine()

    return MockSimulationEngine()

