import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Animated,
  Modal,
  NativeModules,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { login, loginWithGoogle, loginAnonymously } from "../services/authService";
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

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showGoogleMock, setShowGoogleMock] = useState(false);

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

    // Check remember me email
    AsyncStorage.getItem("@remembered_email").then((savedEmail) => {
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    });
  }, [fadeAnim, slideAnim]);

  const handleLogin = async () => {
    setErrorMsg("");

    // Validations
    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      setErrorMsg("Please enter your email address.");
      return;
    }
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setErrorMsg("Please enter your password.");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      if (rememberMe) {
        await AsyncStorage.setItem("@remembered_email", trimmedEmail);
      } else {
        await AsyncStorage.removeItem("@remembered_email");
      }
      await login(trimmedEmail, password);
      router.replace("/");
    } catch (err: any) {
      let userFriendlyMsg = err.message || "Login failed. Please check credentials.";
      if (userFriendlyMsg.includes("auth/invalid-credential") || userFriendlyMsg.includes("auth/wrong-password")) {
        userFriendlyMsg = "Invalid email or password. Please try again.";
      } else if (userFriendlyMsg.includes("auth/user-not-found")) {
        userFriendlyMsg = "No account found with this email.";
      } else if (userFriendlyMsg.includes("network")) {
        userFriendlyMsg = "Network error. Please check your internet connection.";
      }
      setErrorMsg(userFriendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
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
      await loginWithGoogle(idToken);
      router.replace("/");
    } catch {
      // Fallback to Simulated Mock Modal
      setShowGoogleMock(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMockAccount = async (mockEmail: string, mockName: string) => {
    setShowGoogleMock(false);
    setLoading(true);
    try {
      await AsyncStorage.setItem("@is_mock_google_session", "true");
      await AsyncStorage.setItem("@mock_google_name", mockName);
      await AsyncStorage.setItem("@mock_google_email", mockEmail);
      await loginAnonymously();
      router.replace("/");
    } catch (err: any) {
      setErrorMsg("Failed to authenticate sandbox profile: " + err.message);
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

        <Text style={styles.welcomeText}>Welcome Back</Text>
        <Text style={styles.subWelcomeText}>Sign in to access your business account</Text>

        {/* Inputs */}
        <AuthInput
          label="Email Address"
          icon="email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          editable={!loading}
        />

        <AuthInput
          label="Password"
          icon="lock"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          isPassword
          showPassword={showPassword}
          onTogglePasswordVisibility={() => setShowPassword(!showPassword)}
          editable={!loading}
        />

        {/* Remember Me & Forgot Password */}
        <View style={styles.row}>
          <View style={styles.rememberMeContainer}>
            <Switch
              value={rememberMe}
              onValueChange={setRememberMe}
              trackColor={{ false: colors.border.medium, true: colors.accent.primary }}
              thumbColor={rememberMe ? "#ffffff" : "#f4f3f4"}
              style={styles.switch}
            />
            <Text style={styles.rememberMeText}>Remember Me</Text>
          </View>
          <Pressable onPress={() => router.push("/forgot-password")}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </Pressable>
        </View>

        {/* Error Message Box */}
        {errorMsg ? (
          <View style={styles.errorAlert}>
            <MaterialIcons name="error" size={18} color={colors.accent.danger} />
            <Text style={styles.errorAlertText}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <AuthButton title="Sign In" onPress={handleLogin} loading={loading} />

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google Sign In */}
        <GoogleButton onPress={handleGoogleSignIn} disabled={loading} />

        {/* Footer Link */}
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>Don&apos;t have an account? </Text>
          <Pressable onPress={() => router.push("/signup")}>
            <Text style={styles.footerLinkText}>Create Account</Text>
          </Pressable>
        </View>

      </Animated.View>

      {/* Simulated Sandbox Accounts Modal */}
      <Modal visible={showGoogleMock} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose an account</Text>
            <Text style={styles.modalSubtitle}>to continue to Business Suite sandbox</Text>
            
            <Pressable 
              style={styles.mockAccountRow} 
              onPress={() => handleSelectMockAccount("demo.owner@example.com", "Demo Owner")}
            >
              <View style={styles.mockAvatar}>
                <Text style={styles.mockAvatarText}>DO</Text>
              </View>
              <View style={styles.mockDetails}>
                <Text style={styles.mockName}>Demo Owner</Text>
                <Text style={styles.mockEmail}>demo.owner@example.com</Text>
              </View>
            </Pressable>

            <Pressable 
              style={styles.modalCloseBtn}
              onPress={() => setShowGoogleMock(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  rememberMeContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  switch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
    marginRight: 6,
  },
  rememberMeText: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  forgotText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accent.primary,
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
  modalBg: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...shadows.elevated,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginBottom: spacing.lg,
    fontWeight: "500",
  },
  mockAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.bg.primary,
  },
  mockAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  mockAvatarText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  mockDetails: {
    marginLeft: spacing.md,
  },
  mockName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  mockEmail: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "500",
  },
  modalCloseBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.secondary,
  },
});
