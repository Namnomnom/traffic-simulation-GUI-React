// frontend/src/hooks/useTrafficLightTimers.ts
import { useEffect, useMemo, useRef } from "react";
import type { IntersectionVisual } from "../lib/intersectionsToGeoJSON";
import { DEFAULT_TL_PROGRAM } from "../lib/trafficLightProgram";
import type { Dir, TLState } from "../lib/trafficLightProgram";

type Options = {
  enabled: boolean;
  tickMs: number;
};

type DefaultStep = (typeof DEFAULT_TL_PROGRAM)[number];
type SimPhase = "NS_GREEN" | "EW_GREEN";

/**
 * ✅ SINGLE Programm (mit GELB + ROT + ROTGELB)
 * -> passt zu deinem Kreuzungs-Programm (Grün 25s, Gelb 3s, All-Red 12s, Rot-Gelb 1.2s)
 * Du kannst SINGLE_RED später anders wählen, aber so ist es “wie Kreuzung”.
 */
const SINGLE_TL_PROGRAM: Array<{
  name: "SINGLE_GREEN" | "SINGLE_YELLOW_TO_RED" | "SINGLE_RED" | "SINGLE_RED_YELLOW_TO_GREEN";
  durationMs: number;
  heads: Record<Dir, TLState>;
}> = [
  {
    name: "SINGLE_GREEN",
    durationMs: 25000,
    heads: { N: "GREEN", S: "GREEN", E: "RED", W: "RED" },
  },
  {
    name: "SINGLE_YELLOW_TO_RED",
    durationMs: 3000,
    heads: { N: "YELLOW", S: "YELLOW", E: "RED", W: "RED" },
  },
  {
    name: "SINGLE_RED",
    durationMs: 12000,
    heads: { N: "RED", S: "RED", E: "RED", W: "RED" },
  },
  {
    name: "SINGLE_RED_YELLOW_TO_GREEN",
    durationMs: 1200,
    heads: { N: "YELLOW", S: "YELLOW", E: "RED", W: "RED" },
  },
];

function pickAnyLightFromHeads(heads: Record<Dir, TLState>): TLState {
  const vals = Object.values(heads);
  if (vals.includes("GREEN")) return "GREEN";
  if (vals.includes("YELLOW")) return "YELLOW";
  return "RED";
}

/**
 * ✅ Sim-Phase (2-state) für useVehicles
 * YELLOW zählt als "GO", damit das nicht flackert.
 */
function normalizePhaseToSimTwoState(progHeads: Record<Dir, TLState>, fallback: SimPhase): SimPhase {
  const ns = [progHeads.N, progHeads.S];
  const ew = [progHeads.E, progHeads.W];

  const nsHasGo = ns.includes("GREEN") || ns.includes("YELLOW");
  const ewHasGo = ew.includes("GREEN") || ew.includes("YELLOW");

  if (nsHasGo && !ewHasGo) return "NS_GREEN";
  if (ewHasGo && !nsHasGo) return "EW_GREEN";
  return fallback;
}

/**
 * ✅ UI-FIX:
 * Für SINGLE setzen wir `phase` NICHT auf "SINGLE_*",
 * sondern auf einen passenden DEFAULT_TL_PROGRAM-Phasen-Namen,
 * den dein trafficLightsLayer schon kennt (damit ROT/GELB sauber angezeigt werden).
 */
function findDefaultPhaseName(predicate: (h: Record<Dir, TLState>) => boolean, fallbackName: string): string {
  const step = DEFAULT_TL_PROGRAM.find((p) => predicate(p.heads));
  return (step?.name as string) ?? fallbackName;
}

function isAllRed(h: Record<Dir, TLState>) {
  return h.N === "RED" && h.S === "RED" && h.E === "RED" && h.W === "RED";
}

function isNSGreen(h: Record<Dir, TLState>) {
  return h.N === "GREEN" && h.S === "GREEN" && h.E === "RED" && h.W === "RED";
}

function isNSYellow(h: Record<Dir, TLState>) {
  return h.N === "YELLOW" && h.S === "YELLOW" && h.E === "RED" && h.W === "RED";
}

/**
 * ✅ Controller Key:
 * - Kreuzung: key = id
 * - SINGLE:
 *    - wenn controllerId gesetzt => mehrere Singles teilen sich den gleichen key => synchron
 *    - sonst key = id => bleibt asynchron
 */
function controllerKeyOf(itx: IntersectionVisual): string {
  const ctrl = (itx as any).controllerId as string | undefined;
  return ctrl && ctrl.length > 0 ? ctrl : itx.id;
}

/** interne Timer-State Struktur */
type TimerState = { idx: number; elapsed: number };

/** Clamp index defensiv (HMR / program length changes) */
function clampIdx(idx: number, len: number) {
  if (!Number.isFinite(idx) || len <= 0) return 0;
  const m = idx % len;
  return m < 0 ? m + len : m;
}

export function useTrafficLightTimers(
  intersections: IntersectionVisual[],
  setIntersections: React.Dispatch<React.SetStateAction<IntersectionVisual[]>>,
  opts: Options
) {
  // ✅ Ref: immer neueste Intersections verfügbar (ohne Interval-Neustart)
  const intersectionsRef = useRef<IntersectionVisual[]>(intersections);
  useEffect(() => {
    intersectionsRef.current = intersections;
  }, [intersections]);

  /**
   * ✅ Timer-State pro ControllerKey (nicht mehr pro ID!)
   */
  const stateRef = useRef<Map<string, TimerState>>(new Map());

  /**
   * ✅ Welche ControllerKeys sind aktuell "alive"?
   */
  const aliveKeys = useMemo(() => {
    const s = new Set<string>();
    for (const k of intersections) s.add(controllerKeyOf(k));
    return s;
  }, [intersections]);

  /**
   * ✅ Cache: passende DEFAULT-Phasen für SINGLE (damit UI sie versteht)
   * -> einmal berechnen.
   */
  const singleUiPhasesRef = useRef<{ green: string; yellow: string; red: string } | null>(null);
  if (!singleUiPhasesRef.current) {
    singleUiPhasesRef.current = {
      green: findDefaultPhaseName(isNSGreen, "NS_GREEN"),
      yellow: findDefaultPhaseName(isNSYellow, "NS_YELLOW"), // fallback sinnvoller als NS_GREEN
      red: findDefaultPhaseName(isAllRed, "ALL_RED_1"),
    };
  }

  /**
   * ✅ init/cleanup TimerStates
   * - Entfernt Keys, die es nicht mehr gibt
   * - Erstellt neue Keys deterministisch (idx=0, elapsed=0)
   * - Für Kreuzungen: versucht Startphase aus itx.phase zu übernehmen, falls diese ein DefaultStep ist
   */
  useEffect(() => {
    if (!opts.enabled) return;

    // remove old keys
    for (const key of stateRef.current.keys()) {
      if (!aliveKeys.has(key)) stateRef.current.delete(key);
    }

    // add new keys
    for (const key of aliveKeys) {
      if (stateRef.current.has(key)) continue;

      const itx = intersections.find((k) => controllerKeyOf(k) === key);
      if (!itx) continue;

      const isSingle = itx.kind === "single";

      if (isSingle) {
        // ✅ deterministisch -> wenn mehrere Singles controllerId teilen, starten sie gleich
        stateRef.current.set(key, { idx: 0, elapsed: 0 });
      } else {
        // Kreuzung: Startphase übernehmen wenn möglich, sonst 0
        const startPhaseName = itx.phase as DefaultStep["name"] | undefined;
        const idxFound =
          startPhaseName != null ? DEFAULT_TL_PROGRAM.findIndex((p) => p.name === startPhaseName) : -1;
        stateRef.current.set(key, { idx: idxFound >= 0 ? idxFound : 0, elapsed: 0 });
      }
    }
  }, [opts.enabled, aliveKeys, intersections]);

  /**
   * ✅ Haupt-Interval: läuft stabil (nur abhängig von enabled/tickMs)
   */
  useEffect(() => {
    if (!opts.enabled) return;
    if (opts.tickMs <= 0) return;

    const interval = window.setInterval(() => {
      // ---- 1) Timer fortschreiben pro ControllerKey ----
      for (const [key, st] of stateRef.current.entries()) {
        const itx = intersectionsRef.current.find((x) => controllerKeyOf(x) === key);
        if (!itx) continue;

        const isSingle = itx.kind === "single";
        const program = isSingle ? SINGLE_TL_PROGRAM : DEFAULT_TL_PROGRAM;

        const len = program.length;
        const idx = clampIdx(st.idx, len);

        const cur = program[idx];
        const duration = cur.durationMs;

        let nextIdx = idx;
        let nextElapsed = st.elapsed + opts.tickMs;

        if (nextElapsed >= duration) {
          nextElapsed = 0;
          nextIdx = (idx + 1) % len;
        }

        stateRef.current.set(key, { idx: nextIdx, elapsed: nextElapsed });
      }

      // ---- 2) Intersections updaten (jede Ampel liest den State ihres controllerKey) ----
      setIntersections((prev) => {
        let changed = false;

        const next = prev.map((k) => {
          const key = controllerKeyOf(k);
          const st = stateRef.current.get(key);
          if (!st) return k;

          const isSingle = k.kind === "single";
          const program = isSingle ? SINGLE_TL_PROGRAM : DEFAULT_TL_PROGRAM;

          const step = program[clampIdx(st.idx, program.length)];
          const nextLight = pickAnyLightFromHeads(step.heads);

          // ✅ UI phase:
          // - Kreuzung: echte DEFAULT phase name (inkl. gelb/rot/all-red)
          // - Single: mappe auf bekannte DEFAULT phase name (damit dein Layer ROT/GELB rendert)
          let nextUiPhase: any;
          if (!isSingle) {
            nextUiPhase = (step as any).name;
          } else {
            const map = singleUiPhasesRef.current!;
            if (nextLight === "GREEN") nextUiPhase = map.green;
            else if (nextLight === "YELLOW") nextUiPhase = map.yellow;
            else nextUiPhase = map.red;
          }

          // ✅ SIM phase:
          // Kreuzung: normalisiert (2-state)
          // Single: nur bei RED "stop" (EW_GREEN), sonst "go" (NS_GREEN)
          const prevSimPhase = (k as any).simPhase as SimPhase | undefined;
          const fallbackSim: SimPhase = prevSimPhase === "EW_GREEN" ? "EW_GREEN" : "NS_GREEN";

          let nextSimPhase: SimPhase;
          if (isSingle) {
            nextSimPhase = nextLight === "RED" ? "EW_GREEN" : "NS_GREEN";
          } else {
            nextSimPhase = normalizePhaseToSimTwoState((step as any).heads, fallbackSim);
          }

          if (k.phase === nextUiPhase && k.light === nextLight && prevSimPhase === nextSimPhase) return k;

          changed = true;
          return {
            ...k,
            phase: nextUiPhase,
            light: nextLight as any,
            simPhase: nextSimPhase,
          } as any;
        });

        return changed ? next : prev;
      });
    }, opts.tickMs);

    return () => window.clearInterval(interval);
  }, [opts.enabled, opts.tickMs, setIntersections]);
}
