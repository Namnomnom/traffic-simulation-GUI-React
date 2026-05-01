// frontend/src/components/App/AppMapStage.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";

import MapContainer from "../Map/MapContainer";
import VehiclePopup from "../UI/VehiclePopup";
import SelectedTrafficLightPanelView from "../UI/SelectedTrafficLightPanelView";
import KpiPanel from "../UI/KpiPanel";

import type { RoadSegment } from "../../types/simTypes";
import type { IntersectionVisual } from "../../lib/intersectionsToGeoJSON";
import type { TrafficLightAddMode } from "../SidebarTools";
import type { SimState } from "../../hooks/useGlobalSimulation";

// keep this loose to avoid fighting your internal types while refactoring
type AnyRecord = Record<string, any>;
type LngLat = [number, number];

type AppMapStageProps = {
  // Map
  initialCenter?: LngLat;
  initialZoom?: number;

  toolMode: any;

  roads: RoadSegment[];
  intersections: IntersectionVisual[];
  vehicles: AnyRecord[];

  // selections
  selectedVehicleId: number | null;
  setSelectedVehicleId: (id: number | null) => void;

  selectedIntersectionId: string | null;
  setSelectedIntersectionId: (id: string | null) => void;

  // vehicle type for adding
  currentVehicleType: string;

  // routing view state
  routesByVehicle: Record<number, any>;
  selectedRoute: { start: any; end: any; points: any };

  // handlers
  handleRoadFinished: (points: LngLat[]) => void;
  handleMapClickAddVehicle: (lngLat: LngLat) => void;

  tlAddMode: TrafficLightAddMode | any;
  handleAddTrafficLights: (...args: any[]) => void;

  handlePickRoutePoint: (...args: any[]) => void;

  moveIntersectionGroup: (groupId: string, nextPoint: LngLat) => void;

  handleVehicleClick: (...args: any[]) => void;
  handleVehicleMoved: (...args: any[]) => void;

  // traffic light panel
  panelIntersection: IntersectionVisual | null;
  tlClockSec: number;

  setIntersectionBearing: (groupId: string, bearing: number) => void;
  deleteIntersection: (groupId: string) => void;
  setIntersectionGreenTimes: (groupId: string, a: number, b: number) => void;
  toggleIntersectionPhase: (groupId: string) => void;
  setSingleGroupId: (intersectionId: string, group: any) => void;

  // rotate hint
  showRotateHint: boolean;
  rotateHintDismissed: boolean;
  setRotateHintDismissed: (v: boolean) => void;

  // vehicle popup
  selectedVehicle: AnyRecord | null;
  onStartVehicle: (vehicleId: number, cruiseSpeedKmh: number) => void;
  onPauseVehicle: (vehicleId: number) => void;
  onResetVehicle: (vehicleId: number) => void;
  onDeleteVehicle: (vehicleId: number) => void;

  // KPI Panel
  simState: SimState;
  kpiPanelOpen: boolean;
  setKpiPanelOpen: (v: boolean) => void;
};

const DEFAULT_TL_PANEL_POSITION = { x: 16, y: 16 };
const TL_PANEL_MARGIN = 12;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function AppMapStage({
  initialCenter = [10.5240, 52.2658],
  initialZoom = 15,

  toolMode,
  roads,
  intersections,
  vehicles,

  selectedVehicleId,
  setSelectedVehicleId,

  selectedIntersectionId,
  setSelectedIntersectionId,

  currentVehicleType,

  routesByVehicle,
  selectedRoute,

  handleRoadFinished,
  handleMapClickAddVehicle,

  tlAddMode,
  handleAddTrafficLights,

  handlePickRoutePoint,

  moveIntersectionGroup,

  handleVehicleClick,
  handleVehicleMoved,

  panelIntersection,
  tlClockSec,

  setIntersectionBearing,
  deleteIntersection,
  setIntersectionGreenTimes,
  toggleIntersectionPhase,
  setSingleGroupId,

  showRotateHint,
  rotateHintDismissed,
  setRotateHintDismissed,

  selectedVehicle,
  onStartVehicle,
  onPauseVehicle,
  onResetVehicle,
  onDeleteVehicle,

  simState,
  kpiPanelOpen,
  setKpiPanelOpen,
}: AppMapStageProps) {
  const tlPanelRef = useRef<HTMLDivElement | null>(null);

  const [tlPanelSize, setTlPanelSize] = useState({ w: 320, h: 520 });
  const [tlPanelPos, setTlPanelPos] = useState(DEFAULT_TL_PANEL_POSITION);

  const tlDraggingRef = useRef(false);
  const tlDragPointerIdRef = useRef<number | null>(null);
  const tlDragStartRef = useRef({ px: 0, py: 0, x: 0, y: 0 });

  const clampTlPanelToViewport = useCallback((nextX: number, nextY: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const minX = TL_PANEL_MARGIN;
    const minY = TL_PANEL_MARGIN;

    const maxX = Math.max(TL_PANEL_MARGIN, vw - tlPanelSize.w - TL_PANEL_MARGIN);
    const maxY = Math.max(TL_PANEL_MARGIN, vh - tlPanelSize.h - TL_PANEL_MARGIN);

    return {
      x: clamp(nextX, minX, maxX),
      y: clamp(nextY, minY, maxY),
    };
  }, [tlPanelSize.h, tlPanelSize.w]);

  useEffect(() => {
    const el = tlPanelRef.current;
    if (!el || !panelIntersection) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(260, Math.round(rect.width));
      const h = Math.max(120, Math.round(rect.height));
      setTlPanelSize({ w, h });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [panelIntersection]);

  useEffect(() => {
    const onResize = () => {
      setTlPanelPos((prev) => clampTlPanelToViewport(prev.x, prev.y));
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampTlPanelToViewport]);

  useEffect(() => {
    setTlPanelPos((prev) => clampTlPanelToViewport(prev.x, prev.y));
  }, [clampTlPanelToViewport, tlPanelSize.w, tlPanelSize.h, panelIntersection]);

  useEffect(() => {
    if (!panelIntersection) return;
    setTlPanelPos((prev) => clampTlPanelToViewport(prev.x, prev.y));
  }, [panelIntersection?.id, clampTlPanelToViewport]);

  const onTlPanelPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const interactive = target.closest("button, a, input, select, textarea, [role='button']");
      if (interactive) return;

      tlDraggingRef.current = true;
      tlDragPointerIdRef.current = e.pointerId;
      tlDragStartRef.current = {
        px: e.clientX,
        py: e.clientY,
        x: tlPanelPos.x,
        y: tlPanelPos.y,
      };

      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [tlPanelPos.x, tlPanelPos.y]
  );

  const onTlPanelPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!tlDraggingRef.current) return;
      if (tlDragPointerIdRef.current !== e.pointerId) return;

      const dx = e.clientX - tlDragStartRef.current.px;
      const dy = e.clientY - tlDragStartRef.current.py;

      const next = clampTlPanelToViewport(
        tlDragStartRef.current.x + dx,
        tlDragStartRef.current.y + dy
      );

      setTlPanelPos(next);
    },
    [clampTlPanelToViewport]
  );

  const endTlPanelDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!tlDraggingRef.current) return;
    if (tlDragPointerIdRef.current !== e.pointerId) return;

    tlDraggingRef.current = false;
    tlDragPointerIdRef.current = null;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapContainer
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        toolMode={toolMode}
        roads={roads}
        onRoadFinished={handleRoadFinished as any}
        vehicles={vehicles as any}
        intersections={intersections}
        selectedVehicleId={selectedVehicleId}
        newVehicleType={currentVehicleType as any}
        onMapClickAddVehicle={handleMapClickAddVehicle as any}
        tlAddMode={tlAddMode as any}
        onAddTrafficLights={handleAddTrafficLights as any}
        onPickRoutePoint={handlePickRoutePoint as any}
        selectedIntersectionId={selectedIntersectionId}
        onSelectIntersection={setSelectedIntersectionId}
        onMoveIntersectionGroup={moveIntersectionGroup as any}
        onVehicleClick={handleVehicleClick as any}
        onVehicleMoved={handleVehicleMoved as any}
        routesByVehicle={routesByVehicle}
        routeStart={selectedRoute.start}
        routeEnd={selectedRoute.end}
        routePoints={selectedRoute.points}
      />

      <KpiPanel
        open={kpiPanelOpen}
        onOpenChange={setKpiPanelOpen}
        simState={simState}
        vehicles={vehicles as any}
      />

      {panelIntersection && (
        <div
          ref={tlPanelRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate3d(${Math.round(tlPanelPos.x)}px, ${Math.round(tlPanelPos.y)}px, 0)`,
            zIndex: 80,
            userSelect: tlDraggingRef.current ? "none" : "auto",
            pointerEvents: "auto",
            cursor: tlDraggingRef.current ? "grabbing" : "grab",
          }}
          onPointerDown={onTlPanelPointerDown}
          onPointerMove={onTlPanelPointerMove}
          onPointerUp={endTlPanelDrag}
          onPointerCancel={endTlPanelDrag}
          title="Ziehen zum Verschieben"
        >
          <SelectedTrafficLightPanelView
            selectedIntersection={panelIntersection}
            simTimeSec={tlClockSec}
            onSetIntersectionBearing={setIntersectionBearing}
            onDeleteIntersection={deleteIntersection}
            onSetIntersectionGreenTimes={setIntersectionGreenTimes}
            onToggleIntersectionPhase={toggleIntersectionPhase}
            onSetSingleGroupId={setSingleGroupId}
            onClose={() => setSelectedIntersectionId(null)}
          />
        </div>
      )}

      {showRotateHint && selectedIntersectionId && (
        <div
          style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            background: "rgba(0,0,0,0.75)",
            color: "white",
            padding: "12px 14px",
            borderRadius: 12,
            fontSize: 13,
            maxWidth: 280,
            zIndex: 60,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong>🚦 LSA drehen</strong>
            <button
              onClick={() => setSelectedIntersectionId(null)}
              style={{ background: "none", border: "none", color: "white", fontSize: 16, cursor: "pointer" }}
              title="Schließen"
            >
              ✕
            </button>
          </div>

          <div style={{ lineHeight: 1.4 }}>
            Drücke <b>Q</b> / <b>E</b>, um die LSA zu drehen.
            <div style={{ opacity: 0.85, marginTop: 6 }}>(ESC zum Abwählen)</div>
          </div>

          <label
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              marginTop: 8,
              fontSize: 12,
              opacity: 0.85,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={rotateHintDismissed}
              onChange={(e) => setRotateHintDismissed(e.target.checked)}
            />
            Nicht mehr anzeigen
          </label>
        </div>
      )}

      {selectedVehicle && (
        <VehiclePopup
          vehicle={selectedVehicle as any}
          onClose={() => setSelectedVehicleId(null)}
          onStart={(vehicleId, cruiseSpeedKmh) => onStartVehicle(vehicleId, cruiseSpeedKmh)}
          onPause={(vehicleId) => onPauseVehicle(vehicleId)}
          onReset={(vehicleId) => onResetVehicle(vehicleId)}
          onDelete={(vehicleId) => onDeleteVehicle(vehicleId)}
        />
      )}
    </div>
  );
}