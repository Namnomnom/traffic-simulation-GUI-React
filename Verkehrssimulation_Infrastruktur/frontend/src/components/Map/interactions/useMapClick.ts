// frontend/src/components/Map/interactions/useMapClick.ts
import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import type { ToolMode } from "../../../types/toolMode";
import type { LngLat, VehicleType } from "../../../types/simTypes";
import { TL_LAYER_ID, TL_CLICK_CONSUMED_KEY } from "../layers/trafficLightsLayer";

type TrafficLightAddMode = "intersection4" | "single";
type Placement = { lat: number; lng: number; bearing: number };

type Args = {
  map: MapLibreMap | null;
  toolMode: ToolMode;
  isDrawing: boolean;
  setCoords: Dispatch<SetStateAction<LngLat[]>>;

  newVehicleType: VehicleType;
  onMapClickAddVehicle?: (lat: number, lon: number, type: VehicleType) => void;

  tlAddMode?: TrafficLightAddMode;
  onAddTrafficLights?: (placements: Placement[], mode: TrafficLightAddMode) => void;

  onPickRoutePoint?: (lngLat: LngLat) => void;

  draggingVehicleIdRef: MutableRefObject<number | null>;
  dragJustEndedRef: MutableRefObject<boolean>;
};

export function useMapClick({
  map,
  toolMode,
  isDrawing,
  setCoords,
  newVehicleType,
  onMapClickAddVehicle,
  tlAddMode = "intersection4",
  onAddTrafficLights,
  onPickRoutePoint,
  draggingVehicleIdRef,
  dragJustEndedRef,
}: Args) {
  useEffect(() => {
    if (!map) return;

    const handleClick = (e: MapMouseEvent) => {
      // 0) Wenn der Klick gerade vom TrafficLight-Layer "konsumiert" wurde: einmalig ignorieren
      if ((map as any)[TL_CLICK_CONSUMED_KEY]) {
        (map as any)[TL_CLICK_CONSUMED_KEY] = false;
        return;
      }

      // 1) Guards: Drag endet gerade → Click ignorieren
      if (dragJustEndedRef.current) {
        dragJustEndedRef.current = false;
        return;
      }
      if (draggingVehicleIdRef.current != null) return;

      const { lng, lat } = e.lngLat;

      // 2) Road drawing hat IMMER Priorität
      if (isDrawing) {
        setCoords((prev) => [...prev, [lng, lat]]);
        return;
      }

      // 3) Tool actions
      if (toolMode === "ADD_VEHICLE") {
        onMapClickAddVehicle?.(lat, lng, newVehicleType);
        return;
      }

      if (toolMode === "ADD_TRAFFIC_LIGHT") {
        // ✅ Klick auf existierende Ampel NICHT als "Hinzufügen" werten
        try {
          const hits = map.queryRenderedFeatures(e.point, { layers: [TL_LAYER_ID] });
          if (hits.length > 0) return;
        } catch {
          // layer evtl. noch nicht da -> dann halt trotzdem hinzufügen
        }

        // ✅ bearing: initial 0, du drehst später mit Q/E im Panel (oder per Drag/Rotation UI)
        onAddTrafficLights?.([{ lat, lng, bearing: 0 }], tlAddMode);
        return;
      }

      if (toolMode === "PICK_ROUTE_START" || toolMode === "PICK_ROUTE_END") {
        onPickRoutePoint?.([lng, lat]);
        return;
      }

      // SELECT: nichts tun (Selection ist in anderen Interactions)
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [
    map,
    toolMode,
    isDrawing,
    setCoords,
    newVehicleType,
    onMapClickAddVehicle,
    tlAddMode,
    onAddTrafficLights,
    onPickRoutePoint,
    draggingVehicleIdRef,
    dragJustEndedRef,
  ]);
}
