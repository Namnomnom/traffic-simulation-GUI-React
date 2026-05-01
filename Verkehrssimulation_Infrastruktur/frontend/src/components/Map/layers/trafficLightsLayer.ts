// frontend/src/components/Map/layers/trafficLightsLayer.ts
import type maplibregl from "maplibre-gl";
import type { IntersectionVisual } from "../../../lib/intersectionsToGeoJSON";
import type { RoadSegment } from "../../../types/simTypes";
import { intersectionsToTrafficLightHeads } from "./trafficLightsGeo";
import { ensureTrafficLightIcons } from "./trafficLightIcons";

export const TL_SOURCE_ID = "trafficlights-heads-source";
export const TL_LAYER_ID = "trafficlights-heads-layer";
export const TL_LABEL_LAYER_ID = "trafficlights-heads-label";
export const TL_SELECTED_HALO_LAYER_ID = "trafficlights-selected-halo";

// One-time binding flag (per map instance)
const TL_EVENTS_BOUND_KEY = "__tl_events_bound__";

// Click “consume”-flag so useMapClick doesn't also add
export const TL_CLICK_CONSUMED_KEY = "__tl_click_consumed__";

// Drag state flags (used by MapContainer / click suppression)
export const TL_DRAGGING_KEY = "__tl_dragging__";
export const TL_DRAG_JUST_ENDED_AT_KEY = "__tl_drag_just_ended_at__";

type EnsureTLOpts = {
  /** Remove N/E/S/W labels completely */
  showLabels?: boolean;
};

type UpdateTLOpts = {
  /** Optional override. If not set, defaultOffsetMeters is used. */
  offsetMeters?: number;
  /** If true, uses zoom-based offset; otherwise defaultOffsetMeters is used. */
  zoomAdaptiveOffset?: boolean;
  /** Used when zoomAdaptiveOffset=false and offsetMeters is not provided. */
  defaultOffsetMeters?: number;
};

const DEFAULT_LABELS = false;

/**
 * ✅ WICHTIG: Fixer Meter-Offset (damit Icon-Position NICHT mit Zoom wandert)
 * Muss exakt zu App.tsx StopPoints OFFSET_METERS passen.
 *
 * Tipp: In App.tsx ebenfalls 2 verwenden.
 */
export const TL_ICON_OFFSET_METERS = 2;

/**
 * Zoom-abhängiger Offset (optional; Default ist AUS)
 */
function offsetMetersForZoom(z: number) {
  const zoom = Math.max(12, Math.min(22, z));
  const t = (zoom - 12) / (22 - 12); // 0..1
  const meters = 12 - t * (12 - 2.5);
  return Math.max(2.5, Math.min(14, meters));
}

export async function ensureTrafficLightsLayer(map: maplibregl.Map, opts?: EnsureTLOpts) {
  const showLabels = opts?.showLabels ?? DEFAULT_LABELS;

  await ensureTrafficLightIcons(map);

  if (!map.getSource(TL_SOURCE_ID)) {
    map.addSource(TL_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  // Selection halo
  if (!map.getLayer(TL_SELECTED_HALO_LAYER_ID)) {
    map.addLayer({
      id: TL_SELECTED_HALO_LAYER_ID,
      type: "circle",
      source: TL_SOURCE_ID,
      filter: ["==", ["get", "intersectionId"], ""],
      paint: {
        "circle-radius": 10,
        "circle-color": "rgba(0, 123, 255, 0.18)",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "rgba(0, 123, 255, 0.95)",
        "circle-radius-transition": { duration: 0, delay: 0 },
        "circle-color-transition": { duration: 0, delay: 0 },
        "circle-stroke-width-transition": { duration: 0, delay: 0 },
        "circle-stroke-color-transition": { duration: 0, delay: 0 },
      },
    });
  }

  // Icons
  if (!map.getLayer(TL_LAYER_ID)) {
    map.addLayer({
      id: TL_LAYER_ID,
      type: "symbol",
      source: TL_SOURCE_ID,
      layout: {
        "icon-image": [
          "match",
          ["upcase", ["to-string", ["get", "state"]]],
          "GREEN",
          "tl-green",
          "YELLOW",
          "tl-yellow",
          "RED",
          "tl-red",
          "tl-red",
        ],
        "icon-size": 0.55,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,

        // ✅ Bearing ist in degrees (0=N) und wird in trafficLightsGeo.ts so gesetzt
        "icon-rotation-alignment": "map",
        "icon-rotate": ["coalesce", ["get", "bearing"], 0],
        "icon-pitch-alignment": "map",
      },
      paint: {
        "icon-opacity-transition": { duration: 0, delay: 0 },
      },
    });
  }

  // Labels (optional)
  if (showLabels) {
    if (!map.getLayer(TL_LABEL_LAYER_ID)) {
      map.addLayer({
        id: TL_LABEL_LAYER_ID,
        type: "symbol",
        source: TL_SOURCE_ID,
        layout: {
          "text-field": ["get", "dir"],
          "text-size": 11,
          "text-offset": [0, 1.0],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-pitch-alignment": "map",
        },
        paint: {
          "text-color": "rgba(0,0,0,0.75)",
          "text-halo-color": "rgba(255,255,255,0.9)",
          "text-halo-width": 2,
          "text-opacity-transition": { duration: 0, delay: 0 },
        },
      });
    }
  } else {
    // Falls Layer noch aus alten Runs existiert: entfernen
    if (map.getLayer(TL_LABEL_LAYER_ID)) {
      try {
        map.removeLayer(TL_LABEL_LAYER_ID);
      } catch {
        // ignore
      }
    }
  }

  // place halo below icon layer (so it doesn't cover icons)
  try {
    map.moveLayer(TL_SELECTED_HALO_LAYER_ID, TL_LAYER_ID);
  } catch {
    // ignore
  }
}

export function updateTrafficLightsData(
  map: maplibregl.Map,
  intersections: IntersectionVisual[],
  roads: RoadSegment[],
  opts?: UpdateTLOpts
) {
  const src = map.getSource(TL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;

  // ✅ Default FIX (damit StopPoints == Icon-Position bleiben)
  const zoomAdaptiveOffset = opts?.zoomAdaptiveOffset ?? false;
  const defaultOffsetMeters = opts?.defaultOffsetMeters ?? TL_ICON_OFFSET_METERS;

  const offsetMeters =
    typeof opts?.offsetMeters === "number"
      ? opts.offsetMeters
      : zoomAdaptiveOffset
        ? offsetMetersForZoom(map.getZoom())
        : defaultOffsetMeters;

  const fc = intersectionsToTrafficLightHeads(intersections, roads, { offsetMeters });
  src.setData(fc as any);
}

export function updateTrafficLightSelection(map: maplibregl.Map, selectedId: string | null) {
  if (!map.getLayer(TL_SELECTED_HALO_LAYER_ID)) return;

  map.setFilter(
    TL_SELECTED_HALO_LAYER_ID,
    selectedId ? ["==", ["get", "intersectionId"], selectedId] : ["==", ["get", "intersectionId"], ""]
  );
}

// Click + Hover on TL icons: select intersection
export function enableTrafficLightsInteractions(map: maplibregl.Map, onSelectIntersectionId: (id: string) => void) {
  // prevent double-binding on same map instance (HMR safe)
  if ((map as any)[TL_EVENTS_BOUND_KEY]) return;
  (map as any)[TL_EVENTS_BOUND_KEY] = true;

  map.on("mouseenter", TL_LAYER_ID, () => {
    if (!(map as any)[TL_DRAGGING_KEY]) map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", TL_LAYER_ID, () => {
    if (!(map as any)[TL_DRAGGING_KEY]) map.getCanvas().style.cursor = "";
  });

  map.on("click", TL_LAYER_ID, (e) => {
    // ignore click if dragging or just ended
    if ((map as any)[TL_DRAGGING_KEY]) return;

    const endedAt = (map as any)[TL_DRAG_JUST_ENDED_AT_KEY] as number | undefined;
    if (endedAt && Date.now() - endedAt < 220) return;

    // consume click so useMapClick doesn't add
    (map as any)[TL_CLICK_CONSUMED_KEY] = true;
    setTimeout(() => ((map as any)[TL_CLICK_CONSUMED_KEY] = false), 0);

    const f = e.features?.[0];
    const id = f?.properties?.intersectionId;
    if (typeof id === "string" && id.length > 0) onSelectIntersectionId(id);
  });
}
