// frontend/src/lib/uiFormat.ts
export function headingToCompass(deg?: number) {
  if (deg === undefined || Number.isNaN(deg)) {
    return { label: "–", arrow: "•" };
  }

  // 8er-Kompass, ausgeschrieben (nutzerfreundlich)
  const dirs = [
    "Norden",
    "Nordosten",
    "Osten",
    "Südosten",
    "Süden",
    "Südwesten",
    "Westen",
    "Nordwesten",
  ];

  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;

  return {
    label: dirs[idx],
    arrow: arrows[idx],
  };
}

export function fmtMeters(m?: number) {
  if (m === undefined || m === null || Number.isNaN(m)) return "–";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

export function fmtSeconds(s?: number) {
  if (s === undefined || s === null || Number.isNaN(s)) return "–";
  if (s < 60) return `${Math.round(s)} s`;
  const min = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${min} min ${sec.toString().padStart(2, "0")} s`;
}
