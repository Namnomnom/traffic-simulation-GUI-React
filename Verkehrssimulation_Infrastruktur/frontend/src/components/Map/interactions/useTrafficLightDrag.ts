// frontend/src/components/Map/interactions/useTrafficLightDrag.ts
import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";

type Options = {
  map: maplibregl.Map | null;

  // aktuell selektierte Ampel
  selectedIntersectionId: string | null;

  // Ampel verschieben
  onMoveIntersection: (id: string, lng: number, lat: number) => void;

  // deaktivieren (z. B. beim Zeichnen oder Add-Mode)
  disabled?: boolean;

  // Drag-Schwelle (verhindert Click+Drag Konflikt)
  dragThresholdPx?: number;

  // Layer-ID, auf dem die Ampel-Köpfe gerendert werden
  layerId?: string;
};

export function useTrafficLightDrag({
  map,
  selectedIntersectionId,
  onMoveIntersection,
  disabled = false,
  dragThresholdPx = 6,
  layerId = "trafficlights-heads-layer",
}: Options) {
  const draggingIdRef = useRef<string | null>(null);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!map) return;
    if (disabled) return;

    const onPointerDown = (e: maplibregl.MapMouseEvent) => {
      if (!selectedIntersectionId) return;

      const features = map.queryRenderedFeatures(e.point, { layers: [layerId] });
      if (!features.length) return;

      const f = features[0];
      const id =
        (f.properties as any)?.intersectionId ??
        (f.properties as any)?.id ??
        null;

      // Drag nur auf selektierter Ampel
      if (!id || id !== selectedIntersectionId) return;

      e.preventDefault();

      draggingIdRef.current = id;
      dragStartPointRef.current = { x: e.point.x, y: e.point.y };
      isDraggingRef.current = false;

      map.getCanvas().style.cursor = "grabbing";

      // Map-Pan während Drag aus (fühlt sich viel besser an)
      try {
        map.dragPan.disable();
      } catch {}
    };

    const onPointerMove = (e: maplibregl.MapMouseEvent) => {
      if (!draggingIdRef.current) return;
      if (!dragStartPointRef.current) return;

      const dx = e.point.x - dragStartPointRef.current.x;
      const dy = e.point.y - dragStartPointRef.current.y;

      if (!isDraggingRef.current) {
        const dist = Math.hypot(dx, dy);
        if (dist < dragThresholdPx) return;
        isDraggingRef.current = true;
      }

      onMoveIntersection(draggingIdRef.current, e.lngLat.lng, e.lngLat.lat);
    };

    const finish = () => {
      if (!draggingIdRef.current) return;

      draggingIdRef.current = null;
      dragStartPointRef.current = null;
      isDraggingRef.current = false;

      map.getCanvas().style.cursor = "";

      try {
        map.dragPan.enable();
      } catch {}
    };

    map.on("mousedown", onPointerDown);
    map.on("mousemove", onPointerMove);
    map.on("mouseup", finish);
    map.on("mouseleave", finish);

    return () => {
      map.off("mousedown", onPointerDown);
      map.off("mousemove", onPointerMove);
      map.off("mouseup", finish);
      map.off("mouseleave", finish);
      try {
        map.getCanvas().style.cursor = "";
      } catch {}
      try {
        map.dragPan.enable();
      } catch {}
    };
  }, [map, selectedIntersectionId, onMoveIntersection, disabled, dragThresholdPx, layerId]);
}
