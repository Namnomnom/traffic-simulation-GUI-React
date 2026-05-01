// frontend/src/components/UI/SelectedTrafficLightPanelView.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import type { IntersectionVisual } from "../../lib/intersectionsToGeoJSON";

type SingleGroupId = "Gruppe1" | "Gruppe2" | "Gruppe3" | "Gruppe4" | "Gruppe5" | "Gruppe6";

type Props = {
  selectedIntersection: IntersectionVisual | null;

  /** optional – wenn du’s nicht gibst, wird kein Countdown angezeigt */
  simTimeSec?: number;

  /** Rotation */
  onSetIntersectionBearing: (groupId: string, bearing: number) => void;

  /** Delete */
  onDeleteIntersection: (groupId: string) => void;

  /**
   * Speichern:
   * - 4er LSA: (greenNS, greenEW)
   * - Single: (singleGreenSec, singleRedSec)
   */
  onSetIntersectionGreenTimes?: (groupId: string, a: number, b: number) => void;

  /** Phase sofort umschalten (optional, v.a. für 4er-LSA) */
  onToggleIntersectionPhase?: (groupId: string) => void;

  /**
   * ✅ Single-Schaltgruppe persistent setzen (für Einzel-LSA).
   * Wenn nicht übergeben: UI ändert lokal, aber nicht im State.
   */
  onSetSingleGroupId?: (intersectionId: string, groupId: SingleGroupId) => void;

  onClose?: () => void;
};

// ---------- helpers ----------
function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? Math.round(n) : min;
  return Math.max(min, Math.min(max, x));
}

function clampBearing(b: number): number {
  const x = Math.round(b) % 360;
  return x < 0 ? x + 360 : x;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBearing(value: unknown): number {
  const n = toNumber(value);
  return n == null ? 0 : clampBearing(n);
}

/** 4er-LSA Grünzeiten tolerant auslesen */
function readFourWayGreenTimes(itx: any, defaults = { ns: 30, ew: 30 }) {
  const ns = toNumber(itx?.greenA) ?? toNumber(itx?.greenNS) ?? toNumber(itx?.dir1GreenSec) ?? defaults.ns;
  const ew = toNumber(itx?.greenB) ?? toNumber(itx?.greenEW) ?? toNumber(itx?.dir2GreenSec) ?? defaults.ew;

  return {
    ns: clampInt(ns, 1, 300),
    ew: clampInt(ew, 1, 300),
  };
}

/** Single-LSA Zeiten tolerant auslesen */
function readSingleTimes(itx: any, defaults = { green: 10, red: 30 }) {
  const green = toNumber(itx?.singleGreenSec) ?? toNumber(itx?.greenSec) ?? toNumber(itx?.green) ?? defaults.green;
  const red = toNumber(itx?.singleRedSec) ?? toNumber(itx?.redSec) ?? toNumber(itx?.red) ?? defaults.red;

  return {
    green: clampInt(green, 1, 300),
    red: clampInt(red, 1, 300),
  };
}

function normalizeSingleGroupId(raw: unknown): SingleGroupId {
  const s = String(raw ?? "").trim();

  // ✅ neuer Standard
  if (
    s === "Gruppe1" ||
    s === "Gruppe2" ||
    s === "Gruppe3" ||
    s === "Gruppe4" ||
    s === "Gruppe5" ||
    s === "Gruppe6"
  ) {
    return s;
  }

  // ✅ Backward-compat: alte Werte C1..C6 werden gemappt
  const upper = s.toUpperCase();
  if (upper === "C1") return "Gruppe1";
  if (upper === "C2") return "Gruppe2";
  if (upper === "C3") return "Gruppe3";
  if (upper === "C4") return "Gruppe4";
  if (upper === "C5") return "Gruppe5";
  if (upper === "C6") return "Gruppe6";

  return "Gruppe1";
}

function readSingleGroupId(itx: any): SingleGroupId {
  return normalizeSingleGroupId(itx?.singleGroupId ?? itx?.singleGroup ?? itx?.groupId);
}

// ---------- 4er-LSA Phase/Countdown exakt wie App.tsx ----------
type PhaseLabel =
  | "NS_GREEN"
  | "NS_YELLOW"
  | "ALL_RED_1"
  | "EW_RED_YELLOW"
  | "EW_GREEN"
  | "EW_YELLOW"
  | "ALL_RED_2"
  | "NS_RED_YELLOW";

function computePhaseFromClock(tNow: number, greenNS: number, greenEW: number) {
  const YELLOW_SEC = 3;
  const ALL_RED_SEC = 1;
  const RED_YELLOW_SEC = 1;

  const ns = clampInt(greenNS, 1, 300);
  const ew = clampInt(greenEW, 1, 300);

  const t0 = ns;
  const t1 = t0 + YELLOW_SEC;
  const t2 = t1 + ALL_RED_SEC;
  const t3 = t2 + RED_YELLOW_SEC;
  const t4 = t3 + ew;
  const t5 = t4 + YELLOW_SEC;
  const t6 = t5 + ALL_RED_SEC;
  const t7 = t6 + RED_YELLOW_SEC;

  const cycle = t7;
  const t = ((tNow % cycle) + cycle) % cycle;

  let phase: PhaseLabel;
  let remaining: number;

  if (t < t0) {
    phase = "NS_GREEN";
    remaining = t0 - t;
  } else if (t < t1) {
    phase = "NS_YELLOW";
    remaining = t1 - t;
  } else if (t < t2) {
    phase = "ALL_RED_1";
    remaining = t2 - t;
  } else if (t < t3) {
    phase = "EW_RED_YELLOW";
    remaining = t3 - t;
  } else if (t < t4) {
    phase = "EW_GREEN";
    remaining = t4 - t;
  } else if (t < t5) {
    phase = "EW_YELLOW";
    remaining = t5 - t;
  } else if (t < t6) {
    phase = "ALL_RED_2";
    remaining = t6 - t;
  } else {
    phase = "NS_RED_YELLOW";
    remaining = t7 - t;
  }

  return {
    phase,
    cycle,
    remainingSec: Math.max(0, Math.ceil(remaining)),
  };
}

function formatPhaseUI(phase: PhaseLabel) {
  switch (phase) {
    case "NS_GREEN":
      return { emoji: "🟢", text: "Grün", dir: "↕" };
    case "NS_YELLOW":
      return { emoji: "🟡", text: "Gelb", dir: "↕" };
    case "ALL_RED_1":
      return { emoji: "🔴", text: "Alles Rot", dir: "⛔" };
    case "EW_RED_YELLOW":
      return { emoji: "🔴🟡", text: "Rot-Gelb", dir: "↔" };
    case "EW_GREEN":
      return { emoji: "🟢", text: "Grün", dir: "↔" };
    case "EW_YELLOW":
      return { emoji: "🟡", text: "Gelb", dir: "↔" };
    case "ALL_RED_2":
      return { emoji: "🔴", text: "Alles Rot", dir: "⛔" };
    case "NS_RED_YELLOW":
      return { emoji: "🔴🟡", text: "Rot-Gelb", dir: "↕" };
  }
}

// ---------- Single-LSA: GREEN -> YELLOW(3s) -> RED -> RED_YELLOW(1s) ----------
function computeSingleFromClock(tNow: number, greenSec: number, redSec: number) {
  const YELLOW_SEC = 3;
  const RED_YELLOW_SEC = 1;

  const g = clampInt(greenSec, 1, 300);
  const r = clampInt(redSec, 1, 300);

  const t0 = g;
  const t1 = t0 + YELLOW_SEC;
  const t2 = t1 + r;
  const t3 = t2 + RED_YELLOW_SEC;

  const cycle = t3;
  const t = ((tNow % cycle) + cycle) % cycle;

  let state: "GREEN" | "YELLOW" | "RED" | "RED_YELLOW";
  let remaining: number;

  if (t < t0) {
    state = "GREEN";
    remaining = t0 - t;
  } else if (t < t1) {
    state = "YELLOW";
    remaining = t1 - t;
  } else if (t < t2) {
    state = "RED";
    remaining = t2 - t;
  } else {
    state = "RED_YELLOW";
    remaining = t3 - t;
  }

  return {
    state,
    cycle,
    remainingSec: Math.max(0, Math.ceil(remaining)),
    yellowSec: YELLOW_SEC,
    redYellowSec: RED_YELLOW_SEC,
  };
}

function formatSingleUI(state: "GREEN" | "YELLOW" | "RED" | "RED_YELLOW") {
  switch (state) {
    case "GREEN":
      return { emoji: "🟢", text: "Grün" };
    case "YELLOW":
      return { emoji: "🟡", text: "Gelb" };
    case "RED":
      return { emoji: "🔴", text: "Rot" };
    case "RED_YELLOW":
      return { emoji: "🔴🟡", text: "Rot-Gelb" };
  }
}

const GROUP_OPTIONS: Array<{ id: SingleGroupId; label: string }> = [
  { id: "Gruppe1", label: "Gruppe1" },
  { id: "Gruppe2", label: "Gruppe2" },
  { id: "Gruppe3", label: "Gruppe3" },
  { id: "Gruppe4", label: "Gruppe4" },
  { id: "Gruppe5", label: "Gruppe5" },
  { id: "Gruppe6", label: "Gruppe6" },
];

export default function SelectedTrafficLightPanelView({
  selectedIntersection,
  simTimeSec,
  onSetIntersectionBearing,
  onDeleteIntersection,
  onSetIntersectionGreenTimes,
  onToggleIntersectionPhase,
  onSetSingleGroupId,
  onClose,
}: Props) {
  if (!selectedIntersection) return null;

  const id = selectedIntersection.id;
  const kind = selectedIntersection.kind ?? "intersection";
  const isSingle = kind === "single";
  const isFourWay = !isSingle;

  // ---------- bearing ----------
  const selBearing = useMemo(() => {
    const raw = (selectedIntersection as any).bearing ?? (selectedIntersection as any).bearingDeg;
    return toBearing(raw);
  }, [selectedIntersection]);

  const setBearing = useCallback(
    (bearing: number) => onSetIntersectionBearing(id, clampBearing(bearing)),
    [id, onSetIntersectionBearing]
  );

  // ---------- 4er-LSA times ----------
  const initialFour = useMemo(() => readFourWayGreenTimes(selectedIntersection as any), [selectedIntersection]);
  const [greenNS, setGreenNS] = useState(initialFour.ns);
  const [greenEW, setGreenEW] = useState(initialFour.ew);

  // ---------- Single times ----------
  const initialSingle = useMemo(() => readSingleTimes(selectedIntersection as any), [selectedIntersection]);
  const [singleGreen, setSingleGreen] = useState(initialSingle.green);
  const [singleRed, setSingleRed] = useState(initialSingle.red);

  // ---------- Single group ----------
  const initialGroup = useMemo(() => readSingleGroupId(selectedIntersection as any), [selectedIntersection]);
  const [singleGroup, setSingleGroup] = useState<SingleGroupId>(initialGroup);

  // Wenn Auswahl wechselt -> UI reset
  useEffect(() => {
    setGreenNS(initialFour.ns);
    setGreenEW(initialFour.ew);
    setSingleGreen(initialSingle.green);
    setSingleRed(initialSingle.red);
    setSingleGroup(initialGroup);
  }, [id, initialFour.ns, initialFour.ew, initialSingle.green, initialSingle.red, initialGroup]);

  const ns = clampInt(greenNS, 1, 300);
  const ew = clampInt(greenEW, 1, 300);
  const sg = clampInt(singleGreen, 1, 300);
  const sr = clampInt(singleRed, 1, 300);

  // ---------- status ----------
  const fourCalc = useMemo(() => {
    if (!isFourWay) return null;
    if (typeof simTimeSec !== "number" || !Number.isFinite(simTimeSec)) return null;
    return computePhaseFromClock(simTimeSec, ns, ew);
  }, [isFourWay, simTimeSec, ns, ew]);

  const fourUI = useMemo(() => (fourCalc ? formatPhaseUI(fourCalc.phase) : null), [fourCalc]);

  const singleCalc = useMemo(() => {
    if (!isSingle) return null;
    if (typeof simTimeSec !== "number" || !Number.isFinite(simTimeSec)) return null;
    return computeSingleFromClock(simTimeSec, sg, sr);
  }, [isSingle, simTimeSec, sg, sr]);

  const singleUI = useMemo(() => (singleCalc ? formatSingleUI(singleCalc.state) : null), [singleCalc]);

  const fourCycleSec = useMemo(() => (fourCalc ? fourCalc.cycle : null), [fourCalc]);
  const singleCycleSec = useMemo(() => (singleCalc ? singleCalc.cycle : sg + 3 + sr), [singleCalc, sg, sr]);

  const dirtyFour = greenNS !== initialFour.ns || greenEW !== initialFour.ew;
  const dirtySingle = singleGreen !== initialSingle.green || singleRed !== initialSingle.red || singleGroup !== initialGroup;
  const dirty = isSingle ? dirtySingle : dirtyFour;

  // ---------- actions ----------
  const onApply = useCallback(() => {
    if (isSingle) {
      // ✅ 1) Zeiten speichern (Hook speichert auf gesamte Schaltgruppe)
      onSetIntersectionGreenTimes?.(id, clampInt(singleGreen, 1, 300), clampInt(singleRed, 1, 300));
      // ✅ 2) Schaltgruppe persistieren
      onSetSingleGroupId?.(id, singleGroup);
      return;
    }
    onSetIntersectionGreenTimes?.(id, clampInt(greenNS, 1, 300), clampInt(greenEW, 1, 300));
  }, [
    id,
    isSingle,
    onSetIntersectionGreenTimes,
    onSetSingleGroupId,
    singleGreen,
    singleRed,
    singleGroup,
    greenNS,
    greenEW,
  ]);

  const onSwitchNow = useCallback(() => onToggleIntersectionPhase?.(id), [onToggleIntersectionPhase, id]);
  const onDelete = useCallback(() => onDeleteIntersection(id), [onDeleteIntersection, id]);

  const statusLeft = isSingle
    ? singleUI
      ? `${singleUI.emoji} ${singleUI.text}`
      : "—"
    : fourUI
      ? `${fourUI.emoji} ${fourUI.text}`
      : "—";

  const statusRight = isSingle
    ? singleCalc
      ? `(in ${singleCalc.remainingSec}s)`
      : ""
    : fourCalc
      ? `${fourUI?.dir ?? ""} (in ${fourCalc.remainingSec}s)`
      : "";

  // ---------- UI ----------
  return (
    <div className={`tl-card ${isSingle ? "tl-card--compact" : ""}`} role="region" aria-label="Ausgewählte LSA">
      <div className="tl-card__header">
        <div className="tl-card__titlewrap">
          <div className="tl-card__title">
            <span className="tl-badge" aria-hidden="true">
              🚦
            </span>
            LSA {id}
          </div>
          <div className="tl-card__subtitle">{isFourWay ? "Kreuzung (4er LSA)" : "Einzel-LSA"}</div>
        </div>

        {onClose ? (
          <button type="button" className="tl-iconbtn" onClick={onClose} aria-label="Schließen" title="Schließen">
            ✕
          </button>
        ) : null}
      </div>

      {/* Status */}
      <div className="tl-card__meta" aria-live="polite">
        <div className="tl-pill" style={{ justifyContent: "space-between", width: "100%" }}>
          <span className="tl-pill__k">{statusLeft}</span>
          <span className="tl-pill__v">{statusRight}</span>
        </div>
      </div>

      {/* ===================== 4er LSA: UNVERÄNDERT ===================== */}
      {isFourWay && (
        <div className="tl-card__section">
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Grünzeiten</div>

          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, opacity: 0.9 }}>
                <span>↕ Grün</span>
                <b>{greenNS}s</b>
              </div>
              <input
                className="tl-range"
                type="range"
                min={5}
                max={120}
                value={greenNS}
                onChange={(e) => setGreenNS(clampInt(e.target.valueAsNumber, 1, 300))}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, opacity: 0.9 }}>
                <span>↔ Grün</span>
                <b>{greenEW}s</b>
              </div>
              <input
                className="tl-range"
                type="range"
                min={5}
                max={120}
                value={greenEW}
                onChange={(e) => setGreenEW(clampInt(e.target.valueAsNumber, 1, 300))}
              />
            </div>

            <div className="tl-pill" style={{ width: "100%" }}>
              <span className="tl-pill__k">Zyklus</span>
              <span className="tl-pill__v">{typeof fourCycleSec === "number" ? `${fourCycleSec}s` : "—"}</span>
            </div>

            <div className="tl-card__row2">
              <button type="button" className="tl-btn" onClick={onApply} disabled={!onSetIntersectionGreenTimes || !dirty}>
                (Grünzeiten) Übernehmen
              </button>
              <button type="button" className="tl-btn tl-btn--ghost" onClick={onSwitchNow} disabled={!onToggleIntersectionPhase}>
                Jetzt umschalten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== Single LSA: KOMPAKT + Schaltgruppe ===================== */}
      {isSingle && (
        <div className="tl-card__section" style={{ paddingBottom: 10 }}>
          {/* Schaltgruppe */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, opacity: 0.85, fontSize: 15, whiteSpace: "nowrap" }}>Schaltgruppe</div>

            <select
              value={singleGroup}
              onChange={(e) => setSingleGroup(e.target.value as SingleGroupId)}
              style={{
                width: 105,
                padding: "5px 8px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.9)",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
              title="Schaltgruppe (gemeinsamer LSA-Takt)"
            >
              {GROUP_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontWeight: 800, marginBottom: 10 }}>Schaltzeiten</div>

          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, opacity: 0.9 }}>
                <span>🟢 Grün</span>
                <b>{singleGreen}s</b>
              </div>
              <input
                className="tl-range"
                type="range"
                min={5}
                max={120}
                value={singleGreen}
                onChange={(e) => setSingleGreen(clampInt(e.target.valueAsNumber, 1, 300))}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, opacity: 0.9 }}>
                <span>🔴 Rot</span>
                <b>{singleRed}s</b>
              </div>
              <input
                className="tl-range"
                type="range"
                min={5}
                max={240}
                value={singleRed}
                onChange={(e) => setSingleRed(clampInt(e.target.valueAsNumber, 1, 300))}
              />
            </div>

            {/* Gelb + Zyklus kompakt */}
            <div style={{ display: "flex", gap: 8 }}>
              <div className="tl-pill" style={{ flex: 1 }}>
                <span className="tl-pill__k">🟡 Gelb</span>
                <span className="tl-pill__v">3s</span>
              </div>
              <div className="tl-pill" style={{ flex: 1 }}>
                <span className="tl-pill__k">🔴🟡 Rot-Gelb</span>
                <span className="tl-pill__v">1s</span>
              </div>
            </div>

            <div className="tl-pill" style={{ width: "100%", marginTop: 8 }}>
              <span className="tl-pill__k">Zyklus</span>
              <span className="tl-pill__v">{typeof singleCycleSec === "number" ? `${singleCycleSec}s` : "—"}</span>
            </div>

            {/* Buttons */}
            <div className="tl-card__row2">
              <button type="button" className="tl-btn" onClick={onApply} disabled={!onSetIntersectionGreenTimes || !dirty}>
                Übernehmen (Schaltzeiten)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rotation */}
      <div className="tl-card__section">
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Rotation</div>

        <div className="tl-card__row2">
          <button type="button" className="tl-btn tl-btn--ghost" onClick={() => setBearing(selBearing - 10)}>
            ↺ −10°
          </button>
          <button type="button" className="tl-btn tl-btn--ghost" onClick={() => setBearing(selBearing + 10)}>
            ↻ +10°
          </button>
        </div>

        <div className="tl-card__slider">
          <input
            className="tl-range"
            type="range"
            min={0}
            max={359}
            value={selBearing}
            onChange={(e) => setBearing(e.target.valueAsNumber)}
          />
        </div>

        <div className="tl-card__divider" />

        <button type="button" className="tl-btn tl-btn--danger" onClick={onDelete} title="LSA löschen">
          🗑 Löschen
        </button>
      </div>
    </div>
  );
}
