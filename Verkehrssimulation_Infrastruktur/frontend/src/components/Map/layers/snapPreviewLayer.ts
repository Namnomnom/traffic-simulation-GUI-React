// frontend/src/components/Map/layers/snapPreviewLayer.ts
import maplibregl from "maplibre-gl";

type LngLat = [number, number];

// IDs (aus MapContainer übernommen)
export const SNAP_PREVIEW_SOURCE_ID = "snap-preview-source";
export const SNAP_PREVIEW_LAYER_ID = "snap-preview-layer";

type PointFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: LngLat };
    properties: Record<string, unknown>;
  }>;
};

function emptyPoints(): PointFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/**
 * Legt die Snap-Preview Source + Layer an (grüner Kreis).
 * Einmalig in map.on("load") aufrufen.
 */
export function ensureSnapPreviewLayer(map: maplibregl.Map | null | undefined) {
  if (!map) return;

  // ✅ Falls Style noch nicht geladen ist, nichts tun (MapLibre wirft sonst Fehler)
  if (!map.isStyleLoaded()) return;

  if (!map.getSource(SNAP_PREVIEW_SOURCE_ID)) {
    map.addSource(SNAP_PREVIEW_SOURCE_ID, {
      type: "geojson",
      data: emptyPoints() as any,
    });
  }

  if (!map.getLayer(SNAP_PREVIEW_LAYER_ID)) {
    map.addLayer({
      id: SNAP_PREVIEW_LAYER_ID,
      type: "circle",
      source: SNAP_PREVIEW_SOURCE_ID,
      paint: {
        "circle-radius": 10,
        "circle-color": "#00ff00",
        "circle-opacity": 0.6,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
}

/**
 * Setzt die Preview auf einen Punkt oder blendet sie aus (lngLat = null).
 * Wird während Drag/Placement aufgerufen.
 */
export function setSnapPreview(map: maplibregl.Map | null | undefined, lngLat: LngLat | null) {
  if (!map) return;

  // ✅ Schutz: Wenn Style/Layers noch nicht da sind, nicht crashen
  if (!map.isStyleLoaded()) return;

  const src = map.getSource(SNAP_PREVIEW_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;

  if (!lngLat) {
    src.setData(emptyPoints() as any);
    return;
  }

  const data: PointFeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: lngLat },
      },
    ],
  };

  src.setData(data as any);
}

/**
 * Optional: radius (Pixel) dynamisch ändern.
 * Wenn du später SNAP_RADIUS_PX visuell anpassen willst.
 */
export function setSnapPreviewRadiusPx(map: maplibregl.Map | null | undefined, radiusPx: number) {
  if (!map) return;
  if (!map.isStyleLoaded()) return;
  if (!map.getLayer(SNAP_PREVIEW_LAYER_ID)) return;
  map.setPaintProperty(SNAP_PREVIEW_LAYER_ID, "circle-radius", radiusPx);
}
