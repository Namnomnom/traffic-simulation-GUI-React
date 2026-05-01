// frontend/src/hooks/useSimStateSync.ts
import { useEffect, useRef } from "react";
import type React from "react";
import type { Vehicle } from "../types/simTypes";

type BackendVehicleState = {
  id: number;
  lat: number;
  lon: number;
  speedKmh?: number;
  headingDeg?: number;
  // optional: weitere Felder
};

type BackendStateResponse = {
  timeSec?: number;
  vehicles: BackendVehicleState[];
};

type Params = {
  enabled: boolean;
  tickMs?: number;
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  apiBase?: string; // optional override, sonst VITE_API_BASE
  onError?: (err: unknown) => void;
};

export function useSimStateSync({
  enabled,
  tickMs = 250,
  setVehicles,
  apiBase,
  onError,
}: Params) {
  const timerRef = useRef<number | null>(null);

  const API_BASE = apiBase ?? (import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api");

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    async function pull() {
      try {
        const res = await fetch(`${API_BASE}/simulation/state`, { method: "GET" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as BackendStateResponse;

        // ✅ Minimal-invasiv: vorhandene Vehicles updaten, neue optional ignorieren/ergänzen
        setVehicles((prev) => {
          const byId = new Map(data.vehicles.map((v) => [v.id, v] as const));

          return prev.map((v) => {
            const s = byId.get(v.id);
            if (!s) return v;

            return {
              ...v,
              lat: s.lat,
              lon: s.lon,
              speedKmh: s.speedKmh ?? v.speedKmh,
              headingDeg: s.headingDeg ?? v.headingDeg,
              // Wichtig: sim.active kannst du UI-seitig weiter nutzen,
              // aber die Bewegung kommt jetzt aus SUMO.
            };
          });
        });
      } catch (err) {
        console.error(err);
        onError?.(err);
      }
    }

    // sofort einmal ziehen
    void pull();

    // dann poll
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => void pull(), tickMs);

    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [enabled, tickMs, setVehicles, API_BASE, onError]);
}
