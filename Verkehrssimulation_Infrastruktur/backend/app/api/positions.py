# backend/app/api/positions.py
from fastapi import APIRouter, Request

router = APIRouter()

@router.get("/")
def get_positions(request: Request):
    sumo = request.app.state.sumo

    # Wenn Simulation nicht geladen ist, lieber sauber "leer + Status" zurückgeben
    st = sumo.state()
    if not st.sim_loaded:
        return {
            "vehicles": [],
            "sim_loaded": False,
            "running": st.running,
            "paused": st.paused,
            "last_error": st.last_error,
        }

    # Connection aus dem SumoManager
    conn = getattr(sumo, "_conn", None)
    if conn is None:
        return {
            "vehicles": [],
            "sim_loaded": False,
            "running": st.running,
            "paused": st.paused,
            "last_error": "TraCI connection is None",
        }

    ids = conn.vehicle.getIDList()

    vehicles = []
    for vid in ids:
        x, y = conn.vehicle.getPosition(vid)
        angle = conn.vehicle.getAngle(vid)
        speed = conn.vehicle.getSpeed(vid)
        vehicles.append(
            {
                "id": vid,
                "x": x,
                "y": y,
                "angle": angle,
                "speed_mps": speed,
            }
        )

    return {
        "vehicles": vehicles,
        "sim_loaded": True,
        "running": st.running,
        "paused": st.paused,
        "last_error": st.last_error,
    }
