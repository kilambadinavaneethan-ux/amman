import { Slot, usePathname, useRouter } from "expo-router";
import { StyleSheet, View, LogBox } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import React, { useMemo, useState, useEffect, useContext, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BottomNavbar from "./components/BottomNavbar";
import Navbar from "./components/Navbar";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { AlarmProvider } from "./context/AlarmContext";
import { ProfitProvider } from "./context/ProfitContext";
import { AuthProvider, AuthContext } from "./context/AuthContext";
import { CollectorProvider } from "./context/CollectorContext";
import { ContractWorkerProvider } from "./context/ContractWorkerContext";
import { CustomerProvider } from "./context/CustomerContext";
import { DeliveryPartnerProvider } from "./context/DeliveryPartnerContext";
import { ExpenseProvider } from "./context/ExpenseContext";
import { ItemProvider } from "./context/ItemContext";
import { OrderProvider } from "./context/OrderContext";
import { PaymentProvider } from "./context/PaymentContext";
import { RawMaterialProvider } from "./context/RawMaterialContext";
import { RawMaterialSupplierProvider } from "./context/RawMaterialSupplierContext";
import { UserProvider } from "./context/UserContext";
import { WorkerProvider } from "./context/WorkerContext";
import { PopupProvider } from "./context/PopupContext";
import { ScrollProvider } from "./context/ScrollContext";
import { NotificationProvider } from "./context/NotificationContext";
import { NetworkProvider, useNetwork } from "./context/NetworkContext";
import OfflineBanner from "./components/OfflineBanner";
import * as SplashScreen from "expo-splash-screen";
import { PremiumSplash } from "./components/PremiumSplash";
import AuthSplashScreen from "../src/screens/SplashScreen";
import * as RN from "react-native";

// Ignore harmless transient console logs from showing up in LogBox popup UI
LogBox.ignoreLogs([
  "Firestore shutting down",
  "Firestore has already been started",
  "BloomFilter error",
  "BloomFilterError",
]);

// Intercept Firestore shutting down and other transient errors to prevent red screen crashes in development
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");

  if (
    message.includes("Firestore shutting down") ||
    message.includes("Firestore has already been started") ||
    message.includes("is shutting down") ||
    message.includes("Missing or insufficient permissions") ||
    message.includes("Insufficient permissions") ||
    message.includes("Permission Denied") ||
    message.includes("Failed migrating") ||
    message.includes("Migration runner encountered error") ||
    message.includes("Could not reach Cloud Firestore backend") ||
    message.includes("Backend didn't respond within 10 seconds") ||
    message.includes("offline mode until it is able to successfully connect")
  ) {
    // Suppress red screens for known transient/permission errors, especially on project switch
    if (
      message.includes("Missing or insufficient permissions") ||
      message.includes("Insufficient permissions") ||
      message.includes("Permission Denied")
    ) {
      console.log("[Firestore] Skipped operation due to missing permissions (user not logged in or rules locked):", message);
    } else if (
      message.includes("Could not reach Cloud Firestore backend") ||
      message.includes("Backend didn't respond within 10 seconds")
    ) {
      console.log("[Firestore] Operating in offline mode: client could not reach backend.");
    } else {
      console.warn("[Firebase-Intercepted-Error]", ...args);
    }
    return;
  }
  originalConsoleError(...args);
};

// Intercept console.warn to suppress BloomFilter warning pollution in Metro terminal logs
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  const message = args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");

  if (message.includes("BloomFilter error") || message.includes("BloomFilterError")) {
    return;
  }
  originalConsoleWarn(...args);
};

// Prevent the native splash screen from auto-hiding to avoid black flicker
SplashScreen.preventAutoHideAsync().catch(() => {});

function AppContent() {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthScreen = pathname === "/login" || pathname === "/signup" || pathname === "/forgot-password";
  const { theme } = useTheme();
  const { user, loading: authLoading } = useContext(AuthContext);
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);
  
  const styles = useMemo(() => getStyles(theme), [theme]);

  useEffect(() => {
    if (!authLoading && user && isAuthScreen) {
      router.replace("/");
    }
  }, [user, authLoading, isAuthScreen, router]);

  const checkBackgroundAutoBackup = async () => {
    try {
      const autoEnabled = await AsyncStorage.getItem("backup_auto_enabled");
      if (autoEnabled !== "true") return;

      const frequency = (await AsyncStorage.getItem("backup_auto_frequency")) || "weekly";
      const lastTs = await AsyncStorage.getItem("backup_last_auto_ts");

      const getIntervalMs = (freq) => {
        if (freq === "daily") return 24 * 60 * 60 * 1000;
        if (freq === "monthly") return 30 * 24 * 60 * 60 * 1000;
        return 7 * 24 * 60 * 60 * 1000; // default weekly
      };

      const intervalMs = getIntervalMs(frequency);
      const now = Date.now();

      if (!lastTs || now - parseInt(lastTs, 10) >= intervalMs) {
        const { DEFAULT_FIREBASE_CONFIG } = require("../src/config/firebase");
        const { createDatabaseBackup } = require("../src/services/backupService");
        const { db } = require("../src/config/firebase");

        const config = DEFAULT_FIREBASE_CONFIG;
        console.log("[AutoBackup] Starting silent background auto-backup...");
        const result = await createDatabaseBackup(db, config);
        if (result.success && result.backup) {
          console.log("[AutoBackup] Background auto-backup created successfully:", result.backup.fileName);
          await AsyncStorage.setItem("backup_last_auto_ts", String(now));
        } else {
          console.log("[AutoBackup] Background auto-backup check skipped or failed:", result.error || "no result");
        }
      }
    } catch (e) {
      console.log("[AutoBackup] Background auto-backup encountered error:", e.message || e);
    }
  };

  useEffect(() => {
    // Hide native splash screen once the custom animated splash mounts
    SplashScreen.hideAsync().catch(() => {});
    
    // Trigger background auto backup check
    checkBackgroundAutoBackup().catch((err) => {
      console.log("[AutoBackup] Silent run failed:", err.message);
    });
  }, []);

  const { isOnline, wasOffline } = useNetwork();
  const showBanner = !isAuthScreen && (!isOnline || wasOffline);

  return (
    <View style={styles.container}>
      <StatusBar style={showBanner ? "light" : (theme.isDark ? "light" : "dark")} />
      {!isAuthScreen && <OfflineBanner />}
      {!isAuthScreen && <Navbar />}
      <View style={styles.content}>
        <Slot />
      </View>
      {!isAuthScreen && <BottomNavbar />}
      
      {showSplash && (
        <PremiumSplash onFinish={handleSplashFinish} />
      )}
    </View>
  );
}

function AppContentWithContexts() {
  const { user, loading: authLoading } = useContext(AuthContext);

  if (authLoading) {
    return <AuthSplashScreen />;
  }

  if (!user) {
    return <AppContent />;
  }

  return (
    <ItemProvider>
      <CustomerProvider>
        <DeliveryPartnerProvider>
          <CollectorProvider>
            <OrderProvider>
              <ExpenseProvider>
                <PaymentProvider>
                  <AlarmProvider>
                    <ProfitProvider>
                      <RawMaterialProvider>
                        <RawMaterialSupplierProvider>
                          <WorkerProvider>
                            <ContractWorkerProvider>
                              <NotificationProvider>
                                <AppContent />
                              </NotificationProvider>
                            </ContractWorkerProvider>
                          </WorkerProvider>
                        </RawMaterialSupplierProvider>
                      </RawMaterialProvider>
                    </ProfitProvider>
                  </AlarmProvider>
                </PaymentProvider>
              </ExpenseProvider>
            </OrderProvider>
          </CollectorProvider>
        </DeliveryPartnerProvider>
      </CustomerProvider>
    </ItemProvider>
  );
}

import { ZoomProvider } from "./context/ZoomContext";

export default function Layout() {
  return (
    <SafeAreaProvider>
      <NetworkProvider>
        <ThemeProvider>
          <ScrollProvider>
            <ZoomProvider>
              <View style={{ flex: 1 }}>
                <PopupProvider>
                  <AuthProvider>
                    <UserProvider>
                      <AppContentWithContexts />
                    </UserProvider>
                  </AuthProvider>
                </PopupProvider>
              </View>
            </ZoomProvider>
          </ScrollProvider>
        </ThemeProvider>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg.primary,
  },
  content: {
    flex: 1,
  },
});

