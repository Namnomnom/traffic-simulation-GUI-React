// frontend/src/components/Map/layers/stopLineLayer.ts
import maplibregl from "maplibre-gl";
import type { LngLat } from "../../../types/simTypes";

export const STOPLINE_SOURCE_ID = "stopline-source";
export const STOPLINE_LAYER_ID = "stopline-layer";

function emptyFC() {
  return { type: "FeatureCollection" as const, features: [] as any[] };
}

export function ensureStopLineLayer(map: maplibregl.Map) {
  if (!map.getSource(STOPLINE_SOURCE_ID)) {
    map.addSource(STOPLINE_SOURCE_ID, { type: "geojson", data: emptyFC() });
  }

  if (!map.getLayer(STOPLINE_LAYER_ID)) {
    map.addLayer({
      id: STOPLINE_LAYER_ID,
      type: "line",
      source: STOPLINE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        // typische Stopplinie: weiß, relativ dick
        "line-color": "rgba(255,255,255,0.95)",
        "line-width": 5,
        "line-opacity": 0.95,
      },
    });
  }
}

/**
 * Minimal: zeichnet Stopplinien aus Kreuzungszentrum + Bearings.
 * bearingsDeg: z.B. [0, 90, 180, 270] (0=N, 90=E, 180=S, 270=W)
 *
 * Annahme: bearing zeigt die Zufahrtsrichtung zur Kreuzung (Fahrzeuge kommen "aus der Richtung" und fahren zum Zentrum).
 */
export function updateStopLines(
  map: maplibregl.Map,
  intersections: Array<{
    id: string;
    center: LngLat;        // [lng, lat]
    bearingsDeg: number[]; // typischerweise 4 Werte
  }>,
  opts?: {
    stopDistanceM?: number; // Abstand der Stopplinie vor dem Zentrum (Meter)
    lineLengthM?: number;   // Länge der Stopplinie quer zur Fahrbahn (Meter)
  }
) {
  const src = map.getSource(STOPLINE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;

  const stopDistanceM = opts?.stopDistanceM ?? 12; // default 12m vor Kreuzung
  const lineLengthM = opts?.lineLengthM ?? 8;      // default 8m Querlinie

  const features: any[] = [];

  for (const itx of intersections) {
    const { lng, lat } = { lng: itx.center[0], lat: itx.center[1] };

    // Mercator für "Meter-Offsets" (super praktisch für kleine Distanzen)
    const c = maplibregl.MercatorCoordinate.fromLngLat({ lng, lat }, 0);
    const unitsPerMeter = c.meterInMercatorCoordinateUnits();

    for (let arm = 0; arm < itx.bearingsDeg.length; arm++) {
      const bearing = itx.bearingsDeg[arm];
      const rad = (bearing * Math.PI) / 180;

      // Richtung in Mercator: x=Ost, y=Süd
      // bearing 0 = Nord => y muss kleiner werden => dy = -cos(rad)
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);

      // Stopplinie liegt "vor" der Kreuzung entlang der Zufahrt:
      // stopPoint = center - dir * stopDistance
      const off = stopDistanceM * unitsPerMeter;
      const stopX = c.x - dx * off;
      const stopY = c.y - dy * off;

      // Quer-Vektor (perpendicular) zur Fahrtrichtung
      const px = -dy;
      const py = dx;

      const halfLen = (lineLengthM / 2) * unitsPerMeter;

      const a = new maplibregl.MercatorCoordinate(stopX + px * halfLen, stopY + py * halfLen, 0);
      const b = new maplibregl.MercatorCoordinate(stopX - px * halfLen, stopY - py * halfLen, 0);

      const aLngLat = a.toLngLat();
      const bLngLat = b.toLngLat();

      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [aLngLat.lng, aLngLat.lat],
            [bLngLat.lng, bLngLat.lat],
          ],
        },
        properties: {
          kind: "stopline",
          intersectionId: itx.id,
          arm,
          bearing,
        },
      });
    }
  }

  src.setData({ type: "FeatureCollection", features } as any);
}
