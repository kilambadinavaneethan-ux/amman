import React, { useState, useMemo, useContext } from "react";
import { useTheme } from "../context/ThemeContext";
import { AlarmContext } from "../context/AlarmContext";
import { CustomerContext } from "../context/CustomerContext";
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
  Modal,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import ProtectedRoute from "../components/ProtectedRoute";
import BackButton from "../components/BackButton";

const ALARM_CATEGORIES = {
  general: { label: "General", icon: "alarm", color: "#3B82F6", bgColor: "#3B82F615" },
  stock: { label: "Stock Alert", icon: "inventory-2", color: "#EA580C", bgColor: "#EA580C15" },
  finance: { label: "Finance", icon: "payments", color: "#10B981", bgColor: "#10B98115" },
  worker: { label: "Worker", icon: "groups", color: "#06B6D4", bgColor: "#06B6D415" },
  due_collection: { label: "Due Collection", icon: "assignment-returned", color: "#D97706", bgColor: "#D9770615" },
};

const WEEKDAYS = [
  { label: "Su", value: 1, fullName: "Sunday" },
  { label: "Mo", value: 2, fullName: "Monday" },
  { label: "Tu", value: 3, fullName: "Tuesday" },
  { label: "We", value: 4, fullName: "Wednesday" },
  { label: "Th", value: 5, fullName: "Thursday" },
  { label: "Fr", value: 6, fullName: "Friday" },
  { label: "Sa", value: 7, fullName: "Saturday" },
];

function AlarmManagerScreen() {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();

  const {
    alarms,
    loading,
    permissionStatus,
    requestPermissions,
    addAlarm,
    updateAlarm,
    deleteAlarm,
    testAlarmNotification,
  } = useContext(AlarmContext);

  const { customers, updateCustomerDueDates } = useContext(CustomerContext);

  const [activeTab, setActiveTab] = useState("all"); // "all" | "active" | "inactive"
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("general");
  const [alarmType, setAlarmType] = useState("daily"); // "once" | "daily" | "weekly"
  const [dateStr, setDateStr] = useState(""); // YYYY-MM-DD
  const [hourStr, setHourStr] = useState("09");
  const [minuteStr, setMinuteStr] = useState("00");
  const [period, setPeriod] = useState("AM"); // "AM" | "PM"
  const [selectedWeekday, setSelectedWeekday] = useState(2); // Default Monday (2)

  // Customer search & select states
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Filter customers by search input
  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(query) ||
        (c.phone || "").includes(query)
    );
  }, [customers, searchQuery]);

  // Filter alarms
  const filteredAlarms = useMemo(() => {
    return alarms.filter((alarm) => {
      if (activeTab === "active") return alarm.isActive;
      if (activeTab === "inactive") return !alarm.isActive;
      return true;
    });
  }, [alarms, activeTab]);

  // Convert 24h to 12h for editing
  const parseTime = (time24) => {
    if (!time24 || !time24.includes(":")) return { h: "09", m: "00", p: "AM" };
    const [hStr, mStr] = time24.split(":");
    let h = parseInt(hStr, 10);
    let p = "AM";
    if (h >= 12) {
      p = "PM";
      if (h > 12) h -= 12;
    } else if (h === 0) {
      h = 12;
    }
    return {
      h: String(h).padStart(2, "0"),
      m: mStr,
      p,
    };
  };

  // Convert 12h parameters to 24h string
  const get24HourTime = (h, m, p) => {
    let hour = parseInt(h, 10) || 0;
    const min = String(parseInt(m, 10) || 0).padStart(2, "0");
    if (p === "PM" && hour !== 12) {
      hour += 12;
    } else if (p === "AM" && hour === 12) {
      hour = 0;
    }
    return `${String(hour).padStart(2, "0")}:${min}`;
  };

  const getTodayDateStr = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleOpenAddModal = () => {
    setEditingAlarm(null);
    setTitle("");
    setNotes("");
    setCategory("general");
    setAlarmType("daily");
    setDateStr(getTodayDateStr());
    setHourStr("09");
    setMinuteStr("00");
    setPeriod("AM");
    setSelectedWeekday(2); // Monday
    setSelectedCustomerId("");
    setSearchQuery("");
    setShowCustomerDropdown(false);
    setModalVisible(true);
  };

  const handleOpenEditModal = (alarm) => {
    setEditingAlarm(alarm);
    setTitle(alarm.title || "");
    setNotes(alarm.notes || "");
    setCategory(alarm.category || "general");
    setAlarmType(alarm.type || "daily");
    setDateStr(alarm.date || getTodayDateStr());
    setSelectedWeekday(alarm.weekday || 2);

    if (alarm.category === "due_collection" && alarm.customerId) {
      setSelectedCustomerId(alarm.customerId);
      const cust = customers.find((c) => c.id === alarm.customerId);
      setSearchQuery(cust ? cust.name : "");
    } else {
      setSelectedCustomerId("");
      setSearchQuery("");
    }
    setShowCustomerDropdown(false);

    const { h, m, p } = parseTime(alarm.time);
    setHourStr(h);
    setMinuteStr(m);
    setPeriod(p);

    setModalVisible(true);
  };

  // Preset Date handlers
  const setDatePreset = (daysOffset) => {
    const target = new Date();
    target.setDate(target.getDate() + daysOffset);
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(target.getDate()).padStart(2, "0");
    setDateStr(`${yyyy}-${mm}-${dd}`);
  };

  // Preset Time handlers
  const setTimePreset = (hStr, mStr, pStr) => {
    setHourStr(hStr);
    setMinuteStr(mStr);
    setPeriod(pStr);
  };

  // Increment / Decrement hours
  const adjustHour = (increment) => {
    let current = parseInt(hourStr, 10);
    if (isNaN(current)) current = 9;
    current = increment ? current + 1 : current - 1;
    if (current > 12) current = 1;
    if (current < 1) current = 12;
    setHourStr(String(current).padStart(2, "0"));
  };

  // Increment / Decrement minutes
  const adjustMinute = (increment) => {
    let current = parseInt(minuteStr, 10);
    if (isNaN(current)) current = 0;
    current = increment ? current + 5 : current - 5;
    if (current >= 60) current = 0;
    if (current < 0) current = 55;
    setMinuteStr(String(current).padStart(2, "0"));
  };

  // Form Submit
  const handleSaveAlarm = async () => {
    if (!title.trim()) {
      Alert.alert("Required Field", "Please enter a name for the alarm.");
      return;
    }

    if (category === "due_collection" && !selectedCustomerId) {
      Alert.alert("Required Field", "Please select a customer for the due collection reminder.");
      return;
    }

    if (alarmType === "once") {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateStr)) {
        Alert.alert("Invalid Date", "Please enter a valid date in YYYY-MM-DD format.");
        return;
      }
    }

    const time24 = get24HourTime(hourStr, minuteStr, period);
    const dueDateId = editingAlarm ? editingAlarm.dueDateId || `dd_${Date.now()}` : `dd_${Date.now()}`;

    const alarmData = {
      title: title.trim(),
      notes: notes.trim(),
      category,
      type: alarmType,
      time: time24,
      isActive: editingAlarm ? editingAlarm.isActive : true,
      ...(alarmType === "once" ? { date: dateStr } : {}),
      ...(alarmType === "weekly" ? { weekday: selectedWeekday } : {}),
      ...(category === "due_collection" ? { customerId: selectedCustomerId, dueDateId } : {}),
    };

    setSaving(true);
    try {
      if (editingAlarm) {
        await updateAlarm(editingAlarm.id, alarmData);
      } else {
        await addAlarm(alarmData);
      }

      // Synchronize write to Customer Profile dueDates list
      if (category === "due_collection" && selectedCustomerId) {
        const customer = customers.find((c) => c.id === selectedCustomerId);
        if (customer) {
          const customerDueDateEntry = {
            id: dueDateId,
            date: alarmType === "once" ? dateStr : getTodayDateStr(),
            notes: title.trim() + (notes.trim() ? ` - ${notes.trim()}` : ""),
            status: "Pending",
          };

          // Handle if customer changed on edit, or new alarm
          if (editingAlarm && editingAlarm.customerId && editingAlarm.customerId !== selectedCustomerId) {
            // Customer changed: remove from old customer
            const oldCustomer = customers.find((c) => c.id === editingAlarm.customerId);
            if (oldCustomer) {
              const cleanedDueDates = (oldCustomer.dueDates || []).filter((d) => d.id !== editingAlarm.dueDateId);
              await updateCustomerDueDates(editingAlarm.customerId, cleanedDueDates);
            }
            // Add to new customer
            const newDueDates = [...(customer.dueDates || []), customerDueDateEntry];
            await updateCustomerDueDates(selectedCustomerId, newDueDates);
          } else {
            // Same customer or new alarm
            const existingDueDates = customer.dueDates || [];
            const index = existingDueDates.findIndex((d) => d.id === dueDateId);
            let updatedDueDates;
            if (index > -1) {
              // Update existing
              updatedDueDates = [...existingDueDates];
              updatedDueDates[index] = {
                ...updatedDueDates[index],
                date: customerDueDateEntry.date,
                notes: customerDueDateEntry.notes,
              };
            } else {
              // Append new
              updatedDueDates = [...existingDueDates, customerDueDateEntry];
            }
            await updateCustomerDueDates(selectedCustomerId, updatedDueDates);
          }
        }
      } else if (editingAlarm && editingAlarm.category === "due_collection" && editingAlarm.customerId) {
        // If category changed FROM due_collection to something else, clear customer due date
        const oldCustomer = customers.find((c) => c.id === editingAlarm.customerId);
        if (oldCustomer) {
          const cleanedDueDates = (oldCustomer.dueDates || []).filter((d) => d.id !== editingAlarm.dueDateId);
          await updateCustomerDueDates(editingAlarm.customerId, cleanedDueDates);
        }
      }

      setModalVisible(false);
    } catch (e) {
      Alert.alert("Error saving alarm", e.message || "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  // Toggle alarm status active/inactive
  const handleToggleActive = async (alarm) => {
    try {
      await updateAlarm(alarm.id, { isActive: !alarm.isActive });
    } catch (e) {
      Alert.alert("Failed to toggle alarm", e.message);
    }
  };

  // Delete Alarm Dialog
  const handleDeleteAlarm = (alarm) => {
    Alert.alert("Delete Alarm", `Are you sure you want to remove "${alarm.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            // Synchronized Delete from Customer Profile dueDates
            if (alarm.category === "due_collection" && alarm.customerId && alarm.dueDateId) {
              const customer = customers.find((c) => c.id === alarm.customerId);
              if (customer) {
                const cleanedDueDates = (customer.dueDates || []).filter((d) => d.id !== alarm.dueDateId);
                await updateCustomerDueDates(alarm.customerId, cleanedDueDates);
              }
            }

            await deleteAlarm(alarm.id);
          } catch (e) {
            Alert.alert("Error deleting alarm", e.message);
          }
        },
      },
    ]);
  };

  // Test notification trigger helper
  const handleTestNotification = async (alarm) => {
    const success = await testAlarmNotification(alarm);
    if (success) {
      Alert.alert("Test Notification Sent", "A verification notification will trigger in 2 seconds.");
    } else {
      Alert.alert("Notification Error", "Please ensure notifications are enabled on your device.");
    }
  };

  // Helper text for alarm frequency description
  const getFrequencyLabel = (alarm) => {
    if (alarm.type === "once") {
      return `Once on ${alarm.date}`;
    }
    if (alarm.type === "daily") {
      return "Daily";
    }
    if (alarm.type === "weekly") {
      const day = WEEKDAYS.find((d) => d.value === alarm.weekday);
      return `Weekly (${day ? day.fullName : "Mon"})`;
    }
    return "";
  };

  // Format 24h to 12h display
  const formatTimeDisplay = (time24) => {
    const { h, m, p } = parseTime(time24);
    return `${h}:${m} ${p}`;
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Back navigation & Title */}
      <View style={styles.header}>
        <BackButton label="Settings" onPress={() => router.push("/settings")} style={{ marginBottom: 12 }} />
        <View style={styles.headerTitleRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.title}>Alarm Manager</Text>
            <Text style={styles.subtitle}>Configure reminders, alarms & auto-alerts</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.pressedEffect]}
            onPress={handleOpenAddModal}
          >
            <MaterialIcons name="add" size={20} color={colors.text.inverse} />
            <Text style={styles.addButtonText}>Add Alarm</Text>
          </Pressable>
        </View>
      </View>

      {/* Permission alert card */}
      {Platform.OS !== "web" && permissionStatus !== "granted" && permissionStatus !== "unsupported" && (
        <View style={styles.permissionCard}>
          <View style={styles.permissionLeft}>
            <MaterialIcons name="notifications-active" size={28} color={colors.accent.warning} />
            <View style={styles.permissionTextContainer}>
              <Text style={styles.permissionTitle}>Notifications Disabled</Text>
              <Text style={styles.permissionDesc}>
                Turn on notification permissions to receive scheduled business alarms.
              </Text>
            </View>
          </View>
          <Pressable style={styles.permissionBtn} onPress={requestPermissions}>
            <Text style={styles.permissionBtnText}>Enable</Text>
          </Pressable>
        </View>
      )}

      {/* Tab controls */}
      <View style={styles.tabRow}>
        {["all", "active", "inactive"].map((tab) => {
          const isActive = activeTab === tab;
          return (
            <Pressable
              key={tab}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                  {tab === "all"
                    ? alarms.length
                    : tab === "active"
                    ? alarms.filter((a) => a.isActive).length
                    : alarms.filter((a) => !a.isActive).length}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Alarms List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.loadingText}>Syncing alarms database...</Text>
        </View>
      ) : filteredAlarms.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyCircle}>
            <MaterialIcons name="alarm-off" size={42} color={colors.text.muted} />
          </View>
          <Text style={styles.emptyTitle}>No Alarms Found</Text>
          <Text style={styles.emptyDesc}>
            {activeTab === "all"
              ? "Get started by scheduling your first reminder to alert you automatically."
              : `You have no ${activeTab} alarms right now.`}
          </Text>
          {activeTab === "all" && (
            <Pressable style={styles.emptyActionBtn} onPress={handleOpenAddModal}>
              <Text style={styles.emptyActionBtnText}>Create Alarm</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.alarmsList}>
          {filteredAlarms.map((alarm, index) => {
            const cat = ALARM_CATEGORIES[alarm.category || "general"];
            return (
              <Animated.View
                key={alarm.id}
                entering={FadeInDown.delay(index * 60).duration(300).springify().damping(18)}
              >
                <View style={[styles.alarmCard, !alarm.isActive && styles.alarmCardInactive]}>
                  {/* Header line containing Category Tag and Toggle Switch */}
                  <View style={styles.cardHeader}>
                    <View style={[styles.categoryTag, { backgroundColor: cat.bgColor }]}>
                      <MaterialIcons name={cat.icon} size={14} color={cat.color} />
                      <Text style={[styles.categoryTagText, { color: cat.color }]}>
                        {cat.label}
                      </Text>
                    </View>
                    <Switch
                      value={alarm.isActive}
                      onValueChange={() => handleToggleActive(alarm)}
                      trackColor={{ false: colors.border.medium, true: `${colors.accent.primary}40` }}
                      thumbColor={alarm.isActive ? colors.accent.primary : colors.text.muted}
                    />
                  </View>

                  {/* Main alarm time */}
                  <View style={styles.timeSection}>
                    <Text style={[styles.timeText, !alarm.isActive && styles.mutedText]}>
                      {formatTimeDisplay(alarm.time)}
                    </Text>
                    <Text style={styles.frequencyText}>{getFrequencyLabel(alarm)}</Text>
                  </View>

                  {/* Alarm Details */}
                  <View style={styles.detailsSection}>
                    <Text style={[styles.alarmTitle, !alarm.isActive && styles.mutedText]}>
                      {alarm.title}
                    </Text>
                    {alarm.notes ? <Text style={styles.alarmNotes}>{alarm.notes}</Text> : null}
                  </View>

                  {/* Actions row */}
                  <View style={styles.cardActions}>
                    <Pressable
                      style={({ pressed }) => [styles.actionBtn, pressed && styles.pressedEffect]}
                      onPress={() => handleOpenEditModal(alarm)}
                    >
                      <MaterialIcons name="edit" size={18} color={colors.text.secondary} />
                      <Text style={styles.actionBtnText}>Edit</Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [styles.actionBtn, pressed && styles.pressedEffect]}
                      onPress={() => handleTestNotification(alarm)}
                    >
                      <MaterialIcons name="play-circle-outline" size={18} color={colors.accent.info} />
                      <Text style={[styles.actionBtnText, { color: colors.accent.info }]}>Test</Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [styles.actionBtn, pressed && styles.pressedEffect]}
                      onPress={() => handleDeleteAlarm(alarm)}
                    >
                      <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                      <Text style={[styles.actionBtnText, { color: colors.accent.danger }]}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            );
          })}
        </View>
      )}

      {/* Add / Edit Sheet Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingAlarm ? "Edit Business Alarm" : "Schedule New Alarm"}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.closeBtn, pressed && styles.pressedEffect]}
                onPress={() => setModalVisible(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Category selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Alert Category</Text>
                <View style={styles.categoryGrid}>
                  {Object.keys(ALARM_CATEGORIES).map((key) => {
                    const selected = category === key;
                    const catObj = ALARM_CATEGORIES[key];
                    return (
                      <Pressable
                        key={key}
                        style={[
                          styles.catSelectBtn,
                          selected && {
                            borderColor: catObj.color,
                            backgroundColor: catObj.bgColor,
                          },
                        ]}
                        onPress={() => {
                          setCategory(key);
                          if (key !== "due_collection") {
                            setSelectedCustomerId("");
                            setSearchQuery("");
                          }
                        }}
                      >
                        <MaterialIcons
                          name={catObj.icon}
                          size={18}
                          color={selected ? catObj.color : colors.text.secondary}
                        />
                        <Text
                          style={[
                            styles.catSelectText,
                            { color: selected ? catObj.color : colors.text.secondary },
                          ]}
                        >
                          {catObj.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Customer search & select (ONLY visible for due_collection category) */}
              {category === "due_collection" && (
                <View style={[styles.inputGroup, { zIndex: 100 }]}>
                  <Text style={styles.inputLabel}>Select Customer *</Text>
                  <View style={styles.dropdownContainer}>
                    <View style={styles.searchRow}>
                      <TextInput
                        style={[styles.textInput, { flex: 1 }]}
                        value={searchQuery}
                        onChangeText={(v) => {
                          setSearchQuery(v);
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        placeholder="Type customer name or number..."
                        placeholderTextColor={colors.text.muted}
                      />
                      {searchQuery ? (
                        <Pressable
                          style={styles.clearSearchBtn}
                          onPress={() => {
                            setSearchQuery("");
                            setSelectedCustomerId("");
                            setShowCustomerDropdown(true);
                          }}
                        >
                          <MaterialIcons name="cancel" size={18} color={colors.text.muted} />
                        </Pressable>
                      ) : null}
                    </View>

                    {showCustomerDropdown && (
                      <View style={styles.dropdownListContainer}>
                        <ScrollView
                          style={styles.dropdownList}
                          nestedScrollEnabled={true}
                          keyboardShouldPersistTaps="handled"
                        >
                          {filteredCustomers.length === 0 ? (
                            <View style={styles.dropdownEmpty}>
                              <Text style={styles.dropdownEmptyText}>No customers found</Text>
                            </View>
                          ) : (
                            filteredCustomers.map((c) => (
                              <Pressable
                                key={c.id}
                                style={styles.dropdownItem}
                                onPress={() => {
                                  setSelectedCustomerId(c.id);
                                  setSearchQuery(c.name);
                                  setShowCustomerDropdown(false);
                                  // Prefill details
                                  const bal = Number(c.balance || 0);
                                  const balText = bal > 0 ? `₹${bal}` : "due";
                                  setTitle(`Collect ${balText} from ${c.name}`);
                                  const phText = c.phone ? ` | Phone: ${c.phone}` : "";
                                  setNotes(`Customer: ${c.name}${phText} | Pending Balance: ₹${bal}`);
                                }}
                              >
                                <View style={styles.dropdownItemLeft}>
                                  <Text style={styles.dropdownItemName}>{c.name}</Text>
                                  {c.phone ? <Text style={styles.dropdownItemPhone}>{c.phone}</Text> : null}
                                </View>
                                <Text style={[styles.dropdownItemBalance, Number(c.balance) > 0 && { color: colors.accent.danger }]}>
                                  ₹{Number(c.balance || 0).toLocaleString("en-IN")}
                                </Text>
                              </Pressable>
                            ))
                          )}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Alarm Title input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Alarm Title *</Text>
                <TextInput
                  style={styles.textInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Low stock count, Payment collection"
                  placeholderTextColor={colors.text.muted}
                />
              </View>

              {/* Alarm Frequency Type */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Trigger Frequency</Text>
                <View style={styles.freqRow}>
                  {["once", "daily", "weekly"].map((t) => {
                    const selected = alarmType === t;
                    return (
                      <Pressable
                        key={t}
                        style={[styles.freqBtn, selected && styles.freqBtnActive]}
                        onPress={() => setAlarmType(t)}
                      >
                        <Text style={[styles.freqBtnText, selected && styles.freqBtnTextActive]}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Date Input for Once Trigger */}
              {alarmType === "once" && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Date (YYYY-MM-DD) *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={dateStr}
                    onChangeText={setDateStr}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.text.muted}
                  />
                  {/* Presets */}
                  <View style={styles.presetRow}>
                    <Pressable style={styles.presetBtn} onPress={() => setDatePreset(0)}>
                      <Text style={styles.presetBtnText}>Today</Text>
                    </Pressable>
                    <Pressable style={styles.presetBtn} onPress={() => setDatePreset(1)}>
                      <Text style={styles.presetBtnText}>Tomorrow</Text>
                    </Pressable>
                    <Pressable style={styles.presetBtn} onPress={() => setDatePreset(3)}>
                      <Text style={styles.presetBtnText}>In 3 Days</Text>
                    </Pressable>
                    <Pressable style={styles.presetBtn} onPress={() => setDatePreset(7)}>
                      <Text style={styles.presetBtnText}>In 1 Week</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Day Selector for Weekly Trigger */}
              {alarmType === "weekly" && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Select Day of the Week</Text>
                  <View style={styles.daysContainer}>
                    {WEEKDAYS.map((d) => {
                      const selected = selectedWeekday === d.value;
                      return (
                        <Pressable
                          key={d.value}
                          style={[styles.dayCircleBtn, selected && styles.dayCircleBtnActive]}
                          onPress={() => setSelectedWeekday(d.value)}
                        >
                          <Text style={[styles.dayCircleText, selected && styles.dayCircleTextActive]}>
                            {d.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Custom time picker */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Time Configuration</Text>
                <View style={styles.timePickerContainer}>
                  {/* Hour Selection */}
                  <View style={styles.timeValWrap}>
                    <Pressable style={styles.timeArrowBtn} onPress={() => adjustHour(true)}>
                      <MaterialIcons name="keyboard-arrow-up" size={24} color={colors.text.secondary} />
                    </Pressable>
                    <TextInput
                      style={styles.timeValInput}
                      value={hourStr}
                      onChangeText={(v) => {
                        const numeric = v.replace(/[^0-9]/g, "");
                        const hourVal = parseInt(numeric, 10);
                        if (numeric === "" || (hourVal >= 1 && hourVal <= 12)) {
                          setHourStr(numeric.substring(0, 2));
                        }
                      }}
                      keyboardType="numeric"
                      maxLength={2}
                    />
                    <Pressable style={styles.timeArrowBtn} onPress={() => adjustHour(false)}>
                      <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.text.secondary} />
                    </Pressable>
                  </View>

                  <Text style={styles.timeColon}>:</Text>

                  {/* Minute Selection */}
                  <View style={styles.timeValWrap}>
                    <Pressable style={styles.timeArrowBtn} onPress={() => adjustMinute(true)}>
                      <MaterialIcons name="keyboard-arrow-up" size={24} color={colors.text.secondary} />
                    </Pressable>
                    <TextInput
                      style={styles.timeValInput}
                      value={minuteStr}
                      onChangeText={(v) => {
                        const numeric = v.replace(/[^0-9]/g, "");
                        const minVal = parseInt(numeric, 10);
                        if (numeric === "" || (minVal >= 0 && minVal <= 59)) {
                          setMinuteStr(numeric.substring(0, 2));
                        }
                      }}
                      keyboardType="numeric"
                      maxLength={2}
                    />
                    <Pressable style={styles.timeArrowBtn} onPress={() => adjustMinute(false)}>
                      <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.text.secondary} />
                    </Pressable>
                  </View>

                  {/* AM/PM Switcher */}
                  <View style={styles.ampmContainer}>
                    <Pressable
                      style={[styles.ampmBtn, period === "AM" && styles.ampmBtnActive]}
                      onPress={() => setPeriod("AM")}
                    >
                      <Text style={[styles.ampmText, period === "AM" && styles.ampmTextActive]}>AM</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.ampmBtn, period === "PM" && styles.ampmBtnActive]}
                      onPress={() => setPeriod("PM")}
                    >
                      <Text style={[styles.ampmText, period === "PM" && styles.ampmTextActive]}>PM</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Preset Times */}
                <View style={styles.presetRow}>
                  <Pressable style={styles.presetBtn} onPress={() => setTimePreset("09", "00", "AM")}>
                    <Text style={styles.presetBtnText}>9:00 AM</Text>
                  </Pressable>
                  <Pressable style={styles.presetBtn} onPress={() => setTimePreset("12", "00", "PM")}>
                    <Text style={styles.presetBtnText}>12:00 PM</Text>
                  </Pressable>
                  <Pressable style={styles.presetBtn} onPress={() => setTimePreset("03", "00", "PM")}>
                    <Text style={styles.presetBtnText}>3:00 PM</Text>
                  </Pressable>
                  <Pressable style={styles.presetBtn} onPress={() => setTimePreset("06", "00", "PM")}>
                    <Text style={styles.presetBtnText}>6:00 PM</Text>
                  </Pressable>
                  <Pressable style={styles.presetBtn} onPress={() => setTimePreset("09", "00", "PM")}>
                    <Text style={styles.presetBtnText}>9:00 PM</Text>
                  </Pressable>
                </View>
              </View>

              {/* Notes Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Additional Notes</Text>
                <TextInput
                  style={[styles.textInput, styles.notesInput]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Check finished goods inventory levels before stock run."
                  placeholderTextColor={colors.text.muted}
                  multiline={true}
                  numberOfLines={3}
                />
              </View>

              {/* Form buttons */}
              <View style={styles.modalButtons}>
                <Pressable
                  style={[styles.formBtn, styles.cancelBtn]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[styles.formBtn, styles.saveBtn, saving && { opacity: 0.7 }]}
                  onPress={handleSaveAlarm}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.text.inverse} />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Alarm</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export default function AlarmRoute() {
  return (
    <ProtectedRoute>
      <AlarmManagerScreen />
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    container: {
      padding: spacing.lg,
      backgroundColor: colors.bg.primary,
      flexGrow: 1,
      paddingBottom: 60,
    },
    header: {
      marginBottom: spacing.lg,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.md,
      gap: spacing.xs,
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
      fontSize: 26,
      fontWeight: "800",
      color: colors.text.primary,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 2,
    },
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accent.primary,
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: 14,
      gap: 6,
      ...shadows.subtle,
    },
    addButtonText: {
      color: colors.text.inverse,
      fontWeight: "700",
      fontSize: 13,
    },
    pressedEffect: {
      opacity: 0.8,
      transform: [{ scale: 0.98 }],
    },

    // Permission Card
    permissionCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "#fffbeb",
      borderWidth: 1,
      borderColor: "#fef3c7",
      padding: spacing.md,
      borderRadius: radius.md,
      marginBottom: spacing.lg,
      ...shadows.subtle,
    },
    permissionLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      marginRight: spacing.sm,
      gap: spacing.sm,
    },
    permissionTextContainer: {
      flex: 1,
    },
    permissionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: "#b45309",
    },
    permissionDesc: {
      fontSize: 11,
      color: "#d97706",
      marginTop: 2,
      lineHeight: 14,
    },
    permissionBtn: {
      backgroundColor: "#d97706",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
    },
    permissionBtnText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "700",
    },

    // Tabs
    tabRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    tabBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.card,
      ...shadows.subtle,
    },
    tabBtnActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    tabBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    tabBtnTextActive: {
      color: colors.text.inverse,
    },
    tabBadge: {
      backgroundColor: colors.bg.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    tabBadgeActive: {
      backgroundColor: "rgba(255,255,255,0.25)",
    },
    tabBadgeText: {
      fontSize: 10,
      fontWeight: "800",
      color: colors.text.secondary,
    },
    tabBadgeTextActive: {
      color: colors.text.inverse,
    },

    // Loading & Empty States
    loadingWrap: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 60,
      gap: spacing.md,
    },
    loadingText: {
      fontSize: 14,
      color: colors.text.muted,
    },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 60,
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: spacing.xl,
      ...shadows.card,
    },
    emptyCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.bg.primary,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: spacing.md,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: spacing.xs,
    },
    emptyDesc: {
      fontSize: 13,
      color: colors.text.muted,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: spacing.lg,
    },
    emptyActionBtn: {
      backgroundColor: colors.accent.primary,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: radius.md,
      ...shadows.subtle,
    },
    emptyActionBtnText: {
      color: colors.text.inverse,
      fontWeight: "700",
      fontSize: 14,
    },

    // Alarms list
    alarmsList: {
      gap: spacing.md,
    },
    alarmCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.lg,
      ...shadows.card,
    },
    alarmCardInactive: {
      opacity: 0.65,
      backgroundColor: colors.bg.primary,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    categoryTag: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.sm,
      gap: 4,
    },
    categoryTagText: {
      fontSize: 11,
      fontWeight: "700",
    },
    timeSection: {
      marginBottom: spacing.md,
    },
    timeText: {
      fontSize: 32,
      fontWeight: "800",
      color: colors.text.primary,
      letterSpacing: -0.5,
    },
    mutedText: {
      color: colors.text.muted,
    },
    frequencyText: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: "600",
      marginTop: 2,
    },
    detailsSection: {
      marginBottom: spacing.md,
    },
    alarmTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 4,
    },
    alarmNotes: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    cardActions: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      paddingTop: spacing.md,
      justifyContent: "space-between",
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
    },
    actionBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: colors.bg.card,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      maxHeight: "85%",
      padding: spacing.lg,
      ...shadows.elevated,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      marginBottom: spacing.md,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
    },
    closeBtn: {
      padding: spacing.xs,
    },
    modalForm: {
      marginBottom: spacing.lg,
    },
    inputGroup: {
      marginBottom: spacing.lg,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
    textInput: {
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text.primary,
    },
    notesInput: {
      height: 72,
      textAlignVertical: "top",
    },

    // Category Selector
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    catSelectBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.card,
    },
    catSelectText: {
      fontSize: 12,
      fontWeight: "700",
    },

    // Customer Selector Search Dropdown
    dropdownContainer: {
      position: "relative",
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      position: "relative",
    },
    clearSearchBtn: {
      position: "absolute",
      right: spacing.md,
    },
    dropdownListContainer: {
      position: "absolute",
      top: 52,
      left: 0,
      right: 0,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: radius.md,
      maxHeight: 180,
      zIndex: 100,
      ...shadows.elevated,
      overflow: "hidden",
    },
    dropdownList: {
      maxHeight: 180,
    },
    dropdownItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    dropdownItemLeft: {
      flex: 1,
    },
    dropdownItemName: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    dropdownItemPhone: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    dropdownItemBalance: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    dropdownEmpty: {
      padding: spacing.md,
      alignItems: "center",
    },
    dropdownEmptyText: {
      fontSize: 13,
      color: colors.text.muted,
    },

    // Frequency selectors
    freqRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    freqBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.primary,
      alignItems: "center",
    },
    freqBtnActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    freqBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    freqBtnTextActive: {
      color: colors.text.inverse,
    },

    // Weekdays
    daysContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    dayCircleBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.bg.primary,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    dayCircleBtnActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    dayCircleText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    dayCircleTextActive: {
      color: colors.text.inverse,
    },

    // Presets
    presetRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    presetBtn: {
      backgroundColor: colors.bg.primary,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    presetBtnText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },

    // Custom Time Picker
    timePickerContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg.primary,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    timeValWrap: {
      alignItems: "center",
      width: 60,
    },
    timeArrowBtn: {
      padding: spacing.xs,
    },
    timeValInput: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.sm,
      width: 50,
      height: 44,
      fontSize: 20,
      fontWeight: "800",
      textAlign: "center",
      color: colors.text.primary,
    },
    timeColon: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.text.secondary,
      marginHorizontal: spacing.md,
    },
    ampmContainer: {
      marginLeft: spacing.xl,
      gap: spacing.sm,
    },
    ampmBtn: {
      width: 50,
      height: 32,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.card,
      alignItems: "center",
      justifyContent: "center",
    },
    ampmBtnActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    ampmText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    ampmTextActive: {
      color: colors.text.inverse,
    },

    // Form buttons
    modalButtons: {
      flexDirection: "row",
      gap: spacing.md,
      marginTop: spacing.lg,
      paddingBottom: 20,
    },
    formBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      ...shadows.subtle,
    },
    cancelBtn: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    cancelBtnText: {
      color: colors.text.secondary,
      fontSize: 14,
      fontWeight: "700",
    },
    saveBtn: {
      backgroundColor: colors.accent.primary,
    },
    saveBtnText: {
      color: colors.text.inverse,
      fontSize: 14,
      fontWeight: "700",
    },
  });
};
