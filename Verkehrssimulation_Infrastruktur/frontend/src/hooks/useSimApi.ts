// frontend/src/hooks/useSimApi.ts
import { useCallback, useMemo } from "react";

type SimEndpoint = "start" | "stop";

type UseSimApiArgs = {
  /** optional override, otherwise VITE_API_BASE or default */
  apiBase?: string;

  /** called before request starts */
  onBusyChange?: (busy: boolean) => void;

  /** set a status message in UI */
  onStatus?: (text: string | null) => void;

  /** optional error handler */
  onError?: (err: unknown) => void;
};

export function useSimApi({
  apiBase,
  onBusyChange,
  onStatus,
  onError,
}: UseSimApiArgs = {}) {
  const API_BASE = useMemo(() => {
    return apiBase ?? (import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api");
  }, [apiBase]);

  const callSim = useCallback(
    async (endpoint: SimEndpoint) => {
      try {
        onBusyChange?.(true);
        onStatus?.(null);

        const res = await fetch(`${API_BASE}/sim/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: { status?: string } = await res.json().catch(() => ({}));
        onStatus?.(
          endpoint === "start"
            ? `Simulation gestartet (${data.status ?? "ok"})`
            : `Simulation gestoppt (${data.status ?? "ok"})`
        );
      } catch (err) {
        console.error(err);
        onError?.(err);
        onStatus?.("Fehler beim Steuern der Simulation 😢");
      } finally {
        onBusyChange?.(false);
      }
    },
    [API_BASE, onBusyChange, onStatus, onError]
  );

  const startSim = useCallback(() => callSim("start"), [callSim]);
  const stopSim = useCallback(() => callSim("stop"), [callSim]);

  return {
    API_BASE,
    callSim,
    startSim,
    stopSim,
  };
}
