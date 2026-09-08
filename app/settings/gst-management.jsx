import React, { useState, useMemo, useContext, useEffect, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";
import { AlarmContext } from "../context/AlarmContext";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import ProtectedRoute from "../components/ProtectedRoute";
import BackButton from "../components/BackButton";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../../src/config/firebase";

// ─── GST Filing Types with standard due dates ───
const GST_FILING_TYPES = [
  {
    id: "gstr1",
    name: "GSTR-1",
    description: "Outward supplies return",
    defaultDay: 11,
    frequency: "Monthly",
    icon: "upload-file",
    color: "#3B82F6",
    bgColor: "#3B82F615",
  },
  {
    id: "gstr3b",
    name: "GSTR-3B",
    description: "Summary return with tax payment",
    defaultDay: 20,
    frequency: "Monthly",
    icon: "assessment",
    color: "#10B981",
    bgColor: "#10B98115",
  },
  {
    id: "gstr4",
    name: "GSTR-4",
    description: "Composition scheme return",
    defaultDay: 18,
    frequency: "Quarterly",
    icon: "article",
    color: "#8B5CF6",
    bgColor: "#8B5CF615",
  },
  {
    id: "gstr9",
    name: "GSTR-9",
    description: "Annual return",
    defaultDay: 31,
    frequency: "Annual (Dec 31)",
    icon: "calendar-today",
    color: "#EA580C",
    bgColor: "#EA580C15",
  },
  {
    id: "gstr9c",
    name: "GSTR-9C",
    description: "Reconciliation statement",
    defaultDay: 31,
    frequency: "Annual (Dec 31)",
    icon: "fact-check",
    color: "#D97706",
    bgColor: "#D9770615",
  },
  {
    id: "cmp08",
    name: "CMP-08",
    description: "Composition scheme challan",
    defaultDay: 18,
    frequency: "Quarterly",
    icon: "receipt",
    color: "#06B6D4",
    bgColor: "#06B6D415",
  },
];

const REMINDER_DAYS_OPTIONS = [1, 2, 3, 5, 7, 10, 15];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function GSTManagementScreen() {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { addAlarm, alarms, deleteAlarm, updateAlarm } = useContext(AlarmContext);

  // ─── State ───
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gstSettings, setGstSettings] = useState({
    gstin: "",
    gstEnabled: true,
    filings: {},
    reminderDaysBefore: 3,
    customReminders: [],
  });
  const [gstCompleted, setGstCompleted] = useState({});
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingFiling, setEditingFiling] = useState(null);
  const [editDueDay, setEditDueDay] = useState("");
  const [addReminderModal, setAddReminderModal] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState("");
  const [newReminderDay, setNewReminderDay] = useState("");
  const [newReminderMonth, setNewReminderMonth] = useState(new Date().getMonth());
  const [newReminderNotes, setNewReminderNotes] = useState("");
  const [activeTab, setActiveTab] = useState("upcoming"); // "upcoming" | "filings" | "history"
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyDetailItem, setHistoryDetailItem] = useState(null);

  // ─── Firebase Persistence ───
  const docRef = useMemo(() => doc(db, "app_settings", "gst_management"), []);
  const completedDocRef = useMemo(() => doc(db, "app_settings", "gst_completed"), []);

  useEffect(() => {
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGstSettings((prev) => ({
          ...prev,
          ...data,
          filings: data.filings || {},
          customReminders: data.customReminders || [],
        }));
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, [docRef]);

  // Listen for completed filings
  useEffect(() => {
    const unsubscribe = onSnapshot(completedDocRef, (snap) => {
      if (snap.exists()) {
        setGstCompleted(snap.data() || {});
      }
    }, () => {});
    return () => unsubscribe();
  }, [completedDocRef]);

  const saveSettings = useCallback(async (updates) => {
    const merged = { ...gstSettings, ...updates, updatedAt: new Date() };
    setGstSettings(merged);
    try {
      await setDoc(docRef, merged, { merge: true });
    } catch (e) {
      Alert.alert("Error", "Failed to save GST settings: " + e.message);
    }
  }, [gstSettings, docRef]);

  // ─── Derived Data ───
  const getFilingConfig = useCallback((filingId) => {
    const base = GST_FILING_TYPES.find((f) => f.id === filingId);
    const custom = gstSettings.filings[filingId] || {};
    return {
      ...base,
      dueDay: custom.dueDay || base.defaultDay,
      enabled: custom.enabled !== undefined ? custom.enabled : true,
      alertEnabled: custom.alertEnabled !== undefined ? custom.alertEnabled : true,
    };
  }, [gstSettings.filings]);

  // Calculate upcoming due dates
  const upcomingDueDates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates = [];

    GST_FILING_TYPES.forEach((filing) => {
      const config = getFilingConfig(filing.id);
      if (!config.enabled) return;

      if (filing.frequency === "Monthly") {
        for (let i = 0; i < 3; i++) {
          const dueDate = new Date(today.getFullYear(), today.getMonth() + i, config.dueDay);
          if (dueDate >= today) {
            const key = `${filing.id}_${dueDate.getFullYear()}_${dueDate.getMonth()}_${dueDate.getDate()}`;
            dates.push({
              ...config,
              date: dueDate,
              dateStr: formatDate(dueDate),
              daysLeft: Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)),
              key,
              isCompleted: !!gstCompleted[key],
            });
            break;
          }
        }
      } else if (filing.frequency === "Quarterly") {
        const quarterEnds = [2, 5, 8, 11];
        for (const qMonth of quarterEnds) {
          const dueDate = new Date(today.getFullYear(), qMonth + 1, config.dueDay);
          if (dueDate >= today) {
            const key = `${filing.id}_${dueDate.getFullYear()}_${dueDate.getMonth()}_${dueDate.getDate()}`;
            dates.push({
              ...config,
              date: dueDate,
              dateStr: formatDate(dueDate),
              daysLeft: Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)),
              key,
              isCompleted: !!gstCompleted[key],
            });
            break;
          }
        }
      } else {
        let dueDate = new Date(today.getFullYear(), 11, 31);
        if (dueDate < today) dueDate = new Date(today.getFullYear() + 1, 11, 31);
        const key = `${filing.id}_${dueDate.getFullYear()}_${dueDate.getMonth()}_${dueDate.getDate()}`;
        dates.push({
          ...config,
          date: dueDate,
          dateStr: formatDate(dueDate),
          daysLeft: Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)),
          key,
          isCompleted: !!gstCompleted[key],
        });
      }
    });

    // Add custom reminders
    (gstSettings.customReminders || []).forEach((rem) => {
      const year = today.getFullYear();
      let dueDate = new Date(year, rem.month, rem.day);
      if (dueDate < today) dueDate = new Date(year + 1, rem.month, rem.day);
      const key = `custom_${rem.id}`;
      dates.push({
        id: rem.id,
        name: rem.title,
        description: rem.notes || "Custom GST Reminder",
        icon: "event",
        color: "#EC4899",
        bgColor: "#EC489915",
        date: dueDate,
        dateStr: formatDate(dueDate),
        daysLeft: Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)),
        isCustom: true,
        key,
        isCompleted: !!gstCompleted[key],
      });
    });

    dates.sort((a, b) => a.date - b.date);
    return dates;
  }, [gstSettings, getFilingConfig, gstCompleted]);

  // Compliance stats
  const complianceStats = useMemo(() => {
    const pending = upcomingDueDates.filter((d) => !d.isCompleted);
    const completed = upcomingDueDates.filter((d) => d.isCompleted);
    const overdue = pending.filter((d) => d.daysLeft <= 0);
    const urgent = pending.filter((d) => d.daysLeft > 0 && d.daysLeft <= 5);
    const totalCompleted = Object.keys(gstCompleted).length;
    return { pending: pending.length, completed: completed.length, overdue: overdue.length, urgent: urgent.length, totalCompleted };
  }, [upcomingDueDates, gstCompleted]);

  // Filing history from completed records
  const filingHistory = useMemo(() => {
    const entries = Object.entries(gstCompleted)
      .map(([key, data]) => ({
        key,
        name: data.name || key.split("_")[0]?.toUpperCase(),
        completedAt: data.completedAt?.toDate ? data.completedAt.toDate() : (data.completedAt ? new Date(data.completedAt) : new Date()),
        monthKey: data.monthKey || "",
      }))
      .sort((a, b) => b.completedAt - a.completedAt);
    return entries;
  }, [gstCompleted]);

  // ─── Handlers ───
  const toggleFilingEnabled = async (filingId) => {
    const current = getFilingConfig(filingId);
    const updatedFilings = {
      ...gstSettings.filings,
      [filingId]: {
        ...gstSettings.filings[filingId],
        enabled: !current.enabled,
      },
    };
    await saveSettings({ filings: updatedFilings });
  };

  const toggleFilingAlert = async (filingId) => {
    const current = getFilingConfig(filingId);
    const updatedFilings = {
      ...gstSettings.filings,
      [filingId]: {
        ...gstSettings.filings[filingId],
        alertEnabled: !current.alertEnabled,
      },
    };
    await saveSettings({ filings: updatedFilings });
  };

  const openEditDueDay = (filing) => {
    const config = getFilingConfig(filing.id);
    setEditingFiling(filing);
    setEditDueDay(String(config.dueDay));
    setEditModalVisible(true);
  };

  const saveEditDueDay = async () => {
    const day = parseInt(editDueDay, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      Alert.alert("Invalid Day", "Please enter a valid day between 1 and 31.");
      return;
    }
    const updatedFilings = {
      ...gstSettings.filings,
      [editingFiling.id]: {
        ...gstSettings.filings[editingFiling.id],
        dueDay: day,
      },
    };
    await saveSettings({ filings: updatedFilings });
    setEditModalVisible(false);
  };

  const handleMarkComplete = async (item) => {
    try {
      await setDoc(completedDocRef, {
        [item.key]: { completedAt: new Date(), name: item.name, monthKey: `${new Date().getFullYear()}_${new Date().getMonth()}` },
      }, { merge: true });
    } catch (e) {
      Alert.alert("Error", "Failed to mark as complete: " + e.message);
    }
  };

  const handleUndoComplete = async (key) => {
    try {
      // We can't delete a field with setDoc merge, so we'll set it to null
      // Actually the better approach: read current, remove key, write back
      const newCompleted = { ...gstCompleted };
      delete newCompleted[key];
      await setDoc(completedDocRef, newCompleted);
    } catch (e) {
      Alert.alert("Error", "Failed to undo: " + e.message);
    }
  };

  const handleAddCustomReminder = async () => {
    if (!newReminderTitle.trim()) {
      Alert.alert("Required", "Please enter a reminder title.");
      return;
    }
    const day = parseInt(newReminderDay, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      Alert.alert("Invalid Day", "Please enter a valid day between 1 and 31.");
      return;
    }
    const newReminder = {
      id: `gst_custom_${Date.now()}`,
      title: newReminderTitle.trim(),
      day,
      month: newReminderMonth,
      notes: newReminderNotes.trim(),
    };
    const updatedReminders = [...(gstSettings.customReminders || []), newReminder];
    await saveSettings({ customReminders: updatedReminders });

    // Also create an alarm for notification
    try {
      const year = new Date().getFullYear();
      let dueDate = new Date(year, newReminderMonth, day);
      if (dueDate < new Date()) dueDate = new Date(year + 1, newReminderMonth, day);
      const mm = String(dueDate.getMonth() + 1).padStart(2, "0");
      const dd = String(dueDate.getDate()).padStart(2, "0");
      await addAlarm({
        title: `GST: ${newReminderTitle.trim()}`,
        notes: newReminderNotes.trim() || `GST custom reminder - ${MONTHS[newReminderMonth]} ${day}`,
        category: "finance",
        type: "once",
        date: `${dueDate.getFullYear()}-${mm}-${dd}`,
        time: "09:00",
        isActive: true,
      });
    } catch (e) {
      // Alarm creation is best-effort
    }

    setAddReminderModal(false);
    setNewReminderTitle("");
    setNewReminderDay("");
    setNewReminderNotes("");
  };

  const handleDeleteCustomReminder = (reminderId) => {
    Alert.alert("Delete Reminder", "Are you sure you want to remove this custom reminder?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const updatedReminders = (gstSettings.customReminders || []).filter(
            (r) => r.id !== reminderId
          );
          await saveSettings({ customReminders: updatedReminders });
        },
      },
    ]);
  };

  const syncAllAlarms = async () => {
    setSaving(true);
    try {
      let count = 0;
      for (const filing of GST_FILING_TYPES) {
        const config = getFilingConfig(filing.id);
        if (!config.enabled || !config.alertEnabled) continue;

        const today = new Date();
        const reminderDays = gstSettings.reminderDaysBefore || 3;

        let nextDue;
        if (filing.frequency === "Monthly") {
          nextDue = new Date(today.getFullYear(), today.getMonth(), config.dueDay);
          if (nextDue <= today) {
            nextDue = new Date(today.getFullYear(), today.getMonth() + 1, config.dueDay);
          }
        } else if (filing.frequency === "Quarterly") {
          const quarterEnds = [2, 5, 8, 11];
          for (const qMonth of quarterEnds) {
            nextDue = new Date(today.getFullYear(), qMonth + 1, config.dueDay);
            if (nextDue > today) break;
          }
        } else {
          nextDue = new Date(today.getFullYear(), 11, 31);
          if (nextDue <= today) nextDue = new Date(today.getFullYear() + 1, 11, 31);
        }

        const reminderDate = new Date(nextDue);
        reminderDate.setDate(reminderDate.getDate() - reminderDays);
        if (reminderDate <= today) {
          reminderDate.setTime(today.getTime() + 86400000);
        }

        const mm = String(reminderDate.getMonth() + 1).padStart(2, "0");
        const dd = String(reminderDate.getDate()).padStart(2, "0");

        await addAlarm({
          title: `GST Alert: ${filing.name} due on ${formatDate(nextDue)}`,
          notes: `${filing.description} - File before ${formatDate(nextDue)}`,
          category: "finance",
          type: "once",
          date: `${reminderDate.getFullYear()}-${mm}-${dd}`,
          time: "09:00",
          isActive: true,
        });
        count++;
      }

      Alert.alert(
        "Alarms Synced ✓",
        `${count} GST reminder alarm${count !== 1 ? "s" : ""} created successfully. You'll be notified ${gstSettings.reminderDaysBefore || 3} day(s) before each due date.`
      );
    } catch (e) {
      Alert.alert("Error", "Failed to sync alarms: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Helpers ───
  const getDaysLeftColor = (daysLeft) => {
    if (daysLeft <= 0) return colors.accent.danger;
    if (daysLeft <= 3) return colors.accent.danger;
    if (daysLeft <= 7) return "#EA580C";
    if (daysLeft <= 15) return colors.accent.warning;
    return colors.accent.success;
  };

  const getDaysLeftBg = (daysLeft) => {
    if (daysLeft <= 0) return colors.accent.dangerMuted;
    if (daysLeft <= 3) return colors.accent.dangerMuted;
    if (daysLeft <= 7) return "#EA580C15";
    if (daysLeft <= 15) return `${colors.accent.warning}15`;
    return `${colors.accent.success}15`;
  };

  const getDaysLeftLabel = (daysLeft) => {
    if (daysLeft <= 0) return "Overdue!";
    if (daysLeft === 1) return "Tomorrow";
    return `${daysLeft}d left`;
  };

  const getCompliancePercent = () => {
    const total = upcomingDueDates.length;
    if (total === 0) return 100;
    return Math.round((complianceStats.completed / total) * 100);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading GST settings...</Text>
      </View>
    );
  }

  const pendingItems = upcomingDueDates.filter((d) => !d.isCompleted);
  const completedItems = upcomingDueDates.filter((d) => d.isCompleted);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        <BackButton label="Settings" onPress={() => router.push("/settings")} style={{ marginBottom: 12 }} />
        <View style={styles.headerTitleRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.title}>GST Due Date Alerts</Text>
            <Text style={styles.subtitle}>Manage GST filing deadlines & reminders</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.syncButton, pressed && styles.pressedEffect]}
            onPress={syncAllAlarms}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size={16} color={colors.text.inverse} />
            ) : (
              <MaterialIcons name="notifications-active" size={18} color={colors.text.inverse} />
            )}
            <Text style={styles.syncButtonText}>{saving ? "Syncing..." : "Sync Alarms"}</Text>
          </Pressable>
        </View>
      </View>

      {/* ─── Compliance Dashboard ─── */}
      <Animated.View entering={FadeInDown.delay(50).duration(300).springify().damping(18)}>
        <View style={styles.dashboardCard}>
          <View style={styles.dashboardTop}>
            <View style={styles.dashboardGauge}>
              <View style={[styles.gaugeCircle, { borderColor: getCompliancePercent() >= 80 ? colors.accent.success : getCompliancePercent() >= 50 ? colors.accent.warning : colors.accent.danger }]}>
                <Text style={[styles.gaugePercent, { color: getCompliancePercent() >= 80 ? colors.accent.success : getCompliancePercent() >= 50 ? colors.accent.warning : colors.accent.danger }]}>
                  {getCompliancePercent()}%
                </Text>
                <Text style={styles.gaugeLabel}>Filed</Text>
              </View>
            </View>
            <View style={styles.dashboardStats}>
              <View style={styles.dashStatRow}>
                <View style={[styles.dashStatDot, { backgroundColor: colors.accent.danger }]} />
                <Text style={styles.dashStatLabel}>Pending</Text>
                <Text style={[styles.dashStatValue, { color: colors.accent.danger }]}>{complianceStats.pending}</Text>
              </View>
              <View style={styles.dashStatRow}>
                <View style={[styles.dashStatDot, { backgroundColor: colors.accent.success }]} />
                <Text style={styles.dashStatLabel}>Completed</Text>
                <Text style={[styles.dashStatValue, { color: colors.accent.success }]}>{complianceStats.completed}</Text>
              </View>
              <View style={styles.dashStatRow}>
                <View style={[styles.dashStatDot, { backgroundColor: "#EA580C" }]} />
                <Text style={styles.dashStatLabel}>Urgent (≤5d)</Text>
                <Text style={[styles.dashStatValue, { color: "#EA580C" }]}>{complianceStats.urgent}</Text>
              </View>
              {complianceStats.overdue > 0 && (
                <View style={styles.dashStatRow}>
                  <View style={[styles.dashStatDot, { backgroundColor: "#DC2626" }]} />
                  <Text style={styles.dashStatLabel}>Overdue</Text>
                  <Text style={[styles.dashStatValue, { color: "#DC2626", fontWeight: "800" }]}>{complianceStats.overdue}</Text>
                </View>
              )}
            </View>
          </View>
          {complianceStats.overdue > 0 && (
            <View style={styles.overdueAlert}>
              <MaterialIcons name="error" size={16} color="#DC2626" />
              <Text style={styles.overdueAlertText}>
                {complianceStats.overdue} filing{complianceStats.overdue > 1 ? "s" : ""} overdue! Take immediate action.
              </Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* ─── GSTIN + Config Strip ─── */}
      <Animated.View entering={FadeInDown.delay(100).duration(300).springify().damping(18)}>
        <View style={styles.gstinCard}>
          <View style={styles.gstinRow}>
            <View style={styles.gstinLeftCol}>
              <View style={styles.gstinIconWrap}>
                <MaterialIcons name="verified" size={18} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gstinTitle}>GSTIN</Text>
                <TextInput
                  style={styles.gstinInput}
                  value={gstSettings.gstin}
                  onChangeText={(v) => saveSettings({ gstin: v.toUpperCase() })}
                  placeholder="22AAAAA0000A1Z5"
                  placeholderTextColor={colors.text.muted}
                  maxLength={15}
                  autoCapitalize="characters"
                />
              </View>
            </View>
            <View style={styles.gstinToggle}>
              <Text style={styles.gstinToggleLabel}>{gstSettings.gstEnabled ? "ON" : "OFF"}</Text>
              <Switch
                value={gstSettings.gstEnabled}
                onValueChange={(v) => saveSettings({ gstEnabled: v })}
                trackColor={{ false: colors.border.medium, true: `${colors.accent.success}40` }}
                thumbColor={gstSettings.gstEnabled ? colors.accent.success : colors.text.muted}
              />
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ─── Reminder Days Strip ─── */}
      <Animated.View entering={FadeInDown.delay(120).duration(300).springify().damping(18)}>
        <View style={styles.reminderStrip}>
          <View style={styles.reminderStripLeft}>
            <MaterialIcons name="schedule" size={16} color={colors.accent.primary} />
            <Text style={styles.reminderStripLabel}>Alert before</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.reminderDaysPicker}>
              {REMINDER_DAYS_OPTIONS.map((d) => {
                const isSelected = gstSettings.reminderDaysBefore === d;
                return (
                  <Pressable
                    key={d}
                    style={[styles.reminderDayChip, isSelected && styles.reminderDayChipActive]}
                    onPress={() => saveSettings({ reminderDaysBefore: d })}
                  >
                    <Text style={[styles.reminderDayText, isSelected && styles.reminderDayTextActive]}>
                      {d}d
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Animated.View>

      {/* ─── Tab Navigation ─── */}
      <Animated.View entering={FadeInDown.delay(140).duration(300).springify().damping(18)}>
        <View style={styles.tabRow}>
          {[
            { key: "upcoming", label: "Upcoming", icon: "event-note", count: pendingItems.length },
            { key: "filings", label: "Filing Types", icon: "description", count: GST_FILING_TYPES.length },
            { key: "history", label: "History", icon: "history", count: complianceStats.totalCompleted },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <MaterialIcons name={tab.icon} size={16} color={isActive ? colors.text.inverse : colors.text.secondary} />
                <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>{tab.label}</Text>
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>{tab.count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* ═══════════════ TAB: UPCOMING ═══════════════ */}
      {activeTab === "upcoming" && (
        <>
          {/* Pending Due Dates */}
          <Animated.View entering={FadeInDown.delay(160).duration(300).springify().damping(18)}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="pending-actions" size={18} color={colors.accent.warning} />
              <Text style={styles.sectionTitle}>Pending ({pendingItems.length})</Text>
              <Pressable
                style={({ pressed }) => [styles.addReminderBtn, pressed && styles.pressedEffect]}
                onPress={() => {
                  setNewReminderTitle("");
                  setNewReminderDay("");
                  setNewReminderMonth(new Date().getMonth());
                  setNewReminderNotes("");
                  setAddReminderModal(true);
                }}
              >
                <MaterialIcons name="add" size={16} color={colors.text.inverse} />
                <Text style={styles.addReminderText}>Custom</Text>
              </Pressable>
            </View>

            {pendingItems.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyCircle}>
                  <MaterialIcons name="check-circle" size={36} color={colors.accent.success} />
                </View>
                <Text style={styles.emptyText}>All Clear! 🎉</Text>
                <Text style={styles.emptyDesc}>No pending GST filings. You're fully compliant.</Text>
              </View>
            ) : (
              pendingItems.map((item, index) => (
                <Animated.View
                  key={`${item.key}-${index}`}
                  entering={FadeInDown.delay(180 + index * 50).duration(300).springify().damping(18)}
                >
                  <View style={[styles.dueDateCard, item.daysLeft <= 3 && styles.dueDateCardUrgent]}>
                    {item.daysLeft <= 0 && (
                      <View style={styles.overdueRibbon}>
                        <Text style={styles.overdueRibbonText}>OVERDUE</Text>
                      </View>
                    )}
                    <View style={styles.dueCardTop}>
                      <View style={styles.dueCardLeft}>
                        <View style={[styles.dueIconWrap, { backgroundColor: `${item.color}18` }]}>
                          <MaterialIcons name={item.icon} size={22} color={item.color} />
                        </View>
                        <View style={styles.dueCardInfo}>
                          <View style={styles.dueCardNameRow}>
                            <Text style={styles.dueCardName}>{item.name}</Text>
                            {item.isCustom && (
                              <View style={styles.customBadge}>
                                <Text style={styles.customBadgeText}>Custom</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.dueCardDesc}>{item.description}</Text>
                        </View>
                      </View>
                      <View style={[styles.daysLeftBadge, { backgroundColor: getDaysLeftBg(item.daysLeft) }]}>
                        <Text style={[styles.daysLeftText, { color: getDaysLeftColor(item.daysLeft) }]}>
                          {getDaysLeftLabel(item.daysLeft)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.dueCardBottom}>
                      <View style={styles.dueCardDateRow}>
                        <MaterialIcons name="event" size={14} color={colors.text.secondary} />
                        <Text style={styles.dueCardDate}>{item.dateStr}</Text>
                        {item.frequency && (
                          <>
                            <View style={styles.dotSep} />
                            <MaterialIcons name="repeat" size={13} color={colors.text.muted} />
                            <Text style={styles.dueCardFreq}>{item.frequency}</Text>
                          </>
                        )}
                      </View>
                      <View style={styles.dueCardActions}>
                        {item.isCustom && (
                          <Pressable
                            style={({ pressed }) => [styles.dueActionBtn, styles.dueDeleteBtn, pressed && styles.pressedEffect]}
                            onPress={() => handleDeleteCustomReminder(item.id)}
                          >
                            <MaterialIcons name="delete-outline" size={16} color={colors.accent.danger} />
                          </Pressable>
                        )}
                        <Pressable
                          style={({ pressed }) => [styles.completeBtn, pressed && styles.pressedEffect]}
                          onPress={() => {
                            Alert.alert(
                              "Mark as Filed",
                              `Mark ${item.name} (due ${item.dateStr}) as filed/completed?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                { text: "Mark Filed ✓", onPress: () => handleMarkComplete(item) },
                              ]
                            );
                          }}
                        >
                          <MaterialIcons name="check-circle" size={16} color={colors.accent.success} />
                          <Text style={styles.completeBtnText}>Mark Filed</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </Animated.View>
              ))
            )}

            {/* Completed This Cycle */}
            {completedItems.length > 0 && (
              <>
                <View style={[styles.sectionHeader, { marginTop: 8 }]}>
                  <MaterialIcons name="check-circle" size={18} color={colors.accent.success} />
                  <Text style={styles.sectionTitle}>Completed ({completedItems.length})</Text>
                </View>
                {completedItems.map((item, index) => (
                  <Animated.View
                    key={`comp-${item.key}-${index}`}
                    entering={FadeInDown.delay(index * 40).duration(250).springify().damping(18)}
                  >
                    <View style={styles.completedCard}>
                      <View style={styles.completedLeft}>
                        <View style={[styles.completedIcon, { backgroundColor: `${item.color}12` }]}>
                          <MaterialIcons name="check" size={18} color={colors.accent.success} />
                        </View>
                        <View>
                          <Text style={styles.completedName}>{item.name}</Text>
                          <Text style={styles.completedDate}>Due: {item.dateStr}</Text>
                        </View>
                      </View>
                      <Pressable
                        style={({ pressed }) => [styles.undoBtn, pressed && styles.pressedEffect]}
                        onPress={() => {
                          Alert.alert("Undo Filing", `Mark ${item.name} as not yet filed?`, [
                            { text: "Cancel", style: "cancel" },
                            { text: "Undo", onPress: () => handleUndoComplete(item.key) },
                          ]);
                        }}
                      >
                        <MaterialIcons name="undo" size={14} color={colors.text.muted} />
                        <Text style={styles.undoBtnText}>Undo</Text>
                      </Pressable>
                    </View>
                  </Animated.View>
                ))}
              </>
            )}
          </Animated.View>
        </>
      )}

      {/* ═══════════════ TAB: FILING TYPES ═══════════════ */}
      {activeTab === "filings" && (
        <Animated.View entering={FadeInDown.delay(160).duration(300).springify().damping(18)}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="description" size={18} color={colors.accent.primary} />
            <Text style={styles.sectionTitle}>GST Filing Types</Text>
          </View>

          {GST_FILING_TYPES.map((filing, index) => {
            const config = getFilingConfig(filing.id);
            return (
              <Animated.View
                key={filing.id}
                entering={FadeInDown.delay(180 + index * 60).duration(300).springify().damping(18)}
              >
                <View style={[styles.filingCard, !config.enabled && styles.filingCardDisabled]}>
                  <View style={styles.filingHeader}>
                    <View style={styles.filingLeft}>
                      <View style={[styles.filingIconWrap, { backgroundColor: filing.bgColor }]}>
                        <MaterialIcons name={filing.icon} size={20} color={filing.color} />
                      </View>
                      <View style={styles.filingInfo}>
                        <Text style={[styles.filingName, !config.enabled && styles.mutedText]}>{filing.name}</Text>
                        <Text style={styles.filingDesc}>{filing.description}</Text>
                      </View>
                    </View>
                    <Switch
                      value={config.enabled}
                      onValueChange={() => toggleFilingEnabled(filing.id)}
                      trackColor={{ false: colors.border.medium, true: `${filing.color}40` }}
                      thumbColor={config.enabled ? filing.color : colors.text.muted}
                    />
                  </View>

                  {config.enabled && (
                    <View style={styles.filingDetails}>
                      <View style={styles.filingDetailRow}>
                        <View style={styles.filingDetailItem}>
                          <Text style={styles.detailLabel}>Frequency</Text>
                          <View style={styles.detailValueWrap}>
                            <MaterialIcons name="repeat" size={14} color={colors.text.secondary} />
                            <Text style={styles.detailValue}>{filing.frequency}</Text>
                          </View>
                        </View>
                        <View style={styles.filingDetailItem}>
                          <Text style={styles.detailLabel}>Due Day</Text>
                          <Pressable style={styles.editDueDayBtn} onPress={() => openEditDueDay(filing)}>
                            <Text style={styles.dueDayValue}>{getOrdinal(config.dueDay)}</Text>
                            <MaterialIcons name="edit" size={14} color={colors.accent.primary} />
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.alertToggleRow}>
                        <View style={styles.alertToggleLeft}>
                          <MaterialIcons name="notifications" size={16} color={config.alertEnabled ? colors.accent.warning : colors.text.muted} />
                          <Text style={styles.alertToggleLabel}>
                            {config.alertEnabled ? "Alert enabled" : "Alert disabled"}
                          </Text>
                        </View>
                        <Pressable
                          style={[styles.alertToggleBtn, config.alertEnabled && styles.alertToggleBtnActive]}
                          onPress={() => toggleFilingAlert(filing.id)}
                        >
                          <Text style={[styles.alertToggleBtnText, config.alertEnabled && styles.alertToggleBtnTextActive]}>
                            {config.alertEnabled ? "ON" : "OFF"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              </Animated.View>
            );
          })}

          {/* Custom Reminders within filings tab */}
          <View style={[styles.sectionHeader, { marginTop: 8 }]}>
            <MaterialIcons name="add-alert" size={18} color={colors.accent.primary} />
            <Text style={styles.sectionTitle}>Custom Reminders</Text>
            <Pressable
              style={({ pressed }) => [styles.addReminderBtn, pressed && styles.pressedEffect]}
              onPress={() => {
                setNewReminderTitle("");
                setNewReminderDay("");
                setNewReminderMonth(new Date().getMonth());
                setNewReminderNotes("");
                setAddReminderModal(true);
              }}
            >
              <MaterialIcons name="add" size={16} color={colors.text.inverse} />
              <Text style={styles.addReminderText}>Add</Text>
            </Pressable>
          </View>

          {(gstSettings.customReminders || []).length === 0 ? (
            <View style={styles.emptyCustomCard}>
              <MaterialIcons name="bookmark-add" size={28} color={colors.text.muted} />
              <Text style={styles.emptyCustomText}>No custom reminders yet</Text>
              <Text style={styles.emptyCustomDesc}>
                Add custom reminders for TDS, e-invoicing, LUT filing, etc.
              </Text>
            </View>
          ) : (
            (gstSettings.customReminders || []).map((rem, index) => (
              <Animated.View
                key={rem.id}
                entering={FadeInDown.delay(index * 50).duration(250).springify().damping(18)}
              >
                <View style={styles.customReminderCard}>
                  <View style={styles.customReminderLeft}>
                    <View style={styles.customReminderIcon}>
                      <MaterialIcons name="event" size={18} color="#EC4899" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.customReminderTitle}>{rem.title}</Text>
                      <Text style={styles.customReminderDate}>
                        {MONTHS[rem.month]} {rem.day} • Every year
                      </Text>
                      {rem.notes ? <Text style={styles.customReminderNotes}>{rem.notes}</Text> : null}
                    </View>
                  </View>
                  <Pressable onPress={() => handleDeleteCustomReminder(rem.id)} hitSlop={8}>
                    <MaterialIcons name="close" size={18} color={colors.text.muted} />
                  </Pressable>
                </View>
              </Animated.View>
            ))
          )}
        </Animated.View>
      )}

      {/* ═══════════════ TAB: HISTORY ═══════════════ */}
      {activeTab === "history" && (
        <Animated.View entering={FadeInDown.delay(160).duration(300).springify().damping(18)}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="history" size={18} color={colors.accent.primary} />
            <Text style={styles.sectionTitle}>Filing History ({filingHistory.length})</Text>
            {filingHistory.length > 0 && (
              <Pressable
                style={({ pressed }) => [styles.clearHistoryBtn, pressed && styles.pressedEffect]}
                onPress={() => {
                  Alert.alert(
                    "Clear All History",
                    "This will reset all completed filing records. Are you sure?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Clear All",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            await setDoc(completedDocRef, {});
                          } catch (e) {
                            Alert.alert("Error", "Failed to clear history.");
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <MaterialIcons name="delete-sweep" size={16} color={colors.accent.danger} />
                <Text style={styles.clearHistoryText}>Clear</Text>
              </Pressable>
            )}
          </View>

          {filingHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="folder-open" size={38} color={colors.text.muted} />
              <Text style={styles.emptyText}>No filing history</Text>
              <Text style={styles.emptyDesc}>
                Completed filings will appear here for your records.
              </Text>
            </View>
          ) : (
            filingHistory.map((entry, index) => {
              const dateStr = entry.completedAt
                ? `${MONTHS[entry.completedAt.getMonth()]} ${entry.completedAt.getDate()}, ${entry.completedAt.getFullYear()}`
                : "Unknown";
              const timeStr = entry.completedAt
                ? entry.completedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "";
              return (
                <Animated.View
                  key={`hist-${entry.key}-${index}`}
                  entering={FadeInDown.delay(180 + index * 40).duration(250).springify().damping(18)}
                >
                  <View style={styles.historyCard}>
                    <View style={styles.historyLeft}>
                      <View style={styles.historyIconWrap}>
                        <MaterialIcons name="verified" size={18} color={colors.accent.success} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyName}>{entry.name}</Text>
                        <Text style={styles.historyDate}>
                          Filed on {dateStr} {timeStr ? `at ${timeStr}` : ""}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.undoBtn, pressed && styles.pressedEffect]}
                      onPress={() => {
                        Alert.alert("Undo Filing", `Remove ${entry.name} from history?`, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Remove", style: "destructive", onPress: () => handleUndoComplete(entry.key) },
                        ]);
                      }}
                    >
                      <MaterialIcons name="undo" size={14} color={colors.text.muted} />
                    </Pressable>
                  </View>
                </Animated.View>
              );
            })
          )}
        </Animated.View>
      )}

      {/* Info Card */}
      <Animated.View entering={FadeInDown.delay(300).duration(300).springify().damping(18)}>
        <View style={styles.infoCard}>
          <MaterialIcons name="info-outline" size={18} color={colors.accent.info} />
          <Text style={styles.infoText}>
            Due dates are based on standard GST filing schedules. Adjust individual due days if your state has different deadlines. Use "Sync Alarms" to create notification reminders.
          </Text>
        </View>
      </Animated.View>

      <View style={{ height: 32 }} />

      {/* ─── Edit Due Day Modal ─── */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Edit Due Day — {editingFiling?.name}
              </Text>
              <Pressable onPress={() => setEditModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>
            <Text style={styles.modalDesc}>
              Enter the day of the month when {editingFiling?.name} is due for filing.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={editDueDay}
              onChangeText={(v) => setEditDueDay(v.replace(/[^0-9]/g, "").substring(0, 2))}
              keyboardType="number-pad"
              placeholder="e.g. 11"
              placeholderTextColor={colors.text.muted}
              maxLength={2}
            />
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={saveEditDueDay}>
                <Text style={styles.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Add Custom Reminder Modal ─── */}
      <Modal visible={addReminderModal} transparent animationType="slide" onRequestClose={() => setAddReminderModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Custom Reminder</Text>
              <Pressable onPress={() => setAddReminderModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Title *</Text>
            <TextInput
              style={styles.modalInput}
              value={newReminderTitle}
              onChangeText={setNewReminderTitle}
              placeholder="e.g. TDS Payment, E-Way Bill"
              placeholderTextColor={colors.text.muted}
            />

            <Text style={styles.inputLabel}>Month</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
              <View style={styles.monthRow}>
                {MONTHS.map((m, i) => {
                  const isSelected = newReminderMonth === i;
                  return (
                    <Pressable
                      key={m}
                      style={[styles.monthChip, isSelected && styles.monthChipActive]}
                      onPress={() => setNewReminderMonth(i)}
                    >
                      <Text style={[styles.monthChipText, isSelected && styles.monthChipTextActive]}>{m}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={styles.inputLabel}>Day of Month *</Text>
            <TextInput
              style={styles.modalInput}
              value={newReminderDay}
              onChangeText={(v) => setNewReminderDay(v.replace(/[^0-9]/g, "").substring(0, 2))}
              keyboardType="number-pad"
              placeholder="e.g. 15"
              placeholderTextColor={colors.text.muted}
              maxLength={2}
            />

            <Text style={styles.inputLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.modalInput, { height: 70 }]}
              value={newReminderNotes}
              onChangeText={setNewReminderNotes}
              placeholder="Additional details..."
              placeholderTextColor={colors.text.muted}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setAddReminderModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={handleAddCustomReminder}>
                <Text style={styles.modalSaveText}>Add Reminder</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─── Utility Functions ───
function formatDate(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function GSTManagementRoute() {
  return (
    <ProtectedRoute>
      <GSTManagementScreen />
    </ProtectedRoute>
  );
}

// ─── Styles ───
const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    container: {
      padding: spacing.lg,
      backgroundColor: colors.bg.primary,
      flexGrow: 1,
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: colors.bg.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: {
      marginTop: 12,
      color: colors.text.secondary,
      fontSize: 16,
      fontWeight: "500",
    },

    // Header
    header: {
      marginBottom: spacing.md,
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 2,
    },
    syncButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accent.primary,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      gap: 6,
      ...shadows.subtle,
    },
    syncButtonText: {
      color: colors.text.inverse,
      fontWeight: "700",
      fontSize: 13,
    },
    pressedEffect: {
      opacity: 0.8,
      transform: [{ scale: 0.97 }],
    },

    // ─── Compliance Dashboard ───
    dashboardCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      ...shadows.card,
    },
    dashboardTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
    },
    dashboardGauge: {
      alignItems: "center",
    },
    gaugeCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 4,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
    },
    gaugePercent: {
      fontSize: 22,
      fontWeight: "900",
    },
    gaugeLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.text.muted,
      marginTop: -1,
    },
    dashboardStats: {
      flex: 1,
      gap: 6,
    },
    dashStatRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    dashStatDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    dashStatLabel: {
      fontSize: 13,
      color: colors.text.secondary,
      flex: 1,
    },
    dashStatValue: {
      fontSize: 15,
      fontWeight: "800",
    },
    overdueAlert: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#FEE2E2",
      borderRadius: radius.sm,
      padding: 10,
      gap: 8,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: "#FECACA",
    },
    overdueAlertText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#DC2626",
      flex: 1,
    },

    // ─── GSTIN Strip ───
    gstinCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      ...shadows.subtle,
    },
    gstinRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    gstinLeftCol: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 10,
    },
    gstinIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: "#3B82F615",
      justifyContent: "center",
      alignItems: "center",
    },
    gstinTitle: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    gstinInput: {
      fontSize: 15,
      fontWeight: "700",
      letterSpacing: 1.2,
      color: colors.text.primary,
      padding: 0,
      marginTop: 1,
    },
    gstinToggle: {
      alignItems: "center",
      gap: 2,
    },
    gstinToggleLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.text.muted,
    },

    // ─── Reminder Strip ───
    reminderStrip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.lg,
      ...shadows.subtle,
    },
    reminderStripLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginRight: 12,
    },
    reminderStripLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    reminderDaysPicker: {
      flexDirection: "row",
      gap: 6,
    },
    reminderDayChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: colors.bg.primary,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
    },
    reminderDayChipActive: {
      backgroundColor: `${colors.accent.primary}15`,
      borderColor: colors.accent.primary,
    },
    reminderDayText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    reminderDayTextActive: {
      color: colors.accent.primary,
    },

    // ─── Tabs ───
    tabRow: {
      flexDirection: "row",
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 4,
      marginBottom: spacing.lg,
      ...shadows.subtle,
    },
    tabBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      borderRadius: radius.md,
      gap: 5,
    },
    tabBtnActive: {
      backgroundColor: colors.accent.primary,
      ...shadows.subtle,
    },
    tabBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    tabBtnTextActive: {
      color: colors.text.inverse,
    },
    tabBadge: {
      backgroundColor: colors.bg.elevated,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 8,
    },
    tabBadgeActive: {
      backgroundColor: "rgba(255,255,255,0.25)",
    },
    tabBadgeText: {
      fontSize: 10,
      fontWeight: "800",
      color: colors.text.muted,
    },
    tabBadgeTextActive: {
      color: "#ffffff",
    },

    // Section Headers
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: spacing.md,
      marginTop: spacing.sm,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      flex: 1,
    },

    // ─── Due Date Cards ───
    dueDateCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.sm,
      ...shadows.subtle,
    },
    dueDateCardUrgent: {
      borderColor: `${colors.accent.danger}40`,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent.danger,
    },
    overdueRibbon: {
      position: "absolute",
      top: 0,
      right: 0,
      backgroundColor: colors.accent.danger,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderTopRightRadius: radius.lg,
      borderBottomLeftRadius: radius.md,
    },
    overdueRibbonText: {
      color: "#FFFFFF",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1,
    },
    dueCardTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    dueCardLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      marginRight: 10,
    },
    dueIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    dueCardInfo: {
      flex: 1,
    },
    dueCardNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    dueCardName: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text.primary,
    },
    customBadge: {
      backgroundColor: "#EC489918",
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 8,
    },
    customBadgeText: {
      fontSize: 9,
      fontWeight: "700",
      color: "#EC4899",
    },
    dueCardDesc: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
    daysLeftBadge: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    daysLeftText: {
      fontSize: 11,
      fontWeight: "800",
    },
    dueCardBottom: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    dueCardDateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    dueCardDate: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    dotSep: {
      width: 3,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.text.muted,
    },
    dueCardFreq: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.text.muted,
    },
    dueCardActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    dueActionBtn: {
      padding: 6,
      borderRadius: 8,
    },
    dueDeleteBtn: {
      backgroundColor: `${colors.accent.danger}10`,
    },
    completeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: `${colors.accent.success}12`,
      borderWidth: 1,
      borderColor: `${colors.accent.success}30`,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 12,
    },
    completeBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent.success,
    },

    // ─── Completed Cards ───
    completedCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: `${colors.accent.success}08`,
      borderWidth: 1,
      borderColor: `${colors.accent.success}20`,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.xs,
    },
    completedLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 10,
    },
    completedIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    completedName: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
      textDecorationLine: "line-through",
      opacity: 0.7,
    },
    completedDate: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 1,
    },
    undoBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    undoBtnText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
    },

    // Empty States
    emptyState: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.xl,
      alignItems: "center",
      marginBottom: spacing.lg,
      ...shadows.subtle,
    },
    emptyCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: `${colors.accent.success}10`,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
    },
    emptyDesc: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 4,
      textAlign: "center",
    },

    // Filing Cards
    filingCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      ...shadows.subtle,
    },
    filingCardDisabled: {
      opacity: 0.6,
    },
    filingHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    filingLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    filingIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    filingInfo: {
      flex: 1,
    },
    filingName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
    },
    filingDesc: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 1,
    },
    mutedText: {
      color: colors.text.muted,
    },
    filingDetails: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    filingDetailRow: {
      flexDirection: "row",
      gap: spacing.lg,
    },
    filingDetailItem: {
      flex: 1,
    },
    detailLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    detailValueWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
    },
    editDueDayBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: `${colors.accent.primary}10`,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 8,
      alignSelf: "flex-start",
    },
    dueDayValue: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    alertToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    alertToggleLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    alertToggleLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    alertToggleBtn: {
      paddingVertical: 4,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: colors.bg.primary,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
    },
    alertToggleBtnActive: {
      backgroundColor: `${colors.accent.warning}20`,
      borderColor: colors.accent.warning,
    },
    alertToggleBtnText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.text.muted,
    },
    alertToggleBtnTextActive: {
      color: colors.accent.warning,
    },

    // Custom Reminders
    addReminderBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accent.success,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 14,
      gap: 3,
    },
    addReminderText: {
      color: colors.text.inverse,
      fontSize: 12,
      fontWeight: "700",
    },
    emptyCustomCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.xl,
      alignItems: "center",
      marginBottom: spacing.lg,
      ...shadows.subtle,
    },
    emptyCustomText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 8,
    },
    emptyCustomDesc: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: 4,
      lineHeight: 18,
    },
    customReminderCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      ...shadows.subtle,
    },
    customReminderLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 12,
    },
    customReminderIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: "#EC489915",
      justifyContent: "center",
      alignItems: "center",
    },
    customReminderTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    customReminderDate: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 1,
    },
    customReminderNotes: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },

    // History
    historyCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.xs,
      ...shadows.subtle,
    },
    historyLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 10,
    },
    historyIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: `${colors.accent.success}12`,
      justifyContent: "center",
      alignItems: "center",
    },
    historyName: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    historyDate: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 1,
    },
    clearHistoryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: `${colors.accent.danger}10`,
    },
    clearHistoryText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent.danger,
    },

    // Info Card
    infoCard: {
      flexDirection: "row",
      backgroundColor: `${colors.accent.info}10`,
      borderWidth: 1,
      borderColor: `${colors.accent.info}30`,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: 10,
      marginTop: spacing.md,
    },
    infoText: {
      fontSize: 12,
      color: colors.accent.info,
      flex: 1,
      lineHeight: 18,
    },

    // Modals
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.bg.overlay,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xl,
    },
    modalContent: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.xl,
      padding: spacing.xl,
      width: "100%",
      maxWidth: 400,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.elevated,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
      flex: 1,
    },
    modalDesc: {
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: spacing.md,
      lineHeight: 20,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
      marginBottom: 6,
      marginTop: spacing.sm,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: radius.md,
      padding: 12,
      fontSize: 15,
      backgroundColor: colors.bg.primary,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
    modalBtnRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    modalCancelBtn: {
      flex: 1,
      height: 44,
      borderRadius: radius.md,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border.medium,
      backgroundColor: colors.bg.primary,
    },
    modalCancelText: {
      color: colors.text.secondary,
      fontWeight: "700",
      fontSize: 14,
    },
    modalSaveBtn: {
      flex: 1,
      height: 44,
      borderRadius: radius.md,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.accent.primary,
    },
    modalSaveText: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 14,
    },

    // Month Picker
    monthScroll: {
      marginBottom: spacing.sm,
    },
    monthRow: {
      flexDirection: "row",
      gap: 6,
    },
    monthChip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.bg.primary,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
    },
    monthChipActive: {
      backgroundColor: `${colors.accent.primary}15`,
      borderColor: colors.accent.primary,
    },
    monthChipText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    monthChipTextActive: {
      color: colors.accent.primary,
    },
  });
};
