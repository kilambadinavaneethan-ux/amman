import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  Dimensions,
  FlatList,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import ProtectedRoute from "../../app/components/ProtectedRoute";
import { useTheme } from "../../app/context/ThemeContext";
import {
  LOCAL_IMAGE_CATEGORIES,
  LocalImageFile,
  LocalStorageStats,
  captureAndImportImage,
  deleteLocalImage,
  exportToPhoneGallery,
  getLocalStorageStats,
  listLocalImages,
  pickAndImportImage,
  shareLocalImage,
} from "../../src/services/localImageStorageService";

const { width } = Dimensions.get("window");
const GRID_PADDING = 16;
const GRID_GAP = 12;
const NUM_COLUMNS = width > 600 ? 4 : 2;
const CARD_WIDTH = (width - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

function LocalImageStorageScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<LocalStorageStats | null>(null);
  const [images, setImages] = useState<LocalImageFile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedImage, setSelectedImage] = useState<LocalImageFile | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async (cat: string = selectedCategory) => {
    try {
      setLoading(true);
      const [newStats, newImages] = await Promise.all([
        getLocalStorageStats(),
        listLocalImages(cat),
      ]);
      setStats(newStats);
      setImages(newImages);
    } catch (err) {
      console.error("Error loading local storage data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadData(selectedCategory);
  }, [selectedCategory, loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(selectedCategory);
  };

  const handlePickImage = async (cat: string = selectedCategory) => {
    setActionLoading(true);
    try {
      const targetCategory = cat === "all" ? "general" : cat;
      const res = await pickAndImportImage(targetCategory);
      if (res.success) {
        Alert.alert("Success", `Image saved to local storage folder (${res.image?.category}).`);
        await loadData(selectedCategory);
      } else if (res.error && res.error !== "Image selection cancelled.") {
        Alert.alert("Import Failed", res.error);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCapturePhoto = async (cat: string = selectedCategory) => {
    setActionLoading(true);
    try {
      const targetCategory = cat === "all" ? "general" : cat;
      const res = await captureAndImportImage(targetCategory);
      if (res.success) {
        Alert.alert("Success", `Photo captured and saved to local storage folder (${res.image?.category}).`);
        await loadData(selectedCategory);
      } else if (res.error && res.error !== "Camera capture cancelled.") {
        Alert.alert("Capture Failed", res.error);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = (image: LocalImageFile) => {
    Alert.alert(
      "Delete Local Image",
      `Are you sure you want to delete "${image.fileName}" from your phone's storage?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            try {
              const success = await deleteLocalImage(image.uri);
              if (success) {
                setSelectedImage(null);
                await loadData(selectedCategory);
              } else {
                Alert.alert("Error", "Failed to delete local image.");
              }
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleExportToGallery = async (image: LocalImageFile) => {
    setActionLoading(true);
    try {
      const res = await exportToPhoneGallery(image.uri);
      if (res.success) {
        Alert.alert("Saved to Gallery", "Image exported successfully to your phone's Photo Album!");
      } else {
        Alert.alert("Export Failed", res.error || "Could not export image.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleShare = async (image: LocalImageFile) => {
    await shareLocalImage(image.uri);
  };

  const renderCategoryBadge = (catId: string) => {
    if (!stats || !stats.categoryCounts) return null;
    const count = catId === "all" ? stats.totalFiles : (stats.categoryCounts[catId] || 0);
    return (
      <View
        style={[
          styles.badge,
          selectedCategory === catId ? styles.badgeActive : styles.badgeInactive,
        ]}
      >
        <Text
          style={[
            styles.badgeText,
            selectedCategory === catId ? styles.badgeTextActive : styles.badgeTextInactive,
          ]}
        >
          {count}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Local Image Storage</Text>
          <Text style={styles.headerSub}>Phone Folder & Media Manager</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
          onPress={handleRefresh}
        >
          <MaterialIcons name="refresh" size={22} color={colors.accent.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Storage Stats Banner */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <View style={styles.statsIconBox}>
              <MaterialIcons name="folder-special" size={28} color={colors.accent.primary} />
            </View>
            <View style={styles.statsTextWrap}>
              <Text style={styles.statsTitle}>Local Storage Folder</Text>
              <Text style={styles.statsPath} numberOfLines={1} ellipsizeMode="middle">
                {stats?.rootDirectoryUri || "Initializing..."}
              </Text>
            </View>
          </View>

          <View style={styles.statsMetricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricVal}>{stats?.totalFiles ?? 0}</Text>
              <Text style={styles.metricLabel}>Total Images</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricBox}>
              <Text style={styles.metricVal}>{stats?.formattedTotalSize ?? "0 Bytes"}</Text>
              <Text style={styles.metricLabel}>Storage Used</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricBox}>
              <Text style={styles.metricVal}>5 Folders</Text>
              <Text style={styles.metricLabel}>Categories</Text>
            </View>
          </View>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionPrimary, pressed && styles.pressed]}
            onPress={() => handlePickImage()}
            disabled={actionLoading}
          >
            <MaterialIcons name="photo-library" size={20} color="#FFFFFF" />
            <Text style={styles.actionPrimaryText}>Pick from Phone</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionSecondary, pressed && styles.pressed]}
            onPress={() => handleCapturePhoto()}
            disabled={actionLoading}
          >
            <MaterialIcons name="camera-alt" size={20} color={colors.accent.primary} />
            <Text style={styles.actionSecondaryText}>Take Photo</Text>
          </Pressable>
        </View>

        {/* Category Tabs */}
        <Text style={styles.sectionHeading}>Folders & Categories</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryBar}
        >
          {LOCAL_IMAGE_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                style={[
                  styles.categoryTab,
                  isSelected && styles.categoryTabSelected,
                ]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <MaterialIcons
                  name={cat.icon as any}
                  size={18}
                  color={isSelected ? colors.accent.primary : colors.text.secondary}
                />
                <Text
                  style={[
                    styles.categoryTabText,
                    isSelected && styles.categoryTabTextSelected,
                  ]}
                >
                  {cat.label}
                </Text>
                {renderCategoryBadge(cat.id)}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Loading Indicator */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
            <Text style={styles.loadingText}>Reading local storage folder...</Text>
          </View>
        ) : images.length === 0 ? (
          /* Empty State */
          <View style={styles.emptyCard}>
            <MaterialIcons name="collections" size={54} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>No Images Saved Here Yet</Text>
            <Text style={styles.emptyDesc}>
              Import photos from your device library or capture new images to store them in your local storage folder.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.emptyAddBtn, pressed && styles.pressed]}
              onPress={() => handlePickImage()}
            >
              <MaterialIcons name="add-photo-alternate" size={20} color="#FFFFFF" />
              <Text style={styles.emptyAddBtnText}>Add Image to Storage</Text>
            </Pressable>
          </View>
        ) : (
          /* Images Grid */
          <View style={styles.gridContainer}>
            {images.map((img) => (
              <Pressable
                key={img.uri}
                style={({ pressed }) => [styles.imageCard, pressed && styles.pressed]}
                onPress={() => setSelectedImage(img)}
              >
                <Image source={{ uri: img.uri }} style={styles.thumbnail} resizeMode="cover" />
                <View style={styles.cardInfo}>
                  <Text style={styles.cardFileName} numberOfLines={1}>
                    {img.fileName}
                  </Text>
                  <View style={styles.cardMetaRow}>
                    <Text style={styles.cardCategory}>{img.category}</Text>
                    <Text style={styles.cardSize}>{img.formattedSize}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Image Detail & Actions Modal */}
      <Modal
        visible={!!selectedImage}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={styles.modalOverlay}>
          {selectedImage && (
            <View style={styles.modalContent}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedImage.fileName}
                </Text>
                <Pressable
                  style={styles.modalCloseBtn}
                  onPress={() => setSelectedImage(null)}
                >
                  <MaterialIcons name="close" size={24} color={colors.text.primary} />
                </Pressable>
              </View>

              {/* Full Image Preview */}
              <View style={styles.previewContainer}>
                <Image
                  source={{ uri: selectedImage.uri }}
                  style={styles.fullPreview}
                  resizeMode="contain"
                />
              </View>

              {/* Meta details */}
              <View style={styles.metaCard}>
                <View style={styles.metaItem}>
                  <MaterialIcons name="folder" size={16} color={colors.accent.primary} />
                  <Text style={styles.metaItemLabel}>Category:</Text>
                  <Text style={styles.metaItemVal}>{selectedImage.category.toUpperCase()}</Text>
                </View>
                <View style={styles.metaItem}>
                  <MaterialIcons name="data-usage" size={16} color={colors.accent.primary} />
                  <Text style={styles.metaItemLabel}>Size:</Text>
                  <Text style={styles.metaItemVal}>{selectedImage.formattedSize}</Text>
                </View>
                <View style={styles.metaItem}>
                  <MaterialIcons name="event" size={16} color={colors.accent.primary} />
                  <Text style={styles.metaItemLabel}>Saved:</Text>
                  <Text style={styles.metaItemVal}>{selectedImage.formattedDate}</Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.modalActionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.modalActionBtn, pressed && styles.pressed]}
                  onPress={() => handleExportToGallery(selectedImage)}
                  disabled={actionLoading}
                >
                  <MaterialIcons name="save-alt" size={20} color={colors.accent.primary} />
                  <Text style={styles.modalActionText}>Save to Gallery</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.modalActionBtn, pressed && styles.pressed]}
                  onPress={() => handleShare(selectedImage)}
                >
                  <MaterialIcons name="share" size={20} color={colors.accent.info} />
                  <Text style={styles.modalActionText}>Share</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.modalActionBtn,
                    styles.modalActionDelete,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => handleDelete(selectedImage)}
                  disabled={actionLoading}
                >
                  <MaterialIcons name="delete-outline" size={20} color={colors.accent.danger} />
                  <Text style={styles.modalActionDeleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

export default function LocalImageStorageRoute() {
  return (
    <ProtectedRoute>
      <LocalImageStorageScreen />
    </ProtectedRoute>
  );
}

const getStyles = (theme: any) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg.primary,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 44,
      paddingBottom: 12,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.bg.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    backBtn: {
      padding: 6,
      marginRight: 8,
    },
    headerTitleWrap: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
    },
    headerSub: {
      fontSize: 12,
      color: colors.text.muted,
    },
    refreshBtn: {
      padding: 6,
    },
    pressed: {
      opacity: 0.75,
    },
    scrollContent: {
      padding: spacing.lg,
      paddingBottom: 40,
    },
    // Stats Banner
    statsCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      ...shadows.card,
    },
    statsHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.lg,
    },
    statsIconBox: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: colors.accent.primaryMuted,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    statsTextWrap: {
      flex: 1,
    },
    statsTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
    },
    statsPath: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
    statsMetricsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      backgroundColor: colors.bg.elevated,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
    },
    metricBox: {
      alignItems: "center",
    },
    metricVal: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.accent.primary,
    },
    metricLabel: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    metricDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border.subtle,
    },
    // Quick Actions
    actionRow: {
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    actionBtn: {
      flex: 1,
      height: 46,
      borderRadius: radius.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      ...shadows.subtle,
    },
    actionPrimary: {
      backgroundColor: colors.accent.primary,
    },
    actionPrimaryText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 14,
    },
    actionSecondary: {
      backgroundColor: colors.accent.primaryMuted,
      borderWidth: 1,
      borderColor: colors.border.accent,
    },
    actionSecondaryText: {
      color: colors.accent.primary,
      fontWeight: "700",
      fontSize: 14,
    },
    // Category Tabs
    sectionHeading: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: spacing.sm,
    },
    categoryBar: {
      gap: spacing.sm,
      paddingBottom: spacing.lg,
    },
    categoryTab: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.full,
      paddingVertical: 8,
      paddingHorizontal: 14,
      gap: 6,
    },
    categoryTabSelected: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.primaryMuted,
    },
    categoryTabText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    categoryTabTextSelected: {
      color: colors.accent.primary,
      fontWeight: "700",
    },
    badge: {
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginLeft: 2,
    },
    badgeActive: {
      backgroundColor: colors.accent.primary,
    },
    badgeInactive: {
      backgroundColor: colors.bg.elevated,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: "700",
    },
    badgeTextActive: {
      color: "#FFFFFF",
    },
    badgeTextInactive: {
      color: colors.text.muted,
    },
    // Loading & Empty
    loadingBox: {
      paddingVertical: 40,
      alignItems: "center",
    },
    loadingText: {
      marginTop: 12,
      color: colors.text.secondary,
      fontSize: 14,
    },
    emptyCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.xl,
      alignItems: "center",
      marginVertical: spacing.md,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 12,
    },
    emptyDesc: {
      fontSize: 13,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: 6,
      marginBottom: 16,
      lineHeight: 18,
    },
    emptyAddBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accent.primary,
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: radius.md,
      gap: 8,
    },
    emptyAddBtnText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 14,
    },
    // Grid
    gridContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: GRID_GAP,
    },
    imageCard: {
      width: CARD_WIDTH,
      backgroundColor: colors.bg.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: "hidden",
      ...shadows.subtle,
    },
    thumbnail: {
      width: "100%",
      height: CARD_WIDTH * 0.9,
      backgroundColor: colors.bg.elevated,
    },
    cardInfo: {
      padding: 8,
    },
    cardFileName: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    cardMetaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
    },
    cardCategory: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.accent.primary,
      textTransform: "uppercase",
    },
    cardSize: {
      fontSize: 10,
      color: colors.text.muted,
    },
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.75)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: colors.bg.card,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
      maxHeight: "90%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.md,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
      flex: 1,
      marginRight: 12,
    },
    modalCloseBtn: {
      padding: 4,
    },
    previewContainer: {
      width: "100%",
      height: 250,
      backgroundColor: "#000000",
      borderRadius: radius.md,
      overflow: "hidden",
      marginBottom: spacing.md,
    },
    fullPreview: {
      width: "100%",
      height: "100%",
    },
    metaCard: {
      backgroundColor: colors.bg.elevated,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 8,
      marginBottom: spacing.lg,
    },
    metaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    metaItemLabel: {
      fontSize: 12,
      color: colors.text.muted,
    },
    metaItemVal: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    modalActionsRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    modalActionBtn: {
      flex: 1,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    modalActionText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    modalActionDelete: {
      borderColor: colors.accent.dangerMuted,
      backgroundColor: `${colors.accent.danger}10`,
    },
    modalActionDeleteText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent.danger,
    },
  });
};
