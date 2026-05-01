// frontend/src/hooks/useUiState.ts
import { useCallback, useMemo, useState } from "react";
import type { LngLat, VehicleType } from "../types/simTypes";
import type { ToolMode } from "../types/toolMode";
import type { VehicleRoute } from "../types/uiState";
import { makeEmptyRoute } from "../types/uiState";

export type TrafficLightAddMode = "single" | "intersection4";

type ScenarioVisibility = {
  showNetwork: boolean;
  showIntersections: boolean;
  showTrafficLights: boolean;
  showVehicles: boolean;
};

type RoutesByVehicleId = Record<number, VehicleRoute>;

export function useUiState() {
  const [statusText, setStatusText] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [toolMode, setToolMode] = useState<ToolMode>("SELECT");
  const [tlAddMode, setTlAddMode] = useState<TrafficLightAddMode>("intersection4");
  const [currentVehicleType, setCurrentVehicleType] = useState<VehicleType>("pkw");

  const [visibility, setVisibility] = useState<ScenarioVisibility>({
    showNetwork: true,
    showIntersections: true,
    showTrafficLights: true,
    showVehicles: true,
  });

  const [kpiPanelOpen, setKpiPanelOpen] = useState<boolean>(false);

  const [routeStart, setRouteStart] = useState<LngLat | null>(null);
  const [routeEnd, setRouteEnd] = useState<LngLat | null>(null);
  const [routePoints, setRoutePoints] = useState<LngLat[] | null>(null);

  const [routesByVehicleId, setRoutesByVehicleId] = useState<RoutesByVehicleId>({});

  const getRouteForVehicle = useCallback(
    (vehicleId: number): VehicleRoute => routesByVehicleId[vehicleId] ?? makeEmptyRoute(),
    [routesByVehicleId]
  );

  const setRouteForVehicle = useCallback((vehicleId: number, next: VehicleRoute) => {
    setRoutesByVehicleId((prev) => ({ ...prev, [vehicleId]: next }));
  }, []);

  const setVehicleRouteStart = useCallback(
    (vehicleId: number, start: LngLat | null) => {
      const cur = routesByVehicleId[vehicleId] ?? makeEmptyRoute();
      setRoutesByVehicleId((prev) => ({
        ...prev,
        [vehicleId]: { ...cur, start, points: null },
      }));
    },
    [routesByVehicleId]
  );

  const setVehicleRouteEnd = useCallback(
    (vehicleId: number, end: LngLat | null) => {
      const cur = routesByVehicleId[vehicleId] ?? makeEmptyRoute();
      setRoutesByVehicleId((prev) => ({
        ...prev,
        [vehicleId]: { ...cur, end, points: null },
      }));
    },
    [routesByVehicleId]
  );

  const setVehicleRoutePoints = useCallback(
    (vehicleId: number, points: LngLat[] | null) => {
      const cur = routesByVehicleId[vehicleId] ?? makeEmptyRoute();
      setRoutesByVehicleId((prev) => ({
        ...prev,
        [vehicleId]: { ...cur, points },
      }));
    },
    [routesByVehicleId]
  );

  const clearVehicleRoute = useCallback((vehicleId: number) => {
    setRoutesByVehicleId((prev) => {
      const next = { ...prev };
      delete next[vehicleId];
      return next;
    });
  }, []);

  const beginPickStart = useCallback(() => setToolMode("PICK_ROUTE_START"), []);
  const beginPickEnd = useCallback(() => setToolMode("PICK_ROUTE_END"), []);

  const clearRoute = useCallback(() => {
    setRouteStart(null);
    setRouteEnd(null);
    setRoutePoints(null);
    setToolMode("SELECT");
  }, []);

  const [rotateHintDismissed, setRotateHintDismissed] = useState(false);
  const showRotateHint = useMemo(() => !rotateHintDismissed, [rotateHintDismissed]);

  const setShowNetwork = useCallback(
    (v: boolean) => setVisibility((s) => ({ ...s, showNetwork: v })),
    []
  );
  const setShowIntersections = useCallback(
    (v: boolean) => setVisibility((s) => ({ ...s, showIntersections: v })),
    []
  );
  const setShowTrafficLights = useCallback(
    (v: boolean) => setVisibility((s) => ({ ...s, showTrafficLights: v })),
    []
  );
  const setShowVehicles = useCallback(
    (v: boolean) => setVisibility((s) => ({ ...s, showVehicles: v })),
    []
  );

  return {
    statusText,
    setStatusText,
    busy,
    setBusy,

    toolMode,
    setToolMode,
    tlAddMode,
    setTlAddMode,
    currentVehicleType,
    setCurrentVehicleType,

    kpiPanelOpen,
    setKpiPanelOpen,

    showNetwork: visibility.showNetwork,
    setShowNetwork,
    showIntersections: visibility.showIntersections,
    setShowIntersections,
    showTrafficLights: visibility.showTrafficLights,
    setShowTrafficLights,
    showVehicles: visibility.showVehicles,
    setShowVehicles,

    routeStart,
    setRouteStart,
    routeEnd,
    setRouteEnd,
    routePoints,
    setRoutePoints,
    beginPickStart,
    beginPickEnd,
    clearRoute,

    routesByVehicleId,
    getRouteForVehicle,
    setRouteForVehicle,
    setVehicleRouteStart,
    setVehicleRouteEnd,
    setVehicleRoutePoints,
    clearVehicleRoute,

    rotateHintDismissed,
    setRotateHintDismissed,
    showRotateHint,
  };
}