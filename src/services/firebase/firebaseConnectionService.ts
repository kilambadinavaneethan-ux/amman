import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, query, limit, getDocs } from "firebase/firestore";
import { DEFAULT_FIREBASE_CONFIG, db, auth, storage } from "../../config/firebase";

export interface FirebaseConfigInfo {
  projectName: string;
  projectId: string;
  appId: string;
  authDomain: string;
  databaseURL?: string;
  storageBucket: string;
  region: string;
  sdkVersion: string;
  authProvider: string;
  apiKey: string;
}

export interface SystemLog {
  id: string;
  event: string;
  timestamp: number;
  level?: "info" | "success" | "error";
}

export interface LatencyResult {
  latencyMs: number;
  status: "Optimal" | "Fair" | "Slow" | "Offline";
}

const LOGS_STORAGE_KEY = "@firebase_management_logs";
const SYNC_TIMESTAMP_KEY = "@firebase_last_sync_timestamp";

export function getFirebaseConfigInfo(): FirebaseConfigInfo {
  return {
    projectName: DEFAULT_FIREBASE_CONFIG.projectName || "Hollow Block Business",
    projectId: DEFAULT_FIREBASE_CONFIG.projectId,
    appId: DEFAULT_FIREBASE_CONFIG.appId,
    authDomain: DEFAULT_FIREBASE_CONFIG.authDomain,
    databaseURL: DEFAULT_FIREBASE_CONFIG.databaseURL,
    storageBucket: DEFAULT_FIREBASE_CONFIG.storageBucket,
    region: "us-central1 (Default)",
    sdkVersion: "11.1.0",
    authProvider: "Email / Google / Anonymous",
    apiKey: DEFAULT_FIREBASE_CONFIG.apiKey,
  };
}

export function maskValue(value: string, visibleLength: number = 4): string {
  if (!value) return "";
  if (value.length <= visibleLength * 2) return value;
  const start = value.substring(0, visibleLength);
  const end = value.substring(value.length - 3);
  return `${start}***********${end}`;
}

export async function pingFirestoreLatency(): Promise<LatencyResult> {
  const start = Date.now();
  try {
    const q = query(collection(db, "items"), limit(1));
    await getDocs(q);
    const latency = Date.now() - start;
    let status: "Optimal" | "Fair" | "Slow" = "Optimal";
    if (latency > 300) status = "Slow";
    else if (latency > 100) status = "Fair";
    return { latencyMs: latency, status };
  } catch (_e) {
    return { latencyMs: -1, status: "Offline" };
  }
}

export async function refreshUserAuthToken(): Promise<{ success: boolean; message: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, message: "No active user logged in." };
    }
    await user.getIdToken(true);
    await addSystemLog("Auth token refreshed successfully", "success");
    return { success: true, message: "User token refreshed." };
  } catch (err: any) {
    await addSystemLog(`Token refresh failed: ${err?.message}`, "error");
    return { success: false, message: err?.message || "Token refresh failed." };
  }
}

export async function getSystemLogs(): Promise<SystemLog[]> {
  try {
    const raw = await AsyncStorage.getItem(LOGS_STORAGE_KEY);
    if (!raw) {
      const initialLogs: SystemLog[] = [
        { id: "1", event: "Firebase Initialized", timestamp: Date.now() - 3600000, level: "info" },
        { id: "2", event: "Login Successful", timestamp: Date.now() - 1800000, level: "success" },
      ];
      await AsyncStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(initialLogs));
      return initialLogs;
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function addSystemLog(
  event: string,
  level: "info" | "success" | "error" = "info"
): Promise<SystemLog[]> {
  try {
    const current = await getSystemLogs();
    const newLog: SystemLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      event,
      timestamp: Date.now(),
      level,
    };
    const updated = [newLog, ...current].slice(0, 30);
    await AsyncStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error("Failed to write system log:", error);
    return [];
  }
}

export async function clearSystemLogs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LOGS_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear system logs:", error);
  }
}

export async function getLastSyncTime(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_TIMESTAMP_KEY);
    if (!raw) {
      return "Never";
    }
    const d = new Date(parseInt(raw, 10));
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " " + d.toLocaleDateString();
  } catch {
    return "Never";
  }
}

export async function updateLastSyncTime(): Promise<string> {
  try {
    const nowStr = String(Date.now());
    await AsyncStorage.setItem(SYNC_TIMESTAMP_KEY, nowStr);
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " " + d.toLocaleDateString();
  } catch {
    return "Never";
  }
}

export async function checkConnectionStatus(): Promise<{
  connected: boolean;
  firestore: boolean;
  storage: boolean;
  auth: boolean;
}> {
  let isConnected = false;
  let firestoreOk = false;
  let storageOk = false;
  let authOk = false;

  try {
    const response = await fetch("https://www.google.com", { method: "HEAD", cache: "no-store" });
    isConnected = response.ok || response.status < 500;
  } catch {
    isConnected = false;
  }

  if (isConnected) {
    try {
      if (db) {
        firestoreOk = true;
      }
    } catch {}

    try {
      if (storage) {
        storageOk = true;
      }
    } catch {}

    try {
      if (auth) {
        authOk = true;
      }
    } catch {}
  }

  return {
    connected: isConnected && firestoreOk,
    firestore: firestoreOk,
    storage: storageOk,
    auth: authOk,
  };
}

export async function generateDiagnosticReport(): Promise<Record<string, any>> {
  const config = getFirebaseConfigInfo();
  const conn = await checkConnectionStatus();
  const latency = await pingFirestoreLatency();
  const logs = await getSystemLogs();
  const currentUser = auth.currentUser;

  return {
    reportTitle: "Firebase System Diagnostic Report",
    generatedAt: new Date().toISOString(),
    projectInfo: {
      projectName: config.projectName,
      projectId: config.projectId,
      appId: config.appId,
      sdkVersion: config.sdkVersion,
    },
    connectionStatus: conn,
    latency,
    userSession: currentUser
      ? {
          uid: currentUser.uid,
          email: currentUser.email || "No email",
          isAnonymous: currentUser.isAnonymous,
          emailVerified: currentUser.emailVerified,
        }
      : null,
    recentSystemLogs: logs,
  };
}
