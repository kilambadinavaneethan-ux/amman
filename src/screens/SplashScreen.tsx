import React from "react";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { colors, spacing } from "../theme/theme";

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logoWrapper}>
        <MaterialIcons name="storefront" size={64} color={colors.accent.primary} />
      </View>
      <Text style={styles.title}>Business Suite</Text>
      <Text style={styles.subtitle}>Securing connection...</Text>
      <ActivityIndicator size="small" color={colors.accent.primary} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg.primary,
  },
  logoWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.bg.card,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.muted,
  },
  loader: {
    marginTop: spacing.xl,
  },
});
