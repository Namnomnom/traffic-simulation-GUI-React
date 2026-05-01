# backend/app/engines/__init__.py
from .factory import create_engine

_engine_instance = None


def get_engine():
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = create_engine()
    return _engine_instance
