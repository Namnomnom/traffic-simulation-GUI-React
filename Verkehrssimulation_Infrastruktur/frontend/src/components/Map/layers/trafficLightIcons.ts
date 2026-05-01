// frontend/src/components/Map/layers/trafficLightIcons.ts
import type maplibregl from "maplibre-gl";

type LoadedImage = HTMLImageElement | ImageBitmap;

// ✅ globales Promise verhindert Mehrfach-Laden (Race-Condition)
let loadingPromise: Promise<void> | null = null;

function loadImage(map: maplibregl.Map, url: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    (map as any).loadImage(url, (err: any, img: LoadedImage | undefined) => {
      if (err || !img) {
        reject(err ?? new Error(`loadImage failed: ${url}`));
        return;
      }
      resolve(img);
    });
  });
}

/** Fallback: kleines Canvas-Icon (immer verfügbar, auch wenn PNG nicht lädt) */
function makeFallbackIcon(color: "red" | "yellow" | "green"): ImageBitmap | HTMLCanvasElement {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;

  ctx.clearRect(0, 0, size, size);

  // Hintergrund-Kreis
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 22, 0, Math.PI * 2);
  ctx.fillStyle =
    color === "red"
      ? "rgba(220, 53, 69, 0.95)"
      : color === "yellow"
      ? "rgba(255, 193, 7, 0.95)"
      : "rgba(40, 167, 69, 0.95)";
  ctx.fill();

  // Rand
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.stroke();

  // kleine “Kappe”
  ctx.beginPath();
  ctx.roundRect(size / 2 - 10, size / 2 - 36, 20, 10, 4);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();

  // Wenn ImageBitmap unterstützt wird → sauberer
  // (MapLibre akzeptiert beides: Canvas oder ImageBitmap)
  try {
    // @ts-ignore
    if (typeof createImageBitmap === "function") {
      // @ts-ignore
      return createImageBitmap(c) as any;
    }
  } catch {
    // ignore
  }
  return c;
}

function add(map: maplibregl.Map, name: string, img: any) {
  if (map.hasImage(name)) return;
  map.addImage(name, img, { pixelRatio: 2 });
}

export function ensureTrafficLightIcons(map: maplibregl.Map): Promise<void> {
  // ✅ Icons bereits vorhanden → sofort fertig
  if (map.hasImage("tl-red") && map.hasImage("tl-yellow") && map.hasImage("tl-green")) {
    return Promise.resolve();
  }

  // ✅ Ladevorgang läuft bereits → wiederverwenden
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const [red, yellow, green] = await Promise.all([
        loadImage(map, "/icons/tl-red.png"),
        loadImage(map, "/icons/tl-yellow.png"),
        loadImage(map, "/icons/tl-green.png"),
      ]);

      add(map, "tl-red", red);
      add(map, "tl-yellow", yellow);
      add(map, "tl-green", green);
    } catch (err) {
      console.warn("⚠️ Traffic light PNGs konnten nicht geladen werden → nutze Fallback-Icons.", err);

      // ✅ Fallback (immer sichtbar)
      add(map, "tl-red", await Promise.resolve(makeFallbackIcon("red")));
      add(map, "tl-yellow", await Promise.resolve(makeFallbackIcon("yellow")));
      add(map, "tl-green", await Promise.resolve(makeFallbackIcon("green")));
    }
  })();

  return loadingPromise;
}
