// frontend/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./pages/App";
import "./index.css";    // MUSS drin sein
import "maplibre-gl/dist/maplibre-gl.css";


ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />             {/* <- nicht auskommentieren */}
  </React.StrictMode>
);
