// frontend/src/hooks/useMapActions.ts
import { useCallback, useState } from "react";
import type { ToolMode } from "../types/toolMode";

export type LngLat = [number, number];

export function useMapActions(setStatusText?: (v: string | null) => void) {
  const [toolMode, setToolMode] = useState<ToolMode>("SELECT");

  const [routeStart, setRouteStart] = useState<LngLat | null>(null);
  const [routeEnd, setRouteEnd] = useState<LngLat | null>(null);

  const beginPickStart = useCallback(() => {
    setToolMode("PICK_ROUTE_START");
    setStatusText?.("📍 Start wählen: Klick in die Karte.");
  }, [setStatusText]);

  const beginPickEnd = useCallback(() => {
    setToolMode("PICK_ROUTE_END");
    setStatusText?.("🎯 Ziel wählen: Klick in die Karte.");
  }, [setStatusText]);

  const clearRoute = useCallback(() => {
    setRouteStart(null);
    setRouteEnd(null);
    setToolMode("SELECT");
    setStatusText?.("Start/Ziel zurückgesetzt.");
  }, [setStatusText]);

  const handlePickRoutePoint = useCallback(
    (lngLat: LngLat) => {
      if (toolMode === "PICK_ROUTE_START") {
        setRouteStart(lngLat);
        setToolMode("PICK_ROUTE_END");
        setStatusText?.("✅ Start gesetzt – jetzt Ziel wählen.");
        return;
      }

      if (toolMode === "PICK_ROUTE_END") {
        setRouteEnd(lngLat);
        setToolMode("SELECT");
        setStatusText?.("✅ Ziel gesetzt – Route bereit.");
      }
    },
    [toolMode, setStatusText]
  );

  return {
    toolMode,
    setToolMode,

    routeStart,
    routeEnd,

    beginPickStart,
    beginPickEnd,
    clearRoute,
    handlePickRoutePoint,
  };
}
