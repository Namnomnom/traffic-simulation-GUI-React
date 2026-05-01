// frontend/src/lib/intersectionsToGeoJSON.ts
import type { TrafficLightState } from "../types/simTypes";
import type { PhaseName } from "./trafficLightProgram";

export type LngLat = [number, number]; // [lng, lat]

export type IntersectionKind = "intersection" | "single";

// Optional: Single-LSA Typ (nur UI)
export type SingleLsaType = "zufahrt" | "baustelle" | "fussgaenger";

export type IntersectionVisual = {
  id: string;
  point: LngLat; // [lng, lat]

  /** UI-only quick state (z.B. für Single) */
  light: TrafficLightState;

  /** Signal-Programm Phase (kommt aus trafficLightProgram) */
  phase: PhaseName;

  /**
   * Kreuzung-Ausrichtung (Grad, 0=N).
   * Wird auch für Single genutzt.
   */
  bearing?: number;

  /** intersection (4 Köpfe) vs single (1 Kopf) */
  kind?: IntersectionKind;

  // ==========================================
  // ✅ OPTIONAL: Zeiten (damit UI/State sauber ist)
  // (optional -> bricht nichts, wenn noch nicht gesetzt)
  // ==========================================

  /** 4er-LSA: Grünzeiten je Richtung (Sekunden) */
  greenNS?: number; // ↕
  greenEW?: number; // ↔

  /** Single-LSA: fester Ablauf Grün -> Gelb(3s) -> Rot -> ... */
  singleGreenSec?: number; // z.B. 10
  singleRedSec?: number; // z.B. 30

  /** Optionales Dropdown im UI */
  singleType?: SingleLsaType;
};
