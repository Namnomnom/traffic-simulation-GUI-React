// frontend/src/hooks/useGlobalSimulation.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { Vehicle, LngLat } from "../types/simTypes";

export type SimState = "STOPPED" | "RUNNING" | "PAUSED";

export type VehicleRoute = {
  start: LngLat | null;
  end: LngLat | null;
  points: LngLat[] | null;
};

type Params = {
  vehicles: Vehicle[];
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;

  routesByVehicle: Record<number, VehicleRoute>;

  startOrResumeVehicle: (vehicleId: number, routePoints: LngLat[], cruiseSpeedKmh: number) => void;
  resetVehicle: (vehicleId: number) => void;

  startSim?: () => Promise<void>;
  stopSim?: () => Promise<void>;

  setStatusText?: (text: string) => void;

  baseTickMs?: number; // default 250
};

export function useGlobalSimulation({
  vehicles,
  setVehicles,
  routesByVehicle,
  startOrResumeVehicle,
  resetVehicle,
  startSim,
  stopSim,
  setStatusText,
  baseTickMs = 250,
}: Params) {
  // Speed: 0.5x / 1x / 2x / 5x
  const [simSpeed, setSimSpeed] = useState<0.5 | 1 | 2 | 5>(1);

  // Global state
  const [simState, setSimState] = useState<SimState>("STOPPED");
  const [simTimeSec, setSimTimeSec] = useState(0);

  // ✅ Vorschau: eigene Uhr (läuft ohne Simulation)
  const [previewTrafficLights, setPreviewTrafficLights] = useState(false);
  const [previewTimeSec, setPreviewTimeSec] = useState(0);

  // Tick abhängig von Speed
  const simTickMs = useMemo(() => Math.max(10, Math.round(baseTickMs / simSpeed)), [baseTickMs, simSpeed]);

  // Timer-Ref (nur für Sim-Zeit)
  const simTimerRef = useRef<number | null>(null);

  const isRunning = simState === "RUNNING";

  // =========================
  // ✅ Sim-Zeit läuft NUR bei RUNNING
  // =========================
  useEffect(() => {
    if (simState !== "RUNNING") {
      if (simTimerRef.current != null) {
        window.clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
      return;
    }

    if (simTimerRef.current != null) window.clearInterval(simTimerRef.current);

    simTimerRef.current = window.setInterval(() => {
      setSimTimeSec((t) => t + simTickMs / 1000);
    }, simTickMs);

    return () => {
      if (simTimerRef.current != null) {
        window.clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    };
  }, [simState, simTickMs]);

  // =========================
  // ✅ Preview-Zeit läuft bei Vorschau, aber NICHT bei RUNNING
  // =========================
  useEffect(() => {
    if (simState === "RUNNING") return;
    if (!previewTrafficLights) return;

    const id = window.setInterval(() => {
      setPreviewTimeSec((t) => t + simTickMs / 1000);
    }, simTickMs);

    return () => window.clearInterval(id);
  }, [simState, previewTrafficLights, simTickMs]);

  // Hilfsfunktion: Route für ein Vehicle holen
  const getRouteForVehicle = useCallback(
    (v: Vehicle) => {
      const fromMap = routesByVehicle[v.id]?.points ?? null;
      const fromVehicle = (v as any).routePoints ?? null;
      return (fromMap ?? fromVehicle) as LngLat[] | null;
    },
    [routesByVehicle]
  );

  const handleSimStart = useCallback(async () => {
    // Wenn STOPPED -> Zeit neu starten (typisch)
    if (simState === "STOPPED") {
      setSimTimeSec(0);
      // Optional: Preview-Zeit auch resetten, damit Vorschau nicht "weiterläuft"
      // (wenn du das nicht willst: diese Zeile entfernen)
      // setPreviewTimeSec(0);
    }

    const runnable = vehicles
      .map((v) => ({ v, route: getRouteForVehicle(v) }))
      .filter((x) => x.route && x.route.length >= 2) as Array<{ v: Vehicle; route: LngLat[] }>;

    setVehicles((prev) =>
      prev.map((x: any) => {
        const entry = runnable.find((r) => r.v.id === x.id);
        if (!entry) return x;
        if (!x.sim) return x; // init passiert in startOrResumeVehicle
        return { ...x, sim: { ...x.sim, active: true } };
      })
    );

    runnable.forEach(({ v, route }) => {
      if (!v.sim) startOrResumeVehicle(v.id, route, v.speedKmh ?? 50);
    });

    setSimState("RUNNING");

    try {
      await startSim?.();
    } catch (e) {
      console.error(e);
      setStatusText?.("Fehler beim Starten der Simulation 😵");
      setSimState("STOPPED");
    }
  }, [simState, vehicles, getRouteForVehicle, setVehicles, startOrResumeVehicle, startSim, setStatusText]);

  const handleSimPause = useCallback(() => {
    setSimState("PAUSED");
    setVehicles((prev) => prev.map((v: any) => (v.sim ? { ...v, sim: { ...v.sim, active: false } } : v)));
  }, [setVehicles]);

  const handleSimStop = useCallback(async () => {
    setSimState("STOPPED");
    setVehicles((prev) => prev.map((v: any) => (v.sim ? { ...v, sim: { ...v.sim, active: false } } : v)));

    try {
      await stopSim?.();
    } catch (e) {
      console.error(e);
      setStatusText?.("Fehler beim Stoppen der Simulation 😵");
    }
  }, [setVehicles, stopSim, setStatusText]);

  const handleSimReset = useCallback(async () => {
    setSimState("STOPPED");
    setSimTimeSec(0);

    // ✅ Vorschau beim Reset aus + Preview-Zeit zurücksetzen
    setPreviewTrafficLights(false);
    setPreviewTimeSec(0);

    vehicles.forEach((v) => resetVehicle(v.id));

    try {
      await stopSim?.();
    } catch (e) {
      console.error(e);
    }
  }, [vehicles, resetVehicle, stopSim]);

  return {
    // state
    simState,
    simTimeSec,
    previewTimeSec, // ✅ neu: eigene Uhr für Vorschau
    simSpeed,
    simTickMs,
    isRunning,

    // preview
    previewTrafficLights,
    setPreviewTrafficLights,

    // setters
    setSimSpeed,

    // actions
    handleSimStart,
    handleSimPause,
    handleSimStop,
    handleSimReset,
  };
}
