// frontend/src/types/roads.ts
import type { RoadSegment } from "./simTypes";

export function roadsToGeoJSON(roads: RoadSegment[]) {
  return {
    type: "FeatureCollection",
    features: roads.map((road) => ({
      type: "Feature" as const,
      properties: {
        id: road.id,
        roadType: road.roadType ?? "city",
      },
      geometry: {
        type: "LineString" as const,
        // [lat, lon] → [lon, lat]
        coordinates: road.points.map(([lat, lon]) => [lon, lat]),
      },
    })),
  };
}
