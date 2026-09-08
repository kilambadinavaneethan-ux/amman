import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useTheme } from "../../app/context/ThemeContext";

const LETTER_SPACING_OPTIONS = [
  { id: "tight", label: "Tight", value: "-0.5px" },
  { id: "normal", label: "Normal", value: "0px" },
  { id: "spacious", label: "Spacious", value: "+0.5px" },
  { id: "wide", label: "Wide", value: "+1.0px" },
];

const LINE_HEIGHT_OPTIONS = [
  { id: "compact", label: "Compact", value: "0.9x" },
  { id: "normal", label: "Normal", value: "1.0x" },
  { id: "relaxed", label: "Relaxed", value: "1.2x" },
];

export default function FontSpacingControls() {
  const { theme, letterSpacing, setLetterSpacing, lineHeight, setLineHeight } = useTheme();
  const { colors, spacing, radius } = theme;

  const styles = StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    group: {
      gap: spacing.xs,
    },
    groupLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
      marginBottom: 2,
    },
    segmentRow: {
      flexDirection: "row",
      backgroundColor: colors.bg.primary,
      borderRadius: radius.md,
      padding: 3,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    segmentItem: {
      flex: 1,
      paddingVertical: spacing.xs + 2,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.sm,
    },
    segmentItemActive: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.accent || colors.accent.primary,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    segmentText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.muted,
    },
    segmentTextActive: {
      color: colors.accent.primary,
      fontWeight: "700",
    },
  });

  return (
    <View style={styles.container}>
      {/* Letter Spacing Section */}
      <View style={styles.group}>
        <Text style={styles.groupLabel}>Letter Spacing</Text>
        <View style={styles.segmentRow}>
          {LETTER_SPACING_OPTIONS.map((opt) => {
            const isActive = letterSpacing === opt.id;
            return (
              <Pressable
                key={opt.id}
                style={[styles.segmentItem, isActive && styles.segmentItemActive]}
                onPress={() => setLetterSpacing(opt.id)}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Line Height Section */}
      <View style={styles.group}>
        <Text style={styles.groupLabel}>Line Height</Text>
        <View style={styles.segmentRow}>
          {LINE_HEIGHT_OPTIONS.map((opt) => {
            const isActive = lineHeight === opt.id;
            return (
              <Pressable
                key={opt.id}
                style={[styles.segmentItem, isActive && styles.segmentItemActive]}
                onPress={() => setLineHeight(opt.id)}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
