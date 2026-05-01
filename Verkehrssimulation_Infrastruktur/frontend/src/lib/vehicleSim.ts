// frontend/src/lib/vehicleSim.ts
import type { LngLat, VehicleSimState, PositionPhase } from "../types/simTypes";
import { distanceMeters } from "./geo";
import { kmhToMps } from "./units";

// ---------- Option A Schwellen ----------
const APPROACH_DIST_M = 25;
const INSIDE_RADIUS_M = 12;
const EXIT_DIST_M = 25;

// ---------- KPI Thresholds ----------
// kleiner halten -> "steht" wird sauberer erkannt (weniger Flattern)
const STOP_SPEED_MPS = 0.12; // vorher 0.2

// ---------- Helpers ----------
export function getVehicleLngLat(state: VehicleSimState): LngLat {
  const r = state.route;
  if (!r || r.length === 0) return [0, 0];

  const i = Math.max(0, Math.min(state.routeIndex, r.length - 1));
  const a = r[i];
  const b = r[i + 1] ?? a;

  const t = Number.isFinite(state.segmentProgress) ? Math.max(0, Math.min(1, state.segmentProgress)) : 0;

  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Bearing (Grad) – ausreichend fürs UI
export function bearingDeg(a: LngLat, b: LngLat): number {
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
  return (toDeg(θ) + 360) % 360;
}

// ---------- Route Meta ----------
export function ensureRouteMeta(state: VehicleSimState) {
  if (state.routeMeta) return;

  const r = state.route ?? [];
  const segLensM: number[] = [];
  const cumM: number[] = [0];

  let total = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const len = distanceMeters(r[i], r[i + 1]);
    const safeLen = Number.isFinite(len) ? Math.max(0, len) : 0;
    segLensM.push(safeLen);
    total += safeLen;
    cumM.push(total);
  }

  state.routeMeta = { segLensM, cumM, totalM: total };
}

export function computeRemainingDistanceM(state: VehicleSimState): number {
  ensureRouteMeta(state);

  const r = state.route ?? [];
  const meta = state.routeMeta!;
  const i = Math.max(0, Math.min(state.routeIndex, meta.segLensM.length));

  if (r.length < 2 || meta.segLensM.length === 0 || i >= meta.segLensM.length) return 0;

  const segLen = meta.segLensM[i];
  const prog = Number.isFinite(state.segmentProgress) ? Math.max(0, Math.min(1, state.segmentProgress)) : 0;

  const segRemain = segLen * (1 - prog);
  const afterThisSeg = meta.totalM - meta.cumM[i + 1];

  return Math.max(0, segRemain + afterThisSeg);
}

// ---------- Option A Phase ----------
function computePhaseFromIntersectionAtM(
  traveledM: number,
  intersectionAtM?: number
): { phase: PositionPhase; dist?: number } {
  if (intersectionAtM == null || !Number.isFinite(intersectionAtM)) {
    return { phase: "CRUISE" };
  }

  const delta = intersectionAtM - traveledM; // >0 vor, <0 nach

  const farThreshold = Math.max(APPROACH_DIST_M, EXIT_DIST_M) + 2 * INSIDE_RADIUS_M;
  if (Math.abs(delta) > farThreshold) return { phase: "CRUISE" };

  if (delta > INSIDE_RADIUS_M) return { phase: "APPROACH", dist: Math.max(0, Math.round(delta)) };

  if (Math.abs(delta) <= INSIDE_RADIUS_M) return { phase: "INSIDE" };

  return { phase: "EXIT", dist: Math.max(0, Math.round(Math.abs(delta))) };
}

// ---------- Speed Dynamics ----------
function moveToward(current: number, target: number, maxDelta: number) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

function clampSpeedTowardTarget(
  currentMps: number,
  targetMps: number,
  dt: number,
  maxAccelMps2: number,
  maxBrakeMps2: number
) {
  if (targetMps >= currentMps) {
    return moveToward(currentMps, targetMps, maxAccelMps2 * dt);
  }
  return moveToward(currentMps, targetMps, maxBrakeMps2 * dt);
}

function effectiveAccel(state: VehicleSimState): number {
  const base = state.dynamics?.maxAccelMps2 ?? 2.0;

  // 🚦 Nach Halt (Ampel) → sanfter anfahren
  if (state.wasStopped) {
    return base * 0.45;
  }

  // ↩️ In der Kreuzung (Abbiege-Bereich) → deutlich langsamer beschleunigen
  if (state.positionPhase === "INSIDE") {
    return base * 0.35;
  }

  // 🚗 normal
  return base;
}

function getTargetSpeedKmh(state: VehicleSimState, mustStop: boolean): number {
  if (mustStop) return 0;

  const cruise = state.speedProfile.cruiseKmh;
  const approach = state.speedProfile.approachKmh ?? Math.min(cruise, 30);
  const turn = state.speedProfile.turnKmh ?? Math.min(cruise, 25);

  switch (state.positionPhase) {
    case "APPROACH":
      return Math.min(cruise, approach);
    case "INSIDE":
      return Math.min(cruise, turn);
    case "EXIT":
    case "CRUISE":
    default:
      return cruise;
  }
}

type AdvanceOpts =
  | boolean
  | {
      mustStop?: boolean;
      /** Distanz (Meter) bis zur Stopplinie/StopPoint entlang Route, vom aktuellen Fahrzeug-s aus */
      stopLineAheadM?: number;
      /** Sicherheitsabstand vor Stopplinie (Meter) */
      stopMarginM?: number;
    };

/**
 * Advance Simulation:
 * ✅ StopLine-Clamp + Hard-Hold wenn wir an der Haltelinie sind
 * ✅ robust gegen NaN/negative stopLineAheadM
 * ✅ verhindert "Creep" an der Stopplinie (Speed wird auf 0 geklemmt, sobald wir im Margin sind)
 */
export function advanceVehicle(state: VehicleSimState, deltaSeconds: number, opts: AdvanceOpts = false) {
  if (!state.active) return;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

  if (!state.route || state.route.length < 2) {
    state.active = false;
    return;
  }

  // ---- parse opts (robust) ----
  const mustStop = typeof opts === "boolean" ? opts : Boolean(opts.mustStop);

  const rawStopAhead =
    typeof opts === "boolean"
      ? undefined
      : Number.isFinite(opts.stopLineAheadM ?? NaN)
        ? (opts.stopLineAheadM as number)
        : undefined;

  // stopLineAheadM kann durch Projektion minimal negativ werden -> clamp auf 0
  const stopLineAheadM = rawStopAhead == null ? undefined : Math.max(0, rawStopAhead);

  const rawMargin = typeof opts === "boolean" ? 0.8 : opts.stopMarginM ?? 0.8;
  const stopMarginM = Number.isFinite(rawMargin) ? Math.max(0, rawMargin) : 0.8;

  ensureRouteMeta(state);

  // 0) Phase VOR Bewegung
  {
    const { phase, dist } = computePhaseFromIntersectionAtM(state.kpis.distanceTraveledM, state.intersectionAtM);
    state.positionPhase = phase;
    state.distanceToIntersectionM = dist;
  }

  // 1) Speed-Regelung
  const targetKmh = getTargetSpeedKmh(state, mustStop);
  const targetMps = kmhToMps(Math.max(0, targetKmh));

  const maxA = effectiveAccel(state);
  const maxB = state.dynamics?.maxBrakeMps2 ?? 3.0;

  state.speedMps = clampSpeedTowardTarget(Math.max(0, state.speedMps), targetMps, deltaSeconds, maxA, maxB);

  // 2) Remaining distance vorher
  const remainingDistM0 = computeRemainingDistanceM(state);

  // 3) Bewegung (mit StopLine-Clamp)
  let remainingMoveM = Math.min(state.speedMps * deltaSeconds, remainingDistM0);

  // ✅ Hard-Hold: wenn Stop aktiv und wir sind praktisch an der Haltelinie -> kein Move + speed=0
  // klein halten, damit das Fahrzeug wirklich "kurz vor dem Icon" stehen bleibt
  const EPS = 0.03; // 3cm Toleranz

  const atStopLine =
    mustStop &&
    stopLineAheadM != null &&
    Number.isFinite(stopLineAheadM) &&
    stopLineAheadM <= stopMarginM + EPS;

  if (atStopLine) {
    remainingMoveM = 0;
    state.speedMps = 0;
  }

  // ✅ Clamp: wenn Stop aktiv, NICHT über Stopplinie fahren
  if (!atStopLine && mustStop && stopLineAheadM != null && Number.isFinite(stopLineAheadM)) {
    const maxMoveToStop = Math.max(0, stopLineAheadM - stopMarginM);
    remainingMoveM = Math.min(remainingMoveM, maxMoveToStop);

    // wenn wir durch Clamp quasi "stehen", dann auch speed=0 (verhindert Micro-Creep)
    if (remainingMoveM <= EPS) {
      remainingMoveM = 0;
      state.speedMps = 0;
    }
  }

  // 4) Zeiten + Stopps (nach Hard-Hold / clamp)
  state.kpis.tripTimeS += deltaSeconds;

  const stoppedNow = state.speedMps <= STOP_SPEED_MPS || remainingMoveM <= 0;
  if (stoppedNow) {
    state.kpis.waitTimeS += deltaSeconds;
    if (!state.wasStopped) {
      state.kpis.stops += 1;
      state.wasStopped = true;
    }
  } else {
    state.kpis.moveTimeS += deltaSeconds;
    state.wasStopped = false;
  }

  if (!Number.isFinite(remainingMoveM) || remainingMoveM <= 0) {
    state.kpis.remainingDistanceM = remainingDistM0;
    return;
  }

  let movedM = 0;

  while (remainingMoveM > 0 && state.routeIndex < state.route.length - 1) {
    const i = state.routeIndex;
    const segLen = state.routeMeta!.segLensM[i] ?? 0;

    if (segLen < 0.001) {
      state.routeIndex++;
      state.segmentProgress = 0;
      continue;
    }

    const prog = Number.isFinite(state.segmentProgress) ? Math.max(0, Math.min(1, state.segmentProgress)) : 0;
    state.segmentProgress = prog;

    const segRemain = segLen * (1 - prog);

    if (remainingMoveM < segRemain) {
      const step = remainingMoveM;
      state.segmentProgress = prog + step / segLen;
      movedM += step;
      remainingMoveM = 0;
    } else {
      const step = segRemain;
      movedM += step;
      remainingMoveM -= step;
      state.routeIndex++;
      state.segmentProgress = 0;
    }
  }

  // 5) KPIs Strecke
  state.kpis.distanceTraveledM += movedM;

  // remaining distance nachher
  const remainingDistM1 = computeRemainingDistanceM(state);
  state.kpis.remainingDistanceM = remainingDistM1;

  // Heading
  const curr = state.route[state.routeIndex];
  const next = state.route[state.routeIndex + 1] ?? curr;
  state.kpis.headingDeg = bearingDeg(curr, next);

  // 6) Ende?
  if (state.routeIndex >= state.route.length - 1 || remainingDistM1 <= 0.0001) {
    state.active = false;
  }

  // 7) Phase NACH Bewegung
  {
    const { phase, dist } = computePhaseFromIntersectionAtM(state.kpis.distanceTraveledM, state.intersectionAtM);
    state.positionPhase = phase;
    state.distanceToIntersectionM = dist;
  }
}
