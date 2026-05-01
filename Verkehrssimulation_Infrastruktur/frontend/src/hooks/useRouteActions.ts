// frontend/src/hooks/useRouteActions.ts
import { useCallback } from "react";

type LngLat = [number, number];

type Args = {
  selectedVehicleId: number | null;
  setVehicles: React.Dispatch<React.SetStateAction<any[]>>;

  // optional Status
  setStatusText?: (s: string) => void;
};

export function useRouteActions({ selectedVehicleId, setVehicles, setStatusText }: Args) {
  /**
   * ✅ snappt das aktuell ausgewählte Fahrzeug auf einen gegebenen Punkt (z.B. gesnappter Start)
   */
  const snapSelectedVehicleToPoint = useCallback(
    (point: LngLat | null) => {
      if (!point) return;
      if (selectedVehicleId == null) {
        setStatusText?.("ℹ️ Kein Fahrzeug ausgewählt.");
        return;
      }

      const [lng, lat] = point;

      setVehicles((prev) =>
        prev.map((v) => (v.id === selectedVehicleId ? { ...v, lat, lon: lng } : v))
      );

      setStatusText?.("✅ Fahrzeug auf Start gesnappt.");
    },
    [selectedVehicleId, setVehicles, setStatusText]
  );

  return { snapSelectedVehicleToPoint };
}
