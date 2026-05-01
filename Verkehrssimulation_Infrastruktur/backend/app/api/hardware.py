# app/api/hardware.py
from fastapi import APIRouter
from app.hardware.connector import hardware

router = APIRouter(prefix="/hardware", tags=["hardware"])

@router.get("/status")
def hardware_status():
    return hardware.status()

