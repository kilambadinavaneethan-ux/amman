import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useContext, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ItemContext } from "../context/ItemContext";
import { UserContext } from "../context/UserContext";
import { useTheme } from "../context/ThemeContext";
import { useScrollRestoration } from "../context/ScrollContext";

const RATE_TYPE_SUFFIX = {
  piece: "piece",
  unit: "unit",
  bag: "bag",
};

function Inventory() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/inventory");
  const { items, loading } = useContext(ItemContext);
  const { profile } = useContext(UserContext);

  const currencySymbol = profile?.currency || "₹";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All"); // All, Active, Low Stock, Out of Stock
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  // Filter out raw materials (only finished products)
  const finishedProducts = (items || []).filter(
    (item) => item.itemType !== "raw_material",
  );

  // Compute metrics for Finished Products
  const totalValuation = finishedProducts.reduce((sum, item) => {
    const currentStock =
      item.openingStock !== undefined ? item.openingStock : item.stock || 0;
    const rate = item.sellingRate || item.sellingPrice || 0;
    return sum + Number(currentStock) * Number(rate);
  }, 0);

  // Cost price stock valuation
  const totalCostValuation = finishedProducts.reduce((sum, item) => {
    const currentStock =
      item.openingStock !== undefined ? item.openingStock : item.stock || 0;
    const cost = item.costPrice || 0;
    return sum + Number(currentStock) * Number(cost);
  }, 0);

  // Gross profit margin in stock
  const totalProfit = totalValuation - totalCostValuation;
  const profitPct = totalValuation > 0 ? ((totalProfit / totalValuation) * 100).toFixed(1) : "0.0";

  const activeCount = finishedProducts.filter(
    (item) => (item.status || "Active") === "Active",
  ).length;

  const lowStockCount = finishedProducts.filter((item) => {
    const currentStock =
      item.openingStock !== undefined ? item.openingStock : item.stock || 0;
    const stockNum = Number(currentStock);
    return stockNum > 0 && stockNum <= 5;
  }).length;

  const outOfStockCount = finishedProducts.filter((item) => {
    const currentStock =
      item.openingStock !== undefined ? item.openingStock : item.stock || 0;
    return Number(currentStock) === 0;
  }).length;

  // Filter finished products by search query and selected filter pill
  const filteredProducts = finishedProducts.filter((item) => {
    const matchesSearch =
      (item.itemName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description &&
        item.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const currentStock =
      item.openingStock !== undefined ? item.openingStock : item.stock || 0;
    const stockNum = Number(currentStock);
    const isActive = (item.status || "Active") === "Active";

    if (!matchesSearch) return false;

    if (selectedFilter === "Active") {
      return isActive;
    } else if (selectedFilter === "Low Stock") {
      return stockNum > 0 && stockNum <= 5;
    } else if (selectedFilter === "Out of Stock") {
      return stockNum === 0;
    }
    return true;
  });

  const formatCurrency = (amount) => {
    try {
      return `${currencySymbol}${Number(amount || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    } catch {
      return `${currencySymbol}${Number(amount || 0).toFixed(2)}`;
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading finished products...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      scrollEventThrottle={32}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={["#3b82f6"]}
        />
      }
    >
      {/* Header / Hero Valuation Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.heroLabel}>Total Stock Valuation</Text>
            <Text style={styles.heroValue}>
              {formatCurrency(totalValuation)}
            </Text>
          </View>
          <View style={styles.heroIconBg}>
            <MaterialIcons name="monetization-on" size={32} color={colors.bg.card} />
          </View>
        </View>
        {/* Cost / Selling / Profit Breakdown */}
        <View style={styles.heroBreakdownRow}>
          <View style={styles.heroBreakdownItem}>
            <Text style={styles.heroBreakdownLabel}>Selling Value</Text>
            <Text style={styles.heroBreakdownValue}>{formatCurrency(totalValuation)}</Text>
          </View>
          <View style={styles.heroBreakdownDivider} />
          <View style={styles.heroBreakdownItem}>
            <Text style={styles.heroBreakdownLabel}>Cost Value</Text>
            <Text style={[styles.heroBreakdownValue, { color: "#fcd34d" }]}>{formatCurrency(totalCostValuation)}</Text>
          </View>
          <View style={styles.heroBreakdownDivider} />
          <View style={styles.heroBreakdownItem}>
            <Text style={styles.heroBreakdownLabel}>Gross Profit</Text>
            <Text style={[styles.heroBreakdownValue, { color: totalProfit >= 0 ? "#86efac" : "#fca5a5" }]}>
              {totalProfit >= 0 ? "+" : ""}{formatCurrency(totalProfit)}
            </Text>
            <Text style={styles.heroBreakdownPct}>{profitPct}% margin</Text>
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
            setSelectedFilter(selectedFilter === "Active" ? "All" : "Active")
          }
        >
          <View
            style={[styles.metricIconBg, { backgroundColor: "#ecfdf5" }]}
          >
            <MaterialIcons name="check-circle" size={18} color={colors.accent.success} />
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
            setSelectedFilter(
              selectedFilter === "Low Stock" ? "All" : "Low Stock",
            )
          }
        >
          <View
            style={[styles.metricIconBg, { backgroundColor: "#fff7ed" }]}
          >
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
            setSelectedFilter(
              selectedFilter === "Out of Stock" ? "All" : "Out of Stock",
            )
          }
        >
          <View
            style={[styles.metricIconBg, { backgroundColor: "#fef2f2" }]}
          >
            <MaterialIcons name="error-outline" size={18} color={colors.accent.danger} />
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

      {/* Products List */}
      {filteredProducts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="inventory" size={64} color={colors.border.medium} />
          <Text style={styles.emptyText}>No Products Found</Text>
          <Text style={styles.emptySubtext}>
            Try clearing your search query or selecting a different filter above.
          </Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {filteredProducts.map((item) => {
            const currentStock =
              item.openingStock !== undefined
                ? item.openingStock
                : item.stock || 0;
            const stockNum = Number(currentStock);
            const isOutOfStock = stockNum === 0;
            const isLowStock = stockNum > 0 && stockNum <= 5;
            const rate = item.sellingRate || item.sellingPrice || 0;
            const itemValuation = stockNum * Number(rate);
            const suffix = RATE_TYPE_SUFFIX[item.rateType] || "piece";

            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.productCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/settings/items/details",
                    params: { id: item.id },
                  })
                }
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
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: colors.accent.danger }]}>
                        Out of Stock
                      </Text>
                    </View>
                  ) : isLowStock ? (
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: "#f97316" }]}>
                        Low Stock
                      </Text>
                    </View>
                  ) : item.status === "Inactive" ? (
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: colors.border.subtle, borderColor: colors.border.medium },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: colors.text.muted }]}>
                        Inactive
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: colors.accent.success }]}>
                        Active
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
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
  heroSubtitle: {
    color: "#93c5fd",
    fontSize: 12,
    marginTop: 12,
    fontStyle: "italic",
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
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 4,
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
  listContainer: {
    paddingHorizontal: 16,
  },
  productCard: {
    backgroundColor: colors.bg.card,
    borderRadius: 18,
    padding: 16,
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
})
};
;

export default Inventory;
