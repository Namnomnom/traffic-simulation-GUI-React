// frontend/src/components/Map/markers/vehiclemarkers.ts
import maplibregl from "maplibre-gl";
import type { Vehicle } from "../../../types/simTypes";

type LngLat = [number, number];

// MapContainer hatte Record<number, Marker>. Das lassen wir kompatibel.
export type MarkerMap = Record<number, maplibregl.Marker>;

function baseColorForType(type: Vehicle["type"]): string {
  switch (type) {
    case "pkw":
      return "#2563eb";
    case "lkw":
      return "#f97316";
    case "bus":
      return "#7c3aed";
    case "motorrad":
      return "#16a34a";
    default:
      return "#16a34a";
  }
}

function emojiForType(type: Vehicle["type"]): string {
  switch (type) {
    case "pkw":
      return "🚗";
    case "lkw":
      return "🚚";
    case "bus":
      return "🚌";
    case "motorrad":
      return "🏍️";
    default:
      return "🚘";
  }
}

function makeVehicleEl(
  v: Vehicle,
  selected: boolean,
  draggable: boolean,
  onSelect?: (id: number) => void,
  onPointerDown?: (id: number, ev: PointerEvent) => void
): HTMLElement {
  const el = document.createElement("div");
  el.className = "vehicle-marker";

  const baseColor = baseColorForType(v.type);

  el.style.width = "26px";
  el.style.height = "26px";
  el.style.borderRadius = "9999px";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.backgroundColor = "#ffffff";
  el.style.boxShadow = "0 0 4px rgba(0,0,0,0.35)";
  el.style.cursor = draggable ? "grab" : "pointer";
  el.style.userSelect = "none";
  el.style.touchAction = "none";
  el.style.border = selected ? "3px solid #000000" : `2px solid ${baseColor}`;

  const span = document.createElement("span");
  span.style.fontSize = "16px";
  span.textContent = emojiForType(v.type);
  el.appendChild(span);

  // Click => select (stopPropagation damit map click nicht feuert)
  if (onSelect) {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(v.id);
    });
  }

  // Pointerdown => Drag start / instant selection
  if (onPointerDown) {
    el.addEventListener("pointerdown", (e) => {
      // nur Linksklick
      const ev = e as PointerEvent;
      if (ev.button !== 0) return;
      ev.stopPropagation();
      onPointerDown(v.id, ev);
    });
  }

  return el;
}

function updateVehicleEl(el: HTMLElement, v: Vehicle, selected: boolean, draggable: boolean) {
  const baseColor = baseColorForType(v.type);

  el.style.cursor = draggable ? "grab" : "pointer";
  el.style.border = selected ? "3px solid #000000" : `2px solid ${baseColor}`;

  const span = el.querySelector("span");
  if (span) {
    span.textContent = emojiForType(v.type);
  }
}

type SyncVehicleMarkersArgs = {
  map: maplibregl.Map;
  vehicles: Vehicle[];
  selectedVehicleId: number | null;
  markers: MarkerMap;

  // optional callbacks
  onSelect?: (id: number) => void;

  /**
   * Optional: Drag handling.
   * Wird vom Marker weitergereicht, aber die eigentliche Drag-Logik
   * macht später useVehicleDrag.ts.
   */
  onPointerDown?: (id: number, ev: PointerEvent) => void;

  /**
   * Wenn true, Marker sollen nicht draggable sein (z.B. während Zeichnen).
   * Default: false
   */
  disableDrag?: boolean;
};

export function syncVehicleMarkers({
  map,
  vehicles,
  selectedVehicleId,
  markers,
  onSelect,
  onPointerDown,
  disableDrag = false,
}: SyncVehicleMarkersArgs) {
  const wantedIds = new Set(vehicles.map((v) => v.id));

  // 1) Entfernen
  Object.keys(markers).forEach((idStr) => {
    const id = Number(idStr);
    if (!wantedIds.has(id)) {
      markers[id].remove();
      delete markers[id];
    }
  });

  // 2) Add / Update
  for (const v of vehicles) {
    const isSelected = v.id === selectedVehicleId;
    const draggable = !!onPointerDown && !disableDrag;

    const existing = markers[v.id];

    if (!existing) {
      const el = makeVehicleEl(v, isSelected, draggable, onSelect, onPointerDown);

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([v.lon, v.lat] as LngLat)
        .addTo(map);

      markers[v.id] = marker;
    } else {
      // element style aktualisieren
      const el = existing.getElement() as HTMLElement;
      updateVehicleEl(el, v, isSelected, draggable);

      // position aktualisieren
      existing.setLngLat([v.lon, v.lat] as LngLat);
    }
  }
}

/**
 * Optional helper: alles entfernen (z.B. bei Map unmount)
 */
export function removeAllVehicleMarkers(markers: MarkerMap) {
  Object.values(markers).forEach((m) => m.remove());
  for (const k of Object.keys(markers)) delete markers[Number(k)];
}
