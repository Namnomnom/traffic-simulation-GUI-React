// frontend/src/components/Map/interactions/useVehicleSelection.ts
import { useCallback, useMemo, useState } from "react";

export type UseVehicleSelectionOptions = {
  /**
   * Wenn du die Selection im Parent/App-State hältst:
   * - selectedVehicleId + onSelectVehicle übergeben (controlled)
   */
  selectedVehicleId?: number | null;
  onSelectVehicle?: (id: number | null) => void;

  /**
   * Wenn du nach einem Drag das direkte "click/select" verhindern willst,
   * gib hier eine ref rein, die kurz true wird (wie dragJustEndedRef).
   */
  dragJustEndedRef?: React.MutableRefObject<boolean>;

  /**
   * Wenn true: klick auf Karte (Hintergrund) setzt selection auf null
   */
  clearOnMapClick?: boolean;
};

export function useVehicleSelection(options: UseVehicleSelectionOptions = {}) {
  const {
    selectedVehicleId: controlledSelected,
    onSelectVehicle,
    dragJustEndedRef,
    clearOnMapClick = false,
  } = options;

  // Uncontrolled fallback
  const [internalSelected, setInternalSelected] = useState<number | null>(null);

  const isControlled = typeof controlledSelected !== "undefined" && !!onSelectVehicle;

  const selectedVehicleId = useMemo(() => {
    return isControlled ? (controlledSelected ?? null) : internalSelected;
  }, [isControlled, controlledSelected, internalSelected]);

  const setSelected = useCallback(
    (id: number | null) => {
      if (isControlled) onSelectVehicle!(id);
      else setInternalSelected(id);
    },
    [isControlled, onSelectVehicle]
  );

  /**
   * Sofort selektieren (für Marker pointerdown)
   */
  const selectVehicle = useCallback(
    (id: number) => {
      // optional: block click direkt nach drag end
      if (dragJustEndedRef?.current) return;
      setSelected(id);
    },
    [dragJustEndedRef, setSelected]
  );

  /**
   * Zum Deselect z.B. wenn man in die Map klickt
   */
  const clearSelection = useCallback(() => {
    if (dragJustEndedRef?.current) return;
    setSelected(null);
  }, [dragJustEndedRef, setSelected]);

  /**
   * Map click handler (optional): wenn clearOnMapClick aktiv, Auswahl entfernen.
   * Wichtig: wird normalerweise VOR dem "vehicle pointerdown" nicht ausgelöst,
   * weil du beim Marker ev.stopPropagation() machst.
   */
  const onMapClick = useCallback(() => {
    if (!clearOnMapClick) return;
    clearSelection();
  }, [clearOnMapClick, clearSelection]);

  return {
    selectedVehicleId,
    selectVehicle,
    clearSelection,
    onMapClick,
    setSelectedVehicleId: setSelected, // falls du es explizit setzen willst
  };
}
