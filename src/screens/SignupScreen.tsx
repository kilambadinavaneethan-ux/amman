import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Animated,
  NativeModules,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { signup, loginWithGoogle } from "../services/authService";
import { db } from "../config/firebase";
import { colors, radius, spacing, shadows } from "../theme/theme";
import AuthInput from "../components/AuthInput";
import AuthButton from "../components/AuthButton";
import GoogleButton from "../components/GoogleButton";

function isGoogleSigninAvailable(): boolean {
  try {
    if (NativeModules && NativeModules.RNGoogleSignin) return true;
    const { TurboModuleRegistry } = require("react-native");
    return !!(TurboModuleRegistry && TurboModuleRegistry.get("RNGoogleSignin"));
  } catch {
    return false;
  }
}

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Form states
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);

  // UI States
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: "None", color: colors.border.medium });

  // Animations
  const fadeAnim = useMemo(() => new Animated.Value(0), []);
  const slideAnim = useMemo(() => new Animated.Value(30), []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Password strength checker
  useEffect(() => {
    if (!password) {
      setPasswordStrength({ score: 0, label: "None", color: colors.border.medium });
      return;
    }

    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    let label = "Weak";
    let color = colors.accent.danger;

    if (score === 2) {
      label = "Fair";
      color = colors.accent.warning;
    } else if (score === 3) {
      label = "Good";
      color = colors.accent.info;
    } else if (score === 4) {
      label = "Strong";
      color = colors.accent.success;
    }

    setPasswordStrength({ score, label, color });
  }, [password]);

  const handleSubmit = async () => {
    setErrorMsg("");

    // Validations
    if (!fullName.trim()) return setErrorMsg("Full Name is required.");
    if (!businessName.trim()) return setErrorMsg("Business Name is required.");
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      return setErrorMsg("Please enter a valid email address.");
    }

    if (password.length < 8) {
      return setErrorMsg("Password must be at least 8 characters long.");
    }

    if (password !== confirmPassword) {
      return setErrorMsg("Passwords do not match.");
    }

    if (!agreeTerms) {
      return setErrorMsg("You must agree to the Terms & Conditions to create an account.");
    }

    setLoading(true);

    try {
      // 1. Create Firebase Auth user
      const userCredential = await signup(email.trim(), password, fullName.trim());
      const user = userCredential.user;

      // 2. Create Firestore User Profile Document
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, {
        uid: user.uid,
        fullName: fullName.trim(),
        businessName: businessName.trim(),
        email: email.trim().toLowerCase(),
        mobile: mobile.trim(),
        photoURL: "",
        provider: "email",
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        role: "owner",
        isActive: true,
      });

      // 3. Reset form and navigate
      setFullName("");
      setBusinessName("");
      setEmail("");
      setMobile("");
      setPassword("");
      setConfirmPassword("");
      router.replace("/");
    } catch (err: any) {
      let friendlyError = err.message || "Failed to create account. Please try again.";
      if (friendlyError.includes("auth/email-already-in-use")) {
        friendlyError = "This email address is already in use by another account.";
      }
      setErrorMsg(friendlyError);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setErrorMsg("");
    setLoading(true);
    try {
      if (!isGoogleSigninAvailable()) {
        throw new Error("Google Sign-In is not supported in this environment.");
      }
      const GoogleSigninModule = require("@react-native-google-signin/google-signin").GoogleSignin;
      GoogleSigninModule.configure({
        webClientId: "175461109902-hollow-block-web-google-oauth.apps.googleusercontent.com",
        offlineAccess: true,
      });
      await GoogleSigninModule.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const { idToken } = await GoogleSigninModule.signIn();
      if (!idToken) {
        throw new Error("No ID Token returned from Google Sign-In.");
      }
      const userCredential = await loginWithGoogle(idToken);
      const user = userCredential.user;

      // Create profile document if first time
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, {
        uid: user.uid,
        fullName: user.displayName || "Google User",
        businessName: "My Business",
        email: user.email || "",
        mobile: user.phoneNumber || "",
        photoURL: user.photoURL || "",
        provider: "google",
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        role: "owner",
        isActive: true,
      }, { merge: true });

      router.replace("/");
    } catch (err: any) {
      setErrorMsg("Google Registration failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(insets.top + 16, 24),
            paddingBottom: Math.max(insets.bottom + 16, 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.logoWrapper}>
            <MaterialIcons name="storefront" size={32} color={colors.accent.primary} />
          </View>
          <Text style={styles.brandTitle}>Business Suite</Text>
          <Text style={styles.brandSubtitle}>Manage operations & analytics in real time</Text>
        </View>

        <Text style={styles.welcomeText}>Create Account</Text>
        <Text style={styles.subWelcomeText}>Register your business to get started</Text>

        {/* Inputs */}
        <AuthInput
          label="Full Name *"
          icon="person"
          value={fullName}
          onChangeText={setFullName}
          placeholder="e.g. Ramesh Kumar"
          editable={!loading}
        />

        <AuthInput
          label="Business Name *"
          icon="business"
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="e.g. Ramesh Blocks"
          editable={!loading}
        />

        <AuthInput
          label="Email Address *"
          icon="email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!loading}
        />

        <AuthInput
          label="Mobile Number"
          icon="phone"
          value={mobile}
          onChangeText={setMobile}
          placeholder="e.g. 9876543210"
          keyboardType="phone-pad"
          editable={!loading}
        />

        <AuthInput
          label="Password *"
          icon="lock"
          value={password}
          onChangeText={setPassword}
          placeholder="Minimum 8 characters"
          isPassword
          editable={!loading}
        />

        {/* Password Strength Indicator */}
        {password ? (
          <View style={styles.strengthContainer}>
            <Text style={styles.strengthLabel}>
              Strength: <Text style={{ color: passwordStrength.color, fontWeight: "700" }}>{passwordStrength.label}</Text>
            </Text>
            <View style={styles.strengthBarBg}>
              <View 
                style={[
                  styles.strengthBar, 
                  { 
                    width: `${(passwordStrength.score / 4) * 100}%`,
                    backgroundColor: passwordStrength.color 
                  }
                ]} 
              />
            </View>
          </View>
        ) : null}

        <AuthInput
          label="Confirm Password *"
          icon="lock"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter password"
          isPassword
          editable={!loading}
        />

        {/* Terms Switch */}
        <View style={styles.switchRow}>
          <Switch
            value={agreeTerms}
            onValueChange={setAgreeTerms}
            trackColor={{ false: colors.border.medium, true: colors.accent.primary }}
            thumbColor={agreeTerms ? "#ffffff" : "#f4f3f4"}
            style={styles.switch}
          />
          <Text style={styles.switchLabel}>
            I agree to the <Text style={styles.termsText}>Terms & Conditions</Text>
          </Text>
        </View>

        {/* Error Box */}
        {errorMsg ? (
          <View style={styles.errorAlert}>
            <MaterialIcons name="error" size={18} color={colors.accent.danger} />
            <Text style={styles.errorAlertText}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Register Button */}
        <AuthButton title="Register" onPress={handleSubmit} loading={loading} />

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google Register */}
        <GoogleButton onPress={handleGoogleSignUp} disabled={loading} />

        {/* Footer Link */}
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Pressable onPress={() => router.push("/login")}>
            <Text style={styles.footerLinkText}>Login</Text>
          </Pressable>
        </View>

      </Animated.View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.bg.primary,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.bg.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.xl,
    ...shadows.elevated,
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  logoWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent.primaryMuted,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border.accent,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: "center",
    marginTop: 2,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.primary,
  },
  subWelcomeText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: spacing.xl,
  },
  strengthContainer: {
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  strengthLabel: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "600",
    marginBottom: 4,
  },
  strengthBarBg: {
    height: 4,
    backgroundColor: colors.border.medium,
    borderRadius: 2,
    overflow: "hidden",
  },
  strengthBar: {
    height: "100%",
    borderRadius: 2,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.md,
  },
  switch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
    marginRight: 6,
  },
  switchLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  termsText: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent.dangerMuted,
    borderWidth: 1,
    borderColor: colors.accent.danger,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  errorAlertText: {
    color: colors.accent.danger,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.medium,
  },
  dividerText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "700",
    marginHorizontal: spacing.md,
  },
  footerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xl,
  },
  footerText: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  footerLinkText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accent.primary,
  },
});
