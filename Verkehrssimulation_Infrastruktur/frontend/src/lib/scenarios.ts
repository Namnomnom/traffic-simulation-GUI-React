// frontend/src/lib/scenarios.ts

export type ScenarioId = number;

export type ScenarioListItem = {
  id: number;
  name: string;
  created_at: string;
};

export type ScenarioRecord = {
  id: number;
  name: string;
  created_at: string;
  payload: unknown;
};

/**
 * Export-Format fürs Frontend (Datei-Download).
 */
export type TrafficScenarioFile = {
  version: 1;
  name: string;
  createdAt: string;
  payload: unknown;
};

// Prefer Vite proxy (/api/...) to avoid CORS.
// If you set VITE_API_URL, we use it (e.g. http://localhost:8000).
function apiBase() {
  const envBase = (import.meta as any).env?.VITE_API_URL as string | undefined;
  const root = envBase?.trim() ? envBase.trim().replace(/\/+$/, "") : "";
  return root ? `${root}/api/scenarios/scenarios` : `/api/scenarios/scenarios`;
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);

  if (res.status === 204) return undefined as unknown as T;

  // Try to parse JSON, else text
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    const body = isJson ? JSON.stringify(await res.json()).slice(0, 500) : (await res.text()).slice(0, 500);
    throw new Error(`HTTP ${res.status} ${res.statusText} – ${body}`);
  }

  if (!isJson) {
    // Some endpoints might return plain text (rare)
    return (await res.text()) as unknown as T;
  }

  return (await res.json()) as T;
}

// --------------------------
// Backend calls
// --------------------------
export async function listScenarios(): Promise<ScenarioListItem[]> {
  return http<ScenarioListItem[]>(`${apiBase()}/`);
}

/**
 * POST /api/scenarios/scenarios/
 * Body: { name, payload }
 */
export async function saveScenarioToBackend(name: string, payload: unknown): Promise<ScenarioRecord> {
  return http<ScenarioRecord>(`${apiBase()}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, payload }),
  });
}

export async function loadScenarioFromBackend(id: ScenarioId): Promise<ScenarioRecord> {
  return http<ScenarioRecord>(`${apiBase()}/${id}`);
}

/**
 * PATCH /api/scenarios/scenarios/{scenario_id}
 * Body: { name }
 */
export async function renameScenario(id: ScenarioId, name: string): Promise<ScenarioRecord> {
  return http<ScenarioRecord>(`${apiBase()}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

// --------------------------
// Export helpers
// --------------------------
export function buildScenario(name: string, payload: unknown): TrafficScenarioFile {
  return {
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    payload,
  };
}

export function downloadScenarioJSON(scenario: TrafficScenarioFile) {
  const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: "application/json" });
  const fileName = safeFileName(`${scenario.name || "scenario"}.json`);
  downloadBlob(blob, fileName);
}

export function downloadScenarioCSV(scenario: TrafficScenarioFile) {
  const payload = (scenario.payload ?? {}) as any;
  const vehicles: any[] = Array.isArray(payload.vehicles) ? payload.vehicles : [];
  const tls: any[] = Array.isArray(payload.trafficLights) ? payload.trafficLights : [];

  const vehCsv = toCsv(
    ["id", "type", "speedKmh", "routeStartLat", "routeStartLng", "routeEndLat", "routeEndLng"],
    vehicles.map((v) => [
      v.id ?? "",
      v.type ?? "",
      v.speedKmh ?? "",
      v.routeStart?.[1] ?? "",
      v.routeStart?.[0] ?? "",
      v.routeEnd?.[1] ?? "",
      v.routeEnd?.[0] ?? "",
    ])
  );

  const tlCsv = toCsv(
    ["id", "mode", "lat", "lng", "bearingDeg", "controllerId"],
    tls.map((t) => [t.id ?? "", t.mode ?? "", t.lat ?? "", t.lng ?? "", t.bearingDeg ?? "", t.controllerId ?? ""])
  );

  const combined =
    `# Scenario: ${scenario.name}\n# CreatedAt: ${scenario.createdAt}\n\n` +
    `# Vehicles\n${vehCsv}\n\n` +
    `# TrafficLights\n${tlCsv}\n`;

  const blob = new Blob([combined], { type: "text/csv;charset=utf-8" });
  const fileName = safeFileName(`${scenario.name || "scenario"}.csv`);
  downloadBlob(blob, fileName);
}

// --------------------------
// small utils
// --------------------------
function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "_").trim();
}

function csvEscape(val: any) {
  const s = String(val ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(header: string[], rows: any[][]) {
  const h = header.map(csvEscape).join(",");
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  return `${h}\n${body}`;
}
