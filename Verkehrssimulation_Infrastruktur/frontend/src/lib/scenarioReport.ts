// frontend/src/lib/scenarioReport.ts

type LngLat = [number, number];

type ReportVehicle = {
  id: number;
  type?: string;
  speedKmh?: number;
  routePoints?: LngLat[] | null;
};

type ReportScenario = {
  name: string;
  createdAt?: string;
  payload: {
    roads?: any[];
    intersections?: any[];
    vehicles?: ReportVehicle[];
  };
};

function formatDate(dateStr?: string) {
  if (!dateStr) return new Date().toLocaleString();
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function calculateRouteDistance(points?: LngLat[] | null): number {
  if (!points || points.length < 2) return 0;

  let total = 0;

  for (let i = 1; i < points.length; i++) {
    const [lng1, lat1] = points[i - 1];
    const [lng2, lat2] = points[i];

    const dx = (lng2 - lng1) * 111_320; // grobe Meter-Approximation
    const dy = (lat2 - lat1) * 110_540;

    total += Math.sqrt(dx * dx + dy * dy);
  }

  return Math.round(total);
}

export function downloadScenarioReportCSV(scenario: ReportScenario) {
  const { name, createdAt, payload } = scenario;

  const vehicles = payload.vehicles ?? [];
  const intersections = payload.intersections ?? [];

  const rows: string[] = [];

  // =========================
  // Abschnitt 1 – Übersicht
  // =========================
  rows.push("Szenario Report");
  rows.push("");

  rows.push(`Szenario Name,${name}`);
  rows.push(`Erstellt am,${formatDate(createdAt)}`);
  rows.push(`Fahrzeuge gesamt,${vehicles.length}`);
  rows.push(`LSA gesamt,${intersections.length}`);
  rows.push("");

  // =========================
  // Abschnitt 2 – Fahrzeuge
  // =========================
  rows.push("Fahrzeug Übersicht");
  rows.push("Fahrzeug,Typ,Route gesetzt,Distanz (m),Max Geschwindigkeit (km/h)");

  vehicles.forEach((v) => {
    const hasRoute = !!(v.routePoints && v.routePoints.length >= 2);
    const distance = calculateRouteDistance(v.routePoints);

    rows.push(
      [
        `#${v.id}`,
        v.type ?? "pkw",
        hasRoute ? "Ja" : "Nein",
        hasRoute ? distance : 0,
        v.speedKmh ?? 50,
      ].join(",")
    );
  });

  rows.push("");

  // =========================
  // Abschnitt 3 – LSA
  // =========================
  rows.push("Ampel Übersicht");
  rows.push("LSA Nummer");

  intersections.forEach((_, index) => {
    rows.push(`${index + 1}`);
  });

  // =========================
  // CSV generieren
  // =========================
  const csvContent = rows.join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}_Report.csv`;
  link.click();

  URL.revokeObjectURL(url);
}
