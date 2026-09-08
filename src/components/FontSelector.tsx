import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, Text, View, Pressable, TextInput, ScrollView } from "react-native";
import { useTheme } from "../../app/context/ThemeContext";
import { fontStyles } from "../theme/fonts";
import * as Font from "expo-font";
import { MaterialIcons } from "@expo/vector-icons";

function FontOptionRow({ option, active, onSelect }: { option: any; active: boolean; onSelect: () => void }) {
  const { theme } = useTheme();
  const { colors, spacing, radius } = theme;
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (option.id === "Default" || !option.regularUrl) {
      setLoaded(true);
      return;
    }
    
    // Load just the regular weight preview for the selector row
    const previewKey = `${option.id}-Preview`;
    Font.loadAsync({
      [previewKey]: option.regularUrl,
    })
      .then(() => setLoaded(true))
      .catch(() => setLoaded(true)); // Fallback gracefully if load fails
  }, [option]);

  // If preview font is loaded and it's not default, use it for row texts
  const previewFont = loaded && option.id !== "Default" ? `${option.id}-Preview` : undefined;

  const styles = StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: active ? colors.accent.primary : colors.border.subtle,
      backgroundColor: active ? `${colors.accent.primary}08` : colors.bg.card,
      marginBottom: spacing.sm,
    },
    info: {
      flex: 1,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    label: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
      fontFamily: previewFont,
    },
    badge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.text.muted,
    },
    previewText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontFamily: previewFont,
      marginTop: 2,
    },
    checkCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: active ? colors.accent.primary : colors.border.medium,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: active ? colors.accent.primary : "transparent",
    },
    checkDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.bg.card,
    },
  });

  return (
    <Pressable style={styles.card} onPress={onSelect}>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.label}>{option.label}</Text>
          {option.category && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{option.category}</Text>
            </View>
          )}
        </View>
        <Text style={styles.previewText} numberOfLines={1}>
          AaBbCc123 (Main text preview)
        </Text>
      </View>
      <View style={styles.checkCircle}>
        {active && <View style={styles.checkDot} />}
      </View>
    </Pressable>
  );
}

const CATEGORIES = ["All", "Sans-Serif", "Serif", "Display"];

export default function FontSelector() {
  const { fontStyle, setFontStyle, theme } = useTheme();
  const { colors, spacing, radius } = theme;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredFonts = useMemo(() => {
    return fontStyles.filter((font) => {
      const matchesSearch = font.label.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All" || font.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  const styles = StyleSheet.create({
    container: {
      width: "100%",
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginBottom: spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text.primary,
      paddingVertical: spacing.xs,
      marginLeft: spacing.xs,
    },
    categoryScroll: {
      marginBottom: spacing.md,
    },
    catChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.full || 16,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginRight: spacing.xs,
    },
    catChipActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    catChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    catChipTextActive: {
      color: "#ffffff",
    },
    emptyText: {
      textAlign: "center",
      color: colors.text.muted,
      fontSize: 14,
      marginVertical: spacing.md,
    },
  });

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchWrap}>
        <MaterialIcons name="search" size={20} color={colors.text.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search font styles..."
          placeholderTextColor={colors.text.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")}>
            <MaterialIcons name="close" size={18} color={colors.text.muted} />
          </Pressable>
        )}
      </View>

      {/* Category Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <Pressable
              key={cat}
              style={[styles.catChip, isActive && styles.catChipActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.catChipText, isActive && styles.catChipTextActive]}>
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Font Options List */}
      {filteredFonts.length === 0 ? (
        <Text style={styles.emptyText}>No fonts match &quot;{searchQuery}&quot;</Text>
      ) : (
        filteredFonts.map((option) => (
          <FontOptionRow
            key={option.id}
            option={option}
            active={fontStyle === option.id}
            onSelect={() => setFontStyle(option.id)}
          />
        ))
      )}
    </View>
  );
}

