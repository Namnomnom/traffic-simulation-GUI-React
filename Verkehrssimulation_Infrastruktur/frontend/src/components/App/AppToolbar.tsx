// frontend/src/components/App/AppToolbar.tsx
// OPTIMIERTE VERSION:
// - Alle Inline-Styles auf dunkles Toolbar-Theme angepasst
// - Start = grün, Pause = gelb, Reset = transparent-weiß
// - Geschwindigkeitsbuttons: weiß-transparent, aktiv = blau
// - Status-Pill mit farbigem Punkt (rot/grün/gelb)
// - Dropdown und Labels in weißer Farbe auf dunklem BG

import React, { useCallback } from "react";
import type { SimState } from "../../hooks/useGlobalSimulation";

const SPEEDS = [0.5, 1, 2, 5] as const;
export type SimSpeed = (typeof SPEEDS)[number];

type AppToolbarProps = {
  busy: boolean;
  simState: SimState;
  simTimeSec: number;
  simSpeed: SimSpeed;
  setSimSpeed: (speed: SimSpeed) => void;
  previewTrafficLights: boolean;
  setPreviewTrafficLights: (v: boolean) => void;
  onSimStart: () => void;
  onSimPause: () => void;
  onSimReset: () => void;
  onScenarioMenu: (value: string) => void;
  statusText?: string;
};

export default function AppToolbar({
  busy,
  simState,
  simTimeSec,
  simSpeed,
  setSimSpeed,
  previewTrafficLights,
  setPreviewTrafficLights,
  onSimStart,
  onSimPause,
  onSimReset,
  onScenarioMenu,
  statusText,
}: AppToolbarProps) {
  const onScenarioChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      e.target.value = "";
      if (!v) return;
      onScenarioMenu(v);
    },
    [onScenarioMenu]
  );

  const canStart = !busy && simState !== "RUNNING";
  const canPause = !busy && simState === "RUNNING";
  const canReset = !busy && !(simState === "STOPPED" && simTimeSec === 0);

  // Status-Punkt Farbe
  const dotColor =
    simState === "RUNNING" ? "#22c55e" :
    simState === "PAUSED"  ? "#f59e0b" :
    "#ef4444";

  return (
    <header className="app-toolbar">

      {/* ── Linke Seite ─────────────────────────────────── */}
      <div className="app-toolbar-left">

        {/* Brand */}
        <span className="app-title">Verkehrssimulation</span>

        {/* Trennlinie */}
        <div style={{
          width: 1, height: 22,
          background: "rgba(255,255,255,0.2)",
          flexShrink: 0,
        }} />

        {/* Szenario-Dropdown */}
        <select
          defaultValue=""
          onChange={onScenarioChange}
          disabled={busy}
          title="Szenario Aktionen"
          style={{
            padding: "5px 10px",
            borderRadius: 7,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.1)",
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 500,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          <option value="" disabled style={{ color: "#333" }}>
            Datei (Verkehrsszenario)…
          </option>
          <option value="save_local"  style={{ color: "#333" }}>💾 Speichern…</option>
          <option value="open_local"  style={{ color: "#333" }}>📂 Öffnen…</option>
          <option value="report_csv"  style={{ color: "#333" }}>📊 Bericht erstellen (PDF)…</option>
        </select>

        {/* Trennlinie */}
        <div style={{
          width: 1, height: 22,
          background: "rgba(255,255,255,0.2)",
          flexShrink: 0,
        }} />

        {/* ── Start ── */}
        <button
          className="toolbar-btn toolbar-btn--sim toolbar-btn--start"
          onClick={onSimStart}
          disabled={!canStart}
        >
          {simState === "PAUSED" ? "▶ Fortsetzen" : "▶ Start"}
        </button>

        {/* ── Pause ── */}
        <button
          className="toolbar-btn toolbar-btn--sim toolbar-btn--pause"
          onClick={onSimPause}
          disabled={!canPause}
        >
          ⏸ Pause
        </button>

        {/* ── Reset ── */}
        <button
          className="toolbar-btn toolbar-btn--sim toolbar-btn--reset"
          onClick={onSimReset}
          disabled={!canReset}
        >
          ↺ Reset
        </button>

        {/* Trennlinie */}
        <div style={{
          width: 1, height: 22,
          background: "rgba(255,255,255,0.2)",
          flexShrink: 0,
        }} />

        {/* ── Geschwindigkeitsbuttons ── */}
        <div style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
          {SPEEDS.map((s) => {
            const isActive = simSpeed === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSimSpeed(s)}
                disabled={busy}
                title={`Simulationsgeschwindigkeit: ${s}x`}
                style={{
                  fontWeight: isActive ? 700 : 400,
                  padding: "4px 9px",
                  borderRadius: 6,
                  border: isActive
                    ? "1px solid #378ADD"
                    : "1px solid rgba(255,255,255,0.2)",
                  background: isActive
                    ? "#378ADD"
                    : "rgba(255,255,255,0.1)",
                  color: "#ffffff",
                  fontSize: 12,
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.5 : 1,
                  transition: "background 0.1s ease",
                }}
              >
                {s}×
              </button>
            );
          })}
        </div>

        {/* ── LSA-Vorschau Checkbox ── */}
        {simState !== "RUNNING" && (
          <div style={{
            display: "inline-flex",
            flexDirection: "column",
            marginLeft: 4,
            gap: 3,
            justifyContent: "center",
          }}>
            <label style={{
              display: "inline-flex",
              gap: 6,
              alignItems: "center",
              fontSize: 11,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1,
              cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={previewTrafficLights}
                onChange={(e) => setPreviewTrafficLights(e.target.checked)}
                disabled={busy}
                style={{ accentColor: "#378ADD" }}
              />
              LSA-Vorschau
            </label>
            <span style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.5)",
              lineHeight: 1,
            }}>
              {previewTrafficLights ? "☑ läuft" : "☐ aus"}
            </span>
          </div>
        )}

      </div>

      {/* ── Rechte Seite: Status-Pill ────────────────────── */}
      <div className="app-toolbar-right">

        {/* Status-Pill */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 20,
          padding: "5px 12px",
          whiteSpace: "nowrap",
        }}>
          {/* Farbiger Punkt */}
          <div style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }} />
          <span style={{ color: "#ffffff", fontSize: 12, fontWeight: 500 }}>
            {simState}
          </span>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
            t = {simTimeSec.toFixed(1)} s
          </span>
        </div>

        {/* Fehlermeldung – nur wenn vorhanden */}
        {statusText && (
          <span
            className="app-status"
            style={{
              marginLeft: 8,
              fontSize: 11,
              color: "rgba(255,180,180,0.95)",
              maxWidth: 280,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={statusText}
          >
            ⚠ {statusText}
          </span>
        )}

      </div>

    </header>
  );
}