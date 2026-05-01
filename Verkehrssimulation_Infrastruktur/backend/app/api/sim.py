# backend/app/api/sim.py
from fastapi import APIRouter, Request, HTTPException

router = APIRouter()


@router.get("/status")
def status(request: Request):
    sumo = request.app.state.sumo
    sumo.ping()
    return sumo.state().__dict__


@router.post("/load")
def load(request: Request):
    """
    Lädt das Szenario in SUMO (traci.load).
    Muss vor start() einmal erfolgreich aufgerufen werden.
    """
    sumo = request.app.state.sumo
    try:
        sumo.load_scenario()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start")
def start(request: Request):
    """
    Startet den Step-Loop (Simulation läuft).
    Voraussetzung: sim_loaded == True
    """
    sumo = request.app.state.sumo
    try:
        sumo.start()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/pause")
def pause(request: Request):
    sumo = request.app.state.sumo
    try:
        sumo.pause()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/stop")
def stop(request: Request):
    sumo = request.app.state.sumo
    sumo.stop()
    return {"ok": True}


@router.post("/reset")
def reset(request: Request):
    """
    Reset = Stop + Szenario neu laden (frischer Zustand)
    """
    sumo = request.app.state.sumo
    try:
        sumo.reset()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
