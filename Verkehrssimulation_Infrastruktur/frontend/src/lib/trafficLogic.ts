// frontend/src/lib/trafficLogic.ts
import type { TurnType, VehicleSimState } from "../types/simTypes";
import { headingDeg } from "./geo";

// kleinste Winkeldifferenz in [-180..180]
function angleDeltaDeg(a: number, b: number) {
  return ((b - a + 540) % 360) - 180;
}

export function inferTurnTypeFromRoute(
  state: VehicleSimState
): TurnType | undefined {
  const m = state.intersectionAtM;
  const meta = state.routeMeta;

  if (m == null || !Number.isFinite(m)) return undefined;
  if (!meta || meta.cumM.length < 2) return undefined;

  // Segment finden, in dessen Nähe intersectionAtM liegt
  let seg = -1;
  for (let i = 0; i < meta.cumM.length - 1; i++) {
    if (m >= meta.cumM[i] && m <= meta.cumM[i + 1]) {
      seg = i;
      break;
    }
  }

  // Wir brauchen ein Segment davor und danach
  if (seg <= 0 || seg >= state.route.length - 2) {
    return undefined;
  }

  const hBefore = headingDeg(
    state.route[seg - 1],
    state.route[seg]
  );

  const hAfter = headingDeg(
    state.route[seg],
    state.route[seg + 1]
  );

  const d = angleDeltaDeg(hBefore, hAfter);
  const ad = Math.abs(d);

  if (ad > 160) return "UTURN";
  if (ad < 25) return "STRAIGHT";
  return d > 0 ? "LEFT" : "RIGHT";
}
