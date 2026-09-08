import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

const AnimatedView = Animated.View;

export const SplashRing: React.FC = () => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 30000, // Elegant, slow continuous rotation
        easing: Easing.linear,
      }),
      -1, // Infinite
      false // Repeat in the same direction without reversing
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  return (
    <View style={styles.container} pointerEvents="none">
      <AnimatedView style={[styles.ringWrapper, animatedStyle]}>
        <Svg width="280" height="280" viewBox="0 0 280 280">
          <Defs>
            <LinearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#F5D76E" stopOpacity="0.85" />
              <Stop offset="35%" stopColor="#D4AF37" stopOpacity="0.25" />
              <Stop offset="70%" stopColor="#FFFFFF" stopOpacity="0.1" />
              <Stop offset="100%" stopColor="#D4AF37" stopOpacity="0.9" />
            </LinearGradient>
          </Defs>

          {/* Primary Golden Ring */}
          <Circle
            cx="140"
            cy="140"
            r="120"
            stroke="url(#ringGrad)"
            strokeWidth="1.2"
            fill="none"
            opacity="0.8"
          />

          {/* Subtle Inner Dashed Ring */}
          <Circle
            cx="140"
            cy="140"
            r="110"
            stroke="#D4AF37"
            strokeWidth="0.5"
            fill="none"
            opacity="0.35"
            strokeDasharray="4, 5"
          />

          {/* Tiny glowing orbital nodes on the ring */}
          {/* Node 1: Top Area */}
          <Circle
            cx="140"
            cy="20"
            r="3.5"
            fill="#F5D76E"
            stroke="#D4AF37"
            strokeWidth="0.8"
          />
          
          {/* Node 2: Bottom Right Area */}
          <Circle
            cx="244"
            cy="200"
            r="2"
            fill="#F5D76E"
            opacity="0.8"
          />

          {/* Node 3: Bottom Left Area */}
          <Circle
            cx="54"
            cy="210"
            r="2.5"
            fill="#F5D76E"
            stroke="#D4AF37"
            strokeWidth="0.5"
            opacity="0.9"
          />
        </Svg>
      </AnimatedView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    width: 320,
    height: 320,
  },
  ringWrapper: {
    width: 280,
    height: 280,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default SplashRing;
