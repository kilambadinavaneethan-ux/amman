import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { createContext, useEffect, useState, useContext, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db, storage } from "../../src/config/firebase";
import { AuthContext } from "./AuthContext";
import { uploadImage } from "../../services/storage";
import { STORAGE_FOLDERS } from "../../constants/storageFolders";

export const UserContext = createContext(null);

export function UserProvider({ children }) {
  const { user, loading: authLoading } = useContext(AuthContext);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    const cacheKey = `@cached_user_profile_${user.uid}`;

    // 1. Immediately hydrate from local AsyncStorage for zero-delay UI
    AsyncStorage.getItem(cacheKey)
      .then((cached) => {
        if (cached && isMounted) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && typeof parsed === "object") {
              setProfile((prev) => prev || parsed);
              setLoading(false);
            }
          } catch (e) {
            console.warn("Failed to parse cached user profile:", e);
          }
        }
      })
      .catch(() => {});

    // 2. Realtime listener to Firestore user document
    const userDocRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      async (docSnap) => {
        if (!isMounted) return;

        if (docSnap.exists()) {
          const profileData = { id: docSnap.id, ...docSnap.data() };
          setProfile(profileData);
          setLoading(false);

          try {
            await AsyncStorage.setItem(cacheKey, JSON.stringify(profileData));
          } catch (e) {
            console.warn("Failed to cache user profile:", e);
          }
        } else {
          // Profile does not exist yet (e.g. first-time Google sign-in or brand new account)
          const isMockGoogle = (await AsyncStorage.getItem("@is_mock_google_session")) === "true";
          const mockName = (await AsyncStorage.getItem("@mock_google_name")) || "Google Owner";
          const mockEmail = (await AsyncStorage.getItem("@mock_google_email")) || user.email || "";

          if (isMockGoogle) {
            await AsyncStorage.removeItem("@is_mock_google_session");
            await AsyncStorage.removeItem("@mock_google_name");
            await AsyncStorage.removeItem("@mock_google_email");
          }

          const providerId = user.providerData?.[0]?.providerId || "email";
          const isGoogle = providerId.includes("google") || isMockGoogle;

          const newProfile = {
            uid: user.uid,
            fullName: isMockGoogle ? mockName : (user.displayName || "Business Owner"),
            businessName: "My Business",
            email: isMockGoogle ? mockEmail : (user.email || ""),
            mobile: user.phoneNumber || "",
            phone: user.phoneNumber || "",
            photoURL: user.photoURL || "",
            logoUrl: user.photoURL || "",
            provider: isGoogle ? "google" : "email",
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            role: "owner",
          };

          try {
            await setDoc(userDocRef, newProfile, { merge: true });
            if (isMounted) {
              setProfile(newProfile);
              setLoading(false);
              await AsyncStorage.setItem(cacheKey, JSON.stringify(newProfile));
            }
          } catch (err) {
            if (isMounted) {
              setProfile(newProfile);
              setLoading(false);
            }
          }
        }
      },
      (error) => {
        console.warn("User profile onSnapshot error:", error);
        if (isMounted) {
          setLoading(false);
        }
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user, authLoading]);

  const updateProfile = async (updates) => {
    if (!user) return false;
    try {
      const userDocRef = doc(db, "users", user.uid);
      const cleanUpdates = { ...updates };

      // Ensure alias fields are synchronized across the entire app
      if (cleanUpdates.mobile && !cleanUpdates.phone) {
        cleanUpdates.phone = cleanUpdates.mobile;
      }
      if (cleanUpdates.phone && !cleanUpdates.mobile) {
        cleanUpdates.mobile = cleanUpdates.phone;
      }
      if (cleanUpdates.gstin) {
        cleanUpdates.gstNo = cleanUpdates.gstin;
        cleanUpdates.taxId = cleanUpdates.gstin;
      }
      if (cleanUpdates.photoURL) {
        cleanUpdates.logoUrl = cleanUpdates.photoURL;
      }

      // Optimistically update local profile and async cache
      const updatedProfile = {
        ...(profile || {}),
        ...cleanUpdates,
        id: user.uid,
        uid: user.uid,
        updatedAt: new Date(),
      };
      setProfile(updatedProfile);

      const cacheKey = `@cached_user_profile_${user.uid}`;
      AsyncStorage.setItem(cacheKey, JSON.stringify(updatedProfile)).catch(() => {});

      await setDoc(
        userDocRef,
        {
          ...cleanUpdates,
          updatedAt: new Date(),
        },
        { merge: true },
      );
      return true;
    } catch (error) {
      console.error("UserContext updateProfile error:", error);
      return false;
    }
  };

  const uploadProfileImage = async (uri, autoUpdateDoc = false) => {
    if (!uri || !user) return null;
    try {
      const res = await uploadImage({
        uri,
        folder: STORAGE_FOLDERS.PROFILE,
        entityId: user.uid,
        userId: user.uid,
      });

      if (res.success && res.publicUrl) {
        if (autoUpdateDoc) {
          await updateProfile({ photoURL: res.publicUrl, logoUrl: res.publicUrl });
        }
        return res.publicUrl;
      }
      return uri;
    } catch (error) {
      console.error("Profile image upload error:", error);
      return uri;
    }
  };

  const contextValue = useMemo(
    () => ({
      profile,
      loading: loading || authLoading,
      updateProfile,
      uploadProfileImage,
    }),
    [profile, loading, authLoading],
  );

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
}

export default function UserRoutePlaceholder() {
  return null;
}