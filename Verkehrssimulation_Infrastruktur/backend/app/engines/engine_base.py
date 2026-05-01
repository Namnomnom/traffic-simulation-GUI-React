# backend/app/engines/engine_base.py
from abc import ABC, abstractmethod
from typing import Any, Dict

class SimulationEngine(ABC):
    """Gemeinsame Schnittstelle für alle Engines (mock / sumo)."""

    @abstractmethod
    def start(self) -> None: ...

    @abstractmethod
    def stop(self) -> None: ...

    @abstractmethod
    def reset(self) -> None: ...

    @abstractmethod
    def get_state(self) -> Dict[str, Any]: ...

    # optional: falls du später tickst
    def step(self, dt: float) -> None:
        return
