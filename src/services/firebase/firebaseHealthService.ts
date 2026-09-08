import { db, auth } from "../../config/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc, query, limit } from "firebase/firestore";
import { addSystemLog } from "./firebaseConnectionService";

export interface HealthStatus {
  internet: { passed: boolean; reason?: string };
  initialization: { passed: boolean; reason?: string };
  auth: { passed: boolean; reason?: string };
  firestoreRead: { passed: boolean; reason?: string };
  firestoreWrite: { passed: boolean; reason?: string };
}

export async function runFirebaseHealthCheck(): Promise<HealthStatus> {
  const result: HealthStatus = {
    internet: { passed: false },
    initialization: { passed: false },
    auth: { passed: false },
    firestoreRead: { passed: false },
    firestoreWrite: { passed: false },
  };

  // 1. Internet Connection Check
  try {
    const res = await fetch("https://www.google.com", { method: "HEAD", cache: "no-store" });
    if (res.ok || res.status < 500) {
      result.internet = { passed: true };
    } else {
      result.internet = { passed: false, reason: `Failed with status ${res.status}` };
    }
  } catch (e: any) {
    result.internet = { passed: false, reason: e.message || "No internet connection detected." };
    // Skip checking other services if there's no internet
    return result;
  }

  // 2. Firebase Initialization Check
  try {
    if (db && auth) {
      result.initialization = { passed: true };
    } else {
      result.initialization = { passed: false, reason: "Firestore or Auth client reference is missing." };
      return result;
    }
  } catch (e: any) {
    result.initialization = { passed: false, reason: e.message || "Firebase client is not initialised." };
    return result;
  }

  // 3. Authentication Connection Check
  try {
    if (auth.currentUser !== undefined) {
      result.auth = { passed: true };
    } else {
      result.auth = { passed: false, reason: "CurrentUser auth instance is undefined." };
    }
  } catch (e: any) {
    result.auth = { passed: false, reason: e.message || "Failed to inspect auth connection." };
  }

  // 4. Firestore Read Access Check
  try {
    const q = query(collection(db, "items"), limit(1));
    await getDocs(q);
    result.firestoreRead = { passed: true };
  } catch (e: any) {
    result.firestoreRead = { passed: false, reason: e.message || "Failed to query items collection (Read denied)." };
  }

  // 5. Firestore Write Access Check
  try {
    const tempRef = doc(collection(db, "connection_tests"));
    await setDoc(tempRef, { test: true, timestamp: Date.now() });
    await deleteDoc(tempRef);
    result.firestoreWrite = { passed: true };
  } catch (e: any) {
    result.firestoreWrite = { passed: false, reason: e.message || "Failed to set test document (Write rules block)." };
  }

  // Log results
  const allPassed = Object.values(result).every((r) => r.passed);
  if (allPassed) {
    await addSystemLog("Health Check Passed");
  } else {
    await addSystemLog("Health Check Failed");
  }

  return result;
}
