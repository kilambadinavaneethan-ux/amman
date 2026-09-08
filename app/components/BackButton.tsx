import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../context/ThemeContext";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface BackButtonProps {
  label?: string;
  onPress?: () => void;
  variant?: "pill" | "minimal";
  style?: ViewStyle;
  textStyle?: TextStyle;
  iconColor?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({
  label = "Back",
  onPress,
  variant = "pill",
  style,
  textStyle,
  iconColor,
}) => {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors, shadows } = theme;
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.94, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.back();
    }
  };

  const currentIconColor = iconColor || colors.text.primary;

  if (variant === "minimal") {
    return (
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={[styles.minimalBtn, animatedStyle, style]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name="arrow-back" size={22} color={currentIconColor} />
        {label ? (
          <Text style={[styles.minimalText, { color: colors.text.secondary }, textStyle]} numberOfLines={1} ellipsizeMode="tail">
            {label}
          </Text>
        ) : null}
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[
        styles.pillBtn,
        {
          backgroundColor: colors.bg.card,
          borderColor: colors.border.subtle,
          ...shadows.subtle,
        },
        animatedStyle,
        style,
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View style={[styles.iconWrapper, { backgroundColor: colors.accent.primary + "12" }]}>
        <MaterialIcons name="arrow-back" size={18} color={colors.accent.primary} />
      </View>
      <Text style={[styles.pillText, { color: colors.text.primary }, textStyle]} numberOfLines={1} ellipsizeMode="tail">
        {label}
      </Text>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  pillBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
    gap: 8,
    maxWidth: "100%",
    flexShrink: 1,
  },
  iconWrapper: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  minimalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexShrink: 1,
  },
  minimalText: {
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
});

export default BackButton;
