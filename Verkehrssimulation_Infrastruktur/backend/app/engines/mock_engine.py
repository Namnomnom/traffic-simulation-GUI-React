# backend/app/engines/mock_engine.py
from typing import Any, Dict, List
from .engine_base import SimulationEngine

class MockSimulationEngine(SimulationEngine):
    def __init__(self) -> None:
        self.running = False
        self.vehicles: List[Dict[str, Any]] = []

    def start(self) -> None:
        self.running = True

    def stop(self) -> None:
        self.running = False

    def reset(self) -> None:
        self.running = False
        self.vehicles = []

    def get_state(self) -> Dict[str, Any]:
        return {
            "engine": "mock",
            "running": self.running,
            "vehicles": self.vehicles,
        }
