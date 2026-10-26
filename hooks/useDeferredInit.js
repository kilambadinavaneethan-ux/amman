import { useState, useEffect } from "react";

/**
 * Returns `true` once a short delay has passed after mount,
 * allowing non-critical Firestore listeners to defer their setup and not compete
 * with core data loading on startup.
 *
 * @param {number} delayMs - Milliseconds to wait before becoming ready (default: 1500)
 * @returns {boolean} - `true` when ready to initialize
 */
export function useDeferredInit(delayMs = 1500) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(timer);
  }, []);

  return ready;
}
