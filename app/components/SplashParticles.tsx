import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
} from "react-native-reanimated";

interface ParticleProps {
  delay: number;
  duration: number;
  startX: number;
  size: number;
}

const Particle: React.FC<ParticleProps> = ({ delay, duration, startX, size }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, {
          duration: duration,
          easing: Easing.out(Easing.quad),
        }),
        -1, // loop infinitely
        false // do not reverse, reset to 0
      )
    );
  }, [delay, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    // Fade in quickly, then fade out gradually towards the end
    const opacity =
      progress.value < 0.15
        ? progress.value / 0.15
        : progress.value > 0.8
        ? (1 - progress.value) / 0.2
        : 1;

    // Float upwards along Y axis (from bottom to top)
    const translateY = -progress.value * 450;
    // Gentle horizontal drifting swaying
    const translateX = startX + Math.sin(progress.value * Math.PI * 4) * 15;
    // Slight size pulsating
    const scale = 0.8 + Math.sin(progress.value * Math.PI * 2) * 0.4;

    return {
      opacity,
      transform: [{ translateX }, { translateY }, { scale }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        animatedStyle,
      ]}
    />
  );
};

// Pre-computed particle data (deterministic) to avoid useState+useEffect on mount.
// 10 particles instead of 20 for faster splash render.
const STATIC_PARTICLES: ParticleProps[] = [
  { delay: 0, duration: 5800, startX: -80, size: 4.2 },
  { delay: 450, duration: 6200, startX: 60, size: 5.5 },
  { delay: 900, duration: 7100, startX: -30, size: 3.8 },
  { delay: 1300, duration: 5400, startX: 100, size: 6.0 },
  { delay: 1800, duration: 8000, startX: -110, size: 4.5 },
  { delay: 2200, duration: 6800, startX: 40, size: 3.2 },
  { delay: 600, duration: 7500, startX: -60, size: 5.0 },
  { delay: 2500, duration: 5900, startX: 90, size: 4.8 },
  { delay: 1100, duration: 6500, startX: -20, size: 7.0 },
  { delay: 2800, duration: 7800, startX: 70, size: 3.5 },
];

export const SplashParticles: React.FC = () => {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.container}>
        {STATIC_PARTICLES.map((p, index) => (
          <Particle key={index} {...p} />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 150,
  },
  particle: {
    position: "absolute",
    backgroundColor: "#F5D76E", // Secondary Gold
    shadowColor: "#D4AF37", // Primary Gold glow
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
});

export default SplashParticles;
