// frontend/src/components/Map/DrawTool.tsx
import type React from "react";

type LngLat = [number, number];

type LineStringFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: LngLat[] };
    properties: Record<string, unknown>;
  }>;
};

type DrawToolProps = {
  isDrawing: boolean;
  setIsDrawing: React.Dispatch<React.SetStateAction<boolean>>;

  coords: LngLat[];
  setCoords: React.Dispatch<React.SetStateAction<LngLat[]>>;

  onRoadFinished?: (pointsLatLon: [number, number][]) => void; // [lat, lon]
  onClose?: () => void;

  mapLoaded?: boolean;
};

export default function DrawTool({
  isDrawing,
  setIsDrawing,
  coords,
  setCoords,
  onRoadFinished,
  onClose,
  mapLoaded,
}: DrawToolProps) {
  const toggleDrawing = () => {
    if (isDrawing) {
      if (coords.length >= 2) {
        const latLonPoints: [number, number][] = coords.map(([lng, lat]) => [lat, lng]);
        onRoadFinished?.(latLonPoints);
      }
      setCoords([]);
      setIsDrawing(false);
    } else {
      setCoords([]);
      setIsDrawing(true);
    }
  };

  const undoLastPoint = () => setCoords((prev) => prev.slice(0, -1));
  const clearAll = () => setCoords([]);

  const exportGeoJSON = () => {
    const geojson: LineStringFeatureCollection =
      coords.length > 1
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: coords },
              },
            ],
          }
        : { type: "FeatureCollection", features: [] };

    const dataStr =
      "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojson, null, 2));

    const a = document.createElement("a");
    a.href = dataStr;
    a.download = "drawn_street.geojson";
    a.click();
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 1,
        backgroundColor: "white",
        padding: "8px 10px",
        borderRadius: 8,
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 200,
        fontSize: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <strong>Routenzeichner</strong>

        <button
          onClick={() => onClose?.()}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 16,
            cursor: "pointer",
            padding: 0,
            lineHeight: "14px",
          }}
          title="Panel schließen"
        >
          ✖
        </button>
      </div>

      <button onClick={toggleDrawing}>
        {isDrawing ? "Zeichnen beenden & speichern" : "Zeichnen starten"}
      </button>

      <button onClick={undoLastPoint} disabled={coords.length === 0}>
        Letzten Punkt entfernen
      </button>

      <button onClick={clearAll} disabled={coords.length === 0}>
        Aktuelle Linie löschen
      </button>

      <button onClick={exportGeoJSON} disabled={coords.length < 2}>
        Aktuelle Linie als GeoJSON
      </button>

      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.4 }}>
        <strong>Anleitung</strong>
        <ol style={{ paddingLeft: 16, margin: "4px 0" }}>
          <li>„Zeichnen starten“ drücken.</li>
          <li>
            Mit <b>Linksklick</b> einen Startpunkt in der Karte setzen.
          </li>
          <li>Weitere Klicks fügen Punkte zur Straße hinzu.</li>
          <li>Zum Abschluss „Zeichnen beenden &amp; speichern“ drücken.</li>
        </ol>

        <div style={{ marginTop: 4 }}>
          Status:{" "}
          {isDrawing
            ? "Zeichnen aktiv – Punkte in der Karte setzen."
            : "inaktiv – zum Starten oben auf „Zeichnen starten“ klicken."}
        </div>

        <div>Punkte in aktueller Linie: {coords.length}</div>
        {typeof mapLoaded === "boolean" && (
          <div>Map Status: {mapLoaded ? "geladen" : "lädt..."}</div>
        )}
      </div>
    </div>
  );
}
