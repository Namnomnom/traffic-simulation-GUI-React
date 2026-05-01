# backend/app/main.py
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware

from app.sumo_manager import SumoManager

# API-Router
from app.api.sim import router as sim_router
from app.api.positions import router as positions_router
from app.api.vehicles import router as vehicles_router
from app.api.hardware import router as hardware_router
from app.api.debug_traci import router as debug_traci_router  # 👈 neu
from app.api.scenarios import router as scenarios_router

# -----------------------------------------------------------------------------
# ENV
# -----------------------------------------------------------------------------
TRACI_HOST = os.getenv("TRACI_HOST", "sumo")
TRACI_PORT = int(os.getenv("TRACI_PORT", "8813"))

SUMO_SCENARIO_CFG = os.getenv("SUMO_SCENARIO_CFG", "/config/config.sumocfg")
SUMO_DUMMY_CFG = os.getenv("SUMO_DUMMY_CFG", "").strip() or None

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]

# -----------------------------------------------------------------------------
# SumoManager (Singleton)
# -----------------------------------------------------------------------------
sumo_manager = SumoManager(
    host=TRACI_HOST,
    port=TRACI_PORT,
    scenario_sumocfg=SUMO_SCENARIO_CFG,
    dummy_sumocfg=SUMO_DUMMY_CFG,
)

# -----------------------------------------------------------------------------
# App Lifecycle
# -----------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup:
      - Nur TraCI verbinden
      - KEIN Simulation-Load
    Shutdown:
      - Stepper sauber stoppen
    """
    try:
        sumo_manager.connect()
    except Exception:
        # absichtlich nicht crashen
        pass

    app.state.sumo = sumo_manager

    yield

    try:
        sumo_manager.stop()
    except Exception:
        pass


# -----------------------------------------------------------------------------
# FastAPI App
# -----------------------------------------------------------------------------
app = FastAPI(
    title="Traffic Simulation Backend",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# API Router
# -----------------------------------------------------------------------------
api = APIRouter(prefix="/api")

api.include_router(sim_router, prefix="/simulation", tags=["simulation"])
api.include_router(positions_router, prefix="/positions", tags=["positions"])
api.include_router(vehicles_router, prefix="/vehicles", tags=["vehicles"])
api.include_router(hardware_router, prefix="/hardware", tags=["hardware"])
api.include_router(debug_traci_router, prefix="/debug", tags=["debug"])  
api.include_router(scenarios_router, prefix="/scenarios", tags=["scenarios"])


# -----------------------------------------------------------------------------
# Status Endpoint (Frontend)
# -----------------------------------------------------------------------------
@api.get("/sumo/status", tags=["hardware"])
def sumo_status():
    """
    Frontend nutzt das für Button-Zustände
    """
    sumo_manager.ping()
    return sumo_manager.state().__dict__


app.include_router(api)

# -----------------------------------------------------------------------------
# Root
# -----------------------------------------------------------------------------
@app.get("/")
def root():
    return {"message": "Traffic Simulation Backend is running 🚦"}
