import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, NativeModules } from "react-native";
import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import {
    Auth,
    deleteUser,
    EmailAuthProvider,
    initializeAuth,
    getAuth,
    browserLocalPersistence,
    inMemoryPersistence,
    reauthenticateWithCredential,
    updatePassword,
    signOut,
} from "firebase/auth";
// @ts-ignore - getReactNativePersistence is only available in React Native environments and missing in default web typings
import { getReactNativePersistence } from "firebase/auth";
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";

// Helper function to safely get persistence for both Native and Web/SSR
function getPersistence() {
  if (Platform.OS === "web") {
    return typeof window !== "undefined" ? browserLocalPersistence : inMemoryPersistence;
  }
  if (typeof getReactNativePersistence === "function") {
    return getReactNativePersistence(ReactNativeAsyncStorage);
  }
  return inMemoryPersistence;
}

// Default Firebase Configuration
export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCRYgLcDyTRACUKr9XEPCRnXT7hrsxOYQ8",
  authDomain: "hollow-block-app.firebaseapp.com",
  databaseURL: "https://hollow-block-app-default-rtdb.firebaseio.com",
  projectId: "hollow-block-app",
  storageBucket: "hollow-block-app.firebasestorage.app",
  messagingSenderId: "175461109902",
  appId: "1:175461109902:web:394a555edb70bcdb7db9df",
  measurementId: "G-KBVC7W0BX8",
  projectName: "Hollow Block App",
};

// Live-bound Firebase instances
export let app: FirebaseApp;
export let auth: Auth;
export let db: Firestore;
export let storage: FirebaseStorage;
export let currentConfig = { ...DEFAULT_FIREBASE_CONFIG };

// Normalize dates from firestore
export function normalizeDateValue(value: any, fallback = new Date()): Date {
  if (value instanceof Date) return isNaN(value.getTime()) ? fallback : value;

  if (!value) {
    return fallback instanceof Date ? fallback : new Date(fallback);
  }

  if (typeof value.toDate === "function") {
    try {
      const d = value.toDate();
      return isNaN(d.getTime()) ? fallback : d;
    } catch (error) {
    }
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? fallback : d;
  }

  if (typeof value === "string") {
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const year = parseInt(dateOnlyMatch[1], 10);
      const month = parseInt(dateOnlyMatch[2], 10) - 1;
      const day = parseInt(dateOnlyMatch[3], 10);
      return new Date(year, month, day);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (value && typeof value === "object") {
    if (typeof value.seconds === "number") {
      return new Date(value.seconds * 1000);
    }

    if (typeof value.toMillis === "function") {
      try {
        const d = new Date(value.toMillis());
        return isNaN(d.getTime()) ? fallback : d;
      } catch (error) {
      }
    }
  }

  return fallback instanceof Date ? fallback : new Date(fallback);
}

function isGoogleSigninAvailable(): boolean {
  try {
    if (NativeModules && NativeModules.RNGoogleSignin) return true;
    const { TurboModuleRegistry } = require("react-native");
    return !!(TurboModuleRegistry && TurboModuleRegistry.get("RNGoogleSignin"));
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  try {
    if (isGoogleSigninAvailable()) {
      const GoogleSignin = require("@react-native-google-signin/google-signin").GoogleSignin;
      const isSignedIn = await GoogleSignin.isSignedIn();
      if (isSignedIn) {
        await GoogleSignin.signOut();
      }
    }
  } catch (err) {
    console.warn("Failed Google SignOut during logout:", err);
  }
  return signOut(auth);
}

export async function changeUserPassword(oldPassword: any, newPassword: any) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("No user currently logged in.");

  const credential = EmailAuthProvider.credential(user.email, oldPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function deleteCurrentUserAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error("No user currently logged in.");
  await deleteUser(user);
}

// Helper: initialize Firestore with appropriate cache mechanism for platform
function getOfflineFirestore(firebaseApp: FirebaseApp): Firestore {
  try {
    const localCache =
      Platform.OS === "web"
        ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
        : memoryLocalCache();

    return initializeFirestore(firebaseApp, {
      localCache,
    });
  } catch (error: any) {
    // If already initialized (e.g. hot-reload), fall back to getFirestore
    if (error?.code === "failed-precondition" || error?.message?.includes("already")) {
      return getFirestore(firebaseApp);
    }
    return getFirestore(firebaseApp);
  }
}

// Synchronous default initialization on load
const activeApps = getApps();
if (activeApps.length === 0) {
  app = initializeApp(DEFAULT_FIREBASE_CONFIG);
  try {
    auth = initializeAuth(app, {
      persistence: getPersistence(),
    });
  } catch (error) {
    auth = getAuth(app);
  }
  db = getOfflineFirestore(app);
  storage = getStorage(app);
} else {
  app = activeApps[0];
  try {
    auth = initializeAuth(app, {
      persistence: getPersistence(),
    });
  } catch (error) {
    auth = getAuth(app);
  }
  db = getOfflineFirestore(app);
  storage = getStorage(app);
}