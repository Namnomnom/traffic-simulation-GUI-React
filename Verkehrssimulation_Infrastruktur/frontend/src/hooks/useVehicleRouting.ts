// frontend/src/hooks/useVehicleRouting.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";

import type { LngLat, Vehicle } from "../types/simTypes";
import type { ToolMode } from "../types/toolMode";
import { osrmNearest, osrmRoute } from "../lib/routing/osrm";

/** ✅ Routing pro Fahrzeug */
export type VehicleRoute = {
  start: LngLat | null;
  end: LngLat | null;
  points: LngLat[] | null;
};

type Params = {
  selectedVehicleId: number | null;

  toolMode: ToolMode;
  setToolMode: React.Dispatch<React.SetStateAction<ToolMode>>;

  vehicles: Vehicle[];
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;

  setRouteStart: (p: LngLat | null) => void;
  setRouteEnd: (p: LngLat | null) => void;
  clearRoute: () => void;

  snapSelectedVehicleToPoint: (p: LngLat) => void;
  setStatusText: (t: string) => void;

  startAttachRadiusM?: number; // default 25
};

function haversineMeters(a: LngLat, b: LngLat) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;

  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);

  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);

  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function useVehicleRouting({
  selectedVehicleId,
  toolMode,
  setToolMode,
  vehicles,
  setVehicles,
  setRouteStart,
  setRouteEnd,
  clearRoute,
  snapSelectedVehicleToPoint,
  setStatusText,
  startAttachRadiusM = 25,
}: Params) {
  const [routesByVehicle, setRoutesByVehicle] = useState<Record<number, VehicleRoute>>({});

  const selectedRoute: VehicleRoute = useMemo(() => {
    if (selectedVehicleId == null) return { start: null, end: null, points: null };
    return routesByVehicle[selectedVehicleId] ?? { start: null, end: null, points: null };
  }, [routesByVehicle, selectedVehicleId]);

  useEffect(() => {
    if (selectedVehicleId == null) {
      setRouteStart(null);
      setRouteEnd(null);
      return;
    }
    const r = routesByVehicle[selectedVehicleId];
    setRouteStart(r?.start ?? null);
    setRouteEnd(r?.end ?? null);
  }, [selectedVehicleId, routesByVehicle, setRouteStart, setRouteEnd]);

  const handlePickRoutePoint = useCallback(
    async (lngLat: LngLat) => {
      if (selectedVehicleId == null) {
        setStatusText("Bitte zuerst ein Fahrzeug auswählen.");
        setToolMode("SELECT");
        return;
      }

      try {
        const snapped = await osrmNearest(lngLat[0], lngLat[1]);

        if (toolMode === "PICK_ROUTE_START") {
          setRoutesByVehicle((prev) => ({
            ...prev,
            [selectedVehicleId]: { start: snapped, end: null, points: null },
          }));

          setRouteStart(snapped);
          setRouteEnd(null);

          snapSelectedVehicleToPoint(snapped);

          setStatusText(`✅ Start (gesnappt) für Fahrzeug #${selectedVehicleId} gesetzt – jetzt Ziel wählen.`);
          setToolMode("PICK_ROUTE_END");
          return;
        }

        if (toolMode === "PICK_ROUTE_END") {
          setRoutesByVehicle((prev) => {
            const cur = prev[selectedVehicleId] ?? { start: null, end: null, points: null };
            return { ...prev, [selectedVehicleId]: { ...cur, end: snapped, points: null } };
          });

          setRouteEnd(snapped);
          setStatusText(`✅ Ziel (gesnappt) für Fahrzeug #${selectedVehicleId} gesetzt – Route berechnen.`);
          setToolMode("SELECT");
        }
      } catch (e) {
        console.error(e);
        setStatusText("❌ Konnte Punkt nicht auf Straße snappen (OSRM).");
      }
    },
    [
      selectedVehicleId,
      toolMode,
      setToolMode,
      setRouteStart,
      setRouteEnd,
      snapSelectedVehicleToPoint,
      setStatusText,
    ]
  );

  const handleComputeRoute = useCallback(async () => {
    if (selectedVehicleId == null) {
      setStatusText("Bitte zuerst ein Fahrzeug auswählen.");
      return;
    }

    const r = routesByVehicle[selectedVehicleId];
    if (!r?.start || !r?.end) return;

    try {
      setStatusText("⏳ Route wird berechnet…");
      const pts = await osrmRoute(r.start, r.end);

      setRoutesByVehicle((prev) => ({
        ...prev,
        [selectedVehicleId]: { ...(prev[selectedVehicleId] ?? r), points: pts },
      }));

      setVehicles((prev) => prev.map((v: any) => (v.id === selectedVehicleId ? { ...v, routePoints: pts } : v)));

      setStatusText(`✅ Route berechnet für Fahrzeug #${selectedVehicleId} (lokaler OSRM).`);
    } catch (e) {
      console.error(e);
      setStatusText("❌ Routing fehlgeschlagen (OSRM).");
    }
  }, [selectedVehicleId, routesByVehicle, setVehicles, setStatusText]);

  const handleClearRoute = useCallback(() => {
    if (selectedVehicleId == null) return;

    setRoutesByVehicle((prev) => ({
      ...prev,
      [selectedVehicleId]: { start: null, end: null, points: null },
    }));

    setVehicles((prev) => prev.map((v: any) => (v.id === selectedVehicleId ? { ...v, routePoints: null } : v)));

    clearRoute();
    setRouteStart(null);
    setRouteEnd(null);
    setStatusText(`🧹 Route für Fahrzeug #${selectedVehicleId} gelöscht.`);
  }, [selectedVehicleId, setVehicles, clearRoute, setRouteStart, setRouteEnd, setStatusText]);

  const maybeAttachRouteOnVehicleMove = useCallback(
    (vehicleId: number, lat: number, lon: number) => {
      const r = routesByVehicle[vehicleId];
      if (!r?.start || !r?.points || r.points.length < 2) return;

      const dist = haversineMeters([lon, lat], r.start);
      if (dist > startAttachRadiusM) return;

      setVehicles((prev) => prev.map((v: any) => (v.id === vehicleId ? { ...v, routePoints: r.points } : v)));
    },
    [routesByVehicle, setVehicles, startAttachRadiusM]
  );

  const deleteRouteForVehicle = useCallback((vehicleId: number) => {
    setRoutesByVehicle((prev) => {
      if (!(vehicleId in prev)) return prev;
      const next = { ...prev };
      delete next[vehicleId];
      return next;
    });
  }, []);

  return {
    routesByVehicle,
    setRoutesByVehicle,
    selectedRoute,
    handlePickRoutePoint,
    handleComputeRoute,
    handleClearRoute,
    maybeAttachRouteOnVehicleMove,
    deleteRouteForVehicle,
  };
}
