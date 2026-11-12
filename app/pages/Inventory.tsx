import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useContext, useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ItemContext } from "../context/ItemContext";
import { UserContext } from "../context/UserContext";
import { useTheme } from "../context/ThemeContext";
import { useScrollRestoration } from "../context/ScrollContext";
import { useResponsive } from "../../utils/responsive";
import { computeInventorySummary } from "../../utils/ledgerCalculations";
import { InventoryItem } from "../../src/types/models";

const RATE_TYPE_SUFFIX: Record<string, string> = {
  piece: "piece",
  unit: "unit",
  bag: "bag",
};

interface InventoryProductCardProps {
  item: InventoryItem;
  styles: ReturnType<typeof getStyles>;
  formatCurrency: (amount: number) => string;
  onPressItem: (id: string) => void;
}

const InventoryProductCard = React.memo(function InventoryProductCard({
  item,
  styles,
  formatCurrency,
  onPressItem,
}: InventoryProductCardProps) {
  const currentStock =
    item.openingStock !== undefined ? item.openingStock : item.stock || 0;
  const stockNum = Number(currentStock);
  const isOutOfStock = stockNum === 0;
  const isLowStock = stockNum > 0 && stockNum <= 5;
  const rate = Number(item.sellingRate || item.sellingPrice || 0);
  const itemValuation = stockNum * rate;
  const suffix = (item.rateType && RATE_TYPE_SUFFIX[item.rateType]) || "piece";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.productCard,
        pressed && styles.cardPressed,
      ]}
      onPress={() => onPressItem(item.id)}
    >
      <View style={styles.cardLeft}>
        <View style={styles.productIconBg}>
          <MaterialIcons name="store" size={24} color="#3b82f6" />
        </View>
        <View style={styles.productDetails}>
          <Text style={styles.productName} numberOfLines={1}>
            {item.itemName}
          </Text>
          <Text style={styles.productRate}>
            {formatCurrency(rate)} / {suffix}
          </Text>
          <Text
            style={[
              styles.productStock,
              isOutOfStock && styles.stockOutOfStock,
              isLowStock && styles.stockLowStock,
            ]}
          >
            Stock: {stockNum} units
          </Text>
        </View>
      </View>

      <View style={styles.cardRight}>
        <Text style={styles.valuationValue}>
          {formatCurrency(itemValuation)}
        </Text>
        <Text style={styles.valuationLabel}>Value</Text>

        {/* Badges */}
        {isOutOfStock ? (
          <View style={[styles.badge, styles.badgeOutOfStock]}>
            <Text style={[styles.badgeText, styles.badgeOutOfStockText]}>
              Out of Stock
            </Text>
          </View>
        ) : isLowStock ? (
          <View style={[styles.badge, styles.badgeLowStock]}>
            <Text style={[styles.badgeText, styles.badgeLowStockText]}>
              Low Stock
            </Text>
          </View>
        ) : item.status === "Inactive" ? (
          <View style={[styles.badge, styles.badgeInactive]}>
            <Text style={[styles.badgeText, styles.badgeInactiveText]}>
              Inactive
            </Text>
          </View>
        ) : (
          <View style={[styles.badge, styles.badgeActive]}>
            <Text style={[styles.badgeText, styles.badgeActiveText]}>
              Active
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

function Inventory() {
  const { theme } = useTheme();
  const { colors } = theme;
  const { scrollBottomPadding, compactBadgeTextProps, currencyKpiTextProps } = useResponsive();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { scrollViewRef, handleScroll, handleContentSizeChange } =
    useScrollRestoration("/inventory");
  const { items, loading } = useContext(ItemContext);
  const { profile } = useContext(UserContext);

  const currencySymbol = profile?.currency || "₹";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<
    "All" | "Active" | "Low Stock" | "Out of Stock"
  >("All");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const {
    finishedProducts,
    totalValuation,
    totalCostValuation,
    totalProfit,
    profitPct,
    activeCount,
    lowStockCount,
    outOfStockCount,
  } = useMemo(
    () => computeInventorySummary((items || []) as InventoryItem[]),
    [items]
  );

  // Filter finished products by search query and selected filter pill
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return finishedProducts.filter((item) => {
      const matchesSearch =
        (item.itemName || "").toLowerCase().includes(q) ||
        Boolean(item.description && item.description.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      const currentStock =
        item.openingStock !== undefined ? item.openingStock : item.stock || 0;
      const stockNum = Number(currentStock);
      const isActive = (item.status || "Active") === "Active";

      if (selectedFilter === "Active") {
        return isActive;
      } else if (selectedFilter === "Low Stock") {
        return stockNum > 0 && stockNum <= 5;
      } else if (selectedFilter === "Out of Stock") {
        return stockNum === 0;
      }
      return true;
    });
  }, [finishedProducts, searchQuery, selectedFilter]);

  const formatCurrency = useCallback(
    (amount: number) => {
      try {
        return `${currencySymbol}${Number(amount || 0).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      } catch {
        return `${currencySymbol}${Number(amount || 0).toFixed(2)}`;
      }
    },
    [currencySymbol]
  );

  const handlePressItem = useCallback(
    (id: string) => {
      router.push({
        pathname: "/settings/items/details",
        params: { id },
      });
    },
    [router]
  );

  const keyExtractor = useCallback((item: InventoryItem) => item.id, []);

  const renderProductItem: ListRenderItem<InventoryItem> = useCallback(
    ({ item }) => (
      <InventoryProductCard
        item={item}
        styles={styles}
        formatCurrency={formatCurrency}
        onPressItem={handlePressItem}
      />
    ),
    [styles, formatCurrency, handlePressItem]
  );

  const listHeader = useMemo(
    () => (
      <>
        {/* Header / Hero Valuation Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.heroLabel}>Total Stock Valuation</Text>
              <Text style={styles.heroValue} {...currencyKpiTextProps}>
                {formatCurrency(totalValuation)}
              </Text>
            </View>
            <View style={styles.heroIconBg}>
              <MaterialIcons
                name="monetization-on"
                size={32}
                color={colors.bg.card}
              />
            </View>
          </View>
          {/* Cost / Selling / Profit Breakdown */}
          <View style={styles.heroBreakdownRow}>
            <View style={styles.heroBreakdownItem}>
              <Text style={styles.heroBreakdownLabel} {...compactBadgeTextProps}>Selling Value</Text>
              <Text style={styles.heroBreakdownValue} {...currencyKpiTextProps}>
                {formatCurrency(totalValuation)}
              </Text>
            </View>
            <View style={styles.heroBreakdownDivider} />
            <View style={styles.heroBreakdownItem}>
              <Text style={styles.heroBreakdownLabel} {...compactBadgeTextProps}>Cost Value</Text>
              <Text style={[styles.heroBreakdownValue, styles.costHighlightText]} {...currencyKpiTextProps}>
                {formatCurrency(totalCostValuation)}
              </Text>
            </View>
            <View style={styles.heroBreakdownDivider} />
            <View style={styles.heroBreakdownItem}>
              <Text style={styles.heroBreakdownLabel} {...compactBadgeTextProps}>Gross Profit</Text>
              <Text
                style={[
                  styles.heroBreakdownValue,
                  totalProfit >= 0
                    ? styles.profitPositiveText
                    : styles.profitNegativeText,
                ]}
                {...currencyKpiTextProps}
              >
                {totalProfit >= 0 ? "+" : ""}
                {formatCurrency(totalProfit)}
              </Text>
              <Text style={styles.heroBreakdownPct} {...compactBadgeTextProps}>{profitPct}% margin</Text>
            </View>
          </View>
        </View>

        {/* Metrics Row */}
        <View style={styles.metricsRow}>
          <Pressable
            style={[
              styles.metricCard,
              selectedFilter === "Active" && styles.metricCardSelected,
            ]}
            onPress={() =>
              setSelectedFilter((prev) => (prev === "Active" ? "All" : "Active"))
            }
          >
            <View style={[styles.metricIconBg, styles.metricIconActiveBg]}>
              <MaterialIcons
                name="check-circle"
                size={18}
                color={colors.accent.success}
              />
            </View>
            <View>
              <Text style={styles.metricNumber}>{activeCount}</Text>
              <Text style={styles.metricLabelText}>Active</Text>
            </View>
          </Pressable>

          <Pressable
            style={[
              styles.metricCard,
              selectedFilter === "Low Stock" && styles.metricCardSelected,
            ]}
            onPress={() =>
              setSelectedFilter((prev) =>
                prev === "Low Stock" ? "All" : "Low Stock"
              )
            }
          >
            <View style={[styles.metricIconBg, styles.metricIconLowBg]}>
              <MaterialIcons name="warning" size={18} color="#f97316" />
            </View>
            <View>
              <Text style={styles.metricNumber}>{lowStockCount}</Text>
              <Text style={styles.metricLabelText}>Low Stock</Text>
            </View>
          </Pressable>

          <Pressable
            style={[
              styles.metricCard,
              selectedFilter === "Out of Stock" && styles.metricCardSelected,
            ]}
            onPress={() =>
              setSelectedFilter((prev) =>
                prev === "Out of Stock" ? "All" : "Out of Stock"
              )
            }
          >
            <View style={[styles.metricIconBg, styles.metricIconOutBg]}>
              <MaterialIcons
                name="error-outline"
                size={18}
                color={colors.accent.danger}
              />
            </View>
            <View>
              <Text style={styles.metricNumber}>{outOfStockCount}</Text>
              <Text style={styles.metricLabelText}>Out of Stock</Text>
            </View>
          </Pressable>
        </View>

        {/* Search Container */}
        <View style={styles.searchContainer}>
          <MaterialIcons
            name="search"
            size={20}
            color={colors.text.muted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search products by name..."
            placeholderTextColor={colors.text.muted}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialIcons name="close" size={20} color={colors.text.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Section Title and Count */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {selectedFilter === "All"
              ? "Finished Products"
              : `${selectedFilter} Products`}
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{filteredProducts.length}</Text>
          </View>
        </View>
      </>
    ),
    [
      styles,
      colors,
      formatCurrency,
      totalValuation,
      totalCostValuation,
      totalProfit,
      profitPct,
      selectedFilter,
      activeCount,
      lowStockCount,
      outOfStockCount,
      searchQuery,
      filteredProducts.length,
    ]
  );

  const listEmptyComponent = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="inventory" size={64} color={colors.border.medium} />
        <Text style={styles.emptyText}>No Products Found</Text>
        <Text style={styles.emptySubtext}>
          Try clearing your search query or selecting a different filter above.
        </Text>
      </View>
    ),
    [styles, colors.border.medium]
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading finished products...</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: scrollBottomPadding }]}
      data={filteredProducts}
      keyExtractor={keyExtractor}
      renderItem={renderProductItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmptyComponent}
      scrollEventThrottle={32}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews={true}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={["#3b82f6"]}
        />
      }
    />
  );
}

const getStyles = (theme: any) => {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg.primary,
    },
    contentContainer: {
      paddingBottom: 24,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      padding: 32,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 15,
      color: colors.text.muted,
      fontWeight: "500",
    },
    heroCard: {
      backgroundColor: "#1e3a8a",
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 20,
      padding: 20,
      shadowColor: "#1e3a8a",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    heroRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    heroLabel: {
      color: "#93c5fd",
      fontSize: 14,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    heroValue: {
      color: colors.bg.card,
      fontSize: 28,
      fontWeight: "800",
      marginTop: 4,
    },
    heroIconBg: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: "rgba(255, 255, 255, 0.15)",
      justifyContent: "center",
      alignItems: "center",
    },
    heroBreakdownRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: 16,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: "rgba(255,255,255,0.12)",
    },
    heroBreakdownItem: {
      flex: 1,
      alignItems: "center",
    },
    heroBreakdownLabel: {
      color: "#93c5fd",
      fontSize: 9,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 3,
    },
    heroBreakdownValue: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "800",
    },
    costHighlightText: {
      color: "#fcd34d",
    },
    profitPositiveText: {
      color: "#86efac",
    },
    profitNegativeText: {
      color: "#fca5a5",
    },
    heroBreakdownPct: {
      color: "#93c5fd",
      fontSize: 10,
      fontWeight: "600",
      marginTop: 2,
    },
    heroBreakdownDivider: {
      width: 1,
      alignSelf: "stretch",
      backgroundColor: "rgba(255,255,255,0.15)",
      marginHorizontal: 4,
    },
    metricsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      marginTop: 16,
      gap: 8,
    },
    metricCard: {
      flex: 1,
      minWidth: 96,
      backgroundColor: colors.bg.card,
      borderRadius: 16,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border.subtle,
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.02,
      shadowRadius: 4,
      elevation: 2,
    },
    metricCardSelected: {
      borderColor: "#3b82f6",
      backgroundColor: "#6C5CE720",
    },
    metricIconBg: {
      width: 32,
      height: 32,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 8,
    },
    metricIconActiveBg: {
      backgroundColor: "#ecfdf5",
    },
    metricIconLowBg: {
      backgroundColor: "#fff7ed",
    },
    metricIconOutBg: {
      backgroundColor: "#fef2f2",
    },
    metricNumber: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
    },
    metricLabelText: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "500",
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      marginHorizontal: 16,
      marginTop: 20,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.02,
      shadowRadius: 4,
      elevation: 1,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      height: 46,
      fontSize: 15,
      color: colors.text.primary,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      marginTop: 24,
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
    },
    countBadge: {
      backgroundColor: "#6C5CE720",
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginLeft: 8,
    },
    countText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#3b82f6",
    },
    productCard: {
      backgroundColor: colors.bg.card,
      borderRadius: 18,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border.subtle,
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.03,
      shadowRadius: 6,
      elevation: 2,
    },
    cardPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.99 }],
    },
    cardLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    productIconBg: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: "#6C5CE720",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    productDetails: {
      flex: 1,
    },
    productName: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text.primary,
    },
    productRate: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 2,
    },
    productStock: {
      fontSize: 12,
      color: colors.accent.success,
      fontWeight: "600",
      marginTop: 4,
    },
    stockLowStock: {
      color: "#f97316",
    },
    stockOutOfStock: {
      color: colors.accent.danger,
    },
    cardRight: {
      alignItems: "flex-end",
      marginLeft: 12,
    },
    valuationValue: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
    },
    valuationLabel: {
      fontSize: 10,
      color: colors.text.muted,
      fontWeight: "500",
      marginTop: 1,
    },
    badge: {
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginTop: 6,
    },
    badgeOutOfStock: {
      backgroundColor: "#fef2f2",
      borderColor: "#fecaca",
    },
    badgeOutOfStockText: {
      color: colors.accent.danger,
    },
    badgeLowStock: {
      backgroundColor: "#fff7ed",
      borderColor: "#fed7aa",
    },
    badgeLowStockText: {
      color: "#f97316",
    },
    badgeInactive: {
      backgroundColor: colors.border.subtle,
      borderColor: colors.border.medium,
    },
    badgeInactiveText: {
      color: colors.text.muted,
    },
    badgeActive: {
      backgroundColor: "#ecfdf5",
      borderColor: "#a7f3d0",
    },
    badgeActiveText: {
      color: colors.accent.success,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: "700",
    },
    emptyContainer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.secondary,
      marginTop: 12,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: 4,
      paddingHorizontal: 16,
    },
  });
};

export default Inventory;
