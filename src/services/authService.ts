import { NativeModules } from "react-native";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithCredential,
  signInAnonymously,
  updateProfile as firebaseUpdateProfile,
  UserCredential,
} from "firebase/auth";
import { auth } from "../config/firebase";

export async function signup(email: string, password: any, displayName: any): Promise<UserCredential> {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && userCredential.user) {
    await firebaseUpdateProfile(userCredential.user, { displayName });
  }
  return userCredential;
}

export async function login(email: string, password: any): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithGoogle(idToken: string): Promise<UserCredential> {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

export async function loginAnonymously(): Promise<UserCredential> {
  return signInAnonymously(auth);
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

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
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
  return firebaseSignOut(auth);
}
