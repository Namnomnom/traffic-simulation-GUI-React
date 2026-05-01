// frontend/src/hooks/useTrafficLightClock.ts
import { useEffect, useMemo, useRef } from "react";

export type SimState = "STOPPED" | "RUNNING" | "PAUSED";

type Params = {
  simState: SimState;
  simTimeSec: number;

  // comes from useGlobalSimulation (preview clock)
  previewTimeSec: number;
  previewTrafficLights: boolean;

  // keep speed in a ref for other hooks (vehicles etc.)
  simSpeed: number;
};

/**
 * Central traffic-light clock for UI + phase logic.
 *
 * Rules (same as in your App.tsx before):
 * - RUNNING -> simTimeSec
 * - else if previewTrafficLights -> previewTimeSec
 * - else -> simTimeSec
 *
 * Also keeps simSpeedRef in sync (handy for vehicle hooks).
 */
export function useTrafficLightClock({
  simState,
  simTimeSec,
  previewTimeSec,
  previewTrafficLights,
  simSpeed,
}: Params) {
  const simSpeedRef = useRef<number>(simSpeed);

  // keep ref in sync
  useEffect(() => {
    simSpeedRef.current = simSpeed;
  }, [simSpeed]);

  const tlClockSec = useMemo(() => {
    return simState === "RUNNING" ? simTimeSec : previewTrafficLights ? previewTimeSec : simTimeSec;
  }, [simState, simTimeSec, previewTrafficLights, previewTimeSec]);

  const clockRunning = simState === "RUNNING" || previewTrafficLights;

  return { tlClockSec, clockRunning, simSpeedRef };
}
