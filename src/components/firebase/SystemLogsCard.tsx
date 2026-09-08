import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../../app/context/ThemeContext";
import { SystemLog } from "../../services/firebase/firebaseConnectionService";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

interface SystemLogsCardProps {
  logs: SystemLog[];
  onClearLogs: () => void;
}

type LevelFilter = "All" | "info" | "success" | "error";

export default function SystemLogsCard({ logs, onClearLogs }: SystemLogsCardProps) {
  const { theme } = useTheme();
  const { colors, shadows } = theme;

  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("All");

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesLevel = levelFilter === "All" || (log.level || "info") === levelFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery = !q || log.event.toLowerCase().includes(q);
      return matchesLevel && matchesQuery;
    });
  }, [logs, levelFilter, searchQuery]);

  const handleExportLogs = async () => {
    if (logs.length === 0) {
      Alert.alert("Export Info", "No system logs available to export.");
      return;
    }
    try {
      const jsonStr = JSON.stringify(logs, null, 2);
      const filename = `system_logs_${Date.now()}.json`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, jsonStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: "Export System Logs",
          UTI: "public.json",
        });
      } else {
        Alert.alert("Logs Exported", `Logs saved locally to ${filename}`);
      }
    } catch (err: any) {
      Alert.alert("Export Error", err.message || "Failed to export logs.");
    }
  };

  const getLevelColor = (lvl?: string) => {
    switch (lvl) {
      case "success":
        return colors.accent.success;
      case "error":
        return colors.accent.danger;
      default:
        return colors.accent.info;
    }
  };

  const formatLogTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <View style={[styles.card, shadows.card, { backgroundColor: colors.bg.card, borderColor: colors.border.subtle }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialIcons name="receipt-long" size={24} color={colors.accent.primary} />
          <Text style={[styles.title, { color: colors.text.primary }]}>Diagnostic Logs</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={handleExportLogs} style={styles.iconActionBtn}>
            <MaterialIcons name="file-download" size={18} color={colors.accent.primary} />
          </Pressable>
          {logs.length > 0 && (
            <Pressable onPress={onClearLogs} style={styles.iconActionBtn}>
              <MaterialIcons name="delete-outline" size={18} color={colors.accent.danger} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />

      {/* Search Input */}
      <View style={[styles.searchBox, { backgroundColor: colors.bg.primary, borderColor: colors.border.subtle }]}>
        <MaterialIcons name="search" size={18} color={colors.text.muted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search logs..."
          placeholderTextColor={colors.text.muted}
          style={[styles.searchInput, { color: colors.text.primary }]}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <MaterialIcons name="cancel" size={16} color={colors.text.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabsRow}>
        {(["All", "info", "success", "error"] as LevelFilter[]).map((tab) => {
          const isSelected = levelFilter === tab;
          return (
            <Pressable
              key={tab}
              style={[
                styles.filterTab,
                { backgroundColor: colors.bg.primary, borderColor: colors.border.subtle },
                isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
              ]}
              onPress={() => setLevelFilter(tab)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  { color: colors.text.secondary },
                  isSelected && { color: "#fff", fontWeight: "700" },
                ]}
              >
                {tab.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Log List */}
      <ScrollView style={styles.logList} showsVerticalScrollIndicator={false}>
        {filteredLogs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.text.muted }]}>No diagnostic logs match your filter.</Text>
          </View>
        ) : (
          filteredLogs.map((log) => {
            const levelColor = getLevelColor(log.level);
            return (
              <View key={log.id} style={[styles.logItem, { borderBottomColor: colors.border.subtle }]}>
                <View style={[styles.levelIndicator, { backgroundColor: levelColor }]} />
                <View style={styles.logContent}>
                  <Text style={[styles.logEvent, { color: colors.text.primary }]}>{log.event}</Text>
                  <Text style={[styles.logTime, { color: colors.text.muted }]}>{formatLogTime(log.timestamp)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
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
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconActionBtn: {
    padding: 6,
    borderRadius: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 10,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
  },
  filterTabsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  filterTab: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 10,
    fontWeight: "600",
  },
  logList: {
    maxHeight: 220,
  },
  logItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 10,
  },
  levelIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  logContent: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logEvent: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  logTime: {
    fontSize: 10,
    fontWeight: "500",
  },
  emptyContainer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
  },
});
