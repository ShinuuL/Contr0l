import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import "./index.css";
import { databaseHealth } from "./lib/observability/health";
import { telemetry } from "./lib/observability/telemetry";

if (import.meta.env.DEV) {
  // Hook dev-only para validação visual: captura a janela Tauri via comando Rust
  // registrado apenas em debug_assertions. Não entra no bundle de produção.
  const devCapture = (path: string) => invoke("dev_capture_window", { path });
  (window as Window & { __devCapture?: (path: string) => Promise<unknown> }).__devCapture =
    devCapture;

  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "p") {
      event.preventDefault();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `.impeccable/screenshots/dev-${stamp}.png`;
      void devCapture(path)
        .then((out) => console.log("[dev-capture]", out))
        .catch((err) => console.error("[dev-capture]", err));
    }
  });
}

window.addEventListener("error", () => {
  telemetry.record({
    operation: "ui.globalError",
    outcome: "failure",
    errorCode: "unhandled_error",
  });
});
window.addEventListener("unhandledrejection", () => {
  telemetry.record({
    operation: "ui.unhandledRejection",
    outcome: "failure",
    errorCode: "unhandled_rejection",
  });
});

void databaseHealth.check();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
