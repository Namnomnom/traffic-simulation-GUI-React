// frontend/src/hooks/useMapInit.ts
import { useEffect, useRef, useState, type RefObject, type MutableRefObject } from "react";
import maplibregl from "maplibre-gl";

import { ensureDrawingLayers, ensureSavedRoadsLayers } from "../components/Map/layers/drawingLayers";
import { ensureSnapPreviewLayer } from "../components/Map/layers/snapPreviewLayer";
import { ensureTrafficLightsLayer } from "../components/Map/layers/trafficLightsLayer";
import {
  ensureRouteLayer,
  ROUTE_LINE_LAYER_ID,
  ROUTE_START_LAYER_ID,
  ROUTE_END_LAYER_ID,
} from "../components/Map/layers/routeLayer";
import { removeAllVehicleMarkers, type MarkerMap } from "../components/Map/markers/vehiclemarkers";

type LngLat = [number, number];

type UseMapInitOptions = {
  containerRef: RefObject<HTMLDivElement>;
  initialCenter: LngLat;
  initialZoom: number;
  markersRef?: MutableRefObject<MarkerMap>;
};

function fixMapLabels(map: maplibregl.Map) {
  const layers = map.getStyle().layers ?? [];

  for (const layer of layers) {
    if (layer.type !== "symbol") continue;
    if (!layer.layout || !("text-field" in layer.layout)) continue;

    map.setLayoutProperty(layer.id, "text-field", [
      "coalesce",
      ["get", "name:de"],
      [
        "case",
        ["==", ["get", "name"], "Brunswick"],
        "Braunschweig",
        ["get", "name"],
      ],
    ]);
  }
}

export function useMapInit({
  containerRef,
  initialCenter,
  initialZoom,
  markersRef,
}: UseMapInitOptions) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const apiKey = import.meta.env.VITE_MAPTILER_KEY;
    if (!apiKey) {
      console.error("VITE_MAPTILER_KEY ist nicht gesetzt!");
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${apiKey}`,
      center: initialCenter,
      zoom: initialZoom,
      pitch: 45,
      bearing: 0,
      fadeDuration: 0,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    let cancelled = false;

    const onLoad = async () => {
      try {
        fixMapLabels(map);

        ensureDrawingLayers(map);
        ensureSavedRoadsLayers(map);
        ensureSnapPreviewLayer(map);

        await ensureTrafficLightsLayer(map);
        ensureRouteLayer(map);

        if (map.getLayer(ROUTE_LINE_LAYER_ID)) map.moveLayer(ROUTE_LINE_LAYER_ID);
        if (map.getLayer(ROUTE_START_LAYER_ID)) map.moveLayer(ROUTE_START_LAYER_ID);
        if (map.getLayer(ROUTE_END_LAYER_ID)) map.moveLayer(ROUTE_END_LAYER_ID);

        if (!cancelled) setMapLoaded(true);
      } catch (e) {
        console.error("Map init failed:", e);
      }
    };

    map.on("load", onLoad);
    mapRef.current = map;

    return () => {
      cancelled = true;
      map.off("load", onLoad);

      if (markersRef) {
        removeAllVehicleMarkers(markersRef.current);
      }

      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  return { mapRef, mapLoaded };
}