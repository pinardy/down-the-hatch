import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
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
