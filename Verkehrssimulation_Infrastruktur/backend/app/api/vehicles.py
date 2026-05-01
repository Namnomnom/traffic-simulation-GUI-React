# backend/app/api/vehicles.py
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from app.core.db import get_conn

router = APIRouter()


@router.get("/")
def list_vehicles():
    with get_conn().cursor() as cur:
        cur.execute("SELECT id, name, type FROM public.vehicle ORDER BY id;")
        rows = cur.fetchall()
    return [{"id": r[0], "name": r[1], "type": r[2]} for r in rows]


class VehicleAddIn(BaseModel):
    veh_id: str
    route_id: str
    depart: float = 0.0


@router.post("/add-to-sumo")
def add_vehicle_to_sumo(payload: VehicleAddIn, request: Request):
    sumo = request.app.state.sumo
    try:
        info = sumo.add_vehicle(payload.veh_id, payload.route_id, payload.depart)
        return {"ok": True, **info}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class VehicleRemoveIn(BaseModel):
    veh_id: str


@router.post("/remove-from-sumo")
def remove_vehicle_from_sumo(payload: VehicleRemoveIn, request: Request):
    sumo = request.app.state.sumo
    try:
        sumo.remove_vehicle(payload.veh_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
