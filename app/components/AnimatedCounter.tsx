import React, { useEffect } from "react";
import { TextInput, StyleSheet } from "react-native";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";

// Create an animated TextInput to enable native property updates
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  duration?: number;
  style?: any;
}

export default function AnimatedCounter({
  value,
  prefix = "",
  duration = 1200,
  style,
}: AnimatedCounterProps) {
  const count = useSharedValue(0);

  // Trigger animation when target value changes
  useEffect(() => {
    count.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.quad),
    });
  }, [value, count, duration]);

  // Derive the display text reactively on the UI thread
  const animatedProps = useAnimatedProps(() => {
    const formatted = Math.round(count.value).toLocaleString("en-IN");
    return {
      text: `${prefix}${formatted}`,
    } as any;
  });

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      style={[styles.text, style]}
      // Fallback value for the initial paint/SSR
      value={`${prefix}${Math.round(value).toLocaleString("en-IN")}`}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  text: {
    color: "#F8F9FA",
    fontSize: 24,
    fontWeight: "700",
    padding: 0,
    margin: 0,
  },
});
