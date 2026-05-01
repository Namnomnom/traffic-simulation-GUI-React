# app/services/sumo_engine.py
from __future__ import annotations

from typing import Any, Dict, Optional
import threading
import time

import traci

from app.core.settings import settings
from .engine_base import SimulationEngine


class SumoEngine(SimulationEngine):
    """
    SUMO Engine (Option B: Geo + moveToXY)

    Ziele:
    - SUMO bleibt dauerhaft am Leben (Container läuft)
    - TraCI Verbindung bleibt bestehen (stop pausiert nur)
    - Fahrzeuge werden per API/GUI via TraCI hinzugefügt/entfernt
    - get_state() liefert Positionen als lat/lon (convertGeo)
    """

    def __init__(self) -> None:
        self._conn: Optional[traci.connection.Connection] = None
        self.running: bool = False
        self._lock = threading.Lock()

    # ---------------- helpers ----------------

    def _safe_close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

    def _connect_with_retries(self) -> None:
        last_err: Optional[Exception] = None
        retries = 40
        delay_s = 0.5

        for _ in range(retries):
            try:
                self._conn = traci.connect(
                    host=settings.SUMO_HOST,
                    port=settings.SUMO_PORT,
                    numRetries=1,
                )
                return
            except Exception as e:
                last_err = e
                self._conn = None
                time.sleep(delay_s)

        raise RuntimeError(f"TraCI connect failed after {retries} retries: {last_err}")

    def _ensure_connected(self) -> None:
        if self._conn is None:
            self._connect_with_retries()

    def _ensure_alive(self) -> bool:
        """
        Falls SUMO doch gestorben ist, merken wir das beim Step/Get.
        In dem Fall Connection droppen und running=False setzen.
        """
        if self._conn is None:
            return False
        return True

    def _to_sumo_xy(self, lat: float, lon: float) -> tuple[float, float]:
        """
        Geo (lat/lon) -> SUMO (x/y).
        Je nach SUMO/TraCI Version klappt keyword fromGeo oder nur positional.
        """
        self._ensure_connected()
        assert self._conn is not None

        # convertGeo erwartet (x, y) und liefert (lon, lat) wenn fromGeo=False
        # wenn fromGeo=True, geben wir (lon, lat) rein und bekommen (x, y) raus.
        try:
            x, y = self._conn.simulation.convertGeo(lon, lat, fromGeo=True)  # type: ignore
            return float(x), float(y)
        except TypeError:
            # ältere API: 3. Parameter positional
            x, y = self._conn.simulation.convertGeo(lon, lat, True)  # type: ignore
            return float(x), float(y)
        except Exception:
            # Fallback: wenn kein Geo-Proj aktiv ist, behandeln wir lon/lat als x/y
            return float(lon), float(lat)

    def _to_geo_latlon(self, x: float, y: float) -> tuple[float, float]:
        self._ensure_connected()
        assert self._conn is not None
        try:
            lon, lat = self._conn.simulation.convertGeo(x, y)
            return float(lat), float(lon)
        except Exception:
            return float(y), float(x)

    # ---------------- interface ----------------

    def start(self) -> None:
        """
        Start = Simulation läuft weiter (wir steppen bei get_state()).
        """
        with self._lock:
            self._ensure_connected()
            self.running = True

    def stop(self) -> None:
        """
        Stop = Pause. Verbindung bleibt bestehen.
        """
        with self._lock:
            self.running = False

    def reset(self) -> None:
        """
        Reset = Connection schließen (hart).
        (Später kann man hier auch "reload" machen, aber MVP: reconnect)
        """
        with self._lock:
            self.running = False
            self._safe_close()

    # ---------------- Option B: Vehicles via TraCI ----------------

    def add_vehicle_geo(
        self,
        vehicle_id: str,
        lat: float,
        lon: float,
        speed_kmh: float = 30.0,
        vtype: str = "car",
        route_id: str = "r0",
    ) -> Dict[str, Any]:
        """
        Erzeugt ein Fahrzeug in SUMO und setzt es per moveToXY auf lat/lon.

        Wichtig:
        - SUMO braucht eine Route, daher route_id="r0" (Dummy Route in routes.rou.xml).
        - Wir positionieren danach via moveToXY.
        """
        with self._lock:
            self._ensure_connected()
            assert self._conn is not None

            vid = vehicle_id  # du kannst auch prefixen: f"veh{vehicle_id}"

            # Wenn schon vorhanden: erst entfernen (idempotent)
            try:
                if vid in self._conn.vehicle.getIDList():
                    self._conn.vehicle.remove(vid)
            except Exception:
                pass

            # 1) Vehicle anlegen
            # depart="0" heißt: sofort verfügbar. Wir wollen aber direkt positionieren -> ok.
            self._conn.vehicle.add(vid, route_id, typeID=vtype, depart="0")

            # 2) Auf Koordinate setzen
            x, y = self._to_sumo_xy(lat, lon)

            # moveToXY: lane/edge können leer bleiben; keepRoute=2 ist robust (ignoriert Route-Constraints)
            # je nach SUMO Version: keepRoute Parameter kann positional/keyword sein
            try:
                self._conn.vehicle.moveToXY(vid, edgeID="", lane=0, x=x, y=y, angle=0.0, keepRoute=2)
            except TypeError:
                self._conn.vehicle.moveToXY(vid, "", 0, x, y, 0.0, 2)

            # 3) Geschwindigkeit setzen (m/s)
            try:
                self._conn.vehicle.setSpeed(vid, float(speed_kmh) / 3.6)
            except Exception:
                pass

            return {"rawId": vid, "lat": lat, "lon": lon, "speedKmh": speed_kmh}

    def remove_vehicle(self, vehicle_id: str) -> None:
        with self._lock:
            self._ensure_connected()
            assert self._conn is not None
            try:
                self._conn.vehicle.remove(vehicle_id)
            except Exception:
                pass

    # ---------------- state ----------------

    def get_state(self) -> Dict[str, Any]:
        with self._lock:
            # Wenn nicht running: keine Steps, aber wir können trotzdem Positionsdaten liefern,
            # falls du im Pause-Modus trotzdem anzeigen willst.
            try:
                self._ensure_connected()
            except Exception:
                self._safe_close()
                self.running = False
                return {"vehicles": [], "timeSec": 0.0, "error": "traci_connect_failed"}

            if self._conn is None or not self._ensure_alive():
                self.running = False
                return {"vehicles": [], "timeSec": 0.0, "error": "no_connection"}

            # Step nur wenn running
            if self.running:
                try:
                    self._conn.simulationStep()
                except Exception:
                    # typischer Fall: SUMO ist beendet -> connection closed
                    self._safe_close()
                    self.running = False
                    return {"vehicles": [], "timeSec": 0.0, "error": "simulation_step_failed"}

            # Zeit holen (geht nur wenn conn ok)
            try:
                sim_time = float(self._conn.simulation.getTime())
            except Exception:
                sim_time = 0.0

            # Fahrzeugliste
            vehicles: list[Dict[str, Any]] = []
            try:
                ids = self._conn.vehicle.getIDList()
            except Exception:
                ids = []

            for vid in ids:
                try:
                    x, y = self._conn.vehicle.getPosition(vid)
                    speed_ms = self._conn.vehicle.getSpeed(vid)
                    angle = self._conn.vehicle.getAngle(vid)
                except Exception:
                    continue

                lat, lon = self._to_geo_latlon(x, y)

                vehicles.append(
                    {
                        "rawId": vid,
                        "lat": float(lat),
                        "lon": float(lon),
                        "speedKmh": float(speed_ms * 3.6),
                        "headingDeg": float(angle),
                    }
                )

            return {"vehicles": vehicles, "timeSec": sim_time, "running": self.running}
