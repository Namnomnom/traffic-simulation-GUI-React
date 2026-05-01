// frontend/src/lib/intersectionManager.ts
type Lock = { vehicleId: number; untilMs: number };

const locks = new Map<string, Lock>(); // key: intersectionId

export function canEnter(intersectionId: string, vehicleId: number, nowMs: number) {
  const lock = locks.get(intersectionId);
  if (!lock) return true;
  if (lock.untilMs <= nowMs) { locks.delete(intersectionId); return true; }
  return lock.vehicleId === vehicleId; // schon meiner
}

export function lockIntersection(intersectionId: string, vehicleId: number, nowMs: number, ttlMs: number) {
  locks.set(intersectionId, { vehicleId, untilMs: nowMs + ttlMs });
}

export function unlockIntersection(intersectionId: string, vehicleId: number) {
  const lock = locks.get(intersectionId);
  if (lock?.vehicleId === vehicleId) locks.delete(intersectionId);
}
