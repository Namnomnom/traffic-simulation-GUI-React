// frontend/src/components/Map/layers/routeLayer.ts
import type maplibregl from "maplibre-gl";

export const ROUTE_SOURCE_ID = "route-source";

// ✅ Damit useMapInit.ts passt:
export const ROUTE_LINE_LAYER_ID = "route-line-layer";

// (optional kompatibel lassen, falls irgendwo noch ROUTE_LAYER_ID verwendet wird)
export const ROUTE_LAYER_ID = ROUTE_LINE_LAYER_ID;

export const ROUTE_START_SOURCE_ID = "route-start-source";
export const ROUTE_START_LAYER_ID = "route-start-layer";

// ✅ NEU: eigener End-Layer (damit useMapInit.ts nicht crasht)
export const ROUTE_END_LAYER_ID = "route-end-layer";

// ✅ grüner Startpunkt: Radius-Highlight via feature-state("active")
export const ROUTE_START_RADIUS_SOURCE_ID = "route-start-radius-source";
export const ROUTE_START_RADIUS_LAYER_ID = "route-start-radius-layer";

type LngLat = [number, number];

function emptyLine() {
  return { type: "FeatureCollection" as const, features: [] as any[] };
}

function emptyPoints() {
  return { type: "FeatureCollection" as const, features: [] as any[] };
}

export function ensureRouteLayer(map: maplibregl.Map) {
  // ---------------------------
  // Route line
  // ---------------------------
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: emptyLine() as any,
    });
  }

  if (!map.getLayer(ROUTE_LINE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LINE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-width": 4,
        "line-color": "#2b7cff",
        "line-opacity": 0.85,
      },
    });
  }

  // ---------------------------
  // Start/End points (small dots)
  // ---------------------------
  if (!map.getSource(ROUTE_START_SOURCE_ID)) {
    map.addSource(ROUTE_START_SOURCE_ID, {
      type: "geojson",
      data: emptyPoints() as any,
    });
  }

  // ✅ Start layer: filter kind=start
  if (!map.getLayer(ROUTE_START_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_START_LAYER_ID,
      type: "circle",
      source: ROUTE_START_SOURCE_ID,
      filter: ["==", ["get", "kind"], "start"],
      paint: {
        "circle-radius": 7,
        "circle-color": "#00c853",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  // ✅ End layer: filter kind=end (ROT)
  if (!map.getLayer(ROUTE_END_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_END_LAYER_ID,
      type: "circle",
      source: ROUTE_START_SOURCE_ID,
      filter: ["==", ["get", "kind"], "end"],
      paint: {
        "circle-radius": 7,
        "circle-color": "#e53935",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  // ---------------------------
  // Start-radius highlight (bigger halo; toggled via feature-state "active")
  // ---------------------------
  if (!map.getSource(ROUTE_START_RADIUS_SOURCE_ID)) {
    map.addSource(ROUTE_START_RADIUS_SOURCE_ID, {
      type: "geojson",
      data: emptyPoints() as any,
    });
  }

  if (!map.getLayer(ROUTE_START_RADIUS_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_START_RADIUS_LAYER_ID,
      type: "circle",
      source: ROUTE_START_RADIUS_SOURCE_ID,
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "active"], false], 18, 12],
        "circle-color": "rgba(0, 200, 83, 0.22)",
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(0, 200, 83, 0.85)",
        "circle-radius-transition": { duration: 0, delay: 0 },
        "circle-color-transition": { duration: 0, delay: 0 },
        "circle-stroke-width-transition": { duration: 0, delay: 0 },
        "circle-stroke-color-transition": { duration: 0, delay: 0 },
      },
    });

    // place halo below start dot
    try {
      map.moveLayer(ROUTE_START_RADIUS_LAYER_ID, ROUTE_START_LAYER_ID);
    } catch {
      // ignore
    }
  }

  // ✅ Optional: End über Start oder umgekehrt – hier End über Start
  try {
    map.moveLayer(ROUTE_END_LAYER_ID);
  } catch {
    // ignore
  }
}

export function updateRouteData(
  map: maplibregl.Map,
  line: LngLat[] | null,
  routeStart: LngLat | null,
  routeEnd: LngLat | null
) {
  ensureRouteLayer(map);

  const routeSrc = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  const ptsSrc = map.getSource(ROUTE_START_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  const haloSrc = map.getSource(ROUTE_START_RADIUS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

  if (routeSrc) {
    if (!line || line.length < 2) {
      routeSrc.setData(emptyLine() as any);
    } else {
      routeSrc.setData(
        {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: line },
            },
          ],
        } as any
      );
    }
  }

  const pts: any[] = [];
  if (routeStart) {
    pts.push({
      type: "Feature",
      id: "start",
      properties: { kind: "start" },
      geometry: { type: "Point", coordinates: routeStart },
    });
  }
  if (routeEnd) {
    pts.push({
      type: "Feature",
      id: "end",
      properties: { kind: "end" },
      geometry: { type: "Point", coordinates: routeEnd },
    });
  }

  if (ptsSrc) {
    ptsSrc.setData({ type: "FeatureCollection", features: pts } as any);
  }

  // halo uses only start point with fixed id "start-radius"
  if (haloSrc) {
    if (!routeStart) {
      haloSrc.setData(emptyPoints() as any);
    } else {
      haloSrc.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "start-radius",
            properties: {},
            geometry: { type: "Point", coordinates: routeStart },
          },
        ],
      } as any);

      try {
        map.setFeatureState({ source: ROUTE_START_RADIUS_SOURCE_ID, id: "start-radius" }, { active: false });
      } catch {
        // ignore
      }
    }
  }
}
