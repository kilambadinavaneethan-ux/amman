import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from "react-native-reanimated";
import Svg, { Path, Defs, RadialGradient, Stop } from "react-native-svg";

const AnimatedView = Animated.View;

export const SplashWaves: React.FC = () => {
  const wave1 = useSharedValue(0);

  useEffect(() => {
    // Single wave animation instead of two — reduces worklet overhead
    wave1.value = withRepeat(
      withTiming(Math.PI * 2, {
        duration: 9000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, [wave1]);

  // Top-left wave anim style
  const tlStyle = useAnimatedStyle(() => {
    const tx = Math.sin(wave1.value) * 8;
    const ty = Math.cos(wave1.value) * 5;
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale: 1.01 }],
    };
  });

  // Bottom-right wave anim style
  const brStyle = useAnimatedStyle(() => {
    const tx = Math.sin(wave1.value + Math.PI) * 9;
    const ty = Math.cos(wave1.value + Math.PI) * 6;
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale: 1.02 }],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Top Left Wave Set */}
      <View style={styles.topLeftContainer}>
        {/* Soft Gold Radial Ambient Glow at top-left */}
        <Svg width="350" height="350" viewBox="0 0 350 350" style={styles.absoluteGlow}>
          <Defs>
            <RadialGradient id="tlGlow" cx="0%" cy="0%" r="80%" fx="0%" fy="0%">
              <Stop offset="0%" stopColor="#F5D76E" stopOpacity="0.18" />
              <Stop offset="50%" stopColor="#D4AF37" stopOpacity="0.06" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Path d="M0 0 L350 0 C 250 150 150 250 0 350 Z" fill="url(#tlGlow)" />
        </Svg>

        <AnimatedView style={[styles.waveWrapper, tlStyle]}>
          <Svg width="400" height="400" viewBox="0 0 400 400" fill="none">
            {/* Combined wave curves in a single Path for fewer SVG nodes */}
            <Path
              d="M -40,180 C 60,150 110,60 210,-40 M -40,230 C 90,190 140,80 250,-40 M -40,130 C 30,100 80,40 160,-40 M -40,210 C 80,170 125,70 230,-40"
              stroke="#D4AF37"
              strokeWidth="0.9"
              opacity="0.22"
            />
          </Svg>
        </AnimatedView>
      </View>

      {/* Bottom Right Wave Set */}
      <View style={styles.bottomRightContainer}>
        {/* Soft Gold Radial Ambient Glow at bottom-right */}
        <Svg width="350" height="350" viewBox="0 0 350 350" style={styles.absoluteGlow}>
          <Defs>
            <RadialGradient id="brGlow" cx="100%" cy="100%" r="80%" fx="100%" fy="100%">
              <Stop offset="0%" stopColor="#F5D76E" stopOpacity="0.18" />
              <Stop offset="50%" stopColor="#D4AF37" stopOpacity="0.06" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Path d="M350 350 L0 350 C 100 200 200 100 350 0 Z" fill="url(#brGlow)" />
        </Svg>

        <AnimatedView style={[styles.waveWrapper, brStyle]}>
          <Svg width="400" height="400" viewBox="0 0 400 400" fill="none">
            <Path
              d="M 440,220 C 340,250 290,340 190,440 M 440,170 C 310,210 260,320 150,440 M 440,270 C 370,300 320,360 240,440 M 440,190 C 320,230 275,330 170,440"
              stroke="#D4AF37"
              strokeWidth="0.9"
              opacity="0.22"
            />
          </Svg>
        </AnimatedView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  topLeftContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 350,
    height: 350,
  },
  bottomRightContainer: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 350,
    height: 350,
    transform: [{ rotate: "180deg" }], // Rotate 180 to mirror top-left geometry
  },
  absoluteGlow: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  waveWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 400,
    height: 400,
  },
});

export default SplashWaves;
