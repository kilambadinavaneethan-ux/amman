import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Directory, File, Paths } from "expo-file-system";

import { useTheme } from "../../../app/context/ThemeContext";
import { auth } from "../../config/firebase";

// Import Custom components
import FirebaseStatusCard from "../../components/firebase/FirebaseStatusCard";
import DatabaseOverview from "../../components/firebase/DatabaseOverview";
import HealthCheckCard from "../../components/firebase/HealthCheckCard";
import StorageOverview from "../../components/firebase/StorageOverview";
import SyncStatusCard from "../../components/firebase/SyncStatusCard";
import SystemLogsCard from "../../components/firebase/SystemLogsCard";

// Import Services
import {
  getFirebaseConfigInfo,
  maskValue,
  getSystemLogs,
  clearSystemLogs,
  getLastSyncTime,
  checkConnectionStatus,
  pingFirestoreLatency,
  SystemLog,
  LatencyResult,
} from "../../services/firebase/firebaseConnectionService";
import { fetchDatabaseStats, DatabaseStats } from "../../services/firebase/firebaseStatsService";

export default function FirebaseManagementScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors, shadows } = theme;

  // Connection & Config states
  const [connected, setConnected] = useState(true);
  const [firestoreOk, setFirestoreOk] = useState(true);
  const [storageOk, setStorageOk] = useState(true);
  const [authOk, setAuthOk] = useState(true);
  const [lastSync, setLastSync] = useState("Loading...");
  const [latencyResult, setLatencyResult] = useState<LatencyResult | null>(null);
  const configInfo = getFirebaseConfigInfo();

  // Diagnostics & Logs states
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Backup state
  const [lastBackupDate, setLastBackupDate] = useState("No backups created yet");
  const [lastBackupType, setLastBackupType] = useState("-");
  const [lastBackupStatus, setLastBackupStatus] = useState("-");

  const currentUserEmail = auth.currentUser?.email || null;

  const loadBackupDetails = useCallback(() => {
    try {
      const dir = new Directory(Paths.document, "HollowBlockBusiness/Backups");
      if (dir.exists) {
        const entries = dir.list();
        const backupFiles: any[] = [];
        for (const entry of entries) {
          if (entry instanceof File && (entry.name.endsWith(".json") || entry.name.endsWith(".csv"))) {
            backupFiles.push({
              name: entry.name,
              modificationTime: entry.modificationTime || Date.now(),
            });
          }
        }
        if (backupFiles.length > 0) {
          backupFiles.sort((a, b) => b.modificationTime - a.modificationTime);
          const latest = backupFiles[0];
          const date = new Date(latest.modificationTime);
          setLastBackupDate(
            date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          );
          setLastBackupType(latest.name.endsWith(".json") ? "JSON (Backup)" : "CSV (Backup)");
          setLastBackupStatus("Completed ✔");
        } else {
          setLastBackupDate("No backups created yet");
          setLastBackupType("-");
          setLastBackupStatus("-");
        }
      }
    } catch (e) {
      console.warn("Failed scanning backup directory:", e);
    }
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoadingStats(true);
    }

    try {
      // 1. Connection & Ping check
      const connection = await checkConnectionStatus();
      setConnected(connection.connected);
      setFirestoreOk(connection.firestore);
      setStorageOk(connection.storage);
      setAuthOk(connection.auth);

      const ping = await pingFirestoreLatency();
      setLatencyResult(ping);

      // 2. Fetch stats
      const stats = await fetchDatabaseStats();
      setDbStats(stats);

      // 3. Load logs & Sync timestamp
      const logs = await getSystemLogs();
      setSystemLogs(logs);

      const syncTime = await getLastSyncTime();
      setLastSync(syncTime);

      // 4. Load backup filesystem details
      loadBackupDetails();
    } catch (err) {
      console.warn("Failed to load Firebase diagnostic stats:", err);
    } finally {
      setLoadingStats(false);
      setRefreshing(false);
    }
  }, [loadBackupDetails]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const handleClearLogs = async () => {
    Alert.alert("Clear System Logs", "Are you sure you want to clear the logs list?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await clearSystemLogs();
          setSystemLogs([]);
        },
      },
    ]);
  };

  const handleHealthCheckCompleted = () => {
    loadData(true);
  };

  const handleSyncTimeUpdated = (newSyncTime: string) => {
    setLastSync(newSyncTime);
    loadData(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.primary }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bg.card, borderBottomColor: colors.border.subtle }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Firebase Management</Text>
        <Pressable onPress={() => loadData(false)} style={styles.backButton}>
          <MaterialIcons name="refresh" size={22} color={colors.accent.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent.primary]} />
        }
      >
        {/* Connection Status Card */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <FirebaseStatusCard
            connected={connected}
            projectName={configInfo.projectName}
            projectId={configInfo.projectId}
            appId={configInfo.appId}
            firestoreOk={firestoreOk}
            storageOk={storageOk}
            authOk={authOk}
            lastSync={lastSync}
            latencyResult={latencyResult}
            currentUserEmail={currentUserEmail}
          />
        </Animated.View>

        {/* Health Check Card */}
        <Animated.View entering={FadeInDown.delay(150).duration(400)}>
          <HealthCheckCard onCheckCompleted={handleHealthCheckCompleted} />
        </Animated.View>

        {/* Database Overview Card */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <DatabaseOverview stats={dbStats} loading={loadingStats} />
        </Animated.View>

        {/* Storage Overview Card */}
        <Animated.View entering={FadeInDown.delay(250).duration(400)}>
          <StorageOverview storageBucket={configInfo.storageBucket} storageOk={storageOk} />
        </Animated.View>

        {/* Sync Status Card */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <SyncStatusCard lastSync={lastSync} onSyncCompleted={handleSyncTimeUpdated} />
        </Animated.View>

        {/* Backup Status Card */}
        <Animated.View entering={FadeInDown.delay(350).duration(400)}>
          <View style={[styles.card, shadows.card, { backgroundColor: colors.bg.card, borderColor: colors.border.subtle }]}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="cloud-download" size={24} color={colors.accent.primary} />
              <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Backup Status</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />
            <View style={styles.backupGrid}>
              <View style={styles.backupRow}>
                <Text style={[styles.backupLabel, { color: colors.text.secondary }]}>Last Backup Date:</Text>
                <Text style={[styles.backupValue, { color: colors.text.primary }]}>{lastBackupDate}</Text>
              </View>
              <View style={styles.backupRow}>
                <Text style={[styles.backupLabel, { color: colors.text.secondary }]}>Backup Type:</Text>
                <Text style={[styles.backupValue, { color: colors.text.primary }]}>{lastBackupType}</Text>
              </View>
              <View style={styles.backupRow}>
                <Text style={[styles.backupLabel, { color: colors.text.secondary }]}>Backup Status:</Text>
                <Text style={[styles.backupValue, { color: colors.text.primary }]}>{lastBackupStatus}</Text>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />
            <View style={styles.backupActions}>
              <Pressable
                style={[styles.backupBtn, { backgroundColor: colors.accent.primary }]}
                onPress={() => router.push("/settings/data-management")}
              >
                <MaterialIcons name="storage" size={16} color="#FFFFFF" />
                <Text style={styles.backupBtnText}>Data Management</Text>
              </Pressable>
              <Pressable
                style={[styles.backupBtn, styles.backupBtnSecondary, { borderColor: colors.accent.primary }]}
                onPress={() => router.push("/settings/backup-restore")}
              >
                <MaterialIcons name="restore" size={16} color={colors.accent.primary} />
                <Text style={[styles.backupBtnText, { color: colors.accent.primary }]}>Backup Suite</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* Project Information Card */}
        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
          <View style={[styles.card, shadows.card, { backgroundColor: colors.bg.card, borderColor: colors.border.subtle }]}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="info" size={24} color={colors.accent.primary} />
              <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Project Information</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />
            <View style={styles.infoList}>
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Project Name</Text>
                <Text style={[styles.infoValueText, { color: colors.text.primary }]}>{configInfo.projectName}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Project ID</Text>
                <Text style={[styles.infoValueText, { color: colors.text.primary }]}>{configInfo.projectId}</Text>
              </View>
              {configInfo.databaseURL && (
                <View style={styles.infoItem}>
                  <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Database URL</Text>
                  <Text style={[styles.infoValueText, { color: colors.text.primary }]} numberOfLines={1} ellipsizeMode="middle">
                    {configInfo.databaseURL}
                  </Text>
                </View>
              )}
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Auth Provider</Text>
                <Text style={[styles.infoValueText, { color: colors.text.primary }]}>{configInfo.authProvider}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Region</Text>
                <Text style={[styles.infoValueText, { color: colors.text.primary }]}>{configInfo.region}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>SDK Version</Text>
                <Text style={[styles.infoValueText, { color: colors.text.primary }]}>{configInfo.sdkVersion}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Security Settings Card */}
        <Animated.View entering={FadeInDown.delay(450).duration(400)}>
          <View style={[styles.card, shadows.card, { backgroundColor: colors.bg.card, borderColor: colors.border.subtle }]}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="security" size={24} color={colors.accent.primary} />
              <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Security & Credentials</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />
            <View style={styles.infoList}>
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Firestore Connection</Text>
                <View style={[styles.secValueBadge, { backgroundColor: `${colors.accent.success}1C` }]}>
                  <MaterialIcons name="check-circle" size={14} color={colors.accent.success} />
                  <Text style={[styles.secValueBadgeText, { color: colors.accent.success }]}>Enabled</Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Auth Provider</Text>
                <View style={[styles.secValueBadge, { backgroundColor: `${colors.accent.success}1C` }]}>
                  <MaterialIcons name="check-circle" size={14} color={colors.accent.success} />
                  <Text style={[styles.secValueBadgeText, { color: colors.accent.success }]}>Enabled</Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Web API Key</Text>
                <Text style={[styles.keySecretText, { color: colors.text.secondary }]}>{maskValue(configInfo.apiKey)}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* System Logs Card */}
        <Animated.View entering={FadeInDown.delay(500).duration(400)}>
          <SystemLogsCard logs={systemLogs} onClearLogs={handleClearLogs} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  backupGrid: {
    gap: 8,
  },
  backupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backupLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  backupValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  backupActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  backupBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  backupBtnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
  },
  backupBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  infoList: {
    gap: 10,
  },
  infoItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  infoValueText: {
    fontSize: 13,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  secValueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  secValueBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  keySecretText: {
    fontSize: 13,
    fontFamily: "monospace",
    fontWeight: "700",
  },
});
