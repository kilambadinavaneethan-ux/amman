import React, { useContext, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { CollectorContext } from "../../context/CollectorContext";
import { CustomerContext } from "../../context/CustomerContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";
import { useScrollRestoration } from "../../context/ScrollContext";

const STATUS_FILTERS = [
  { label: "All Collectors", value: "All" },
  { label: "Active", value: "Active" },
  { label: "Inactive", value: "Inactive" },
];

function CollectorsListScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/settings/collectors");
  const { collectors, loading } = useContext(CollectorContext);
  const { customers } = useContext(CustomerContext);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  // Helper to calculate collector-specific metrics
  const getCollectorMetrics = (collectorId) => {
    const assigned = customers.filter((c) => c.collectorId === collectorId);
    const totalPending = assigned.reduce((sum, c) => sum + (c.balance || 0), 0);
    return {
      customerCount: assigned.length,
      totalPending,
    };
  };

  const filteredCollectors = collectors.filter((collector) => {
    const matchesSearch = 
      (collector.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (collector.mobile || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (collector.area || "").toLowerCase().includes(searchQuery.toLowerCase());

    if (selectedStatus === "All") {
      return matchesSearch;
    } else {
      return matchesSearch && collector.status === selectedStatus;
    }
  });

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading money collectors...</Text>
      </View>
    );
  }

  // Summary counts
  const totalActive = collectors.filter((c) => c.status === "Active").length;
  const grandTotalPending = customers
    .filter((c) => c.collectorId)
    .reduce((sum, c) => sum + (c.balance || 0), 0);

  return (
    <View style={styles.root}>
      <ScrollView 
        ref={scrollViewRef}
        contentContainerStyle={styles.container}
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
              onPress={() => router.push("/settings/collectors/add")}
            >
              <MaterialIcons name="add" size={20} color={colors.bg.card} />
              <Text style={styles.addButtonText}>Add Collector</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>Balance Collectors</Text>
          <Text style={styles.subtitle}>Register and manage agents collecting unpaid balances from customers.</Text>
        </View>

        {/* Overview Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Active Collectors</Text>
            <Text style={styles.statValue}>{totalActive}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Assigned Debt</Text>
            <Text style={[styles.statValue, { color: colors.accent.danger }]}>
              ₹{grandTotalPending.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color={colors.text.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name, phone, area..."
            placeholderTextColor={colors.text.muted}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialIcons name="close" size={20} color={colors.text.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <View style={styles.filterRow}>
            {STATUS_FILTERS.map((filter) => {
              const isSelected = selectedStatus === filter.value;
              return (
                <Pressable
                  key={filter.value}
                  style={[styles.filterPill, isSelected && styles.filterPillSelected]}
                  onPress={() => setSelectedStatus(filter.value)}
                >
                  <Text style={[styles.filterText, isSelected && styles.filterTextSelected]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Collectors list */}
        <View style={styles.listContainer}>
          {filteredCollectors.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrapper}>
                <MaterialIcons name="payments" size={48} color={colors.border.medium} />
              </View>
              <Text style={styles.emptyTitle}>No Collectors Found</Text>
              <Text style={styles.emptyDesc}>
                {searchQuery || selectedStatus !== "All"
                  ? "No money collectors match your active search terms or status filters."
                  : "No money collectors registered. Add one to start tracking client debt recovery."}
              </Text>
              {searchQuery || selectedStatus !== "All" ? (
                <Pressable
                  style={styles.clearFiltersBtn}
                  onPress={() => {
                    setSearchQuery("");
                    setSelectedStatus("All");
                  }}
                >
                  <Text style={styles.clearFiltersBtnText}>Reset Filters</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.emptyCta}
                  onPress={() => router.push("/settings/collectors/add")}
                >
                  <MaterialIcons name="add" size={20} color={colors.bg.card} />
                  <Text style={styles.emptyCtaText}>Add Collector</Text>
                </Pressable>
              )}
            </View>
          ) : (
            filteredCollectors.map((collector) => {
              const isActive = collector.status === "Active";
              const metrics = getCollectorMetrics(collector.id);
              return (
                <Pressable
                  key={collector.id}
                  style={({ pressed }) => [styles.collectorCard, pressed && styles.cardPressed]}
                  onPress={() => router.push({ pathname: "/settings/collectors/details", params: { id: collector.id } })}
                >
                  <View style={[styles.iconWrapper, isActive ? styles.iconActive : styles.iconInactive]}>
                    <MaterialIcons 
                      name="person" 
                      size={28} 
                      color={isActive ? "#6C5CE7" : colors.text.muted} 
                    />
                  </View>
                  <View style={styles.collectorDetails}>
                    <View style={styles.collectorHeader}>
                      <Text selectable={true} style={styles.collectorName} numberOfLines={1}>
                        {collector.name}
                      </Text>
                      <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
                        <Text style={[styles.statusBadgeText, isActive ? styles.statusActiveText : styles.statusInactiveText]}>
                          {collector.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <MaterialIcons name="phone" size={14} color={colors.text.muted} />
                      <Text selectable={true} style={styles.metaText}>{collector.mobile}</Text>
                    </View>

                    {collector.area && (
                      <View style={styles.metaRow}>
                        <MaterialIcons name="place" size={14} color={colors.text.muted} />
                        <Text selectable={true} style={styles.metaText}>{collector.area}</Text>
                      </View>
                    )}

                    {/* Stats summary row for collector */}
                    <View style={styles.cardStatsDivider} />
                    <View style={styles.cardStatsRow}>
                      <View style={styles.cardStatCol}>
                        <Text style={styles.cardStatNum}>{metrics.customerCount}</Text>
                        <Text style={styles.cardStatLabel}>Customers</Text>
                      </View>
                      <View style={styles.cardStatCol}>
                        <Text style={[styles.cardStatNum, metrics.totalPending > 0 && { color: colors.accent.danger }]}>
                          ₹{metrics.totalPending.toLocaleString("en-IN")}
                        </Text>
                        <Text style={styles.cardStatLabel}>Pending Balance</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.chevronIcon}>
                    <MaterialIcons name="chevron-right" size={24} color={colors.text.muted} />
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

export default function CollectorsRoute() {
  return (
    <ProtectedRoute>
      <CollectorsListScreen />
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.card,
  },
  container: {
    padding: 16,
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
    marginBottom: 20,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
    marginLeft: 6,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  addButtonText: {
    color: colors.bg.card,
    fontWeight: "700",
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
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text.primary,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 16,
    backgroundColor: colors.bg.primary,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  filterScroll: {
    marginBottom: 16,
    flexDirection: "row",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
  },
  filterPillSelected: {
    backgroundColor: "#6C5CE720",
    borderColor: colors.accent.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  filterTextSelected: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
  listContainer: {
    gap: 12,
    marginBottom: 60,
  },
  collectorCard: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.bg.card,
    alignItems: "center",
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  cardPressed: {
    backgroundColor: colors.bg.primary,
    borderColor: colors.border.medium,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  iconActive: {
    backgroundColor: "#6C5CE720",
  },
  iconInactive: {
    backgroundColor: colors.border.subtle,
  },
  collectorDetails: {
    flex: 1,
    marginLeft: 12,
    marginRight: 4,
  },
  collectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  collectorName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: "#dcfce7",
  },
  statusInactive: {
    backgroundColor: colors.border.subtle,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusActiveText: {
    color: "#15803d",
  },
  statusInactiveText: {
    color: colors.text.secondary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  metaText: {
    fontSize: 13,
    color: colors.text.muted,
    marginLeft: 6,
  },
  cardStatsDivider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: 8,
  },
  cardStatsRow: {
    flexDirection: "row",
    gap: 16,
  },
  cardStatCol: {
    flexDirection: "column",
  },
  cardStatNum: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  cardStatLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: "600",
    textTransform: "uppercase",
    marginTop: 1,
  },
  chevronIcon: {
    justifyContent: "center",
    marginLeft: 4,
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
})
};
;
