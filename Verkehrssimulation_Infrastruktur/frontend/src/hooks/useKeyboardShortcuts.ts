// frontend/src/hooks/useKeyboardShortcuts.ts
import { useEffect } from "react";
import type { IntersectionVisual } from "../lib/intersectionsToGeoJSON";

type LngLat = [number, number];

// --- helpers ---
function clampBearing(b: number) {
  const x = Math.round(b) % 360;
  return x < 0 ? x + 360 : x;
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || (el as any).isContentEditable;
}

function belongsToSelectedGroup(itemId: string, selectedGroupId: string) {
  return itemId === selectedGroupId || itemId.startsWith(selectedGroupId + "-");
}

function getGroupBearing(intersections: IntersectionVisual[], groupId: string) {
  const k = intersections.find((x) => belongsToSelectedGroup(x.id, groupId));
  const raw = (k as any)?.bearing ?? 0;
  return clampBearing(Number(raw) || 0);
}

type UseKeyboardShortcutsArgs = {
  enabled?: boolean;

  // selection
  selectedIntersectionId: string | null;
  setSelectedIntersectionId: (id: string | null) => void;

  // data (needed to read current bearing)
  intersections: IntersectionVisual[];

  // action (your existing group-based bearing setter)
  setIntersectionBearing: (groupId: string, desiredBearing: number) => void;

  // optional config
  rotationStepDeg?: number;
};

export function useKeyboardShortcuts({
  enabled = true,
  selectedIntersectionId,
  setSelectedIntersectionId,
  intersections,
  setIntersectionBearing,
  rotationStepDeg = 10,
}: UseKeyboardShortcutsArgs) {
  // ESC = deselect (always useful)
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") setSelectedIntersectionId(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, setSelectedIntersectionId]);

  // Q/E = rotate selected group
  useEffect(() => {
    if (!enabled) return;
    if (!selectedIntersectionId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();
      if (key !== "q" && key !== "e") return;

      e.preventDefault();

      const delta = key === "q" ? -rotationStepDeg : rotationStepDeg;
      const cur = getGroupBearing(intersections, selectedIntersectionId);
      setIntersectionBearing(selectedIntersectionId, cur + delta);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    selectedIntersectionId,
    intersections,
    setIntersectionBearing,
    rotationStepDeg,
  ]);
}
