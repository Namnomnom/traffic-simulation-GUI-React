// frontend/src/components/UI/ScenarioComparisonPanel.tsx
// OPTIMIERTE VERSION – neues Design:
// - Heller Hintergrund statt dunkel
// - Szenario A = blauer Punkt, Szenario B = oranger Punkt
// - Kompakte Cards mit klaren Buttons
// - Vergleichstabelle mit farbigen Delta-Badges
// - Info-Hinweis statt dunklem Fehler-Block

import React, { useCallback, useEffect, useRef, useState } from "react";

export type ScenarioSnapshot = {
  name: string;
  capturedAt: string;
  trafficLightsCount: number;
  vehiclesCount: number;
  routedVehiclesCount: number;
  avgRoutePoints: number;
};

type Props = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  scenarioA: ScenarioSnapshot | null;
  scenarioB: ScenarioSnapshot | null;
  onCaptureA: () => void;
  onCaptureB: () => void;
  onResetA: () => void;
  onResetB: () => void;
  onResetComparison: () => void;
};

const DEFAULT_POS = { x: 40, y: 40 };
const MARGIN = 12;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatDelta(a: number, b: number) {
  const d = b - a;
  if (d === 0) return "0";
  return d > 0 ? `+${d}` : `${d}`;
}

// ─── Style-Konstanten ────────────────────────────────────────────────────────

const S = {
  panel: {
    background: "#ffffff",
    border: "1px solid #e5e5e0",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
    color: "#222",
  } as React.CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid #eeeeea",
    cursor: "grab",
    background: "#ffffff",
    gap: 10,
  } as React.CSSProperties,

  badge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: "#1a3a5c",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as React.CSSProperties,

  tableHeader: {
    display: "grid",
    gridTemplateColumns: "2fr 0.9fr 0.9fr 0.9fr",
    padding: "8px 16px",
    borderBottom: "1px solid #eeeeea",
    background: "#f9f9f7",
  } as React.CSSProperties,

  tableRow: {
    display: "grid",
    gridTemplateColumns: "2fr 0.9fr 0.9fr 0.9fr",
    padding: "10px 16px",
    borderBottom: "1px solid #eeeeea",
    alignItems: "center",
  } as React.CSSProperties,
};

// ─── Delta-Badge ─────────────────────────────────────────────────────────────

function DeltaBadge({ a, b, suffix = "" }: { a: number; b: number; suffix?: string }) {
  const d = b - a;
  const text = formatDelta(a, b) + suffix;
  const style: React.CSSProperties =
    d > 0
      ? { background: "#EAF3DE", color: "#3B6D11" }
      : d < 0
        ? { background: "#FCEBEB", color: "#A32D2D" }
        : { background: "#f5f5f0", color: "#888" };

  return (
    <span style={{
      ...style,
      display: "inline-block",
      fontSize: 12,
      fontWeight: 500,
      padding: "2px 8px",
      borderRadius: 999,
      minWidth: 40,
      textAlign: "center",
    }}>
      {text}
    </span>
  );
}

// ─── Vergleichstabelle ───────────────────────────────────────────────────────

function ComparisonTable({ a, b }: { a: ScenarioSnapshot; b: ScenarioSnapshot }) {
  const rows = [
    { label: "Lichtsignalanlagen", va: a.trafficLightsCount, vb: b.trafficLightsCount },
    { label: "Fahrzeuge",          va: a.vehiclesCount,       vb: b.vehiclesCount       },
    { label: "Mit Route",          va: a.routedVehiclesCount, vb: b.routedVehiclesCount },
    { label: "Ø Routenpunkte",     va: a.avgRoutePoints,      vb: b.avgRoutePoints      },
  ];

  return (
    <div style={{ borderTop: "1px solid #eeeeea" }}>
      <div style={S.tableHeader}>
        {["KPI", "A", "B", "Δ"].map((h, i) => (
          <div key={h} style={{
            fontSize: 11, fontWeight: 500, color: "#888",
            textAlign: i === 0 ? "left" : "right",
          }}>
            {h}
          </div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={r.label} style={{
          ...S.tableRow,
          borderBottom: i === rows.length - 1 ? "none" : "1px solid #eeeeea",
        }}>
          <div style={{ fontSize: 13, color: "#555" }}>{r.label}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#111", textAlign: "right" }}>{r.va}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#111", textAlign: "right" }}>{r.vb}</div>
          <div style={{ textAlign: "right" }}>
            <DeltaBadge a={r.va} b={r.vb} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Szenario-Card ───────────────────────────────────────────────────────────

function ScenarioCard({
  title, dotColor, scenario, buttonLabel, onCapture, onReset,
}: {
  title: string;
  dotColor: string;
  scenario: ScenarioSnapshot | null;
  buttonLabel: string;
  onCapture: () => void;
  onReset: () => void;
}) {
  const has = scenario !== null;

  return (
    <div style={{
      padding: "14px 16px",
      borderRight: "0.5px solid #eeeeea",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: dotColor, flexShrink: 0, display: "inline-block",
          }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{title}</span>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={!has}
          style={{
            fontSize: 11,
            padding: "3px 8px",
            borderRadius: 5,
            border: "1px solid #e5e5e0",
            background: has ? "#FCEBEB" : "#f5f5f0",
            color: has ? "#A32D2D" : "#aaa",
            cursor: has ? "pointer" : "not-allowed",
            opacity: has ? 1 : 0.5,
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ minHeight: 36, fontSize: 12, color: has ? "#111" : "#aaa", fontStyle: has ? "normal" : "italic" }}>
        {has ? (
          <>
            <div style={{ fontWeight: 500 }}>{scenario.name}</div>
            <div style={{ color: "#888", marginTop: 2 }}>{scenario.capturedAt}</div>
          </>
        ) : "Noch nicht gesetzt"}
      </div>

      <button
        type="button"
        onClick={onCapture}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 8,
          border: has ? "1px solid #1a3a5c" : "1px solid #e5e5e0",
          background: has ? "#1a3a5c" : "#f5f5f0",
          color: has ? "#fff" : "#333",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

// ─── Hauptkomponente ─────────────────────────────────────────────────────────

export default function ScenarioComparisonPanel({
  open,
  onOpenChange,
  scenarioA,
  scenarioB,
  onCaptureA,
  onCaptureB,
  onResetA,
  onResetB,
  onResetComparison,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [panelSize, setPanelSize] = useState({ w: 560, h: 420 });
  const [pos, setPos] = useState(DEFAULT_POS);

  const draggingRef      = useRef(false);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartRef     = useRef({ px: 0, py: 0, x: 0, y: 0 });

  const clampToViewport = useCallback((nextX: number, nextY: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: clamp(nextX, MARGIN, Math.max(MARGIN, vw - panelSize.w - MARGIN)),
      y: clamp(nextY, MARGIN, Math.max(MARGIN, vh - panelSize.h - MARGIN)),
    };
  }, [panelSize.w, panelSize.h]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !open) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setPanelSize({ w: Math.max(320, Math.round(rect.width)), h: Math.max(140, Math.round(rect.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    const onResize = () => setPos((p) => clampToViewport(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampToViewport]);

  useEffect(() => {
    if (!open) return;
    setPos((p) => clampToViewport(p.x, p.y));
  }, [panelSize.w, panelSize.h, clampToViewport, open]);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, [role='button']")) return;
    draggingRef.current = true;
    dragPointerIdRef.current = e.pointerId;
    dragStartRef.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos.x, pos.y]);

  const onHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || dragPointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - dragStartRef.current.px;
    const dy = e.clientY - dragStartRef.current.py;
    setPos(clampToViewport(dragStartRef.current.x + dx, dragStartRef.current.y + dy));
  }, [clampToViewport]);

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || dragPointerIdRef.current !== e.pointerId) return;
    draggingRef.current = false;
    dragPointerIdRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }, []);

  const isReady = scenarioA !== null && scenarioB !== null;

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        left: 0, top: 0,
        transform: `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`,
        width: 540,
        maxWidth: "calc(100vw - 32px)",
        zIndex: 95,
        pointerEvents: "auto",
        userSelect: draggingRef.current ? "none" : "auto",
      }}
    >
      <div style={S.panel}>

        {/* ── Header ── */}
        <div
          style={S.header}
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="Ziehen zum Verschieben"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={S.badge}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="#fff" strokeWidth="1.4">
                <rect x="1" y="7" width="2.5" height="7" rx="0.5"/>
                <rect x="6" y="4" width="2.5" height="10" rx="0.5"/>
                <rect x="11" y="1" width="2.5" height="13" rx="0.5"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>
                {isReady ? "Szenariovergleich" : "Szenariovergleich vorbereiten"}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                Vergleicht zwei aufgenommene Simulationszustände
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={onResetComparison}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                fontSize: 12,
                padding: "5px 12px",
                borderRadius: 7,
                border: "1px solid #F09595",
                background: "#FCEBEB",
                color: "#A32D2D",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Alles resetten
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                width: 30, height: 30,
                borderRadius: 7,
                border: "1px solid #e5e5e0",
                background: "#f5f5f0",
                color: "#555",
                cursor: "pointer",
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Szenario-Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #eeeeea" }}>
          <ScenarioCard
            title="Szenario A"
            dotColor="#378ADD"
            scenario={scenarioA}
            buttonLabel={scenarioA ? "A aktualisieren" : "Als Szenario A übernehmen"}
            onCapture={onCaptureA}
            onReset={onResetA}
          />
          <div style={{ borderLeft: "none" }}>
            <ScenarioCard
              title="Szenario B"
              dotColor="#BA7517"
              scenario={scenarioB}
              buttonLabel={scenarioB ? "B aktualisieren" : "Als Szenario B übernehmen"}
              onCapture={onCaptureB}
              onReset={onResetB}
            />
          </div>
        </div>

        {/* ── Vergleichstabelle oder Hinweis ── */}
        {isReady ? (
          <ComparisonTable a={scenarioA} b={scenarioB} />
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            background: "#f9f9f7",
          }}>
            <div style={{
              width: 28, height: 28,
              borderRadius: 7,
              background: "#EBF3FB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#185FA5" strokeWidth="1.3">
                <circle cx="7" cy="7" r="6"/>
                <path d="M7 6v4M7 4.5v.01"/>
              </svg>
            </div>
            <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>
              Bitte{" "}
              <span style={{ fontWeight: 500, color: "#111" }}>Szenario A</span>
              {" "}und{" "}
              <span style={{ fontWeight: 500, color: "#111" }}>Szenario B</span>
              {" "}aufnehmen um den Vergleich zu starten.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}