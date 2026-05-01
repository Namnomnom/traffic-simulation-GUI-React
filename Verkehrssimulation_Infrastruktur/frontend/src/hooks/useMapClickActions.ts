// frontend/src/hooks/useMapClickActions.ts
import { useEffect } from "react";
import type React from "react";
import type maplibregl from "maplibre-gl";

import type { LngLat, VehicleType } from "../types/simTypes";
import type { ToolMode } from "../types/toolMode";

import { useMapClick } from "../components/Map/interactions/useMapClick";

type TrafficLightAddMode = "intersection4" | "single";
type Placement = { lat: number; lng: number; bearing: number };

type Params = {
  map: maplibregl.Map | null;

  toolMode: ToolMode;
  isDrawing: boolean;

  setCoords: React.Dispatch<React.SetStateAction<LngLat[]>>;

  newVehicleType: VehicleType;
  onMapClickAddVehicle?: (lat: number, lon: number, type: VehicleType) => void;

  onPickRoutePoint?: (lngLat: LngLat) => void;

  tlAddMode: TrafficLightAddMode;
  onAddTrafficLights?: (placements: Placement[], mode: TrafficLightAddMode) => void;

  draggingVehicleIdRef: React.MutableRefObject<number | null>;
  dragJustEndedRef: React.MutableRefObject<boolean>;
};

export function useMapClickActions({
  map,
  toolMode,
  isDrawing,
  setCoords,

  newVehicleType,
  onMapClickAddVehicle,

  onPickRoutePoint,

  tlAddMode,
  onAddTrafficLights,

  draggingVehicleIdRef,
  dragJustEndedRef,
}: Params) {
  /**
   * ✅ ZENTRAL:
   * - useMapClick bekommt **nie undefined map**
   * - Clicks werden unterdrückt wenn:
   *   - gerade gezogen wurde
   *   - aktuell gezogen wird
   */
  useMapClick({
    map: map ?? null,

    toolMode,
    isDrawing,
    setCoords,

    newVehicleType,
    onMapClickAddVehicle,

    onPickRoutePoint,

    tlAddMode,
    onAddTrafficLights,

    draggingVehicleIdRef,
    dragJustEndedRef,
  });

  /**
   * ✅ Cleanup:
   * - verhindert „Geisterzustände“
   * - wichtig beim Tool-Wechsel & Map-Unmount
   */
  useEffect(() => {
    return () => {
      dragJustEndedRef.current = false;
      draggingVehicleIdRef.current = null;
    };
  }, [dragJustEndedRef, draggingVehicleIdRef]);
}
