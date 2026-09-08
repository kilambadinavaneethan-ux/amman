import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { sendPasswordReset } from "../services/authService";
import { colors, radius, spacing, shadows } from "../theme/theme";
import AuthInput from "../components/AuthInput";
import AuthButton from "../components/AuthButton";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Inputs
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async () => {
    setErrorMsg("");
    setSuccessMsg("");

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

    setLoading(true);
    try {
      await sendPasswordReset(trimmedEmail);
      setSuccessMsg("We sent a password reset link to your email address.");
      setEmail("");
    } catch (err: any) {
      let friendlyError = err.message || "Failed to send reset email. Please try again.";
      if (friendlyError.includes("auth/user-not-found")) {
        friendlyError = "No account exists with this email address.";
      }
      setErrorMsg(friendlyError);
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

          <Text style={styles.welcomeText}>Forgot Password</Text>
          <Text style={styles.subWelcomeText}>Enter your email to receive a password reset link</Text>

          {/* Input */}
          <AuthInput
            label="Email Address"
            icon="email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />

          {/* Success / Error Boxes */}
          {errorMsg ? (
            <View style={styles.errorAlert}>
              <MaterialIcons name="error" size={18} color={colors.accent.danger} />
              <Text style={styles.errorAlertText}>{errorMsg}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View style={styles.successAlert}>
              <MaterialIcons name="check-circle" size={18} color={colors.accent.success} />
              <Text style={styles.successAlertText}>{successMsg}</Text>
            </View>
          ) : null}

          {/* Action Button */}
          <AuthButton title="Send Reset Email" onPress={handleSubmit} loading={loading} />

          {/* Back Link */}
          <View style={styles.footerContainer}>
            <Pressable onPress={() => router.push("/login")} style={styles.backRow}>
              <MaterialIcons name="arrow-back" size={18} color={colors.accent.primary} />
              <Text style={styles.footerLinkText}>Back to Login</Text>
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
  successAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: colors.accent.success,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  successAlertText: {
    color: colors.accent.success,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },
  footerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xl,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerLinkText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accent.primary,
  },
});
