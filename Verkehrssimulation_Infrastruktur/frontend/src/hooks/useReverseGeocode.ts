// frontend/src/hooks/useReverseGeocode.ts
import { useEffect, useMemo, useRef, useState } from "react";
import type { LngLat } from "../types/simTypes";
import { distanceMeters } from "../lib/geo";

type ReverseResult = {
    label: string | null;   // z.B. "Wilhelmstraße / Theaterwall"
    loading: boolean;
    error?: string;
};

type Options = {
    intervalMs?: number;        // wie oft max. abfragen (z.B. 8000)
    minMoveMeters?: number;     // nur wenn sich das Fahrzeug so weit bewegt hat (z.B. 40)
    language?: string;          // z.B. "de"
};

function shortenPlaceName(placeName: string): string {
    // MapTiler liefert oft "Straße, Stadt, ...". Wir nehmen nur den ersten Teil.
    const first = placeName.split(",")[0]?.trim();
    return first || placeName;
}

function extractNiceLabel(json: any): string | null {
    const features = json?.features;
    if (!Array.isArray(features) || features.length === 0) return null;

    // Nimm das "beste" Feature: oft ist [0] schon ok.
    // place_name ist meist am nützlichsten.
    const f = features[0];
    const placeName = f?.place_name || f?.text;
    if (!placeName || typeof placeName !== "string") return null;

    // Wenn MapTiler schon ein "A / B" liefert, lassen wir das so.
    return shortenPlaceName(placeName);
}

/**
 * Reverse Geocoding via MapTiler:
 * https://api.maptiler.com/geocoding/{lon},{lat}.json?key=KEY&language=de
 *
 * Wichtig: throttled + cached, NICHT pro Frame.
 */
export function useReverseGeocode(
    coords?: LngLat, // [lng, lat]
    opts?: Options
): ReverseResult {
    const intervalMs = opts?.intervalMs ?? 8000;
    const minMoveMeters = opts?.minMoveMeters ?? 40;
    const language = opts?.language ?? "de";

    const apiKey = (import.meta as any).env?.VITE_MAPTILER_KEY as string | undefined;

    const [label, setLabel] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);

    // Cache: Schlüssel = gerundete Koords (damit wir nicht 1000 Varianten bekommen)
    const cacheRef = useRef<Map<string, string>>(new Map());

    const lastFetchAtRef = useRef<number>(0);
    const lastFetchCoordsRef = useRef<LngLat | null>(null);

    const cacheKey = useMemo(() => {
        if (!coords) return null;
        const [lng, lat] = coords;
        // 4 Dezimalstellen ~ 11m (lat) – gut genug als Cache-Key
        return `${lng.toFixed(4)},${lat.toFixed(4)}`;
    }, [coords]);

    useEffect(() => {
        if (!coords) return;
        if (!apiKey) {
            // Kein Key -> einfach still bleiben, Fallback im UI nutzen
            setLabel(null);
            setError(undefined);
            setLoading(false);
            return;
        }

        const now = Date.now();

        // 1) Cache hit?
        if (cacheKey && cacheRef.current.has(cacheKey)) {
            setLabel(cacheRef.current.get(cacheKey)!);
            setError(undefined);
            setLoading(false);
            // trotzdem NICHT sofort wieder fetchen
        }

        // 2) Throttle + Distanz-Schwelle
        const lastAt = lastFetchAtRef.current;
        const elapsed = now - lastAt;

        const lastCoords = lastFetchCoordsRef.current;
        const moved =
            lastCoords ? distanceMeters(lastCoords, coords) : Number.POSITIVE_INFINITY;

        const shouldFetch =
            elapsed >= intervalMs || moved >= minMoveMeters || lastCoords === null;

        if (!shouldFetch) return;

        // 3) Fetch
        let aborted = false;
        const controller = new AbortController();

        async function run() {
            try {
                setLoading(true);
                setError(undefined);

                const [lng, lat] = coords;
                const url =
                    `https://api.maptiler.com/geocoding/${lng},${lat}.json` +
                    `?key=${encodeURIComponent(apiKey)}` +
                    `&language=${encodeURIComponent(language)}`;

                const res = await fetch(url, { signal: controller.signal });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const json = await res.json();
                const nice = extractNiceLabel(json);

                if (aborted) return;

                lastFetchAtRef.current = Date.now();
                lastFetchCoordsRef.current = coords;

                if (nice) {
                    setLabel(nice);
                    if (cacheKey) cacheRef.current.set(cacheKey, nice);
                } else {
                    setLabel(null);
                }
            } catch (e: any) {
                if (aborted) return;
                // Bei Rate-Limit/Offline etc. einfach Fallback benutzen
                setError(e?.message ?? "reverse geocode failed");
                setLabel(null);
            } finally {
                if (!aborted) setLoading(false);
            }
        }

        run();

        return () => {
            aborted = true;
            controller.abort();
        };
    }, [coords?.[0], coords?.[1], apiKey, cacheKey, intervalMs, minMoveMeters, language]);

    return { label, loading, error };
}
