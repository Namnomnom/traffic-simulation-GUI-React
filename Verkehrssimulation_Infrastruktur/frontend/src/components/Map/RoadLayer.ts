// frontend/src/components/Map/RoadLayer.ts
import maplibregl from "maplibre-gl";
import type { RoadSegment, Vehicle } from "../../types/simTypes";

// ---------------------------
// Roads/Routes (Lines)
// ---------------------------
export const ROADS_SOURCE_ID = "roads-source";
export const ROADS_LAYER_ID = "roads-layer";

/**
 * Legt eine GeoJSON-Quelle + Line-Layer für gezeichnete Straßen/Routes an.
 * (Wenn du schon eigene RoadLayer IDs hast, passe sie an oder entferne diesen Teil.)
 */
export function ensureRoadLayer(map: maplibregl.Map) {
  if (!map.getSource(ROADS_SOURCE_ID)) {
    map.addSource(ROADS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(ROADS_LAYER_ID)) {
    map.addLayer({
      id: ROADS_LAYER_ID,
      type: "line",
      source: ROADS_SOURCE_ID,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-width": 4,
        "line-color": [
          "match",
          ["get", "roadType"],
          "city",
          "#1f77ff", // blau
          "main",
          "#ff7f0e", // orange
          "bus",
          "#8a2be2", // lila
          /* default */ "#1f77ff",
        ],
      },
    });
  }
}

/**
 * Schreibt RoadSegments in die Road-Quelle.
 */
export function updateRoadData(map: maplibregl.Map, roads: RoadSegment[]) {
  const source = map.getSource(ROADS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;

  const data = {
    type: "FeatureCollection" as const,
    features: (roads ?? []).map((r) => ({
      type: "Feature" as const,
      properties: {
        id: r.id,
        roadType: r.roadType,
      },
      geometry: {
        type: "LineString" as const,
        // RoadSegment points sind bei dir: [lat, lon]
        coordinates: r.points.map(([lat, lon]) => [lon, lat]),
      },
    })),
  };

  source.setData(data as any);
}

// ---------------------------
// Route Start Marker (Point)
// ---------------------------
export const ROUTE_START_SOURCE_ID = "route-start-source";
export const ROUTE_START_LAYER_ID = "route-start-layer";
export const ROUTE_START_LABEL_LAYER_ID = "route-start-label-layer";

/**
 * Legt eine GeoJSON-Quelle + Circle-Layer für den Startpunkt an.
 */
export function ensureRouteStartLayer(map: maplibregl.Map) {
  if (!map.getSource(ROUTE_START_SOURCE_ID)) {
    map.addSource(ROUTE_START_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(ROUTE_START_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_START_LAYER_ID,
      type: "circle",
      source: ROUTE_START_SOURCE_ID,
      paint: {
        "circle-radius": 7,
        "circle-color": "#ff2d2d",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  // optional: Label "Start"
  if (!map.getLayer(ROUTE_START_LABEL_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_START_LABEL_LAYER_ID,
      type: "symbol",
      source: ROUTE_START_SOURCE_ID,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-offset": [0, -1.2],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#ff2d2d",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1,
      },
    });
  }
}

/**
 * ✅ Das ist der entscheidende Part:
 * Schreibt den Startpunkt der Route des ausgewählten Fahrzeugs in die Source,
 * damit er wirklich sichtbar ist.
 */
export function updateRouteStartData(
  map: maplibregl.Map,
  vehicles: Vehicle[],
  selectedVehicleId: number | null
) {
  const source = map.getSource(ROUTE_START_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;

  const v = (vehicles ?? []).find((x) => x.id === selectedVehicleId);
  const start = v?.routePoints?.[0]; // [lat, lon] bei dir

  const data = {
    type: "FeatureCollection" as const,
    features: start
      ? [
          {
            type: "Feature" as const,
            properties: { label: "Start" },
            geometry: {
              type: "Point" as const,
              coordinates: [start[1], start[0]], // [lon, lat]
            },
          },
        ]
      : [],
  };

  source.setData(data as any);
}
