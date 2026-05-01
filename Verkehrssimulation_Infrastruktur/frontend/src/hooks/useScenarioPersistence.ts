// frontend/src/hooks/useScenarioPersistence.ts
import { useCallback } from "react";
import type { IntersectionVisual } from "../lib/intersectionsToGeoJSON";
import type { RoadSegment, Vehicle, LngLat } from "../types/simTypes";
import type { ToolMode } from "../types/toolMode";

type RouteEntry = {
  start: LngLat | null;
  end: LngLat | null;
  points: LngLat[] | null;
};

type RoutesByVehicle = Record<number, RouteEntry>;

type UseScenarioPersistenceParams = {
  roads: RoadSegment[];
  intersections: IntersectionVisual[];
  vehicles: Vehicle[];
  routesByVehicle: RoutesByVehicle;
  currentVehicleType: string;
  simSpeed: 0.5 | 1 | 2 | 5;
  previewTrafficLights: boolean;

  setStatusText: (text: string) => void;

  setRoads: (roads: RoadSegment[]) => void;
  setIntersections: (items: IntersectionVisual[]) => void;
  setVehicles: (vehicles: Vehicle[]) => void;
  setRoutesByVehicle: (routes: RoutesByVehicle) => void;

  setSelectedVehicleId: (id: number | null) => void;
  setSelectedIntersectionId: (id: string | null) => void;

  setRouteStart: (value: LngLat | null) => void;
  setRouteEnd: (value: LngLat | null) => void;

  clearRoute: () => void;
  setToolMode: (mode: ToolMode) => void;
  setCurrentVehicleType: (value: any) => void;
  setSimSpeed: (value: 0.5 | 1 | 2 | 5) => void;
  setPreviewTrafficLights: (value: boolean) => void;
};

export function useScenarioPersistence({
  roads,
  intersections,
  vehicles,
  routesByVehicle,
  currentVehicleType,
  simSpeed,
  previewTrafficLights,

  setStatusText,

  setRoads,
  setIntersections,
  setVehicles,
  setRoutesByVehicle,

  setSelectedVehicleId,
  setSelectedIntersectionId,

  setRouteStart,
  setRouteEnd,

  clearRoute,
  setToolMode,
  setCurrentVehicleType,
  setSimSpeed,
  setPreviewTrafficLights,
}: UseScenarioPersistenceParams) {
  const buildSnapshot = useCallback(() => {
    const normalizedVehicles = vehicles.map((vehicle) => ({
      ...vehicle,
      routePoints:
        routesByVehicle[vehicle.id]?.points ??
        (Array.isArray(vehicle.routePoints) ? vehicle.routePoints : null),
    }));

    return {
      roads,
      intersections,
      vehicles: normalizedVehicles,
      routesByVehicle,
      currentVehicleType,
      sim: {
        simSpeed,
        previewTrafficLights,
      },
    };
  }, [
    roads,
    intersections,
    vehicles,
    routesByVehicle,
    currentVehicleType,
    simSpeed,
    previewTrafficLights,
  ]);

  const applyScenarioPayloadToState = useCallback(
    (payload: any) => {
      const nextRoads = Array.isArray(payload?.roads) ? payload.roads : [];
      const nextIntersections = Array.isArray(payload?.intersections) ? payload.intersections : [];
      const nextVehicles = Array.isArray(payload?.vehicles) ? payload.vehicles : [];

      const rawRoutes =
        payload?.routesByVehicle && typeof payload.routesByVehicle === "object"
          ? payload.routesByVehicle
          : {};

      const nextRoutes: RoutesByVehicle = {};

      nextVehicles.forEach((vehicle: Vehicle) => {
        const routeFromMap = rawRoutes[vehicle.id];
        const routePoints = Array.isArray(routeFromMap?.points)
          ? routeFromMap.points
          : Array.isArray(vehicle.routePoints)
          ? vehicle.routePoints
          : null;

        nextRoutes[vehicle.id] = {
          start: routeFromMap?.start ?? null,
          end: routeFromMap?.end ?? null,
          points: routePoints,
        };
      });

      setRoads(nextRoads);
      setIntersections(nextIntersections);
      setVehicles(nextVehicles);
      setRoutesByVehicle(nextRoutes);

      setSelectedVehicleId(null);
      setSelectedIntersectionId(null);
      setRouteStart(null);
      setRouteEnd(null);
      clearRoute();
      setToolMode("SELECT");

      if (payload?.currentVehicleType) {
        setCurrentVehicleType(payload.currentVehicleType);
      }

      if (
        payload?.sim?.simSpeed === 0.5 ||
        payload?.sim?.simSpeed === 1 ||
        payload?.sim?.simSpeed === 2 ||
        payload?.sim?.simSpeed === 5
      ) {
        setSimSpeed(payload.sim.simSpeed);
      }

      if (typeof payload?.sim?.previewTrafficLights === "boolean") {
        setPreviewTrafficLights(payload.sim.previewTrafficLights);
      }
    },
    [
      clearRoute,
      setCurrentVehicleType,
      setIntersections,
      setPreviewTrafficLights,
      setRoads,
      setRouteEnd,
      setRouteStart,
      setRoutesByVehicle,
      setSelectedIntersectionId,
      setSelectedVehicleId,
      setSimSpeed,
      setToolMode,
      setVehicles,
    ]
  );

  const pickScenarioJSONFile = useCallback((): Promise<any | null> => {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        try {
          const text = await file.text();
          resolve(JSON.parse(text));
        } catch {
          setStatusText("❌ Datei konnte nicht gelesen werden.");
          resolve(null);
        }
      };

      input.click();
    });
  }, [setStatusText]);

  return {
    buildSnapshot,
    applyScenarioPayloadToState,
    pickScenarioJSONFile,
  };
}