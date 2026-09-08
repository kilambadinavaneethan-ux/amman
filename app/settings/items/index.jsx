import React, { useContext, useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../src/config/firebase";
import { ItemContext } from "../../context/ItemContext";
import { UserContext } from "../../context/UserContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";
import { useScrollRestoration } from "../../context/ScrollContext";

const RATE_TYPE_FILTERS = [
  { label: "All Items", value: "All" },
  { label: "Piece Rate", value: "piece" },
  { label: "Unit Rate", value: "unit" },
  { label: "Bag Rate", value: "bag" },
  { label: "Low Stock", value: "Low Stock" },
];

const RATE_TYPE_SUFFIX = {
  piece: "piece",
  unit: "unit",
  bag: "bag",
};

function ItemManagementList() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/settings/items");
  const { items, loading, updateItem } = useContext(ItemContext);
  const { profile } = useContext(UserContext);

  const currencySymbol = profile?.currency || "₹";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");

  const [allStockLogs, setAllStockLogs] = useState([]);

  useEffect(() => {
    const q = collection(db, "item_stock_logs");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logsData = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setAllStockLogs(logsData);
      },
      (err) => {
        console.error("Error loading stock logs:", err);
      }
    );
    return () => unsubscribe();
  }, []);

  const overallSummary = useMemo(() => {
    let totalProduction = 0;
    let totalSales = 0;
    let totalInflow = 0;
    let totalOutflow = 0;

    (allStockLogs || []).forEach((log) => {
      const q = Number(log.quantity || 0);
      const type = log.type || "";

      if (type === "production" || type === "production_adjustment") {
        if (q > 0) totalProduction += q;
      } else if (type === "sale") {
        if (q < 0) totalSales += Math.abs(q);
      }

      if (q > 0) totalInflow += q;
      else if (q < 0) totalOutflow += Math.abs(q);
    });

    let totalStockCount = 0;
    let totalStockValuation = 0;
    let lowStockCount = 0;

    (items || []).forEach((item) => {
      const currentStock = Number(item.openingStock !== undefined ? item.openingStock : item.stock || 0);
      const rate = Number(item.sellingRate || item.sellingPrice || 0);
      totalStockCount += currentStock;
      totalStockValuation += currentStock * rate;
      if (currentStock <= 5) lowStockCount++;
    });

    return {
      totalProduction,
      totalSales,
      totalInflow,
      totalOutflow,
      totalStockCount,
      totalStockValuation,
      lowStockCount,
      totalItems: (items || []).length,
    };
  }, [allStockLogs, items]);

  useEffect(() => {
    if (params.filter === "low_stock") {
      setSelectedFilter("Low Stock");
    }
  }, [params.filter]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  // Filter items based on search, status and selected Rate Type or Low Stock
  const filteredItems = items.filter((item) => {
    const matchesSearch = item.itemName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const currentStock = item.openingStock !== undefined ? item.openingStock : (item.stock || 0);
    const itemStatus = item.status || "Active";
    const matchesStatus = statusFilter === "All" || itemStatus === statusFilter;

    if (!matchesStatus) return false;

    if (selectedFilter === "All") {
      return matchesSearch;
    } else if (selectedFilter === "Low Stock") {
      return matchesSearch && Number(currentStock) <= 5;
    } else {
      return matchesSearch && item.rateType === selectedFilter;
    }
  });

  const finishedProducts = filteredItems.filter((item) => item.itemType !== "raw_material");
  const rawMaterials = filteredItems.filter((item) => item.itemType === "raw_material");

  const handleToggleStatus = async (item) => {
    const newStatus = item.status === "Inactive" ? "Active" : "Inactive";
    try {
      if (item.itemType !== "raw_material") {
        if (newStatus === "Active") {
          // Deactivate all other active finished products
          const activeProducts = items.filter(
            (i) => i.itemType !== "raw_material" && (i.status || "Active") === "Active" && i.id !== item.id
          );
          for (const actProd of activeProducts) {
            await updateItem(actProd.id, { status: "Inactive" });
          }
        } else {
          // User is trying to deactivate this product
          const otherActiveProducts = items.filter(
            (i) => i.itemType !== "raw_material" && (i.status || "Active") === "Active" && i.id !== item.id
          );
          if (otherActiveProducts.length === 0) {
            alert("At least one finished product must remain active.");
            return;
          }
        }
      }
      await updateItem(item.id, {
        status: newStatus
      });
    } catch (e) {
      alert("Failed to toggle status.");
    }
  };

  const renderItemCard = (item) => {
    const currentStock = item.openingStock !== undefined ? item.openingStock : (item.stock || 0);
    const isLowStock = Number(currentStock) <= 5;
    const suffix = RATE_TYPE_SUFFIX[item.rateType] || "piece";
    const isRawMaterial = item.itemType === "raw_material";
    const iconName = isRawMaterial ? "layers" : "store";
    const iconColor = isRawMaterial ? "#b45309" : "#4f46e5";
    const iconBg = isRawMaterial ? "#fef3c7" : "#f0f2fe";

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.itemCard, pressed && styles.cardPressed]}
        onPress={() => router.push({ pathname: "/settings/items/details", params: { id: item.id } })}
      >
        <View style={[styles.itemIconWrapper, { backgroundColor: iconBg }]}>
          <MaterialIcons name={iconName} size={26} color={iconColor} />
        </View>
        <View style={styles.itemDetails}>
          <View style={styles.itemMetaHeader}>
            <Text style={[styles.itemCategory, isRawMaterial && { color: colors.accent.warning }]}>
              {RATE_TYPE_FILTERS.find(f => f.value === item.rateType)?.label || "Piece Rate"}
            </Text>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  handleToggleStatus(item);
                }}
                style={[
                  styles.smallStatusBadge,
                  item.status === "Inactive" 
                    ? { backgroundColor: "#fef2f2" } 
                    : { backgroundColor: "#ecfdf5" }
                ]}
              >
                <Text style={[
                  styles.smallStatusBadgeText, 
                  item.status === "Inactive" 
                    ? { color: colors.accent.danger } 
                    : { color: colors.accent.success }
                ]}>
                  {item.status || "Active"}
                </Text>
              </Pressable>
              {isLowStock && (
                <View style={styles.lowStockBadge}>
                  <MaterialIcons name="warning" size={10} color="#ea580c" />
                  <Text style={styles.lowStockBadgeText}>Low Stock</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.itemName} numberOfLines={1}>{item.itemName}</Text>
          
          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>Selling Rate</Text>
              <Text style={styles.priceValue}>
                {currencySymbol}{Number(item.sellingRate || item.sellingPrice || 0).toFixed(2)}
                <Text style={styles.suffixText}> / {suffix}</Text>
              </Text>
            </View>
            <View style={styles.stockInfo}>
              <Text style={styles.stockLabel}>Opening Stock</Text>
              <Text style={[styles.stockValue, isLowStock && styles.stockValueLow]}>
                {currentStock} units
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.chevronIcon}>
          <MaterialIcons name="chevron-right" size={24} color={colors.border.medium} />
        </View>
      </Pressable>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading products catalog...</Text>
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
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.accent.primary]} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <BackButton label="Settings" onPress={() => router.push("/settings")} />
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.buttonPressed]}
            onPress={() => router.push("/settings/items/add")}
          >
            <MaterialIcons name="add" size={20} color={colors.bg.card} />
            <Text style={styles.addButtonText}>Add Item</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>Item Management</Text>
        <Text style={styles.subtitle}>View, edit, search, and manage stock quantities.</Text>
      </View>

      {/* Production & Inventory Summary Dashboard Card */}
      <View style={styles.summaryDashboardCard}>
        <View style={styles.summaryHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={styles.summaryIconCircle}>
              <MaterialIcons name="assessment" size={20} color="#4f46e5" />
            </View>
            <View>
              <Text style={styles.summaryTitle}>Production & Inventory Summary</Text>
              <Text style={styles.summarySubtitle}>
                Real-time metrics for all {overallSummary.totalItems} catalog items
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          {/* Total Production */}
          <View style={[styles.summaryMetricCard, { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <MaterialIcons name="precision-manufacturing" size={16} color="#059669" />
              <Text style={[styles.summaryMetricLabel, { color: "#047857" }]}>Total Production</Text>
            </View>
            <Text style={[styles.summaryMetricVal, { color: "#059669" }]}>
              +{overallSummary.totalProduction.toLocaleString("en-IN")}
            </Text>
            <Text style={styles.summaryMetricSub}>units manufactured</Text>
          </View>

          {/* Total Sales */}
          <View style={[styles.summaryMetricCard, { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <MaterialIcons name="shopping-cart" size={16} color="#2563eb" />
              <Text style={[styles.summaryMetricLabel, { color: "#1d4ed8" }]}>Total Sales</Text>
            </View>
            <Text style={[styles.summaryMetricVal, { color: "#2563eb" }]}>
              {overallSummary.totalSales.toLocaleString("en-IN")}
            </Text>
            <Text style={styles.summaryMetricSub}>units dispatched</Text>
          </View>

          {/* Total Inventory Stock */}
          <View style={[styles.summaryMetricCard, { backgroundColor: "#f5f3ff", borderColor: "#ddd6fe" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <MaterialIcons name="inventory-2" size={16} color="#7c3aed" />
              <Text style={[styles.summaryMetricLabel, { color: "#6d28d9" }]}>Total Stock</Text>
            </View>
            <Text style={[styles.summaryMetricVal, { color: "#7c3aed" }]}>
              {overallSummary.totalStockCount.toLocaleString("en-IN")}
            </Text>
            <Text style={styles.summaryMetricSub}>units in inventory</Text>
          </View>

          {/* Total Valuation */}
          <View style={[styles.summaryMetricCard, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <MaterialIcons name="account-balance-wallet" size={16} color="#16a34a" />
              <Text style={[styles.summaryMetricLabel, { color: "#15803d" }]}>Inventory Value</Text>
            </View>
            <Text style={[styles.summaryMetricVal, { color: "#16a34a" }]}>
              {currencySymbol}{overallSummary.totalStockValuation.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.summaryMetricSub}>stock valuation</Text>
          </View>
        </View>

        {/* Secondary Inflow / Outflow / Low Stock Strip */}
        <View style={styles.secondarySummaryStrip}>
          <View style={styles.stripCol}>
            <Text style={styles.stripLabel}>TOTAL INFLOW</Text>
            <Text style={[styles.stripVal, { color: "#059669" }]}>+{overallSummary.totalInflow.toLocaleString("en-IN")}</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripCol}>
            <Text style={styles.stripLabel}>TOTAL OUTFLOW</Text>
            <Text style={[styles.stripVal, { color: "#dc2626" }]}>-{overallSummary.totalOutflow.toLocaleString("en-IN")}</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripCol}>
            <Text style={styles.stripLabel}>LOW STOCK</Text>
            <Text style={[styles.stripVal, { color: overallSummary.lowStockCount > 0 ? "#d97706" : colors.text.muted }]}>
              {overallSummary.lowStockCount} items
            </Text>
          </View>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={colors.text.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search items by name..."
          placeholderTextColor={colors.text.muted}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <MaterialIcons name="close" size={20} color={colors.text.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Categories Horizonal Scroll */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        <View style={styles.categoryRow}>
          {RATE_TYPE_FILTERS.map((filter) => {
            const isSelected = selectedFilter === filter.value;
            return (
              <Pressable
                key={filter.value}
                style={[
                  styles.categoryPill, 
                  isSelected && styles.categoryPillSelected,
                  filter.value === "Low Stock" && { borderColor: "#fed7aa" },
                  filter.value === "Low Stock" && isSelected && { backgroundColor: "#ffedd5", borderColor: "#f97316" }
                ]}
                onPress={() => setSelectedFilter(filter.value)}
              >
                {filter.value === "Low Stock" && (
                  <MaterialIcons 
                    name="warning" 
                    size={14} 
                    color={isSelected ? "#ea580c" : "#d97706"} 
                    style={{ marginRight: 4 }} 
                  />
                )}
                <Text 
                  style={[
                    styles.categoryText, 
                    isSelected && styles.categoryTextSelected,
                    filter.value === "Low Stock" && { color: "#d97706" },
                    filter.value === "Low Stock" && isSelected && { color: "#ea580c", fontWeight: "700" }
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Status Filter Option Buttons */}
      <View style={styles.statusFilterContainer}>
        {["Active", "Inactive", "All"].map((statusOption) => {
          const isSelected = statusFilter === statusOption;
          const activeBg = statusOption === "Active" ? "#ecfdf5" : statusOption === "Inactive" ? "#fef2f2" : "#f0f2fe";
          const activeBorder = statusOption === "Active" ? "#10b981" : statusOption === "Inactive" ? "#ef4444" : colors.accent.primary;
          const activeText = statusOption === "Active" ? "#059669" : statusOption === "Inactive" ? "#ef4444" : colors.accent.primary;

          return (
            <Pressable
              key={statusOption}
              style={[
                styles.statusFilterButton,
                isSelected && { backgroundColor: activeBg, borderColor: activeBorder }
              ]}
              onPress={() => setStatusFilter(statusOption)}
            >
              <Text 
                style={[
                  styles.statusFilterText, 
                  isSelected && { color: activeText, fontWeight: "700" }
                ]}
              >
                {statusOption}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Product & Raw Materials Lists */}
      <View style={styles.listContainer}>
        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrapper}>
              <MaterialIcons name="local-mall" size={48} color={colors.border.medium} />
            </View>
            <Text style={styles.emptyTitle}>No Items Found</Text>
            <Text style={styles.emptyDesc}>
              {searchQuery || selectedFilter !== "All"
                ? "No products match your current search query or active filter."
                : "Your inventory list is currently empty. Get started by adding your first business product."}
            </Text>
            {searchQuery || selectedFilter !== "All" ? (
              <Pressable
                style={styles.clearFiltersBtn}
                onPress={() => {
                  setSearchQuery("");
                  setSelectedFilter("All");
                }}
              >
                <Text style={styles.clearFiltersBtnText}>Reset Filters</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.emptyCta}
                onPress={() => router.push("/settings/items/add")}
              >
                <MaterialIcons name="add" size={20} color={colors.bg.card} />
                <Text style={styles.emptyCtaText}>Add First Item</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {finishedProducts.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderLeft}>
                    <MaterialIcons name="grid-view" size={18} color="#4f46e5" />
                    <Text style={styles.sectionHeaderTitle}>Finished Products</Text>
                  </View>
                  <View style={[styles.sectionCountBadge, { backgroundColor: "#6C5CE720" }]}>
                    <Text style={[styles.sectionCountText, { color: colors.accent.primary }]}>{finishedProducts.length}</Text>
                  </View>
                </View>
                <View style={styles.sectionItems}>
                  {finishedProducts.map((item) => renderItemCard(item))}
                </View>
              </View>
            )}

            {rawMaterials.length > 0 && (
              <View style={[styles.sectionContainer, finishedProducts.length > 0 && { marginTop: 8 }]}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderLeft}>
                    <MaterialIcons name="layers" size={18} color={colors.accent.warning} />
                    <Text style={[styles.sectionHeaderTitle, { color: "#7c2d12" }]}>Raw Materials</Text>
                  </View>
                  <View style={[styles.sectionCountBadge, { backgroundColor: "#fef3c7" }]}>
                    <Text style={[styles.sectionCountText, { color: "#d97706" }]}>{rawMaterials.length}</Text>
                  </View>
                </View>
                <View style={styles.sectionItems}>
                  {rawMaterials.map((item) => renderItemCard(item))}
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function ItemManagementRoute() {
  return (
    <ProtectedRoute>
      <ItemManagementList />
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: colors.bg.card,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg.card,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.secondary,
    fontSize: 16,
    fontWeight: "500",
  },
  header: {
    marginBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.secondary,
    marginLeft: 6,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  addButtonText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 13,
    marginLeft: 4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.muted,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: colors.bg.primary,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  categoryScroll: {
    marginBottom: 16,
    flexDirection: "row",
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
  },
  categoryPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    flexDirection: "row",
    alignItems: "center",
  },
  categoryPillSelected: {
    backgroundColor: "#6C5CE720",
    borderColor: colors.accent.primary,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  categoryTextSelected: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
  listContainer: {
    gap: 12,
    marginBottom: 24,
  },
  itemCard: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.bg.card,
    alignItems: "center",
  },
  cardPressed: {
    backgroundColor: colors.bg.primary,
    borderColor: colors.border.medium,
  },
  itemIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#f0f2fe",
    justifyContent: "center",
    alignItems: "center",
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  itemMetaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  itemCategory: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    color: "#4f46e5",
  },
  lowStockBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffe5d9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lowStockBadgeText: {
    color: "#ea580c",
    fontSize: 9,
    fontWeight: "700",
    marginLeft: 3,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  priceLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: "600",
  },
  priceValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
  },
  suffixText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.text.muted,
  },
  stockInfo: {
    alignItems: "flex-end",
  },
  stockLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: "600",
  },
  stockValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#059669",
  },
  stockValueLow: {
    color: "#ea580c",
  },
  chevronIcon: {
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bg.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  emptyCtaText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 6,
  },
  clearFiltersBtn: {
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  clearFiltersBtnText: {
    color: colors.text.secondary,
    fontWeight: "600",
    fontSize: 14,
  },
  sectionContainer: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e1b4b",
    letterSpacing: 0.3,
  },
  sectionCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: "700",
  },
  sectionItems: {
    gap: 12,
  },
  statusFilterContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  statusFilterButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.card,
    alignItems: "center",
    justifyContent: "center",
  },
  statusFilterText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
  },
  smallStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  smallStatusBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  summaryDashboardCard: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryHeader: {
    marginBottom: 12,
  },
  summaryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text.primary,
  },
  summarySubtitle: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: "500",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  summaryMetricCard: {
    flex: 1,
    minWidth: "46%",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  summaryMetricLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  summaryMetricVal: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  summaryMetricSub: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: "500",
    marginTop: 2,
  },
  secondarySummaryStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.bg.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  stripCol: {
    flex: 1,
    alignItems: "center",
  },
  stripLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.text.muted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  stripVal: {
    fontSize: 13,
    fontWeight: "800",
  },
  stripDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border.subtle,
  },
})
};
;