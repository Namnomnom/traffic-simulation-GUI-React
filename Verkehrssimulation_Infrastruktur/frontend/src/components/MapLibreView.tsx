// frontend/src/components/MapLibreView.tsx
import type { RefObject } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapLibreView({ containerRef }: { containerRef: RefObject<HTMLDivElement> }) {
  return <div ref={containerRef} className="map-root" />;
}
