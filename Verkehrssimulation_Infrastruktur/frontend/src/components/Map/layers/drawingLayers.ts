// frontend/src/components/Map/layers/drawingLayers.ts
import maplibregl from "maplibre-gl";
import type { RoadSegment } from "../../../types/simTypes";
import { roadsToGeoJSON } from "../../../types/roads";

type LngLat = [number, number];

type LineStringFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: LngLat[] };
    properties: Record<string, unknown>;
  }>;
};

type PointFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: LngLat };
    properties: Record<string, unknown>;
  }>;
};

// -----------------------------
// IDs (aus MapContainer übernommen)
// -----------------------------
export const DRAW_SOURCE_ID = "draw-line-source";
export const DRAW_LAYER_ID = "draw-line-layer";

export const START_SOURCE_ID = "draw-start-source";
export const START_POINT_LAYER_ID = "draw-start-point-layer";
export const START_LABEL_LAYER_ID = "draw-start-label-layer";

export const SAVED_SOURCE_ID = "saved-roads-source";
export const SAVED_LAYER_ID = "saved-roads-layer";

export const SAVED_START_SOURCE_ID = "saved-roads-start-source";
export const SAVED_START_POINT_LAYER_ID = "saved-roads-start-point-layer";
export const SAVED_START_LABEL_LAYER_ID = "saved-roads-start-label-layer";

// -----------------------------
// Helpers
// -----------------------------
export function roadsToStartPointsGeoJSON(roads: RoadSegment[]): PointFeatureCollection {
  const features: PointFeatureCollection["features"] = [];

  for (const r of roads) {
    const pts: [number, number][] = (r as any).points ?? (r as any).path ?? [];
    if (!pts || pts.length === 0) continue;

    // gespeichert als [lat, lon]
    const [lat, lon] = pts[0];
    const lngLat: LngLat = [lon, lat];

    features.push({
      type: "Feature",
      properties: { label: "Start" },
      geometry: { type: "Point", coordinates: lngLat },
    });
  }

  return { type: "FeatureCollection", features };
}

function emptyLine(): LineStringFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function emptyPoints(): PointFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

// -----------------------------
// Ensure Layers
// -----------------------------
export function ensureDrawingLayers(map: maplibregl.Map) {
  const lineEmpty = emptyLine();
  const pointEmpty = emptyPoints();

  // 🔹 aktuelle Zeichnung (Linie)
  if (!map.getSource(DRAW_SOURCE_ID)) {
    map.addSource(DRAW_SOURCE_ID, { type: "geojson", data: lineEmpty as any });
  }
  if (!map.getLayer(DRAW_LAYER_ID)) {
    map.addLayer({
      id: DRAW_LAYER_ID,
      type: "line",
      source: DRAW_SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ff0000",
        "line-width": 4,
        "line-dasharray": [2, 2],
      },
    });
  }

  // ⭐ Startpunkt der aktuellen Zeichnung
  if (!map.getSource(START_SOURCE_ID)) {
    map.addSource(START_SOURCE_ID, { type: "geojson", data: pointEmpty as any });
  }
  if (!map.getLayer(START_POINT_LAYER_ID)) {
    map.addLayer({
      id: START_POINT_LAYER_ID,
      type: "circle",
      source: START_SOURCE_ID,
      paint: {
        "circle-radius": 6,
        "circle-color": "#ff0000",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
  if (!map.getLayer(START_LABEL_LAYER_ID)) {
    map.addLayer({
      id: START_LABEL_LAYER_ID,
      type: "symbol",
      source: START_SOURCE_ID,
      layout: {
        "text-field": "Start",
        "text-size": 12,
        "text-offset": [0, -1.2],
      },
      paint: {
        "text-color": "#000000",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1,
      },
    });
  }
}

export function ensureSavedRoadsLayers(map: maplibregl.Map) {
  const lineEmpty = emptyLine();
  const pointEmpty = emptyPoints();

  // 🔹 gespeicherte Straßen (Linien)
  if (!map.getSource(SAVED_SOURCE_ID)) {
    map.addSource(SAVED_SOURCE_ID, { type: "geojson", data: lineEmpty as any });
  }
  if (!map.getLayer(SAVED_LAYER_ID)) {
    map.addLayer({
      id: SAVED_LAYER_ID,
      type: "line",
      source: SAVED_SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "match",
          ["get", "roadType"],
          "main",
          "#e67e22",
          "bus",
          "#8e44ad",
          /* default */ "#2a7fff",
        ],
        "line-width": 4,
      },
    });
  }

  // ⭐ Startpunkte der gespeicherten Straßen (Punkte + Label)
  if (!map.getSource(SAVED_START_SOURCE_ID)) {
    map.addSource(SAVED_START_SOURCE_ID, { type: "geojson", data: pointEmpty as any });
  }

  if (!map.getLayer(SAVED_START_POINT_LAYER_ID)) {
    map.addLayer({
      id: SAVED_START_POINT_LAYER_ID,
      type: "circle",
      source: SAVED_START_SOURCE_ID,
      paint: {
        "circle-radius": 6,
        "circle-color": "#ff0000",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  if (!map.getLayer(SAVED_START_LABEL_LAYER_ID)) {
    map.addLayer({
      id: SAVED_START_LABEL_LAYER_ID,
      type: "symbol",
      source: SAVED_START_SOURCE_ID,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-offset": [0, -1.2],
      },
      paint: {
        "text-color": "#000000",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1,
      },
    });
  }
}

// -----------------------------
// Update data
// -----------------------------
export function updateDrawingData(map: maplibregl.Map, coords: LngLat[]) {
  const lineSource = map.getSource(DRAW_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  const startSource = map.getSource(START_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

  if (lineSource) {
    const lineData: LineStringFeatureCollection =
      coords.length > 1
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: coords },
              },
            ],
          }
        : emptyLine();

    lineSource.setData(lineData as any);
  }

  if (startSource) {
    const startData: PointFeatureCollection =
      coords.length > 0
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: coords[0] },
              },
            ],
          }
        : emptyPoints();

    startSource.setData(startData as any);
  }
}

export function updateSavedRoadsData(map: maplibregl.Map, roads: RoadSegment[]) {
  const roadsSource = map.getSource(SAVED_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (roadsSource) {
    roadsSource.setData(roadsToGeoJSON(roads) as any);
  }

  const startSource = map.getSource(SAVED_START_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (startSource) {
    startSource.setData(roadsToStartPointsGeoJSON(roads) as any);
  }
}
