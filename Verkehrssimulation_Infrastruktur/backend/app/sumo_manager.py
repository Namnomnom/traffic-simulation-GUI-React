# backend/app/sumo_manager.py
import threading
import time
from dataclasses import dataclass
from typing import Optional, List, Dict

import traci


@dataclass
class SumoState:
    traci_ready: bool = False
    sim_loaded: bool = False
    running: bool = False
    paused: bool = True
    last_error: Optional[str] = None


class SumoManager:
    """
    Stabiler SUMO/TaCI Manager:
    - hält genau eine TraCI-Connection in self._conn
    - Stepper-Thread läuft nur wenn sim_loaded & running & not paused
    - Throttle: max_steps_per_second verhindert "sim_time explodiert"
    - Event-Cache: departed/arrived bleiben sichtbar (Debug)
    - WICHTIG: ping() reconnectet NICHT automatisch wenn sim_loaded=True
      (sonst verlierst du Simulation-Status)
    """

    def __init__(
        self,
        host: str,
        port: int,
        scenario_sumocfg: str,
        dummy_sumocfg: str | None = None,
        max_steps_per_second: float = 20.0,
        event_cache_size: int = 200,
    ):
        self.host = host
        self.port = port
        self.scenario_sumocfg = scenario_sumocfg
        self.dummy_sumocfg = dummy_sumocfg

        self.max_steps_per_second = float(max_steps_per_second)
        self._step_interval = 1.0 / self.max_steps_per_second if self.max_steps_per_second > 0 else 0.0

        self._lock = threading.RLock()
        self._state = SumoState()

        self._conn: Optional[traci.connection.Connection] = None

        self._stop_stepper = False
        self._stepper_thread: Optional[threading.Thread] = None

        self._departed_cache: List[str] = []
        self._arrived_cache: List[str] = []
        self._event_cache_size = int(event_cache_size)

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------
    def connect(self, retries: int = 40, sleep_s: float = 0.5) -> None:
        last = None
        for _ in range(retries):
            try:
                conn = traci.connect(host=self.host, port=self.port)
                with self._lock:
                    self._conn = conn
                    self._state.traci_ready = True
                    self._state.last_error = None
                return
            except Exception as e:
                last = e
                time.sleep(sleep_s)

        with self._lock:
            self._conn = None
            self._state.traci_ready = False
            self._state.last_error = f"TraCI connect failed: {last}"
        raise RuntimeError(self._state.last_error)

    def ping(self) -> bool:
        """
        Ping darf NICHT "heimlich reconnecten", wenn sim_loaded=True,
        weil reconnect = neue Connection = Simulation nicht mehr geladen.
        """
        with self._lock:
            try:
                if self._conn is None:
                    # Nur reconnect, wenn NICHT geladen
                    if self._state.sim_loaded:
                        self._mark_not_ready("TraCI connection lost while sim_loaded=True (reload required)")
                        return False
                    self._conn = traci.connect(host=self.host, port=self.port)

                _ = self._conn.getVersion()
                self._state.traci_ready = True
                self._state.last_error = None
                return True

            except Exception as e:
                self._mark_not_ready(f"TraCI not ready: {e}")
                return False

    def _mark_not_ready(self, msg: str) -> None:
        self._state.traci_ready = False
        self._state.sim_loaded = False
        self._state.running = False
        self._state.paused = True
        self._state.last_error = msg
        self._conn = None

    # ------------------------------------------------------------------
    # Simulation lifecycle
    # ------------------------------------------------------------------
    def load_scenario(self) -> None:
        with self._lock:
            self._require_traci()
            try:
                self._conn.load(["-c", self.scenario_sumocfg, "--start", "--quit-on-end", "false"])
                self._state.sim_loaded = True
                self._state.running = False
                self._state.paused = True
                self._state.last_error = None

                self._departed_cache.clear()
                self._arrived_cache.clear()
            except Exception as e:
                self._state.sim_loaded = False
                self._state.last_error = f"load_scenario failed: {e}"
                raise

    def reset(self) -> None:
        self.stop()
        self.load_scenario()

    def start(self) -> None:
        with self._lock:
            self._require_loaded()
            self._state.running = True
            self._state.paused = False
            self._state.last_error = None
        self._ensure_stepper()

    def pause(self) -> None:
        with self._lock:
            self._require_loaded()
            self._state.paused = True
            self._state.running = True

    def stop(self) -> None:
        with self._lock:
            self._state.running = False
            self._state.paused = True
            self._stop_stepper = True

        t = self._stepper_thread
        if t and t.is_alive():
            t.join(timeout=0.5)

    # ------------------------------------------------------------------
    # Vehicles
    # ------------------------------------------------------------------
    def add_vehicle(self, veh_id: str, route_id: str, depart: float = 0.0) -> Dict:
        """
        Fügt Fahrzeug hinzu und liefert Debug-Infos zurück.
        Wichtig: vehicle.add() macht das Fahrzeug oft "pending" bis depart erreicht ist.
        """
        with self._lock:
            self._require_loaded()
            conn = self._conn

            sim_time_before = conn.simulation.getTime()
            ids_before = conn.vehicle.getIDList()

            # depart float -> sauber
            conn.vehicle.add(vehID=veh_id, routeID=route_id, depart=float(depart))

            # 1 Step hilft, damit SUMO den Insert verarbeitet (optional, aber gut fürs Debug)
            conn.simulationStep()

            sim_time_after = conn.simulation.getTime()
            ids_after = conn.vehicle.getIDList()

            loaded_after = conn.simulation.getLoadedIDList()
            departed_after = conn.simulation.getDepartedIDList()
            arrived_after = conn.simulation.getArrivedIDList()

            # Cache mit pflegen
            if departed_after:
                self._departed_cache.extend(departed_after)
                self._departed_cache = self._departed_cache[-self._event_cache_size:]
            if arrived_after:
                self._arrived_cache.extend(arrived_after)
                self._arrived_cache = self._arrived_cache[-self._event_cache_size:]

            active_after = veh_id in ids_after

            return {
                "veh_id": veh_id,
                "route_id": route_id,
                "depart_effective": float(depart),
                "sim_time_before": sim_time_before,
                "sim_time_after": sim_time_after,
                "ids_before": ids_before,
                "ids_after": ids_after,
                "loaded_after": loaded_after,
                "departed_after": departed_after,
                "arrived_after": arrived_after,
                "active_after": active_after,
            }

    def remove_vehicle(self, veh_id: str) -> None:
        with self._lock:
            self._require_loaded()
            # reason=2 -> "teleport/remove immediately" (je nach SUMO-Version)
            self._conn.vehicle.remove(veh_id, reason=2)

    # ------------------------------------------------------------------
    # Step loop
    # ------------------------------------------------------------------
    def _ensure_stepper(self) -> None:
        with self._lock:
            if self._stepper_thread and self._stepper_thread.is_alive():
                return
            self._stop_stepper = False
            self._stepper_thread = threading.Thread(target=self._step_loop, daemon=True)
            self._stepper_thread.start()

    def _step_loop(self) -> None:
        next_tick = time.monotonic()

        while True:
            with self._lock:
                if self._stop_stepper:
                    return
                do_step = self._state.sim_loaded and self._state.running and (not self._state.paused)

            if not do_step:
                time.sleep(0.05)
                continue

            if self._step_interval > 0:
                now = time.monotonic()
                if now < next_tick:
                    time.sleep(min(0.05, next_tick - now))
                    continue
                next_tick = now + self._step_interval

            try:
                with self._lock:
                    self._require_loaded()
                    self._conn.simulationStep()

                    departed = self._conn.simulation.getDepartedIDList()
                    arrived = self._conn.simulation.getArrivedIDList()

                    if departed:
                        self._departed_cache.extend(departed)
                        self._departed_cache = self._departed_cache[-self._event_cache_size:]
                    if arrived:
                        self._arrived_cache.extend(arrived)
                        self._arrived_cache = self._arrived_cache[-self._event_cache_size:]

            except Exception as e:
                with self._lock:
                    self._state.last_error = f"simulation_step_failed: {e}"
                    self._mark_not_ready(self._state.last_error)
                return

    # ------------------------------------------------------------------
    # Debug helpers
    # ------------------------------------------------------------------
    def traci_snapshot(self) -> Dict:
        with self._lock:
            self._require_traci()
            sim_time = self._conn.simulation.getTime()
            ids = self._conn.vehicle.getIDList()
            return {
                "sim_time": sim_time,
                "vehicle_id_list": ids,
                "departed_cached": list(self._departed_cache),
                "arrived_cached": list(self._arrived_cache),
            }

    def state(self) -> SumoState:
        with self._lock:
            return SumoState(**self._state.__dict__)

    def _require_traci(self) -> None:
        if self._conn is None:
            raise RuntimeError("TraCI not ready: Not connected.")
        if not self._state.traci_ready:
            raise RuntimeError("TraCI not ready")

    def _require_loaded(self) -> None:
        self._require_traci()
        if not self._state.sim_loaded:
            raise RuntimeError("Simulation not loaded")
