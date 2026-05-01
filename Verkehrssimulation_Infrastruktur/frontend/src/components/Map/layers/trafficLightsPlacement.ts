// frontend/src/components/Map/layers/trafficLightsPlacement.ts
import type { RoadSegment } from "../../../types/simTypes";

type LngLat = [number, number];

function dist2(a: LngLat, b: LngLat) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

// 0° = Norden
function angleDeg(from: LngLat, to: LngLat) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const rad = Math.atan2(dx, dy); // bewusst: dx/dy für 0° = N
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function segLen2(a: LngLat, b: LngLat) {
  return dist2(a, b);
}

// Abstand Punkt -> Segment (im "deg"-Koordinatensystem, reicht hier)
function pointToSegmentDist2(p: LngLat, a: LngLat, b: LngLat) {
  const ax = a[0], ay = a[1];
  const bx = b[0], by = b[1];
  const px = p[0], py = p[1];

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const abLen2 = abx * abx + aby * aby;
  if (abLen2 === 0) return dist2(p, a);

  let t = (apx * abx + apy * aby) / abLen2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

function normalize180(deg: number) {
  let d = deg % 360;
  if (d < 0) d += 360;
  if (d >= 180) d -= 180; // Achse: 0..180
  return d;
}

function angDiff180(a: number, b: number) {
  const da = normalize180(a);
  const db = normalize180(b);
  let d = Math.abs(da - db);
  if (d > 90) d = 180 - d;
  return d; // 0..90
}

type Sample = { axisDeg: number; w: number };

/**
 * Liefert zwei Achsen (A,B) als Bearing-Grad (0..360), wobei
 * - Achse A = dominanteste Straßenachse nahe p
 * - Achse B = beste Querachse ~90° zu A
 */
export function findRoadBearingsNearPoint(
  roads: RoadSegment[],
  p: LngLat,
  maxDistDeg = 0.00018 // ca. ~20m (grob) -> besser als 0.00025
): [number, number] {
  const maxD2 = maxDistDeg * maxDistDeg;

  const samples: Sample[] = [];

  for (const r of roads) {
    const pts = r.points as LngLat[];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];

      // ✅ wirklich nahe am Punkt: Punkt->Segment statt nur Endpunkte
      const d2 = pointToSegmentDist2(p, a, b);
      if (d2 > maxD2) continue;

      // Richtung als "Achse": 0..180 (also Straße ohne Vorzeichen)
      const br = angleDeg(a, b);
      const axis = normalize180(br);

      // Gewicht: längere Segmente zählen mehr (stabiler)
      const w = Math.max(1e-12, segLen2(a, b)); // nie 0
      samples.push({ axisDeg: axis, w });
    }
  }

  if (samples.length === 0) return [0, 90];

  // --- Clustering in 10° Bins (0..180) ---
  const BIN = 10; // Grad
  const bins = new Map<number, { sumW: number; sumAng: number }>();

  for (const s of samples) {
    const key = Math.round(s.axisDeg / BIN) * BIN; // 0,10,20,...,180
    const prev = bins.get(key) ?? { sumW: 0, sumAng: 0 };
    prev.sumW += s.w;
    prev.sumAng += s.axisDeg * s.w;
    bins.set(key, prev);
  }

  const ranked = [...bins.entries()]
    .map(([k, v]) => ({
      bin: k,
      w: v.sumW,
      mean: v.sumAng / v.sumW,
    }))
    .sort((a, b) => b.w - a.w);

  // Achse A = stärkster Cluster
  const axisA = ranked[0].mean;

  // Achse B = bestes Cluster nahe 90° zu A (und nicht "gleich")
  let bestB: number | null = null;
  let bestScore = -Infinity;

  for (let i = 1; i < ranked.length; i++) {
    const cand = ranked[i].mean;
    const diff = Math.abs(cand - axisA);
    const diffNorm = diff > 90 ? 180 - diff : diff; // 0..90

    // Score: maximal bei diffNorm ~ 90, aber auch Gewicht zählt
    const closenessTo90 = 90 - Math.abs(90 - diffNorm); // 0..90 (90 ist perfekt)
    const score = closenessTo90 * 1000 + ranked[i].w;

    if (score > bestScore) {
      bestScore = score;
      bestB = cand;
    }
  }

  // Fallback: exakt 90°
  const axisB = bestB ?? ((axisA + 90) % 180);

  // zurück als 0..360 Bearings (Achse -> 2 Richtungen später gemacht)
  // wir geben hier die Achse als bearing (0..180) zurück, das passt für deine Umrechnung
  return [axisA, axisB];
}
