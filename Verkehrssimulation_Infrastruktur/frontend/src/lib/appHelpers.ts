// frontend/src/lib/app/appHelpers.ts
import type { Dispatch, SetStateAction } from "react";
import type { RoadSegment } from "../types/simTypes";
import type { IntersectionVisual } from "./intersectionsToGeoJSON";

/**
 * Prüft, ob eine Intersection-ID zur ausgewählten Gruppe gehört.
 * Unterstützt Group-IDs wie "A" und "A-1", "A-2" usw.
 */
export function belongsToSelectedGroup(itemId: string, selectedGroupId: string) {
  return itemId === selectedGroupId || itemId.startsWith(selectedGroupId + "-");
}

/**
 * Unterstützt alte und neue Export-Formate von Fahrzeug-Routen.
 */
export function getRoutePointsFromVehiclePayload(vv: unknown) {
  const v = vv as any;
  return v?.routePoints ?? v?.route_points ?? v?.points ?? v?.route?.points ?? null;
}

type VehicleLike = {
  id: number;
  type?: string;
  cruiseSpeedKmh?: number;
  speedKmh?: number;
};

type RouteLike = {
  start?: unknown;
  end?: unknown;
  points?: unknown;
};

/**
 * Baut einen Snapshot deines aktuellen App-Zustands.
 * Wird für:
 * - JSON Export
 * - DB Save
 * - CSV Report
 */
export function buildScenarioSnapshot(params: {
  roads: RoadSegment[];
  intersections: IntersectionVisual[];
  vehicles: VehicleLike[];
  routesByVehicle: Record<number, RouteLike | undefined>;
  currentVehicleType: string;
}) {
  const { roads, intersections, vehicles, routesByVehicle, currentVehicleType } = params;

  return {
    roads,
    intersections,

    vehicles: vehicles.map((v) => {
      const r = routesByVehicle[v.id];
      return {
        id: v.id,
        type: v.type ?? currentVehicleType,
        speedKmh: v.cruiseSpeedKmh ?? v.speedKmh ?? 50,
        routeStart: r?.start ?? null,
        routeEnd: r?.end ?? null,
        routePoints: r?.points ?? null,
      };
    }),

    // optional / legacy compatibility
    trafficLights: intersections.map((tl: any, idx: number) => ({
      id: idx + 1,
      mode: tl.mode ?? "intersection",
      lng: tl.lng ?? tl.lon ?? tl.x ?? 0,
      lat: tl.lat ?? tl.y ?? 0,
      bearingDeg: tl.bearingDeg ?? tl.bearing ?? 0,
      controllerId: tl.controllerId ?? tl.singleControllerId ?? undefined,
      program: tl.program ?? undefined,
    })),
  };
}

/**
 * Wendet ein geladenes Szenario-Payload auf den App-State an.
 * (lokales JSON oder DB)
 */
export function applyScenarioPayloadToState(params: {
  payload: any;

  setRoads: Dispatch<SetStateAction<RoadSegment[]>>;
  setIntersections: Dispatch<SetStateAction<IntersectionVisual[]>>;
  setVehicles: Dispatch<SetStateAction<any[]>>;
  setRoutesByVehicle: Dispatch<SetStateAction<Record<number, any>>>;

  setSelectedVehicleId: (id: number | null) => void;
  setSelectedIntersectionId: (id: string | null) => void;
}) {
  const {
    payload,
    setRoads,
    setIntersections,
    setVehicles,
    setRoutesByVehicle,
    setSelectedVehicleId,
    setSelectedIntersectionId,
  } = params;

  if (Array.isArray(payload?.roads)) setRoads(payload.roads);
  if (Array.isArray(payload?.intersections)) setIntersections(payload.intersections);

  const vList = Array.isArray(payload?.vehicles) ? payload.vehicles : [];

  setVehicles(
    vList.map((vv: any) => ({
      id: Number(vv.id),
      type: vv.type ?? "pkw",
      speedKmh: vv.speedKmh ?? 50,
    }))
  );

  const nextRoutes: Record<number, any> = {};
  for (const vv of vList) {
    const id = Number(vv.id);
    nextRoutes[id] = {
      start: vv.routeStart ?? null,
      end: vv.routeEnd ?? null,
      points: getRoutePointsFromVehiclePayload(vv),
    };
  }

  setRoutesByVehicle(nextRoutes);

  // Selections zurücksetzen
  setSelectedVehicleId(null);
  setSelectedIntersectionId(null);
}
