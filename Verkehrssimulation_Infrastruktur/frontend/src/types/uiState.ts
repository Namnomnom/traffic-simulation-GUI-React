// frontend/src/types/uiState.ts
import type { LngLat, VehicleType } from "./simTypes";

/**
 * Tool / Mode, was der User gerade macht.
 * (Passe die Strings an deine bestehenden toolMode-Strings an, falls nötig.)
 */
export type ToolMode =
  | "SELECT"
  | "ADD_VEHICLE"
  | "ADD_TRAFFIC_LIGHT"
  | "PICK_ROUTE_START"
  | "PICK_ROUTE_END";

/**
 * Route-Status pro Fahrzeug.
 * - none: gar nichts gesetzt
 * - start: Start gesetzt
 * - start_end: Start+Ziel gesetzt
 * - ready: Route berechnet (Polyline vorhanden)
 */
export type RouteStatus = "none" | "start" | "start_end" | "ready";

/**
 * Pro Fahrzeug speichern wir die Route separat.
 * (Wenn du später mehrere Alternativen willst, kannst du hier erweitern.)
 */
export type VehicleRoute = {
  start: LngLat | null;
  end: LngLat | null;
  points: LngLat[] | null; // die Polyline vom OSRM
};

/**
 * Optional: UI-Status fürs Fahrzeug in der Sidebar
 * (z.B. "fährt", "pausiert", "bereit").
 */
export type VehicleUiStatus = "idle" | "ready" | "driving" | "paused";

/**
 * Sidebar-Viewmodell pro Fahrzeug.
 * Das ist NICHT dein physisches Vehicle aus simTypes,
 * sondern nur das, was die Sidebar wissen muss.
 */
export type VehicleSidebarItem = {
  id: number;
  label: string; // z.B. "Fahrzeug #1"
  type: VehicleType;

  // Route pro Fahrzeug
  route: VehicleRoute;

  // Statusanzeige in der Liste (optional, aber sehr hilfreich)
  uiStatus: VehicleUiStatus;
};

export type ScenarioVisibility = {
  showNetwork: boolean;
  showIntersections: boolean;
  showTrafficLights: boolean;
  showVehicles: boolean;
};

/**
 * Alles, was die Sidebar (und die UI drumherum) steuert:
 * - Sichtbarkeiten (Layer)
 * - Fahrzeugliste (für Anzeige + Auswahl)
 * - Routenbearbeitung pro ausgewähltem Fahrzeug
 * - Limits / Counts
 */
export type SidebarState = {
  visibility: ScenarioVisibility;

  // Fahrzeuge
  maxVehicles: number;
  selectedVehicleId: number | null;

  // "Sidebar-Items" (UI-relevant). Kann später aus deinem vehicles[] abgeleitet werden,
  // oder du nutzt es als Source-of-truth (ich empfehle: später ableiten).
  items: VehicleSidebarItem[];

  // Route-Editor (globaler UI-Mode, aber Route gehört zum selectedVehicleId)
  toolMode: ToolMode;

  // optional: kurze Statusmeldung (Snackbar/Text oben)
  statusText?: string;
};

/**
 * Helper: RouteStatus automatisch aus VehicleRoute ableiten.
 */
export function getRouteStatus(route: VehicleRoute): RouteStatus {
  if (route.points && route.points.length >= 2) return "ready";
  if (route.start && route.end) return "start_end";
  if (route.start) return "start";
  return "none";
}

/**
 * Helper: Standard-Route für neue Fahrzeuge
 */
export function makeEmptyRoute(): VehicleRoute {
  return { start: null, end: null, points: null };
}

/**
 * Helper: Standard-SidebarItem für neues Fahrzeug
 */
export function makeVehicleSidebarItem(args: { id: number; type: VehicleType }): VehicleSidebarItem {
  return {
    id: args.id,
    label: `Fahrzeug #${args.id}`,
    type: args.type,
    route: makeEmptyRoute(),
    uiStatus: "idle",
  };
}
