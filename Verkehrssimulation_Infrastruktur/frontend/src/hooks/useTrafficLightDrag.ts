// frontend/src/hooks/useTrafficLightDrag.ts
import { useEffect } from "react";
import type React from "react";
import type maplibregl from "maplibre-gl";

import {
  TL_LAYER_ID,
  TL_CLICK_CONSUMED_KEY,
  TL_DRAGGING_KEY,
  TL_DRAG_JUST_ENDED_AT_KEY,
} from "../components/Map/layers/trafficLightsLayer";

type LngLat = [number, number];

type Params = {
  map: maplibregl.Map | null;
  mapLoaded: boolean;

  isDrawing: boolean;
  draggingVehicleIdRef: React.MutableRefObject<number | null>;

  selectedIntersectionId: string | null;

  onMoveIntersectionGroup?: (groupId: string, nextPoint: LngLat) => void;
};

export function useTrafficLightDrag({
  map,
  mapLoaded,
  isDrawing,
  draggingVehicleIdRef,
  selectedIntersectionId,
  onMoveIntersectionGroup,
}: Params) {
  useEffect(() => {
    if (!map || !mapLoaded) return;
    if (!onMoveIntersectionGroup) return;

    let bound = false;
    let dragging = false;
    let dragGroupId: string | null = null;

    const setCursor = (c: string) => {
      map.getCanvas().style.cursor = c;
    };

    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      dragGroupId = null;

      (map as any)[TL_DRAGGING_KEY] = false;
      (map as any)[TL_DRAG_JUST_ENDED_AT_KEY] = Date.now();

      try {
        map.dragPan.enable();
      } catch {
        // ignore
      }
      setCursor("");
    };

    const canStartDragFor = (groupId: string | undefined) => {
      if (!groupId) return false;
      if (!selectedIntersectionId) return false;
      return groupId === selectedIntersectionId;
    };

    const beginDrag = (groupId: string) => {
      dragging = true;
      dragGroupId = groupId;

      (map as any)[TL_DRAGGING_KEY] = true;

      (map as any)[TL_CLICK_CONSUMED_KEY] = true;
      setTimeout(() => ((map as any)[TL_CLICK_CONSUMED_KEY] = false), 0);

      try {
        map.dragPan.disable();
      } catch {
        // ignore
      }
      setCursor("grabbing");
    };

    const onMouseDown = (e: any) => {
      if (e.originalEvent?.button !== 0) return;
      if (isDrawing) return;
      if (draggingVehicleIdRef.current != null) return;

      const f = e.features?.[0];
      const groupId = f?.properties?.intersectionId as string | undefined;
      if (!canStartDragFor(groupId)) return;

      e.preventDefault?.();
      beginDrag(groupId!);
    };

    const onTouchStart = (e: any) => {
      if (isDrawing) return;
      if (draggingVehicleIdRef.current != null) return;

      const f = e.features?.[0];
      const groupId = f?.properties?.intersectionId as string | undefined;
      if (!canStartDragFor(groupId)) return;

      e.preventDefault?.();
      beginDrag(groupId!);
    };

    const onMouseMove = (e: any) => {
      if (!dragging || !dragGroupId) return;
      const { lng, lat } = e.lngLat;
      onMoveIntersectionGroup(dragGroupId, [lng, lat]);
    };

    const onTouchMove = (e: any) => {
      if (!dragging || !dragGroupId) return;
      const { lng, lat } = e.lngLat;
      onMoveIntersectionGroup(dragGroupId, [lng, lat]);
    };

    const onMouseUp = () => stopDrag();
    const onTouchEnd = () => stopDrag();

    const onMouseEnter = (e: any) => {
      if ((map as any)[TL_DRAGGING_KEY]) return;
      const f = e.features?.[0];
      const groupId = f?.properties?.intersectionId as string | undefined;
      setCursor(canStartDragFor(groupId) ? "grab" : "pointer");
    };

    const onMouseLeave = () => {
      if ((map as any)[TL_DRAGGING_KEY]) return;
      setCursor("");
    };

    const bindIfPossible = () => {
      if (bound) return;
      if (!map.getLayer(TL_LAYER_ID)) return;

      bound = true;

      map.on("mouseenter", TL_LAYER_ID, onMouseEnter);
      map.on("mouseleave", TL_LAYER_ID, onMouseLeave);
      map.on("mousedown", TL_LAYER_ID, onMouseDown);
      map.on("touchstart", TL_LAYER_ID, onTouchStart);

      map.on("mousemove", onMouseMove);
      map.on("mouseup", onMouseUp);

      map.on("touchmove", onTouchMove);
      map.on("touchend", onTouchEnd);
      map.on("touchcancel", onTouchEnd);

      map.on("dragstart", stopDrag);
    };

    bindIfPossible();
    map.on("idle", bindIfPossible);

    return () => {
      map.off("idle", bindIfPossible);

      if (bound) {
        map.off("mouseenter", TL_LAYER_ID, onMouseEnter);
        map.off("mouseleave", TL_LAYER_ID, onMouseLeave);
        map.off("mousedown", TL_LAYER_ID, onMouseDown);
        map.off("touchstart", TL_LAYER_ID, onTouchStart);

        map.off("mousemove", onMouseMove);
        map.off("mouseup", onMouseUp);

        map.off("touchmove", onTouchMove);
        map.off("touchend", onTouchEnd);
        map.off("touchcancel", onTouchEnd);

        map.off("dragstart", stopDrag);
      }

      stopDrag();
    };
  }, [map, mapLoaded, isDrawing, draggingVehicleIdRef, selectedIntersectionId, onMoveIntersectionGroup]);
}
