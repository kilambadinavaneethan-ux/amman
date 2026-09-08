import React, { useState } from "react";
import { StyleSheet, Text, View, TextInput, Pressable, ScrollView } from "react-native";
import { useTheme } from "../../app/context/ThemeContext";
import { MaterialIcons } from "@expo/vector-icons";

const PRESET_TEXTS = [
  { label: "Default Sample", text: "The quick brown fox jumps over the lazy dog." },
  { label: "Invoice / Balance", text: "Total Amount Due: $2,450.00 • Order #8492" },
  { label: "Dashboard Alert", text: "Inventory Alert: Raw material stock is below 15%!" },
  { label: "Customer Greeting", text: "Welcome back, Business Owner! High sales today." },
];

export default function FontPreview() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const [customText, setCustomText] = useState("");

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      width: "100%",
      marginVertical: spacing.md,
      ...shadows.card,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.xs,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.text.secondary,
      marginBottom: spacing.sm,
    },
    chipScroll: {
      marginVertical: spacing.sm,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.full || 16,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginRight: spacing.xs,
    },
    activeChip: {
      backgroundColor: `${colors.accent.primary}15`,
      borderColor: colors.accent.primary,
    },
    chipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    activeChipText: {
      color: colors.accent.primary,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.medium,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    input: {
      flex: 1,
      fontSize: 14,
      color: colors.text.primary,
      paddingVertical: spacing.xs,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      marginVertical: spacing.sm,
    },
    previewSection: {
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    sampleHeading: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text.primary,
    },
    previewText: {
      fontSize: 15,
      color: colors.text.primary,
      lineHeight: 22,
    },
    digitsText: {
      fontSize: 13,
      color: colors.text.muted,
      letterSpacing: 1,
    },
  });

  const activeSampleText = customText.trim() || PRESET_TEXTS[0].text;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Live Font Preview</Text>
        <MaterialIcons name="remove-red-eye" size={20} color={colors.accent.primary} />
      </View>
      <Text style={styles.subtitle}>Test custom phrases or tap a preset to preview.</Text>

      {/* Quick Preset Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {PRESET_TEXTS.map((item) => {
          const isActive = customText === item.text;
          return (
            <Pressable
              key={item.label}
              style={[styles.chip, isActive && styles.activeChip]}
              onPress={() => setCustomText(item.text)}
            >
              <Text style={[styles.chipText, isActive && styles.activeChipText]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Custom Text Input */}
      <View style={styles.inputWrap}>
        <MaterialIcons name="edit" size={16} color={colors.text.muted} style={{ marginRight: spacing.xs }} />
        <TextInput
          style={styles.input}
          placeholder="Type custom text to preview here..."
          placeholderTextColor={colors.text.muted}
          value={customText}
          onChangeText={setCustomText}
        />
        {customText.length > 0 && (
          <Pressable onPress={() => setCustomText("")}>
            <MaterialIcons name="close" size={16} color={colors.text.muted} />
          </Pressable>
        )}
      </View>

      <View style={styles.divider} />

      {/* Preview Output */}
      <View style={styles.previewSection}>
        <Text style={styles.sampleHeading} numberOfLines={1}>
          Heading Preview
        </Text>
        <Text style={styles.previewText}>
          {activeSampleText}
        </Text>
        <Text style={styles.digitsText}>
          Numbers & Symbols: 1234567890 • $ € ₹ % & @
        </Text>
      </View>
    </View>
  );
}

