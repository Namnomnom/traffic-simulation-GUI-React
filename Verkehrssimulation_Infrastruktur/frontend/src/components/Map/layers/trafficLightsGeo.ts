// frontend/src/components/Map/layers/trafficLightsGeo.ts
import type { IntersectionVisual } from "../../../lib/intersectionsToGeoJSON";
import type { RoadSegment } from "../../../types/simTypes";
import { findRoadBearingsNearPoint } from "./trafficLightsPlacement";

type TLState = "RED" | "YELLOW" | "GREEN";
type Dir = "N" | "E" | "S" | "W";
type LngLat = [number, number];

type AnyItx = IntersectionVisual & Record<string, any>;

type Feature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: LngLat };
  properties: {
    intersectionId: string;
    lightId: string;
    dir: Dir | "SINGLE";
    state: TLState;
    bearing: number;
  };
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

// --------------------------------------------------
// Helpers
// --------------------------------------------------
function normDeg(x: number): number {
  return ((x % 360) + 360) % 360;
}

function asNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function getIntersectionId(itx: AnyItx): string {
  const id = itx?.id;
  return typeof id === "string" ? id : String(id ?? "");
}

function getCenter(itx: AnyItx): LngLat {
  const p = itx?.point;
  if (Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number") {
    return [p[0], p[1]];
  }
  // fallback (sollte eigentlich nie passieren)
  const lng = asNumber(itx?.lng ?? itx?.lon ?? itx?.x) ?? 0;
  const lat = asNumber(itx?.lat ?? itx?.y) ?? 0;
  return [lng, lat];
}

function getKind(itx: AnyItx): "single" | "intersection" {
  return itx?.kind === "single" ? "single" : "intersection";
}

function getBearingDeg(itx: AnyItx): number {
  // tolerant: bearing oder bearingDeg
  const b = asNumber(itx?.bearing) ?? asNumber(itx?.bearingDeg) ?? 0;
  return normDeg(b);
}

/**
 * Offset point by meters along bearing (0° = North).
 * NOTE: Must match StopPoints math, otherwise vehicles stop "next to" icon.
 */
function offsetLngLatMeters([lng, lat]: LngLat, meters: number, bearingDeg: number): LngLat {
  const R = 6378137;
  const br = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;

  const dLat = (meters * Math.cos(br)) / R;
  const dLng = (meters * Math.sin(br)) / (R * Math.cos(latRad));

  return [lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI];
}

// --------------------------------------------------
// Phase → Signal state (für Kreuzung)
// --------------------------------------------------
function normalizePhase(p: unknown):
  | "NS_GREEN"
  | "NS_YELLOW"
  | "NS_RED_YELLOW"
  | "EW_GREEN"
  | "EW_YELLOW"
  | "EW_RED_YELLOW"
  | "ALL_RED_1"
  | "ALL_RED_2"
  | undefined {
  if (typeof p !== "string") return undefined;
  switch (p) {
    case "NS_GREEN":
    case "NS_YELLOW":
    case "NS_RED_YELLOW":
    case "EW_GREEN":
    case "EW_YELLOW":
    case "EW_RED_YELLOW":
    case "ALL_RED_1":
    case "ALL_RED_2":
      return p;
    default:
      return undefined;
  }
}

function stateForDir(phaseRaw: unknown, dir: Dir): TLState {
  const phase = normalizePhase(phaseRaw);

  // default: safe (alles rot)
  if (!phase) return "RED";

  switch (phase) {
    case "NS_GREEN":
      return dir === "N" || dir === "S" ? "GREEN" : "RED";

    case "NS_YELLOW":
    case "NS_RED_YELLOW":
      return dir === "N" || dir === "S" ? "YELLOW" : "RED";

    case "EW_GREEN":
      return dir === "E" || dir === "W" ? "GREEN" : "RED";

    case "EW_YELLOW":
    case "EW_RED_YELLOW":
      return dir === "E" || dir === "W" ? "YELLOW" : "RED";

    case "ALL_RED_1":
    case "ALL_RED_2":
    default:
      return "RED";
  }
}

// SINGLE: tolerant state reader
function stateForSingle(itx: AnyItx): TLState {
  // akzeptiert: itx.light, itx.state, itx.tlState
  const raw = (itx?.light ?? itx?.state ?? itx?.tlState) as unknown;

  if (raw === "GREEN" || raw === "YELLOW" || raw === "RED") return raw;

  // manche speichern "green"/"red" klein
  if (typeof raw === "string") {
    const up = raw.toUpperCase();
    if (up === "GREEN" || up === "YELLOW" || up === "RED") return up as TLState;
  }

  return "RED";
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------
export function intersectionsToTrafficLightHeads(
  intersections: IntersectionVisual[],
  roads: RoadSegment[],
  opts?: { offsetMeters?: number }
): FeatureCollection {
  const offsetMeters = typeof opts?.offsetMeters === "number" ? opts.offsetMeters : 2;

  const features: Feature[] = [];

  for (const raw of intersections as AnyItx[]) {
    const itx = raw as AnyItx;
    const id = getIntersectionId(itx);
    const kind = getKind(itx);
    const center = getCenter(itx);

    // --------------------------------------------------
    // SINGLE LIGHT (1 head)
    // --------------------------------------------------
    if (kind === "single") {
      // armBearing: direction "out of intersection" (used for icon position)
      const armBearing = getBearingDeg(itx);
      const pos = offsetLngLatMeters(center, offsetMeters, armBearing);

      // bearing: direction FROM which the vehicle approaches (icon faces the car)
      const approachBearing = normDeg(armBearing + 180);

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: pos },
        properties: {
          intersectionId: id,
          lightId: `${id}:single`,
          dir: "SINGLE",
          state: stateForSingle(itx),
          bearing: approachBearing,
        },
      });

      continue;
    }

    // --------------------------------------------------
    // INTERSECTION (4 heads)
    // --------------------------------------------------
    let axisA: number;
    let axisB: number;

    // Prefer stored bearing (user rotation)
    const storedBearing = asNumber(itx?.bearing) ?? asNumber(itx?.bearingDeg);
    if (storedBearing != null) {
      axisA = normDeg(storedBearing);
      axisB = normDeg(axisA + 90);
    } else {
      // fallback: derive from roads
      const found = findRoadBearingsNearPoint(roads, center);
      axisA = Number.isFinite(found?.[0] as any) ? normDeg(found![0]) : 0;
      axisB = Number.isFinite(found?.[1] as any) ? normDeg(found![1]) : 90;
    }

    const arms: Array<{ dir: Dir; armBearing: number }> = [
      { dir: "N", armBearing: axisA },
      { dir: "S", armBearing: normDeg(axisA + 180) },
      { dir: "E", armBearing: axisB },
      { dir: "W", armBearing: normDeg(axisB + 180) },
    ];

    for (const { dir, armBearing } of arms) {
      const pos = offsetLngLatMeters(center, offsetMeters, armBearing);
      const approachBearing = normDeg(armBearing + 180);

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: pos },
        properties: {
          intersectionId: id,
          lightId: `${id}:${dir}`, // z.B. "K3:N"
          dir,
          state: stateForDir(itx?.phase, dir),
          bearing: approachBearing,
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}
