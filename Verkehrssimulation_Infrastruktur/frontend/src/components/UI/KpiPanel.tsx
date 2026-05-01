// frontend/src/components/UI/KpiPanel.tsx
// OPTIMIERTE VERSION – neues Design:
// - Heller Hintergrund statt dunkel
// - 3 Metric-Cards nebeneinander statt lange Blöcke
// - Status-Zeile (Netz, Stau, Zeit)
// - Fahrzeug-Liste integriert
// - Kein Slider mehr – nur Fortschrittsbalken

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SimState } from "../../hooks/useGlobalSimulation";

type AnyVehicle = Record<string, any>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  simState: SimState;
  vehicles: AnyVehicle[];
  defaultPosition?: { x: number; y: number };
  marginPx?: number;
};

const DEFAULT_POS = { x: 16, y: 16 };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function prettyState(s: SimState) {
  const l = String(s).toLowerCase();
  if (l === "running") return "läuft";
  if (l === "paused")  return "pausiert";
  return "stopped";
}

function niceCeil(n: number) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const x = n / pow;
  const step = x <= 1 ? 1 : x <= 2 ? 2 : x <= 5 ? 5 : 10;
  return step * pow;
}

// ─── Style-Konstanten ────────────────────────────────────────────────────────

const C = {
  panel: {
    background: "#ffffff",
    border: "1px solid #e5e5e0",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
    color: "#222",
  } as React.CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderBottom: "1px solid #eeeeea",
    cursor: "grab",
    background: "#ffffff",
    gap: 10,
  } as React.CSSProperties,

  badge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: "#1a3a5c",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as React.CSSProperties,

  iconBtn: {
    border: "1px solid #e5e5e0",
    background: "#f5f5f0",
    color: "#555",
    cursor: "pointer",
    borderRadius: 8,
    width: 30,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    flexShrink: 0,
  } as React.CSSProperties,

  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    borderBottom: "1px solid #eeeeea",
  } as React.CSSProperties,

  metricCell: (last: boolean): React.CSSProperties => ({
    padding: "10px 10px",
    borderRight: last ? "none" : "1px solid #eeeeea",
    minWidth: 0,
  }),

  statusRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    borderBottom: "1px solid #eeeeea",
  } as React.CSSProperties,

  statusCell: (last: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "7px 8px",
    borderRight: last ? "none" : "1px solid #eeeeea",
    minWidth: 0,
  }),

  vehicleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    borderTop: "1px solid #eeeeea",
  } as React.CSSProperties,

  vehicleIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    background: "#EBF3FB",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 14,
  } as React.CSSProperties,
};

// ─── Dot-Farben ──────────────────────────────────────────────────────────────
const DOT_COLOR = {
  good: "#639922",
  warn: "#BA7517",
  bad:  "#E24B4A",
  blue: "#378ADD",
  gray: "#888780",
};

const BAR_COLOR = {
  good: "#639922",
  warn: "#BA7517",
  bad:  "#E24B4A",
  blue: "#378ADD",
};

const BADGE_STYLE = {
  ok:   { background: "#EAF3DE", color: "#3B6D11" },
  warn: { background: "#FAEEDA", color: "#854F0B" },
  stop: { background: "#FCEBEB", color: "#A32D2D" },
};

// ─── Sub-Komponenten ─────────────────────────────────────────────────────────

function Dot({ color }: { color: string }) {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: "50%",
      background: color, flexShrink: 0, display: "inline-block",
    }} />
  );
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{
      height: 3, borderRadius: 999,
      background: "#eeeeea", marginTop: 8, overflow: "hidden",
    }}>
      <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 999 }} />
    </div>
  );
}

function MetricCell({
  label, dot, value, unit, pct, barColor, last,
}: {
  label: string; dot: string; value: string; unit: string;
  pct: number; barColor: string; last: boolean;
}) {
  return (
    <div style={C.metricCell(last)}>
      <div style={{ fontSize: 11, color: "#888", display: "flex", alignItems: "center", gap: 4, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        <Dot color={dot} />
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 500, color: "#111", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap", marginTop: 2 }}>{unit}</div>
      <MiniBar pct={pct} color={barColor} />
    </div>
  );
}

function StatusCell({
  dot, label, value, valueColor, last,
}: {
  dot: string; label: string; value: string; valueColor?: string; last: boolean;
}) {
  return (
    <div style={C.statusCell(last)}>
      <Dot color={dot} />
      <span style={{ fontSize: 12, color: "#888" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: valueColor ?? "#222", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {value}
      </span>
    </div>
  );
}

function VehicleBadge({ status }: { status: "ok" | "warn" | "stop" }) {
  const s = BADGE_STYLE[status];
  const label = status === "ok" ? "Fährt" : status === "warn" ? "Wartet" : "Gestoppt";
  return (
    <span style={{
      fontSize: 12, padding: "2px 8px", borderRadius: 999,
      background: s.background, color: s.color, fontWeight: 500,
    }}>
      {label}
    </span>
  );
}

// ─── Hauptkomponente ─────────────────────────────────────────────────────────

export default function KpiPanel({
  open,
  onOpenChange,
  simState,
  vehicles,
  defaultPosition = DEFAULT_POS,
  marginPx = 12,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<"global" | "vehicle">("global");
  const [panelSize, setPanelSize] = useState({ w: 360, h: 300 });
  const [pos, setPos] = useState(() => ({ x: defaultPosition.x, y: defaultPosition.y }));

  const draggingRef      = useRef(false);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartRef     = useRef({ px: 0, py: 0, x: 0, y: 0 });

  // ResizeObserver
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setPanelSize({ w: Math.max(260, Math.round(rect.width)), h: Math.max(52, Math.round(rect.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clampToViewport = useCallback((nextX: number, nextY: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: clamp(nextX, marginPx, Math.max(marginPx, vw - panelSize.w - marginPx)),
      y: clamp(nextY, marginPx, Math.max(marginPx, vh - panelSize.h - marginPx)),
    };
  }, [marginPx, panelSize.w, panelSize.h]);

  useEffect(() => {
    const onResize = () => setPos((p) => clampToViewport(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampToViewport]);

  useEffect(() => {
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

  // KPI-Berechnung
  const kpi = useMemo(() => {
    const list = Array.isArray(vehicles) ? vehicles : [];
    const active   = list.filter((v) => !!v?.sim?.active).length;
    const finished = list.filter((v) => !!v?.sim && !v?.sim?.active && (v?.sim?.kpis?.remainingDistanceM ?? 999999) <= 0.5).length;

    const speedsKmh: number[] = [];
    let waitSum = 0, moveSum = 0;
    const waitTimes: number[] = [];
    const tripTimes: number[] = [];

    for (const v of list) {
      const sim = v?.sim;
      if (!sim) continue;
      const spMps = Number(sim?.speedMps);
      if (Number.isFinite(spMps)) speedsKmh.push(spMps * 3.6);
      const wt = Number(sim?.kpis?.waitTimeS);
      const mt = Number(sim?.kpis?.moveTimeS);
      if (Number.isFinite(wt)) { waitSum += wt; waitTimes.push(wt); }
      if (Number.isFinite(mt)) moveSum += mt;
      const tt = (Number.isFinite(wt) ? wt : 0) + (Number.isFinite(mt) ? mt : 0);
      if (Number.isFinite(tt) && tt > 0.5) tripTimes.push(tt);
    }

    const avgSpeedKmh   = speedsKmh.length ? speedsKmh.reduce((a, b) => a + b, 0) / speedsKmh.length : 0;
    const totalTime     = waitSum + moveSum;
    const stopSharePct  = totalTime > 0 ? (waitSum / totalTime) * 100 : 0;
    const avgDelayS     = waitTimes.length ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0;
    const avgTripTimeS  = tripTimes.length ? tripTimes.reduce((a, b) => a + b, 0) / tripTimes.length : 0;
    const throughputVph = avgTripTimeS > 0 ? 3600 / avgTripTimeS : 0;

    return { vehiclesCount: list.length, active, finished, avgSpeedKmh, stopSharePct, throughputVph, avgDelayS };
  }, [vehicles]);

  // Tones
  const speedTone:  "good"|"warn"|"bad" = kpi.avgSpeedKmh  >= 35 ? "good" : kpi.avgSpeedKmh  >= 22 ? "warn" : "bad";
  const stopTone:   "good"|"warn"|"bad" = kpi.stopSharePct  <= 10 ? "good" : kpi.stopSharePct  <= 25 ? "warn" : "bad";
  const thruTone:   "good"|"warn"|"bad" = kpi.throughputVph >= 700 ? "good" : kpi.throughputVph >= 300 ? "warn" : "bad";
  const netLabel  = speedTone === "good" ? "OK" : speedTone === "warn" ? "Zäh" : "Stau";
  const stauLabel = stopTone  === "good" ? "Gering" : stopTone  === "warn" ? "Mittel" : "Hoch";

  // Fahrzeug-Status
  const vehicleRows = useMemo(() => {
    const list = Array.isArray(vehicles) ? vehicles : [];
    return list.map((v) => {
      const spMps  = Number(v?.sim?.speedMps ?? 0);
      const kmh    = Math.round(spMps * 3.6);
      const active = !!v?.sim?.active;
      const status: "ok"|"warn"|"stop" = active && kmh > 2 ? "ok" : active ? "warn" : "stop";
      const pos    = v?.sim?.nearestRoad ?? v?.nearestRoad ?? "–";
      return { id: v?.id ?? "?", type: v?.type ?? "pkw", kmh, status, pos };
    });
  }, [vehicles]);

  const typeEmoji = (t: string) => {
    if (t === "lkw") return "🚚";
    if (t === "bus") return "🚌";
    if (t === "motorrad") return "🏍️";
    return "🚗";
  };

  const toggleOpen = useCallback(() => onOpenChange(!open), [onOpenChange, open]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        left: 0, top: 0,
        transform: `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`,
        zIndex: 90,
        pointerEvents: "auto",
        userSelect: draggingRef.current ? "none" : "auto",
        width: open ? 420 : 290,
      }}
    >
      <div style={C.panel}>

        {/* ── Header ── */}
        <div
          style={C.header}
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="Ziehen zum Verschieben"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={C.badge}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#fff" strokeWidth="1.3">
                <rect x="1" y="6" width="2" height="6" rx="0.4"/>
                <rect x="5" y="3.5" width="2" height="8.5" rx="0.4"/>
                <rect x="9" y="1" width="2" height="11" rx="0.4"/>
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#111", whiteSpace: "nowrap" }}>
                KPI – Global
              </div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 1, whiteSpace: "nowrap" }}>
                Analyse: {prettyState(simState)} · {kpi.vehiclesCount} Fahrzeuge
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* Tab-Toggle */}
            {open && (
              <div style={{ display: "flex", gap: 3 }}>
                {(["global", "vehicle"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setTab(t); }}
                    style={{
                      fontSize: 10,
                      padding: "3px 8px",
                      borderRadius: 5,
                      border: tab === t ? "none" : "1px solid #e5e5e0",
                      background: tab === t ? "#1a3a5c" : "transparent",
                      color: tab === t ? "#fff" : "#888",
                      cursor: "pointer",
                    }}
                  >
                    {t === "global" ? "Global" : "Fahrzeuge"}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); toggleOpen(); }}
              style={C.iconBtn}
              title={open ? "Einklappen" : "Aufklappen"}
            >
              {open ? "▾" : "▸"}
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        {open && tab === "global" && (
          <>
            {/* 3 Metric-Cards */}
            <div style={C.metricsRow}>
              <MetricCell
                label="Geschwindigkeit"
                dot={DOT_COLOR[speedTone]}
                value={`${Math.round(kpi.avgSpeedKmh)}`}
                unit="km/h"
                pct={(kpi.avgSpeedKmh / 130) * 100}
                barColor={BAR_COLOR[speedTone]}
                last={false}
              />
              <MetricCell
                label="Stop-Anteil"
                dot={DOT_COLOR[stopTone]}
                value={`${Math.round(kpi.stopSharePct)}`}
                unit="% der Zeit"
                pct={kpi.stopSharePct * 2}
                barColor={BAR_COLOR[stopTone]}
                last={false}
              />
              <MetricCell
                label="Durchsatz"
                dot={DOT_COLOR[thruTone]}
                value={`${Math.round(kpi.throughputVph)}`}
                unit="Fzg/h"
                pct={(kpi.throughputVph / 1000) * 100}
                barColor={BAR_COLOR[thruTone]}
                last={true}
              />
            </div>

            {/* Status-Zeile */}
            <div style={C.statusRow}>
              <StatusCell
                dot={DOT_COLOR[speedTone]}
                label="Netz"
                value={netLabel}
                valueColor={DOT_COLOR[speedTone]}
                last={false}
              />
              <StatusCell
                dot={DOT_COLOR[stopTone]}
                label="Stau"
                value={stauLabel}
                valueColor={DOT_COLOR[stopTone]}
                last={false}
              />
              <StatusCell
                dot={DOT_COLOR.blue}
                label="Verzögerung"
                value={`${Math.round(kpi.avgDelayS)} s`}
                last={true}
              />
            </div>
          </>
        )}

        {open && tab === "vehicle" && (
          <>
            {/* Fahrzeug-Titel */}
            <div style={{
              fontSize: 12, fontWeight: 500, color: "#888",
              textTransform: "uppercase", letterSpacing: "0.05em",
              padding: "8px 12px 4px",
            }}>
              Fahrzeuge im Überblick
            </div>

            <div style={{ maxHeight: 320, overflowY: "auto", overflowX: "hidden" }}>
              {vehicleRows.length === 0 ? (
                <div style={{ padding: "16px 12px", fontSize: 13, color: "#aaa", textAlign: "center" }}>
                  Noch keine Fahrzeuge vorhanden.
                </div>
              ) : (
                vehicleRows.map((v) => (
                  <div key={v.id} style={C.vehicleRow}>
                    <div style={C.vehicleIcon}>{typeEmoji(v.type)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#111" }}>
                        Fahrzeug #{v.id}
                      </div>
                      <div style={{ fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.pos}
                      </div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{v.kmh} km/h</span>
                      <VehicleBadge status={v.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}