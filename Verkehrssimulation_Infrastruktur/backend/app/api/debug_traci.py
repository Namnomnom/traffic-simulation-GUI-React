# backend/app/api/debug_traci.py
from fastapi import APIRouter, Request

router = APIRouter()

@router.get("/traci")
def traci_debug(request: Request):
    sumo = request.app.state.sumo

    # Nutze Snapshot, falls vorhanden (besser, weil cache + stabil)
    try:
        snap = sumo.traci_snapshot()
        st = sumo.state()
        return {
            "ok": True,
            "state": st.__dict__,
            **snap,
        }
    except Exception as e:
        # Fallback: direkte _conn Abfrage (wie vorher)
        conn = getattr(sumo, "_conn", None)
        if conn is None:
            return {"ok": False, "error": "No _conn on app.state.sumo"}

        try:
            sim_time = conn.simulation.getTime()
            id_list = conn.vehicle.getIDList()
            loaded = conn.simulation.getLoadedIDList()
            departed = conn.simulation.getDepartedIDList()
            arrived = conn.simulation.getArrivedIDList()
        except Exception as e2:
            return {"ok": False, "error": f"TraCI calls failed: {e2}"}

        return {
            "ok": True,
            "warn": f"snapshot_failed: {e}",
            "sim_time": sim_time,
            "vehicle_id_list": id_list,
            "loaded": loaded,
            "departed": departed,
            "arrived": arrived,
        }
