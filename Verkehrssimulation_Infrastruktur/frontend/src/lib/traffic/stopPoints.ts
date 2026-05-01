// frontend/src/lib/traffic/stopPoints.ts
import type { LngLat } from "../../types/simTypes";
import type { IntersectionVisual } from "../intersectionsToGeoJSON";
import type { StopPoint, IntersectionPhase } from "../../types/traffic";

type Phase = "NS_GREEN" | "EW_GREEN";
type Kind = "single" | "intersection";

/** Normalisiert Winkel auf [0, 360). */
function normDeg(x: number): number {
  return ((x % 360) + 360) % 360;
}

/**
 * EXAKT wie in trafficLightsGeo.ts (damit StopPoint == Icon-Position)
 * Offset point by meters along bearing (0° = North).
 */
function offsetLngLatMeters([lng, lat]: LngLat, meters: number, bearingDeg: number): LngLat {
  const R = 6378137;
  const bearing = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;

  const dLat = (meters * Math.cos(bearing)) / R;
  const dLng = (meters * Math.sin(bearing)) / (R * Math.cos(latRad));

  const outLat = lat + (dLat * 180) / Math.PI;
  const outLng = lng + (dLng * 180) / Math.PI;
  return [outLng, outLat];
}

function asNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function getCenter(itx: IntersectionVisual): LngLat {
  const p = (itx as unknown as { point?: unknown }).point;
  if (Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number") {
    return [p[0], p[1]];
  }
  return [0, 0];
}

function getBearingDeg(itx: IntersectionVisual): number {
  // manche Daten heißen bearing, manche bearingDeg
  const raw =
    asNumber((itx as unknown as { bearing?: unknown }).bearing) ??
    asNumber((itx as unknown as { bearingDeg?: unknown }).bearingDeg) ??
    0;

  return normDeg(raw);
}

function getKind(itx: IntersectionVisual): Kind {
  const k = (itx as unknown as { kind?: unknown }).kind;
  return k === "single" ? "single" : "intersection";
}

function getIntersectionId(itx: IntersectionVisual): string {
  const id = (itx as unknown as { id?: unknown }).id;
  return typeof id === "string" ? id : String(id ?? "");
}

/**
 * Optional: pro Intersection gespeicherte Grünzeiten (wenn vorhanden).
 * Unterstützt mehrere Key-Namen, damit alte Szenarios weiterhin gehen.
 */
function getGreenTimesSec(itx: IntersectionVisual, defaults: { a: number; b: number }) {
  const obj = itx as unknown as Record<string, unknown>;

  const a =
    asNumber(obj.greenA) ??
    asNumber(obj.greenTimeA) ??
    asNumber(obj.tGreenA) ??
    asNumber(obj.dir1GreenSec) ??
    defaults.a;

  const b =
    asNumber(obj.greenB) ??
    asNumber(obj.greenTimeB) ??
    asNumber(obj.tGreenB) ??
    asNumber(obj.dir2GreenSec) ??
    defaults.b;

  // harte Untergrenzen, damit nix “0” wird
  return { a: Math.max(1, a), b: Math.max(1, b) };
}

// ---------------- Single-LSA helpers ----------------

function getSingleTimesSec(itx: IntersectionVisual, defaults: { green: number; red: number }) {
  const obj = itx as unknown as Record<string, unknown>;

  const green =
    asNumber(obj.singleGreenSec) ??
    asNumber(obj.greenSec) ??
    asNumber(obj.green) ??
    defaults.green;

  const red =
    asNumber(obj.singleRedSec) ??
    asNumber(obj.redSec) ??
    asNumber(obj.red) ??
    defaults.red;

  return { green: Math.max(1, green), red: Math.max(1, red) };
}

/**
 * Single-Schaltgruppe auslesen:
 * - neuer Standard: "Gruppe1".."Gruppe6"
 * - fallback: alte "C1".."C6" werden gemappt
 */
function getSingleGroupKey(itx: IntersectionVisual): string {
  const obj = itx as unknown as Record<string, unknown>;
  const raw = String(obj.singleGroupId ?? obj.singleGroup ?? obj.groupId ?? "").trim();

  // neuer Standard
  if (/^Gruppe[1-6]$/.test(raw)) return raw;

  // backward compat: C1..C6 -> Gruppe1..Gruppe6
  const up = raw.toUpperCase();
  if (up === "C1") return "Gruppe1";
  if (up === "C2") return "Gruppe2";
  if (up === "C3") return "Gruppe3";
  if (up === "C4") return "Gruppe4";
  if (up === "C5") return "Gruppe5";
  if (up === "C6") return "Gruppe6";

  // Default
  return "Gruppe1";
}

/**
 * Single-LSA Zyklus:
 * GREEN -> YELLOW(3s) -> RED -> repeat
 * Wir mappen auf Phase:
 * - GREEN => "NS_GREEN" (darf fahren)
 * - YELLOW/RED => "EW_GREEN" (muss halten)
 */
function computeSingleLight(simTimeSec: number, greenSec: number, redSec: number) {
  const YELLOW_SEC = 3;
  const RED_YELLOW_SEC = 1;

  const g = Math.max(1, Math.round(greenSec));
  const r = Math.max(1, Math.round(redSec));

  const t0 = g;
  const t1 = t0 + YELLOW_SEC;
  const t2 = t1 + r;
  const t3 = t2 + RED_YELLOW_SEC;

  const cycle = t3;
  const t = ((simTimeSec % cycle) + cycle) % cycle;

  if (t < t0) return "GREEN" as const;
  if (t < t1) return "YELLOW" as const;
  if (t < t2) return "RED" as const;
  return "YELLOW" as const; // Rot-Gelb als YELLOW
}

/**
 * StopPoints werden exakt an die Icon-Positionen gelegt.
 * - single: 1 StopPoint
 * - intersection: 4 StopPoints (N/S/E/W)
 */
export function buildStopPointsFromIntersections(
  intersections: IntersectionVisual[],
  offsetMeters = 2
): StopPoint[] {
  const out: StopPoint[] = [];

  for (const itx of intersections) {
    const id = getIntersectionId(itx);
    const center = getCenter(itx);
    const baseBearing = getBearingDeg(itx);
    const kind = getKind(itx);

    if (kind === "single") {
      const headBearing = baseBearing;
      const headPos = offsetLngLatMeters(center, offsetMeters, headBearing);
      const approachBearing = normDeg(headBearing + 180);

      out.push({
        id: `${id}:sp:single`,
        intersectionId: id,
        bearingDeg: approachBearing,
        point: headPos,
      });

      continue;
    }

    // 4er-Kreuzung: Achse A (NS) + Achse B (EW)
    const axisA = baseBearing;
    const axisB = normDeg(axisA + 90);

    const heads: Array<{ tag: "N" | "S" | "E" | "W"; headBearing: number }> = [
      { tag: "N", headBearing: axisA },
      { tag: "S", headBearing: normDeg(axisA + 180) },
      { tag: "E", headBearing: axisB },
      { tag: "W", headBearing: normDeg(axisB + 180) },
    ];

    for (const h of heads) {
      const headPos = offsetLngLatMeters(center, offsetMeters, h.headBearing);
      const approachBearing = normDeg(h.headBearing + 180);

      out.push({
        id: `${id}:sp:${h.tag}`,
        intersectionId: id,
        bearingDeg: approachBearing,
        point: headPos,
      });
    }
  }

  return out;
}

/**
 * Intersection-Phasen:
 * - Wenn itx.phase gesetzt ist → wird übernommen (statisch).
 * - Wenn simTimeSec übergeben wird → schaltet 4er-LSA automatisch NS/EW.
 *
 * ✅ Kompatibel: Du kannst es mit 1 Argument aufrufen.
 * ✅ Für automatisches Schalten: buildIntersectionPhases(intersections, simTimeSec)
 */
export function buildIntersectionPhases(
  intersections: IntersectionVisual[],
  simTimeSec: number = 0
): IntersectionPhase[] {
  const DEFAULTS_4WAY = { a: 30, b: 30 };
  const DEFAULTS_SINGLE = { green: 10, red: 30 };

  // ✅ Alle Single-Gruppen einmal pro Tick ausrechnen (damit alle synchron sind)
  const singleLightByGroup = new Map<string, "GREEN" | "YELLOW" | "RED">();

  for (const itx of intersections) {
    const kind = getKind(itx);
    if (kind !== "single") continue;

    const groupKey = getSingleGroupKey(itx);
    if (singleLightByGroup.has(groupKey)) continue;

    const { green, red } = getSingleTimesSec(itx, DEFAULTS_SINGLE);
    const light = computeSingleLight(simTimeSec, green, red);
    singleLightByGroup.set(groupKey, light);
  }

  return intersections.map((itx) => {
    const id = getIntersectionId(itx);
    const kind = getKind(itx);

    // ✅ Single: liefert light (GREEN/YELLOW/RED)
    if (kind === "single") {
      const groupKey = getSingleGroupKey(itx);
      const light = singleLightByGroup.get(groupKey) ?? "RED";

      return {
        intersectionId: id,
        kind: "single",
        light,
      };
    }

    const rawPhase = (itx as unknown as { phase?: unknown }).phase;

    // ✅ rawPhase nur für 4er-LSA übernehmen, NICHT für Single
    if (rawPhase === "NS_GREEN" || rawPhase === "EW_GREEN") {
      return {
        intersectionId: id,
        kind: "intersection",
        phase: rawPhase,
      };
    }

    // ✅ 4er-LSA: automatisches 2-Phasen Schalten über simTimeSec
    const { a: greenA, b: greenB } = getGreenTimesSec(itx, DEFAULTS_4WAY);
    const cycle = greenA + greenB;

    const t = ((simTimeSec % cycle) + cycle) % cycle;
    const phase: Phase = t < greenA ? "NS_GREEN" : "EW_GREEN";

    return {
      intersectionId: id,
      kind: "intersection",
      phase,
    };
  });
}

