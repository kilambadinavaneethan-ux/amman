import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../../app/context/ThemeContext";
import { LatencyResult } from "../../services/firebase/firebaseConnectionService";

interface FirebaseStatusCardProps {
  connected: boolean;
  projectName: string;
  projectId: string;
  appId: string;
  firestoreOk: boolean;
  storageOk: boolean;
  authOk: boolean;
  lastSync: string;
  latencyResult?: LatencyResult | null;
  currentUserEmail?: string | null;
}

export default function FirebaseStatusCard({
  connected,
  projectName,
  projectId,
  appId,
  firestoreOk,
  storageOk,
  authOk,
  lastSync,
  latencyResult,
  currentUserEmail,
}: FirebaseStatusCardProps) {
  const { theme } = useTheme();
  const { colors, shadows } = theme;

  const statusBadge = connected ? (
    <View style={[styles.badge, { backgroundColor: `${colors.accent.success}1C` }]}>
      <View style={[styles.dot, { backgroundColor: colors.accent.success }]} />
      <Text style={[styles.badgeText, { color: colors.accent.success }]}>Online</Text>
    </View>
  ) : (
    <View style={[styles.badge, { backgroundColor: `${colors.accent.danger}1C` }]}>
      <View style={[styles.dot, { backgroundColor: colors.accent.danger }]} />
      <Text style={[styles.badgeText, { color: colors.accent.danger }]}>Offline</Text>
    </View>
  );

  const getLatencyColor = (status?: string) => {
    switch (status) {
      case "Optimal":
        return colors.accent.success;
      case "Fair":
        return colors.accent.warning;
      case "Slow":
      case "Offline":
        return colors.accent.danger;
      default:
        return colors.text.muted;
    }
  };

  return (
    <View style={[styles.card, shadows.card, { backgroundColor: colors.bg.card, borderColor: colors.border.subtle }]}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <MaterialIcons name="cloud" size={24} color={connected ? colors.accent.success : colors.accent.danger} />
          <Text style={[styles.title, { color: colors.text.primary }]}>Connection & Health</Text>
        </View>
        {statusBadge}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />

      <View style={styles.infoGrid}>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Project Name:</Text>
          <Text style={[styles.infoValue, { color: colors.text.primary }]} numberOfLines={1} ellipsizeMode="tail">
            {projectName}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Project ID:</Text>
          <Text style={[styles.infoValue, { color: colors.text.primary }]} numberOfLines={1} ellipsizeMode="tail">
            {projectId}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Logged-in User:</Text>
          <Text style={[styles.infoValue, { color: colors.accent.primary, fontWeight: "700" }]} numberOfLines={1} ellipsizeMode="tail">
            {currentUserEmail || "Business Account"}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Ping Latency:</Text>
          <View style={styles.latencyWrap}>
            {latencyResult && latencyResult.latencyMs >= 0 ? (
              <Text style={[styles.infoValue, { color: getLatencyColor(latencyResult.status), fontWeight: "800" }]}>
                {latencyResult.latencyMs} ms ({latencyResult.status})
              </Text>
            ) : (
              <Text style={[styles.infoValue, { color: colors.text.muted }]}>Testing...</Text>
            )}
          </View>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Last Sync:</Text>
          <Text style={[styles.infoValue, { color: colors.text.primary }]}>{lastSync}</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />

      <Text style={[styles.sectionTitle, { color: colors.text.muted }]}>Service Gateways</Text>
      <View style={styles.servicesRow}>
        <View style={styles.serviceItem}>
          <MaterialIcons
            name={firestoreOk ? "check-circle" : "cancel"}
            size={18}
            color={firestoreOk ? colors.accent.success : colors.accent.danger}
          />
          <Text style={[styles.serviceLabel, { color: colors.text.secondary }]}>Firestore</Text>
        </View>
        <View style={styles.serviceItem}>
          <MaterialIcons
            name={storageOk ? "check-circle" : "cancel"}
            size={18}
            color={storageOk ? colors.accent.success : colors.accent.danger}
          />
          <Text style={[styles.serviceLabel, { color: colors.text.secondary }]}>Storage</Text>
        </View>
        <View style={styles.serviceItem}>
          <MaterialIcons
            name={authOk ? "check-circle" : "cancel"}
            size={18}
            color={authOk ? colors.accent.success : colors.accent.danger}
          />
          <Text style={[styles.serviceLabel, { color: colors.text.secondary }]}>Auth</Text>
        </View>
      </View>
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
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  infoGrid: {
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "500",
    maxWidth: "65%",
    textAlign: "right",
  },
  latencyWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  servicesRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: 4,
  },
  serviceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  serviceLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
});
