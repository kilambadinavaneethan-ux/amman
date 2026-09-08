import React, { useEffect, useState } from "react";
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

export const SplashParticles: React.FC = () => {
  const [particles, setParticles] = useState<ParticleProps[]>([]);
  const { width: windowWidth } = useWindowDimensions();

  useEffect(() => {
    const list: ParticleProps[] = [];
    const count = 20;
    const effectiveWidth = Math.max(windowWidth - 40, 260);
    for (let i = 0; i < count; i++) {
      list.push({
        delay: Math.random() * 3000,
        duration: 5000 + Math.random() * 4000,
        // Centered horizontally with random offset
        startX: Math.random() * effectiveWidth - effectiveWidth / 2,
        size: 3 + Math.random() * 5,
      });
    }
    setParticles(list);
  }, [windowWidth]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.container}>
        {particles.map((p, index) => (
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
