import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import theme from "../../theme/theme";

interface StorageOverviewProps {
  storageBucket: string;
  storageOk: boolean;
}

export default function StorageOverview({ storageBucket, storageOk }: StorageOverviewProps) {
  const { spacing, shadows } = theme;

  return (
    <View style={[styles.card, shadows.card]}>
      <View style={styles.header}>
        <MaterialIcons name="cloud-queue" size={24} color="#10B981" />
        <Text style={styles.title}>Storage Overview</Text>
      </View>
      <View style={styles.divider} />

      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.label}>Bucket Identifier:</Text>
          <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">
            {storageBucket || "Not Configured"}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Access Status:</Text>
          <View style={styles.badgeWrap}>
            {storageOk ? (
              <View style={[styles.badge, styles.badgeActive]}>
                <Text style={styles.badgeTextActive}>Active</Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.badgeInactive]}>
                <Text style={styles.badgeTextInactive}>Inactive</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Storage Rules:</Text>
          <Text style={styles.value}>Auth Required (Uploads)</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Media Cache:</Text>
          <Text style={styles.value}>Enabled (Local Cache)</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.bg.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: theme.spacing.md,
  },
  content: {
    gap: theme.spacing.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text.secondary,
  },
  value: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text.primary,
    maxWidth: "60%",
    textAlign: "right",
  },
  badgeWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  badgeActive: {
    backgroundColor: "#10B9811C",
  },
  badgeInactive: {
    backgroundColor: "#EF44441C",
  },
  badgeTextActive: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10B981",
  },
  badgeTextInactive: {
    fontSize: 12,
    fontWeight: "700",
    color: "#EF4444",
  },
});
