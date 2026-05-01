// frontend/src/hooks/useTrafficLightsLayer.ts
import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";

import type { IntersectionVisual } from "../lib/intersectionsToGeoJSON";
import type { RoadSegment } from "../types/simTypes";

import {
  ensureTrafficLightsLayer,
  updateTrafficLightsData,
  updateTrafficLightSelection,
  enableTrafficLightsInteractions,
  TL_DRAG_JUST_ENDED_AT_KEY,
} from "../components/Map/layers/trafficLightsLayer";

type Params = {
  map: maplibregl.Map | null;
  mapLoaded: boolean;

  intersections: IntersectionVisual[];
  roads: RoadSegment[];

  selectedIntersectionId: string | null;
  onSelectIntersection?: (id: string | null) => void;
};

export function useTrafficLightsLayer({
  map,
  mapLoaded,
  intersections,
  roads,
  selectedIntersectionId,
  onSelectIntersection,
}: Params) {
  const ensuredRef = useRef(false);

  // ✅ Ensure layer once + bind click interactions once
  useEffect(() => {
    if (!map || !mapLoaded) return;
    if (ensuredRef.current) return;

    ensuredRef.current = true;

    let cancelled = false;

    (async () => {
      await ensureTrafficLightsLayer(map);
      if (cancelled) return;

      // initial paint
      updateTrafficLightsData(map, intersections, roads);
      updateTrafficLightSelection(map, selectedIntersectionId ?? null);

      // bind selection clicks once
      if (onSelectIntersection) {
        enableTrafficLightsInteractions(map, (intersectionId) => {
          const justEndedAt = (map as any)[TL_DRAG_JUST_ENDED_AT_KEY] as number | undefined;
          if (justEndedAt && Date.now() - justEndedAt < 220) return;
          onSelectIntersection(intersectionId);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mapLoaded]);

  // ✅ Update data when intersections/roads change
  useEffect(() => {
    if (!map || !mapLoaded) return;
    if (!ensuredRef.current) return;
    updateTrafficLightsData(map, intersections, roads);
  }, [map, mapLoaded, intersections, roads]);

  // ✅ Update selection halo
  useEffect(() => {
    if (!map || !mapLoaded) return;
    if (!ensuredRef.current) return;
    updateTrafficLightSelection(map, selectedIntersectionId ?? null);
  }, [map, mapLoaded, selectedIntersectionId]);

  // ✅ Update TL offsets while zooming
  useEffect(() => {
    if (!map || !mapLoaded) return;
    if (!ensuredRef.current) return;

    let raf = 0;

    const refresh = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        updateTrafficLightsData(map, intersections, roads);
      });
    };

    map.on("zoom", refresh);

    return () => {
      map.off("zoom", refresh);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [map, mapLoaded, intersections, roads]);
}
