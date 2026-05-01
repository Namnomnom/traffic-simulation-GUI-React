// frontend/src/types/simTypes.ts

/* =========================================================
   2) Geo / Core Types
   ========================================================= */

export type LngLat = [lng: number, lat: number]; // MapLibre/GeoJSON Standard

/* =========================================================
   3) Network / Roads (Option A: OSM-Style abstrahiert)
   ========================================================= */

export type RoadType = "city" | "main" | "bus";

/* =========================================================
   4) Vehicles (UI / Domain)
   ========================================================= */

/**
 * VehicleType für Option A (Routing/Google-Maps-Style).
 * Wenn du im UI lieber deutsche Labels willst: mappe in der Sidebar.
 *
 * Beispiel:
 *  labelMap: { car: "PKW", truck: "LKW", bus: "Bus" }
 */
export type VehicleType = "pkw" | "lkw" | "bus" | "motorrad";

/** Optional: falls du deine alten deutschen Typen weiter nutzen willst */
export type VehicleTypeLegacy = "pkw" | "lkw" | "bus" | "motorrad";

/* =========================================================
   5) Intersections / Traffic Lights
   ========================================================= */

export type TurnType = "STRAIGHT" | "LEFT" | "RIGHT" | "UTURN";
export type IntersectionBehavior = "YIELD" | "STOP" | "SIGNAL";

export type TrafficLightState = "RED" | "YELLOW" | "GREEN";

/** Option A Phase für RealLab UI/Logik */
export type PositionPhase = "CRUISE" | "APPROACH" | "INSIDE" | "EXIT";

/* =========================================================
   6) KPIs / Analytics
   ========================================================= */

export type VehicleKpis = {
  /** Optional: Debug/Export */
  startedAtMs?: number;

  /** Zeiten (Sekunden) */
  tripTimeS: number; // inkl. Warten
  moveTimeS: number; // speed > threshold
  waitTimeS: number; // speed <= threshold

  /** Strecken (Meter) */
  distanceTraveledM: number;
  remainingDistanceM: number;

  /** Orientierung (optional fürs UI) */
  headingDeg?: number; // 0..360

  /** Ereignisse */
  stops: number;
};

/** Cache/Meta für Distanzberechnung entlang Route */
export type RouteMeta = {
  segLensM: number[];
  cumM: number[];
  totalM: number;
};

/** Speed-Profil (UI in km/h) */
export type SpeedProfileKmh = {
  cruiseKmh: number;
  approachKmh?: number;
  turnKmh?: number;
};

/** Dynamik-Limits (m/s²) */
export type DynamicsLimits = {
  maxAccelMps2?: number;
  maxBrakeMps2?: number;
};

/* =========================================================
   7) Simulation State (live)
   ========================================================= */

export type VehicleSimState = {
  vehicleId: number;

  // Route / Progress
  route: LngLat[];
  routeIndex: number; // Segmentstart i; Segment ist [i -> i+1]
  segmentProgress: number; // 0..1 innerhalb Segment

  // Kinematik (intern m/s)
  speedMps: number;
  active: boolean;

  // Profile / Limits
  speedProfile: SpeedProfileKmh;
  dynamics?: DynamicsLimits;

  // Option A Phase
  positionPhase: PositionPhase;
  distanceToIntersectionM?: number;

  // RealLab Referenzpunkt / Kreuzung
  intersectionAtM?: number;
  intersectionPoint?: LngLat;

  // optional: Manager/Locks
  intersectionId?: string; // z.B. "K1"
  turnType?: TurnType;
  intersectionBehavior?: IntersectionBehavior;

  // Route Cache
  routeMeta?: RouteMeta;

  // intern: Stop-Übergang
  wasStopped?: boolean;

  // KPIs
  kpis: VehicleKpis;
};

/* =========================================================
   8) Domain Models
   ========================================================= */

export type Vehicle = {
  id: number;

  // Position (WGS84)
  lat: number;
  lon: number;

  // UI cache (optional)
  speedKmh?: number;
  headingDeg?: number;

  type: VehicleType;

  // Route (optional solange Sim nicht läuft)
  routePoints?: LngLat[];

  // Optional: Reverse-Geocode labels
  startStreetLabel?: string;
  endStreetLabel?: string;

  // Sim state (wenn gestartet)
  sim?: VehicleSimState;
};

export type RoadSegment = {
  id: number;
  points: LngLat[];
  roadType: RoadType;
};
