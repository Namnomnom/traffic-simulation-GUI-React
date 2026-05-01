// frontend/src/lib/geo.ts
import type { LngLat } from "../types/simTypes";

const EARTH_R = 6371000; // m

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/**
 * Haversine distance (m) – robust, aber etwas teurer.
 * Für deine Route-Längen ok, für "nearest point" nutzen wir unten planar.
 */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);

  const aa =
    s1 * s1 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;

  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return EARTH_R * c;
}

/**
 * Bearing (0..360, 0 = Nord). Einheitlich – nutz das überall (UI + Sim).
 */
export function headingDeg(from: LngLat, to: LngLat): number {
  const [lon1, lat1] = from;
  const [lon2, lat2] = to;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

// ---------------------------------------------------------------------
// Schnelle Planar-Tools (RealLab / kleine Gebiete) für "nearest point"
// ---------------------------------------------------------------------

type XY = { x: number; y: number };

/**
 * Equirectangular projection around a reference latitude.
 * Gut für Stadtmaßstab (RealLab), viel schneller als Haversine.
 */
function toXY(p: LngLat, refLatRad: number): XY {
  const [lng, lat] = p;
  const λ = toRad(lng);
  const φ = toRad(lat);
  return {
    x: EARTH_R * λ * Math.cos(refLatRad),
    y: EARTH_R * φ,
  };
}

function distXY(a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

/**
 * Project point P onto segment AB (in XY meters).
 * Returns:
 *  - t in [0..1]
 *  - closest point
 *  - distance from P to segment
 *  - along-segment distance from A to projection (meters)
 */
export function projectPointToSegmentMeters(
  p: LngLat,
  a: LngLat,
  b: LngLat
): { t: number; distToSegM: number; alongM: number } {
  const refLatRad = toRad((a[1] + b[1] + p[1]) / 3); // local reference
  const P = toXY(p, refLatRad);
  const A = toXY(a, refLatRad);
  const B = toXY(b, refLatRad);

  const ABx = B.x - A.x;
  const ABy = B.y - A.y;
  const APx = P.x - A.x;
  const APy = P.y - A.y;

  const denom = ABx * ABx + ABy * ABy;
  if (denom < 1e-9) {
    // degenerate segment
    const d = distXY(P, A);
    return { t: 0, distToSegM: d, alongM: 0 };
  }

  let t = (APx * ABx + APy * ABy) / denom;
  t = Math.max(0, Math.min(1, t));

  const C = { x: A.x + t * ABx, y: A.y + t * ABy };
  const distToSegM = distXY(P, C);

  const segLenM = Math.hypot(ABx, ABy);
  const alongM = segLenM * t;

  return { t, distToSegM, alongM };
}

/**
 * Find nearest projection of a point onto a polyline route.
 * Returns:
 *  - index i of segment [route[i], route[i+1]]
 *  - alongRouteM: distance from route[0] to projected point (meters)
 *  - distToRouteM: shortest distance point -> route (meters)
 */
export function projectPointToRouteMeters(
  point: LngLat,
  route: LngLat[]
): { segIndex: number; alongRouteM: number; distToRouteM: number } {
  if (route.length < 2) return { segIndex: 0, alongRouteM: 0, distToRouteM: Infinity };

  // wir summieren Segmentlängen planar (schnell) – reicht für Meterposition
  let bestDist = Infinity;
  let bestSeg = 0;
  let bestAlong = 0;

  // kumulierte Länge bis Segmentstart
  let cumM = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];

    const { distToSegM, alongM } = projectPointToSegmentMeters(point, a, b);

    if (distToSegM < bestDist) {
      bestDist = distToSegM;
      bestSeg = i;
      bestAlong = cumM + alongM;
    }

    // Segmentlänge planar fürs cumM
    const refLatRad = toRad((a[1] + b[1]) / 2);
    const A = toXY(a, refLatRad);
    const B = toXY(b, refLatRad);
    cumM += distXY(A, B);
  }

  return { segIndex: bestSeg, alongRouteM: bestAlong, distToRouteM: bestDist };
}

// Backwards-compatible alias (damit bestehende Imports weiter funktionieren)
export const computeHeadingDeg = headingDeg;
