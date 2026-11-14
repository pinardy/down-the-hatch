import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// The stylesheet, by area. Order matters: later files win ties, and modes.css (landscape,
// reduced motion, high contrast) overrides the rest, so it comes last.
import "./styles/base.css";
import "./styles/home.css";
import "./styles/play.css";
import "./styles/board.css";
import "./styles/sheets.css";
import "./styles/settings.css";
import "./styles/editor.css";
import "./styles/stats.css";
import "./styles/modes.css";
import { watchForUpdates } from "./update";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support. Only where a service worker can actually be served: a real http(s) origin
// with sw.js beside the page. Anywhere else (a preview frame, a file opened from disk) this
// quietly does nothing.
if ("serviceWorker" in navigator && location.protocol.startsWith("http") && import.meta.env.PROD) {
  watchForUpdates();
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* no service worker here: the game still plays, just not offline */
    });
  });
}
