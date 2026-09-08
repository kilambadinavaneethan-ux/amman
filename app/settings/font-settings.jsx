import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View, Switch, ActivityIndicator, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import ProtectedRoute from "../components/ProtectedRoute";
import BackButton from "../components/BackButton";
import FontPreview from "../../src/components/FontPreview";
import FontSlider from "../../src/components/FontSlider";
import FontSelector from "../../src/components/FontSelector";
import FontSpacingControls from "../../src/components/FontSpacingControls";

const PRESET_STYLES = [
  {
    id: "default",
    title: "Default Balance",
    desc: "Standard size & spacing",
    icon: "tune",
    config: { fontSize: "default", fontStyle: "Default", boldEnabled: false, letterSpacing: "normal", lineHeight: "normal" }
  },
  {
    id: "readability",
    title: "High Readability",
    desc: "Large text, bold, Inter font",
    icon: "visibility",
    config: { fontSize: "lg", fontStyle: "Inter", boldEnabled: true, letterSpacing: "spacious", lineHeight: "relaxed" }
  },
  {
    id: "compact",
    title: "Data Compact",
    desc: "Small size, compact layout",
    icon: "compress",
    config: { fontSize: "sm", fontStyle: "Default", boldEnabled: false, letterSpacing: "tight", lineHeight: "compact" }
  },
  {
    id: "modern",
    title: "Modern Display",
    desc: "Medium Montserrat font",
    icon: "auto-awesome",
    config: { fontSize: "md", fontStyle: "Montserrat", boldEnabled: false, letterSpacing: "spacious", lineHeight: "normal" }
  },
];

function FontSettingsHome() {
  const router = useRouter();
  const {
    theme,
    fontSize,
    fontStyle,
    boldEnabled,
    letterSpacing,
    lineHeight,
    setFontSize,
    setFontStyle,
    setBoldEnabled,
    setLetterSpacing,
    setLineHeight,
    fontsLoaded,
    saveFontSettings,
    revertFontSettings,
    resetFontSettings,
  } = useTheme();
  const { colors, spacing, radius, shadows } = theme;

  const handleBack = async () => {
    await revertFontSettings();
    router.back();
  };

  const handleSave = async () => {
    const success = await saveFontSettings();
    if (success) {
      Alert.alert("Saved", "Font & typography settings applied globally.", [
        { text: "OK", onPress: () => router.back() }
      ]);
    } else {
      Alert.alert("Error", "Failed to save font settings.");
    }
  };

  const handleReset = () => {
    Alert.alert(
      "Reset Typography",
      "Are you sure you want to reset all font settings to system defaults?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await resetFontSettings();
            Alert.alert("Reset Complete", "All font settings restored to factory defaults.");
          }
        }
      ]
    );
  };

  const applyPreset = (presetConfig) => {
    setFontSize(presetConfig.fontSize);
    setFontStyle(presetConfig.fontStyle);
    setBoldEnabled(presetConfig.boldEnabled);
    setLetterSpacing(presetConfig.letterSpacing);
    setLineHeight(presetConfig.lineHeight);
  };

  const styles = useMemo(() => {
    return StyleSheet.create({
      container: {
        backgroundColor: colors.bg.primary,
        flexGrow: 1,
        padding: spacing.lg,
      },
      header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.lg,
      },
      headerLeft: {
        flexDirection: "row",
        alignItems: "center",
      },
      backBtn: {
        padding: spacing.xs,
        marginRight: spacing.sm,
      },
      title: {
        fontSize: 20,
        fontWeight: "800",
        color: colors.text.primary,
      },
      resetBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: colors.bg.card,
        borderWidth: 1,
        borderColor: colors.border.subtle,
      },
      resetBtnText: {
        fontSize: 12,
        fontWeight: "700",
        color: colors.accent.danger,
      },
      section: {
        marginBottom: spacing.xl,
      },
      sectionTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: colors.text.secondary,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: spacing.sm,
        marginLeft: 2,
      },
      presetGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
      },
      presetCard: {
        width: "48%",
        backgroundColor: colors.bg.card,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1.5,
        borderColor: colors.border.subtle,
        ...shadows.subtle,
      },
      presetCardActive: {
        borderColor: colors.accent.primary,
        backgroundColor: `${colors.accent.primary}08`,
      },
      presetHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.xs,
      },
      presetTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.text.primary,
      },
      presetTitleActive: {
        color: colors.accent.primary,
      },
      presetDesc: {
        fontSize: 11,
        color: colors.text.muted,
      },
      card: {
        backgroundColor: colors.bg.card,
        borderRadius: radius.lg,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border.subtle,
        ...shadows.subtle,
      },
      row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      },
      labelCol: {
        flex: 1,
        marginRight: spacing.md,
      },
      label: {
        fontSize: 15,
        fontWeight: "700",
        color: colors.text.primary,
      },
      desc: {
        fontSize: 12,
        color: colors.text.muted,
        marginTop: 2,
      },
      loaderOverlay: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(255, 255, 255, 0.4)",
        justifyContent: "center",
        alignItems: "center",
        borderRadius: radius.lg,
        zIndex: 10,
      },
      loaderText: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.accent.primary,
        marginTop: 6,
      },
      actionRow: {
        flexDirection: "row",
        gap: spacing.md,
        marginTop: spacing.sm,
        marginBottom: spacing.xl,
      },
      saveBtn: {
        flex: 2,
        backgroundColor: colors.accent.primary,
        borderRadius: radius.md,
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
        ...shadows.subtle,
      },
      saveBtnText: {
        color: "#ffffff",
        fontSize: 16,
        fontWeight: "700",
      },
    });
  }, [theme]);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <BackButton label="Settings" onPress={handleBack} />
          <Text style={styles.title}>Font size and style</Text>
        </View>

        <Pressable style={styles.resetBtn} onPress={handleReset}>
          <MaterialIcons name="refresh" size={14} color={colors.accent.danger} />
          <Text style={styles.resetBtnText}>Reset</Text>
        </Pressable>
      </View>

      {/* Dynamic Font Loading Indicator Overlay */}
      {!fontsLoaded && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="small" color={colors.accent.primary} />
          <Text style={styles.loaderText}>Loading font style...</Text>
        </View>
      )}

      {/* Quick Preset Cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Typography Presets</Text>
        <View style={styles.presetGrid}>
          {PRESET_STYLES.map((preset) => {
            const isActive =
              fontSize === preset.config.fontSize &&
              fontStyle === preset.config.fontStyle &&
              boldEnabled === preset.config.boldEnabled &&
              letterSpacing === preset.config.letterSpacing &&
              lineHeight === preset.config.lineHeight;

            return (
              <Pressable
                key={preset.id}
                style={[styles.presetCard, isActive && styles.presetCardActive]}
                onPress={() => applyPreset(preset.config)}
              >
                <View style={styles.presetHeader}>
                  <MaterialIcons
                    name={preset.icon}
                    size={18}
                    color={isActive ? colors.accent.primary : colors.text.muted}
                  />
                  {isActive && (
                    <MaterialIcons name="check-circle" size={14} color={colors.accent.primary} />
                  )}
                </View>
                <Text style={[styles.presetTitle, isActive && styles.presetTitleActive]}>
                  {preset.title}
                </Text>
                <Text style={styles.presetDesc}>{preset.desc}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Live Preview Card */}
      <FontPreview />

      {/* Font Size Slider */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Font size</Text>
        <View style={styles.card}>
          <FontSlider />
        </View>
      </View>

      {/* Spacing & Line Height Controls */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spacing & Layout</Text>
        <View style={styles.card}>
          <FontSpacingControls />
        </View>
      </View>

      {/* Bold Font Switch */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Font weight</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.labelCol}>
              <Text style={styles.label}>Bold font</Text>
              <Text style={styles.desc}>Make titles, numbers and buttons extra bold.</Text>
            </View>
            <Switch
              value={boldEnabled}
              onValueChange={setBoldEnabled}
              trackColor={{ false: colors.border.medium, true: `${colors.accent.primary}40` }}
              thumbColor={boldEnabled ? colors.accent.primary : colors.text.muted}
            />
          </View>
        </View>
      </View>

      {/* Font Selector List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Font style</Text>
        <FontSelector />
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Settings</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default function FontSettingsRoute() {
  return (
    <ProtectedRoute>
      <FontSettingsHome />
    </ProtectedRoute>
  );
}

