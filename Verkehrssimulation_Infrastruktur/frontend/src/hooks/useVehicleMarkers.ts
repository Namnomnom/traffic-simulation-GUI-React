// frontend/src/hooks/useVehicleMarkers.ts
import { useEffect, useMemo } from "react";
import type React from "react";
import type maplibregl from "maplibre-gl";
import { LngLat as MlLngLat } from "maplibre-gl";

import type { RoadSegment, Vehicle } from "../types/simTypes";

import { syncVehicleMarkers, type MarkerMap } from "../components/Map/markers/vehiclemarkers";
import { useVehicleDrag } from "../components/Map/interactions/useVehicleDrag";
import { useVehicleSelection } from "../components/Map/interactions/useVehicleSelection";

type LngLat = [number, number]; // [lng, lat]

type Params = {
  map: maplibregl.Map | null;
  mapLoaded: boolean;

  roads: RoadSegment[];
  vehicles: Vehicle[];

  isDrawing: boolean;

  markersRef: React.MutableRefObject<MarkerMap>;

  selectedVehicleId: number | null;
  onVehicleClick?: (id: number) => void;
  onVehicleMoved?: (id: number, lat: number, lon: number) => void;

  // ✅ vom MapContainer durchreichen
  routeStart?: LngLat | null;

  // ✅ Radius in Pixel (für Drag-Preview + Snap beim Loslassen)
  snapRadiusPx?: number;

  // ✅ Drag-Start-Schwelle
  dragThresholdPx?: number;
};

export function useVehicleMarkers({
  map,
  mapLoaded,
  roads,
  vehicles,
  isDrawing,
  markersRef,
  selectedVehicleId,
  onVehicleClick,
  onVehicleMoved,

  routeStart = null,
  snapRadiusPx = 28,
  dragThresholdPx = 6,
}: Params) {
  // ✅ Drag ist nur erlaubt wenn:
  // - Map da ist
  // - nicht gezeichnet wird
  // - ein onVehicleMoved Handler existiert
  const dragDisabled = isDrawing || !onVehicleMoved;

  // ✅ Snap-Ziele: nur der grüne Startpunkt
  const snapTargets = useMemo(() => {
    if (!routeStart) return [];
    const [lng, lat] = routeStart;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    return [new MlLngLat(lng, lat)];
  }, [routeStart]);

  const { onMarkerPointerDown, dragJustEndedRef, draggingVehicleIdRef } = useVehicleDrag({
    map, // ✅ bleibt null wenn nicht da

    disabled: dragDisabled,
    onVehicleMoved: onVehicleMoved ?? (() => {}),

    snapTargets,
    roads, // Legacy fallback, kann bleiben

    dragThresholdPx,
    snapRadiusPx,
  });

  const { selectedVehicleId: selectedId, selectVehicle } = useVehicleSelection({
    selectedVehicleId,
    onSelectVehicle: (id) => {
      if (id == null) return;
      onVehicleClick?.(id);
    },
    dragJustEndedRef,
  });

  useEffect(() => {
    if (!map || !mapLoaded) return;

    syncVehicleMarkers({
      map,
      vehicles,
      selectedVehicleId: selectedId ?? null,
      markers: markersRef.current,

      // click selection
      onSelect: selectVehicle,

      // drag start
      onPointerDown: !dragDisabled ? onMarkerPointerDown : undefined,

      // marker lib gets this too; keep consistent with dragDisabled
      disableDrag: dragDisabled,
    });
  }, [
    map,
    mapLoaded,
    vehicles,
    selectedId,
    selectVehicle,
    dragDisabled,
    onMarkerPointerDown,
    markersRef,
  ]);

  return { dragJustEndedRef, draggingVehicleIdRef };
}
