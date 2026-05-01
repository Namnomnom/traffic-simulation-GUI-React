// frontend/src/components/Map/VehicleLayer.ts
import maplibregl from "maplibre-gl";
import type { Vehicle } from "../../types/simTypes";

export const VEHICLE_SOURCE_ID = "vehicles-source";

// 2 Layer: Kreis + Symbol (rotierbar)
export const VEHICLE_CIRCLE_LAYER_ID = "vehicles-circle";
export const VEHICLE_SYMBOL_LAYER_ID = "vehicles-symbol";

type PointFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] }; // [lng, lat]
    properties: Record<string, unknown>;
  }>;
};

function emojiForType(t: string) {
  switch (t) {
    case "pkw":
      return "🚗";
    case "lkw":
      return "🚚";
    case "bus":
      return "🚌";
    case "motorrad":
      return "🏍️";
    default:
      return "●";
  }
}

/**
 * Legt GeoJSON-Source + 2 Layer an (Kreis + Emoji).
 * Muss nach map.on("load") aufgerufen werden.
 */
export function ensureVehicleLayer(map: maplibregl.Map) {
  const empty: PointFeatureCollection = { type: "FeatureCollection", features: [] };

  if (!map.getSource(VEHICLE_SOURCE_ID)) {
    map.addSource(VEHICLE_SOURCE_ID, { type: "geojson", data: empty });
  }

  // 1) Hintergrund-Kreis
  if (!map.getLayer(VEHICLE_CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: VEHICLE_CIRCLE_LAYER_ID,
      type: "circle",
      source: VEHICLE_SOURCE_ID,
      paint: {
        "circle-radius": 12,
        "circle-color": [
          "match",
          ["get", "vehicleType"],
          "pkw",
          "#3498db",
          "lkw",
          "#e67e22",
          "bus",
          "#9b59b6",
          "motorrad",
          "#2ecc71",
          /* default */ "#95a5a6",
        ],
        "circle-stroke-width": [
          "case",
          ["boolean", ["get", "selected"], false],
          3, // selected
          2, // normal
        ],
        "circle-stroke-color": [
          "case",
          ["boolean", ["get", "selected"], false],
          "#000000",
          "#ffffff",
        ],
      },
    });
  }

  // 2) Emoji-Symbol oben drauf (rotierbar)
  if (!map.getLayer(VEHICLE_SYMBOL_LAYER_ID)) {
    map.addLayer({
      id: VEHICLE_SYMBOL_LAYER_ID,
      type: "symbol",
      source: VEHICLE_SOURCE_ID,
      layout: {
        "text-field": ["get", "emoji"],
        "text-size": 16,
        "text-allow-overlap": true,
        "text-ignore-placement": true,

        // Rotation
        "text-rotation-alignment": "map",
        "text-rotate": ["coalesce", ["get", "heading"], 0],
      },
    });
  }
}

/**
 * Schreibt Vehicle-Daten in die GeoJSON-Source.
 */
export function updateVehicleData(
  map: maplibregl.Map,
  vehicles: Vehicle[],
  selectedVehicleId: number | null
) {
  const source = map.getSource(VEHICLE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;

  const data: PointFeatureCollection = {
    type: "FeatureCollection",
    features: (vehicles ?? []).map((v) => ({
      type: "Feature",
      properties: {
        id: v.id,
        vehicleType: v.type,
        selected: v.id === selectedVehicleId,
        heading: v.headingDeg ?? 0,
        emoji: emojiForType(v.type),
      },
      geometry: {
        type: "Point",
        coordinates: [v.lon, v.lat],
      },
    })),
  };

  source.setData(data as any);
}

/**
 * Aktiviert Drag&Drop für Fahrzeuge.
 *
 * Wichtig:
 * - Nach ensureVehicleLayer(map) aufrufen (also nach map load)
 * - onVehicleMove updated deinen React-State (setManualVehicles...)
 *
 * Gibt eine cleanup-Funktion zurück.
 */
export function enableVehicleDrag(
  map: maplibregl.Map,
  onVehicleMove: (id: number, lat: number, lon: number) => void
) {
  let draggingVehicleId: number | null = null;

  const setCursor = (c: string) => {
    map.getCanvas().style.cursor = c;
  };

  const onMouseMove = (e: any) => {
    if (draggingVehicleId == null) return;
    onVehicleMove(draggingVehicleId, e.lngLat.lat, e.lngLat.lng);
  };

  const onMouseUp = () => {
    if (draggingVehicleId == null) return;

    draggingVehicleId = null;
    setCursor("");
    map.dragPan.enable();

    map.off("mousemove", onMouseMove);
    map.off("mouseup", onMouseUp);
  };

  const onMouseDown = (e: any) => {
    const f = e.features?.[0];
    const raw = f?.properties?.id;

    // id kommt oft als STRING -> sicher casten
    const id = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(id)) return;

    draggingVehicleId = id;
    setCursor("grabbing");
    map.dragPan.disable();

    map.on("mousemove", onMouseMove as any);
    map.on("mouseup", onMouseUp as any);
  };

  // Drag starten, egal ob man Kreis oder Emoji anklickt
  map.on("mousedown", VEHICLE_CIRCLE_LAYER_ID, onMouseDown);
  map.on("mousedown", VEHICLE_SYMBOL_LAYER_ID, onMouseDown);

  // Hover-Cursor
  const onEnter = () => setCursor("grab");
  const onLeave = () => {
    if (draggingVehicleId == null) setCursor("");
  };
  map.on("mouseenter", VEHICLE_CIRCLE_LAYER_ID, onEnter);
  map.on("mouseleave", VEHICLE_CIRCLE_LAYER_ID, onLeave);
  map.on("mouseenter", VEHICLE_SYMBOL_LAYER_ID, onEnter);
  map.on("mouseleave", VEHICLE_SYMBOL_LAYER_ID, onLeave);

  // Cleanup (wichtig bei React unmount / map remove)
  return () => {
    map.off("mousedown", VEHICLE_CIRCLE_LAYER_ID, onMouseDown);
    map.off("mousedown", VEHICLE_SYMBOL_LAYER_ID, onMouseDown);
    map.off("mouseenter", VEHICLE_CIRCLE_LAYER_ID, onEnter);
    map.off("mouseleave", VEHICLE_CIRCLE_LAYER_ID, onLeave);
    map.off("mouseenter", VEHICLE_SYMBOL_LAYER_ID, onEnter);
    map.off("mouseleave", VEHICLE_SYMBOL_LAYER_ID, onLeave);

    map.off("mousemove", onMouseMove);
    map.off("mouseup", onMouseUp);
  };
}
