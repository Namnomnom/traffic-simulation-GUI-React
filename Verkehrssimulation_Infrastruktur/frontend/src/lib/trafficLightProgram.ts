// frontend/src/lib/trafficLightProgram.ts
export type Dir = "N" | "E" | "S" | "W";
export type TLState = "RED" | "YELLOW" | "GREEN";

/**
 * PhaseDef:
 * - name: nur Debug/Anzeige
 * - durationMs: Dauer dieser Phase
 * - heads: Zustand je Richtung
 */
export type PhaseDef = {
  name:
    | "NS_GREEN"
    | "NS_YELLOW"
    | "ALL_RED_1"
    | "EW_RED_YELLOW"
    | "EW_GREEN"
    | "EW_YELLOW"
    | "ALL_RED_2"
    | "NS_RED_YELLOW";
  durationMs: number;
  heads: Record<Dir, TLState>;
};

// ✅ Export, damit UI-Komponenten sauber typisieren können
export type PhaseName = PhaseDef["name"];

/**
 * Reihenfolge wie bei echten LSA:
 * NS Grün -> NS Gelb -> Alles Rot -> EW Rot+Gelb -> EW Grün -> EW Gelb -> Alles Rot -> NS Rot+Gelb -> (zurück zu NS Grün)
 */
export const DEFAULT_TL_PROGRAM: PhaseDef[] = [
  {
    name: "NS_GREEN",
    durationMs: 25000,
    heads: { N: "GREEN", S: "GREEN", E: "RED", W: "RED" },
  },
  {
    name: "NS_YELLOW",
    durationMs: 3000,
    heads: { N: "YELLOW", S: "YELLOW", E: "RED", W: "RED" },
  },
  {
    name: "ALL_RED_1",
    durationMs: 1000,
    heads: { N: "RED", S: "RED", E: "RED", W: "RED" },
  },
  {
    name: "EW_RED_YELLOW",
    durationMs: 1200,
    heads: { N: "RED", S: "RED", E: "YELLOW", W: "YELLOW" },
  },
  {
    name: "EW_GREEN",
    durationMs: 25000,
    heads: { N: "RED", S: "RED", E: "GREEN", W: "GREEN" },
  },
  {
    name: "EW_YELLOW",
    durationMs: 3000,
    heads: { N: "RED", S: "RED", E: "YELLOW", W: "YELLOW" },
  },
  {
    name: "ALL_RED_2",
    durationMs: 1000,
    heads: { N: "RED", S: "RED", E: "RED", W: "RED" },
  },
  {
    name: "NS_RED_YELLOW",
    durationMs: 1200,
    heads: { N: "YELLOW", S: "YELLOW", E: "RED", W: "RED" },
  },
];
