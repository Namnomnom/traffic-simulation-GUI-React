// frontend/src/lib/scenarioLocal.ts
import type { Vehicle, LngLat } from "../types/simTypes";
import type { SidebarState } from "../types/uiState";
import { makeVehicleSidebarItem, makeEmptyRoute } from "../types/uiState";

export type StoredVehicleRoute = {
  start: LngLat | null;
  end: LngLat | null;
  points: LngLat[] | null;
};

export type ScenarioPayloadV1 = {
  // Kern
  vehicles: Vehicle[];
  routesByVehicle: Record<number, StoredVehicleRoute>;

  // UI
  sidebar: SidebarState;

  // Optional global sim settings
  sim?: {
    simSpeed?: 0.5 | 1 | 2 | 5;
  };

  // Optional: falls du später TrafficLights/Roads etc. speicherst
  trafficLights?: any[];
  roads?: any[];
};

function clampSimSpeed(x: any): 0.5 | 1 | 2 | 5 {
  if (x === 0.5 || x === 1 || x === 2 || x === 5) return x;
  return 1;
}

/**
 * Export: baut ein robustes Payload aus aktuellem State.
 * - sidebar.items wird notfalls aus vehicles abgeleitet, falls leer/kaputt
 * - routesByVehicle wird normalisiert
 */
export function exportCurrentScenarioPayload(args: {
  vehicles: Vehicle[];
  routesByVehicle: Record<number, StoredVehicleRoute>;
  sidebar: SidebarState;
  simSpeed?: 0.5 | 1 | 2 | 5;
  trafficLights?: any[];
  roads?: any[];
}): ScenarioPayloadV1 {
  const { vehicles, routesByVehicle, sidebar, simSpeed, trafficLights, roads } = args;

  // routes normalisieren (nur erlaubte Felder)
  const cleanRoutes: Record<number, StoredVehicleRoute> = {};
  for (const v of vehicles) {
    const r = routesByVehicle[v.id] ?? makeEmptyRoute();
    cleanRoutes[v.id] = {
      start: r.start ?? null,
      end: r.end ?? null,
      points: Array.isArray(r.points) ? r.points : null,
    };
  }

  // sidebar.items sicherstellen (falls leer: ableiten)
  const safeItems =
    Array.isArray(sidebar.items) && sidebar.items.length > 0
      ? sidebar.items
      : vehicles.map((v) => ({
          ...makeVehicleSidebarItem({ id: v.id, type: v.type }),
          route: cleanRoutes[v.id] ?? makeEmptyRoute(),
        }));

  const safeSidebar: SidebarState = {
    ...sidebar,
    items: safeItems,
    selectedVehicleId: sidebar.selectedVehicleId ?? (vehicles[0]?.id ?? null),
    toolMode: sidebar.toolMode ?? "SELECT",
    visibility: sidebar.visibility ?? {
      showNetwork: true,
      showIntersections: true,
      showTrafficLights: true,
      showVehicles: true,
    },
    maxVehicles: sidebar.maxVehicles ?? 5,
  };

  return {
    vehicles,
    routesByVehicle: cleanRoutes,
    sidebar: safeSidebar,
    sim: { simSpeed: simSpeed ?? 1 },
    trafficLights: trafficLights ?? [],
    roads: roads ?? [],
  };
}

/**
 * Import: wendet Payload auf State an (vehicles/routes/sidebar/simSpeed).
 * Setzt sinnvolle Defaults, wenn Felder fehlen.
 */
export function applyScenarioPayload(args: {
  payload: any;
  setVehicles: (v: Vehicle[] | ((prev: Vehicle[]) => Vehicle[])) => void;
  setRoutesByVehicle: (
    v: Record<number, StoredVehicleRoute> | ((prev: Record<number, StoredVehicleRoute>) => Record<number, StoredVehicleRoute>)
  ) => void;
  setSidebar: (v: SidebarState | ((prev: SidebarState) => SidebarState)) => void;
  setSimSpeed?: (v: 0.5 | 1 | 2 | 5) => void;
}) {
  const { payload, setVehicles, setRoutesByVehicle, setSidebar, setSimSpeed } = args;

  const vehicles: Vehicle[] = Array.isArray(payload?.vehicles) ? payload.vehicles : [];
  const routesByVehicle: Record<number, StoredVehicleRoute> =
    payload?.routesByVehicle && typeof payload.routesByVehicle === "object" ? payload.routesByVehicle : {};

  const sidebar: SidebarState | null =
    payload?.sidebar && typeof payload.sidebar === "object" ? (payload.sidebar as SidebarState) : null;

  // 1) vehicles setzen
  setVehicles(vehicles);

  // 2) routes normalisieren (nur ids aus vehicles)
  const cleanRoutes: Record<number, StoredVehicleRoute> = {};
  for (const v of vehicles) {
    const r = routesByVehicle[v.id];
    cleanRoutes[v.id] = {
      start: r?.start ?? null,
      end: r?.end ?? null,
      points: Array.isArray(r?.points) ? r.points : null,
    };
  }
  setRoutesByVehicle(cleanRoutes);

  // 3) sidebar setzen + items/route fixen
  setSidebar((prev) => {
    const base: SidebarState =
      sidebar ??
      ({
        visibility: prev.visibility ?? {
          showNetwork: true,
          showIntersections: true,
          showTrafficLights: true,
          showVehicles: true,
        },
        maxVehicles: prev.maxVehicles ?? 5,
        selectedVehicleId: vehicles[0]?.id ?? null,
        items: [],
        toolMode: "SELECT",
      } as SidebarState);

    // items sichern & mit routes befüllen
    const items =
      Array.isArray(base.items) && base.items.length > 0
        ? base.items
        : vehicles.map((v) => makeVehicleSidebarItem({ id: v.id, type: v.type }));

    const itemsWithRoutes = items.map((it) => ({
      ...it,
      route: cleanRoutes[it.id] ?? makeEmptyRoute(),
    }));

    return {
      ...base,
      items: itemsWithRoutes,
      selectedVehicleId: base.selectedVehicleId ?? (vehicles[0]?.id ?? null),
      toolMode: base.toolMode ?? "SELECT",
      visibility: base.visibility ?? prev.visibility,
      maxVehicles: base.maxVehicles ?? prev.maxVehicles ?? 5,
    };
  });

  // 4) simSpeed (optional)
  const speed = clampSimSpeed(payload?.sim?.simSpeed);
  setSimSpeed?.(speed);
}
