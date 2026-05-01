// frontend/src/types/vehicles.ts
import type { Vehicle } from "./simTypes";

export type VehiclesFeatureProperties = {
  id: number;
  selected: boolean;
  vehicleType: Vehicle["type"];
  positionPhase?: Vehicle["sim"] extends infer S
    ? S extends { positionPhase: infer P }
      ? P
      : never
    : never;
};

export type VehiclesGeoJSON = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: VehiclesFeatureProperties;
    geometry: {
      type: "Point";
      coordinates: [number, number]; // [lon, lat]
    };
  }>;
};

export function vehiclesToGeoJSON(
  vehicles: Vehicle[],
  selectedVehicleId: number | null
): VehiclesGeoJSON {
  return {
    type: "FeatureCollection",
    features: (vehicles ?? []).map((v) => ({
      type: "Feature",
      properties: {
        id: v.id,
        selected: v.id === selectedVehicleId,
        vehicleType: v.type,
        positionPhase: v.sim?.positionPhase,
      },
      geometry: {
        type: "Point",
        coordinates: [v.lon, v.lat],
      },
    })),
  };
}
