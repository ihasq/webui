import { useState, useEffect, useCallback, useRef } from "react";
import {
  applyBundleUpdate,
  isBundleUpdateSupported,
} from "@/lib/bundle-updater";

interface BundleInfo {
  url: string;
  size: number;
  hash: string;
}

interface VersionInfo {
  buildId: string;
  buildHash: string;
  buildTime: number;
  buildDate: string;
  bundle?: BundleInfo;
}

interface UpdateProgress {
  phase: "downloading" | "extracting" | "complete" | "error";
  downloaded?: number;
  total?: number;
  filesExtracted?: number;
  error?: string;
}

interface UpdateState {
  checking: boolean;
  updateAvailable: boolean;
  applying: boolean;
  currentBuildId: string | null;
  latestBuildId: string | null;
  latestVersion: VersionInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
}

const CHECK_INTERVAL = 1000 * 60 * 5; // Check every 5 minutes

/**
 * Get the current build ID from the active Service Worker
 */
async function getCurrentBuildId(): Promise<string | null> {
  const registration = await navigator.serviceWorker?.ready;
  const sw = registration?.active;
  if (!sw) return null;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      resolve(event.data?.buildId ?? null);
    };
    sw.postMessage({ type: "GET_BUILD_ID" }, [channel.port2]);
    // Timeout after 1 second
    setTimeout(() => resolve(null), 1000);
  });
}

/**
 * Get the cache version from the active Service Worker
 */
async function getCacheVersion(): Promise<number | null> {
  const registration = await navigator.serviceWorker?.ready;
  const sw = registration?.active;
  if (!sw) return null;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      resolve(event.data?.cacheVersion ?? null);
    };
    sw.postMessage({ type: "GET_CACHE_VERSION" }, [channel.port2]);
    // Timeout after 1 second
    setTimeout(() => resolve(null), 1000);
  });
}

/**
 * Fetch the latest version info from the server
 */
async function fetchLatestVersion(): Promise<VersionInfo | null> {
  try {
    const response = await fetch("/version.json", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Hook to check for PWA updates
 */
export function useUpdateChecker() {
  const [state, setState] = useState<UpdateState>({
    checking: false,
    updateAvailable: false,
    applying: false,
    currentBuildId: null,
    latestBuildId: null,
    latestVersion: null,
    progress: null,
    error: null,
  });

  const checkingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reloadingRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    // Prevent concurrent checks
    if (checkingRef.current) return;
    if (!navigator.onLine) return;

    checkingRef.current = true;
    setState((s) => ({ ...s, checking: true, error: null }));

    try {
      const [currentBuildId, latestVersion] = await Promise.all([
        getCurrentBuildId(),
        fetchLatestVersion(),
      ]);

      if (!latestVersion) {
        setState((s) => ({
          ...s,
          checking: false,
          error: "Failed to fetch version info",
        }));
        checkingRef.current = false;
        return;
      }

      const latestBuildId = latestVersion.buildId;
      const updateAvailable =
        currentBuildId !== null && currentBuildId !== latestBuildId;

      setState((s) => ({
        ...s,
        checking: false,
        updateAvailable,
        currentBuildId,
        latestBuildId,
        latestVersion,
        error: null,
      }));

      // If update is available, trigger SW update check
      if (updateAvailable && navigator.serviceWorker) {
        const registration = await navigator.serviceWorker.ready;
        registration.update();
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        checking: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    if (state.applying) return;

    setState((s) => ({ ...s, applying: true, progress: null }));

    const { latestVersion } = state;

    // Try bundle update if available and supported
    if (
      latestVersion?.bundle &&
      isBundleUpdateSupported()
    ) {
      try {
        // Get cache version for IndexedDB
        const cacheVersion = await getCacheVersion();
        if (!cacheVersion) {
          throw new Error("Could not get cache version from service worker");
        }

        const success = await applyBundleUpdate(
          latestVersion.bundle,
          cacheVersion,
          (progress) => {
            setState((s) => ({ ...s, progress }));
          }
        );

        if (success) {
          // Bundle update successful, tell SW to skip waiting and reload
          const registration = await navigator.serviceWorker?.ready;
          const waiting = registration?.waiting;

          if (waiting) {
            waiting.postMessage({ type: "SKIP_WAITING" });
          } else {
            // No waiting SW, just reload
            reloadingRef.current = true;
            window.location.reload();
          }
          return;
        }
      } catch (err) {
        console.warn("Bundle update failed, falling back to legacy update:", err);
      }
    }

    // Legacy update: just reload to fetch new assets individually
    const registration = await navigator.serviceWorker?.ready;
    const waiting = registration?.waiting;

    if (waiting) {
      // Tell the waiting SW to skip waiting and become active
      // The controllerchange event will handle the reload
      waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      // No waiting SW, just reload to fetch new assets
      reloadingRef.current = true;
      window.location.reload();
    }
  }, [state.applying, state.latestVersion]);

  const dismissUpdate = useCallback(() => {
    setState((s) => ({ ...s, updateAvailable: false }));
  }, []);

  // Check on mount and when coming online
  useEffect(() => {
    // Initial check after a short delay
    const initialTimeout = setTimeout(checkForUpdate, 2000);

    // Check when coming back online
    const handleOnline = () => {
      checkForUpdate();
    };

    window.addEventListener("online", handleOnline);

    // Periodic check
    intervalRef.current = setInterval(checkForUpdate, CHECK_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      window.removeEventListener("online", handleOnline);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkForUpdate]);

  // Listen for SW controller change (new SW activated)
  useEffect(() => {
    const handleControllerChange = () => {
      // Prevent double reload
      if (reloadingRef.current) return;
      reloadingRef.current = true;

      // New SW has taken over, reload to get fresh assets
      window.location.reload();
    };

    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      handleControllerChange
    );

    return () => {
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
    };
  }, []);

  return {
    ...state,
    checkForUpdate,
    applyUpdate,
    dismissUpdate,
  };
}
