import React from "react";
import { View, Text, TextInput, StyleSheet, Pressable, TextInputProps } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { colors, spacing, radius } from "../theme/theme";

interface AuthInputProps extends TextInputProps {
  label: string;
  icon: string;
  isPassword?: boolean;
  showPassword?: boolean;
  onTogglePasswordVisibility?: () => void;
}

export default function AuthInput({
  label,
  icon,
  isPassword = false,
  showPassword = false,
  onTogglePasswordVisibility,
  style,
  ...props
}: AuthInputProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.wrapper}>
        <MaterialIcons name={icon as any} size={20} color={colors.text.muted} style={styles.icon} />
        <TextInput
          style={[styles.input, style]}
          secureTextEntry={isPassword && !showPassword}
          placeholderTextColor={colors.text.muted}
          {...props}
        />
        {isPassword && onTogglePasswordVisibility && (
          <Pressable onPress={onTogglePasswordVisibility} style={styles.toggle}>
            <MaterialIcons
              name={showPassword ? "visibility-off" : "visibility"}
              size={20}
              color={colors.text.muted}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    marginLeft: 2,
  },
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: radius.md,
    backgroundColor: colors.bg.input,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: "500",
  },
  toggle: {
    padding: spacing.xs,
  },
});
