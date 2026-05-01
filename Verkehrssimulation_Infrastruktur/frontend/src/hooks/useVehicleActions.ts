// frontend/src/hooks/useVehicleActions.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Vehicle, VehicleType } from "../types/simTypes";

export type LngLat = [number, number];

type Params = {
  vehicles: Vehicle[];
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  maxVehicles?: number;
  setStatusText?: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useVehicleActions({
  vehicles,
  setVehicles,
  maxVehicles = 5,
  setStatusText,
}: Params) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);

  // robuste ID-Vergabe auch nach Reload/Reset/Scenario-Load
  const nextVehicleIdRef = useRef(1);

  // ✅ Sync nextVehicleIdRef mit bestehenden Vehicles (verhindert ID-Kollisionen)
  useEffect(() => {
    const maxId = vehicles.reduce((m, v) => Math.max(m, v.id ?? 0), 0);
    nextVehicleIdRef.current = Math.max(nextVehicleIdRef.current, maxId + 1);
  }, [vehicles]);

  // ✅ Falls ausgewähltes Fahrzeug gelöscht wurde → Selection leeren
  useEffect(() => {
    if (selectedVehicleId == null) return;
    const exists = vehicles.some((v) => v.id === selectedVehicleId);
    if (!exists) setSelectedVehicleId(null);
  }, [vehicles, selectedVehicleId]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId]
  );

  const addVehicleAt = useCallback(
    (lat: number, lon: number, type: VehicleType) => {
      // ID früh ziehen (stabil, auch wenn setVehicles async läuft)
      const id = nextVehicleIdRef.current++;

      let didAdd = false;

      setVehicles((prev) => {
        if (prev.length >= maxVehicles) {
          // Rollback der ID ist optional; ich lasse es bewusst weg, um keine Kollisionen zu riskieren.
          // Wenn du unbedingt "keine Lücken" willst, sag Bescheid, dann machen wir's anders.
          return prev;
        }

        didAdd = true;
        const newVehicle: Vehicle = { id, lat, lon, type };
        return [...prev, newVehicle];
      });

      // Status/Selection nur setzen, wenn wirklich hinzugefügt wurde
      // (didAdd wird synchron im selben Tick gesetzt)
      if (!didAdd) {
        setStatusText?.(`Maximal ${maxVehicles} Fahrzeuge erlaubt (aktuell ${vehicles.length}).`);
        return null;
      }

      setSelectedVehicleId(id);
      setStatusText?.(`🚗 Fahrzeug #${id} (${type}) platziert.`);
      return id;
    },
    [maxVehicles, setVehicles, setStatusText, vehicles.length]
  );

  // Dummy-Route wie in deiner App.tsx (falls du es noch nutzt)
  const computeRouteDummyFixed = useCallback(
    (routeStart: LngLat | null, routeEnd: LngLat | null) => {
      if (!routeStart || !routeEnd) {
        setStatusText?.("Bitte zuerst Start und Ziel setzen.");
        return;
      }
      if (selectedVehicleId == null) {
        setStatusText?.("Bitte zuerst ein Fahrzeug auswählen.");
        return;
      }

      const mid: LngLat = [
        (routeStart[0] + routeEnd[0]) / 2,
        (routeStart[1] + routeEnd[1]) / 2,
      ];
      const routePoints: LngLat[] = [routeStart, mid, routeEnd];

      setVehicles((old) =>
        old.map((v) => (v.id === selectedVehicleId ? { ...v, routePoints } : v))
      );

      setStatusText?.(`🛣️ Route berechnet (Dummy) für Fahrzeug #${selectedVehicleId}.`);
    },
    [selectedVehicleId, setVehicles, setStatusText]
  );

  return {
    selectedVehicleId,
    setSelectedVehicleId,
    selectedVehicle,

    addVehicleAt,
    computeRouteDummyFixed,

    nextVehicleIdRef, // optional
  };
}