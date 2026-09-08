import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { colors, spacing, radius } from "../theme/theme";

interface GoogleButtonProps {
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function GoogleButton({ onPress, disabled = false, style }: GoogleButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <MaterialIcons name="g-mobiledata" size={28} color="#4285F4" style={styles.icon} />
      <Text style={styles.text}>Continue with Google</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    borderRadius: radius.md,
    height: 52,
    marginTop: spacing.md,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    backgroundColor: "#F9FAFB",
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.secondary,
  },
});
