// frontend/src/lib/routing/osrm.ts
import type { LngLat } from "../../types/simTypes";

// ✅ OSRM (Docker lokal, kein Rate Limit)
export const OSRM_BASE = "http://localhost:5000";

export async function osrmNearest(lng: number, lat: number): Promise<LngLat> {
  const url = `${OSRM_BASE}/nearest/v1/driving/${lng},${lat}?number=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("OSRM nearest failed");
  const data = await res.json();
  const loc = data?.waypoints?.[0]?.location; // [lng, lat]
  if (!loc || loc.length < 2) throw new Error("OSRM nearest: no waypoint");
  return [loc[0], loc[1]];
}

export async function osrmRoute(start: LngLat, end: LngLat): Promise<LngLat[]> {
  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${start[0]},${start[1]};${end[0]},${end[1]}` +
    `?overview=full&geometries=geojson&steps=false`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("OSRM route failed");
  const data = await res.json();

  const coords = data?.routes?.[0]?.geometry?.coordinates; // [[lng,lat],...]
  if (!coords || coords.length < 2) throw new Error("OSRM route: no geometry");
  return coords as LngLat[];
}
