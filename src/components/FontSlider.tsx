import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useTheme } from "../../app/context/ThemeContext";
import { fontSizes, FontSizeKey } from "../theme/fontScale";

export default function FontSlider() {
  const { theme, fontSize, setFontSize } = useTheme();
  const { colors, spacing, radius } = theme;

  const steps: FontSizeKey[] = ["xs", "sm", "default", "md", "lg", "xl", "huge"];
  const currentIndex = steps.indexOf(fontSize as FontSizeKey);

  const styles = StyleSheet.create({
    container: {
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.sm,
      width: "100%",
    },
    labelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.md,
    },
    labelA: {
      fontSize: 12,
      fontWeight: "400",
      color: colors.text.secondary,
    },
    labelALarge: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text.primary,
    },
    sliderWrapper: {
      height: 40,
      justifyContent: "center",
      position: "relative",
    },
    track: {
      height: 4,
      backgroundColor: colors.border.medium,
      borderRadius: 2,
      position: "absolute",
      left: 0,
      right: 0,
    },
    activeTrack: {
      height: 4,
      backgroundColor: colors.accent.primary,
      borderRadius: 2,
      position: "absolute",
      left: 0,
    },
    tickContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      position: "absolute",
      left: 0,
      right: 0,
    },
    tick: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.border.medium,
      borderWidth: 1,
      borderColor: colors.bg.card,
    },
    activeTick: {
      backgroundColor: colors.accent.primary,
    },
    knob: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.accent.primary,
      borderWidth: 4,
      borderColor: colors.bg.card,
      position: "absolute",
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
      transform: [{ translateX: -12 }], // center the knob on its coordinate
    },
    levelText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.accent.primary,
      textAlign: "center",
      marginTop: spacing.sm,
      textTransform: "uppercase",
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.labelA}>A</Text>
        <Text style={styles.labelALarge}>A</Text>
      </View>

      <View style={styles.sliderWrapper}>
        <View style={styles.track} />
        
        {/* Active track showing progress */}
        <View
          style={[
            styles.activeTrack,
            {
              width: `${(currentIndex / (steps.length - 1)) * 100}%`,
            },
          ]}
        />

        {/* Ticks container */}
        <View style={styles.tickContainer}>
          {steps.map((step, idx) => {
            const isActive = idx <= currentIndex;
            return (
              <Pressable
                key={step}
                onPress={() => setFontSize(step)}
                style={[styles.tick, isActive && styles.activeTick]}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              />
            );
          })}
        </View>

        {/* Sliding Knob positioned over active step */}
        <View
          style={[
            styles.knob,
            {
              left: `${(currentIndex / (steps.length - 1)) * 100}%`,
            },
          ]}
          pointerEvents="none"
        />
      </View>

      <Text style={styles.levelText}>{fontSizes[fontSize as FontSizeKey]}</Text>
    </View>
  );
}
