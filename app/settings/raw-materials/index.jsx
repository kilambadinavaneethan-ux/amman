import React, { useContext, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ItemContext } from "../../context/ItemContext";
import { RawMaterialContext } from "../../context/RawMaterialContext";
import { UserContext } from "../../context/UserContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";
import { useScrollRestoration } from "../../context/ScrollContext";

function RawMaterialsDashboard() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/settings/raw-materials");
  const { items, loading: itemsLoading } = useContext(ItemContext);
  const { logs, loading: logsLoading } = useContext(RawMaterialContext);
  const { profile } = useContext(UserContext);

  const currencySymbol = profile?.currency || "$";

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("materials"); // "materials" | "activity"
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  // Filter items of type "raw_material"
  const rawMaterials = items.filter((item) => item.itemType === "raw_material");

  // Search filtered raw materials
  const filteredMaterials = rawMaterials.filter((item) => {
    const nameMatch = item.itemName.toLowerCase().includes(searchQuery.toLowerCase());
    const descMatch = (item.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch || descMatch;
  });

  // Calculate metrics
  const totalMaterials = rawMaterials.length;
  
  const totalStockValue = rawMaterials.reduce((sum, item) => {
    const currentStock = item.openingStock !== undefined ? item.openingStock : (item.stock || 0);
    const cost = item.costPrice || 0;
    return sum + (Number(currentStock) * Number(cost));
  }, 0);

  const lowStockAlerts = rawMaterials.filter((item) => {
    const currentStock = Number(item.openingStock !== undefined ? item.openingStock : (item.stock || 0));
    const reorderThreshold = Number(item.reorderLevel !== undefined ? item.reorderLevel : 5);
    return currentStock <= reorderThreshold;
  }).length;

  const renderMaterialCard = (item) => {
    const currentStock = Number(item.openingStock !== undefined ? item.openingStock : (item.stock || 0));
    const reorderThreshold = Number(item.reorderLevel !== undefined ? item.reorderLevel : 5);
    
    let status = "Healthy";
    let statusColor = "#10b981";
    let statusBg = "#ecfdf5";
    
    if (currentStock === 0) {
      status = "Out of Stock";
      statusColor = "#ef4444";
      statusBg = "#fef2f2";
    } else if (currentStock <= reorderThreshold) {
      status = "Low Stock";
      statusColor = "#f59e0b";
      statusBg = "#fffbeb";
    }

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.materialCard, pressed && styles.cardPressed]}
        onPress={() => router.push({ pathname: "/settings/raw-materials/details", params: { id: item.id } })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.iconContainer}>
              <MaterialIcons name="layers" size={22} color={colors.accent.warning} />
            </View>
            <View style={styles.titleContainer}>
              <Text style={styles.materialName} numberOfLines={1}>
                {item.itemName}
              </Text>
              <Text style={styles.unitText}>
                Unit: {item.rateType || "unit"}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{status}</Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardBody}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Stock Balance</Text>
            <Text style={[styles.metricValue, status === "Out of Stock" && styles.outOfStockText, status === "Low Stock" && styles.lowStockText]}>
              {currentStock} <Text style={styles.metricUnit}>{item.rateType || "units"}</Text>
            </Text>
          </View>

          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Unit Cost</Text>
            <Text style={styles.metricValue}>
              {currencySymbol}{Number(item.costPrice || 0).toFixed(2)}
            </Text>
          </View>

          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Inventory Value</Text>
            <Text style={styles.metricValue}>
              {currencySymbol}{(currentStock * Number(item.costPrice || 0)).toFixed(2)}
            </Text>
          </View>
        </View>
        
        <View style={styles.cardFooter}>
          <Text style={styles.reorderText}>
            Reorder Alert at: <Text style={{ fontWeight: "700" }}>{reorderThreshold} {item.rateType || "units"}</Text>
          </Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.border.medium} />
        </View>
      </Pressable>
    );
  };

  const renderLogCard = (log) => {
    const isPurchase = log.type === "purchase";
    const dateStr = log.date ? log.date.toLocaleDateString() : "N/A";
    const timeStr = log.date ? log.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

    return (
      <View key={log.id} style={styles.logCard}>
        <View style={styles.logCardHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.logIconWrapper, { backgroundColor: isPurchase ? "#ecfdf5" : "#6C5CE720" }]}>
              <MaterialIcons
                name={isPurchase ? "add-shopping-cart" : "build"}
                size={18}
                color={isPurchase ? "#10b981" : "#3b82f6"}
              />
            </View>
            <View>
              <Text style={styles.logTitle}>{log.materialName}</Text>
              <Text style={styles.logDateTime}>
                {dateStr} • {timeStr}
              </Text>
            </View>
          </View>
          <View style={[styles.typeBadge, { backgroundColor: isPurchase ? "#d1fae5" : "#6C5CE720" }]}>
            <Text style={[styles.typeBadgeText, { color: isPurchase ? "#065f46" : "#1e40af" }]}>
              {isPurchase ? "Stock In / Purchase" : "Stock Out / Used"}
            </Text>
          </View>
        </View>

        <View style={styles.logCardBody}>
          <View style={styles.logMetricRow}>
            <View>
              <Text style={styles.logMetricLabel}>Quantity</Text>
              <Text style={[styles.logMetricVal, { color: isPurchase ? "#10b981" : colors.accent.danger }]}>
                {isPurchase ? "+" : "-"}{log.quantity} {log.unit || ""}
              </Text>
            </View>
            {isPurchase && log.costPerUnit ? (
              <View>
                <Text style={styles.logMetricLabel}>Cost per Unit</Text>
                <Text style={styles.logMetricVal}>
                  {currencySymbol}{Number(log.costPerUnit).toFixed(2)}
                </Text>
              </View>
            ) : null}
            {isPurchase && log.totalCost ? (
              <View>
                <Text style={styles.logMetricLabel}>Total Cost</Text>
                <Text style={styles.logMetricVal}>
                  {currencySymbol}{Number(log.totalCost).toFixed(2)}
                </Text>
              </View>
            ) : null}
          </View>

          {log.notes ? (
            <View style={styles.logNotesWrapper}>
              <MaterialIcons name="speaker-notes" size={14} color={colors.text.muted} style={{ marginTop: 2 }} />
              <Text style={styles.logNotesText}>{log.notes}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const renderAnalyticsView = () => {
    const purchases = logs.filter(log => log.type === "purchase");
    const usages = logs.filter(log => log.type === "consumption");

    const totalSpend = purchases.reduce((sum, log) => sum + Number(log.totalCost || 0), 0);

    // 1. Group spend by material
    const materialSpendMap = {};
    purchases.forEach(log => {
      const name = log.materialName || "Unknown Material";
      materialSpendMap[name] = (materialSpendMap[name] || 0) + Number(log.totalCost || 0);
    });
    const sortedMaterialSpend = Object.entries(materialSpendMap).sort((a, b) => b[1] - a[1]);

    // 2. Group usage by material
    const materialUsageMap = {};
    usages.forEach(log => {
      const name = log.materialName || "Unknown Material";
      const unit = log.unit || "units";
      if (!materialUsageMap[name]) {
        materialUsageMap[name] = { quantity: 0, unit };
      }
      materialUsageMap[name].quantity += Number(log.quantity || 0);
    });
    const sortedMaterialUsage = Object.entries(materialUsageMap).sort((a, b) => b[1].quantity - a[1].quantity);

    // 3. Group spend by supplier
    const supplierSpendMap = {};
    purchases.forEach(log => {
      const supplier = log.supplierName || "Unknown Supplier";
      supplierSpendMap[supplier] = (supplierSpendMap[supplier] || 0) + Number(log.totalCost || 0);
    });
    const sortedSupplierSpend = Object.entries(supplierSpendMap).sort((a, b) => b[1] - a[1]);

    if (logs.length === 0) {
      return (
        <View style={styles.emptyState}>
          <MaterialIcons name="analytics" size={48} color={colors.border.medium} />
          <Text style={styles.emptyTitle}>No Analytics Available</Text>
          <Text style={styles.emptyDesc}>
            Log raw material purchases and consumption logs to view spend patterns and usage metrics.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.analyticsSection}>
        {/* Total Spend Summary Card */}
        <View style={styles.analyticsSummaryContainer}>
          <View style={styles.analyticsSumCard}>
            <Text style={styles.analyticsSumLabel}>Total Material Purchases Spent</Text>
            <Text style={styles.analyticsSumVal}>
              {currencySymbol}{totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* MONTHLY TRENDS BAR CHART */}
        <View style={styles.card}>
          <Text style={styles.cardSectionHeading}>Monthly Spend Trends (Last 6 Months)</Text>
          {(() => {
            const months = [];
            for (let i = 5; i >= 0; i--) {
              const d = new Date();
              d.setDate(1); // Set to 1st to avoid month rollover (e.g. Feb 29 → Mar 1)
              d.setMonth(d.getMonth() - i);
              const m = d.getMonth();
              const y = d.getFullYear();
              const monthPurchases = purchases.filter(log => {
                const logDate = log.date;
                return logDate.getMonth() === m && logDate.getFullYear() === y;
              });
              const total = monthPurchases.reduce((s, log) => s + Number(log.totalCost || 0), 0);
              months.push({
                label: d.toLocaleDateString("en-IN", { month: "short" }),
                total,
                month: m,
                year: y,
              });
            }
            const maxVal = Math.max(...months.map((m) => m.total), 1);

            return (
              <View>
                <View style={styles.trendChartContainer}>
                  {months.map((m, i) => {
                    const barHeight = Math.max(4, (m.total / maxVal) * 120);
                    const prevTotal = i > 0 ? months[i - 1].total : m.total;
                    const changePercent = prevTotal > 0 ? Math.round(((m.total - prevTotal) / prevTotal) * 100) : 0;
                    const isCurrentMonth = i === months.length - 1;

                    return (
                      <View key={`trend-${i}-${m.month}-${m.year}`} style={styles.trendBarCol}>
                        <Text style={styles.trendBarValue}>
                          {m.total >= 1000 ? `${(m.total / 1000).toFixed(1)}K` : m.total.toLocaleString("en-IN")}
                        </Text>
                        <View
                          style={[
                            styles.trendBar,
                            {
                              height: barHeight,
                              backgroundColor: isCurrentMonth ? "#b45309" : "#fde68a",
                            },
                          ]}
                        />
                        <Text style={[styles.trendBarLabel, isCurrentMonth && { color: colors.accent.warning, fontWeight: "700" }]}>
                          {m.label}
                        </Text>
                        {i > 0 && changePercent !== 0 && (
                          <View style={styles.trendChangeRow}>
                            <MaterialIcons
                              name={changePercent > 0 ? "arrow-upward" : "arrow-downward"}
                              size={10}
                              color={changePercent > 0 ? "#ef4444" : colors.accent.success}
                            />
                            <Text
                              style={[
                                styles.trendChangeText,
                                { color: changePercent > 0 ? "#ef4444" : colors.accent.success },
                              ]}
                            >
                              {Math.abs(changePercent)}%
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })()}
        </View>

        {/* Spend by Material */}
        <View style={styles.card}>
          <Text style={styles.cardSectionHeading}>Spending by Material</Text>
          {sortedMaterialSpend.length === 0 ? (
            <Text style={styles.emptyText}>No purchase transactions recorded.</Text>
          ) : (
            sortedMaterialSpend.map(([name, amount]) => {
              const pct = totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0;
              return (
                <View key={name} style={styles.analyticsProgressBarRow}>
                  <View style={styles.analyticsProgressBarHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <MaterialIcons name="layers" size={16} color={colors.accent.warning} />
                      <Text style={styles.analyticsProgressLabel}>{name}</Text>
                    </View>
                    <Text style={styles.analyticsProgressValue}>
                      {currencySymbol}{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({pct}%)
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: colors.accent.warning }]} />
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Usage Volume by Material */}
        <View style={styles.card}>
          <Text style={styles.cardSectionHeading}>Consumption Volume</Text>
          {sortedMaterialUsage.length === 0 ? (
            <Text style={styles.emptyText}>No consumption logs recorded.</Text>
          ) : (
            sortedMaterialUsage.map(([name, data]) => {
              return (
                <View key={name} style={styles.usageRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={styles.usageIconWrapper}>
                      <MaterialIcons name="trending-down" size={16} color={colors.accent.danger} />
                    </View>
                    <View>
                      <Text style={styles.usageName}>{name}</Text>
                      <Text style={styles.usageSub}>Consumed quantity</Text>
                    </View>
                  </View>
                  <Text style={styles.usageQty}>
                    {data.quantity.toLocaleString()} {data.unit}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Spend by Supplier */}
        <View style={styles.card}>
          <Text style={styles.cardSectionHeading}>Spending by Supplier</Text>
          {sortedSupplierSpend.length === 0 ? (
            <Text style={styles.emptyText}>No purchase transactions recorded.</Text>
          ) : (
            sortedSupplierSpend.map(([supplier, amount]) => {
              const pct = totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0;
              return (
                <View key={supplier} style={styles.analyticsProgressBarRow}>
                  <View style={styles.analyticsProgressBarHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <MaterialIcons name="person" size={16} color={colors.accent.primary} />
                      <Text style={styles.analyticsProgressLabel}>{supplier}</Text>
                    </View>
                    <Text style={styles.analyticsProgressValue}>
                      {currencySymbol}{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({pct}%)
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: colors.accent.primary }]} />
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
    );
  };

  const dashboardLoading = (itemsLoading || logsLoading) && !refreshing;

  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.container}
      scrollEventThrottle={32}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.accent.primary]} />}
    >
      {/* Header Navigation */}
      <View style={styles.header}>
        <BackButton label="Settings" onPress={() => router.push("/settings")} />
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.buttonPressed]}
          onPress={() => router.push("/settings/raw-materials/add")}
        >
          <MaterialIcons name="add" size={20} color={colors.bg.card} />
          <Text style={styles.addButtonText}>Add Material</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Raw Materials Hub</Text>
      <Text style={styles.subtitle}>Track production supply, log intake stock, and audit usage.</Text>

      {/* Metrics Section */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={[styles.statIconContainer, { backgroundColor: "#6C5CE720" }]}>
            <MaterialIcons name="inventory" size={20} color={colors.accent.primary} />
          </View>
          <Text style={styles.statVal}>{totalMaterials}</Text>
          <Text style={styles.statLabel}>Materials Registered</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIconContainer, { backgroundColor: "#f0fdf4" }]}>
            <MaterialIcons name="attach-money" size={20} color="#16a34a" />
          </View>
          <Text style={styles.statVal}>{currencySymbol}{totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <Text style={styles.statLabel}>Inventory Valuation</Text>
        </View>

        <View style={[styles.statCard, lowStockAlerts > 0 && styles.statCardAlert]}>
          <View style={[styles.statIconContainer, { backgroundColor: lowStockAlerts > 0 ? "#fef2f2" : "#fef3c7" }]}>
            <MaterialIcons name="warning" size={20} color={lowStockAlerts > 0 ? "#ef4444" : "#d97706"} />
          </View>
          <Text style={[styles.statVal, lowStockAlerts > 0 && { color: colors.accent.danger }]}>{lowStockAlerts}</Text>
          <Text style={styles.statLabel}>Low Stock Alerts</Text>
        </View>
      </View>

      {/* Triple Tabs navigation */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tabButton, activeTab === "materials" && styles.tabButtonActive]}
          onPress={() => setActiveTab("materials")}
        >
          <MaterialIcons name="layers" size={20} color={activeTab === "materials" ? "#6C5CE7" : colors.text.muted} />
          <Text style={[styles.tabText, activeTab === "materials" && styles.tabTextActive]}>Materials Stock</Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === "activity" && styles.tabButtonActive]}
          onPress={() => setActiveTab("activity")}
        >
          <MaterialIcons name="history" size={20} color={activeTab === "activity" ? "#6C5CE7" : colors.text.muted} />
          <Text style={[styles.tabText, activeTab === "activity" && styles.tabTextActive]}>Audit Log</Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === "analytics" && styles.tabButtonActive]}
          onPress={() => setActiveTab("analytics")}
        >
          <MaterialIcons name="analytics" size={20} color={activeTab === "analytics" ? "#6C5CE7" : colors.text.muted} />
          <Text style={[styles.tabText, activeTab === "analytics" && styles.tabTextActive]}>Analytics</Text>
        </Pressable>
      </View>

      {/* Content Loader */}
      {dashboardLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.loadingText}>Retrieving Raw Material Inventory...</Text>
        </View>
      ) : activeTab === "materials" ? (
        <>
          {/* Search bar */}
          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color={colors.text.muted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search materials by name or notes..."
              placeholderTextColor={colors.text.muted}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery("")}>
                <MaterialIcons name="close" size={20} color={colors.text.muted} />
              </Pressable>
            ) : null}
          </View>

          {/* List items */}
          <View style={styles.listContainer}>
            {filteredMaterials.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="layers-clear" size={48} color={colors.border.medium} />
                <Text style={styles.emptyTitle}>No Raw Materials Found</Text>
                <Text style={styles.emptyDesc}>
                  {searchQuery
                    ? "Adjust your search parameters and try looking again."
                    : "No raw materials are configured. Register your first production stock (like cement, gravel, sand)."}
                </Text>
                {!searchQuery && (
                  <Pressable
                    style={styles.emptyBtn}
                    onPress={() => router.push("/settings/raw-materials/add")}
                  >
                    <Text style={styles.emptyBtnText}>Register First Material</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              filteredMaterials.map(renderMaterialCard)
            )}
          </View>
        </>
      ) : activeTab === "activity" ? (
        /* Logs tab */
        <View style={styles.listContainer}>
          {logs.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="history-toggle-off" size={48} color={colors.border.medium} />
              <Text style={styles.emptyTitle}>No Activities Recorded</Text>
              <Text style={styles.emptyDesc}>
                Stock adjustment audit logs will appear here as soon as you record a purchase or consumption logs.
              </Text>
            </View>
          ) : (
            logs.map(renderLogCard)
          )}
        </View>
      ) : (
        /* Analytics tab */
        renderAnalyticsView()
      )}
    </ScrollView>
  );
}

export default function DashboardRoute() {
  return (
    <ProtectedRoute>
      <RawMaterialsDashboard />
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
    paddingVertical: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.muted,
    fontSize: 15,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addButtonText: {
    color: colors.bg.card,
    fontWeight: "600",
    fontSize: 13,
    marginLeft: 4,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginBottom: 20,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.bg.card,
  },
  statCardAlert: {
    borderColor: "#fca5a5",
    backgroundColor: "#fff8f8",
  },
  statIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statVal: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: "600",
  },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: {
    borderBottomColor: colors.accent.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.muted,
  },
  tabTextActive: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 14,
  },
  listContainer: {
    gap: 12,
    paddingBottom: 24,
  },
  materialCard: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 14,
    backgroundColor: colors.bg.card,
    padding: 14,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#fffbeb",
    justifyContent: "center",
    alignItems: "center",
  },
  titleContainer: {
    flex: 1,
  },
  materialName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 2,
  },
  unitText: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: 12,
  },
  cardBody: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricBlock: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: "600",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  metricUnit: {
    fontSize: 10,
    fontWeight: "500",
    color: colors.text.muted,
  },
  outOfStockText: {
    color: colors.accent.danger,
  },
  lowStockText: {
    color: colors.accent.warning,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: colors.bg.primary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  reorderText: {
    fontSize: 10,
    color: colors.text.muted,
  },
  emptyState: {
    paddingVertical: 40,
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border.medium,
    borderRadius: 16,
    paddingHorizontal: 20,
    backgroundColor: "#fafafa",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
    marginTop: 12,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyBtn: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyBtnText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 13,
  },
  logCard: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    backgroundColor: colors.bg.card,
    padding: 12,
  },
  logCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  logIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  logTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  logDateTime: {
    fontSize: 10,
    color: colors.text.muted,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  logCardBody: {
    backgroundColor: colors.bg.primary,
    padding: 8,
    borderRadius: 8,
  },
  logMetricRow: {
    flexDirection: "row",
    gap: 20,
  },
  logMetricLabel: {
    fontSize: 9,
    color: colors.text.muted,
    fontWeight: "600",
    marginBottom: 2,
  },
  logMetricVal: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text.primary,
  },
  logNotesWrapper: {
    flexDirection: "row",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    marginTop: 8,
    paddingTop: 6,
  },
  logNotesText: {
    fontSize: 11,
    color: colors.text.muted,
    flex: 1,
  },
  analyticsSection: {
    gap: 16,
    paddingBottom: 24,
  },
  analyticsSummaryContainer: {
    backgroundColor: colors.accent.primary,
    borderRadius: 16,
    padding: 16,
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 8,
  },
  analyticsSumCard: {
    justifyContent: "center",
  },
  analyticsSumLabel: {
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  analyticsSumVal: {
    color: colors.bg.card,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 14,
    backgroundColor: colors.bg.card,
    padding: 16,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  cardSectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: "center",
    paddingVertical: 12,
  },
  analyticsProgressBarRow: {
    marginBottom: 14,
  },
  analyticsProgressBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  analyticsProgressLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.primary,
  },
  analyticsProgressValue: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.border.subtle,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  usageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  usageIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
  },
  usageName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.primary,
  },
  usageSub: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 1,
  },
  usageQty: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent.danger,
  },
  trendChartContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 8,
    paddingBottom: 4,
  },
  trendBarCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  trendBar: {
    width: 28,
    borderRadius: 6,
    minHeight: 4,
  },
  trendBarValue: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  trendBarLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
    marginTop: 2,
  },
  trendChangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  trendChangeText: {
    fontSize: 9,
    fontWeight: "700",
  },
})
};
;
