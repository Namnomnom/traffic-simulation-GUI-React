// frontend/src/lib/downloadScenarioReportPDF.ts
export function downloadScenarioReportPDF(scenario: any) {
  const { name, payload } = scenario;

  const vehicles = payload?.vehicles ?? [];
  const intersections = payload?.intersections ?? [];
  const routes = payload?.routesByVehicle ?? {};

  const routedVehicles = vehicles.filter(
    (v: any) => Array.isArray(routes[v.id]?.points) && routes[v.id].points.length >= 2
  );

  const avgRoutePoints =
    routedVehicles.length > 0
      ? Math.round(
          routedVehicles.reduce((sum: number, v: any) => {
            const pts = routes[v.id]?.points;
            return sum + (Array.isArray(pts) ? pts.length : 0);
          }, 0) / routedVehicles.length
        )
      : 0;

  const html = `
  <html>
    <head>
      <title>Verkehrszenario Report</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 40px;
          color: #2c3e50;
        }
        h1 {
          color: #1e88e5;
        }
        h2 {
          margin-top: 30px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 5px;
        }
        .box {
          background: #f5f7fa;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 15px;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .vehicle {
          margin-bottom: 10px;
        }
      </style>
    </head>

    <body>
      <h1>🚦 Verkehrszenario Report</h1>

      <div class="box">
        <b>Name:</b> ${name}<br/>
        <b>Erstellt am:</b> ${new Date().toLocaleString("de-DE")}<br/>
        <b>Sim Speed:</b> ${payload?.sim?.simSpeed ?? "-"}x<br/>
        <b>LSA Vorschau:</b> ${payload?.sim?.previewTrafficLights ? "an" : "aus"}
      </div>

      <h2>📊 Übersicht</h2>
      <div class="box grid">
        <div>🚗 Fahrzeuge: <b>${vehicles.length}</b></div>
        <div>🚦 Kreuzungen: <b>${intersections.length}</b></div>
        <div>🧭 Fahrzeuge mit Route: <b>${routedVehicles.length}</b></div>
        <div>📈 Ø Routenpunkte: <b>${avgRoutePoints}</b></div>
      </div>

      <h2>🚗 Fahrzeuge</h2>
      <div class="box">
        ${
          vehicles.length === 0
            ? "<i>Keine Fahrzeuge vorhanden</i>"
            : vehicles
                .map((v: any) => {
                  const r = routes[v.id];
                  return `
                    <div class="vehicle">
                      <b>Fahrzeug #${v.id}</b> (${v.type})<br/>
                      Route: ${r?.points?.length ? "✅ vorhanden" : "❌ keine"}<br/>
                      ${
                        r?.start
                          ? `Start: ${r.start.lat?.toFixed(5)}, ${r.start.lng?.toFixed(5)}<br/>`
                          : ""
                      }
                      ${
                        r?.end
                          ? `Ziel: ${r.end.lat?.toFixed(5)}, ${r.end.lng?.toFixed(5)}`
                          : ""
                      }
                    </div>
                  `;
                })
                .join("")
        }
      </div>

      <script>
        window.onload = () => {
          window.print();
        };
      </script>
    </body>
  </html>
  `;

  const win = window.open("", "_blank");
  if (!win) return;

  win.document.write(html);
  win.document.close();
}