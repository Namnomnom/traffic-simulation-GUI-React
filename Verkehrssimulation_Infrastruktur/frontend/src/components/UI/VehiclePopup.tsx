// frontend/src/components/UI/VehiclePopup.tsx
// OPTIMIERTE VERSION – NUR Struktur-Anpassungen:
// - Originale grüne Farbe bleibt UNVERÄNDERT
// - KPI als 2x2 Grid statt langer Liste
// - Abschnittstitel klar getrennt
// - Hardware kompakt in einer Zeile
// - Löschen-Button volle Breite unten
// - Drag & Drop: Panel per Maus verschiebbar

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Vehicle } from "../../types/simTypes";
import { useHardwareStatus } from "../../hooks/useHardwareStatus";
import { useReverseGeocode } from "../../hooks/useReverseGeocode";
import { headingToCompass, fmtMeters, fmtSeconds } from "../../lib/uiFormat";

type VehiclePopupProps = {
  vehicle: Vehicle;
  onClose: () => void;
  onStart: (vehicleId: number, cruiseSpeedKmh: number) => void;
  onPause: (vehicleId: number) => void;
  onReset: (vehicleId: number) => void;
  onDelete: (vehicleId: number) => void;
};

function vehicleTypeLabel(type: Vehicle["type"]): string {
  switch (type) {
    case "pkw":      return "PKW";
    case "lkw":      return "LKW";
    case "bus":      return "Bus";
    case "motorrad": return "Motorrad";
    default:         return type;
  }
}

function clampNumber(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function modeLabel(phase?: string): string {
  switch (phase) {
    case "APPROACH": return "Kurz vor Kreuzung";
    case "INSIDE":   return "Im Kreuzungsbereich";
    case "EXIT":     return "Nach Kreuzung";
    default:         return "Auf Strecke";
  }
}

export default function VehiclePopup({
  vehicle,
  onClose,
  onStart,
  onPause,
  onReset,
  onDelete,
}: VehiclePopupProps) {
  const [speedInput, setSpeedInput] = useState("50");
  const [hwEnabled, setHwEnabled] = useState(false);

  // ─── Drag & Drop ────────────────────────────────────────────────────────────
  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem("vehiclePopupPos");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: Math.max(8, window.innerWidth - 340), y: 80 };
  });
  const draggingRef      = useRef(false);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartRef     = useRef({ px: 0, py: 0, x: 0, y: 0 });

  const clampPos = useCallback((x: number, y: number) => {
    const W = 320; const H = 500;
    return {
      x: Math.max(8, Math.min(x, window.innerWidth  - W - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - H - 8)),
    };
  }, []);

  useEffect(() => {
    const onResize = () => setPos((p: { x: number; y: number }) => clampPos(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampPos]);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, input, select, [role=\'button\']")) return;
    draggingRef.current = true;
    dragPointerIdRef.current = e.pointerId;
    dragStartRef.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos.x, pos.y]);

  const onHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || dragPointerIdRef.current !== e.pointerId) return;
    const next = clampPos(
      dragStartRef.current.x + e.clientX - dragStartRef.current.px,
      dragStartRef.current.y + e.clientY - dragStartRef.current.py,
    );
    setPos(next);
    try { localStorage.setItem("vehiclePopupPos", JSON.stringify(next)); } catch {}
  }, [clampPos]);

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || dragPointerIdRef.current !== e.pointerId) return;
    draggingRef.current = false;
    dragPointerIdRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }, []);

  const sim      = vehicle.sim;
  const kpis     = sim?.kpis;
  const hasRoute = (vehicle.routePoints?.length ?? 0) >= 2;
  const hasSim   = !!sim;
  const isRunning  = !!sim?.active;
  const isFinished = !!sim && !sim.active && (kpis?.remainingDistanceM ?? Infinity) <= 0.5;

  const canStartOrResume = hasRoute && !isFinished;
  const speedKmh = clampNumber(Number(speedInput), 0, 130);

  const stateLabel     = isFinished ? "Angekommen" : isRunning ? "Fährt" : hasSim ? "Pausiert" : "Bereit";
  const startBtnLabel  = !hasSim ? "Start" : isFinished ? "Ziel erreicht" : "Fortsetzen";

  const positionText = kpis
    ? `${fmtMeters(kpis.distanceTraveledM)} seit Start · ${fmtMeters(kpis.remainingDistanceM)} bis Ziel`
    : "–";

  const { label: streetLabel } = useReverseGeocode([vehicle.lon, vehicle.lat], {
    intervalMs: 5000,
    minMoveMeters: 20,
    language: "de",
  });

  const heading = headingToCompass(kpis?.headingDeg);

  const { status: hw, loading: hwLoading } = useHardwareStatus(undefined, 2000, hwEnabled);
  const hwConnected = !!hw?.connected;

  const titleLine = useMemo(
    () => `Fahrzeug #${vehicle.id} · ${vehicleTypeLabel(vehicle.type)}`,
    [vehicle.id, vehicle.type]
  );

  const connectHardware = async () => {
    try {
      setHwEnabled(true);
      await fetch("/api/hardware/connect", { method: "POST" });
    } catch {
      setHwEnabled(false);
    }
  };

  const disconnectHardware = async () => {
    try {
      await fetch("/api/hardware/disconnect", { method: "POST" });
    } finally {
      setHwEnabled(false);
    }
  };

  // Originale Farben aus der alten Datei
  const BG_COLOR = "rgba(22, 163, 74, 0.92)";
  const BORDER   = "1px solid rgba(255,255,255,0.15)";

  const sectionTitle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 13,
    marginBottom: 6,
    opacity: 0.95,
  };

  const btnBase: React.CSSProperties = {
    border: "none",
    borderRadius: 10,
    padding: "7px 8px",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`,
        zIndex: 20,
        backgroundColor: BG_COLOR,
        color: "white",
        borderRadius: 12,
        boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
        minWidth: 300,
        maxWidth: 320,
        fontSize: 13,
        overflow: "hidden",
      }}
    >

      {/* ── Header ── */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: BORDER,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          cursor: draggingRef.current ? "grabbing" : "grab",
        }}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="Ziehen zum Verschieben"
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 13 }}>{titleLine}</div>
          <div style={{ marginTop: 2, fontSize: 12, opacity: 0.9 }}>
            <b>Zustand:</b> {stateLabel}
            <span style={{ margin: "0 8px", opacity: 0.6 }}>·</span>
            <b>Modus:</b> {modeLabel(sim?.positionPhase)}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            color: "white",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
          }}
          aria-label="Popup schließen"
        >
          ✖
        </button>
      </div>

      {/* ── Geschwindigkeit ── */}
      <div style={{
        padding: "8px 14px",
        borderBottom: BORDER,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <label style={{ fontWeight: 800, flexShrink: 0 }}>Geschwindigkeit</label>
        <input
          type="number"
          min={0}
          max={130}
          value={speedInput}
          onChange={(e) => setSpeedInput(e.target.value)}
          onBlur={() => setSpeedInput(String(speedKmh))}
          style={{
            flex: 1,
            borderRadius: 8,
            border: "none",
            padding: "6px 8px",
            fontWeight: 800,
            minWidth: 0,
          }}
        />
        <span style={{ fontWeight: 800, flexShrink: 0 }}>km/h</span>
      </div>

      {/* ── Steuer-Buttons ── */}
      <div style={{
        padding: "8px 14px",
        borderBottom: BORDER,
        display: "flex",
        gap: 6,
      }}>
        <button
          onClick={() => onStart(vehicle.id, speedKmh)}
          disabled={!canStartOrResume}
          style={{
            ...btnBase,
            flex: 1,
            background: canStartOrResume ? "white" : "rgba(255,255,255,0.55)",
            color: "rgba(22, 163, 74, 1)",
            cursor: canStartOrResume ? "pointer" : "not-allowed",
          }}
        >
          {startBtnLabel === "Start" && "▶ Start"}
          {startBtnLabel === "Fortsetzen" && "▶ Fortsetzen"}
          {startBtnLabel === "Ziel erreicht" && "🏁 Ziel erreicht"}
        </button>

        <button
          onClick={() => onPause(vehicle.id)}
          disabled={!hasSim || isFinished}
          style={{
            ...btnBase,
            flex: 1,
            background: hasSim && !isFinished ? "white" : "rgba(255,255,255,0.6)",
            color: "#92400e",
            cursor: hasSim && !isFinished ? "pointer" : "not-allowed",
          }}
        >
          ⏸ Pause
        </button>

        <button
          onClick={() => onReset(vehicle.id)}
          disabled={!hasSim && !hasRoute}
          style={{
            ...btnBase,
            width: 46,
            background: hasSim || hasRoute ? "white" : "rgba(255,255,255,0.6)",
            color: "#374151",
            cursor: hasSim || hasRoute ? "pointer" : "not-allowed",
          }}
          title="Zurücksetzen"
        >
          ↺
        </button>
      </div>

      {/* ── Aktuelle Werte ── */}
      <div style={{ padding: "8px 14px", borderBottom: BORDER }}>
        <div style={sectionTitle}>Aktuelle:</div>
        <div style={{ display: "grid", gap: 5 }}>
          <Row label="Geschwindigkeit">
            {sim ? `${(sim.speedMps * 3.6).toFixed(0)} km/h` : "–"}
          </Row>
          <Row label="Richtung">
            {heading.arrow} {heading.label}
          </Row>
          <Row label="Position">
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 900 }}>{positionText}</div>
              {streetLabel && (
                <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                  Nähe: {streetLabel}
                </div>
              )}
            </div>
          </Row>
        </div>
      </div>

      {/* ── KPI als 2x2 Grid ── */}
      <div style={{ padding: "8px 14px", borderBottom: BORDER }}>
        <div style={sectionTitle}>KPI:</div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}>
          {[
            { label: "Fahrtdauer",    val: fmtSeconds(kpis?.tripTimeS) },
            { label: "Wartezeit",     val: fmtSeconds(kpis?.waitTimeS) },
            { label: "Bewegungszeit", val: fmtSeconds(kpis?.moveTimeS) },
            { label: "Stopps",        val: String(kpis?.stops ?? "–")  },
          ].map((k) => (
            <div
              key={k.label}
              style={{
                background: "rgba(0,0,0,0.15)",
                borderRadius: 7,
                padding: "6px 8px",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 2 }}>{k.label}</div>
              <div style={{ fontWeight: 900, fontSize: 14 }}>{k.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hardware ── */}
      <div style={{ padding: "8px 14px", borderBottom: BORDER }}>
        <div style={sectionTitle}>Hardware</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            backgroundColor: hwConnected ? "lime" : "red",
            flexShrink: 0,
          }} />
          <span style={{ flex: 1, opacity: 0.95 }}>
            {!hwEnabled
              ? "Verbindung inaktiv"
              : hwLoading
                ? "Status wird geladen…"
                : hwConnected
                  ? "Verbindung aktiv"
                  : "Verbindung inaktiv"}
          </span>

          {!hwEnabled && (
            <button
              onClick={connectHardware}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "none",
                background: "#2563eb",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              Verbinden
            </button>
          )}

          {hwEnabled && hwConnected && (
            <button
              onClick={disconnectHardware}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                border: "none",
                background: "#b91c1c",
                color: "white",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Trennen
            </button>
          )}

          {hwEnabled && !hwConnected && !hwLoading && (
            <span style={{ fontSize: 11, opacity: 0.75 }}>(Nicht verbunden)</span>
          )}
        </div>
      </div>

      {/* ── Fahrzeug löschen ── */}
      <div style={{ padding: "8px 14px" }}>
        <button
          onClick={() => onDelete(vehicle.id)}
          style={{
            width: "100%",
            padding: "7px 10px",
            borderRadius: 7,
            border: "none",
            background: "rgba(185, 28, 28, 0.9)",
            color: "white",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
          title="Fahrzeug löschen"
        >
          🗑️ Fahrzeug löschen
        </button>
      </div>

    </div>
  );
}

/* ── Hilfskomponente ── */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const isSimple = typeof children === "string" || typeof children === "number";
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "130px 1fr",
      columnGap: 10,
      alignItems: "start",
    }}>
      <span style={{ opacity: 0.9, fontWeight: 800 }}>{label}</span>
      <div style={{ textAlign: "right", minWidth: 0 }}>
        {isSimple ? <b>{children}</b> : children}
      </div>
    </div>
  );
}