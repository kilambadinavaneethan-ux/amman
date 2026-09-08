import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    query,
    setDoc,
    where,
} from "firebase/firestore";
import { getDocsOfflineSafe } from "../../../src/utils/offlineHelpers";
import { useContext, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";
import { WorkerContext } from "../../context/WorkerContext";
import { db, normalizeDateValue } from "../../../src/config/firebase";

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_TIMES = ["08:00 AM", "09:00 AM", "10:00 AM"];
const ATTENDANCE_STATUSES = [
  { label: "Present", value: "present" },
  { label: "Absent", value: "absent" },
  { label: "Holiday", value: "holiday" },
  { label: "Half Day", value: "half-day" },
];

function AutomationManagementScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { workers, bulkLogAttendance, todayAttendance } =
    useContext(WorkerContext);

  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);

  // Existing automations states
  const [autoDeductBags, setAutoDeductBags] = useState(false);
  const [dailySummary, setDailySummary] = useState(false);
  const [dailySummaryTime, setDailySummaryTime] = useState("20:00");
  const [lowStock, setLowStock] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [overdueReminders, setOverdueReminders] = useState(false);
  const [overdueDays, setOverdueDays] = useState("7");

  // Automatic Attendance states
  const [autoAttendance, setAutoAttendance] = useState(false);
  const [scheduleType, setScheduleType] = useState("repeat"); // "one-time" | "repeat"
  const [oneTimeDate, setOneTimeDate] = useState("");
  const [repeatDays, setRepeatDays] = useState([1, 2, 3, 4, 5]); // Mon-Fri
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [triggerTime, setTriggerTime] = useState("09:00 AM");
  const [isCustomTime, setIsCustomTime] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState("09:00 AM");
  const [defaultStatus, setDefaultStatus] = useState("present");
  const [saveAttendance, setSaveAttendance] = useState(true);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [activeProduct, setActiveProduct] = useState(null);
  const [defaultProductionQty, setDefaultProductionQty] = useState(1);

  // Collapsible UI states
  const [attendanceCollapsed, setAttendanceCollapsed] = useState(true);
  const [workersCollapsed, setWorkersCollapsed] = useState(true);

  // Simulation modals
  const [simulationModalVisible, setSimulationModalVisible] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // Custom Calendar modal
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState(""); // "one-time" | "start" | "end"

  // Load automation settings
  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, "automations", "default_user_settings");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setAutoDeductBags(!!data.autoDeductBagsEnabled);
          setDailySummary(!!data.dailySummaryEnabled);
          setDailySummaryTime(data.dailySummaryTime || "20:00");
          setLowStock(!!data.lowStockEnabled);
          setLowStockThreshold(String(data.lowStockThreshold || "5"));
          setOverdueReminders(!!data.overdueRemindersEnabled);
          setOverdueDays(String(data.overdueDays || "7"));
        } else {
          // Initialize defaults
          await setDoc(docRef, {
            autoDeductBagsEnabled: false,
            dailySummaryEnabled: false,
            dailySummaryTime: "20:00",
            lowStockEnabled: false,
            lowStockThreshold: 5,
            overdueRemindersEnabled: false,
            overdueDays: 7,
            userId: "default_user",
          });
        }

        // Load attendance scheduler configs
        const schedRef = doc(db, "automations", "attendance_scheduler");
        const schedSnap = await getDoc(schedRef);
        if (schedSnap.exists()) {
          const data = schedSnap.data();
          setAutoAttendance(!!data.enabled);
          setScheduleType(data.scheduleType || "repeat");
          setOneTimeDate(data.oneTimeDate || getTodayDateString());
          setRepeatDays(data.repeatDays || [1, 2, 3, 4, 5]);
          setStartDate(data.startDate || getTodayDateString());
          setEndDate(data.endDate || "");
          setTriggerTime(data.triggerTime || "09:00 AM");
          if (!DEFAULT_TIMES.includes(data.triggerTime || "09:00 AM")) {
            setIsCustomTime(true);
            setCustomTimeInput(data.triggerTime || "09:00 AM");
          }
          setDefaultStatus(data.defaultStatus || "present");
          setSaveAttendance(
            data.saveAttendance !== undefined ? !!data.saveAttendance : true,
          );
          setSelectedWorkers(data.workerIds || []);
          setDefaultProductionQty(
            data.defaultProductionQty !== undefined
              ? Number(data.defaultProductionQty)
              : 1,
          );
        } else {
          const defaultOneTime = getTodayDateString();
          await setDoc(schedRef, {
            enabled: false,
            scheduleType: "repeat",
            oneTimeDate: defaultOneTime,
            repeatDays: [1, 2, 3, 4, 5],
            startDate: defaultOneTime,
            endDate: "",
            triggerTime: "09:00 AM",
            defaultStatus: "present",
            saveAttendance: true,
            workerIds: workers.map((w) => w.id),
            userId: "default_user",
            defaultProductionQty: 1,
          });
          setOneTimeDate(defaultOneTime);
          setStartDate(defaultOneTime);
          setSelectedWorkers(workers.map((w) => w.id));
          setDefaultProductionQty(1);
        }

        // Fetch active finished product
        const itemsQ = query(
          collection(db, "items"),
          where("userId", "==", "default_user"),
        );
        const itemsSnap = await getDocsOfflineSafe(itemsQ);
        const activeProdDoc = itemsSnap.docs.find((d) => {
          const data = d.data();
          return (
            data.itemType !== "raw_material" &&
            (data.status || "Active") === "Active"
          );
        });
        if (activeProdDoc) {
          setActiveProduct({ id: activeProdDoc.id, ...activeProdDoc.data() });
        }
      } catch (e) {
        console.error("Failed to load automations settings", e);
      } finally {
        setLoading(false);
      }
    };

    const fetchHistoryLogs = async () => {
      try {
        const q = query(
          collection(db, "automation_attendance_logs"),
          where("userId", "==", "default_user"),
        );
        const snap = await getDocsOfflineSafe(q);
        const items = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: normalizeDateValue(doc.data().createdAt),
        }));
        items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const uniqueItems = Array.from(
          items
            .reduce((map, item) => {
              const key =
                item.id ||
                `${item.date}-${item.time}-${item.createdAt.getTime()}`;
              if (!map.has(key)) map.set(key, item);
              return map;
            }, new Map())
            .values(),
        );
        setLogs(uniqueItems.slice(0, 10)); // Display recent 10 logs
      } catch (error) {
        console.error("Failed to load logs history", error);
      }
    };

    fetchSettings();
    fetchHistoryLogs();
  }, [workers]);

  const getTodayDateString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleSaveSettings = async (updates) => {
    try {
      const docRef = doc(db, "automations", "default_user_settings");
      await setDoc(docRef, updates, { merge: true });
    } catch (e) {
      console.error("Failed to save settings", e);
    }
  };

  const handleSaveSchedulerSettings = async (updates) => {
    try {
      const docRef = doc(db, "automations", "attendance_scheduler");
      await setDoc(docRef, updates, { merge: true });
    } catch (e) {
      console.error("Failed to save scheduler config", e);
    }
  };

  const handleSaveAllSchedulerSettings = async () => {
    try {
      const docRef = doc(db, "automations", "attendance_scheduler");
      await setDoc(
        docRef,
        {
          enabled: autoAttendance,
          scheduleType,
          oneTimeDate,
          repeatDays,
          startDate,
          endDate,
          triggerTime,
          defaultStatus,
          saveAttendance,
          workerIds: selectedWorkers,
          defaultProductionQty,
          userId: "default_user",
        },
        { merge: true },
      );
      alert("Automatic Attendance configurations saved successfully.");
    } catch (e) {
      console.error("Failed to save scheduler config", e);
      alert("Failed to save configurations.");
    }
  };

  const handleStartStopScheduler = async () => {
    const nextState = !autoAttendance;
    try {
      const docRef = doc(db, "automations", "attendance_scheduler");
      await setDoc(
        docRef,
        {
          enabled: nextState,
          scheduleType,
          oneTimeDate,
          repeatDays,
          startDate,
          endDate,
          triggerTime,
          defaultStatus,
          saveAttendance,
          workerIds: selectedWorkers,
          defaultProductionQty,
          userId: "default_user",
        },
        { merge: true },
      );
      setAutoAttendance(nextState);
      alert(
        nextState
          ? "Automatic Attendance Scheduler Started Successfully!"
          : "Automatic Attendance Scheduler Stopped.",
      );
    } catch (e) {
      console.error("Failed to start/stop scheduler", e);
      alert("Failed to update scheduler state.");
    }
  };

  const handleToggleAutoDeductBags = (val) => {
    setAutoDeductBags(val);
    handleSaveSettings({ autoDeductBagsEnabled: val });
  };

  const handleToggleDailySummary = (val) => {
    setDailySummary(val);
    handleSaveSettings({ dailySummaryEnabled: val });
  };

  const handleToggleLowStock = (val) => {
    setLowStock(val);
    handleSaveSettings({ lowStockEnabled: val });
  };

  const handleToggleOverdue = (val) => {
    setOverdueReminders(val);
    handleSaveSettings({ overdueRemindersEnabled: val });
  };

  const handleSaveTextOption = async (key, val) => {
    let parsed = val;
    if (key === "lowStockThreshold" || key === "overdueDays") {
      parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < 0) {
        alert("Please enter a valid positive number.");
        return;
      }
    }
    const updates = { [key]: parsed };
    await handleSaveSettings(updates);
  };

  // Auto Attendance Handlers
  const handleToggleAutoAttendance = (val) => {
    setAutoAttendance(val);
    handleSaveSchedulerSettings({ enabled: val });
    if (val) setAttendanceCollapsed(false);
  };

  const handleDayToggle = (dayIndex) => {
    let updated;
    if (repeatDays.includes(dayIndex)) {
      updated = repeatDays.filter((d) => d !== dayIndex);
    } else {
      updated = [...repeatDays, dayIndex].sort();
    }
    setRepeatDays(updated);
  };

  const handleWorkerToggle = (workerId) => {
    let updated;
    if (selectedWorkers.includes(workerId)) {
      updated = selectedWorkers.filter((id) => id !== workerId);
    } else {
      updated = [...selectedWorkers, workerId];
    }
    setSelectedWorkers(updated);
  };

  const handleSelectAllWorkers = () => {
    const allIds = workers.map((w) => w.id);
    setSelectedWorkers(allIds);
  };

  const handleDeselectAllWorkers = () => {
    setSelectedWorkers([]);
  };

  const handleTimeSelect = (timeStr) => {
    setIsCustomTime(false);
    setTriggerTime(timeStr);
  };

  const handleCustomTimeSubmit = () => {
    setTriggerTime(customTimeInput);
  };

  // Run Test Simulation
  const handleRunSimulation = async () => {
    if (selectedWorkers.length === 0) {
      alert("Please select at least one worker for automatic attendance.");
      return;
    }

    setSimulating(true);
    setSimulationModalVisible(true);
    setSimulationResult(null);

    // Auto-save settings in database before running the simulation to stay in sync
    try {
      const docRef = doc(db, "automations", "attendance_scheduler");
      await setDoc(
        docRef,
        {
          enabled: autoAttendance,
          scheduleType,
          oneTimeDate,
          repeatDays,
          startDate,
          endDate,
          triggerTime,
          defaultStatus,
          saveAttendance,
          workerIds: selectedWorkers,
          defaultProductionQty,
          userId: "default_user",
        },
        { merge: true },
      );
    } catch (e) {
      console.error("Failed to auto-save scheduler configs before run", e);
    }

    // Short timeout to show visual progress/loader micro-animation
    setTimeout(async () => {
      try {
        let workersLogged = 0;
        let workersSkipped = 0;
        const entries = [];

        for (const workerId of selectedWorkers) {
          const workerObj = workers.find((w) => w.id === workerId);
          if (!workerObj) continue;

          // Check if today's attendance doc already exists for this worker
          const alreadyLogged = todayAttendance.find(
            (a) => a.workerId === workerId,
          );
          if (alreadyLogged) {
            workersSkipped++;
            continue;
          }

          entries.push({
            workerId,
            status: defaultStatus,
            overtimeHours: 0,
            piecesProduced:
              defaultStatus === "present"
                ? defaultProductionQty
                : defaultStatus === "half-day"
                  ? Number((defaultProductionQty / 2).toFixed(2))
                  : 0,
            notes: "Created automatically by Attendance Scheduler",
            workerType: workerObj.workerType || "regular",
            createdAutomatically: true,
          });
          workersLogged++;
        }

        // Call bulk log context method if saveAttendance is enabled and there are records to save
        if (saveAttendance && entries.length > 0) {
          await bulkLogAttendance(entries);
        }

        // Add history log in Firestore
        const logData = {
          userId: "default_user",
          date: getTodayDateString(),
          time: triggerTime,
          workerCount: workersLogged,
          skippedCount: workersSkipped,
          defaultStatus: defaultStatus,
          statusText: saveAttendance ? "Completed" : "Draft Saved",
          createdAt: new Date(),
        };

        const docRef = await addDoc(
          collection(db, "automation_attendance_logs"),
          logData,
        );

        // Add locally to list
        const localLog = { id: docRef.id, ...logData, createdAt: new Date() };
        setLogs((prev) => {
          const nextLogs = [localLog, ...prev];
          return Array.from(
            nextLogs
              .reduce((map, item) => {
                const key =
                  item.id ||
                  `${item.date}-${item.time}-${item.createdAt.getTime()}`;
                if (!map.has(key)) map.set(key, item);
                return map;
              }, new Map())
              .values(),
          );
        });

        setSimulationResult({
          logged: workersLogged,
          skipped: workersSkipped,
          status: saveAttendance ? "Completed" : "Draft Mode (Not Saved)",
        });
      } catch (err) {
        console.error(err);
        alert("An error occurred during attendance simulation.");
      } finally {
        setSimulating(false);
      }
    }, 1800);
  };

  const handleOpenCalendar = (target) => {
    setCalendarTarget(target);
    setCalendarVisible(true);
  };

  const handleSelectDate = (dateStr) => {
    setCalendarVisible(false);
    if (calendarTarget === "one-time") {
      setOneTimeDate(dateStr);
    } else if (calendarTarget === "start") {
      setStartDate(dateStr);
    } else if (calendarTarget === "end") {
      setEndDate(dateStr);
    }
  };

  const formatDateText = (dateStr) => {
    if (!dateStr) return "Not Set";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.success} />
        <Text style={styles.loadingText}>Fetching automation settings...</Text>
      </View>
    );
  }

  return (
    <ProtectedRoute>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <BackButton label="Settings" onPress={() => router.push("/settings")} style={{ marginBottom: 12 }} />
          <Text style={styles.title}>Automation Management</Text>
          <Text style={styles.subtitle}>
            Configure automated business logs, alarms, and attendance schedules.
          </Text>
        </View>

        {/* 1. AUTOMATIC ATTENDANCE AUTOMATION CARD */}
        <View style={[styles.card, autoAttendance && styles.cardActiveGreen]}>
          <View style={styles.cardHeader}>
            <View style={styles.headerLeft}>
              <View
                style={[
                  styles.iconWrapper,
                  {
                    backgroundColor: autoAttendance
                      ? "#e6f4ea"
                      : colors.border.subtle,
                  },
                ]}
              >
                <MaterialIcons
                  name="event-available"
                  size={24}
                  color={autoAttendance ? "#10b981" : colors.text.secondary}
                />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.cardTitle}>Automatic Attendance</Text>
                <Text style={styles.cardDesc}>
                  Automatically create attendance logs on selected days.
                </Text>
              </View>
            </View>
            <Switch
              value={autoAttendance}
              onValueChange={handleToggleAutoAttendance}
              trackColor={{ false: colors.border.medium, true: "#a7f3d0" }}
              thumbColor={autoAttendance ? "#10b981" : colors.border.subtle}
            />
          </View>

          {autoAttendance && (
            <View style={styles.cardContent}>
              <View style={styles.divider} />

              {/* Toggle to expand configs */}
              <Pressable
                style={styles.expandHeader}
                onPress={() => setAttendanceCollapsed(!attendanceCollapsed)}
              >
                <Text style={styles.sectionSubtitle}>
                  Scheduler Configurations
                </Text>
                <MaterialIcons
                  name={
                    attendanceCollapsed
                      ? "keyboard-arrow-down"
                      : "keyboard-arrow-up"
                  }
                  size={22}
                  color="#059669"
                />
              </Pressable>

              {!attendanceCollapsed && (
                <View style={styles.collapsibleBody}>
                  {/* Schedule Types tabs */}
                  <Text style={styles.label}>Schedule Type *</Text>
                  <View style={styles.tabContainer}>
                    <Pressable
                      style={[
                        styles.tabButton,
                        scheduleType === "everyday" && styles.tabButtonActive,
                      ]}
                      onPress={() => {
                        setScheduleType("everyday");
                      }}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          scheduleType === "everyday" && styles.tabTextActive,
                        ]}
                      >
                        Everyday (Daily)
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.tabButton,
                        scheduleType === "repeat" && styles.tabButtonActive,
                      ]}
                      onPress={() => {
                        setScheduleType("repeat");
                      }}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          scheduleType === "repeat" && styles.tabTextActive,
                        ]}
                      >
                        Custom Days
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.tabButton,
                        scheduleType === "one-time" && styles.tabButtonActive,
                      ]}
                      onPress={() => {
                        setScheduleType("one-time");
                      }}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          scheduleType === "one-time" && styles.tabTextActive,
                        ]}
                      >
                        One-Time
                      </Text>
                    </Pressable>
                  </View>

                  {/* One-Time Date Selector */}
                  {scheduleType === "one-time" ? (
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Scheduled Date</Text>
                      <Pressable
                        style={styles.dateSelector}
                        onPress={() => handleOpenCalendar("one-time")}
                      >
                        <MaterialIcons
                          name="calendar-today"
                          size={18}
                          color="#059669"
                        />
                        <Text style={styles.dateSelectorText}>
                          {formatDateText(oneTimeDate)}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    // Repeat Days Circular Selection Grid
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Repeat Every</Text>
                      <View style={styles.daysRow}>
                        {DAYS_SHORT.map((day, idx) => {
                          const isSelected = repeatDays.includes(idx);
                          return (
                            <Pressable
                              key={day}
                              style={[
                                styles.dayPill,
                                isSelected && styles.dayPillActive,
                              ]}
                              onPress={() => handleDayToggle(idx)}
                            >
                              <Text
                                style={[
                                  styles.dayPillText,
                                  isSelected && styles.dayPillTextActive,
                                ]}
                              >
                                {day.substring(0, 1)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {/* Start and End Date selection grid */}
                      <View style={styles.rowGrid}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.subLabel}>Start Date</Text>
                          <Pressable
                            style={styles.dateSelector}
                            onPress={() => handleOpenCalendar("start")}
                          >
                            <Text style={styles.dateSelectorText}>
                              {formatDateText(startDate)}
                            </Text>
                          </Pressable>
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.subLabel}>
                            End Date (Optional)
                          </Text>
                          <Pressable
                            style={styles.dateSelector}
                            onPress={() => handleOpenCalendar("end")}
                          >
                            <Text style={styles.dateSelectorText}>
                              {endDate
                                ? formatDateText(endDate)
                                : "No End Date"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Trigger time selection row */}
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Trigger Time</Text>
                    <View style={styles.timesContainer}>
                      {DEFAULT_TIMES.map((time) => {
                        const isSelected =
                          triggerTime === time && !isCustomTime;
                        return (
                          <Pressable
                            key={time}
                            style={[
                              styles.timeBtn,
                              isSelected && styles.timeBtnActive,
                            ]}
                            onPress={() => handleTimeSelect(time)}
                          >
                            <Text
                              style={[
                                styles.timeBtnText,
                                isSelected && styles.timeBtnTextActive,
                              ]}
                            >
                              {time}
                            </Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        style={[
                          styles.timeBtn,
                          isCustomTime && styles.timeBtnActive,
                        ]}
                        onPress={() => setIsCustomTime(true)}
                      >
                        <Text
                          style={[
                            styles.timeBtnText,
                            isCustomTime && styles.timeBtnTextActive,
                          ]}
                        >
                          Custom Time
                        </Text>
                      </Pressable>
                    </View>

                    {isCustomTime && (
                      <View style={styles.customTimeRow}>
                        <TextInput
                          style={styles.customTimeInput}
                          value={customTimeInput}
                          onChangeText={setCustomTimeInput}
                          placeholder="e.g. 08:30 AM"
                          placeholderTextColor={colors.text.muted}
                        />
                        <Pressable
                          style={styles.applyBtn}
                          onPress={handleCustomTimeSubmit}
                        >
                          <Text style={styles.applyBtnText}>Apply</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {/* Default Production Quantity & Product Unit */}
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>
                      Default Production Quantity
                    </Text>
                    <View style={styles.qtyInputRow}>
                      <TextInput
                        style={styles.qtyInput}
                        value={String(defaultProductionQty)}
                        onChangeText={(val) => {
                          const num = parseFloat(val);
                          const qtyVal = isNaN(num) ? 0 : num;
                          setDefaultProductionQty(qtyVal);
                        }}
                        keyboardType="numeric"
                        placeholder="e.g. 1"
                      />
                      <Text style={styles.qtyUnitText}>
                        {activeProduct ? `${activeProduct.rateType}s` : "units"}
                      </Text>
                    </View>
                    {activeProduct && (
                      <Text style={styles.activeProductNote}>
                        Active Product:{" "}
                        <Text style={{ fontWeight: "700" }}>
                          {activeProduct.itemName}
                        </Text>
                      </Text>
                    )}
                  </View>

                  {/* Attendance default status actions */}
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Default Status</Text>
                    <View style={styles.statusSegment}>
                      {ATTENDANCE_STATUSES.map((status) => {
                        const isSelected = defaultStatus === status.value;
                        return (
                          <Pressable
                            key={status.value}
                            style={[
                              styles.segmentBtn,
                              isSelected && styles.segmentBtnActive,
                            ]}
                            onPress={() => {
                              setDefaultStatus(status.value);
                            }}
                          >
                            <Text
                              style={[
                                styles.segmentBtnText,
                                isSelected && styles.segmentBtnTextActive,
                              ]}
                            >
                              {status.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Automatically Save Switch */}
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.switchLabel}>
                        Automatically Save Attendance
                      </Text>
                      <Text style={styles.switchDesc}>
                        When reached, records are automatically finalized.
                      </Text>
                    </View>
                    <Switch
                      value={saveAttendance}
                      onValueChange={(val) => {
                        setSaveAttendance(val);
                      }}
                      trackColor={{
                        false: colors.border.medium,
                        true: "#a7f3d0",
                      }}
                      thumbColor={
                        saveAttendance ? "#10b981" : colors.border.subtle
                      }
                    />
                  </View>

                  {/* Worker Selection Collapsible Section */}
                  <Pressable
                    style={styles.expandHeader2}
                    onPress={() => setWorkersCollapsed(!workersCollapsed)}
                  >
                    <Text style={styles.label}>
                      Selected Workers ({selectedWorkers.length} /{" "}
                      {workers.length})
                    </Text>
                    <MaterialIcons
                      name={
                        workersCollapsed
                          ? "keyboard-arrow-down"
                          : "keyboard-arrow-up"
                      }
                      size={20}
                      color={colors.text.secondary}
                    />
                  </Pressable>

                  {!workersCollapsed && (
                    <View style={styles.workersListBody}>
                      <View style={styles.workersActionsRow}>
                        <Pressable onPress={handleSelectAllWorkers}>
                          <Text style={styles.actionTextLink}>Select All</Text>
                        </Pressable>
                        <Pressable onPress={handleDeselectAllWorkers}>
                          <Text style={styles.actionTextLink}>
                            Deselect All
                          </Text>
                        </Pressable>
                      </View>

                      <View style={styles.workersGrid}>
                        {workers.map((worker) => {
                          const isChecked = selectedWorkers.includes(worker.id);
                          return (
                            <Pressable
                              key={worker.id}
                              style={[
                                styles.workerPill,
                                isChecked && styles.workerPillChecked,
                              ]}
                              onPress={() => handleWorkerToggle(worker.id)}
                            >
                              <MaterialIcons
                                name={
                                  isChecked
                                    ? "check-circle"
                                    : "radio-button-unchecked"
                                }
                                size={18}
                                color={
                                  isChecked ? "#10b981" : colors.text.muted
                                }
                              />
                              <Text
                                style={[
                                  styles.workerPillText,
                                  isChecked && styles.workerPillTextChecked,
                                ]}
                              >
                                {worker.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Start/Stop Scheduler Action Button */}
                  <Pressable
                    style={({ pressed }) => [
                      autoAttendance ? styles.stopBtn : styles.startBtn,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={handleStartStopScheduler}
                  >
                    <MaterialIcons
                      name={autoAttendance ? "stop" : "play-arrow"}
                      size={20}
                      color={colors.bg.card}
                    />
                    <Text style={styles.startBtnText}>
                      {autoAttendance ? "Stop Scheduler" : "Start Scheduler"}
                    </Text>
                  </Pressable>

                  {/* Save Settings Action Button */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.saveBtn,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={handleSaveAllSchedulerSettings}
                  >
                    <MaterialIcons
                      name="save"
                      size={20}
                      color={colors.bg.card}
                    />
                    <Text style={styles.saveBtnText}>Save Settings</Text>
                  </Pressable>

                  {/* Run Simulation Action Button */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.simulationBtn,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={handleRunSimulation}
                  >
                    <MaterialIcons
                      name="play-circle-outline"
                      size={20}
                      color={colors.bg.card}
                    />
                    <Text style={styles.simulationBtnText}>
                      Run Test Simulation
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>

        {/* 2. AUTO-DEDUCT BAGS AUTOMATION */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.headerLeft}>
              <View
                style={[styles.iconWrapper, { backgroundColor: "#6C5CE720" }]}
              >
                <MaterialIcons
                  name="sync"
                  size={24}
                  color={colors.accent.primary}
                />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.cardTitle}>Deduct Raw Material Bags</Text>
                <Text style={styles.cardDesc}>
                  Deduct all raw materials measured in bags when worker pieces
                  (bags) are logged.
                </Text>
              </View>
            </View>
            <Switch
              value={autoDeductBags}
              onValueChange={handleToggleAutoDeductBags}
              trackColor={{ false: colors.border.medium, true: "#6C5CE740" }}
              thumbColor={autoDeductBags ? "#6C5CE7" : colors.border.subtle}
            />
          </View>
        </View>

        {/* 3. DAILY REPORT SUMMARY */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.headerLeft}>
              <View
                style={[styles.iconWrapper, { backgroundColor: "#fdf2f8" }]}
              >
                <MaterialIcons name="assessment" size={24} color="#db2777" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.cardTitle}>Daily Business Report</Text>
                <Text style={styles.cardDesc}>
                  Generate a daily sales, wages, and stock report at a scheduled
                  time.
                </Text>
              </View>
            </View>
            <Switch
              value={dailySummary}
              onValueChange={handleToggleDailySummary}
              trackColor={{ false: colors.border.medium, true: "#fbcfe8" }}
              thumbColor={dailySummary ? "#db2777" : colors.border.subtle}
            />
          </View>

          {dailySummary && (
            <View style={styles.cardContent}>
              <View style={styles.divider} />
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Trigger Time (24h format)</Text>
                <TextInput
                  style={styles.textInput}
                  value={dailySummaryTime}
                  onChangeText={setDailySummaryTime}
                  placeholder="e.g. 20:00"
                  placeholderTextColor={colors.text.muted}
                  onBlur={() =>
                    handleSaveTextOption("dailySummaryTime", dailySummaryTime)
                  }
                />
              </View>
            </View>
          )}
        </View>

        {/* 4. LOW STOCK WARNING ALARMS */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.headerLeft}>
              <View
                style={[styles.iconWrapper, { backgroundColor: "#fff7ed" }]}
              >
                <MaterialIcons name="warning" size={24} color="#ea580c" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.cardTitle}>Low Stock Auto-Alarm</Text>
                <Text style={styles.cardDesc}>
                  Alert automatically when finished goods or raw materials fall
                  below a set threshold.
                </Text>
              </View>
            </View>
            <Switch
              value={lowStock}
              onValueChange={handleToggleLowStock}
              trackColor={{ false: colors.border.medium, true: "#ffedd5" }}
              thumbColor={lowStock ? "#ea580c" : colors.border.subtle}
            />
          </View>

          {lowStock && (
            <View style={styles.cardContent}>
              <View style={styles.divider} />
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Warning Threshold (Units)</Text>
                <TextInput
                  style={styles.textInput}
                  value={lowStockThreshold}
                  onChangeText={setLowStockThreshold}
                  keyboardType="numeric"
                  placeholder="e.g. 5"
                  placeholderTextColor={colors.text.muted}
                  onBlur={() =>
                    handleSaveTextOption("lowStockThreshold", lowStockThreshold)
                  }
                />
              </View>
            </View>
          )}
        </View>

        {/* 5. OVERDUE INVOICE REMINDERS */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.headerLeft}>
              <View
                style={[styles.iconWrapper, { backgroundColor: "#f0fdf4" }]}
              >
                <MaterialIcons
                  name="notifications-active"
                  size={24}
                  color="#16a34a"
                />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.cardTitle}>Due Payment Reminders</Text>
                <Text style={styles.cardDesc}>
                  Flag and trigger alerts for unpaid customer invoices after
                  custom period.
                </Text>
              </View>
            </View>
            <Switch
              value={overdueReminders}
              onValueChange={handleToggleOverdue}
              trackColor={{ false: colors.border.medium, true: "#dcfce7" }}
              thumbColor={overdueReminders ? "#16a34a" : colors.border.subtle}
            />
          </View>

          {overdueReminders && (
            <View style={styles.cardContent}>
              <View style={styles.divider} />
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Warning After (Days)</Text>
                <TextInput
                  style={styles.textInput}
                  value={overdueDays}
                  onChangeText={setOverdueDays}
                  keyboardType="numeric"
                  placeholder="e.g. 7"
                  placeholderTextColor={colors.text.muted}
                  onBlur={() =>
                    handleSaveTextOption("overdueDays", overdueDays)
                  }
                />
              </View>
            </View>
          )}
        </View>

        {/* 6. SCHEDULER HISTORY LOGS */}
        {autoAttendance && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Auto-Attendance Run History</Text>
            {logs.length === 0 ? (
              <Text style={styles.emptyLogsText}>
                No history logs found. Trigger a run above.
              </Text>
            ) : (
              <View style={styles.logsList}>
                {logs.map((log, index) => (
                  <View
                    key={`${log.id ?? "log"}-${log.date ?? "unknown"}-${index}`}
                    style={styles.logCard}
                  >
                    <View style={styles.logCardHeader}>
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <MaterialIcons
                          name="check-circle"
                          size={16}
                          color={colors.accent.success}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.logStatus}>
                          ✔ {log.statusText || "Completed"}
                        </Text>
                      </View>
                      <Text style={styles.logDateText}>{log.date}</Text>
                    </View>
                    <View style={styles.logCardBody}>
                      <Text style={styles.logDetail}>
                        Triggered at:{" "}
                        <Text
                          style={{
                            fontWeight: "700",
                            color: colors.text.primary,
                          }}
                        >
                          {log.time}
                        </Text>
                      </Text>
                      <Text style={styles.logDetail}>
                        Logged:{" "}
                        <Text style={{ fontWeight: "700", color: "#059669" }}>
                          {log.workerCount} Workers
                        </Text>
                        {log.skippedCount > 0
                          ? ` (Skipped ${log.skippedCount} Duplicates)`
                          : ""}
                      </Text>
                      <Text style={styles.logDetail}>
                        Default Status:{" "}
                        <Text
                          style={{
                            textTransform: "capitalize",
                            fontWeight: "700",
                            color: colors.text.primary,
                          }}
                        >
                          {log.defaultStatus}
                        </Text>
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* CUSTOM CALENDAR MODAL */}
        <Modal visible={calendarVisible} transparent animationType="fade">
          <View style={styles.calendarModalBg}>
            <View style={styles.calendarModalContent}>
              <View style={styles.calendarHeader}>
                <Text style={styles.calendarTitle}>Select Date</Text>
                <Pressable onPress={() => setCalendarVisible(false)}>
                  <MaterialIcons
                    name="close"
                    size={24}
                    color={colors.text.secondary}
                  />
                </Pressable>
              </View>

              {/* Simple calendar picker list of upcoming 7 days to choose */}
              <View style={styles.calendarList}>
                {Array.from({ length: 7 }).map((_, i) => {
                  const day = new Date();
                  day.setDate(day.getDate() + i - 1); // Yesterday to 5 days ahead
                  const yyyy = day.getFullYear();
                  const mm = String(day.getMonth() + 1).padStart(2, "0");
                  const dd = String(day.getDate()).padStart(2, "0");
                  const dateStr = `${yyyy}-${mm}-${dd}`;
                  return (
                    <Pressable
                      key={dateStr}
                      style={styles.calendarRow}
                      onPress={() => handleSelectDate(dateStr)}
                    >
                      <MaterialIcons
                        name="event"
                        size={18}
                        color={colors.accent.success}
                      />
                      <Text style={styles.calendarRowText}>
                        {day.toLocaleDateString("en-US", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                        {i === 1 ? " (Today)" : i === 2 ? " (Tomorrow)" : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>

        {/* SIMULATION LOADER & RESULT MODAL */}
        <Modal
          visible={simulationModalVisible}
          transparent
          animationType="slide"
        >
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              {simulating ? (
                <View style={styles.simulatingBody}>
                  <ActivityIndicator
                    size="large"
                    color={colors.accent.success}
                  />
                  <Text style={styles.simulatingText}>
                    Executing Automatic Attendance Scheduler...
                  </Text>
                  <Text style={styles.simulatingSub}>
                    Checking days, logs, and verifying safety duplicates...
                  </Text>
                </View>
              ) : (
                <View style={styles.resultBody}>
                  <View style={styles.successBadge}>
                    <MaterialIcons
                      name="check"
                      size={32}
                      color={colors.bg.card}
                    />
                  </View>
                  <Text style={styles.resultTitle}>Automation Completed</Text>

                  {simulationResult && (
                    <View style={styles.resultDetailsCard}>
                      <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>
                          Created Attendance Sheets
                        </Text>
                        <Text style={[styles.resultVal, { color: "#059669" }]}>
                          {simulationResult.logged} Workers
                        </Text>
                      </View>
                      <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>
                          Skipped (Attendance Already Marked)
                        </Text>
                        <Text
                          style={[
                            styles.resultVal,
                            { color: colors.accent.warning },
                          ]}
                        >
                          {simulationResult.skipped} Workers
                        </Text>
                      </View>
                      <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>Status</Text>
                        <Text style={styles.resultVal}>
                          {simulationResult.status}
                        </Text>
                      </View>
                    </View>
                  )}

                  <Pressable
                    style={styles.resultBtn}
                    onPress={() => setSimulationModalVisible(false)}
                  >
                    <Text style={styles.resultBtnText}>Dismiss</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </ScrollView>
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
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: colors.bg.card,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: {
      marginTop: 12,
      color: colors.text.muted,
      fontSize: 16,
      fontWeight: "500",
    },
    header: {
      marginBottom: 20,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    backText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text.secondary,
      marginLeft: 6,
    },
    title: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: colors.text.muted,
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.03,
      shadowRadius: 8,
      elevation: 2,
    },
    cardActiveGreen: {
      borderColor: "#a7f3d0",
      shadowColor: colors.accent.success,
      shadowOpacity: 0.05,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      marginRight: 12,
    },
    iconWrapper: {
      width: 44,
      height: 44,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    headerText: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 2,
    },
    cardDesc: {
      fontSize: 12,
      color: colors.text.muted,
      lineHeight: 16,
    },
    cardContent: {
      marginTop: 12,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      marginVertical: 4,
      marginBottom: 12,
    },
    expandHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 4,
    },
    expandHeader2: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderTopWidth: 1.5,
      borderTopColor: colors.bg.primary,
      marginTop: 12,
    },
    sectionSubtitle: {
      fontSize: 13,
      fontWeight: "700",
      color: "#059669",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    collapsibleBody: {
      marginTop: 12,
    },
    formGroup: {
      marginBottom: 16,
    },
    label: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 8,
    },
    subLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
      marginBottom: 4,
    },
    tabContainer: {
      flexDirection: "row",
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      overflow: "hidden",
      marginBottom: 12,
    },
    tabButton: {
      flex: 1,
      height: 38,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
    },
    tabButtonActive: {
      backgroundColor: "#e6f4ea",
    },
    tabText: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: "600",
    },
    tabTextActive: {
      color: "#059669",
      fontWeight: "700",
    },
    dateSelector: {
      flexDirection: "row",
      alignItems: "center",
      height: 44,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.bg.primary,
      gap: 8,
    },
    dateSelectorText: {
      fontSize: 13,
      color: colors.text.primary,
      fontWeight: "500",
    },
    daysRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    dayPill: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg.card,
    },
    dayPillActive: {
      backgroundColor: colors.accent.success,
      borderColor: colors.accent.success,
    },
    dayPillText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.muted,
    },
    dayPillTextActive: {
      color: colors.bg.card,
    },
    rowGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    timesContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    timeBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      backgroundColor: colors.bg.card,
    },
    timeBtnActive: {
      backgroundColor: "#e6f4ea",
      borderColor: colors.accent.success,
    },
    timeBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    timeBtnTextActive: {
      color: "#059669",
      fontWeight: "700",
    },
    customTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      gap: 8,
    },
    customTimeInput: {
      flex: 1,
      height: 38,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      borderRadius: 8,
      paddingHorizontal: 10,
      fontSize: 13,
      color: colors.text.primary,
    },
    applyBtn: {
      backgroundColor: "#059669",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    applyBtnText: {
      color: colors.bg.card,
      fontSize: 12,
      fontWeight: "700",
    },
    statusSegment: {
      flexDirection: "row",
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      overflow: "hidden",
    },
    segmentBtn: {
      flex: 1,
      height: 38,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
    },
    segmentBtnActive: {
      backgroundColor: colors.accent.success,
    },
    segmentBtnText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
    },
    segmentBtnTextActive: {
      color: colors.bg.card,
      fontWeight: "700",
    },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg.primary,
      padding: 12,
      borderRadius: 12,
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    switchLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 2,
    },
    switchDesc: {
      fontSize: 11,
      color: colors.text.muted,
    },
    workersListBody: {
      backgroundColor: colors.bg.primary,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginBottom: 12,
    },
    workersActionsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 12,
      marginBottom: 10,
    },
    actionTextLink: {
      fontSize: 12,
      fontWeight: "700",
      color: "#059669",
    },
    workersGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    workerPill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      gap: 6,
    },
    workerPillChecked: {
      borderColor: colors.accent.success,
      backgroundColor: "#e6f4ea",
    },
    workerPillText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    workerPillTextChecked: {
      color: "#059669",
      fontWeight: "700",
    },
    simulationBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#059669",
      height: 44,
      borderRadius: 10,
      gap: 6,
      marginTop: 12,
    },
    simulationBtnText: {
      color: colors.bg.card,
      fontSize: 13,
      fontWeight: "700",
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    textInput: {
      width: 90,
      height: 38,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 8,
      paddingHorizontal: 10,
      fontSize: 14,
      color: colors.text.primary,
      backgroundColor: colors.bg.primary,
      textAlign: "center",
    },
    historySection: {
      marginTop: 16,
      marginBottom: 20,
    },
    historyTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 12,
    },
    emptyLogsText: {
      fontSize: 13,
      color: colors.text.muted,
      textAlign: "center",
      paddingVertical: 16,
    },
    logsList: {
      gap: 10,
    },
    logCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 12,
    },
    logCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    logStatus: {
      fontSize: 12,
      fontWeight: "700",
      color: "#059669",
    },
    logDateText: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "600",
    },
    logCardBody: {
      gap: 4,
    },
    logDetail: {
      fontSize: 12,
      color: colors.text.muted,
    },
    modalBg: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      padding: 20,
    },
    modalContent: {
      backgroundColor: colors.bg.card,
      borderRadius: 20,
      padding: 20,
    },
    simulatingBody: {
      alignItems: "center",
      paddingVertical: 30,
    },
    simulatingText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 16,
      textAlign: "center",
    },
    simulatingSub: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 6,
      textAlign: "center",
    },
    resultBody: {
      alignItems: "center",
      paddingVertical: 10,
    },
    successBadge: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.accent.success,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    resultTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 16,
    },
    resultDetailsCard: {
      width: "100%",
      backgroundColor: colors.bg.primary,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 16,
      gap: 12,
      marginBottom: 20,
    },
    resultRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    resultLabel: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: "600",
    },
    resultVal: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    resultBtn: {
      backgroundColor: "#059669",
      width: "100%",
      height: 46,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    resultBtnText: {
      color: colors.bg.card,
      fontSize: 14,
      fontWeight: "700",
    },
    calendarModalBg: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
    },
    calendarModalContent: {
      backgroundColor: colors.bg.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: "60%",
    },
    calendarHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
      borderBottomWidth: 1.5,
      borderBottomColor: colors.border.subtle,
      paddingBottom: 10,
    },
    calendarTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text.primary,
    },
    calendarList: {
      gap: 8,
    },
    calendarRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      gap: 8,
    },
    calendarRowText: {
      fontSize: 13,
      color: colors.text.primary,
      fontWeight: "600",
    },
    qtyInputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    qtyInput: {
      width: 100,
      height: 40,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      borderRadius: 8,
      paddingHorizontal: 10,
      fontSize: 14,
      color: colors.text.primary,
      backgroundColor: colors.bg.card,
    },
    qtyUnitText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.secondary,
      textTransform: "capitalize",
    },
    activeProductNote: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 4,
    },
    saveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent.success,
      height: 44,
      borderRadius: 10,
      gap: 6,
      marginTop: 10,
      marginBottom: 8,
    },
    saveBtnText: {
      color: colors.bg.card,
      fontSize: 13,
      fontWeight: "700",
    },
    startBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#059669",
      height: 44,
      borderRadius: 10,
      gap: 6,
      marginTop: 16,
    },
    stopBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#ea580c",
      height: 44,
      borderRadius: 10,
      gap: 6,
      marginTop: 16,
    },
    startBtnText: {
      color: colors.bg.card,
      fontSize: 13,
      fontWeight: "700",
    },
  });
};
export default function AutomationManagementRoute() {
  return (
    <ProtectedRoute>
      <AutomationManagementScreen />
    </ProtectedRoute>
  );
}
