import React, { useContext, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { RawMaterialSupplierContext } from "../../../context/RawMaterialSupplierContext";
import { RawMaterialContext } from "../../../context/RawMaterialContext";
import { UserContext } from "../../../context/UserContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import BackButton from "../../../components/BackButton";
import { useTheme } from "../../../context/ThemeContext";
import { useScrollRestoration } from "../../../context/ScrollContext";

function SuppliersHubScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/settings/raw-materials/suppliers");
  const { suppliers, loading } = useContext(RawMaterialSupplierContext);
  const { logs } = useContext(RawMaterialContext);
  const { profile } = useContext(UserContext);

  const currencySymbol = profile?.currency || "$";

  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  // Filter suppliers by search query
  const filteredSuppliers = suppliers.filter((s) => {
    const nameMatch = (s.name || "").toLowerCase().includes(searchQuery.toLowerCase());
    const contactMatch = (s.contactPerson || "").toLowerCase().includes(searchQuery.toLowerCase());
    const emailMatch = (s.email || "").toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch || contactMatch || emailMatch;
  });

  // Calculate overall metrics
  const totalSuppliers = suppliers.length;
  const totalOwed = suppliers.reduce((sum, s) => sum + Number(s.balance || 0), 0);

  const renderSupplierCard = (supplier) => {
    const balance = Number(supplier.balance || 0);

    // Calculate total purchases and payments from logs
    const supplierLogs = logs.filter((l) => l.supplierId === supplier.id);
    const purchases = supplierLogs.filter((l) => l.type === "purchase");
    const payments = supplierLogs.filter((l) => l.type === "payment");
    const totalPurchases = purchases.reduce((sum, l) => sum + Number(l.totalCost || 0), 0);
    const totalPaid = purchases.reduce((sum, l) => sum + Number(l.amountPaid || 0), 0) + payments.reduce((sum, l) => sum + Number(l.amount || 0), 0);

    return (
      <Pressable
        key={supplier.id}
        style={({ pressed }) => [styles.supplierCard, pressed && styles.cardPressed]}
        onPress={() => router.push({ pathname: "/settings/raw-materials/suppliers/details", params: { id: supplier.id } })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.iconContainer}>
              <MaterialIcons name="perm-contact-calendar" size={22} color={colors.accent.primary} />
            </View>
            <View style={styles.titleContainer}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text selectable={true} style={styles.supplierName} numberOfLines={1}>
                  {supplier.name}
                </Text>
                <View style={[styles.statusBadge, supplier.status === "inactive" ? styles.statusBadgeInactive : styles.statusBadgeActive]}>
                  <Text style={[styles.statusBadgeText, supplier.status === "inactive" ? styles.statusBadgeTextInactive : styles.statusBadgeTextActive]}>
                    {supplier.status === "inactive" ? "Inactive" : "Active"}
                  </Text>
                </View>
              </View>
              <Text style={styles.contactText}>
                Agent: {supplier.contactPerson || "N/A"}
              </Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.border.medium} />
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardBody}>
          <View style={styles.contactInfoRow}>
            {supplier.phone ? (
              <View style={styles.contactItem}>
                <MaterialIcons name="phone" size={14} color={colors.text.muted} />
                <Text selectable={true} style={styles.contactItemText}>{supplier.phone}</Text>
              </View>
            ) : null}
            {supplier.email ? (
              <View style={styles.contactItem}>
                <MaterialIcons name="email" size={14} color={colors.text.muted} />
                <Text style={styles.contactItemText} numberOfLines={1}>{supplier.email}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.balancesSummaryRow}>
            <View style={styles.summaryMiniCol}>
              <Text style={styles.miniColLabel}>Total Value</Text>
              <Text style={styles.miniColValue}>{currencySymbol}{totalPurchases.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryMiniCol}>
              <Text style={styles.miniColLabel}>Paid Amount</Text>
              <Text style={styles.miniColValue}>{currencySymbol}{totalPaid.toFixed(2)}</Text>
            </View>
            <View style={[styles.summaryMiniCol, styles.summaryMiniColEnd]}>
              <Text style={styles.miniColLabel}>Balance Owed</Text>
              <Text style={[styles.miniColValue, balance > 0 ? styles.miniColValueDebt : styles.miniColValueClear]}>
                {currencySymbol}{balance.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.container}
      scrollEventThrottle={32}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.accent.primary]} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <BackButton label="Settings" onPress={() => router.push("/settings")} />
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.buttonPressed]}
          onPress={() => router.push("/settings/raw-materials/suppliers/add")}
        >
          <MaterialIcons name="add" size={20} color={colors.bg.card} />
          <Text style={styles.addButtonText}>Add Supplier</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Material Suppliers</Text>
      <Text style={styles.subtitle}>Register vendors, track outstanding debts, and record payouts.</Text>

      {/* Metrics Section */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={[styles.statIconContainer, { backgroundColor: "#6C5CE720" }]}>
            <MaterialIcons name="business-center" size={20} color={colors.accent.primary} />
          </View>
          <Text style={styles.statVal}>{totalSuppliers}</Text>
          <Text style={styles.statLabel}>Active Suppliers</Text>
        </View>

        <View style={[styles.statCard, totalOwed > 0 && styles.statCardAlert]}>
          <View style={[styles.statIconContainer, { backgroundColor: totalOwed > 0 ? "#fef2f2" : "#f0fdf4" }]}>
            <MaterialIcons name="credit-card" size={20} color={totalOwed > 0 ? "#ef4444" : "#16a34a"} />
          </View>
          <Text style={[styles.statVal, totalOwed > 0 && { color: colors.accent.danger }]}>
            {currencySymbol}{totalOwed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.statLabel}>Total Debt Owed</Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={colors.text.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search suppliers by name or email..."
          placeholderTextColor={colors.text.muted}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <MaterialIcons name="close" size={20} color={colors.text.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* List content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.loadingText}>Retrieving Supplier Accounts...</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {filteredSuppliers.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="people-outline" size={48} color={colors.border.medium} />
              <Text style={styles.emptyTitle}>No Suppliers Found</Text>
              <Text style={styles.emptyDesc}>
                {searchQuery
                  ? "Adjust search terms and try again."
                  : "Supplier directory is currently empty. Register vendors you buy raw materials from."}
              </Text>
              {!searchQuery && (
                <Pressable
                  style={styles.emptyBtn}
                  onPress={() => router.push("/settings/raw-materials/suppliers/add")}
                >
                  <Text style={styles.emptyBtnText}>Register First Supplier</Text>
                </Pressable>
              )}
            </View>
          ) : (
            filteredSuppliers.map(renderSupplierCard)
          )}
        </View>
      )}
    </ScrollView>
  );
}

export default function SuppliersHubRoute() {
  return (
    <ProtectedRoute>
      <SuppliersHubScreen />
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 20,
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
  supplierCard: {
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
    backgroundColor: "#6C5CE720",
    justifyContent: "center",
    alignItems: "center",
  },
  titleContainer: {
    flex: 1,
  },
  supplierName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 2,
  },
  contactText: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: "500",
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: 12,
  },
  cardBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  contactInfoRow: {
    flexDirection: "column",
    gap: 4,
    flex: 1,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contactItemText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "500",
  },
  balanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  balanceBadgeOwed: {
    backgroundColor: "#fef2f2",
  },
  balanceBadgeClear: {
    backgroundColor: "#f0fdf4",
  },
  balanceBadgeLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: "600",
  },
  balanceValueText: {
    fontSize: 13,
    fontWeight: "800",
  },
  balanceValueOwed: {
    color: colors.accent.danger,
  },
  balanceValueClear: {
    color: "#16a34a",
  },
  emptyState: {
    paddingVertical: 40,
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    borderWidth: 1.5,
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
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeActive: {
    backgroundColor: "#ecfdf5",
  },
  statusBadgeInactive: {
    backgroundColor: colors.border.subtle,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusBadgeTextActive: {
    color: "#059669",
  },
  statusBadgeTextInactive: {
    color: colors.text.muted,
  },
  balancesSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.bg.primary,
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  summaryMiniCol: {
    flex: 1,
  },
  summaryMiniColEnd: {
    alignItems: "flex-end",
  },
  miniColLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.text.muted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  miniColValue: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text.primary,
  },
  miniColValueDebt: {
    color: colors.accent.danger,
  },
  miniColValueClear: {
    color: "#16a34a",
  },
})
};
;
