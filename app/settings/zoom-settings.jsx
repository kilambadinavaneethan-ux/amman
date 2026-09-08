import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useZoom } from "../context/ZoomContext";
import ProtectedRoute from "../components/ProtectedRoute";
import BackButton from "../components/BackButton";

const ZOOM_PRESETS = [
  { label: "75% (Min)", value: 0.75 },
  { label: "100% (Default)", value: 1.0 },
  { label: "125%", value: 1.25 },
  { label: "150%", value: 1.5 },
  { label: "200%", value: 2.0 },
  { label: "250% (Max)", value: 2.5 },
];

export default function ZoomSettingsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { zoomPercent, resetZoom, setZoomScale, zoomIn, zoomOut } = useZoom();

  const handleResetZoom = () => {
    resetZoom();
    Alert.alert("Zoom Reset", "App zoom level restored to 100%.");
  };

  return (
    <ProtectedRoute>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <BackButton label="Settings" onPress={() => router.push("/settings")} />
          <Text style={styles.title}>Display & Zoom Scale</Text>
          <Text style={styles.subtitle}>
            Control global application zoom, pinch gestures, and screen scaling.
          </Text>
        </View>

        {/* Current Zoom Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Zoom Scale</Text>

          <View style={styles.zoomGaugeRow}>
            <Pressable
              style={({ pressed }) => [styles.stepBtn, pressed && styles.btnPressed]}
              onPress={zoomOut}
            >
              <MaterialIcons name="zoom-out" size={24} color={colors.text.primary} />
            </Pressable>

            <View style={styles.gaugeCenter}>
              <Text style={styles.zoomPercentText}>{zoomPercent}%</Text>
              <Text style={styles.zoomSubtitle}>
                {zoomPercent === 100
                  ? "Standard (1.0x)"
                  : zoomPercent < 100
                  ? "Scaled Down"
                  : "Magnified"}
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.stepBtn, pressed && styles.btnPressed]}
              onPress={zoomIn}
            >
              <MaterialIcons name="zoom-in" size={24} color={colors.text.primary} />
            </Pressable>
          </View>

          {/* Reset Zoom Button */}
          <Pressable
            style={({ pressed }) => [styles.resetBtn, pressed && styles.btnPressed]}
            onPress={handleResetZoom}
          >
            <MaterialIcons name="restart-alt" size={20} color="#FFFFFF" />
            <Text style={styles.resetBtnText}>Reset Zoom to 100%</Text>
          </Pressable>
        </View>

        {/* Quick Zoom Presets */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Presets</Text>
          <Text style={styles.cardDesc}>Tap to quickly set global interface scale:</Text>

          <View style={styles.presetGrid}>
            {ZOOM_PRESETS.map((preset) => {
              const active = Math.round(preset.value * 100) === zoomPercent;
              return (
                <Pressable
                  key={preset.label}
                  style={({ pressed }) => [
                    styles.presetPill,
                    active && styles.presetPillActive,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={() => setZoomScale(preset.value)}
                >
                  <Text
                    style={[
                      styles.presetPillText,
                      active && styles.presetPillTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Gesture Guide Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gesture Shortcuts</Text>

          <View style={styles.guideRow}>
            <View style={styles.guideIconWrapper}>
              <MaterialIcons name="pinch" size={22} color={colors.accent.primary} />
            </View>
            <View style={styles.guideContent}>
              <Text style={styles.guideTitle}>Two-Finger Pinch</Text>
              <Text style={styles.guideDesc}>
                Pinch anywhere on the screen with two fingers to smoothly scale the app between 75% and 250%.
              </Text>
            </View>
          </View>

          <View style={styles.guideRow}>
            <View style={styles.guideIconWrapper}>
              <MaterialIcons name="open-with" size={22} color={colors.accent.warning} />
            </View>
            <View style={styles.guideContent}>
              <Text style={styles.guideTitle}>Two-Finger Pan & Move</Text>
              <Text style={styles.guideDesc}>
                Drag with two fingers in any direction (left, right, up, down) to move and navigate around the zoomed screen.
              </Text>
            </View>
          </View>

          <View style={styles.guideRow}>
            <View style={styles.guideIconWrapper}>
              <MaterialIcons name="touch-app" size={22} color={colors.accent.success} />
            </View>
            <View style={styles.guideContent}>
              <Text style={styles.guideTitle}>Double Tap to Reset</Text>
              <Text style={styles.guideDesc}>
                Double tap anywhere on the screen to reset zoom scale and position back to center at 100%.
              </Text>
            </View>
          </View>

          <View style={styles.guideRow}>
            <View style={styles.guideIconWrapper}>
              <MaterialIcons name="save" size={22} color={colors.accent.info} />
            </View>
            <View style={styles.guideContent}>
              <Text style={styles.guideTitle}>App Launch Normalization</Text>
              <Text style={styles.guideDesc}>
                Whenever the app is closed and opened again, the screen scale automatically normalizes back to 100% default scale.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      padding: 16,
      backgroundColor: colors.bg.card,
      flexGrow: 1,
    },
    header: {
      marginBottom: 20,
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text.primary,
      marginTop: 8,
    },
    subtitle: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 4,
    },
    card: {
      backgroundColor: colors.bg.primary,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 16,
      marginBottom: 16,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 12,
    },
    cardDesc: {
      fontSize: 12,
      color: colors.text.muted,
      marginBottom: 12,
    },
    zoomGaugeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginBottom: 14,
    },
    gaugeCenter: {
      alignItems: "center",
    },
    zoomPercentText: {
      fontSize: 32,
      fontWeight: "900",
      color: colors.accent.primary,
    },
    zoomSubtitle: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.muted,
      marginTop: 2,
    },
    stepBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.bg.primary,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      alignItems: "center",
      justifyContent: "center",
    },
    resetBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.accent.primary,
      borderRadius: 12,
      paddingVertical: 14,
    },
    resetBtnText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 14,
    },
    presetGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    presetPill: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
    },
    presetPillActive: {
      backgroundColor: colors.accent.primary + "20",
      borderColor: colors.accent.primary,
    },
    presetPillText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    presetPillTextActive: {
      color: colors.accent.primary,
      fontWeight: "800",
    },
    guideRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 12,
    },
    guideIconWrapper: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.bg.card,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    guideContent: {
      flex: 1,
    },
    guideTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    guideDesc: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
    btnPressed: {
      opacity: 0.8,
    },
  });
};
