// frontend/src/hooks/useIntersectionActions.ts
import { useCallback } from "react";
import type { RoadSegment } from "../types/simTypes";
import type { IntersectionVisual } from "../lib/intersectionsToGeoJSON";

export type LngLat = [number, number]; // [lng, lat]

type Params = {
  roads: RoadSegment[];
  snapToRoad: boolean;

  intersections: IntersectionVisual[];
  setIntersections: React.Dispatch<React.SetStateAction<IntersectionVisual[]>>;

  setSelectedIntersectionId?: React.Dispatch<React.SetStateAction<string | null>>;
  setStatusText?: React.Dispatch<React.SetStateAction<string | null>>;
};

// ----------------- constants -----------------
const MAX_ROAD_SNAP_DIST_M = 80;
const BEARING_SNAP_THRESHOLD_DEG = 25;

const GREEN_MIN_SEC = 1;
const GREEN_MAX_SEC = 300;

// Single-Schaltgruppe (UI: Gruppe1..Gruppe6)
type SingleGroupId = "Gruppe1" | "Gruppe2" | "Gruppe3" | "Gruppe4" | "Gruppe5" | "Gruppe6";

function normalizeSingleGroupId(v: unknown): SingleGroupId {
  const s = String(v ?? "").trim();
  if (s === "Gruppe1" || s === "Gruppe2" || s === "Gruppe3" || s === "Gruppe4" || s === "Gruppe5" || s === "Gruppe6")
    return s;
  return "Gruppe1";
}

// ----------------- helpers -----------------
function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? Math.round(n) : min;
  return Math.max(min, Math.min(max, x));
}

function clampBearing(b: number) {
  const x = Math.round(b) % 360;
  return x < 0 ? x + 360 : x;
}

function angleDiffDeg(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function bearingBetween(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;

  const toRad = (x: number) => (x * Math.PI) / 180;
  const toDeg = (x: number) => (x * 180) / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return clampBearing(toDeg(Math.atan2(y, x)));
}

function distMeters(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;

  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;

  const x = toRad(lng2 - lng1) * Math.cos(toRad((lat1 + lat2) / 2));
  const y = toRad(lat2 - lat1);
  return Math.sqrt(x * x + y * y) * R;
}

/** nearest bearing of any road segment near p; null if too far */
function nearestRoadBearing(roads: RoadSegment[], p: LngLat): number | null {
  let bestDist = Infinity;
  let bestBearing: number | null = null;

  for (const r of roads) {
    const pts = r.points as unknown as LngLat[];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];

      // cheap distance proxy (endpoints) – good enough for snapping UI
      const d = Math.min(distMeters(p, a), distMeters(p, b));
      if (d < bestDist) {
        bestDist = d;
        bestBearing = bearingBetween(a, b);
      }
    }
  }

  if (bestBearing == null) return null;
  if (bestDist > MAX_ROAD_SNAP_DIST_M) return null;
  return bestBearing;
}

function snapBearingToRoad(desired: number, roadBearing: number, thresholdDeg = BEARING_SNAP_THRESHOLD_DEG) {
  const d = clampBearing(desired);
  const c1 = clampBearing(roadBearing);
  const c2 = clampBearing(roadBearing + 180);

  const diff1 = angleDiffDeg(d, c1);
  const diff2 = angleDiffDeg(d, c2);

  const best = diff1 <= diff2 ? c1 : c2;
  const bestDiff = Math.min(diff1, diff2);

  return bestDiff > thresholdDeg ? d : best;
}

/** groupId tolerant lesen (neu), fallback: id (alt) */
function getGroupId(itx: unknown): string {
  const k = itx as any;
  return String(k?.groupId ?? k?.id ?? "");
}

/**
 * ✅ Gruppenzugehörigkeit:
 * - primär über groupId
 * - fallback: alte Prefix-Logik (K4-* etc.)
 */
function isInGroup(itx: unknown, groupId: string) {
  const k = itx as any;

  const g = getGroupId(k);
  if (g && g === groupId) return true;

  const id = String(k?.id ?? "");
  return id === groupId || id.startsWith(groupId + "-");
}

function setStatus(setStatusText: Params["setStatusText"], msg: string) {
  // kompatibel zu Dispatch<SetStateAction<string|null>>
  setStatusText?.(() => msg);
}

// -------------------------------------------------------------------

export function useIntersectionActions({
  roads,
  snapToRoad,
  intersections,
  setIntersections,
  setSelectedIntersectionId,
  setStatusText,
}: Params) {
  // ✅ Bearing setzen (auf ganze Gruppe anwenden)
  const setIntersectionBearing = useCallback(
    (groupId: string, desired: number) => {
      const want = clampBearing(desired);

      setIntersections((prev) => {
        // road bearing nur einmal bestimmen (nicht pro item), wenn snapping aktiv
        let roadBearing: number | null = null;

        return prev.map((k: any) => {
          if (!isInGroup(k, groupId)) return k;

          const cur = clampBearing(k.bearing ?? 0);
          let next = want;

          if (snapToRoad) {
            if (roadBearing == null) roadBearing = nearestRoadBearing(roads, k.point as LngLat);
            if (roadBearing != null) next = snapBearingToRoad(want, roadBearing, BEARING_SNAP_THRESHOLD_DEG);
          }

          if (cur === next) return k;
          return { ...k, bearing: next } as IntersectionVisual;
        });
      });
    },
    [roads, snapToRoad, setIntersections]
  );

  const snapIntersectionNow = useCallback(
    (groupId: string) => {
      const base = intersections.find((x: any) => isInGroup(x, groupId)) as any;
      if (!base) return;
      const cur = clampBearing(base?.bearing ?? 0);
      setIntersectionBearing(groupId, cur);
    },
    [intersections, setIntersectionBearing]
  );

  const deleteIntersection = useCallback(
    (groupId: string) => {
      setIntersections((prev) => prev.filter((k: any) => !isInGroup(k, groupId)));
      setSelectedIntersectionId?.((cur) => (cur === groupId ? null : cur));
      setStatus(setStatusText, `🗑 Ampel ${groupId} gelöscht.`);
    },
    [setIntersections, setSelectedIntersectionId, setStatusText]
  );

  // ✅ Gruppe verschieben: bewegt alle Objekte mit gleicher groupId
  const moveIntersectionGroup = useCallback(
    (groupId: string, nextPoint: LngLat) => {
      setIntersections((prev) => {
        const base = prev.find((k: any) => isInGroup(k, groupId)) as any;
        if (!base) return prev;

        const [curLng, curLat] = base.point as LngLat;
        const [nextLng, nextLat] = nextPoint;

        const dLng = nextLng - curLng;
        const dLat = nextLat - curLat;

        if (dLng === 0 && dLat === 0) return prev;

        return prev.map((k: any) => {
          if (!isInGroup(k, groupId)) return k;
          const [lng, lat] = k.point as LngLat;
          return { ...k, point: [lng + dLng, lat + dLat] as LngLat } as IntersectionVisual;
        });
      });
    },
    [setIntersections]
  );

  // ✅ controllerId setzen (nur diese eine Single, nicht Gruppe!)
  const setSingleControllerId = useCallback(
    (intersectionId: string, controllerId: string) => {
      const nextCtrl = controllerId.trim();

      setIntersections((prev) =>
        prev.map((k: any) => {
          if (k.id !== intersectionId) return k;
          if (k.kind !== "single") return k;

          return { ...k, controllerId: nextCtrl.length ? nextCtrl : undefined } as IntersectionVisual;
        })
      );
    },
    [setIntersections]
  );

  // ✅ Single-Schaltgruppe setzen (nur Single, optional auch auf ganze räumliche Gruppe)
  const setSingleGroupId = useCallback(
    (intersectionId: string, group: SingleGroupId) => {
      const nextGroup = normalizeSingleGroupId(group);

      setIntersections((prev) =>
        prev.map((k: any) => {
          if (k.id !== intersectionId) return k;
          if (k.kind !== "single") return k;

          const cur = normalizeSingleGroupId(k.singleGroupId ?? k.singleGroup ?? "Gruppe1");
          if (cur === nextGroup) return k;

          return { ...k, singleGroupId: nextGroup, singleGroup: nextGroup } as IntersectionVisual;
        })
      );

      setStatus(setStatusText, `✅ Schaltgruppe gesetzt: ${nextGroup}`);
    },
    [setIntersections, setStatusText]
  );

  // ✅ Grünzeiten speichern
  // - 4er-LSA: (greenNS, greenEW) auf die Gruppe
  // - Single-LSA: (green, red) auf die gesamte Single-Schaltgruppe (Gruppe1..Gruppe6)
  const setIntersectionGreenTimes = useCallback(
    (groupId: string, a: number, b: number) => {
      setIntersections((prev) => {
        // Basis-Objekt finden (um zu wissen: single oder 4er + welche Single-Schaltgruppe)
        const base = prev.find((k: any) => isInGroup(k, groupId)) as any;
        if (!base) return prev;

        // -------------------------
        // SINGLE: a=green, b=red
        // -------------------------
        if (base.kind === "single") {
          const green = clampInt(a, GREEN_MIN_SEC, GREEN_MAX_SEC);
          const red = clampInt(b, GREEN_MIN_SEC, GREEN_MAX_SEC);

          const targetGroup = normalizeSingleGroupId(base.singleGroupId ?? base.singleGroup ?? "Gruppe1");

          let changed = false;

          const next = prev.map((k: any) => {
            if (k.kind !== "single") return k;

            const g = normalizeSingleGroupId(k.singleGroupId ?? k.singleGroup ?? "Gruppe1");
            if (g !== targetGroup) return k;

            const curG = Number(k.singleGreenSec ?? k.greenSec ?? k.green ?? 10);
            const curR = Number(k.singleRedSec ?? k.redSec ?? k.red ?? 30);

            if (curG === green && curR === red) return k;

            changed = true;
            return {
              ...k,
              singleGreenSec: green,
              singleRedSec: red,
              // optional: auch legacy keys befüllen (falls du sie irgendwo nutzt)
              greenSec: green,
              redSec: red,
            } as IntersectionVisual;
          });

          if (changed) setStatus(setStatusText, `✅ Single-Schaltzeiten gespeichert (${targetGroup}: ${green}s / ${red}s)`);
          return changed ? next : prev;
        }

        // -------------------------
        // 4er: a=NS, b=EW (wie vorher)
        // -------------------------
        const ns = clampInt(a, GREEN_MIN_SEC, GREEN_MAX_SEC);
        const ew = clampInt(b, GREEN_MIN_SEC, GREEN_MAX_SEC);

        let changed = false;

        const next = prev.map((k: any) => {
          if (!isInGroup(k, groupId)) return k;
          if (k.kind === "single") return k;

          const curNS = Number(k.greenA ?? k.greenNS ?? 30);
          const curEW = Number(k.greenB ?? k.greenEW ?? 30);
          if (curNS === ns && curEW === ew) return k;

          changed = true;
          return {
            ...k,
            greenA: ns,
            greenB: ew,
            greenNS: ns,
            greenEW: ew,
          } as IntersectionVisual;
        });

        if (changed) setStatus(setStatusText, `✅ Grünzeiten gespeichert (${ns}s / ${ew}s)`);
        return changed ? next : prev;
      });
    },
    [setIntersections, setStatusText]
  );

  // ✅ Phase togglen (auf ganze Gruppe) — nur für 4er-LSA
  const toggleIntersectionPhase = useCallback(
    (groupId: string) => {
      setIntersections((prev) =>
        prev.map((k: any) => {
          if (!isInGroup(k, groupId)) return k;
          if (k.kind === "single") return k;

          const cur = (k.phase ?? "NS_GREEN") as "NS_GREEN" | "EW_GREEN";
          const next = cur === "NS_GREEN" ? "EW_GREEN" : "NS_GREEN";
          return { ...k, phase: next } as IntersectionVisual;
        })
      );

      setStatus(setStatusText, "🔁 Phase umgeschaltet.");
    },
    [setIntersections, setStatusText]
  );

  return {
    setIntersectionBearing,
    snapIntersectionNow,
    deleteIntersection,
    moveIntersectionGroup,
    setSingleControllerId,
    setSingleGroupId,
    setIntersectionGreenTimes,
    toggleIntersectionPhase,
  };
}
