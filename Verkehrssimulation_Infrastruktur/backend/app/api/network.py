from fastapi import APIRouter
from pathlib import Path
from app.services.network_parser import parse_lanes_to_geojson

router = APIRouter(prefix="/api")

@router.get("/network/lanes")
def get_network_lanes():
    net_path = Path("backend/data/networks/crossing_2x2.net.xml")
    return parse_lanes_to_geojson(net_path)
