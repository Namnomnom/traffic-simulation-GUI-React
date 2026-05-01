// frontend/src/components/SidebarTools.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ToolMode } from "../types/toolMode";
import type { VehicleType } from "../types/simTypes";

type LngLat = [number, number];
export type TrafficLightAddMode = "intersection" | "single";
type VehicleRouteStatus = "none" | "start" | "ready";

type VehicleSummary = {
  id: number;
  hasRoute?: boolean;
  routeStatus?: VehicleRouteStatus;
};

type SidebarToolsProps = {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  vehiclesCount: number;
  maxVehicles: number;
  vehiclesSummary: VehicleSummary[];
  selectedVehicleId: number | null;
  onSelectVehicle: (id: number) => void;
  currentVehicleType: VehicleType;
  onCurrentVehicleTypeChange: (t: VehicleType) => void;
  onOpenVehicleDialog: () => void;
  routeStart: LngLat | null;
  routeEnd: LngLat | null;
  onPickRouteStart: () => void;
  onPickRouteEnd: () => void;
  onComputeRoute: () => void;
  onClearRoute: () => void;
  tlAddMode: TrafficLightAddMode;
  onTlAddModeChange: (m: TrafficLightAddMode) => void;
};

const VEHICLE_TYPES: { id: VehicleType; label: string; emoji: string }[] = [
  { id: "pkw", label: "PKW", emoji: "🚗" },
  { id: "lkw", label: "LKW", emoji: "🚚" },
  { id: "bus", label: "Bus", emoji: "🚌" },
  { id: "motorrad", label: "Motorrad", emoji: "🏍️" },
];

const TL_MODES: { id: TrafficLightAddMode; label: string }[] = [
  { id: "intersection", label: "Kreuzung (4-fach)" },
  { id: "single", label: "Einzelsignal" },
];

const COLORS = {
  navy: "#246373",     
  navyLight: "#3a6ea5",   
  navySoft: "#dbe9f6",    
  navyDark: "#163654",
  green: "#2E7D32",
  orange: "#ED6C02",
  lightBlue: "#EBF3FB",
  blueText: "#0C447C",
  border: "#eeeeea",
  softButton: "#f5f5f0",
};

const S = {
  section: {
    padding: "10px 12px",
    borderBottom: `1px solid ${COLORS.border}`,
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: 8,
  } as React.CSSProperties,

  vehicleBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "9px 10px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    textAlign: "left" as const,
    marginBottom: 4,
    border: "1px solid rgba(0,0,0,0.08)",
    background: COLORS.softButton,
    color: "#333",
    fontWeight: 400,
  } as React.CSSProperties,

  vehicleBtnActive: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "9px 10px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    textAlign: "left" as const,
    marginBottom: 4,
    border: `1px solid ${COLORS.navy}`,
    background: COLORS.navy,
    color: "#fff",
    fontWeight: 600,
  } as React.CSSProperties,

  toolBtn: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.1)",
    background: COLORS.softButton,
    color: "#333",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left" as const,
    marginBottom: 4,
  } as React.CSSProperties,

  toolBtnActive: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${COLORS.navy}`,
    background: COLORS.navy,
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left" as const,
    marginBottom: 4,
  } as React.CSSProperties,

  toolBtnDisabled: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.08)",
    background: COLORS.softButton,
    color: "#999",
    fontSize: 13,
    cursor: "not-allowed",
    textAlign: "left" as const,
    marginBottom: 4,
    opacity: 0.45,
  } as React.CSSProperties,

  flyout: {
    position: "fixed" as const,
    width: 210,
    background: "#fff",
    border: "1px solid #e5e5e0",
    borderRadius: 10,
    zIndex: 9999,
    boxShadow: "0 8px 20px rgba(0,0,0,0.14)",
    overflow: "hidden",
  } as React.CSSProperties,
};

function fmtLngLatShort(ll: LngLat | null) {
  if (!ll) return "–";
  const [lng, lat] = ll;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function resolveRouteStatus(v: VehicleSummary): VehicleRouteStatus {
  if (v.routeStatus) return v.routeStatus;
  if (typeof v.hasRoute === "boolean") return v.hasRoute ? "ready" : "none";
  return "none";
}

function calcFlyoutPos(anchorEl: HTMLElement, flyoutWidth: number, flyoutHeight: number, gap: number) {
  const r = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = r.right + gap;
  if (left + flyoutWidth > vw - 8) {
    left = Math.max(8, r.left - gap - flyoutWidth);
  }

  let top = r.top - 5;
  top = Math.min(Math.max(8, top), Math.max(8, vh - 8 - flyoutHeight));

  return { left, top };
}

function RouteBadge({ status }: { status: VehicleRouteStatus }) {
  const meta =
    status === "ready"
      ? { txt: "✅ Route", bg: "rgba(0,200,83,0.10)", bd: "rgba(0,200,83,0.30)" }
      : status === "start"
        ? { txt: "⏳ Start", bg: "rgba(255,193,7,0.12)", bd: "rgba(255,193,7,0.30)" }
        : { txt: "❌ keine", bg: "rgba(255,82,82,0.10)", bd: "rgba(255,82,82,0.25)" };

  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${meta.bd}`,
        background: meta.bg,
        fontWeight: 600,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {meta.txt}
    </span>
  );
}

export default function SidebarTools(props: SidebarToolsProps) {
  const {
    toolMode,
    onToolModeChange,
    vehiclesCount,
    maxVehicles,
    vehiclesSummary,
    selectedVehicleId,
    onSelectVehicle,
    currentVehicleType,
    onCurrentVehicleTypeChange,
    routeStart,
    routeEnd,
    onPickRouteStart,
    onPickRouteEnd,
    onComputeRoute,
    onClearRoute,
    tlAddMode,
    onTlAddModeChange,
  } = props;

  const isAddVehicle = toolMode === "ADD_VEHICLE";
  const isAddTrafficLight = toolMode === "ADD_TRAFFIC_LIGHT";
  const isPickStart = toolMode === "PICK_ROUTE_START";
  const isPickEnd = toolMode === "PICK_ROUTE_END";

  const currentVehicleMeta = useMemo(
    () => VEHICLE_TYPES.find((vehicle) => vehicle.id === currentVehicleType) ?? VEHICLE_TYPES[0],
    [currentVehicleType]
  );

  const currentTlLabel = useMemo(
    () => TL_MODES.find((mode) => mode.id === tlAddMode)?.label ?? "Kreuzung (4)",
    [tlAddMode]
  );

  const hasSelectedVehicle = selectedVehicleId != null;
  const canPickEnd = !!routeStart && hasSelectedVehicle;
  const canCompute = !!routeStart && !!routeEnd && hasSelectedVehicle;
  const canClear = (!!routeStart || !!routeEnd) && hasSelectedVehicle;
  const maxReached = vehiclesCount >= maxVehicles;

  const addVehicleButtonLabel = maxReached
    ? "Max erreicht"
    : isAddVehicle
      ? "➡ Auf Karte klicken"
      : currentVehicleType
        ? "+ Platzieren starten"
        : "+ Fahrzeug wählen";

  const addVehicleButtonColor = maxReached
    ? "#ccc"
    : isAddVehicle
      ? COLORS.green
      : currentVehicleType
        ? COLORS.orange
        : COLORS.navy;

  const trafficLightButtonLabel = isAddTrafficLight ? "➡ Auf Karte klicken" : "LSA hinzufügen";
  const trafficLightButtonColor = isAddTrafficLight ? COLORS.green : COLORS.navy;
  const trafficLightButtonBorder = isAddTrafficLight ? COLORS.green : COLORS.navy;

  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const vehicleBtnRef = useRef<HTMLButtonElement | null>(null);
  const vehicleFlyoutRef = useRef<HTMLDivElement | null>(null);
  const [vehiclePos, setVehiclePos] = useState<{ left: number; top: number } | null>(null);

  const [tlMenuOpen, setTlMenuOpen] = useState(false);
  const tlBtnRef = useRef<HTMLButtonElement | null>(null);
  const tlFlyoutRef = useRef<HTMLDivElement | null>(null);
  const [tlPos, setTlPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const onDocDown = (event: MouseEvent) => {
      const target = event.target as Node | null;

      const clickedVehicle =
        !!target &&
        (vehicleBtnRef.current?.contains(target) || vehicleFlyoutRef.current?.contains(target));

      const clickedTl =
        !!target && (tlBtnRef.current?.contains(target) || tlFlyoutRef.current?.contains(target));

      if (!clickedVehicle) setVehicleMenuOpen(false);
      if (!clickedTl) setTlMenuOpen(false);
    };

    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  useEffect(() => {
    if (!isAddVehicle) setVehicleMenuOpen(false);
  }, [isAddVehicle]);

  useEffect(() => {
    if (!isAddTrafficLight) setTlMenuOpen(false);
  }, [isAddTrafficLight]);

  useEffect(() => {
    const update = () => {
      if (vehicleMenuOpen && vehicleBtnRef.current) {
        setVehiclePos(calcFlyoutPos(vehicleBtnRef.current, 210, 200, 10));
      }

      if (tlMenuOpen && tlBtnRef.current) {
        setTlPos(calcFlyoutPos(tlBtnRef.current, 210, 120, 10));
      }
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [vehicleMenuOpen, tlMenuOpen]);

  const openVehicleMenu = () => {
    if (!isAddVehicle) onToolModeChange("ADD_VEHICLE");
    setVehicleMenuOpen((value) => !value);
  };

  const openTlMenu = () => {
    if (!isAddTrafficLight) onToolModeChange("ADD_TRAFFIC_LIGHT");
    setTlMenuOpen((value) => !value);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          ...S.section,
          flex: "1 1 auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={S.sectionTitle}>
          Fahrzeuge ({vehiclesCount} / {maxVehicles})
        </div>

        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            marginBottom: 8,
          }}
        >
          {vehiclesSummary.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                padding: "20px 8px",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: COLORS.lightBlue,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="#378ADD"
                  strokeWidth="1.5"
                >
                  <rect x="1" y="6" width="16" height="9" rx="2" />
                  <path d="M5 6V5a3 3 0 0 1 6 0v1" />
                  <circle cx="5" cy="13" r="1.2" fill="#378ADD" stroke="none" />
                  <circle cx="13" cy="13" r="1.2" fill="#378ADD" stroke="none" />
                </svg>
              </div>

              <p
                style={{
                  fontSize: 12,
                  color: "#666",
                  textAlign: "center",
                  lineHeight: 1.6,
                  margin: 0,
                  maxWidth: 180,
                }}
              >
                1) Fahrzeugtyp auswählen.
                <br />
                <br />
                Klicken Sie anschließend auf die Karte, um ein Fahrzeug zu platzieren.
              </p>
            </div>
          ) : (
            vehiclesSummary.map((vehicle) => {
              const active = vehicle.id === selectedVehicleId;

              return (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => onSelectVehicle(vehicle.id)}
                  style={active ? S.vehicleBtnActive : S.vehicleBtn}
                  title="Fahrzeug auswählen"
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <span style={{ fontSize: 15 }}>🚘</span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Fahrzeug #{vehicle.id}
                    </span>
                  </span>

                  <RouteBadge status={resolveRouteStatus(vehicle)} />
                </button>
              );
            })
          )}
        </div>

        <div style={{ flexShrink: 0, display: "flex", gap: 6 }}>
          <button
            ref={vehicleBtnRef}
            onClick={openVehicleMenu}
            disabled={maxReached}
            title={
              isAddVehicle
                ? "Jetzt auf die Karte klicken, um das Fahrzeug zu platzieren"
                : "Platzierungsmodus aktivieren"
            }
            style={{
              flex: 1,
              background: addVehicleButtonColor,
              color: "#fff",
              border: "none",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 700,
              padding: "9px 10px",
              cursor: maxReached ? "not-allowed" : "pointer",
              opacity: maxReached ? 0.5 : 1,
              textAlign: "left",
              transition: "background 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease",
              boxShadow: isAddVehicle ? "0 0 0 3px rgba(46,125,50,0.20)" : "none",
            }}
          >
            {addVehicleButtonLabel}
          </button>

          <button
            type="button"
            onClick={openVehicleMenu}
            disabled={maxReached}
            title={`Aktueller Fahrzeugtyp: ${currentVehicleMeta.label}`}
            style={{
              flexShrink: 0,
              background: "#f0f0ec",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 500,
              color: "#444",
              padding: "6px 10px",
              cursor: maxReached ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              opacity: maxReached ? 0.45 : 1,
            }}
          >
            <span>{currentVehicleMeta.emoji}</span>
            <span>{currentVehicleMeta.label}</span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{vehicleMenuOpen ? "▲" : "▼"}</span>
          </button>
        </div>
      </div>

      <div style={{ ...S.section, flexShrink: 0 }}>
        <div style={S.sectionTitle}>Route für ausgewähltes Fahrzeug</div>

        {!hasSelectedVehicle ? (
          <p style={{ fontSize: 12, color: "#aaa", fontStyle: "italic", margin: 0 }}>
            Bitte zuerst ein Fahrzeug auswählen.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            <button onClick={onPickRouteStart} style={isPickStart ? S.toolBtnActive : S.toolBtn}>
              📍 Start setzen
            </button>

            <button
              onClick={onPickRouteEnd}
              disabled={!canPickEnd}
              style={isPickEnd ? S.toolBtnActive : !canPickEnd ? S.toolBtnDisabled : S.toolBtn}
            >
              🎯 Ziel setzen
            </button>

            <button
              onClick={onComputeRoute}
              disabled={!canCompute}
              style={!canCompute ? S.toolBtnDisabled : S.toolBtn}
            >
              ⟳ Route berechnen
            </button>

            <button
              onClick={onClearRoute}
              disabled={!canClear}
              style={!canClear ? S.toolBtnDisabled : S.toolBtn}
            >
              ✖ Route löschen
            </button>

            <div style={{ fontSize: 11, color: "#888", lineHeight: 1.6, marginTop: 2 }}>
              <div>
                <b>Start:</b> {fmtLngLatShort(routeStart)}
              </div>
              <div>
                <b>Ziel:</b> {fmtLngLatShort(routeEnd)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ ...S.section, flexShrink: 0 }}>
        <div style={S.sectionTitle}>Lichtsignalanlage</div>

        <button
          ref={tlBtnRef}
          onClick={openTlMenu}
          title={
            isAddTrafficLight
              ? "Jetzt auf die Karte klicken, um die Lichtsignalanlage zu setzen"
              : "LSA-Platzierungsmodus aktivieren"
          }
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: `1px solid ${trafficLightButtonBorder}`,
            background: trafficLightButtonColor,
            color: "#fff",
            fontSize: 13,
            cursor: "pointer",
            textAlign: "left",
            marginBottom: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            transition: "background 0.18s ease, box-shadow 0.18s ease",
            boxShadow: isAddTrafficLight ? "0 0 0 3px rgba(46,125,50,0.20)" : "none",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 15 }}>🚦</span>
            <span style={{ fontWeight: 700 }}>{trafficLightButtonLabel}</span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 7px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(255,255,255,0.10)",
                color: "#fff",
              }}
            >
              {currentTlLabel}
            </span>
          </span>

          <span style={{ fontSize: 11, opacity: 0.85 }}>{tlMenuOpen ? "▲" : "▼"}</span>
        </button>
      </div>

      {vehicleMenuOpen && vehiclePos && (
        <div
          ref={vehicleFlyoutRef}
          style={{ ...S.flyout, left: vehiclePos.left, top: vehiclePos.top }}
        >
          {VEHICLE_TYPES.map((type) => {
            const active = type.id === currentVehicleType;

            return (
              <button
                key={type.id}
                type="button"
                onClick={() => {
                  onCurrentVehicleTypeChange(type.id);
                  setVehicleMenuOpen(false);
                  onToolModeChange("ADD_VEHICLE");
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  background: active ? COLORS.lightBlue : "#fff",
                  border: "none",
                  borderBottom: "1px solid #f0f0ec",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  color: active ? COLORS.blueText : "#333",
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span style={{ fontSize: 16 }}>{type.emoji}</span>
                <span style={{ flex: 1 }}>{type.label}</span>
                {active && <span style={{ color: COLORS.navy, fontWeight: 700 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {tlMenuOpen && tlPos && (
        <div ref={tlFlyoutRef} style={{ ...S.flyout, left: tlPos.left, top: tlPos.top }}>
          {TL_MODES.map((mode) => {
            const active = mode.id === tlAddMode;

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  onTlAddModeChange(mode.id);
                  setTlMenuOpen(false);
                  onToolModeChange("ADD_TRAFFIC_LIGHT");
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  background: active ? COLORS.lightBlue : "#fff",
                  border: "none",
                  borderBottom: "1px solid #f0f0ec",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  color: active ? COLORS.blueText : "#333",
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span style={{ flex: 1 }}>{mode.label}</span>
                {active && <span style={{ color: COLORS.navy, fontWeight: 700 }}>✓</span>}
              </button>
            );
          })}

          <div style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <button
              type="button"
              onClick={() => {
                setTlMenuOpen(false);
                onToolModeChange("SELECT");
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                background: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "#666",
              }}
            >
              ✋ Tool beenden
            </button>
          </div>
        </div>
      )}
    </div>
  );
}