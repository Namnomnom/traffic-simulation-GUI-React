# backend/app/services/sim.py
import time
import math
from typing import Dict, Any, List, TypedDict


# ----------------------------
# Hilfsfunktionen (Geometrie)
# ----------------------------

def haversine_m(p1: Dict[str, float], p2: Dict[str, float]) -> float:
    R = 6371000.0
    lat1, lon1 = math.radians(p1["lat"]), math.radians(p1["lon"])
    lat2, lon2 = math.radians(p2["lat"]), math.radians(p2["lon"])
    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def compute_heading_deg(p1: Dict[str, float], p2: Dict[str, float]) -> float:
    dy = p2["lat"] - p1["lat"]
    dx = p2["lon"] - p1["lon"]
    angle = math.degrees(math.atan2(dx, dy))
    if angle < 0:
        angle += 360
    return angle


class RoutePoint(TypedDict):
    lat: float
    lon: float


class VehicleState(TypedDict, total=False):
    id: int
    type: str

    lat: float
    lon: float
    speed_mps: float
    heading: float

    max_speed_mps: float
    accel_mps2: float
    decel_mps2: float

    route: List[RoutePoint]
    segment: int
    progress: float


class MockSimulationEngine:
    """
    Mock-Engine – getrennt vom SUMO-Lifecycle.
    Diese Engine NICHT global beim Import instanziieren!
    """

    def __init__(self) -> None:
        self.vehicles: List[VehicleState] = []
        self._last_step = 0.0
        self.running = False

    def _ensure_initialized(self) -> None:
        if self.vehicles:
            return

        route1: List[RoutePoint] = [
            {"lat": 52.268872, "lon": 10.526857},
            {"lat": 52.269250, "lon": 10.526950},
            {"lat": 52.269620, "lon": 10.527120},
            {"lat": 52.269980, "lon": 10.527380},
        ]

        route2: List[RoutePoint] = [
            {"lat": 52.268740, "lon": 10.526500},
            {"lat": 52.268980, "lon": 10.526750},
            {"lat": 52.269240, "lon": 10.527050},
            {"lat": 52.269520, "lon": 10.527320},
        ]

        self.vehicles = [
            {
                "id": 1,
                "type": "pkw",
                "route": route1,
                "segment": 0,
                "progress": 0.0,
                "lat": route1[0]["lat"],
                "lon": route1[0]["lon"],
                "speed_mps": 0.0,
                "max_speed_mps": 50 / 3.6,
                "accel_mps2": 2.0,
                "decel_mps2": 3.0,
                "heading": compute_heading_deg(route1[0], route1[1]),
            },
            {
                "id": 2,
                "type": "bus",
                "route": route2,
                "segment": 0,
                "progress": 0.0,
                "lat": route2[0]["lat"],
                "lon": route2[0]["lon"],
                "speed_mps": 0.0,
                "max_speed_mps": 40 / 3.6,
                "accel_mps2": 1.2,
                "decel_mps2": 2.0,
                "heading": compute_heading_deg(route2[0], route2[1]),
            },
        ]

        self._last_step = time.time()

    def start(self) -> None:
        self._ensure_initialized()
        self.running = True

    def stop(self) -> None:
        self.running = False

    def reset(self) -> None:
        self.vehicles = []
        self._last_step = 0.0
        self.running = False

    def _step(self) -> None:
        self._ensure_initialized()
        if not self.running:
            return

        now = time.time()
        dt = now - self._last_step

        if dt < 0.05:
            return
        if dt > 0.5:
            dt = 0.5

        self._last_step = now

        for v in self.vehicles:
            route = v["route"]
            seg = v["segment"]

            if seg >= len(route) - 1:
                v["speed_mps"] = 0.0
                continue

            p1 = route[seg]
            p2 = route[seg + 1]
            v["heading"] = compute_heading_deg(p1, p2)

            if v["speed_mps"] < v["max_speed_mps"]:
                v["speed_mps"] = min(v["speed_mps"] + v["accel_mps2"] * dt, v["max_speed_mps"])

            seg_len = haversine_m(p1, p2)
            if seg_len < 0.1:
                v["segment"] = seg + 1
                v["progress"] = 0.0
                continue

            travel = v["speed_mps"] * dt
            v["progress"] += travel / seg_len

            while v["progress"] >= 1.0 and v["segment"] < len(route) - 1:
                v["segment"] += 1
                v["progress"] -= 1.0
                seg = v["segment"]
                if seg >= len(route) - 1:
                    break
                p1 = route[seg]
                p2 = route[seg + 1]
                seg_len = haversine_m(p1, p2)
                if seg_len < 0.1:
                    continue
                v["heading"] = compute_heading_deg(p1, p2)

            if v["segment"] >= len(route) - 1:
                v["lat"] = route[-1]["lat"]
                v["lon"] = route[-1]["lon"]
                v["speed_mps"] = 0.0
                v["progress"] = 0.0
                continue

            p1 = route[v["segment"]]
            p2 = route[v["segment"] + 1]
            t = v["progress"]

            v["lat"] = p1["lat"] + t * (p2["lat"] - p1["lat"])
            v["lon"] = p1["lon"] + t * (p2["lon"] - p1["lon"])

    def get_state(self) -> Dict[str, Any]:
        self._step()

        vehicles_list = []
        for v in self.vehicles:
            vehicles_list.append(
                {
                    "id": v["id"],
                    "type": v["type"],
                    "lat": v["lat"],
                    "lon": v["lon"],
                    "speed": round(v["speed_mps"] * 3.6, 1),
                    "heading": round(v["heading"], 1),
                }
            )

        return {"vehicles": vehicles_list}


def create_mock_engine() -> MockSimulationEngine:
    """
    Factory: Damit du eine Instanz gezielt im Startup erstellen kannst,
    statt beim Import.
    """
    return MockSimulationEngine()
