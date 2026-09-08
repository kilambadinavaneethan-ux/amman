import React from "react";
import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle } from "react-native";
import { colors, spacing, radius } from "../theme/theme";

interface AuthButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  style?: ViewStyle;
}

export default function AuthButton({ title, onPress, loading = false, style }: AuthButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        loading && styles.disabled,
        pressed && !loading && styles.pressed,
        style,
      ]}
      onPress={onPress}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.bg.card} />
      ) : (
        <Text style={styles.text}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.md,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: spacing.sm,
  },
  disabled: {
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    color: colors.bg.card,
    fontSize: 16,
    fontWeight: "700",
  },
});
