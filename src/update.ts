// The service worker shows the copy of the game it has cached, then fetches the page again in
// the background. When what comes back is different, it says so, and the level list offers to
// reload into the new version instead of leaving it for the visit after next.

import { useSyncExternalStore } from "react";

let ready = false;
const listeners = new Set<() => void>();

/** Start listening to the service worker. Called once, where it is registered. */
export function watchForUpdates() {
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    if ((e.data as { type?: unknown } | null)?.type !== "update-ready") return;
    ready = true;
    listeners.forEach((tell) => tell());
  });
}

function subscribe(tell: () => void) {
  listeners.add(tell);
  return () => {
    listeners.delete(tell);
  };
}

/** True once a newer version of the game has been fetched and is waiting for a reload. */
export const useUpdateReady = () => useSyncExternalStore(subscribe, () => ready);
