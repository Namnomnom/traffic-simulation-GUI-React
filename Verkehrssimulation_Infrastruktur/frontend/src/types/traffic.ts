// frontend/src/types/traffic.ts
import type { LngLat } from "./simTypes";

/**
 * StopPoint = virtuelle Haltelinie / Triggerpunkt für die Simulation.
 *
 * Wichtig:
 * - intersectionId muss exakt zu IntersectionVisual.id passen (sonst kein Phase-Match).
 * - bearingDeg ist die *Anfahrtsrichtung* des Fahrzeugs (0=N, 90=E, 180=S, 270=W).
 *   Also: aus welcher Richtung kommt das Fahrzeug auf die Kreuzung zu.
 */
export type StopPoint = {
  /** eindeutig & stabil (z.B. `${intersectionId}:sp:${arm}`) */
  id: string;

  /** MUSS exakt der IntersectionVisual.id entsprechen */
  intersectionId: string;

  /** Anfahrtsrichtung des Fahrzeugs (0=N,90=E,180=S,270=W) */
  bearingDeg: number;

  /** Position der Haltelinie/Triggerpunkt */
  point: LngLat;
};

/**
 * IntersectionPhase = Simulationsphase pro Kreuzung.
 * Minimal für NS/EW-Logik.
 */
export type IntersectionPhase =
  // ✅ 4er-Kreuzung (neu)
  | {
      intersectionId: string;
      kind: "intersection";
      phase: "NS_GREEN" | "EW_GREEN";
    }
  // ✅ Single-LSA (neu)
  | {
      intersectionId: string;
      kind: "single";
      light: "GREEN" | "YELLOW" | "RED";
    }
  // ✅ Legacy (alt, damit alte Stellen weiter funktionieren)
  | {
      intersectionId: string;
      phase: "NS_GREEN" | "EW_GREEN";
    }
  | {
      intersectionId: string;
      light: "GREEN" | "YELLOW" | "RED";
    };