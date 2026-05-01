// frontend/src/hooks/useScenarioActions.ts
import { useCallback, useMemo, useState } from "react";

import {
  buildScenario,
  downloadScenarioJSON,
  listScenarios,
  loadScenarioFromBackend,
  renameScenario,
  saveScenarioToBackend,
} from "../lib/scenarios";
import { downloadScenarioReportPDF } from "../lib/downloadScenarioReportPDF";

type ScenarioActionsParams = {
  busy: boolean;
  setBusy: (v: boolean) => void;

  statusText?: string | null;
  setStatusText: (t: string) => void;

  initialScenarioName?: string;
  buildSnapshot: () => any;
  applyScenarioPayloadToState: (payload: any) => void;
  pickScenarioJSONFile: () => Promise<any | null>;
};

export function useScenarioActions({
  busy,
  setBusy,
  setStatusText,
  initialScenarioName = "Verkehr-Szenario",
  buildSnapshot,
  applyScenarioPayloadToState,
  pickScenarioJSONFile,
}: ScenarioActionsParams) {
  const [activeScenarioId, setActiveScenarioId] = useState<number | null>(null);
  const [activeScenarioName, setActiveScenarioName] = useState<string>(initialScenarioName);

  const getScenarioName = useCallback(() => {
    return activeScenarioName?.trim() || "Verkehr-Szenario";
  }, [activeScenarioName]);

  const handleScenarioSaveToFile = useCallback(() => {
    const payload = buildSnapshot();
    const scenario = buildScenario(getScenarioName(), payload);
    downloadScenarioJSON(scenario);
    setActiveScenarioId(null);
    setStatusText("💾 Szenario lokal gespeichert (JSON).");
  }, [buildSnapshot, getScenarioName, setStatusText]);

  const handleScenarioLoadFromFile = useCallback(async () => {
    const json = await pickScenarioJSONFile();
    if (!json) return;

    const payload = json.payload ?? json;
    applyScenarioPayloadToState(payload);

    const fileName =
      typeof json.name === "string" && json.name.trim()
        ? json.name.trim()
        : "Import";

    setActiveScenarioName(fileName);
    setActiveScenarioId(null);
    setStatusText(`📂 Szenario geöffnet: ${fileName}`);
  }, [applyScenarioPayloadToState, pickScenarioJSONFile, setStatusText]);

  const handleScenarioReportPdf = useCallback(() => {
    const payload = buildSnapshot();
    const scenario = buildScenario(getScenarioName(), payload);
    downloadScenarioReportPDF(scenario);
    setStatusText("📄 Report (PDF) geöffnet.");
  }, [buildSnapshot, getScenarioName, setStatusText]);

  const handleScenarioSaveDb = useCallback(async () => {
    try {
      const suggestedName = getScenarioName();
      const name = window.prompt("Name für das Szenario (DB):", suggestedName) ?? "";
      const trimmedName = name.trim();

      if (!trimmedName) return;

      setBusy(true);

      const payload = buildSnapshot();
      const res = await saveScenarioToBackend(trimmedName, payload);

      setActiveScenarioId(res.id);
      setActiveScenarioName(trimmedName);
      setStatusText(`☁️ In DB gespeichert (ID ${res.id}).`);
    } catch (e: any) {
      setStatusText(`❌ Speichern (DB) fehlgeschlagen: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }, [buildSnapshot, getScenarioName, setBusy, setStatusText]);

  const handleScenarioLoadDb = useCallback(async () => {
    try {
      setBusy(true);

      const list = await listScenarios();
      if (!list.length) {
        setStatusText("ℹ️ Keine DB-Szenarien vorhanden.");
        return;
      }

      const msg = list.map((s) => `${s.id}: ${s.name}`).join("\n");
      const raw = window.prompt(
        `Welche Szenario-ID laden?\n\n${msg}`,
        String(list[0].id)
      );

      if (!raw) return;

      const id = Number(raw);
      if (!Number.isFinite(id)) {
        setStatusText("❌ Ungültige Szenario-ID.");
        return;
      }

      const scenario = await loadScenarioFromBackend(id);
      const data = scenario.payload ?? {};

      applyScenarioPayloadToState(data);
      setActiveScenarioId(id);
      setActiveScenarioName(
        typeof scenario.name === "string" && scenario.name.trim()
          ? scenario.name.trim()
          : `Szenario ${id}`
      );
      setStatusText(`☁️ Aus DB geladen (ID ${id}).`);
    } catch (e: any) {
      setStatusText(`❌ Laden (DB) fehlgeschlagen: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }, [applyScenarioPayloadToState, setBusy, setStatusText]);

  const handleScenarioRenameDb = useCallback(async () => {
    try {
      if (!activeScenarioId) {
        setStatusText("ℹ️ Kein aktives DB-Szenario ausgewählt (erst speichern oder laden).");
        return;
      }

      const newName = window.prompt(
        "Neuer DB-Szenario-Name:",
        getScenarioName()
      ) ?? "";

      const trimmedName = newName.trim();
      if (!trimmedName) return;

      setBusy(true);
      await renameScenario(activeScenarioId, trimmedName);
      setActiveScenarioName(trimmedName);
      setStatusText("✏️ DB-Szenario umbenannt.");
    } catch (e: any) {
      setStatusText(`❌ Umbenennen (DB) fehlgeschlagen: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }, [activeScenarioId, getScenarioName, setBusy, setStatusText]);

  const scenarioActions = useMemo(
    () => ({
      save_local: handleScenarioSaveToFile,
      open_local: () => void handleScenarioLoadFromFile(),
      report_csv: handleScenarioReportPdf,
      save_db: () => void handleScenarioSaveDb(),
      load_db: () => void handleScenarioLoadDb(),
      rename_db: () => void handleScenarioRenameDb(),
    }),
    [
      handleScenarioLoadDb,
      handleScenarioLoadFromFile,
      handleScenarioRenameDb,
      handleScenarioReportPdf,
      handleScenarioSaveDb,
      handleScenarioSaveToFile,
    ]
  );

  const handleScenarioMenu = useCallback(
    (value: string) => {
      const fn = scenarioActions[value as keyof typeof scenarioActions];
      if (typeof fn === "function") {
        fn();
      }
    },
    [scenarioActions]
  );

  return {
    activeScenarioId,
    activeScenarioName,
    setActiveScenarioId,
    setActiveScenarioName,
    handleScenarioMenu,
    scenarioActions,
    handleScenarioSaveToFile,
    handleScenarioLoadFromFile,
    handleScenarioReportPdf,
    handleScenarioSaveDb,
    handleScenarioLoadDb,
    handleScenarioRenameDb,
    busy,
  };
}