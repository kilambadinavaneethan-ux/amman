import React, { useState, useMemo, useContext } from "react";
import { useTheme } from "../context/ThemeContext";
import { NotificationContext } from "../context/NotificationContext";
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
  Platform,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import ProtectedRoute from "../components/ProtectedRoute";
import BackButton from "../components/BackButton";

function NotificationSettings() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();

  const {
    notifications,
    loading,
    unreadCount,
    smartAlerts,
    preferences,
    prefsLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    updatePreferences,
    expoPushToken,
  } = useContext(NotificationContext);

  const [activeSection, setActiveSection] = useState("alerts"); // "feed" | "alerts" | "settings"
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSuccess, setPrefsSuccess] = useState(false);

  // Local preference state (editable, saved on button press)
  const [localPrefs, setLocalPrefs] = useState(null);
  const effectivePrefs = localPrefs || preferences;

  const handleTogglePref = (key) => {
    setLocalPrefs((prev) => ({
      ...(prev || preferences),
      [key]: !(prev || preferences)[key],
    }));
  };

  const handleThresholdChange = (key, value) => {
    setLocalPrefs((prev) => ({
      ...(prev || preferences),
      [key]: Number(value) || 0,
    }));
  };

  const handleSavePrefs = async () => {
    if (!localPrefs) return;
    setSavingPrefs(true);
    await updatePreferences(localPrefs);
    setSavingPrefs(false);
    setPrefsSuccess(true);
    setTimeout(() => setPrefsSuccess(false), 2500);
  };

  // Time formatting
  const getRelativeTime = (date) => {
    if (!date) return "";
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  const SECTION_TABS = [
    { key: "alerts", label: "Smart Alerts", icon: "flash-on", count: smartAlerts.length },
    { key: "feed", label: "Feed", icon: "notifications", count: unreadCount },
    { key: "settings", label: "Settings", icon: "tune", count: 0 },
  ];

  const NOTIF_ICON_MAP = {
    info: { icon: "info", color: "#3b82f6", bg: "#eff6ff" },
    success: { icon: "check-circle", color: "#10b981", bg: "#ecfdf5" },
    warning: { icon: "warning", color: "#f59e0b", bg: "#fffbeb" },
    error: { icon: "error", color: "#ef4444", bg: "#fef2f2" },
    order: { icon: "receipt", color: "#6C5CE7", bg: "#f5f3ff" },
    payment: { icon: "payment", color: "#059669", bg: "#ecfdf5" },
    stock: { icon: "inventory", color: "#0284c7", bg: "#f0f9ff" },
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Back button & Title */}
      <View style={styles.header}>
        <BackButton
          label="Settings"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/settings");
            }
          }}
          style={{ marginBottom: 12 }}
        />
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.title}>Notification Center</Text>
            <Text style={styles.subtitle}>Alerts, feed & preferences</Text>
          </View>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Section Tabs */}
      <Animated.View entering={FadeInDown.delay(100).duration(400).springify().damping(18)}>
        <View style={styles.tabRow}>
          {SECTION_TABS.map((tab) => {
            const isActive = activeSection === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setActiveSection(tab.key)}
              >
                <MaterialIcons
                  name={tab.icon}
                  size={18}
                  color={isActive ? colors.bg.card : colors.text.muted}
                />
                <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View style={[styles.tabCountBadge, isActive && { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                    <Text style={[styles.tabCountText, isActive && { color: "#fff" }]}>{tab.count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* ──── SECTION: SMART ALERTS ──── */}
      {activeSection === "alerts" && (
        <Animated.View entering={FadeInDown.delay(150).duration(400).springify().damping(18)}>
          {smartAlerts.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyCircle}>
                <MaterialIcons name="verified" size={40} color={colors.accent.success} />
              </View>
              <Text style={styles.emptyTitle}>All Clear!</Text>
              <Text style={styles.emptyDesc}>
                No business alerts right now. Your inventory, expenses, and payments are all healthy.
              </Text>
            </View>
          ) : (
            <View style={styles.alertsContainer}>
              <Text style={styles.sectionHeading}>
                Active Business Alerts ({smartAlerts.length})
              </Text>
              {smartAlerts.map((alert, index) => (
                <Animated.View
                  key={alert.type}
                  entering={FadeInDown.delay(index * 80).duration(350).springify().damping(18)}
                >
                  <Pressable
                    style={({ pressed }) => [
                      styles.alertCard,
                      { borderLeftColor: alert.color, borderLeftWidth: 4 },
                      pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                    ]}
                    onPress={() => router.push(alert.route)}
                  >
                    <View style={[styles.alertIconBg, { backgroundColor: alert.bgColor }]}>
                      <MaterialIcons name={alert.icon} size={22} color={alert.color} />
                    </View>
                    <View style={styles.alertContent}>
                      <Text style={styles.alertTitle}>{alert.title}</Text>
                      <Text style={styles.alertDesc} numberOfLines={2}>
                        {alert.description}
                      </Text>
                    </View>
                    <View style={styles.alertAction}>
                      <View style={[styles.alertCountChip, { backgroundColor: `${alert.color}15` }]}>
                        <Text style={[styles.alertCountText, { color: alert.color }]}>{alert.count}</Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
                    </View>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          )}
        </Animated.View>
      )}

      {/* ──── SECTION: NOTIFICATION FEED ──── */}
      {activeSection === "feed" && (
        <Animated.View entering={FadeInDown.delay(150).duration(400).springify().damping(18)}>
          {/* Feed Header Actions */}
          {notifications.length > 0 && (
            <View style={styles.feedActions}>
              {unreadCount > 0 && (
                <Pressable
                  style={({ pressed }) => [styles.feedActionBtn, pressed && { opacity: 0.7 }]}
                  onPress={markAllAsRead}
                >
                  <MaterialIcons name="done-all" size={16} color={colors.accent.primary} />
                  <Text style={[styles.feedActionText, { color: colors.accent.primary }]}>Mark All Read</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.feedActionBtn, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  Alert.alert(
                    "Clear All",
                    "Are you sure you want to delete all notifications?",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Clear", style: "destructive", onPress: clearAll },
                    ]
                  );
                }}
              >
                <MaterialIcons name="delete-sweep" size={16} color={colors.accent.danger} />
                <Text style={[styles.feedActionText, { color: colors.accent.danger }]}>Clear All</Text>
              </Pressable>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={colors.accent.primary} />
              <Text style={styles.loadingText}>Loading notifications...</Text>
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyCircle}>
                <MaterialIcons name="notifications-off" size={40} color={colors.text.muted} />
              </View>
              <Text style={styles.emptyTitle}>No Notifications Yet</Text>
              <Text style={styles.emptyDesc}>
                Your notification feed is empty. Business events and alerts will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.feedContainer}>
              {notifications.map((notif, index) => {
                const typeConfig = NOTIF_ICON_MAP[notif.type] || NOTIF_ICON_MAP.info;
                return (
                  <Animated.View
                    key={notif.id}
                    entering={FadeInDown.delay(index * 40).duration(300).springify().damping(18)}
                  >
                    <Pressable
                      style={[
                        styles.notifCard,
                        !notif.read && styles.notifCardUnread,
                      ]}
                      onPress={() => {
                        if (!notif.read) markAsRead(notif.id);
                      }}
                    >
                      <View style={[styles.notifIconBg, { backgroundColor: typeConfig.bg }]}>
                        <MaterialIcons name={notif.icon || typeConfig.icon} size={20} color={notif.color || typeConfig.color} />
                      </View>
                      <View style={styles.notifContent}>
                        <Text style={[styles.notifTitle, !notif.read && { fontWeight: "800" }]} numberOfLines={1}>
                          {notif.title}
                        </Text>
                        <Text style={styles.notifDesc} numberOfLines={2}>
                          {notif.description}
                        </Text>
                        <Text style={styles.notifTime}>{getRelativeTime(notif.createdAt)}</Text>
                      </View>
                      <Pressable
                        style={({ pressed }) => [styles.notifDeleteBtn, pressed && { opacity: 0.5 }]}
                        onPress={() => deleteNotification(notif.id)}
                        hitSlop={8}
                      >
                        <MaterialIcons name="close" size={16} color={colors.text.muted} />
                      </Pressable>
                      {!notif.read && <View style={styles.unreadDot} />}
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </Animated.View>
      )}

      {/* ──── SECTION: SETTINGS ──── */}
      {activeSection === "settings" && (
        <Animated.View entering={FadeInDown.delay(150).duration(400).springify().damping(18)}>
          <View style={styles.settingsCard}>
            <Text style={styles.sectionHeading}>Notification Channels</Text>

            {/* Push notifications */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrapper, { backgroundColor: "#6C5CE720" }]}>
                  <MaterialIcons name="notifications-active" size={20} color={colors.accent.primary} />
                </View>
                <View style={styles.rowTextWrapper}>
                  <Text style={styles.rowTitle}>Push Notifications</Text>
                  <Text style={styles.rowDesc}>Instant updates on this device</Text>
                </View>
              </View>
              <Switch
                value={effectivePrefs.pushEnabled}
                onValueChange={() => handleTogglePref("pushEnabled")}
                trackColor={{ false: "#363B4D", true: "#6C5CE740" }}
                thumbColor={effectivePrefs.pushEnabled ? "#6C5CE7" : "#5A5F72"}
              />
            </View>

            {/* Email */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrapper, { backgroundColor: "#ecfdf5" }]}>
                  <MaterialIcons name="alternate-email" size={20} color="#059669" />
                </View>
                <View style={styles.rowTextWrapper}>
                  <Text style={styles.rowTitle}>Email Reports</Text>
                  <Text style={styles.rowDesc}>Weekly summary of sales & expenses</Text>
                </View>
              </View>
              <Switch
                value={effectivePrefs.emailEnabled}
                onValueChange={() => handleTogglePref("emailEnabled")}
                trackColor={{ false: "#363B4D", true: "#a7f3d0" }}
                thumbColor={effectivePrefs.emailEnabled ? "#059669" : "#5A5F72"}
              />
            </View>

            {/* SMS */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrapper, { backgroundColor: "#faf5ff" }]}>
                  <MaterialIcons name="sms" size={20} color="#7c3aed" />
                </View>
                <View style={styles.rowTextWrapper}>
                  <Text style={styles.rowTitle}>SMS Alerts</Text>
                  <Text style={styles.rowDesc}>Text warnings for critical actions</Text>
                </View>
              </View>
              <Switch
                value={effectivePrefs.smsEnabled}
                onValueChange={() => handleTogglePref("smsEnabled")}
                trackColor={{ false: "#363B4D", true: "#e9d5ff" }}
                thumbColor={effectivePrefs.smsEnabled ? "#7c3aed" : "#5A5F72"}
              />
            </View>

            {/* Daily Summary */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrapper, { backgroundColor: "#f0f9ff" }]}>
                  <MaterialIcons name="summarize" size={20} color="#0284c7" />
                </View>
                <View style={styles.rowTextWrapper}>
                  <Text style={styles.rowTitle}>Daily Summary</Text>
                  <Text style={styles.rowDesc}>End-of-day business snapshot</Text>
                </View>
              </View>
              <Switch
                value={effectivePrefs.dailySummary}
                onValueChange={() => handleTogglePref("dailySummary")}
                trackColor={{ false: "#363B4D", true: "#bae6fd" }}
                thumbColor={effectivePrefs.dailySummary ? "#0284c7" : "#5A5F72"}
              />
            </View>

            <View style={styles.divider} />
            <Text style={styles.sectionHeading}>Business Alert Rules</Text>

            {/* Low Stock */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrapper, { backgroundColor: "#fef2f2" }]}>
                  <MaterialIcons name="report-problem" size={20} color="#ef4444" />
                </View>
                <View style={styles.rowTextWrapper}>
                  <Text style={styles.rowTitle}>Low Stock Warnings</Text>
                  <Text style={styles.rowDesc}>Alert when items drop below threshold</Text>
                </View>
              </View>
              <Switch
                value={effectivePrefs.lowStockAlert}
                onValueChange={() => handleTogglePref("lowStockAlert")}
                trackColor={{ false: "#363B4D", true: "#fecaca" }}
                thumbColor={effectivePrefs.lowStockAlert ? "#ef4444" : "#5A5F72"}
              />
            </View>
            {effectivePrefs.lowStockAlert && (
              <View style={styles.thresholdRow}>
                <Text style={styles.thresholdLabel}>Stock threshold:</Text>
                <TextInput
                  style={styles.thresholdInput}
                  value={String(effectivePrefs.lowStockThreshold || 5)}
                  onChangeText={(v) => handleThresholdChange("lowStockThreshold", v)}
                  keyboardType="numeric"
                  placeholder="5"
                  placeholderTextColor={colors.text.muted}
                />
                <Text style={styles.thresholdUnit}>units</Text>
              </View>
            )}

            {/* Overdue Expenses */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrapper, { backgroundColor: "#fff7ed" }]}>
                  <MaterialIcons name="event" size={20} color="#ea580c" />
                </View>
                <View style={styles.rowTextWrapper}>
                  <Text style={styles.rowTitle}>Payment Due Warnings</Text>
                  <Text style={styles.rowDesc}>Alert for overdue expense balances</Text>
                </View>
              </View>
              <Switch
                value={effectivePrefs.dueAlertsEnabled}
                onValueChange={() => handleTogglePref("dueAlertsEnabled")}
                trackColor={{ false: "#363B4D", true: "#ffedd5" }}
                thumbColor={effectivePrefs.dueAlertsEnabled ? "#ea580c" : "#5A5F72"}
              />
            </View>
            {effectivePrefs.dueAlertsEnabled && (
              <View style={styles.thresholdRow}>
                <Text style={styles.thresholdLabel}>Days overdue:</Text>
                <TextInput
                  style={styles.thresholdInput}
                  value={String(effectivePrefs.dueAlertDays || 7)}
                  onChangeText={(v) => handleThresholdChange("dueAlertDays", v)}
                  keyboardType="numeric"
                  placeholder="7"
                  placeholderTextColor={colors.text.muted}
                />
                <Text style={styles.thresholdUnit}>days</Text>
              </View>
            )}

            {/* Worker Dues */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrapper, { backgroundColor: "#faf5ff" }]}>
                  <MaterialIcons name="engineering" size={20} color="#7c3aed" />
                </View>
                <View style={styles.rowTextWrapper}>
                  <Text style={styles.rowTitle}>Worker Due Alerts</Text>
                  <Text style={styles.rowDesc}>Alert for workers with high pending wages</Text>
                </View>
              </View>
              <Switch
                value={effectivePrefs.workerDueAlert}
                onValueChange={() => handleTogglePref("workerDueAlert")}
                trackColor={{ false: "#363B4D", true: "#e9d5ff" }}
                thumbColor={effectivePrefs.workerDueAlert ? "#7c3aed" : "#5A5F72"}
              />
            </View>
            {effectivePrefs.workerDueAlert && (
              <View style={styles.thresholdRow}>
                <Text style={styles.thresholdLabel}>Due threshold: ₹</Text>
                <TextInput
                  style={styles.thresholdInput}
                  value={String(effectivePrefs.workerDueThreshold || 5000)}
                  onChangeText={(v) => handleThresholdChange("workerDueThreshold", v)}
                  keyboardType="numeric"
                  placeholder="5000"
                  placeholderTextColor={colors.text.muted}
                />
              </View>
            )}

            {/* Supplier Balance */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrapper, { backgroundColor: "#fffbeb" }]}>
                  <MaterialIcons name="local-shipping" size={20} color="#d97706" />
                </View>
                <View style={styles.rowTextWrapper}>
                  <Text style={styles.rowTitle}>Supplier Balance Alerts</Text>
                  <Text style={styles.rowDesc}>Alert for high supplier outstanding</Text>
                </View>
              </View>
              <Switch
                value={effectivePrefs.supplierBalanceAlert}
                onValueChange={() => handleTogglePref("supplierBalanceAlert")}
                trackColor={{ false: "#363B4D", true: "#fde68a" }}
                thumbColor={effectivePrefs.supplierBalanceAlert ? "#d97706" : "#5A5F72"}
              />
            </View>
            {effectivePrefs.supplierBalanceAlert && (
              <View style={styles.thresholdRow}>
                <Text style={styles.thresholdLabel}>Balance threshold: ₹</Text>
                <TextInput
                  style={styles.thresholdInput}
                  value={String(effectivePrefs.supplierBalanceThreshold || 10000)}
                  onChangeText={(v) => handleThresholdChange("supplierBalanceThreshold", v)}
                  keyboardType="numeric"
                  placeholder="10000"
                  placeholderTextColor={colors.text.muted}
                />
              </View>
            )}

            {prefsSuccess && (
              <View style={styles.successAlert}>
                <MaterialIcons name="check-circle" size={18} color={colors.accent.success} />
                <Text style={styles.successText}>Preferences saved to cloud!</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                savingPrefs && styles.saveButtonDisabled,
                pressed && !savingPrefs && styles.buttonPressed,
              ]}
              onPress={handleSavePrefs}
              disabled={savingPrefs || !localPrefs}
            >
              {savingPrefs ? (
                <ActivityIndicator size="small" color={colors.text.inverse} />
              ) : (
                <>
                  <MaterialIcons name="cloud-upload" size={20} color={colors.text.inverse} />
                  <Text style={styles.saveButtonText}>Save Preferences</Text>
                </>
              )}
            </Pressable>

            {/* Push Connection Status Card */}
            <View style={{
              marginTop: 18,
              padding: 12,
              borderRadius: 12,
              backgroundColor: colors.bg.primary,
              borderWidth: 1,
              borderColor: colors.border.subtle,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <MaterialIcons 
                  name={expoPushToken ? "phonelink-ring" : "phonelink-erase"} 
                  size={18} 
                  color={expoPushToken ? colors.accent.success : colors.accent.danger} 
                />
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary }}>
                  Device Push Status
                </Text>
              </View>
              {expoPushToken ? (
                <>
                  <Text style={{ fontSize: 11, color: colors.text.muted, lineHeight: 15, marginBottom: 6 }}>
                    Your device is registered for cloud push notifications. Token saved in preferences:
                  </Text>
                  <Text 
                    selectable 
                    style={{ 
                      fontSize: 10, 
                      fontFamily: Platform.OS === "ios" ? "CourierNewPSMT" : "monospace", 
                      color: colors.accent.primary, 
                      backgroundColor: colors.bg.elevated, 
                      padding: 6, 
                      borderRadius: 6, 
                      overflow: "hidden" 
                    }}
                  >
                    {expoPushToken}
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 11, color: colors.text.muted, lineHeight: 15 }}>
                  Fetching device push token or permissions... Please ensure push permissions are enabled in your device settings.
                </Text>
              )}
            </View>
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}

export default function NotificationRoute() {
  return (
    <ProtectedRoute>
      <NotificationSettings />
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
      paddingBottom: 40,
    },
    header: {
      marginBottom: 16,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
      gap: 4,
    },
    backText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 2,
    },
    unreadBadge: {
      backgroundColor: colors.accent.danger,
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },
    unreadBadgeText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "800",
    },

    // Tabs
    tabRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 20,
    },
    tabBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.primary,
    },
    tabBtnActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    tabBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.muted,
    },
    tabBtnTextActive: {
      color: "#fff",
    },
    tabCountBadge: {
      backgroundColor: colors.border.subtle,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 8,
    },
    tabCountText: {
      fontSize: 10,
      fontWeight: "800",
      color: colors.text.secondary,
    },

    // Smart Alerts
    alertsContainer: {
      flex: 1,
    },
    sectionHeading: {
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      color: colors.text.muted,
      letterSpacing: 0.8,
      marginBottom: 14,
    },
    alertCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 14,
      marginBottom: 10,
      ...shadows.subtle,
    },
    alertIconBg: {
      width: 42,
      height: 42,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    alertContent: {
      flex: 1,
    },
    alertTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 3,
    },
    alertDesc: {
      fontSize: 12,
      color: colors.text.muted,
      lineHeight: 16,
    },
    alertAction: {
      alignItems: "center",
      gap: 4,
    },
    alertCountChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    alertCountText: {
      fontSize: 13,
      fontWeight: "800",
    },

    // Feed
    feedActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 12,
      marginBottom: 12,
    },
    feedActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    feedActionText: {
      fontSize: 11,
      fontWeight: "700",
    },
    feedContainer: {},
    notifCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 14,
      marginBottom: 8,
    },
    notifCardUnread: {
      backgroundColor: `${colors.accent.primary}08`,
      borderColor: `${colors.accent.primary}25`,
    },
    notifIconBg: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 10,
    },
    notifContent: {
      flex: 1,
    },
    notifTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.primary,
      marginBottom: 2,
    },
    notifDesc: {
      fontSize: 11,
      color: colors.text.muted,
      lineHeight: 15,
      marginBottom: 3,
    },
    notifTime: {
      fontSize: 10,
      color: colors.text.muted,
      fontWeight: "500",
    },
    notifDeleteBtn: {
      padding: 4,
    },
    unreadDot: {
      position: "absolute",
      top: 14,
      left: 14,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent.primary,
    },

    // Settings Card
    settingsCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 16,
      padding: 20,
      ...shadows.subtle,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18,
    },
    rowLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      marginRight: 16,
    },
    iconWrapper: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    rowTextWrapper: {
      marginLeft: 12,
      flex: 1,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
    },
    rowDesc: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 1,
      lineHeight: 15,
    },
    thresholdRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 48,
      marginBottom: 16,
      marginTop: -8,
      gap: 8,
    },
    thresholdLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    thresholdInput: {
      width: 70,
      height: 34,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.primary,
      paddingHorizontal: 10,
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
      textAlign: "center",
    },
    thresholdUnit: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: "500",
    },
    divider: {
      height: 1,
      backgroundColor: colors.bg.elevated,
      marginVertical: 16,
    },
    successAlert: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#ecfdf5",
      borderWidth: 1,
      borderColor: "#6ee7b7",
      padding: 12,
      borderRadius: 12,
      marginBottom: 16,
    },
    successText: {
      color: colors.accent.success,
      fontSize: 13,
      fontWeight: "600",
      marginLeft: 8,
      flex: 1,
    },
    saveButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent.primary,
      borderRadius: 12,
      paddingVertical: 14,
      marginTop: 8,
      gap: 8,
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      color: colors.text.inverse,
      fontWeight: "700",
      fontSize: 15,
    },
    buttonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },

    // Empty States
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 48,
    },
    emptyCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.bg.elevated,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 6,
    },
    emptyDesc: {
      fontSize: 13,
      color: colors.text.muted,
      textAlign: "center",
      paddingHorizontal: 32,
      lineHeight: 18,
    },

    // Loading
    loadingWrap: {
      alignItems: "center",
      paddingVertical: 40,
      gap: 12,
    },
    loadingText: {
      fontSize: 13,
      color: colors.text.muted,
    },
  });
};