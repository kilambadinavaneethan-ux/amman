import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import SplashWaves from "./SplashWaves";
import SplashParticles from "./SplashParticles";
import SplashRing from "./SplashRing";

interface PremiumSplashProps {
  onFinish?: () => void;
}

export const PremiumSplash: React.FC<PremiumSplashProps> = ({ onFinish }) => {
  // Master opacity for the entire splash container (fade out at finish)
  const masterOpacity = useSharedValue(1);

  // Logo animation shared values
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);
  const logoFloatY = useSharedValue(0);
  const logoPulse = useSharedValue(1);

  // Loading progress bar shared value
  const progressBarProgress = useSharedValue(0);

  const onFinishRef = React.useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    let isMounted = true;
    let hasFinished = false;

    const finishSplash = () => {
      if (hasFinished) return;
      hasFinished = true;
      if (onFinishRef.current) {
        onFinishRef.current();
      }
    };

    // 1. Fade in and scale logo on mount
    logoOpacity.value = withTiming(1, { duration: 600 });
    logoScale.value = withTiming(1, {
      duration: 800,
      easing: Easing.out(Easing.back(1.2)),
    });

    // 2. Start gentle logo floating
    logoFloatY.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(7, { duration: 1600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // 3. Start gentle logo glowing scale pulse (every 2s)
    logoPulse.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // 4. Animate the progress bar from 0 to 1 over 1.8 seconds
    progressBarProgress.value = withTiming(1, {
      duration: 1800,
      easing: Easing.inOut(Easing.quad),
    });

    // 5. Fade out the entire screen after the loading bar completes
    const fadeTimer = setTimeout(() => {
      if (!isMounted) return;
      masterOpacity.value = withTiming(0, { duration: 450 }, (finished) => {
        if (finished) {
          runOnJS(finishSplash)();
        }
      });
    }, 1900);

    // 6. Guaranteed fallback dismiss timer to ensure the splash never stays stuck
    const safetyTimer = setTimeout(() => {
      if (!isMounted) return;
      finishSplash();
    }, 2450);

    return () => {
      isMounted = false;
      clearTimeout(fadeTimer);
      clearTimeout(safetyTimer);
    };
  }, []);

  // Master animated style (fade out)
  const masterStyle = useAnimatedStyle(() => {
    return {
      opacity: masterOpacity.value,
    };
  });

  // Logo animated style
  const logoAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: logoOpacity.value,
      transform: [
        { scale: logoScale.value * logoPulse.value },
        { translateY: logoFloatY.value },
      ],
    };
  });

  // Progress Bar width animated style
  const progressStyle = useAnimatedStyle(() => {
    return {
      width: `${progressBarProgress.value * 100}%`,
    };
  });

  // Progress Glow Orb animated style
  const glowOrbStyle = useAnimatedStyle(() => {
    return {
      left: `${progressBarProgress.value * 100}%`,
      transform: [{ translateX: -6 }], // Half of orb width (12px)
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.masterContainer, masterStyle]}>
      {/* Soft Gold-White Gradient Background */}
      <LinearGradient
        colors={["#FFFFFF", "#FAF8F2", "#FFFFFF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Elegant SVG Waves around edges */}
      <SplashWaves />

      {/* Floating Gold Particles */}
      <SplashParticles />

      {/* Logo & Ring Center Group */}
      <View style={styles.centerGroup}>
        {/* Subtle Rotating Halo Ring */}
        <SplashRing />

        {/* Pulsing & Floating Gold Logo */}
        <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.logoImage}
            contentFit="contain"
          />
        </Animated.View>
      </View>

      {/* Loading Progress Group */}
      <View style={styles.loadingGroup}>
        {/* Track */}
        <View style={styles.progressTrack}>
          {/* Progress fill */}
          <Animated.View style={[styles.progressFill, progressStyle]} />
          {/* Glowing Orb */}
          <Animated.View style={[styles.glowOrb, glowOrbStyle]} />
        </View>

        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  masterContainer: {
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  centerGroup: {
    alignItems: "center",
    justifyContent: "center",
    width: 320,
    height: 320,
  },
  logoContainer: {
    width: 180,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    // Premium soft lighting shadow behind the logo card
    shadowColor: "rgba(0,0,0,0.12)",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 18,
    elevation: 8,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  loadingGroup: {
    position: "absolute",
    bottom: 120, // Displayed at the bottom
    alignItems: "center",
  },
  progressTrack: {
    width: 220,
    height: 4,
    backgroundColor: "#EBE6D8", // Very soft muted beige-gold track
    borderRadius: 2,
    position: "relative",
    marginBottom: 16,
    overflow: "visible", // To allow glow orb to be fully visible outside track bounds
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#D4AF37", // Primary Gold
    borderRadius: 2,
  },
  glowOrb: {
    position: "absolute",
    top: -4, // Centering 12px height orb vertically on 4px track: (4-12)/2 = -4
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    // Intense golden glowing aura around the bead
    shadowColor: "#D4AF37",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1.0,
    shadowRadius: 8,
    elevation: 6,
  },
  loadingText: {
    fontSize: 14,
    color: "#D4AF37", // Primary Gold
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});

export default PremiumSplash;
