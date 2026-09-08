import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { waitForPendingWrites } from "firebase/firestore";
import { db } from "../../src/config/firebase";

const NetworkContext = createContext({
  isOnline: true,
  networkType: "unknown",
  wasOffline: false,
  hasPendingWrites: false,
  isSyncing: false,
});

export function NetworkProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const [networkType, setNetworkType] = useState("unknown");
  const [wasOffline, setWasOffline] = useState(false);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const wasOfflineTimer = useRef(null);
  const prevOnlineRef = useRef(true);

  useEffect(() => {
    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = !!(state.isConnected && state.isInternetReachable !== false);
      const prevOnline = prevOnlineRef.current;

      setIsOnline(connected);
      setNetworkType(state.type || "unknown");
      prevOnlineRef.current = connected;

      // Track reconnection: show "back online" briefly
      if (connected && !prevOnline) {
        setWasOffline(true);
        setIsSyncing(true);

        // Wait for all queued Firestore writes to sync
        waitForPendingWrites(db)
          .then(() => {
            setHasPendingWrites(false);
            setIsSyncing(false);
          })
          .catch(() => {
            setIsSyncing(false);
          });

        if (wasOfflineTimer.current) clearTimeout(wasOfflineTimer.current);
        wasOfflineTimer.current = setTimeout(() => {
          setWasOffline(false);
        }, 4000);
      }

      // When going offline, mark pending writes
      if (!connected && prevOnline) {
        setHasPendingWrites(true);
      }
    });

    // Fetch initial state
    NetInfo.fetch().then((state) => {
      const connected = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(connected);
      setNetworkType(state.type || "unknown");
      prevOnlineRef.current = connected;
    });

    return () => {
      unsubscribe();
      if (wasOfflineTimer.current) clearTimeout(wasOfflineTimer.current);
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, networkType, wasOffline, hasPendingWrites, isSyncing }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}

export default NetworkContext;
