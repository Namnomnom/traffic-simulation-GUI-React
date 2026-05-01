// frontend/src/components/Map/interactions/useVehicleDrag.ts
import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { RoadSegment } from "../../../types/simTypes";

import { ensureSnapPreviewLayer, setSnapPreview } from "../layers/snapPreviewLayer";
import { ROUTE_SOURCE_ID } from "../layers/routeLayer"; // ✅ start-radius feature-state

type UseVehicleDragArgs = {
  map: maplibregl.Map | null;

  /**
   * Wenn true, darf nicht gezogen werden (z.B. während Zeichnen).
   */
  disabled?: boolean;

  /**
   * Wird während Drag und beim Snap-Ende aufgerufen.
   * (id, lat, lon)
   */
  onVehicleMoved: (id: number, lat: number, lon: number) => void;

  /**
   * Snap-Ziele (best practice): z.B. [routeStart] als maplibre LngLat.
   * Wenn nicht gesetzt, fallback auf roads[0]-Punkte (Legacy).
   */
  snapTargets?: maplibregl.LngLat[];

  /**
   * Legacy fallback: startPoints aus roads
   */
  roads?: RoadSegment[];

  /**
   * Pixel-Schwelle, bevor Drag wirklich startet.
   */
  dragThresholdPx?: number;

  /**
   * Snap-Reichweite in Pixel.
   */
  snapRadiusPx?: number;
};

export function useVehicleDrag({
  map,
  disabled = false,
  onVehicleMoved,
  snapTargets,
  roads = [],
  dragThresholdPx = 6,
  snapRadiusPx = 20,
}: UseVehicleDragArgs) {
  // ✅ Drag State
  const draggingVehicleIdRef = useRef<number | null>(null);

  // ✅ Pending Drag -> startet erst nach Schwelle
  const pendingVehicleIdRef = useRef<number | null>(null);
  const downPointRef = useRef<{ x: number; y: number } | null>(null);

  // ✅ Blockiert “click” direkt nach Drag-Ende
  const dragJustEndedRef = useRef(false);

  // ✅ letzte Drag-Position
  const lastDragLngLatRef = useRef<maplibregl.LngLat | null>(null);

  // ✅ merkt sich ob gerade "im Radius" (für Feature-State toggling)
  const inSnapRadiusRef = useRef(false);

  // Legacy start points (falls snapTargets nicht übergeben wurde)
  const legacyStartPoints = useMemo(() => {
    return roads
      .map((r: any) => (r as any).points?.[0] ?? (r as any).path?.[0])
      .filter(Boolean)
      // dein altes Format war [lat,lon] -> wir machen LngLat(lon,lat)
      .map(([lat, lon]: [number, number]) => new maplibregl.LngLat(lon, lat));
  }, [roads]);

  const targets = useMemo(() => {
    return snapTargets && snapTargets.length > 0 ? snapTargets : legacyStartPoints;
  }, [snapTargets, legacyStartPoints]);

  // ✅ robust: layer/source wird lazy gesichert (auch wenn MapContainer es mal nicht rechtzeitig macht)
  const ensurePreviewReady = () => {
    if (!map) return false;
    try {
      ensureSnapPreviewLayer(map);
      return true;
    } catch {
      return false;
    }
  };

  const setStartRadiusActive = (active: boolean) => {
    if (!map) return;

    if (inSnapRadiusRef.current === active) return;
    inSnapRadiusRef.current = active;

    try {
      // ✅ setzt FeatureState für start-radius (routeLayer.ts)
      // id muss genau "start-radius" sein.
      map.setFeatureState({ source: ROUTE_SOURCE_ID, id: "start-radius" }, { active });
    } catch {
      // Source/Layers evtl. noch nicht ready -> ignorieren
    }
  };

  const findBestTargetWithinRadius = (lngLat: maplibregl.LngLat) => {
    if (!map) return null;
    if (!targets || targets.length === 0) return null;

    const pLast = map.project(lngLat);

    let best: { lng: number; lat: number; dist: number } | null = null;

    for (const ll of targets) {
      const p = map.project(ll);
      const d = Math.hypot(p.x - pLast.x, p.y - pLast.y);

      if (d <= snapRadiusPx && (!best || d < best.dist)) {
        best = { lng: ll.lng, lat: ll.lat, dist: d };
      }
    }

    return best;
  };

  /**
   * Diese Funktion hängst du an marker element pointerdown.
   * Marker stoppt propagation bereits im vehiclemarkers.ts.
   */
  const onMarkerPointerDown = (vehicleId: number, ev: PointerEvent) => {
    if (!map) return;
    if (disabled) return;
    if (ev.button !== 0) return; // Linksklick

    pendingVehicleIdRef.current = vehicleId;
    draggingVehicleIdRef.current = null;
    downPointRef.current = { x: ev.clientX, y: ev.clientY };
    lastDragLngLatRef.current = null;

    // ✅ ensure preview layer exists before we try to set it
    ensurePreviewReady();

    // reset visuals at drag start
    setSnapPreview(map, null);
    setStartRadiusActive(false);

    map.getCanvas().style.cursor = "grabbing";
    try {
      map.dragPan.disable();
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!map) return;

    // ensure once when map is available
    ensurePreviewReady();

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (disabled) return;

      const pendingId = pendingVehicleIdRef.current;
      if (pendingId == null) return;

      // Schwelle checken: Drag startet erst nach px-threshold
      if (draggingVehicleIdRef.current == null) {
        const down = downPointRef.current;
        if (!down) return;

        const dx = (e.originalEvent as any)?.clientX - down.x;
        const dy = (e.originalEvent as any)?.clientY - down.y;

        if (Number.isFinite(dx) && Number.isFinite(dy)) {
          if (Math.hypot(dx, dy) < dragThresholdPx) return;
        } else {
          // fallback: wenn keine client coords (rare), starte direkt
        }

        draggingVehicleIdRef.current = pendingId;
      }

      const id = draggingVehicleIdRef.current;
      if (id == null) return;

      // ✅ während Drag: Fahrzeug folgt Maus (kein Snap hier)
      lastDragLngLatRef.current = e.lngLat;
      onVehicleMoved(id, e.lngLat.lat, e.lngLat.lng);

      // ✅ Preview layer sichern bevor wir sie benutzen
      if (!ensurePreviewReady()) return;

      // ✅ nur Vorschau + Radius highlight, wenn im Snap-Radius
      const best = findBestTargetWithinRadius(e.lngLat);

      if (best) {
        setSnapPreview(map, [best.lng, best.lat]);
        setStartRadiusActive(true);
      } else {
        setSnapPreview(map, null);
        setStartRadiusActive(false);
      }
    };

    const endDrag = () => {
      const hadPending = pendingVehicleIdRef.current != null;
      const id = draggingVehicleIdRef.current;
      const wasDragging = id != null;

      if (!hadPending && !wasDragging) return;

      // ✅ Snap nur beim Loslassen UND nur wenn wirklich gezogen wurde
      const last = lastDragLngLatRef.current;
      if (id != null && last) {
        const best = findBestTargetWithinRadius(last);
        if (best) {
          onVehicleMoved(id, best.lat, best.lng);
        }
      }

      // cleanup
      draggingVehicleIdRef.current = null;
      pendingVehicleIdRef.current = null;
      downPointRef.current = null;
      lastDragLngLatRef.current = null;

      if (wasDragging) {
        dragJustEndedRef.current = true;
        setTimeout(() => {
          dragJustEndedRef.current = false;
        }, 0);
      }

      // visuals off (safe)
      if (ensurePreviewReady()) {
        setSnapPreview(map, null);
      }
      setStartRadiusActive(false);

      map.getCanvas().style.cursor = "";
      try {
        map.dragPan.enable();
      } catch {
        // ignore
      }
    };

    map.on("mousemove", onMouseMove);
    map.on("pointerup", endDrag as any);
    window.addEventListener("pointerup", endDrag as any);

    return () => {
      map.off("mousemove", onMouseMove);
      map.off("pointerup", endDrag as any);
      window.removeEventListener("pointerup", endDrag as any);

      // safety cleanup
      try {
        if (ensurePreviewReady()) setSnapPreview(map, null);
      } catch {
        // ignore
      }
      setStartRadiusActive(false);
    };
  }, [map, disabled, onVehicleMoved, targets, dragThresholdPx, snapRadiusPx]);

  return {
    onMarkerPointerDown,
    dragJustEndedRef,
    draggingVehicleIdRef,
  };
}
