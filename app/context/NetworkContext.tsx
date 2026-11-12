import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import NetInfo from "@react-native-community/netinfo";
import { waitForPendingWrites } from "firebase/firestore";
import { db } from "../../src/config/firebase";

export interface NetworkContextType {
  isOnline: boolean;
  networkType: string;
  wasOffline: boolean;
  hasPendingWrites: boolean;
  isSyncing: boolean;
}

export const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  networkType: "unknown",
  wasOffline: false,
  hasPendingWrites: false,
  isSyncing: false,
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [networkType, setNetworkType] = useState<string>("unknown");
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [hasPendingWrites, setHasPendingWrites] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const wasOfflineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOnlineRef = useRef<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!isMounted) return;
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
            if (!isMounted) return;
            setHasPendingWrites(false);
            setIsSyncing(false);
          })
          .catch(() => {
            if (!isMounted) return;
            setIsSyncing(false);
          });

        if (wasOfflineTimer.current) clearTimeout(wasOfflineTimer.current);
        wasOfflineTimer.current = setTimeout(() => {
          if (isMounted) setWasOffline(false);
        }, 4000);
      }

      // When going offline, mark pending writes
      if (!connected && prevOnline) {
        setHasPendingWrites(true);
      }
    });

    // Fetch initial state
    NetInfo.fetch()
      .then((state) => {
        if (!isMounted) return;
        const connected = !!(state.isConnected && state.isInternetReachable !== false);
        setIsOnline(connected);
        setNetworkType(state.type || "unknown");
        prevOnlineRef.current = connected;
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      unsubscribe();
      if (wasOfflineTimer.current) clearTimeout(wasOfflineTimer.current);
    };
  }, []);

  const contextValue = useMemo<NetworkContextType>(
    () => ({ isOnline, networkType, wasOffline, hasPendingWrites, isSyncing }),
    [isOnline, networkType, wasOffline, hasPendingWrites, isSyncing],
  );

  return (
    <NetworkContext.Provider value={contextValue}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextType {
  return useContext(NetworkContext);
}

export default NetworkContext;

