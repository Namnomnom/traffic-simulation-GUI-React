// frontend/src/hooks/useVehicleSimulationTick.ts
import { useEffect, useRef } from "react";
import type React from "react";
import type { Vehicle, LngLat } from "../types/simTypes";
import { advanceVehicle, getVehicleLngLat } from "../lib/vehicleSim";
import type { StopPoint, IntersectionPhase } from "../types/traffic";

type Params = {
  running: boolean;
  tickMs?: number;
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  stopPoints: StopPoint[];
  phases: IntersectionPhase[];
};

// --- helpers ---
function distMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);

  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(s));
}

function armGroupFromBearing(bearingDeg: number): "NS" | "EW" {
  const b = ((bearingDeg % 360) + 360) % 360;
  const d0 = Math.min(Math.abs(b - 0), Math.abs(b - 360));
  const d180 = Math.abs(b - 180);
  const d90 = Math.abs(b - 90);
  const d270 = Math.abs(b - 270);
  const ns = Math.min(d0, d180);
  const ew = Math.min(d90, d270);
  return ns <= ew ? "NS" : "EW";
}

function isRedForApproach(phase: "NS_GREEN" | "EW_GREEN", bearingDeg: number): boolean {
  const group = armGroupFromBearing(bearingDeg);
  if (phase === "NS_GREEN") return group !== "NS"; // EW rot
  return group !== "EW"; // NS rot
}

export function useVehicleSimulationTick({
  running,
  tickMs = 50,
  setVehicles,
  stopPoints,
  phases,
}: Params) {
  const lastMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      lastMsRef.current = null;
      return;
    }

    const phaseByIntersection = new Map(phases.map(p => [p.intersectionId, p.phase] as const));

    const interval = setInterval(() => {
      const now = performance.now();
      const last = lastMsRef.current ?? now;
      lastMsRef.current = now;

      // dt in Sekunden
      const dt = Math.max(0.001, Math.min(0.2, (now - last) / 1000));

      setVehicles(prev =>
        prev.map(v => {
          if (!v.sim || !v.sim.active) return v;

          // 1) mustStop bestimmen (minimal: nächster StopPoint in der Nähe)
          const pos: LngLat = [v.lon, v.lat];

          let best: StopPoint | null = null;
          let bestD = Infinity;

          for (const sp of stopPoints) {
            const d = distMeters(pos, sp.point);
            if (d < bestD) {
              bestD = d;
              best = sp;
            }
          }

          let mustStop = false;
          if (best) {
            const phase = phaseByIntersection.get(best.intersectionId) ?? "NS_GREEN";
            const red = isRedForApproach(phase, best.bearingDeg);

            const brakingDistanceM = 18; // später dynamisch machen (speed abhängig)
            mustStop = red && bestD <= brakingDistanceM;
          }

          // 2) Simulation einen Schritt weiter (Bewegung + KPIs + soft braking)
          advanceVehicle(v.sim, dt, mustStop);

          // 3) lat/lon aus SimState zurückschreiben
          const [lon, lat] = getVehicleLngLat(v.sim);
          const speedKmh = (v.sim.speedMps ?? 0) * 3.6;

          return {
            ...v,
            lon,
            lat,
            speedKmh,
            headingDeg: v.sim.kpis.headingDeg,
            sim: { ...v.sim },
          };
        })
      );
    }, tickMs);

    return () => clearInterval(interval);
  }, [running, tickMs, setVehicles, stopPoints, phases]);
}
