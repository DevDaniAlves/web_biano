import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./store/ThemeContext";
import "./theme.css";

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((reg) => {
      console.log("[push] SW registrado", { scope: reg.scope, active: Boolean(reg.active) });
      void reg.update();
      setInterval(() => void reg.update(), 60 * 60 * 1000);
    })
    .catch((err) => {
      console.error("[push] SW falhou ao registrar:", err);
    });
} else {
  console.warn("[push] serviceWorker indisponível neste navegador");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
