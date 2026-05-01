// frontend/src/hooks/useVehicles.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { Vehicle, LngLat, VehicleSimState } from "../types/simTypes";
import { computeHeadingDeg } from "../lib/geo";
import { kmhToMps } from "../lib/units";
import { advanceVehicle, getVehicleLngLat } from "../lib/vehicleSim";

import { projectPointToRoute, brakingDistanceM } from "../lib/routeStopPoint";
import type { StopPoint, IntersectionPhase } from "../types/traffic";

const MAX_DT_REAL = 0.1; // clamp für echte Frame-Zeit
const MAX_DT_SIM_CAP = 0.5; // zusätzliche Sicherheit (bei 5x)
const MOVE_EPS = 1e-12;

const MPS_TO_KMH = 3.6;

// --- Stop/Signal tuning ---
const MIN_STOP_TRIGGER_M = 2.5;
const CLEAR_AFTER_STOP_M = 3;

const LATERAL_MAX_M = 18;
const HEADING_MAX_DIFF_DEG = 110;

const MAX_AHEAD_M = 600;
const MIN_AHEAD_M = 0.15;

// Resume: verhindert “Zucken”
const RESUME_GRACE_MS = 350;
const MIN_ROLL_SPEED_MPS = 0.3;

function safeKmh(kmh: number, fallback = 50) {
  return Number.isFinite(kmh) ? Math.max(0, kmh) : fallback;
}

function isFinishedSim(sim?: VehicleSimState) {
  if (!sim) return false;
  const remaining = sim.kpis?.remainingDistanceM ?? Infinity;
  return !sim.active && remaining <= 0.5;
}

function angleDiffDeg(a: number, b: number) {
  const d = ((a - b + 540) % 360) - 180;
  return Math.abs(d);
}

// ------------------------------------------------------
// ArmGroup: Kreuzung = NS/EW über StopPoint-ID, Single = SINGLE
// ------------------------------------------------------
type ArmGroup = "NS" | "EW" | "SINGLE";

function armGroupFromStopPointId(stopPointId: string): ArmGroup {
  if (stopPointId.endsWith(":sp:N") || stopPointId.endsWith(":sp:S")) return "NS";
  if (stopPointId.endsWith(":sp:E") || stopPointId.endsWith(":sp:W")) return "EW";
  return "SINGLE";
}

// ------------------------------------------------------
// Phase/Signal Normalisierung (abwärtskompatibel)
// ------------------------------------------------------
type PhaseInfo = {
  kind: "intersection" | "single";
  // intersection
  phase?: "NS_GREEN" | "EW_GREEN" | string;
  // single
  light?: "RED" | "GREEN" | "YELLOW" | string;
};

function normalizePhaseInfo(p: IntersectionPhase): PhaseInfo {
  const anyP = p as any;
  const kind = (anyP.kind as PhaseInfo["kind"] | undefined) ?? "intersection";

  if (kind === "single") {
    return {
      kind: "single",
      light: (anyP.light ?? anyP.phase ?? "RED") as any,
    };
  }

  return {
    kind: "intersection",
    phase: (anyP.phase ?? "NS_GREEN") as any,
  };
}

/**
 * Intersection:
 * - NS_GREEN => NS fährt, EW stoppt
 * - EW_GREEN => EW fährt, NS stoppt
 * - unknown => stop (safe)
 *
 * Single:
 * - GREEN => fahren
 * - alles andere => stop
 */
function isRedForStopPoint(info: PhaseInfo | undefined, stopPointId: string): boolean {
  const group = armGroupFromStopPointId(stopPointId);

  // FAIL-SAFE: keine Info => lieber STOP
  if (!info) return true;

  // SINGLE
  if (group === "SINGLE") {
    const light = String(info.light ?? info.phase ?? "RED").toUpperCase();
    // ✅ akzeptiere beide Welten:
    // - klassisch: "GREEN"
    // - neue Phase-Mappung: "NS_GREEN" = fahren, "EW_GREEN" = stoppen
    const isGo = light === "GREEN" || light === "NS_GREEN";
    return !isGo;
  }

  // INTERSECTION
  const phase = (info.phase ?? "UNKNOWN") as unknown;

  if (phase === "NS_GREEN") return group !== "NS";
  if (phase === "EW_GREEN") return group !== "EW";

  return true;
}

// --- Stop Controller in sim (ohne Types zu ändern) ---
type SignalCtrl = {
  activeStopPointId?: string;
  activeStopS?: number;

  state: "CRUISING" | "APPROACHING" | "HOLDING" | "RELEASING";

  ignoreStopPointIdUntilPassed?: string;
  releasedAtMs?: number;

  warnedMissingPhase?: boolean;
};

function getCtrl(sim: VehicleSimState): SignalCtrl {
  const anySim = sim as any;
  if (!anySim.__signalCtrl) {
    anySim.__signalCtrl = { state: "CRUISING" } satisfies SignalCtrl;
  }
  return anySim.__signalCtrl as SignalCtrl;
}

function pickNextStopPoint(args: {
  route: LngLat[];
  traveledM: number;
  stopPoints: StopPoint[];
  lateralMaxM: number;
  minAheadM: number;
  maxAheadM: number;
  headingMaxDiffDeg: number;
}): { sp: StopPoint; distAheadM: number; stopS: number } | null {
  const { route, traveledM, stopPoints, lateralMaxM, minAheadM, maxAheadM, headingMaxDiffDeg } = args;
  if (!route || route.length < 2) return null;
  if (!stopPoints || stopPoints.length === 0) return null;

  let best: { sp: StopPoint; distAheadM: number; stopS: number; score: number } | null = null;

  for (const sp of stopPoints) {
    const proj = projectPointToRoute(route, sp.point);
    if (!proj) continue;

    if (proj.lateralM > lateralMaxM) continue;

    const distAheadM = proj.sM - traveledM;
    if (distAheadM <= minAheadM) continue;
    if (distAheadM > maxAheadM) continue;

    const a = route[proj.segIndex];
    const b = route[proj.segIndex + 1] ?? a;
    const routeTangentDeg = computeHeadingDeg(a, b);

    const diff = angleDiffDeg(routeTangentDeg, sp.bearingDeg);
    if (diff > headingMaxDiffDeg) continue;

    const score = distAheadM + diff * 0.25 + proj.lateralM * 0.75;

    if (!best || score < best.score) {
      best = { sp, distAheadM, stopS: proj.sM, score };
    }
  }

  if (!best) return null;
  return { sp: best.sp, distAheadM: best.distAheadM, stopS: best.stopS };
}

/**
 * Optionaler Speed-Multiplikator:
 * - Übergib aus App.tsx ein ref, das simSpeed (0.5/1/2/5) enthält.
 * - Wenn du nichts übergibst, läuft alles wie bisher auf 1x.
 */
export function useVehicles(
  stopPoints: StopPoint[] = [],
  phases: IntersectionPhase[] = [],
  simSpeedRef?: React.MutableRefObject<number>
) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Refs: RAF nutzt immer aktuelle Daten, ohne deps-chaos
  const stopPointsRef = useRef<StopPoint[]>(stopPoints);

  // ✅ vorcomputet: intersectionId -> PhaseInfo (wird nur neu gebaut wenn phases wechseln)
  const phaseInfoByIntersectionRef = useRef<Map<string, PhaseInfo>>(new Map());

  useEffect(() => {
    stopPointsRef.current = stopPoints ?? [];
  }, [stopPoints]);

  useEffect(() => {
    const map = new Map<string, PhaseInfo>();
    for (const p of phases ?? []) {
      map.set((p as any).intersectionId, normalizePhaseInfo(p));
    }
    phaseInfoByIntersectionRef.current = map;
  }, [phases]);

  const addVehicle = useCallback((v: Vehicle) => {
    setVehicles((prev) => [...prev, v]);
  }, []);

  const createSim = useCallback(
    (
      vehicleId: number,
      route: LngLat[],
      cruiseSpeedKmh = 50,
      intersectionAtM?: number,
      speedProfileOverrides?: Partial<VehicleSimState["speedProfile"]>
    ): VehicleSimState => {
      const cruiseKmh = safeKmh(cruiseSpeedKmh, 50);
      const heading = route.length >= 2 ? computeHeadingDeg(route[0], route[1]) : 0;

      return {
        vehicleId,
        route,
        routeIndex: 0,
        segmentProgress: 0,

        speedMps: kmhToMps(cruiseKmh),
        active: true,

        speedProfile: {
          cruiseKmh,
          approachKmh: Math.min(cruiseKmh, 30),
          turnKmh: Math.min(cruiseKmh, 25),
          ...(speedProfileOverrides ?? {}),
        },

        dynamics: {
          maxAccelMps2: 2.0,
          maxBrakeMps2: 3.0,
        },

        positionPhase: "CRUISE",
        distanceToIntersectionM: undefined,

        intersectionAtM,
        intersectionPoint: undefined,

        routeMeta: undefined,
        wasStopped: false,

        kpis: {
          startedAtMs: Date.now(),
          tripTimeS: 0,
          moveTimeS: 0,
          waitTimeS: 0,
          distanceTraveledM: 0,
          remainingDistanceM: 0,
          stops: 0,
          headingDeg: heading,
        },
      };
    },
    []
  );

  const startVehicleOnRoute = useCallback(
    (
      vehicleId: number,
      route: LngLat[],
      cruiseSpeedKmh = 50,
      intersectionAtM?: number,
      speedProfileOverrides?: Partial<VehicleSimState["speedProfile"]>
    ) => {
      if (!route || route.length < 2) return;

      setVehicles((prev) =>
        prev.map((v) => {
          if (v.id !== vehicleId) return v;

          const sim = createSim(vehicleId, route, cruiseSpeedKmh, intersectionAtM, speedProfileOverrides);
          const [lon, lat] = route[0];
          return { ...v, lon, lat, sim };
        })
      );
    },
    [createSim]
  );

  const startOrResumeVehicle = useCallback(
    (
      vehicleId: number,
      route: LngLat[],
      cruiseSpeedKmh = 50,
      intersectionAtM?: number,
      speedProfileOverrides?: Partial<VehicleSimState["speedProfile"]>
    ) => {
      setVehicles((prev) =>
        prev.map((v) => {
          if (v.id !== vehicleId) return v;

          // Resume
          if (v.sim) {
            if (isFinishedSim(v.sim)) return v;

            const cruiseKmh = safeKmh(cruiseSpeedKmh, v.sim.speedProfile?.cruiseKmh ?? 50);

            const sim: VehicleSimState = {
              ...v.sim,
              active: true,
              route: v.sim.route?.length ? v.sim.route : route,
              speedProfile: {
                ...v.sim.speedProfile,
                cruiseKmh,
                ...(speedProfileOverrides ?? {}),
              },
              intersectionAtM: intersectionAtM ?? v.sim.intersectionAtM,
            };

            return { ...v, sim };
          }

          // Start fresh
          if (!route || route.length < 2) return v;

          const sim = createSim(vehicleId, route, cruiseSpeedKmh, intersectionAtM, speedProfileOverrides);
          const [lon, lat] = route[0];
          return { ...v, lon, lat, sim };
        })
      );
    },
    [createSim]
  );

  const pauseVehicle = useCallback((vehicleId: number) => {
    setVehicles((prev) =>
      prev.map((v) => {
        if (v.id !== vehicleId || !v.sim) return v;
        return { ...v, sim: { ...v.sim, active: false } };
      })
    );
  }, []);

  const resetVehicle = useCallback((vehicleId: number) => {
    setVehicles((prev) =>
      prev.map((v) => {
        if (v.id !== vehicleId) return v;

        const rp = (v as any).routePoints as LngLat[] | undefined;
        if (rp && rp.length > 0) {
          const [lon, lat] = rp[0];
          return { ...v, lon, lat, sim: undefined, speedKmh: undefined, headingDeg: undefined };
        }

        return { ...v, sim: undefined, speedKmh: undefined, headingDeg: undefined };
      })
    );
  }, []);

  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;

    const tick = (now: number) => {
      if (!alive) return;

      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
        requestAnimationFrame(tick);
        return;
      }

      // echte Frame-Dt
      let dtReal = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      if (!Number.isFinite(dtReal) || dtReal < 0) dtReal = 0;
      dtReal = Math.min(dtReal, MAX_DT_REAL);

      // Sim-Speed (0.5/1/2/5) via Ref
      const speedMul = Math.max(0.1, Number(simSpeedRef?.current ?? 1));
      let dtSim = dtReal * speedMul;
      if (!Number.isFinite(dtSim) || dtSim < 0) dtSim = 0;
      dtSim = Math.min(dtSim, MAX_DT_SIM_CAP);

      if (dtSim <= 0) {
        requestAnimationFrame(tick);
        return;
      }

      // ✅ nur 1x pro Tick
      const nowMs = Date.now();

      setVehicles((prev) => {
        // fast path: nix aktiv
        let hasActive = false;
        for (const v of prev) {
          if (v.sim?.active) {
            hasActive = true;
            break;
          }
        }
        if (!hasActive) return prev;

        const sps = stopPointsRef.current;
        const phaseByIntersection = phaseInfoByIntersectionRef.current;

        return prev.map((v) => {
          const sim0 = v.sim;
          if (!sim0 || !sim0.active) return v;

          // copy sim shallow + kpis shallow (React-state-safe)
          const sim: VehicleSimState = { ...sim0, kpis: { ...sim0.kpis } };

          const ctrl = getCtrl(sim);
          const prevPos = getVehicleLngLat(sim);
          const traveledM = sim.kpis.distanceTraveledM;

          // StopPoint "clearen", wenn wir vorbei sind
          if (ctrl.activeStopS != null && traveledM > ctrl.activeStopS + CLEAR_AFTER_STOP_M) {
            if (ctrl.ignoreStopPointIdUntilPassed === ctrl.activeStopPointId) {
              ctrl.ignoreStopPointIdUntilPassed = undefined;
            }
            ctrl.activeStopPointId = undefined;
            ctrl.activeStopS = undefined;
            ctrl.state = "CRUISING";
          }

          let mustStop = false;
          let chosen: { sp: StopPoint; distAheadM: number; stopS: number } | null = null;

          // StopPoints nur prüfen, wenn sinnvoll
          if (sps.length > 0 && sim.route?.length >= 2) {
            // aktiver StopPoint -> beibehalten
            if (ctrl.activeStopPointId && ctrl.activeStopS != null) {
              const sp = sps.find((x) => x.id === ctrl.activeStopPointId) ?? null;
              if (sp) {
                chosen = { sp, distAheadM: ctrl.activeStopS - traveledM, stopS: ctrl.activeStopS };
              } else {
                ctrl.activeStopPointId = undefined;
                ctrl.activeStopS = undefined;
                ctrl.state = "CRUISING";
              }
            }

            // sonst neuen suchen
            if (!chosen) {
              const next = pickNextStopPoint({
                route: sim.route,
                traveledM,
                stopPoints: sps,
                lateralMaxM: LATERAL_MAX_M,
                minAheadM: MIN_AHEAD_M,
                maxAheadM: MAX_AHEAD_M,
                headingMaxDiffDeg: HEADING_MAX_DIFF_DEG,
              });

              if (next) {
                if (!(ctrl.ignoreStopPointIdUntilPassed && next.sp.id === ctrl.ignoreStopPointIdUntilPassed)) {
                  chosen = next;
                }
              }
            }

            // Ampel-Logik
            if (chosen) {
              const sp = chosen.sp;

              if (!ctrl.activeStopPointId) {
                ctrl.activeStopPointId = sp.id;
                ctrl.activeStopS = chosen.stopS;
                ctrl.state = "APPROACHING";
              }

              const info = phaseByIntersection.get(sp.intersectionId);

              if (!info && !ctrl.warnedMissingPhase) {
                ctrl.warnedMissingPhase = true;
                // eslint-disable-next-line no-console
                console.warn("[signals] missing phase/light for intersectionId:", sp.intersectionId);
              }

              const red = isRedForStopPoint(info, sp.id);

              const maxB = sim.dynamics?.maxBrakeMps2 ?? 3.0;
              const brakeM = Math.max(MIN_STOP_TRIGGER_M, brakingDistanceM(sim.speedMps, maxB, 1.5));

              if (ctrl.state === "HOLDING") {
                if (red) {
                  mustStop = true;
                } else {
                  ctrl.state = "RELEASING";
                  ctrl.releasedAtMs = nowMs;
                  ctrl.ignoreStopPointIdUntilPassed = sp.id;
                  mustStop = false;
                }
              } else if (ctrl.state === "RELEASING") {
                if (ctrl.releasedAtMs && nowMs - ctrl.releasedAtMs < RESUME_GRACE_MS) {
                  mustStop = false;
                } else {
                  if (red && sim.speedMps < 0.1 && chosen.distAheadM > 0.5) {
                    ctrl.state = "HOLDING";
                    mustStop = true;
                  } else {
                    mustStop = false;
                    if (sim.speedMps > MIN_ROLL_SPEED_MPS) ctrl.state = "APPROACHING";
                  }
                }
              } else {
                if (red && chosen.distAheadM <= brakeM) {
                  mustStop = true;
                  if (sim.speedMps < 0.15) ctrl.state = "HOLDING";
                } else {
                  mustStop = false;
                }
              }
            }
          }

          advanceVehicle(sim, dtSim, {
            mustStop,
            stopLineAheadM: chosen ? chosen.distAheadM : undefined,
            stopMarginM: 0.2,
          });

          const nextPos = getVehicleLngLat(sim);

          const dx = nextPos[0] - prevPos[0];
          const dy = nextPos[1] - prevPos[1];
          const moved = Math.abs(dx) > MOVE_EPS || Math.abs(dy) > MOVE_EPS;

          if (moved) sim.kpis.headingDeg = computeHeadingDeg(prevPos, nextPos);

          const [lon, lat] = nextPos;

          return {
            ...v,
            lon,
            lat,
            speedKmh: (sim.speedMps ?? 0) * MPS_TO_KMH,
            headingDeg: sim.kpis.headingDeg,
            sim,
          };
        });
      });

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => {
      alive = false;
      lastTimeRef.current = null;
    };
  }, [simSpeedRef]);

  return {
    vehicles,
    setVehicles,
    addVehicle,
    startVehicleOnRoute,
    startOrResumeVehicle,
    pauseVehicle,
    resetVehicle,
  };
}