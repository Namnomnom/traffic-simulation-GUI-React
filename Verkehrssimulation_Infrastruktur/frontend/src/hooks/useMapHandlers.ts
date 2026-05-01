// frontend/src/hooks/useMapHandlers.ts
import { useCallback } from "react";
import type React from "react";

import type { VehicleType, RoadSegment, LngLat } from "../types/simTypes";
import type { IntersectionVisual } from "../lib/intersectionsToGeoJSON";
import type { TrafficLightAddMode } from "../components/SidebarTools";
import type { ToolMode } from "../types/toolMode";
import type { VehicleRoute } from "../hooks/useVehicleRouting";

type TrafficLightPlacement = {
  lng: number;
  lat: number;
  bearing: number;
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

type Params = {
  toolMode: ToolMode;
  currentVehicleType: VehicleType;

  setRoads: React.Dispatch<React.SetStateAction<RoadSegment[]>>;
  nextRoadIdRef: React.MutableRefObject<number>;

  setIntersections: React.Dispatch<React.SetStateAction<IntersectionVisual[]>>;
  nextIntersectionNrRef: React.MutableRefObject<number>;

  addVehicleAt: (lat: number, lon: number, type: VehicleType) => void;
  setVehicles: React.Dispatch<React.SetStateAction<any[]>>;
  routesByVehicle: Record<number, VehicleRoute>;

  setStatusText: (t: string) => void;
  setSelectedVehicleId: (id: number) => void;

  startAttachRadiusM?: number;

  /** Abstand (m), bis wann eine neue Single-LSA automatisch in eine bestehende Gruppe einsortiert wird */
  singleGroupAttachRadiusM?: number;
};

export function useMapHandlers({
  toolMode,
  currentVehicleType,

  setRoads,
  nextRoadIdRef,

  setIntersections,
  nextIntersectionNrRef,

  addVehicleAt,
  setVehicles,
  routesByVehicle,

  setStatusText,
  setSelectedVehicleId,

  startAttachRadiusM = 25,
  singleGroupAttachRadiusM = 25,
}: Params) {
  const handleMapClickAddVehicle = useCallback(
    (lat: number, lon: number, type: VehicleType) => {
      if (toolMode !== "ADD_VEHICLE") return;
      addVehicleAt(lat, lon, type);
    },
    [toolMode, addVehicleAt]
  );

  const handleRoadFinished = useCallback(
    (points: [number, number][]) => {
      if (points.length < 2) return;
      const roadId = nextRoadIdRef.current++;
      setRoads((old) => [...old, { id: roadId, points, roadType: "city" }]);
      setStatusText(`Straße #${roadId} gespeichert (${points.length} Punkte).`);
    },
    [setRoads, setStatusText, nextRoadIdRef]
  );

  const handleVehicleMoved = useCallback(
    (id: number, lat: number, lon: number) => {
      setVehicles((prev) =>
        prev.map((v: any) => {
          if (v.id !== id) return v;

          const next: any = { ...v, lat, lon };

          const r = routesByVehicle[id];
          if (r?.start && r?.points && r.points.length >= 2) {
            const dist = haversineMeters([lon, lat], r.start);
            if (dist <= startAttachRadiusM) {
              next.routePoints = r.points;
            }
          }

          return next;
        })
      );
    },
    [setVehicles, routesByVehicle, startAttachRadiusM]
  );

  const handleVehicleClick = useCallback((id: number) => setSelectedVehicleId(id), [setSelectedVehicleId]);

  /**
   * ✅ Einzel-LSA wieder gruppierbar:
   * - Jede LSA bekommt groupId.
   * - Single-LSA: wenn nahe an bestehender LSA -> übernimmt deren groupId.
   * - Wenn placements > 1 (Batch) -> alle bekommen groupId = base (neue Gruppe).
   * - 4er-LSA (intersection) bleibt ein Objekt, bekommt groupId = base.
   */
  const handleAddTrafficLights = useCallback(
    (placements: TrafficLightPlacement[], mode: TrafficLightAddMode) => {
      if (toolMode !== "ADD_TRAFFIC_LIGHT") return;
      if (!placements?.length) return;

      const base = `K${nextIntersectionNrRef.current++}`;

      setIntersections((old) => {
        // findet groupId einer bestehenden LSA in der Nähe (falls vorhanden)
        const findNearbyGroupId = (lng: number, lat: number) => {
          let bestGroup: { groupId: string; dist: number } | null = null;

          for (const itx of old as any[]) {
            const p = (itx?.point ?? [itx?.lng, itx?.lat]) as [number, number];
            if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;

            const dist = haversineMeters([lng, lat], p);
            if (dist > singleGroupAttachRadiusM) continue;

            // groupId neu, fallback: id (für alte Daten)
            const groupId = (itx as any).groupId ?? String(itx?.id ?? "");
            if (!groupId) continue;

            if (!bestGroup || dist < bestGroup.dist) {
              bestGroup = { groupId, dist };
            }
          }

          return bestGroup?.groupId ?? null;
        };

        // ---- 4er LSA / Kreuzung: ein Objekt ----
        if (mode !== "single") {
          const p = placements[0];
          if (!p) return old;

          const obj: any = {
            id: base,
            groupId: base,
            kind: "intersection",
            point: [p.lng, p.lat],
            light: "RED",
            phase: "NS_GREEN",
            bearing: p.bearing ?? 0,
            // Default Festzeitprogramm
            program: {
              nsGreenMs: 25000,
              ewGreenMs: 25000,
            },
          };

          return [...old, obj as IntersectionVisual];
        }

        // ---- Single LSA: mehrere möglich ----
        const isBatch = placements.length > 1;
        const batchGroupId = base;

        const created: any[] = placements.map((p, idx) => {
          const nearby = findNearbyGroupId(p.lng, p.lat);
          const groupId = isBatch ? batchGroupId : nearby ?? base;

          // eindeutige IDs:
          // - 1 Placement: id = base
          // - mehrere: base-1, base-2, ...
          const id = placements.length === 1 ? base : `${base}-${idx + 1}`;

          return {
            id,
            groupId,
            kind: "single",
            point: [p.lng, p.lat],
            light: "RED",
            phase: "NS_GREEN",
            bearing: p.bearing ?? 0,
          };
        });

        return [...old, ...(created as IntersectionVisual[])];
      });

      setStatusText(
        mode === "single"
          ? `🚦 Einzel-LSA ${base} gesetzt (${placements.length}x).`
          : `🚦 Kreuzung ${base} (4 LSA) gesetzt.`
      );
    },
    [toolMode, setIntersections, setStatusText, nextIntersectionNrRef, singleGroupAttachRadiusM]
  );

  return {
    handleMapClickAddVehicle,
    handleRoadFinished,
    handleVehicleMoved,
    handleVehicleClick,
    handleAddTrafficLights,
  };
}
