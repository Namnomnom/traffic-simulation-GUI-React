// frontend/src/hooks/useRoadLayers.ts
import { useEffect } from "react";
import type maplibregl from "maplibre-gl";

import type { LngLat, RoadSegment } from "../types/simTypes";
import { updateDrawingData, updateSavedRoadsData } from "../components/Map/layers/drawingLayers";

type Params = {
  map: maplibregl.Map | null;
  mapLoaded: boolean;

  coords: LngLat[];
  roads: RoadSegment[];
};

export function useRoadLayers({ map, mapLoaded, coords, roads }: Params) {
  useEffect(() => {
    if (!map || !mapLoaded) return;
    updateDrawingData(map, coords);
  }, [map, mapLoaded, coords]);

  useEffect(() => {
    if (!map || !mapLoaded) return;
    updateSavedRoadsData(map, roads);
  }, [map, mapLoaded, roads]);
}
