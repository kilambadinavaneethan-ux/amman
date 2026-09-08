import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../../app/context/ThemeContext";
import { updateLastSyncTime, refreshUserAuthToken } from "../../services/firebase/firebaseConnectionService";

interface SyncStatusCardProps {
  lastSync: string;
  onSyncCompleted: (newTime: string) => void;
}

export default function SyncStatusCard({ lastSync, onSyncCompleted }: SyncStatusCardProps) {
  const { theme } = useTheme();
  const { colors, shadows } = theme;

  const [syncing, setSyncing] = useState(false);
  const [refreshingToken, setRefreshingToken] = useState(false);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const newTime = await updateLastSyncTime();
      onSyncCompleted(newTime);
    } catch (e: any) {
      Alert.alert("Sync Error", e.message || "Failed to trigger manual sync.");
    } finally {
      setSyncing(false);
    }
  };

  const handleTokenRefresh = async () => {
    setRefreshingToken(true);
    try {
      const res = await refreshUserAuthToken();
      if (res.success) {
        Alert.alert("Auth Token Refreshed", "Your security auth token has been renewed successfully.");
      } else {
        Alert.alert("Token Refresh Notice", res.message);
      }
    } catch (err: any) {
      Alert.alert("Token Error", err.message || "Could not refresh auth token.");
    } finally {
      setRefreshingToken(false);
    }
  };

  return (
    <View style={[styles.card, shadows.card, { backgroundColor: colors.bg.card, borderColor: colors.border.subtle }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialIcons name="sync" size={24} color={colors.accent.primary} />
          <Text style={[styles.title, { color: colors.text.primary }]}>Sync & Credentials</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />

      <View style={styles.infoRow}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Last Sync Timestamp:</Text>
        <Text style={[styles.value, { color: colors.text.primary }]}>{lastSync}</Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Offline Cache Mode:</Text>
        <View style={[styles.badge, { backgroundColor: `${colors.accent.success}15` }]}>
          <MaterialIcons name="offline-pin" size={14} color={colors.accent.success} />
          <Text style={[styles.badgeText, { color: colors.accent.success }]}>Active Persistent Cache</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />

      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.btn, { backgroundColor: colors.accent.primary }]}
          onPress={handleManualSync}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="refresh" size={16} color="#fff" />
              <Text style={styles.btnText}>Trigger Sync</Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={[styles.btn, { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.medium }]}
          onPress={handleTokenRefresh}
          disabled={refreshingToken}
        >
          {refreshingToken ? (
            <ActivityIndicator size="small" color={colors.accent.primary} />
          ) : (
            <>
              <MaterialIcons name="key" size={16} color={colors.accent.primary} />
              <Text style={[styles.btnText, { color: colors.accent.primary }]}>Refresh Token</Text>
            </>
          )}
        </Pressable>
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
  divider: {
    height: 1,
    marginVertical: 14,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  value: {
    fontSize: 13,
    fontWeight: "500",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});
