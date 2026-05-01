// frontend/src/components/Map/MapContainer.tsx
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

import type { RoadSegment, Vehicle, LngLat, VehicleType } from "../../types/simTypes";
import type { IntersectionVisual } from "../../lib/intersectionsToGeoJSON";
import type { ToolMode } from "../../types/toolMode";

import DrawTool from "./DrawTool";

import {
  ensureTrafficLightsLayer,
  updateTrafficLightsData,
  updateTrafficLightSelection,
  enableTrafficLightsInteractions,
  TL_DRAG_JUST_ENDED_AT_KEY,
} from "./layers/trafficLightsLayer";

import type { MarkerMap } from "./markers/vehiclemarkers";
import { useMapInit } from "../../hooks/useMapInit";

// extracted hooks
import { useTrafficLightDrag } from "../../hooks/useTrafficLightDrag";
import { useVehicleMarkers } from "../../hooks/useVehicleMarkers";
import { useMapClickActions } from "../../hooks/useMapClickActions";
import { useRoadLayers } from "../../hooks/useRoadLayers";

// ✅ Existing single route layer (kept for backward compat)
import { updateRouteData } from "./layers/routeLayer";

// ✅ SNAP PREVIEW LAYER (prevents crashes during drag/placement)
import { ensureSnapPreviewLayer } from "./layers/snapPreviewLayer";

// MapLibre types (avoid importing full maplibre types)
type AnyMap = any;

type TrafficLightAddMode = "intersection4" | "single";

/** ✅ NEW: per-vehicle route bundle */
export type VehicleRoute = {
  start: LngLat | null;
  end: LngLat | null;
  points: LngLat[] | null; // OSRM geometry
};

type MapContainerProps = {
  initialCenter?: LngLat;
  initialZoom?: number;

  showPanel?: boolean;
  toolMode?: ToolMode;

  roads?: RoadSegment[];
  vehicles?: Vehicle[];
  intersections?: IntersectionVisual[];

  selectedVehicleId?: number | null;

  selectedIntersectionId?: string | null;
  onSelectIntersection?: (id: string | null) => void;

  newVehicleType?: VehicleType;

  onRoadFinished?: (points: [number, number][]) => void;
  onMapClickAddVehicle?: (lat: number, lon: number, type: VehicleType) => void;

  tlAddMode?: TrafficLightAddMode;
  onAddTrafficLights?: (placements: { lat: number; lng: number; bearing: number }[], mode: TrafficLightAddMode) => void;

  onPickRoutePoint?: (lngLat: LngLat) => void;

  onVehicleClick?: (id: number) => void;
  onVehicleMoved?: (id: number, lat: number, lon: number) => void;

  onMoveIntersectionGroup?: (groupId: string, nextPoint: LngLat) => void;

  onClosePanel?: () => void;

  // ✅ Backward compatible: SINGLE route (selected)
  routeStart?: LngLat | null;
  routeEnd?: LngLat | null;
  routePoints?: LngLat[] | null;

  // ✅ NEW: MULTI routes
  routesByVehicle?: Record<number, VehicleRoute>;
};

/* ============================
   ✅ Multi Route Layer helpers
   ============================ */

const MULTI_ROUTE_SOURCE = "multi-routes-src";
const MULTI_ROUTE_LAYER = "multi-routes-line";
const MULTI_ROUTE_LAYER_SELECTED = "multi-routes-line-selected";

const MULTI_ROUTE_POINTS_SOURCE = "multi-routes-points-src";
const MULTI_ROUTE_POINTS_LAYER = "multi-routes-points";

function ensureMultiRoutesLayer(map: AnyMap) {
  // Source for route lines
  if (!map.getSource(MULTI_ROUTE_SOURCE)) {
    map.addSource(MULTI_ROUTE_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  // Base (all routes)
  if (!map.getLayer(MULTI_ROUTE_LAYER)) {
    map.addLayer({
      id: MULTI_ROUTE_LAYER,
      type: "line",
      source: MULTI_ROUTE_SOURCE,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-width": 4,
        "line-opacity": 0.45,
      },
    });
  }

  // Selected overlay (only selected vehicleId)
  if (!map.getLayer(MULTI_ROUTE_LAYER_SELECTED)) {
    map.addLayer({
      id: MULTI_ROUTE_LAYER_SELECTED,
      type: "line",
      source: MULTI_ROUTE_SOURCE,
      filter: ["==", ["get", "selected"], true],
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-width": 6,
        "line-opacity": 0.95,
      },
    });
  }

  // Source for start/end points
  if (!map.getSource(MULTI_ROUTE_POINTS_SOURCE)) {
    map.addSource(MULTI_ROUTE_POINTS_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(MULTI_ROUTE_POINTS_LAYER)) {
    map.addLayer({
      id: MULTI_ROUTE_POINTS_LAYER,
      type: "circle",
      source: MULTI_ROUTE_POINTS_SOURCE,
      paint: {
        "circle-radius": 7,
        "circle-opacity": 0.95,
        "circle-stroke-width": 3,
      },
    });
  }
}

/**
 * Update multi routes + points in one go.
 * - routes: per vehicle
 * - selectedVehicleId: highlights selected route, and makes selected points a bit larger
 */
function updateMultiRoutesData(map: AnyMap, routes: Record<number, VehicleRoute> | undefined, selectedVehicleId: number | null) {
  // Update line data
  const lineFeatures: any[] = [];
  const pointFeatures: any[] = [];

  if (routes) {
    for (const [idStr, r] of Object.entries(routes)) {
      const vid = Number(idStr);
      const line: LngLat[] | null =
        r?.points && r.points.length >= 2 ? r.points : r?.start && r?.end ? [r.start, r.end] : null;

      if (line && line.length >= 2) {
        lineFeatures.push({
          type: "Feature",
          properties: {
            vehicleId: vid,
            selected: selectedVehicleId != null && vid === selectedVehicleId,
          },
          geometry: {
            type: "LineString",
            coordinates: line,
          },
        });
      }

      if (r?.start) {
        pointFeatures.push({
          type: "Feature",
          properties: {
            vehicleId: vid,
            kind: "start",
            selected: selectedVehicleId != null && vid === selectedVehicleId,
          },
          geometry: { type: "Point", coordinates: r.start },
        });
      }

      if (r?.end) {
        pointFeatures.push({
          type: "Feature",
          properties: {
            vehicleId: vid,
            kind: "end",
            selected: selectedVehicleId != null && vid === selectedVehicleId,
          },
          geometry: { type: "Point", coordinates: r.end },
        });
      }
    }
  }

  const lineFC = { type: "FeatureCollection", features: lineFeatures };
  const pointsFC = { type: "FeatureCollection", features: pointFeatures };

  const src = map.getSource(MULTI_ROUTE_SOURCE);
  if (src && src.setData) src.setData(lineFC);

  const psrc = map.getSource(MULTI_ROUTE_POINTS_SOURCE);
  if (psrc && psrc.setData) psrc.setData(pointsFC);

  // Style: set colors via expressions (keep it minimal)
  // We do it here so you don't need extra CSS / layer files.
  if (map.getLayer(MULTI_ROUTE_LAYER)) {
    map.setPaintProperty(MULTI_ROUTE_LAYER, "line-color", [
      "case",
      ["==", ["get", "selected"], true],
      "#2563eb", // selected
      "#64748b", // others
    ]);
  }

  if (map.getLayer(MULTI_ROUTE_LAYER_SELECTED)) {
    map.setPaintProperty(MULTI_ROUTE_LAYER_SELECTED, "line-color", "#2563eb");
  }

  if (map.getLayer(MULTI_ROUTE_POINTS_LAYER)) {
    map.setPaintProperty(MULTI_ROUTE_POINTS_LAYER, "circle-color", [
      "case",
      ["==", ["get", "kind"], "start"],
      "#22c55e",
      "#ef4444",
    ]);

    map.setPaintProperty(MULTI_ROUTE_POINTS_LAYER, "circle-stroke-color", [
      "case",
      ["==", ["get", "selected"], true],
      "#0f172a",
      "rgba(15,23,42,0.35)",
    ]);

    map.setPaintProperty(MULTI_ROUTE_POINTS_LAYER, "circle-radius", [
      "case",
      ["==", ["get", "selected"], true],
      9,
      7,
    ]);
  }
}

export default function MapContainer({
  initialCenter = [10.5267, 52.2647],
  initialZoom = 13,

  showPanel = false,
  toolMode = "SELECT",

  roads = [],
  vehicles = [],
  intersections = [],

  selectedVehicleId = null,

  selectedIntersectionId = null,
  onSelectIntersection,

  newVehicleType = "pkw",

  onRoadFinished,
  onMapClickAddVehicle,

  tlAddMode = "intersection4",
  onAddTrafficLights,

  onPickRoutePoint,

  onVehicleClick,
  onVehicleMoved,

  onMoveIntersectionGroup,

  onClosePanel,

  // ✅ single-route (kept)
  routeStart = null,
  routeEnd = null,
  routePoints = null,

  // ✅ multi-route (new)
  routesByVehicle,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<MarkerMap>({});

  const { mapRef, mapLoaded } = useMapInit({
    containerRef,
    initialCenter,
    initialZoom,
    markersRef,
  });

  // Drawing
  const [isDrawing, setIsDrawing] = useState(false);
  const [coords, setCoords] = useState<LngLat[]>([]);

  useEffect(() => {
    setIsDrawing(showPanel);
    if (!showPanel) setCoords([]);
  }, [showPanel]);

  // ✅ Ensure snap preview layer once map is ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    try {
      ensureSnapPreviewLayer(map);
    } catch {
      // ignore
    }
  }, [mapLoaded, mapRef]);

  // A) Roads
  useRoadLayers({
    map: mapRef.current,
    mapLoaded,
    coords,
    roads,
  });

  // B) Vehicles
  const { dragJustEndedRef, draggingVehicleIdRef } = useVehicleMarkers({
    map: mapRef.current,
    mapLoaded,
    roads,
    vehicles,
    isDrawing,
    markersRef,
    selectedVehicleId,
    onVehicleClick,
    onVehicleMoved,

    // ✅ Snap/Highlight am grünen Startpunkt (für selected route)
    routeStart,

    snapRadiusPx: 20,
    dragThresholdPx: 6,
  });

  // C) Map click actions
  useMapClickActions({
    map: mapRef.current,
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

  // D) Traffic light drag
  useTrafficLightDrag({
    map: mapRef.current,
    mapLoaded,
    isDrawing,
    draggingVehicleIdRef,
    selectedIntersectionId,
    onMoveIntersectionGroup,
  });

  // E) Traffic lights init + click handling
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    let cancelled = false;

    (async () => {
      await ensureTrafficLightsLayer(map);
      if (cancelled) return;

      if (onSelectIntersection) {
        enableTrafficLightsInteractions(map, (intersectionId) => {
          const justEndedAt = (map as any)[TL_DRAG_JUST_ENDED_AT_KEY] as number | undefined;
          if (justEndedAt && Date.now() - justEndedAt < 220) return;
          onSelectIntersection(intersectionId);
        });
      }

      updateTrafficLightsData(map, intersections, roads);
      updateTrafficLightSelection(map, selectedIntersectionId ?? null);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, mapRef]);

  // F) Traffic lights data update
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    updateTrafficLightsData(map, intersections, roads);
  }, [intersections, roads, mapLoaded, mapRef]);

  // G) Traffic lights selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    updateTrafficLightSelection(map, selectedIntersectionId ?? null);
  }, [selectedIntersectionId, mapLoaded, mapRef]);

  // H) Traffic lights zoom refresh
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    let raf = 0;
    const refresh = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateTrafficLightsData(map, intersections, roads);
      });
    };

    map.on("zoom", refresh);
    return () => {
      map.off("zoom", refresh);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mapLoaded, mapRef, intersections, roads]);

  /**
   * ✅ I) MULTI ROUTES DRAWING
   * If routesByVehicle is provided => draw ALL routes + points.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    try {
      ensureMultiRoutesLayer(map);
      updateMultiRoutesData(map, routesByVehicle, selectedVehicleId ?? null);
    } catch (e) {
      console.warn("multi route layer update failed", e);
    }
  }, [mapLoaded, mapRef, routesByVehicle, selectedVehicleId]);

  /**
   * ✅ J) SINGLE ROUTE DRAWING (backward compat)
   * If you still pass routeStart/routeEnd/routePoints, we keep drawing the classic routeLayer too.
   * (You can later remove this if you fully migrate to routesByVehicle.)
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const line: LngLat[] | null =
      routePoints && routePoints.length >= 2 ? routePoints : routeStart && routeEnd ? [routeStart, routeEnd] : null;

    updateRouteData(map, line, routeStart, routeEnd);
  }, [mapLoaded, routeStart, routeEnd, routePoints, mapRef]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {showPanel && (
        <DrawTool
          isDrawing={isDrawing}
          setIsDrawing={setIsDrawing}
          coords={coords}
          setCoords={setCoords}
          onRoadFinished={onRoadFinished}
          onClose={onClosePanel}
          mapLoaded={mapLoaded}
        />
      )}

      <div ref={containerRef} style={{ width: "100%", height: "100%", position: "absolute" }} />
    </div>
  );
}
