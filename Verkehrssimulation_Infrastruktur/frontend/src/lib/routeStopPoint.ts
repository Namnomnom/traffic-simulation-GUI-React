// frontend/src/lib/routeStopPoint.ts
import type { LngLat } from "../types/simTypes";
import { distanceMeters } from "./geo";

export type ProjectedOnRoute = {
  segIndex: number; // Segment i = [i -> i+1]
  t: number; // 0..1 auf dem Segment
  sM: number; // Arc-length entlang Route (Meter ab route[0]) ✅ SAME AS SIM
  lateralM: number; // seitlicher Abstand (Meter) zur Route
};

/**
 * einfache lon/lat -> lokale Meter (Equirectangular) um refLat (nur für t/lateral!)
 */
function toXYMeters(p: LngLat, refLat: number) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const x = p[0] * rad * R * Math.cos(refLat * rad);
  const y = p[1] * rad * R;
  return { x, y };
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function normDeg(x: number) {
  return ((x % 360) + 360) % 360;
}

function angleDiffDeg(a: number, b: number) {
  const d = ((a - b + 540) % 360) - 180;
  return Math.abs(d);
}

/**
 * Bearing (Grad) – stabil genug fürs Routing/Filter.
 * 0 = Norden, 90 = Osten (wie in deinem restlichen Code)
 */
function bearingDeg(a: LngLat, b: LngLat): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const toDeg = (x: number) => (x * 180) / Math.PI;

  const [lon1, lat1] = a;
  const [lon2, lat2] = b;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return normDeg(toDeg(θ));
}

/**
 * Projektiert Punkt p auf Polyline route und liefert:
 * - t + lateralM aus planar-projection (stabil)
 * - sM (Arc-length) aus distanceMeters (Haversine) ✅ passt zu sim.kpis.distanceTraveledM
 */
export function projectPointToRoute(route: LngLat[], p: LngLat): ProjectedOnRoute | null {
  if (!route || route.length < 2) return null;

  const refLat = route[0][1];
  const P = toXYMeters(p, refLat);

  let best: ProjectedOnRoute | null = null;
  let bestDist2 = Infinity;

  // ✅ cumulative in SAME meters as sim (distanceMeters)
  let sAccumSimM = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const A_ll = route[i];
    const B_ll = route[i + 1];

    const A = toXYMeters(A_ll, refLat);
    const B = toXYMeters(B_ll, refLat);

    const ABx = B.x - A.x;
    const ABy = B.y - A.y;

    const APx = P.x - A.x;
    const APy = P.y - A.y;

    const ab2 = ABx * ABx + ABy * ABy;
    const segLenSimM = Math.max(0, distanceMeters(A_ll, B_ll));

    if (ab2 < 1e-9) {
      // trotzdem sim-meter updaten
      sAccumSimM += segLenSimM;
      continue;
    }

    const tRaw = (APx * ABx + APy * ABy) / ab2;
    const t = clamp01(tRaw);

    const Cx = A.x + ABx * t;
    const Cy = A.y + ABy * t;

    const dx = P.x - Cx;
    const dy = P.y - Cy;
    const dist2 = dx * dx + dy * dy;

    const sM = sAccumSimM + segLenSimM * t;
    const lateralM = Math.sqrt(dist2);

    if (dist2 < bestDist2) {
      bestDist2 = dist2;
      best = { segIndex: i, t, sM, lateralM };
    }

    sAccumSimM += segLenSimM;
  }

  return best;
}

/**
 * Findet den nächsten StopPoint, der:
 * - nahe an der Route liegt (lateral <= lateralMaxM)
 * - vor dem Fahrzeug liegt (stopS > traveledM + minAheadM)
 * - optional: in Fahrtrichtung passt (über StopPoint.bearingDeg)
 *
 * ✅ Optimierung:
 * - wenn mehrere StopPoints ähnlich weit voraus liegen (z.B. 4 Icons an einer Kreuzung),
 *   nehmen wir den mit besser passender Heading (kleinere Winkeldifferenz).
 * - Heading-Filter wird nur angewendet, wenn bearingDeg existiert.
 */
export function findNextStopPointAlongRoute<T extends { point: LngLat; bearingDeg?: number }>(args: {
  route: LngLat[];
  traveledM: number; // sim.kpis.distanceTraveledM
  headingDeg?: number; // sim.kpis.headingDeg
  stopPoints: T[];
  lateralMaxM?: number; // z.B. 10..25 (bei Icon-StopPoints eher kleiner!)
  minAheadM?: number; // z.B. 0.2
  maxAheadM?: number; // z.B. 400..600
  headingMaxDiffDeg?: number; // z.B. 90..160
  /** Tie-break window: innerhalb dieser Distanz (m) entscheidet Heading stärker */
  tieWindowM?: number; // z.B. 6..12
}): { stopPoint: T; distAheadM: number; stopS: number } | null {
  const {
    route,
    traveledM,
    headingDeg,
    stopPoints,
    lateralMaxM = 20,
    minAheadM = 0.2,
    maxAheadM = 600,
    headingMaxDiffDeg = 140,
    tieWindowM = 10,
  } = args;

  if (!route || route.length < 2 || !stopPoints || stopPoints.length === 0) return null;

  const hasHeading = headingDeg != null && Number.isFinite(headingDeg);

  let best: {
    stopPoint: T;
    distAheadM: number;
    stopS: number;
    headingDiff?: number;
  } | null = null;

  for (const sp of stopPoints) {
    const proj = projectPointToRoute(route, sp.point);
    if (!proj) continue;

    // 1) muss nahe an Route liegen
    if (proj.lateralM > lateralMaxM) continue;

    // 2) muss vor uns liegen
    const distAheadM = proj.sM - traveledM;
    if (distAheadM <= minAheadM) continue;
    if (distAheadM > maxAheadM) continue;

    // 3) optional: Heading-Check (Vehicle heading vs StopPoint approach bearing)
    let headingDiff: number | undefined = undefined;

    if (hasHeading && sp.bearingDeg != null && Number.isFinite(sp.bearingDeg)) {
      headingDiff = angleDiffDeg(Number(headingDeg), Number(sp.bearingDeg));
      if (headingDiff > headingMaxDiffDeg) continue;
    }

    // 4) Auswahl:
    //    - primär: kleinste distAheadM
    //    - tie-break (wenn sehr nah beieinander): kleinere headingDiff bevorzugen
    if (!best) {
      best = { stopPoint: sp, distAheadM, stopS: proj.sM, headingDiff };
      continue;
    }

    const distBetter = distAheadM < best.distAheadM;
    const distClose = Math.abs(distAheadM - best.distAheadM) <= tieWindowM;

    if (distBetter) {
      best = { stopPoint: sp, distAheadM, stopS: proj.sM, headingDiff };
      continue;
    }

    // tie-break nur wenn Distanzen sehr ähnlich (typisch: 4 Köpfe an gleicher Kreuzung)
    if (distClose) {
      const a = headingDiff;
      const b = best.headingDiff;

      // wenn wir keinen headingDiff haben (z.B. bearingDeg fehlt), dann nicht tie-breaken
      if (a != null && b != null) {
        if (a < b) {
          best = { stopPoint: sp, distAheadM, stopS: proj.sM, headingDiff };
        }
      } else if (a != null && b == null) {
        // prefer candidate where we have a meaningful match
        best = { stopPoint: sp, distAheadM, stopS: proj.sM, headingDiff };
      }
    }
  }

  if (!best) return null;
  return { stopPoint: best.stopPoint, distAheadM: best.distAheadM, stopS: best.stopS };
}

/**
 * Dynamischer Bremsweg:
 * d = v^2/(2a) + Puffer
 */
export function brakingDistanceM(speedMps: number, maxBrakeMps2 = 3.0, bufferM = 6) {
  const v = Math.max(0, speedMps);
  const a = Math.max(0.1, maxBrakeMps2);
  return (v * v) / (2 * a) + bufferM;
}
