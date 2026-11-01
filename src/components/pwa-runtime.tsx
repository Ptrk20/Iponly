"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function subscribeToConnection(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getConnectionStatus() {
  return navigator.onLine;
}

function getServerConnectionStatus() {
  return true;
}

export function PwaRuntime() {
  const isOnline = useSyncExternalStore(
    subscribeToConnection,
    getConnectionStatus,
    getServerConnectionStatus,
  );
  const [backOnline, setBackOnline] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const waitingWorker = useRef<ServiceWorker | null>(null);
  const reloadAfterUpdate = useRef(false);

  useEffect(() => {
    let onlineTimeout: ReturnType<typeof setTimeout> | undefined;
    const handleOffline = () => {
      setBackOnline(false);
      if (onlineTimeout) clearTimeout(onlineTimeout);
    };
    const handleOnline = () => {
      setBackOnline(true);
      if (onlineTimeout) clearTimeout(onlineTimeout);
      onlineTimeout = setTimeout(() => setBackOnline(false), 4000);
    };
    const handleControllerChange = () => {
      if (reloadAfterUpdate.current) window.location.reload();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    navigator.serviceWorker?.addEventListener("controllerchange", handleControllerChange);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          waitingWorker.current = registration.waiting;
          if (registration.waiting && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }

          registration.addEventListener("updatefound", () => {
            const installingWorker = registration.installing;
            installingWorker?.addEventListener("statechange", () => {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                waitingWorker.current = registration.waiting;
                setUpdateAvailable(Boolean(registration.waiting));
              }
            });
          });
        })
        .catch(() => {
          if (navigator.onLine) setRegistrationFailed(true);
        });
    }

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
      if (onlineTimeout) clearTimeout(onlineTimeout);
    };
  }, []);

  function applyUpdate() {
    if (!waitingWorker.current) return;
    reloadAfterUpdate.current = true;
    setUpdating(true);
    waitingWorker.current.postMessage({ type: "SKIP_WAITING" });
  }

  if (!isOnline) {
    return (
      <div aria-live="polite" className="connection-notice connection-notice-offline" role="status">
        You’re offline. Reconnect before saving financial changes.
      </div>
    );
  }

  if (updateAvailable) {
    return (
      <div aria-live="polite" className="connection-notice" role="status">
        <span>A new version of Iponly is available.</span>
        <button className="connection-notice-action" disabled={updating} onClick={applyUpdate} type="button">
          {updating ? "Updating…" : "Refresh"}
        </button>
      </div>
    );
  }

  if (backOnline) {
    return <div aria-live="polite" className="connection-notice connection-notice-online" role="status">Back online.</div>;
  }

  if (registrationFailed) {
    return <div aria-live="polite" className="connection-notice" role="status">Offline fallback is unavailable; reconnect before saving financial changes.</div>;
  }

  return null;
}
