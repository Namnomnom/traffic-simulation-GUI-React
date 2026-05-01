// frontend/src/pages/App.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";

import SidebarTools, { type TrafficLightAddMode } from "../components/SidebarTools";
import AppToolbar, { type SimSpeed } from "../components/App/AppToolbar";
import AppMapStage from "../components/App/AppMapStage";
import ScenarioComparisonPanel from "../components/UI/ScenarioComparisonPanel";

import { useUiState } from "../hooks/useUiState";
import { useSimApi } from "../hooks/useSimApi";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

import { useVehicles } from "../hooks/useVehicles";
import { useIntersectionActions } from "../hooks/useIntersectionActions";
import { useRouteActions } from "../hooks/useRouteActions";
import { useVehicleActions } from "../hooks/useVehicleActions";

import { useGlobalSimulation } from "../hooks/useGlobalSimulation";
import { useVehicleRouting } from "../hooks/useVehicleRouting";
import { useMapHandlers } from "../hooks/useMapHandlers";
import { useSimStateSync } from "../hooks/useSimStateSync";
import { useScenarioPersistence } from "../hooks/useScenarioPersistence";
import { useScenarioComparison } from "../hooks/useScenarioComparison";

import { belongsToSelectedGroup } from "../lib/appHelpers";
import { useTrafficLightClock } from "../hooks/useTrafficLightClock";
import { useScenarioActions } from "../hooks/useScenarioActions";

import type { RoadSegment } from "../types/simTypes";
import type { IntersectionVisual } from "../lib/intersectionsToGeoJSON";
import type { IntersectionPhase } from "../types/traffic";

import {
  buildIntersectionPhases,
  buildStopPointsFromIntersections,
} from "../lib/traffic/stopPoints";

const MAX_VEHICLES = 20;
const SNAP_TO_ROAD = true;

function isClockObject(value: unknown): value is { tlClockSec: number } {
  return typeof value === "object" && value !== null && "tlClockSec" in value;
}

export default function App() {
  const {
    statusText,
    setStatusText,
    busy,
    setBusy,

    toolMode,
    setToolMode,
    tlAddMode,
    setTlAddMode,
    currentVehicleType,
    setCurrentVehicleType,

    setRouteStart,
    setRouteEnd,
    beginPickStart,
    beginPickEnd,
    clearRoute,

    kpiPanelOpen,
    setKpiPanelOpen,

    rotateHintDismissed,
    setRotateHintDismissed,
    showRotateHint,
  } = useUiState();

  const setStatusTextSafe = useCallback(
    (value: SetStateAction<string | null>) => {
      if (typeof value === "function") {
        setStatusText((prev) => {
          const next = value(prev ?? "");
          return next ?? "";
        });
        return;
      }

      setStatusText(value ?? "");
    },
    [setStatusText]
  );

  const onStatus = setStatusTextSafe;

  const { startSim, stopSim } = useSimApi({
    onBusyChange: setBusy,
    onStatus,
  });

  const [roads, setRoads] = useState<RoadSegment[]>([]);
  const [intersections, setIntersections] = useState<IntersectionVisual[]>([]);
  const [selectedIntersectionId, setSelectedIntersectionId] = useState<string | null>(null);

  const nextRoadIdRef = useRef(1);
  const nextIntersectionNrRef = useRef(1);
  const simSpeedRef = useRef<number>(1);

  const stopPoints = useMemo(
    () => buildStopPointsFromIntersections(intersections, 2),
    [intersections]
  );

  const [phases, setPhases] = useState<IntersectionPhase[]>([]);

  const { vehicles, setVehicles, startOrResumeVehicle, pauseVehicle, resetVehicle } = useVehicles(
    stopPoints,
    phases,
    simSpeedRef as any
  );

  const { selectedVehicleId, setSelectedVehicleId, selectedVehicle, addVehicleAt } =
    useVehicleActions({
      vehicles,
      setVehicles,
      maxVehicles: MAX_VEHICLES,
      setStatusText: setStatusTextSafe,
    });

  const { snapSelectedVehicleToPoint } = useRouteActions({
    selectedVehicleId,
    setVehicles,
    setStatusText: setStatusTextSafe,
  });

  const {
    routesByVehicle,
    setRoutesByVehicle,
    selectedRoute,
    handlePickRoutePoint,
    handleComputeRoute,
    handleClearRoute,
    deleteRouteForVehicle,
  } = useVehicleRouting({
    toolMode,
    setToolMode,
    selectedVehicleId,
    vehicles,
    setVehicles,
    setStatusText: setStatusTextSafe,
    setRouteStart,
    setRouteEnd,
    clearRoute,
    snapSelectedVehicleToPoint,
  });

  const vehiclesSummary = useMemo(() => {
    return vehicles.map((vehicle) => {
      const route = routesByVehicle[vehicle.id];

      if (route?.points && route.points.length >= 2) {
        return { id: vehicle.id, routeStatus: "ready" as const, hasRoute: true };
      }

      if (route?.start) {
        return { id: vehicle.id, routeStatus: "start" as const, hasRoute: false };
      }

      return { id: vehicle.id, routeStatus: "none" as const, hasRoute: false };
    });
  }, [vehicles, routesByVehicle]);

  const {
    simState,
    simTimeSec,
    previewTimeSec,
    simSpeed,
    setSimSpeed,
    simTickMs,
    handleSimStart,
    handleSimPause,
    handleSimReset,
    previewTrafficLights,
    setPreviewTrafficLights,
  } = useGlobalSimulation({
    vehicles,
    setVehicles,
    routesByVehicle,
    setStatusText: setStatusTextSafe,
    startSim,
    stopSim,
    startOrResumeVehicle,
    resetVehicle,
  });

  useEffect(() => {
    simSpeedRef.current = Number(simSpeed);
  }, [simSpeed]);

  const tlClockResult = useTrafficLightClock({
    simState,
    simTimeSec,
    previewTimeSec,
    previewTrafficLights,
    simSpeedRef,
  } as any);

  const tlClockSec = isClockObject(tlClockResult)
    ? tlClockResult.tlClockSec
    : (tlClockResult as number);

  useEffect(() => {
    setPhases(buildIntersectionPhases(intersections, tlClockSec));
  }, [intersections, tlClockSec]);

  useSimStateSync({
    enabled: simState === "RUNNING",
    tickMs: simTickMs,
    setVehicles,
    onError: () => onStatus("Fehler beim Lesen des Simulationsstatus (SUMO)"),
  });

  const {
    handleMapClickAddVehicle,
    handleRoadFinished,
    handleVehicleMoved,
    handleVehicleClick,
    handleAddTrafficLights,
  } = useMapHandlers({
    toolMode,
    currentVehicleType,
    setRoads,
    nextRoadIdRef,
    setIntersections,
    nextIntersectionNrRef,
    addVehicleAt,
    setVehicles,
    routesByVehicle,
    setStatusText: setStatusTextSafe,
    setSelectedVehicleId,
  });

  const {
    setIntersectionBearing,
    deleteIntersection,
    moveIntersectionGroup,
    setSingleGroupId,
    setIntersectionGreenTimes,
    toggleIntersectionPhase,
  } = useIntersectionActions({
    roads,
    snapToRoad: SNAP_TO_ROAD,
    intersections,
    setIntersections,
    setSelectedIntersectionId,
    setStatusText: setStatusTextSafe,
  });

  useKeyboardShortcuts({
    selectedIntersectionId,
    setSelectedIntersectionId,
    intersections,
    setIntersectionBearing,
    rotationStepDeg: 10,
  });

  const selectedIntersection = useMemo(() => {
    if (!selectedIntersectionId) return null;

    return (
      intersections.find((item) => belongsToSelectedGroup(item.id, selectedIntersectionId)) ?? null
    );
  }, [selectedIntersectionId, intersections]);

  const panelIntersection = useMemo(() => {
    if (!selectedIntersection || !selectedIntersectionId) return null;

    return {
      ...selectedIntersection,
      id: selectedIntersectionId,
    } as IntersectionVisual;
  }, [selectedIntersection, selectedIntersectionId]);

  const openVehicleDialogFromSidebar = useCallback(() => {
    onStatus("⚙️ Vehicle-Details kommen später 🙂");
  }, [onStatus]);

  const { buildSnapshot, applyScenarioPayloadToState, pickScenarioJSONFile } =
    useScenarioPersistence({
      roads,
      intersections,
      vehicles,
      routesByVehicle,
      currentVehicleType,
      simSpeed,
      previewTrafficLights,
      setStatusText: setStatusTextSafe,
      setRoads,
      setIntersections,
      setVehicles,
      setRoutesByVehicle,
      setSelectedVehicleId,
      setSelectedIntersectionId,
      setRouteStart,
      setRouteEnd,
      clearRoute,
      setToolMode,
      setCurrentVehicleType,
      setSimSpeed,
      setPreviewTrafficLights,
    });

  const { activeScenarioName, handleScenarioMenu } = useScenarioActions({
    busy,
    setBusy,
    setStatusText: setStatusTextSafe,
    initialScenarioName: "Verkehr-Szenario",
    buildSnapshot,
    applyScenarioPayloadToState,
    pickScenarioJSONFile,
  });

  const {
    scenarioComparisonOpen,
    setScenarioComparisonOpen,
    scenarioA,
    scenarioB,
    captureScenarioA,
    captureScenarioB,
    resetScenarioA,
    resetScenarioB,
    resetScenarioComparison,
  } = useScenarioComparison({
    activeScenarioName,
    intersectionsCount: intersections.length,
    vehicles,
    routesByVehicle,
    setStatusText: setStatusTextSafe,
  });

  const onStartVehicle = useCallback(
    (vehicleId: number, cruiseSpeedKmh: number) => {
      const route =
        routesByVehicle[vehicleId]?.points ??
        (vehicles.find((vehicle) => vehicle.id === vehicleId) as any)?.routePoints;

      if (!route || route.length < 2) {
        onStatus("Bitte erst eine Route für dieses Fahrzeug setzen.");
        return;
      }

      startOrResumeVehicle(vehicleId, route, cruiseSpeedKmh);
    },
    [routesByVehicle, vehicles, onStatus, startOrResumeVehicle]
  );

  const onDeleteVehicle = useCallback(
    (vehicleId: number) => {
      const confirmed = window.confirm(`Fahrzeug #${vehicleId} wirklich löschen?`);
      if (!confirmed) return;

      setSelectedVehicleId(null);
      deleteRouteForVehicle(vehicleId);
      setVehicles((prev) => prev.filter((vehicle) => vehicle.id !== vehicleId));
      onStatus(`Fahrzeug #${vehicleId} gelöscht.`);
    },
    [deleteRouteForVehicle, onStatus, setVehicles, setSelectedVehicleId]
  );

  const setSimSpeedFromToolbar = useCallback(
    (speed: SimSpeed) => {
      setSimSpeed(speed);
    },
    [setSimSpeed]
  );

  const handlePickRouteStartFromSidebar = useCallback(() => {
    if (selectedVehicleId == null) {
      onStatus("Bitte zuerst ein Fahrzeug auswählen.");
      return;
    }

    beginPickStart();
  }, [beginPickStart, selectedVehicleId, onStatus]);

  const handlePickRouteEndFromSidebar = useCallback(() => {
    if (selectedVehicleId == null) {
      onStatus("Bitte zuerst ein Fahrzeug auswählen.");
      return;
    }

    beginPickEnd();
  }, [beginPickEnd, selectedVehicleId, onStatus]);

  return (
    <div className="app-root">
      <AppToolbar
        busy={busy}
        simState={simState as any}
        simTimeSec={simTimeSec}
        simSpeed={simSpeed as SimSpeed}
        setSimSpeed={setSimSpeedFromToolbar}
        previewTrafficLights={previewTrafficLights}
        setPreviewTrafficLights={setPreviewTrafficLights}
        onSimStart={handleSimStart}
        onSimPause={handleSimPause}
        onSimReset={handleSimReset}
        onScenarioMenu={handleScenarioMenu}
        statusText={statusText ?? ""}
      />

      <div className="app-body">
        <aside className="app-sidebar">
          <div className="sidebar-scroll">
            <SidebarTools
              toolMode={toolMode}
              onToolModeChange={setToolMode}
              vehiclesCount={vehicles.length}
              maxVehicles={MAX_VEHICLES}
              vehiclesSummary={vehiclesSummary}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={setSelectedVehicleId}
              currentVehicleType={currentVehicleType}
              onCurrentVehicleTypeChange={setCurrentVehicleType}
              onOpenVehicleDialog={openVehicleDialogFromSidebar}
              routeStart={selectedRoute.start}
              routeEnd={selectedRoute.end}
              onPickRouteStart={handlePickRouteStartFromSidebar}
              onPickRouteEnd={handlePickRouteEndFromSidebar}
              onComputeRoute={handleComputeRoute}
              onClearRoute={handleClearRoute}
              tlAddMode={tlAddMode as TrafficLightAddMode}
              onTlAddModeChange={(mode) => setTlAddMode(mode as any)}
            />
          </div>

          <div className="sidebar-footer">
            <div style={{ display: "grid", gap: 8 }}>
              {activeScenarioName && (
                <small style={{ fontSize: 12, color: "#888" }}>
                  Aktiv: {activeScenarioName}
                </small>
              )}

              <button
                type="button"
                className="tool-button compact"
                onClick={() => setScenarioComparisonOpen((open) => !open)}
                style={{
                  width: "100%",
                  marginBottom: 0,
                  background: scenarioComparisonOpen ? "#2E7D32" : "#EBF3FB",
                  color: scenarioComparisonOpen ? "#fff" : "#0C447C",
                  border: scenarioComparisonOpen ? "1px solid #2E7D32" : "1px solid #B5D4F4",
                  fontWeight: 700,
                }}
              >
                <span>
                  📊 {scenarioComparisonOpen ? "Vergleich geöffnet" : "Szenariovergleich"}
                </span>
              </button>
            </div>
          </div>
        </aside>

        <main className="app-main">
          <ScenarioComparisonPanel
            open={scenarioComparisonOpen}
            onOpenChange={setScenarioComparisonOpen}
            scenarioA={scenarioA}
            scenarioB={scenarioB}
            onCaptureA={captureScenarioA}
            onCaptureB={captureScenarioB}
            onResetA={resetScenarioA}
            onResetB={resetScenarioB}
            onResetComparison={resetScenarioComparison}
          />

          <AppMapStage
            toolMode={toolMode as any}
            roads={roads}
            intersections={intersections}
            vehicles={vehicles as any}
            selectedVehicleId={selectedVehicleId}
            setSelectedVehicleId={setSelectedVehicleId}
            selectedIntersectionId={selectedIntersectionId}
            setSelectedIntersectionId={setSelectedIntersectionId}
            currentVehicleType={currentVehicleType}
            routesByVehicle={routesByVehicle as any}
            selectedRoute={selectedRoute as any}
            handleRoadFinished={handleRoadFinished as any}
            handleMapClickAddVehicle={handleMapClickAddVehicle as any}
            tlAddMode={tlAddMode as any}
            handleAddTrafficLights={handleAddTrafficLights as any}
            handlePickRoutePoint={handlePickRoutePoint as any}
            moveIntersectionGroup={moveIntersectionGroup as any}
            handleVehicleClick={handleVehicleClick as any}
            handleVehicleMoved={handleVehicleMoved as any}
            panelIntersection={panelIntersection}
            tlClockSec={tlClockSec}
            setIntersectionBearing={setIntersectionBearing as any}
            deleteIntersection={deleteIntersection as any}
            setIntersectionGreenTimes={setIntersectionGreenTimes as any}
            toggleIntersectionPhase={toggleIntersectionPhase as any}
            setSingleGroupId={setSingleGroupId as any}
            showRotateHint={showRotateHint}
            rotateHintDismissed={rotateHintDismissed}
            setRotateHintDismissed={setRotateHintDismissed}
            selectedVehicle={selectedVehicle as any}
            onStartVehicle={onStartVehicle}
            onPauseVehicle={pauseVehicle}
            onResetVehicle={resetVehicle}
            onDeleteVehicle={onDeleteVehicle}
            simState={simState as any}
            kpiPanelOpen={kpiPanelOpen}
            setKpiPanelOpen={setKpiPanelOpen}
          />
        </main>
      </div>
    </div>
  );
}