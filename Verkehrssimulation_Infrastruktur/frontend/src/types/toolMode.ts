// frontend/src/types/toolMode.ts
export const TOOL_MODES = [
  "SELECT",
  "ADD_VEHICLE",
  "DRAW_ROUTE", // später ggf. ersetzen durch Routing-Tools
  "ADD_TRAFFIC_LIGHT",
  "PICK_ROUTE_START",
  "PICK_ROUTE_END",
] as const;

export type ToolMode = (typeof TOOL_MODES)[number];

// Optional (sehr praktisch in UI/Map logic)
export const isRoutePickMode = (m: ToolMode) => m === "PICK_ROUTE_START" || m === "PICK_ROUTE_END";
export const isAddMode = (m: ToolMode) => m === "ADD_VEHICLE" || m === "ADD_TRAFFIC_LIGHT";
