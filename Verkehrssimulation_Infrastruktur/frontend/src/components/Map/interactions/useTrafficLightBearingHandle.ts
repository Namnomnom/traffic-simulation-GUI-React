// frontend/src/components/Map/interactions/useTrafficLightBearingHandle.ts
import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import type { IntersectionVisual } from "../../../lib/intersectionsToGeoJSON";

type Options = {
  map: maplibregl.Map | null;

  intersections: IntersectionVisual[];
  selectedIntersectionId: string | null;

  onSetIntersectionBearing: (id: string, bearingDeg: number) => void;

  disabled?: boolean;

  // Abstand vom Zentrum (px)
  radiusPx?: number;
};

function normDeg(deg: number) {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/**
 * Bearing aus Screen-Winkel:
 * - 0° = N (oben)
 * - 90° = E (rechts)
 * - 180° = S (unten)
 * - 270° = W (links)
 */
function bearingFromScreen(center: { x: number; y: number }, p: { x: number; y: number }) {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const rad = Math.atan2(dx, -dy);
  return normDeg((rad * 180) / Math.PI);
}

function pointOnCircle(center: { x: number; y: number }, bearingDeg: number, r: number) {
  const a = (bearingDeg * Math.PI) / 180;
  return { x: center.x + Math.sin(a) * r, y: center.y - Math.cos(a) * r };
}

export function useTrafficLightBearingHandle({
  map,
  intersections,
  selectedIntersectionId,
  onSetIntersectionBearing,
  disabled = false,
  radiusPx = 34,
}: Options) {
  const handleElRef = useRef<HTMLDivElement | null>(null);
  const lineElRef = useRef<HTMLDivElement | null>(null);

  const draggingRef = useRef(false);
  const selectedIdRef = useRef<string | null>(selectedIntersectionId);

  useEffect(() => {
    selectedIdRef.current = selectedIntersectionId;
  }, [selectedIntersectionId]);

  // Overlay Elements einmal anlegen
  useEffect(() => {
    if (!map) return;

    const container = map.getContainer();
    container.style.position = container.style.position || "relative";

    const lineEl = document.createElement("div");
    lineElRef.current = lineEl;
    lineEl.style.position = "absolute";
    lineEl.style.height = "2px";
    lineEl.style.background = "rgba(0,0,0,0.55)";
    lineEl.style.transformOrigin = "0 50%";
    lineEl.style.zIndex = "998";
    lineEl.style.display = "none";

    const handleEl = document.createElement("div");
    handleElRef.current = handleEl;
    handleEl.style.position = "absolute";
    handleEl.style.width = "18px";
    handleEl.style.height = "18px";
    handleEl.style.borderRadius = "999px";
    handleEl.style.background = "white";
    handleEl.style.border = "2px solid rgba(0,0,0,0.55)";
    handleEl.style.boxShadow = "0 6px 14px rgba(0,0,0,0.18)";
    handleEl.style.transform = "translate(-50%, -50%)";
    handleEl.style.cursor = "grab";
    handleEl.style.zIndex = "999";
    handleEl.style.display = "none";

    // Pfeil im Handle
    const arrow = document.createElement("div");
    arrow.style.position = "absolute";
    arrow.style.left = "50%";
    arrow.style.top = "50%";
    arrow.style.width = "0";
    arrow.style.height = "0";
    arrow.style.transform = "translate(-50%, -70%)";
    arrow.style.borderLeft = "5px solid transparent";
    arrow.style.borderRight = "5px solid transparent";
    arrow.style.borderBottom = "8px solid rgba(0,0,0,0.75)";
    handleEl.appendChild(arrow);

    container.appendChild(lineEl);
    container.appendChild(handleEl);

    return () => {
      try {
        container.removeChild(handleEl);
      } catch {}
      try {
        container.removeChild(lineEl);
      } catch {}
      handleElRef.current = null;
      lineElRef.current = null;
    };
  }, [map]);

  // Overlay Position updaten bei Move/Zoom/Selection/Intersections
  useEffect(() => {
    if (!map) return;

    const update = () => {
      const handleEl = handleElRef.current;
      const lineEl = lineElRef.current;
      if (!handleEl || !lineEl) return;

      if (disabled || !selectedIntersectionId) {
        handleEl.style.display = "none";
        lineEl.style.display = "none";
        return;
      }

      const k = intersections.find((x) => x.id === selectedIntersectionId);
      if (!k) {
        handleEl.style.display = "none";
        lineEl.style.display = "none";
        return;
      }

      const bearing = typeof k.bearing === "number" ? k.bearing : 0;
      const center = map.project(k.point as any);
      const handlePt = pointOnCircle({ x: center.x, y: center.y }, bearing, radiusPx);

      handleEl.style.display = "block";
      handleEl.style.left = `${handlePt.x}px`;
      handleEl.style.top = `${handlePt.y}px`;

      const dx = handlePt.x - center.x;
      const dy = handlePt.y - center.y;
      const len = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      lineEl.style.display = "block";
      lineEl.style.left = `${center.x}px`;
      lineEl.style.top = `${center.y}px`;
      lineEl.style.width = `${len}px`;
      lineEl.style.transform = `translate(0, -50%) rotate(${angle}deg)`;
    };

    update();
    map.on("move", update);
    map.on("zoom", update);
    map.on("rotate", update);
    map.on("pitch", update);

    return () => {
      map.off("move", update);
      map.off("zoom", update);
      map.off("rotate", update);
      map.off("pitch", update);
    };
  }, [map, intersections, selectedIntersectionId, disabled, radiusPx]);

  // Drag-Handling (Bearing setzen)
  useEffect(() => {
    if (!map) return;
    const handleEl = handleElRef.current;
    if (!handleEl) return;

    const onMouseDown = (ev: MouseEvent) => {
      if (disabled) return;
      const id = selectedIdRef.current;
      if (!id) return;

      if (ev.target && handleEl.contains(ev.target as Node)) {
        ev.preventDefault();
        ev.stopPropagation();

        draggingRef.current = true;
        handleEl.style.cursor = "grabbing";

        try {
          map.dragPan.disable();
        } catch {}
      }
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const id = selectedIdRef.current;
      if (!id) return;

      const k = intersections.find((x) => x.id === id);
      if (!k) return;

      const center = map.project(k.point as any);
      const nextBearing = bearingFromScreen(
        { x: center.x, y: center.y },
        { x: ev.clientX, y: ev.clientY }
      );

      onSetIntersectionBearing(id, nextBearing);
    };

    const finish = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;

      if (handleElRef.current) handleElRef.current.style.cursor = "grab";

      try {
        map.dragPan.enable();
      } catch {}
    };

    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", finish, true);

    return () => {
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mouseup", finish, true);
      try {
        map.dragPan.enable();
      } catch {}
    };
  }, [map, intersections, onSetIntersectionBearing, disabled]);
}
