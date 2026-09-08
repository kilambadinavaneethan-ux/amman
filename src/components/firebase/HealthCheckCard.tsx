import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../../app/context/ThemeContext";
import { runFirebaseHealthCheck, HealthStatus } from "../../services/firebase/firebaseHealthService";
import { generateDiagnosticReport } from "../../services/firebase/firebaseConnectionService";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

interface HealthCheckCardProps {
  onCheckCompleted?: () => void;
}

export default function HealthCheckCard({ onCheckCompleted }: HealthCheckCardProps) {
  const { theme } = useTheme();
  const { colors, shadows } = theme;

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [healthResult, setHealthResult] = useState<HealthStatus | null>(null);

  const handleRunDiagnostics = async () => {
    setLoading(true);
    try {
      const res = await runFirebaseHealthCheck();
      setHealthResult(res);
      if (onCheckCompleted) {
        onCheckCompleted();
      }
    } catch (e: any) {
      Alert.alert("Diagnostics Error", e.message || "Failed to execute health check.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = async () => {
    setExporting(true);
    try {
      const report = await generateDiagnosticReport();
      if (healthResult) {
        report.healthCheckSuite = healthResult;
      }

      const jsonStr = JSON.stringify(report, null, 2);
      const filename = `firebase_diagnostic_report_${Date.now()}.json`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, jsonStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: "Export Diagnostic Report",
          UTI: "public.json",
        });
      } else {
        Alert.alert("Report Exported", `Saved diagnostic report to ${filename}`);
      }
    } catch (err: any) {
      Alert.alert("Export Error", err.message || "Failed to export diagnostic report.");
    } finally {
      setExporting(false);
    }
  };

  const testsList = [
    { key: "internet", title: "Internet Connectivity", desc: "Verifies external network accessibility" },
    { key: "initialization", title: "Firebase App SDK", desc: "Checks Firestore & Auth client instances" },
    { key: "auth", title: "Authentication Gateway", desc: "Inspects active currentUser session" },
    { key: "firestoreRead", title: "Firestore Read Access", desc: "Executes test read on database registry" },
    { key: "firestoreWrite", title: "Firestore Write Access", desc: "Executes test write/delete on sandbox table" },
  ];

  return (
    <View style={[styles.card, shadows.card, { backgroundColor: colors.bg.card, borderColor: colors.border.subtle }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialIcons name="health-and-safety" size={24} color={colors.accent.primary} />
          <Text style={[styles.title, { color: colors.text.primary }]}>System Health Check</Text>
        </View>
        <Pressable
          style={[styles.runBtn, { backgroundColor: colors.accent.primary }]}
          onPress={handleRunDiagnostics}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="play-arrow" size={18} color="#fff" />
              <Text style={styles.runBtnText}>Run Suite</Text>
            </>
          )}
        </Pressable>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />

      {healthResult ? (
        <View style={styles.resultsContainer}>
          {testsList.map((item) => {
            const stepResult = (healthResult as any)[item.key];
            const passed = stepResult?.passed;
            const reason = stepResult?.reason;

            return (
              <View key={item.key} style={styles.testItem}>
                <View style={styles.testLeft}>
                  <MaterialIcons
                    name={passed ? "check-circle" : "cancel"}
                    size={20}
                    color={passed ? colors.accent.success : colors.accent.danger}
                  />
                  <View>
                    <Text style={[styles.testTitle, { color: colors.text.primary }]}>{item.title}</Text>
                    <Text style={[styles.testDesc, { color: colors.text.muted }]}>
                      {reason ? `Error: ${reason}` : item.desc}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: passed ? `${colors.accent.success}15` : `${colors.accent.danger}15` },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: passed ? colors.accent.success : colors.accent.danger },
                    ]}
                  >
                    {passed ? "PASS" : "FAIL"}
                  </Text>
                </View>
              </View>
            );
          })}

          <View style={styles.exportRow}>
            <Pressable
              style={[styles.exportBtn, { borderColor: colors.border.medium, backgroundColor: colors.bg.primary }]}
              onPress={handleExportReport}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={colors.accent.primary} />
              ) : (
                <>
                  <MaterialIcons name="cloud-download" size={16} color={colors.accent.primary} />
                  <Text style={[styles.exportBtnText, { color: colors.accent.primary }]}>Export Health Report</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text.muted }]}>
            Tap &quot;Run Suite&quot; to execute live diagnostics across network, authentication, and database permissions.
          </Text>
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
    justifyContent: "space-between",
    alignItems: "center",
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
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  runBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  resultsContainer: {
    gap: 12,
  },
  testItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  testLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  testTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  testDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  emptyContainer: {
    paddingVertical: 8,
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 18,
  },
  exportRow: {
    marginTop: 6,
    alignItems: "flex-end",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  exportBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
