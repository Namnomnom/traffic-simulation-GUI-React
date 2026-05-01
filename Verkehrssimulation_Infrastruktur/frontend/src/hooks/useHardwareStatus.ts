// frontend/src/hooks/useHardwareStatus.ts
import { useEffect, useState } from "react";

export type HardwareStatus = {
  enabled: boolean;
  connected: boolean;
  endpoint: string | null;
  last_error: string | null;
};

export function useHardwareStatus(apiBase?: string, pollMs = 2000, enabled = true) {
  const base =
    apiBase ?? (import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api");

  const [status, setStatus] = useState<HardwareStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);

  useEffect(() => {
    // ✅ Disabled = komplett ruhig (keine Requests)
    if (!enabled) {
      setLoading(false);
      setStatus(null);
      return;
    }

    let alive = true;
    let timer: number | undefined;
    let first = true;

    async function fetchStatus() {
      try {
        // ✅ Loading nur beim allerersten Fetch => kein Flimmern
        if (first) setLoading(true);

        const res = await fetch(`${base}/hardware/status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = (await res.json()) as HardwareStatus;
        if (alive) setStatus(data);
      } catch (e) {
        if (alive) {
          setStatus({
            enabled: false,
            connected: false,
            endpoint: null,
            last_error: String(e),
          });
        }
      } finally {
        if (alive && first) setLoading(false);
        first = false;
      }
    }

    fetchStatus();

    // ✅ Polling nur, wenn pollMs > 0
    if (pollMs > 0) {
      timer = window.setInterval(fetchStatus, pollMs);
    }

    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, [base, pollMs, enabled]);

  return { status, loading };
}
