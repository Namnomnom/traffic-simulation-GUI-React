// frontend/src/hooks/useScenarioComparison.ts
import { useCallback, useState } from "react";
import type { ScenarioSnapshot } from "../components/UI/ScenarioComparisonPanel";

type RoutesByVehicle = Record<
  number,
  {
    start: [number, number] | null;
    end: [number, number] | null;
    points: [number, number][] | null;
  }
>;

type UseScenarioComparisonParams = {
  activeScenarioName: string;
  intersectionsCount: number;
  vehicles: Array<{ id: number }>;
  routesByVehicle: RoutesByVehicle;
  setStatusText: (text: string) => void;
};

export function useScenarioComparison({
  activeScenarioName,
  intersectionsCount,
  vehicles,
  routesByVehicle,
  setStatusText,
}: UseScenarioComparisonParams) {
  const [scenarioComparisonOpen, setScenarioComparisonOpen] = useState(false);
  const [scenarioA, setScenarioA] = useState<ScenarioSnapshot | null>(null);
  const [scenarioB, setScenarioB] = useState<ScenarioSnapshot | null>(null);

  const buildScenarioSnapshotForCompare = useCallback((): ScenarioSnapshot => {
    const routedVehicles = vehicles.filter((vehicle) => {
      const points = routesByVehicle[vehicle.id]?.points;
      return Array.isArray(points) && points.length >= 2;
    });

    const avgRoutePoints =
      routedVehicles.length > 0
        ? Math.round(
            routedVehicles.reduce((sum, vehicle) => {
              const points = routesByVehicle[vehicle.id]?.points;
              return sum + (Array.isArray(points) ? points.length : 0);
            }, 0) / routedVehicles.length
          )
        : 0;

    return {
      name: activeScenarioName || "Verkehr-Szenario",
      capturedAt: new Date().toLocaleString("de-DE"),
      trafficLightsCount: intersectionsCount,
      vehiclesCount: vehicles.length,
      routedVehiclesCount: routedVehicles.length,
      avgRoutePoints,
    };
  }, [activeScenarioName, intersectionsCount, vehicles, routesByVehicle]);

  const captureScenarioA = useCallback(() => {
    setScenarioA(buildScenarioSnapshotForCompare());
    setScenarioComparisonOpen(true);
    setStatusText("📌 Szenario A aufgenommen.");
  }, [buildScenarioSnapshotForCompare, setStatusText]);

  const captureScenarioB = useCallback(() => {
    setScenarioB(buildScenarioSnapshotForCompare());
    setScenarioComparisonOpen(true);
    setStatusText("📌 Szenario B aufgenommen.");
  }, [buildScenarioSnapshotForCompare, setStatusText]);

  const resetScenarioA = useCallback(() => {
    setScenarioA(null);
    setStatusText("🧹 Szenario A zurückgesetzt.");
  }, [setStatusText]);

  const resetScenarioB = useCallback(() => {
    setScenarioB(null);
    setStatusText("🧹 Szenario B zurückgesetzt.");
  }, [setStatusText]);

  const resetScenarioComparison = useCallback(() => {
    setScenarioA(null);
    setScenarioB(null);
    setStatusText("🧹 Szenariovergleich zurückgesetzt.");
  }, [setStatusText]);

  return {
    scenarioComparisonOpen,
    setScenarioComparisonOpen,
    scenarioA,
    scenarioB,
    captureScenarioA,
    captureScenarioB,
    resetScenarioA,
    resetScenarioB,
    resetScenarioComparison,
  };
}