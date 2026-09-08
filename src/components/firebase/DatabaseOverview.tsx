import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../../app/context/ThemeContext";
import { DatabaseStats } from "../../services/firebase/firebaseStatsService";

interface DatabaseOverviewProps {
  stats: DatabaseStats | null;
  loading: boolean;
}

export default function DatabaseOverview({ stats, loading }: DatabaseOverviewProps) {
  const { theme } = useTheme();
  const { colors, shadows } = theme;

  const statItems = [
    { label: "Customers", count: stats?.customers ?? 0, icon: "person", color: colors.accent.primary },
    { label: "Orders", count: stats?.orders ?? 0, icon: "receipt", color: colors.accent.success },
    { label: "Items", count: stats?.items ?? 0, icon: "inventory", color: colors.accent.info },
    { label: "Payments", count: stats?.payments ?? 0, icon: "payments", color: colors.accent.warning },
    { label: "Expenses", count: stats?.expenses ?? 0, icon: "money-off", color: colors.accent.danger },
    { label: "Workers", count: stats?.workers ?? 0, icon: "engineering", color: colors.accent.primary },
    { label: "Delivery", count: stats?.deliveryPartners ?? 0, icon: "local-shipping", color: colors.accent.info },
    { label: "Raw Materials", count: stats?.rawMaterialSuppliers ?? 0, icon: "layers", color: colors.accent.success },
    { label: "Trips", count: stats?.deliveryTrips ?? 0, icon: "route", color: colors.accent.warning },
    { label: "Cards", count: stats?.visitingCards ?? 0, icon: "badge", color: colors.accent.primary },
  ];

  return (
    <View style={[styles.card, shadows.card, { backgroundColor: colors.bg.card, borderColor: colors.border.subtle }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialIcons name="storage" size={24} color={colors.accent.primary} />
          <Text style={[styles.title, { color: colors.text.primary }]}>Database Telemetry</Text>
        </View>
        <View style={[styles.totalBadge, { backgroundColor: `${colors.accent.primary}15`, borderColor: `${colors.accent.primary}30` }]}>
          <Text style={[styles.totalBadgeText, { color: colors.accent.primary }]}>
            {stats?.totalDocuments ?? 0} docs • {stats?.collectionsCount ?? 32} tables
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.accent.primary} />
          <Text style={[styles.loadingText, { color: colors.text.secondary }]}>Fetching document metrics...</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {statItems.map((item, idx) => (
            <View key={item.label} style={[styles.gridItem, idx % 2 === 0 ? [styles.gridItemLeft, { borderRightColor: colors.border.subtle }] : null]}>
              <View style={[styles.iconWrap, { backgroundColor: `${item.color}15` }]}>
                <MaterialIcons name={item.icon as any} size={18} color={item.color} />
              </View>
              <View style={styles.textWrap}>
                <Text style={[styles.count, { color: colors.text.primary }]}>{item.count}</Text>
                <Text style={[styles.label, { color: colors.text.muted }]}>{item.label}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  totalBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  totalBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  loadingContainer: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "500",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 12,
  },
  gridItem: {
    width: "50%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  gridItemLeft: {
    paddingRight: 8,
    borderRightWidth: 1,
  },
  iconWrap: {
    padding: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    justifyContent: "center",
  },
  count: {
    fontSize: 16,
    fontWeight: "800",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
});
