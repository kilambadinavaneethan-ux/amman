/* eslint-disable import/namespace */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
  Animated,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, writeBatch, doc, Timestamp } from "firebase/firestore";
import { ref, uploadString } from "firebase/storage";
import { db, storage, auth } from "../../src/config/firebase";
import { getDocsOfflineSafe } from "../../src/utils/offlineHelpers";
import AnimatedPage from "../components/AnimatedPage";
import BackButton from "../components/BackButton";
import ProtectedRoute from "../components/ProtectedRoute";
import { useTheme } from "../context/ThemeContext";

// ─── Constants ───────────────────────────────────────────────────────────────

const APP_VERSION = "1.0.0";
const BACKUP_VERSION = 2;
const BACKUP_DIR_NAME = "HollowBlockBusiness/Backups";
const MAX_BACKUPS = 10;
const ACTIVITY_LOGS_STORAGE_KEY = "data_mgmt_activity_logs_v2";

const STORAGE_KEYS = {
  autoBackupEnabled: "backup_auto_enabled",
  autoBackupFrequency: "backup_auto_frequency",
  lastAutoBackup: "backup_last_auto_ts",
  pinEnabled: "backup_pin_enabled",
  pinValue: "backup_pin_value",
};

const COLLECTIONS = [
  { key: "customers", collectionName: "customers", label: "Customers", icon: "people-alt" as const },
  { key: "items", collectionName: "items", label: "Inventory Items", icon: "inventory-2" as const },
  { key: "orders", collectionName: "orders", label: "Orders", icon: "shopping-cart" as const },
  { key: "payments", collectionName: "payments", label: "Customer Payments", icon: "account-balance-wallet" as const },
  { key: "profitTransactions", collectionName: "profitTransactions", label: "Profit Transactions", icon: "trending-up" as const },
  { key: "profitSummary", collectionName: "profitSummary", label: "Profit Summaries", icon: "analytics" as const },
  { key: "users", collectionName: "users", label: "User Profiles & Settings", icon: "business" as const },
  { key: "workers", collectionName: "workers", label: "Workers", icon: "engineering" as const },
  { key: "workerAttendance", collectionName: "workerAttendance", label: "Worker Attendance", icon: "event-available" as const },
  { key: "workerPayments", collectionName: "workerPayments", label: "Worker Payments", icon: "payments" as const },
  { key: "workerBonuses", collectionName: "workerBonuses", label: "Worker Bonuses & Incentives", icon: "stars" as const },
  { key: "contractWorkers", collectionName: "contractWorkers", label: "Contract Workers", icon: "handshake" as const },
  { key: "contractPayments", collectionName: "contractPayments", label: "Contract Worker Payments", icon: "receipt" as const },
  { key: "expenses", collectionName: "expenses", label: "Expenses", icon: "receipt-long" as const },
  { key: "expensePayments", collectionName: "expense_payments", label: "Expense Payments", icon: "monetization-on" as const },
  { key: "expenseBudgets", collectionName: "expense_budgets", label: "Expense Budgets", icon: "pie-chart" as const },
  { key: "recurringExpenses", collectionName: "recurring_expenses", label: "Recurring Expenses", icon: "autorenew" as const },
  { key: "deliveryPartners", collectionName: "deliveryPartners", label: "Delivery Partners", icon: "local-shipping" as const },
  { key: "deliveryTrips", collectionName: "deliveryTrips", label: "Delivery Trips", icon: "alt-route" as const },
  { key: "deliveryPayments", collectionName: "deliveryPayments", label: "Delivery Payments", icon: "price-check" as const },
  { key: "deliveryPartnerBonuses", collectionName: "deliveryPartnerBonuses", label: "Delivery Partner Bonuses", icon: "loyalty" as const },
  { key: "moneyCollectors", collectionName: "moneyCollectors", label: "Money Collectors", icon: "account-balance" as const },
  { key: "rawMaterialSuppliers", collectionName: "raw_material_suppliers", label: "Raw Material Suppliers", icon: "storefront" as const },
  { key: "rawMaterialLogs", collectionName: "raw_material_logs", label: "Raw Material Logs", icon: "layers" as const },
  { key: "crusherContacts", collectionName: "crusherContacts", label: "Crusher Contacts", icon: "terrain" as const },
  { key: "itemStockLogs", collectionName: "item_stock_logs", label: "Item Stock Logs", icon: "add-shopping-cart" as const },
  { key: "automations", collectionName: "automations", label: "Automation Configurations", icon: "settings-suggest" as const },
  { key: "automationAttendanceLogs", collectionName: "automation_attendance_logs", label: "Automatic Attendance Logs", icon: "history-toggle-off" as const },
  { key: "alarms", collectionName: "alarms", label: "Alarms & Reminders", icon: "alarm" as const },
  { key: "visitingCards", collectionName: "visiting_cards", label: "Visiting Cards Storage", icon: "badge" as const },
  { key: "supportTickets", collectionName: "supportTickets", label: "Support Tickets", icon: "help-outline" as const },
  { key: "notifications", collectionName: "notifications", label: "System Notifications", icon: "notifications" as const },
];

const COLLECTION_CATEGORIES = [
  { name: "Core Business", icon: "business" as const, keys: ["customers", "items", "orders", "payments", "users", "profitTransactions", "profitSummary"] },
  { name: "Expenses", icon: "receipt-long" as const, keys: ["expenses", "expensePayments", "expenseBudgets", "recurringExpenses"] },
  { name: "Workforce", icon: "people" as const, keys: ["workers", "workerAttendance", "workerPayments", "workerBonuses", "contractWorkers", "contractPayments"] },
  { name: "Delivery", icon: "local-shipping" as const, keys: ["deliveryPartners", "deliveryTrips", "deliveryPayments", "deliveryPartnerBonuses", "moneyCollectors"] },
  { name: "Operations", icon: "settings" as const, keys: ["automations", "automationAttendanceLogs", "alarms", "itemStockLogs"] },
  { name: "Raw Materials", icon: "inventory" as const, keys: ["rawMaterialSuppliers", "rawMaterialLogs", "crusherContacts"] },
  { name: "Media & System", icon: "analytics" as const, keys: ["visitingCards", "supportTickets", "notifications"] },
];

type FrequencyOption = "daily" | "weekly" | "monthly";
type ExportFormat = "json" | "csv";

interface BackupFileInfo {
  name: string;
  uri: string;
  size: number;
  modificationTime: number;
}

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done";
}

// ─── Utility Helpers ─────────────────────────────────────────────────────────

function generateChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const ch = data.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function xorCipher(text: string, key: string): string {
  if (!key) return text;
  const result: string[] = [];
  for (let i = 0; i < text.length; i++) {
    result.push(String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length)));
  }
  return result.join("");
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, "0")}:${mins} ${ampm}`;
}

function getFrequencyMs(freq: FrequencyOption): number {
  switch (freq) {
    case "daily": return 24 * 60 * 60 * 1000;
    case "weekly": return 7 * 24 * 60 * 60 * 1000;
    case "monthly": return 30 * 24 * 60 * 60 * 1000;
  }
}

const convertDates = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    const isoDateReg = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (isoDateReg.test(obj)) {
      const d = new Date(obj);
      if (!isNaN(d.getTime())) {
        return Timestamp.fromDate(d);
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertDates(item));
  }

  if (typeof obj === "object") {
    if (typeof obj.seconds === "number" && typeof obj.nanoseconds === "number" && Object.keys(obj).length === 2) {
      return new Timestamp(obj.seconds, obj.nanoseconds);
    }
    if (typeof obj._seconds === "number" && typeof obj._nanoseconds === "number") {
      return new Timestamp(obj._seconds, obj._nanoseconds);
    }

    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = convertDates(obj[key]);
    }
    return newObj;
  }

  return obj;
};

const BACKUP_DIR_URI = `${FileSystem.documentDirectory}${BACKUP_DIR_NAME}/`;

async function ensureBackupDirExists() {
  const dirInfo = await FileSystem.getInfoAsync(BACKUP_DIR_URI);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(BACKUP_DIR_URI, { intermediates: true });
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

function BackupRestore() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();

  // --- State ---
  const [backupHistory, setBackupHistory] = useState<BackupFileInfo[]>([]);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoFrequency, setAutoFrequency] = useState<FrequencyOption>("weekly");
  const [pinEnabled, setPinEnabled] = useState(false);
  const [savedPin, setSavedPin] = useState("");

  // Progress modal
  const [showProgress, setShowProgress] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [progressTitle, setProgressTitle] = useState("");
  const [progressDone, setProgressDone] = useState(false);
  const [progressError, setProgressError] = useState("");

  // PIN modal
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinAction, setPinAction] = useState<"setup" | "verify-backup" | "verify-restore" | "disable">("setup");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");

  // Restore list modal
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [scanningBackups, setScanningBackups] = useState(false);

  // Restore confirm modal with Merge vs Replace and table selection
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState<any>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [restoreSelectedKeys, setRestoreSelectedKeys] = useState<string[]>([]);

  // Selective backup collections
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(
    new Set(COLLECTIONS.map(c => c.key))
  );
  const [scopeSearch, setScopeSearch] = useState("");
  const [inspectFile, setInspectFile] = useState<BackupFileInfo | null>(null);

  const allSelected = selectedCollections.size === COLLECTIONS.length;

  const toggleCollection = (key: string) => {
    setSelectedCollections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllCollections = () => {
    if (allSelected) {
      setSelectedCollections(new Set());
    } else {
      setSelectedCollections(new Set(COLLECTIONS.map(c => c.key)));
    }
  };

  const toggleCategory = (keys: string[]) => {
    setSelectedCollections(prev => {
      const next = new Set(prev);
      const allIn = keys.every(k => next.has(k));
      if (allIn) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  };

  // Firebase sync
  const [uploading, setUploading] = useState(false);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressFadeAnim = useRef(new Animated.Value(0)).current;

  // --- Audit Log Helper ---
  const logActivity = useCallback(async (action: "export" | "import" | "wipe" | "cleanup", title: string, details: string, count?: number) => {
    try {
      const newItem = {
        id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        action,
        title,
        details,
        timestamp: new Date().toISOString(),
        count,
      };
      const stored = await AsyncStorage.getItem(ACTIVITY_LOGS_STORAGE_KEY);
      const existing = stored ? JSON.parse(stored) : [];
      const updated = [newItem, ...existing].slice(0, 30);
      await AsyncStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(updated));
    } catch (_e) {
      // ignore
    }
  }, []);

  // --- Mount: Load settings + backup history + check auto-backup ---
  useEffect(() => {
    loadSettings();
    loadBackupHistory();
  }, []);

  useEffect(() => {
    if (autoBackupEnabled) {
      checkAutoBackup();
    }
  }, [autoBackupEnabled, autoFrequency]);

  useEffect(() => {
    if (showProgress) {
      Animated.timing(progressFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      progressFadeAnim.setValue(0);
    }
  }, [showProgress]);

  // Pulse animation for active progress step
  useEffect(() => {
    if (showProgress && !progressDone && !progressError) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [showProgress, progressDone, progressError]);

  // --- Settings Persistence ---
  const loadSettings = async () => {
    try {
      const [autoEnabled, freq, pinOn, pin] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.autoBackupEnabled),
        AsyncStorage.getItem(STORAGE_KEYS.autoBackupFrequency),
        AsyncStorage.getItem(STORAGE_KEYS.pinEnabled),
        AsyncStorage.getItem(STORAGE_KEYS.pinValue),
      ]);
      if (autoEnabled === "true") setAutoBackupEnabled(true);
      if (freq) setAutoFrequency(freq as FrequencyOption);
      if (pinOn === "true") setPinEnabled(true);
      if (pin) setSavedPin(pin);
    } catch (e) {
      // ignore
    }
  };

  const saveAutoBackupSettings = async (enabled: boolean, freq: FrequencyOption) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.autoBackupEnabled, String(enabled));
      await AsyncStorage.setItem(STORAGE_KEYS.autoBackupFrequency, freq);
    } catch (e) {
      // ignore
    }
  };

  // --- Backup History ---
  const loadBackupHistory = async () => {
    try {
      setScanningBackups(true);
      await ensureBackupDirExists();
      const files = await FileSystem.readDirectoryAsync(BACKUP_DIR_URI);
      const backupFiles: BackupFileInfo[] = [];

      for (const name of files) {
        if (name.endsWith(".json") || name.endsWith(".csv")) {
          const fileUri = `${BACKUP_DIR_URI}${name}`;
          const fileInfo = (await FileSystem.getInfoAsync(fileUri)) as any;
          backupFiles.push({
            name,
            uri: fileUri,
            size: fileInfo.size || 0,
            modificationTime: fileInfo.modificationTime ? fileInfo.modificationTime * 1000 : Date.now(),
          });
        }
      }

      backupFiles.sort((a, b) => b.modificationTime - a.modificationTime);
      setBackupHistory(backupFiles);
    } catch (e) {
      setBackupHistory([]);
    } finally {
      setScanningBackups(false);
    }
  };

  // --- Auto-Backup Check ---
  const checkAutoBackup = async () => {
    try {
      const lastTs = await AsyncStorage.getItem(STORAGE_KEYS.lastAutoBackup);
      const intervalMs = getFrequencyMs(autoFrequency);
      const now = Date.now();
      if (!lastTs || now - parseInt(lastTs, 10) >= intervalMs) {
        await executeCreateBackup(true);
        await AsyncStorage.setItem(STORAGE_KEYS.lastAutoBackup, String(now));
      }
    } catch (e) {
      // ignore
    }
  };

  // --- Progress Helpers ---
  const updateStep = (steps: ProgressStep[], index: number, status: "active" | "done"): ProgressStep[] => {
    return steps.map((s, i) => {
      if (i === index) return { ...s, status };
      if (i < index) return { ...s, status: "done" };
      return s;
    });
  };

  // --- CREATE BACKUP ---
  const createBackup = async (isAuto = false) => {
    if (pinEnabled && savedPin && !isAuto) {
      setPinAction("verify-backup");
      setPinInput("");
      setPinStep("enter");
      setShowPinModal(true);
      return;
    }
    await executeCreateBackup(isAuto);
  };

  const executeCreateBackup = async (isAuto = false) => {
    const steps: ProgressStep[] = [
      { label: "Preparing Data...", status: "active" },
      { label: "Exporting Collections...", status: "pending" },
      { label: "Saving File...", status: "pending" },
      { label: "Completed ✔", status: "pending" },
    ];
    setProgressSteps(steps);
    setProgressTitle(isAuto ? "Automatic Backup" : "Creating Backup");
    setProgressDone(false);
    setProgressError("");
    setShowProgress(true);

    try {
      // Step 1: Prepare
      await new Promise((r) => setTimeout(r, 400));
      const activeCollections = COLLECTIONS.filter(c => selectedCollections.has(c.key));

      const asyncStorageData: Record<string, string | null> = {};
      try {
        const localKeys = await AsyncStorage.getAllKeys();
        if (localKeys.length > 0) {
          const pairs = await AsyncStorage.multiGet(localKeys);
          pairs.forEach(([k, v]) => {
            if (!k.startsWith("data_mgmt_activity_logs")) {
              asyncStorageData[k] = v;
            }
          });
        }
      } catch (err) {
        console.warn("Failed to backup AsyncStorage keys", err);
      }

      const backupData: Record<string, any> = {
        _meta: {
          appVersion: APP_VERSION,
          backupVersion: BACKUP_VERSION,
          createdAt: new Date().toISOString(),
          platform: Platform.OS,
          collectionsCount: activeCollections.length,
          selectedKeys: Array.from(selectedCollections),
        },
        _asyncStorage: asyncStorageData,
      };

      // Step 2: Export from Firestore
      setProgressSteps((prev) => updateStep(prev, 1, "active"));
      let totalExportedRecords = 0;

      for (const col of activeCollections) {
        const snap = await getDocsOfflineSafe(collection(db, col.collectionName));
        const docs: Record<string, any>[] = [];
        snap.forEach((d: any) => docs.push({ id: d.id, ...d.data() }));
        backupData[col.key] = docs;
        totalExportedRecords += docs.length;
      }

      // Step 3: Save to file
      setProgressSteps((prev) => updateStep(prev, 2, "active"));
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const timeStr = `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
      const filename = `BusinessBackup_${dateStr}_${timeStr}.json`;

      let dataString = JSON.stringify(backupData, null, 2);
      const checksum = generateChecksum(dataString);
      backupData._meta.checksum = checksum;
      dataString = JSON.stringify(backupData, null, 2);

      // Encrypt if PIN is set
      if (pinEnabled && savedPin) {
        dataString = xorCipher(dataString, savedPin);
      }

      await ensureBackupDirExists();
      const fileUri = `${BACKUP_DIR_URI}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, dataString, { encoding: FileSystem.EncodingType.UTF8 });

      // Auto-cleanup: keep only latest MAX_BACKUPS
      deleteOldBackupsInternal();

      // Step 4: Done
      setProgressSteps((prev) => updateStep(prev, 3, "done"));
      setProgressDone(true);
      loadBackupHistory();
      logActivity(
        "export",
        "Created Full Backup",
        `Exported ${totalExportedRecords} records from ${activeCollections.length} collections`,
        totalExportedRecords
      );
    } catch (error: any) {
      setProgressError(error.message || "Backup failed");
    }
  };

  // --- CSV EXPORT ---
  const exportCSV = async () => {
    const steps: ProgressStep[] = [
      { label: "Preparing Data...", status: "active" },
      { label: "Converting to CSV...", status: "pending" },
      { label: "Saving File...", status: "pending" },
      { label: "Completed ✔", status: "pending" },
    ];
    setProgressSteps(steps);
    setProgressTitle("Exporting CSV");
    setProgressDone(false);
    setProgressError("");
    setShowProgress(true);

    try {
      await new Promise((r) => setTimeout(r, 300));

      // Step 2: Gather data for all selected collections
      setProgressSteps((prev) => updateStep(prev, 1, "active"));
      const activeCSVCollections = COLLECTIONS.filter(c => selectedCollections.has(c.key));
      let csvContent = "";
      let totalRecords = 0;

      for (const colConfig of activeCSVCollections) {
        const snap = await getDocsOfflineSafe(collection(db, colConfig.collectionName));
        if (snap.empty) continue;

        const docs: Record<string, any>[] = [];
        snap.forEach((d: any) => docs.push({ id: d.id, ...d.data() }));
        totalRecords += docs.length;

        const allKeys = new Set<string>();
        docs.forEach((d) => Object.keys(d).forEach((k) => allKeys.add(k)));
        const headers = Array.from(allKeys);

        csvContent += `\n=== TABLE: ${colConfig.label} (${colConfig.collectionName}) ===\n`;
        csvContent += headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";
        docs.forEach((d) => {
          const row = headers.map((h) => {
            const val = d[h];
            if (val === null || val === undefined) return "";
            const str = typeof val === "object" ? JSON.stringify(val) : String(val);
            return `"${str.replace(/"/g, '""')}"`;
          });
          csvContent += row.join(",") + "\n";
        });
      }

      // Step 3: Save
      setProgressSteps((prev) => updateStep(prev, 2, "active"));
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const timeStr = `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
      const filename = `BusinessReport_${dateStr}_${timeStr}.csv`;

      await ensureBackupDirExists();
      const fileUri = `${BACKUP_DIR_URI}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

      setProgressSteps((prev) => updateStep(prev, 3, "done"));
      setProgressDone(true);
      loadBackupHistory();
      logActivity(
        "export",
        "Exported CSV Report",
        `Exported ${totalRecords} records across ${activeCSVCollections.length} collections`,
        totalRecords
      );
    } catch (error: any) {
      setProgressError(error.message || "CSV export failed");
    }
  };

  // --- RESTORE BACKUP ---
  const restoreBackup = async () => {
    if (pinEnabled && savedPin) {
      setPinAction("verify-restore");
      setPinInput("");
      setPinStep("enter");
      setShowPinModal(true);
      return;
    }
    setShowRestoreModal(true);
    loadBackupHistory();
  };

  const executeRestorePicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "application/octet-stream", "text/json", "text/plain"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const fileUri = result.assets[0].uri;
      processBackupFileForRestore(fileUri);
    } catch (error: any) {
      Alert.alert("Error", "Failed to open file picker.");
    }
  };

  const handleRestoreFromHistory = async (fileInfo: BackupFileInfo) => {
    try {
      const fileInfoData = await FileSystem.getInfoAsync(fileInfo.uri);
      if (!fileInfoData.exists) {
        Alert.alert("Error", "Selected file does not exist on disk.");
        return;
      }
      processBackupFileForRestore(fileInfo.uri);
    } catch (error: any) {
      Alert.alert("Error", "Failed to load backup data.");
    }
  };

  const processBackupFileForRestore = async (fileUri: string) => {
    try {
      let content = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });

      // Decrypt if PIN is enabled
      if (pinEnabled && savedPin) {
        content = xorCipher(content, savedPin);
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        Alert.alert("Invalid Backup", "The selected file is not a valid JSON database backup.");
        return;
      }

      const validation = validateBackup(parsed);
      if (!validation.valid) {
        Alert.alert("Invalid Backup", validation.message);
        return;
      }

      // Pre-select all available collections in this backup
      const availableKeys = COLLECTIONS.filter(
        (c) => (parsed[c.key] && Array.isArray(parsed[c.key])) || (parsed[c.collectionName] && Array.isArray(parsed[c.collectionName]))
      ).map((c) => c.key);

      setPendingRestoreData(parsed);
      setRestoreSelectedKeys(availableKeys);
      setRestoreMode("merge");
      setShowRestoreModal(false);
      setShowRestoreConfirm(true);
    } catch (e: any) {
      Alert.alert("Read Error", e?.message || "Failed to process backup file.");
    }
  };

  const executeRestore = async () => {
    setShowRestoreConfirm(false);
    const data = pendingRestoreData;
    if (!data) return;

    const steps: ProgressStep[] = [
      { label: "Validating Backup...", status: "active" },
      { label: restoreMode === "replace" ? "Clearing Existing Tables..." : "Preparing Upsert...", status: "pending" },
      { label: "Restoring Records...", status: "pending" },
      { label: "Completed ✔", status: "pending" },
    ];
    setProgressSteps(steps);
    setProgressTitle(restoreMode === "replace" ? "Restoring (Clean Replace)" : "Restoring (Smart Merge)");
    setProgressDone(false);
    setProgressError("");
    setShowProgress(true);

    try {
      await new Promise((r) => setTimeout(r, 400));

      // Collections to restore based on selection
      const collectionsToRestore = COLLECTIONS.filter(
        col => restoreSelectedKeys.includes(col.key) &&
               ((data[col.key] && Array.isArray(data[col.key])) || (data[col.collectionName] && Array.isArray(data[col.collectionName])))
      );

      if (collectionsToRestore.length === 0) {
        throw new Error("No collections selected for restoration.");
      }

      // Step 2: Clear existing data (only if replace mode is selected!)
      setProgressSteps((prev) => updateStep(prev, 1, "active"));
      if (restoreMode === "replace") {
        for (const col of collectionsToRestore) {
          const snap = await getDocsOfflineSafe(collection(db, col.collectionName));
          if (!snap.empty) {
            const batchLimit = 500;
            const allDocs = snap.docs;
            for (let i = 0; i < allDocs.length; i += batchLimit) {
              const batch = writeBatch(db);
              allDocs.slice(i, i + batchLimit).forEach((d: any) => batch.delete(d.ref));
              await batch.commit();
            }
          }
        }
      }

      // Step 3: Write restored data
      setProgressSteps((prev) => updateStep(prev, 2, "active"));
      let totalRestoredDocs = 0;

      for (const col of collectionsToRestore) {
        const records = data[col.key] || data[col.collectionName];
        if (!records || records.length === 0) continue;

        const batchLimit = 500;
        for (let i = 0; i < records.length; i += batchLimit) {
          const batch = writeBatch(db);
          records.slice(i, i + batchLimit).forEach((record: any) => {
            const { id, _docId, ...rest } = record;
            const docId = id || _docId;
            const docRef = docId
              ? doc(db, col.collectionName, String(docId))
              : doc(collection(db, col.collectionName));
            const cleanedRest = convertDates(rest);
            batch.set(docRef, cleanedRest, { merge: restoreMode === "merge" });
            totalRestoredDocs++;
          });
          await batch.commit();
        }
      }

      // Restore AsyncStorage data if present
      if (data._asyncStorage && typeof data._asyncStorage === "object") {
        const pairs: [string, string][] = [];
        for (const [k, v] of Object.entries(data._asyncStorage)) {
          if (v !== null && typeof v === "string" && !k.startsWith("data_mgmt_activity_logs")) {
            pairs.push([k, v]);
          }
        }
        if (pairs.length > 0) {
          try {
            await AsyncStorage.multiSet(pairs);
            await loadSettings();
          } catch (storageErr) {
            console.warn("Failed to restore AsyncStorage values", storageErr);
          }
        }
      }

      // Step 4: Done
      setProgressSteps((prev) => updateStep(prev, 3, "done"));
      setProgressDone(true);
      setPendingRestoreData(null);
      logActivity(
        "import",
        `Restored Backup (${restoreMode === "replace" ? "Clean Replace" : "Smart Merge"})`,
        `Restored ${totalRestoredDocs} documents into ${collectionsToRestore.length} tables`,
        totalRestoredDocs
      );
    } catch (error: any) {
      setProgressError(error.message || "Restore failed");
    }
  };

  // --- VALIDATION ---
  const validateBackup = (data: any): { valid: boolean; message: string; collectionsFound: string[] } => {
    if (!data || typeof data !== "object") {
      return { valid: false, message: "Invalid backup file format.", collectionsFound: [] };
    }

    const allKnownKeys = [...COLLECTIONS.map(c => c.key), ...COLLECTIONS.map(c => c.collectionName)];
    const foundKeys = allKnownKeys.filter((key) => data[key] !== undefined && Array.isArray(data[key]));

    if (foundKeys.length === 0) {
      return { valid: false, message: "No recognized database tables found in this file.", collectionsFound: [] };
    }

    return { valid: true, message: "", collectionsFound: foundKeys };
  };

  // --- DELETE OLD BACKUPS ---
  const deleteOldBackupsInternal = async () => {
    try {
      await ensureBackupDirExists();
      const files = await FileSystem.readDirectoryAsync(BACKUP_DIR_URI);
      const jsonFiles: { name: string; uri: string; time: number }[] = [];

      for (const name of files) {
        if (name.endsWith(".json")) {
          const fileUri = `${BACKUP_DIR_URI}${name}`;
          const fileInfo = (await FileSystem.getInfoAsync(fileUri)) as any;
          jsonFiles.push({ name, uri: fileUri, time: fileInfo.modificationTime || 0 });
        }
      }

      if (jsonFiles.length <= MAX_BACKUPS) return;

      jsonFiles.sort((a, b) => b.time - a.time);
      const toDelete = jsonFiles.slice(MAX_BACKUPS);
      for (const item of toDelete) {
        await FileSystem.deleteAsync(item.uri, { idempotent: true });
      }
    } catch (e) {
      // ignore
    }
  };

  const deleteOldBackups = async () => {
    try {
      await ensureBackupDirExists();
      const files = await FileSystem.readDirectoryAsync(BACKUP_DIR_URI);
      const jsonFiles: { name: string; uri: string; time: number }[] = [];

      for (const name of files) {
        if (name.endsWith(".json")) {
          const fileUri = `${BACKUP_DIR_URI}${name}`;
          const fileInfo = (await FileSystem.getInfoAsync(fileUri)) as any;
          jsonFiles.push({ name, uri: fileUri, time: fileInfo.modificationTime || 0 });
        }
      }

      if (jsonFiles.length <= MAX_BACKUPS) {
        Alert.alert("Cleanup", `Only ${jsonFiles.length} backup(s) found. No cleanup needed.`);
        return;
      }

      jsonFiles.sort((a, b) => b.time - a.time);
      const toDelete = jsonFiles.slice(MAX_BACKUPS);
      for (const item of toDelete) {
        await FileSystem.deleteAsync(item.uri, { idempotent: true });
      }

      loadBackupHistory();
      logActivity("cleanup", "Deleted Old Backups", `Removed ${toDelete.length} old backup files`);
      Alert.alert("Cleanup Complete", `Deleted ${toDelete.length} old backup(s). Keeping latest ${MAX_BACKUPS}.`);
    } catch (e: any) {
      Alert.alert("Error", "Failed to clean up old backups.");
    }
  };

  // --- UPLOAD TO FIREBASE ---
  const uploadToFirebase = async () => {
    if (backupHistory.length === 0) {
      Alert.alert("No Backup", "Create a backup first before uploading to Firebase.");
      return;
    }
    const latest = backupHistory[0];
    setUploading(true);
    try {
      const userId = auth.currentUser?.uid || "unknown";
      const fileContent = await FileSystem.readAsStringAsync(latest.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const storageRef = ref(storage, `backups/${userId}/${latest.name}`);
      await uploadString(storageRef, fileContent, "raw", {
        contentType: "application/json",
      });
      setUploading(false);
      logActivity("export", "Cloud Backup Sync", `Uploaded "${latest.name}" to Firebase Storage`);
      Alert.alert("Upload Complete", `"${latest.name}" has been uploaded to Firebase Storage.`);
    } catch (error: any) {
      setUploading(false);
      Alert.alert("Upload Failed", error.message || "Could not upload backup to Firebase.");
    }
  };

  // --- SHARE BACKUP ---
  const shareBackup = async (fileInfo: BackupFileInfo) => {
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Sharing Unavailable", "Sharing is not available on this device.");
        return;
      }
      await Sharing.shareAsync(fileInfo.uri, {
        mimeType: fileInfo.name.endsWith(".csv") ? "text/csv" : "application/json",
        dialogTitle: "Share Backup",
      });
    } catch (e: any) {
      // ignore
    }
  };

  // --- DELETE SINGLE BACKUP ---
  const deleteSingleBackup = (fileInfo: BackupFileInfo) => {
    Alert.alert("Delete Backup", `Delete "${fileInfo.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await FileSystem.deleteAsync(fileInfo.uri, { idempotent: true });
            loadBackupHistory();
            logActivity("cleanup", "Deleted Backup File", `Removed ${fileInfo.name}`);
          } catch (e) {
            // ignore
          }
        },
      },
    ]);
  };

  // --- PIN HANDLERS ---
  const handlePinSubmit = async () => {
    if (pinAction === "setup") {
      if (pinStep === "enter") {
        if (pinInput.length < 4) {
          Alert.alert("Invalid PIN", "PIN must be at least 4 digits.");
          return;
        }
        setPinConfirm(pinInput);
        setPinInput("");
        setPinStep("confirm");
        return;
      }
      if (pinInput !== pinConfirm) {
        Alert.alert("PIN Mismatch", "PINs do not match. Try again.");
        setPinInput("");
        setPinStep("enter");
        setPinConfirm("");
        return;
      }
      await AsyncStorage.setItem(STORAGE_KEYS.pinEnabled, "true");
      await AsyncStorage.setItem(STORAGE_KEYS.pinValue, pinInput);
      setPinEnabled(true);
      setSavedPin(pinInput);
      setShowPinModal(false);
      setPinInput("");
      setPinConfirm("");
      Alert.alert("PIN Set", "Your backup PIN has been enabled.");
    } else if (pinAction === "disable") {
      if (pinInput !== savedPin) {
        Alert.alert("Wrong PIN", "Incorrect PIN. Cannot disable.");
        setPinInput("");
        return;
      }
      await AsyncStorage.setItem(STORAGE_KEYS.pinEnabled, "false");
      await AsyncStorage.removeItem(STORAGE_KEYS.pinValue);
      setPinEnabled(false);
      setSavedPin("");
      setShowPinModal(false);
      setPinInput("");
      Alert.alert("PIN Removed", "Backup PIN protection has been disabled.");
    } else if (pinAction === "verify-backup") {
      if (pinInput !== savedPin) {
        Alert.alert("Wrong PIN", "Incorrect PIN.");
        setPinInput("");
        return;
      }
      setShowPinModal(false);
      setPinInput("");
      await executeCreateBackup(false);
    } else if (pinAction === "verify-restore") {
      if (pinInput !== savedPin) {
        Alert.alert("Wrong PIN", "Incorrect PIN.");
        setPinInput("");
        return;
      }
      setShowPinModal(false);
      setPinInput("");
      setShowRestoreModal(true);
      loadBackupHistory();
    }
  };

  const handlePinToggle = (val: boolean) => {
    if (val) {
      setPinAction("setup");
      setPinInput("");
      setPinStep("enter");
      setPinConfirm("");
      setShowPinModal(true);
    } else {
      setPinAction("disable");
      setPinInput("");
      setPinStep("enter");
      setShowPinModal(true);
    }
  };

  // Scope filter calculation
  const filteredScopeCategories = useMemo(() => {
    if (!scopeSearch.trim()) return COLLECTION_CATEGORIES;
    const q = scopeSearch.toLowerCase().trim();
    return COLLECTION_CATEGORIES.map((cat) => {
      const matchingKeys = cat.keys.filter((key) => {
        const col = COLLECTIONS.find((c) => c.key === key);
        return (
          cat.name.toLowerCase().includes(q) ||
          col?.label.toLowerCase().includes(q) ||
          col?.collectionName.toLowerCase().includes(q)
        );
      });
      return { ...cat, keys: matchingKeys };
    }).filter((cat) => cat.keys.length > 0);
  }, [scopeSearch]);

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute>
      <AnimatedPage>
        {/* ── File Inspector Modal ── */}
        <Modal visible={inspectFile !== null} transparent animationType="slide">
          <View style={styles.modalBg}>
            <View style={styles.restoreListModal}>
              <View style={styles.restoreModalHeader}>
                <MaterialIcons name="insert-drive-file" size={26} color={colors.accent.primary} />
                <Text style={styles.restoreModalTitle} numberOfLines={1}>
                  {inspectFile?.name}
                </Text>
                <Pressable style={styles.restoreModalClose} onPress={() => setInspectFile(null)}>
                  <MaterialIcons name="close" size={22} color={colors.text.secondary} />
                </Pressable>
              </View>

              <View style={{ gap: 8, marginBottom: 16, width: "100%" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, color: colors.text.muted, fontWeight: "600" }}>File Size:</Text>
                  <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: "700" }}>
                    {inspectFile ? formatFileSize(inspectFile.size) : "-"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, color: colors.text.muted, fontWeight: "600" }}>Creation Date:</Text>
                  <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: "700" }}>
                    {inspectFile ? formatDate(inspectFile.modificationTime) : "-"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, color: colors.text.muted, fontWeight: "600" }}>Creation Time:</Text>
                  <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: "700" }}>
                    {inspectFile ? formatTime(inspectFile.modificationTime) : "-"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, color: colors.text.muted, fontWeight: "600" }}>Format:</Text>
                  <Text style={{ fontSize: 13, color: colors.accent.primary, fontWeight: "800" }}>
                    {inspectFile?.name.endsWith(".csv") ? "CSV Report" : "JSON Backup"}
                  </Text>
                </View>
              </View>

              <View style={{ gap: 8, width: "100%" }}>
                <Pressable
                  style={[styles.browseFilesBtn, { backgroundColor: colors.accent.success, marginBottom: 0 }]}
                  onPress={() => {
                    const f = inspectFile;
                    setInspectFile(null);
                    if (f) handleRestoreFromHistory(f);
                  }}
                >
                  <MaterialIcons name="restore" size={18} color="#fff" />
                  <Text style={styles.browseFilesText}>Restore From File</Text>
                </Pressable>

                <Pressable
                  style={[styles.browseFilesBtn, { backgroundColor: colors.accent.primary, marginBottom: 0 }]}
                  onPress={() => {
                    const f = inspectFile;
                    setInspectFile(null);
                    if (f) shareBackup(f);
                  }}
                >
                  <MaterialIcons name="share" size={18} color="#fff" />
                  <Text style={styles.browseFilesText}>Share Backup File</Text>
                </Pressable>

                <Pressable
                  style={[styles.browseFilesBtn, { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.subtle, marginBottom: 0 }]}
                  onPress={() => setInspectFile(null)}
                >
                  <Text style={[styles.browseFilesText, { color: colors.text.primary }]}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Progress Modal ── */}
        <Modal visible={showProgress} transparent animationType="fade">
          <Animated.View style={[styles.modalBg, { opacity: progressFadeAnim }]}>
            <View style={styles.progressModal}>
              <View style={styles.progressIconWrap}>
                {progressDone ? (
                  <MaterialIcons name="check-circle" size={48} color={colors.accent.success} />
                ) : progressError ? (
                  <MaterialIcons name="error" size={48} color={colors.accent.danger} />
                ) : (
                  <ActivityIndicator size="large" color={colors.accent.primary} />
                )}
              </View>
              <Text style={styles.progressTitle}>{progressTitle}</Text>

              <View style={styles.stepsContainer}>
                {progressSteps.map((step, idx) => (
                  <View key={idx} style={styles.stepRow}>
                    <View style={[
                      styles.stepDot,
                      step.status === "done" && { backgroundColor: colors.accent.success },
                      step.status === "active" && { backgroundColor: colors.accent.primary },
                    ]}>
                      {step.status === "done" && (
                        <MaterialIcons name="check" size={10} color="#fff" />
                      )}
                    </View>
                    <Animated.Text style={[
                      styles.stepLabel,
                      step.status === "done" && { color: colors.accent.success },
                      step.status === "active" && { color: colors.text.primary, opacity: pulseAnim },
                    ]}>
                      {step.label}
                    </Animated.Text>
                  </View>
                ))}
              </View>

              {progressError ? (
                <Text style={styles.progressErrorText}>{progressError}</Text>
              ) : null}

              {(progressDone || progressError) && (
                <Pressable
                  style={[styles.progressCloseBtn, progressError && { backgroundColor: colors.accent.danger }]}
                  onPress={() => setShowProgress(false)}
                >
                  <Text style={styles.progressCloseBtnText}>
                    {progressError ? "Close" : "Done"}
                  </Text>
                </Pressable>
              )}
            </View>
          </Animated.View>
        </Modal>

        {/* ── Restore Backup Selection Modal ── */}
        <Modal visible={showRestoreModal} transparent animationType="slide">
          <View style={styles.modalBg}>
            <View style={styles.restoreListModal}>
              <View style={styles.restoreModalHeader}>
                <MaterialIcons name="restore" size={26} color={colors.accent.success} />
                <Text style={styles.restoreModalTitle}>Restore Backup</Text>
                <Pressable style={styles.restoreModalClose} onPress={() => setShowRestoreModal(false)}>
                  <MaterialIcons name="close" size={22} color={colors.text.secondary} />
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [styles.browseFilesBtn, pressed && styles.btnPressed]}
                onPress={executeRestorePicker}
              >
                <MaterialIcons name="folder-open" size={18} color="#fff" />
                <Text style={styles.browseFilesText}>Browse Device Files</Text>
              </Pressable>

              <Text style={styles.recentBackupsHeading}>Saved Local Backups</Text>

              {scanningBackups ? (
                <View style={styles.loadingBackupsWrap}>
                  <ActivityIndicator size="small" color={colors.accent.success} />
                  <Text style={styles.loadingBackupsText}>Scanning backups...</Text>
                </View>
              ) : backupHistory.length === 0 ? (
                <View style={styles.noBackupsWrap}>
                  <Text style={styles.noBackupsText}>No backup files found on device.</Text>
                  <Pressable
                    style={({ pressed }) => [styles.createBackupBtn, pressed && styles.btnPressed]}
                    onPress={() => {
                      setShowRestoreModal(false);
                      createBackup(false);
                    }}
                  >
                    <MaterialIcons name="add" size={18} color="#fff" />
                    <Text style={styles.createBackupBtnText}>Create Backup</Text>
                  </Pressable>
                </View>
              ) : (
                <ScrollView style={styles.restoreListScroll} showsVerticalScrollIndicator={true}>
                  {backupHistory.map((file) => (
                    <View key={file.name} style={styles.restoreItemCard}>
                      <View style={styles.restoreItemHeader}>
                        <MaterialIcons
                          name={file.name.endsWith(".csv") ? "table-chart" : "code"}
                          size={22}
                          color={file.name.endsWith(".csv") ? colors.accent.warning : colors.accent.success}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.restoreItemName} numberOfLines={1}>{file.name}</Text>
                          <View style={styles.restoreItemMetaRow}>
                            <Text style={styles.restoreItemMetaText}>{formatDate(file.modificationTime)}</Text>
                            <Text style={styles.restoreItemMetaDot}>•</Text>
                            <Text style={styles.restoreItemMetaText}>{formatTime(file.modificationTime)}</Text>
                            <Text style={styles.restoreItemMetaDot}>•</Text>
                            <Text style={styles.restoreItemMetaText}>{formatFileSize(file.size)}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.restoreItemActions}>
                        <Pressable
                          style={({ pressed }) => [styles.itemActionBtn, styles.itemRestoreBtn, pressed && styles.btnPressed]}
                          onPress={() => handleRestoreFromHistory(file)}
                        >
                          <MaterialIcons name="restore" size={14} color="#fff" />
                          <Text style={styles.itemActionBtnText}>Restore</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [styles.itemActionBtn, styles.itemShareBtn, pressed && styles.btnPressed]}
                          onPress={() => shareBackup(file)}
                        >
                          <MaterialIcons name="share" size={14} color="#fff" />
                          <Text style={styles.itemActionBtnText}>Share</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [styles.itemActionBtn, styles.itemDeleteBtn, pressed && styles.btnPressed]}
                          onPress={() => deleteSingleBackup(file)}
                        >
                          <MaterialIcons name="delete" size={14} color="#fff" />
                          <Text style={styles.itemActionBtnText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* ── Restore Confirmation & Selective Options Modal ── */}
        <Modal visible={showRestoreConfirm} transparent animationType="slide">
          <View style={styles.modalBg}>
            <View style={[styles.restoreModal, { maxHeight: "88%" }]}>
              <View style={styles.restoreWarningIcon}>
                <MaterialIcons name="restore" size={36} color="#f59e0b" />
              </View>
              <Text style={styles.restoreTitle}>Restore Backup</Text>
              <Text style={styles.restoreDesc}>
                Select the tables you wish to restore and choose your preferred import mode.
              </Text>

              {/* Restore Mode Selector: Smart Merge vs Clean Replace */}
              <View style={styles.restoreModeContainer}>
                <Pressable
                  style={[
                    styles.restoreModeCard,
                    restoreMode === "merge" && { borderColor: colors.accent.primary, backgroundColor: `${colors.accent.primary}0C` },
                  ]}
                  onPress={() => setRestoreMode("merge")}
                >
                  <MaterialIcons
                    name="merge-type"
                    size={20}
                    color={restoreMode === "merge" ? colors.accent.primary : colors.text.muted}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.restoreModeTitle, restoreMode === "merge" && { color: colors.accent.primary }]}>
                      Smart Merge (Upsert)
                    </Text>
                    <Text style={styles.restoreModeDesc}>
                      Updates existing records & inserts new ones. Safe for live stores.
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  style={[
                    styles.restoreModeCard,
                    restoreMode === "replace" && { borderColor: colors.accent.danger, backgroundColor: "#fee2e220" },
                  ]}
                  onPress={() => setRestoreMode("replace")}
                >
                  <MaterialIcons
                    name="published-with-changes"
                    size={20}
                    color={restoreMode === "replace" ? colors.accent.danger : colors.text.muted}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.restoreModeTitle, restoreMode === "replace" && { color: colors.accent.danger }]}>
                      Clean Wipe & Replace
                    </Text>
                    <Text style={styles.restoreModeDesc}>
                      Clears selected tables before importing backup copies.
                    </Text>
                  </View>
                </Pressable>
              </View>

              {/* Table Selection Checklist */}
              {pendingRestoreData && (
                <View style={styles.restorePreview}>
                  <Text style={styles.restorePreviewTitle}>
                    Select Collections ({restoreSelectedKeys.length} selected):
                  </Text>
                  <ScrollView style={styles.restorePreviewScroll} nestedScrollEnabled showsVerticalScrollIndicator={true}>
                    {COLLECTIONS.filter(c => (pendingRestoreData[c.key] && Array.isArray(pendingRestoreData[c.key])) || (pendingRestoreData[c.collectionName] && Array.isArray(pendingRestoreData[c.collectionName]))).map(c => {
                      const records = pendingRestoreData[c.key] || pendingRestoreData[c.collectionName] || [];
                      const isChecked = restoreSelectedKeys.includes(c.key);
                      return (
                        <Pressable
                          key={c.key}
                          style={styles.restorePreviewRow}
                          onPress={() => {
                            if (isChecked) {
                              setRestoreSelectedKeys(prev => prev.filter(k => k !== c.key));
                            } else {
                              setRestoreSelectedKeys(prev => [...prev, c.key]);
                            }
                          }}
                        >
                          <MaterialIcons
                            name={isChecked ? "check-box" : "check-box-outline-blank"}
                            size={18}
                            color={isChecked ? colors.accent.primary : colors.text.muted}
                          />
                          <Text style={[styles.restorePreviewLabel, isChecked && { fontWeight: "700" }]}>{c.label}</Text>
                          <Text style={styles.restorePreviewCount}>{records.length} docs</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.restoreActions}>
                <Pressable
                  style={styles.restoreCancelBtn}
                  onPress={() => {
                    setShowRestoreConfirm(false);
                    setPendingRestoreData(null);
                  }}
                >
                  <Text style={styles.restoreCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={restoreSelectedKeys.length === 0}
                  style={[
                    styles.restoreConfirmBtn,
                    { backgroundColor: restoreMode === "replace" ? colors.accent.danger : colors.accent.success },
                    restoreSelectedKeys.length === 0 && { opacity: 0.5 },
                  ]}
                  onPress={executeRestore}
                >
                  <MaterialIcons name="restore" size={18} color="#fff" />
                  <Text style={styles.restoreConfirmText}>
                    Restore ({restoreSelectedKeys.length})
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── PIN Modal ── */}
        <Modal visible={showPinModal} transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.pinModal}>
              <View style={styles.pinIconWrap}>
                <MaterialIcons
                  name={pinAction === "setup" ? "lock" : pinAction === "disable" ? "lock-open" : "vpn-key"}
                  size={32}
                  color={colors.accent.primary}
                />
              </View>
              <Text style={styles.pinTitle}>
                {pinAction === "setup"
                  ? pinStep === "confirm" ? "Confirm Your PIN" : "Set Backup PIN"
                  : pinAction === "disable"
                    ? "Enter PIN to Disable"
                    : "Enter Backup PIN"}
              </Text>
              <Text style={styles.pinDesc}>
                {pinAction === "setup" && pinStep === "enter"
                  ? "Choose a 4+ digit PIN to protect your backups."
                  : pinAction === "setup" && pinStep === "confirm"
                    ? "Re-enter the PIN to confirm."
                    : "Enter your PIN to continue."}
              </Text>
              <TextInput
                style={styles.pinInput}
                value={pinInput}
                onChangeText={setPinInput}
                placeholder="Enter PIN"
                placeholderTextColor={colors.text.muted}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
              />
              <View style={styles.pinActions}>
                <Pressable
                  style={styles.pinCancelBtn}
                  onPress={() => {
                    setShowPinModal(false);
                    setPinInput("");
                    setPinConfirm("");
                  }}
                >
                  <Text style={styles.pinCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.pinSubmitBtn, !pinInput && { opacity: 0.5 }]}
                  onPress={handlePinSubmit}
                  disabled={!pinInput}
                >
                  <Text style={styles.pinSubmitText}>
                    {pinAction === "setup" && pinStep === "enter" ? "Next" : "Confirm"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Main Content ── */}
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <BackButton label="Settings" onPress={() => router.push("/settings")} style={{ marginBottom: 12 }} />
            <View style={styles.headerTitleRow}>
              <MaterialIcons name="cloud-sync" size={28} color={colors.accent.success} />
              <Text style={styles.title}>Backup & Restore</Text>
            </View>
            <Text style={styles.subtitle}>
              Create, manage, encrypt, and restore offline backups of your business records.
            </Text>
          </View>

          {/* ── Quick Actions ── */}
          <View style={styles.quickActionsCard}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.createBtn, pressed && styles.btnPressed]}
              onPress={() => {
                if (exportFormat === "csv") {
                  exportCSV();
                } else {
                  createBackup(false);
                }
              }}
            >
              <View style={styles.actionBtnIcon}>
                <MaterialIcons name="backup" size={26} color="#fff" />
              </View>
              <Text style={styles.actionBtnLabel}>Create Backup</Text>
              <Text style={styles.actionBtnHint}>{exportFormat === "csv" ? "CSV Report" : "Full JSON Snapshot"}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.restoreBtn, pressed && styles.btnPressed]}
              onPress={restoreBackup}
            >
              <View style={[styles.actionBtnIcon, { backgroundColor: "rgba(59,130,246,0.2)" }]}>
                <MaterialIcons name="restore" size={26} color="#fff" />
              </View>
              <Text style={styles.actionBtnLabel}>Restore Backup</Text>
              <Text style={styles.actionBtnHint}>From File or History</Text>
            </Pressable>
          </View>

          {/* ── Export Format ── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="swap-horiz" size={20} color={colors.accent.primary} />
              <Text style={styles.sectionTitle}>Export Format</Text>
            </View>
            <View style={styles.formatRow}>
              <Pressable
                style={[styles.formatOption, exportFormat === "json" && styles.formatOptionActive]}
                onPress={() => setExportFormat("json")}
              >
                <MaterialIcons
                  name="code"
                  size={20}
                  color={exportFormat === "json" ? colors.accent.primary : colors.text.muted}
                />
                <Text style={[styles.formatText, exportFormat === "json" && styles.formatTextActive]}>
                  JSON
                </Text>
                <Text style={styles.formatHint}>Complete Backup</Text>
              </Pressable>
              <Pressable
                style={[styles.formatOption, exportFormat === "csv" && styles.formatOptionActive]}
                onPress={() => setExportFormat("csv")}
              >
                <MaterialIcons
                  name="grid-on"
                  size={20}
                  color={exportFormat === "csv" ? colors.accent.primary : colors.text.muted}
                />
                <Text style={[styles.formatText, exportFormat === "csv" && styles.formatTextActive]}>
                  CSV
                </Text>
                <Text style={styles.formatHint}>Spreadsheet Report</Text>
              </Pressable>
            </View>
          </View>

          {/* ── Backup Scope & Collection Selector ── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="checklist" size={20} color={colors.accent.primary} />
              <Text style={styles.sectionTitle}>Backup Scope</Text>
              <Text style={styles.sectionBadge}>{selectedCollections.size}/{COLLECTIONS.length}</Text>
            </View>

            {/* Scope Search Box */}
            <View style={styles.scopeSearchBox}>
              <MaterialIcons name="search" size={18} color={colors.text.muted} />
              <TextInput
                value={scopeSearch}
                onChangeText={setScopeSearch}
                placeholder="Search collections..."
                placeholderTextColor={colors.text.muted}
                style={styles.scopeSearchInput}
              />
              {scopeSearch ? (
                <Pressable onPress={() => setScopeSearch("")}>
                  <MaterialIcons name="cancel" size={16} color={colors.text.muted} />
                </Pressable>
              ) : null}
            </View>

            <Pressable style={styles.selectAllRow} onPress={toggleAllCollections}>
              <MaterialIcons
                name={allSelected ? "check-box" : "check-box-outline-blank"}
                size={22}
                color={allSelected ? colors.accent.primary : colors.text.muted}
              />
              <Text style={[styles.selectAllText, allSelected && { color: colors.accent.primary }]}>
                {allSelected ? "Deselect All" : "Select All Collections"}
              </Text>
            </Pressable>

            {filteredScopeCategories.map(cat => {
              const catAllSelected = cat.keys.every(k => selectedCollections.has(k));
              const catSomeSelected = cat.keys.some(k => selectedCollections.has(k));
              return (
                <View key={cat.name} style={styles.categoryBlock}>
                  <Pressable style={styles.categoryHeader} onPress={() => toggleCategory(cat.keys)}>
                    <MaterialIcons
                      name={catAllSelected ? "check-box" : catSomeSelected ? "indeterminate-check-box" : "check-box-outline-blank"}
                      size={20}
                      color={catAllSelected ? colors.accent.primary : catSomeSelected ? colors.accent.warning : colors.text.muted}
                    />
                    <MaterialIcons name={cat.icon} size={16} color={colors.text.secondary} />
                    <Text style={styles.categoryName}>{cat.name}</Text>
                    <Text style={styles.categoryCounts}>
                      {cat.keys.filter(k => selectedCollections.has(k)).length}/{cat.keys.length}
                    </Text>
                  </Pressable>
                  <View style={styles.categoryItems}>
                    {cat.keys.map(key => {
                      const col = COLLECTIONS.find(c => c.key === key);
                      if (!col) return null;
                      const isSelected = selectedCollections.has(key);
                      return (
                        <Pressable key={key} style={styles.collectionToggleRow} onPress={() => toggleCollection(key)}>
                          <MaterialIcons
                            name={isSelected ? "check-box" : "check-box-outline-blank"}
                            size={18}
                            color={isSelected ? colors.accent.success : colors.text.muted}
                          />
                          <Text style={[styles.collectionToggleLabel, isSelected && { color: colors.text.primary }]}>
                            {col.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── Automatic Scheduled Backup ── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="schedule" size={20} color={colors.accent.warning} />
              <Text style={styles.sectionTitle}>Automatic Scheduled Backup</Text>
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Enable Background Auto-Backup</Text>
              <Switch
                value={autoBackupEnabled}
                onValueChange={(val) => {
                  setAutoBackupEnabled(val);
                  saveAutoBackupSettings(val, autoFrequency);
                }}
                trackColor={{ false: colors.border.subtle, true: colors.accent.success + "60" }}
                thumbColor={autoBackupEnabled ? colors.accent.success : colors.text.muted}
              />
            </View>
            {autoBackupEnabled && (
              <View style={styles.freqRow}>
                {(["daily", "weekly", "monthly"] as FrequencyOption[]).map((freq) => (
                  <Pressable
                    key={freq}
                    style={[styles.freqChip, autoFrequency === freq && styles.freqChipActive]}
                    onPress={() => {
                      setAutoFrequency(freq);
                      saveAutoBackupSettings(autoBackupEnabled, freq);
                    }}
                  >
                    <Text style={[styles.freqChipText, autoFrequency === freq && styles.freqChipTextActive]}>
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {autoBackupEnabled && (
              <Text style={styles.autoHint}>
                Maintains rolling snapshots of the latest {MAX_BACKUPS} backups.
              </Text>
            )}
          </View>

          {/* ── Saved Backup Files History ── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="history" size={20} color={colors.accent.info} />
              <Text style={styles.sectionTitle}>Saved Local Backups</Text>
              <Text style={styles.sectionBadge}>{backupHistory.length}</Text>
            </View>
            {backupHistory.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="cloud-off" size={40} color={colors.text.muted} />
                <Text style={styles.emptyText}>No backups created yet</Text>
                <Text style={styles.emptyHint}>Create your first backup above to store it here.</Text>
              </View>
            ) : (
              backupHistory.map((file, idx) => (
                <View key={file.name} style={[styles.historyItem, idx === backupHistory.length - 1 && { borderBottomWidth: 0 }]}>
                  <Pressable
                    style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
                    onPress={() => setInspectFile(file)}
                  >
                    <View style={styles.historyIconWrap}>
                      <MaterialIcons
                        name={file.name.endsWith(".csv") ? "grid-on" : "code"}
                        size={20}
                        color={file.name.endsWith(".csv") ? colors.accent.warning : colors.accent.success}
                      />
                    </View>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyName} numberOfLines={1}>{file.name}</Text>
                      <View style={styles.historyMetaRow}>
                        <Text style={styles.historyMeta}>{formatDate(file.modificationTime)}</Text>
                        <Text style={styles.historyMetaDot}>•</Text>
                        <Text style={styles.historyMeta}>{formatTime(file.modificationTime)}</Text>
                        <Text style={styles.historyMetaDot}>•</Text>
                        <Text style={styles.historyMeta}>{formatFileSize(file.size)}</Text>
                      </View>
                    </View>
                  </Pressable>
                  <View style={styles.historyActions}>
                    <Pressable style={styles.historyActionBtn} onPress={() => setInspectFile(file)}>
                      <MaterialIcons name="visibility" size={18} color={colors.accent.primary} />
                    </Pressable>
                    <Pressable style={styles.historyActionBtn} onPress={() => shareBackup(file)}>
                      <MaterialIcons name="share" size={18} color={colors.accent.primary} />
                    </Pressable>
                    <Pressable style={styles.historyActionBtn} onPress={() => deleteSingleBackup(file)}>
                      <MaterialIcons name="delete-outline" size={18} color={colors.accent.danger} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* ── Summary & Metrics ── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="info-outline" size={20} color={colors.accent.info} />
              <Text style={styles.sectionTitle}>Backup Metrics Summary</Text>
            </View>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{selectedCollections.size}</Text>
                <Text style={styles.summaryLabel}>Selected Scope</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{COLLECTIONS.length}</Text>
                <Text style={styles.summaryLabel}>Total Tables</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{backupHistory.length}</Text>
                <Text style={styles.summaryLabel}>Saved Files</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {backupHistory.length > 0 ? formatFileSize(backupHistory[0].size) : "—"}
                </Text>
                <Text style={styles.summaryLabel}>Latest File Size</Text>
              </View>
            </View>
            {backupHistory.length > 0 && (
              <View style={styles.lastBackupRow}>
                <MaterialIcons name="access-time" size={14} color={colors.text.muted} />
                <Text style={styles.lastBackupText}>
                  Latest snapshot: {formatDate(backupHistory[0].modificationTime)} at {formatTime(backupHistory[0].modificationTime)}
                </Text>
              </View>
            )}
          </View>

          {/* ── Cloud Firebase Sync ── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="cloud-upload" size={20} color={colors.accent.primary} />
              <Text style={styles.sectionTitle}>Cloud Firebase Storage Sync</Text>
            </View>
            <Text style={styles.syncDesc}>
              Upload your latest local backup file to Firebase Cloud Storage for secure off-device safekeeping.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.uploadBtn, pressed && styles.btnPressed, uploading && { opacity: 0.6 }]}
              onPress={uploadToFirebase}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialIcons name="cloud-upload" size={20} color="#fff" />
              )}
              <Text style={styles.uploadBtnText}>
                {uploading ? "Syncing..." : "Sync Backup to Cloud"}
              </Text>
            </Pressable>
          </View>

          {/* ── Security & PIN Encryption ── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="security" size={20} color={colors.accent.success} />
              <Text style={styles.sectionTitle}>Security & PIN Protection</Text>
            </View>
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>PIN Encryption</Text>
                <Text style={styles.switchHint}>Encrypt backup files with a secret PIN code</Text>
              </View>
              <Switch
                value={pinEnabled}
                onValueChange={handlePinToggle}
                trackColor={{ false: colors.border.subtle, true: colors.accent.success + "60" }}
                thumbColor={pinEnabled ? colors.accent.success : colors.text.muted}
              />
            </View>
            {pinEnabled && (
              <View style={styles.pinStatusBadge}>
                <MaterialIcons name="lock" size={14} color={colors.accent.success} />
                <Text style={styles.pinStatusText}>PIN protection active</Text>
              </View>
            )}
          </View>

          {/* ── Danger Zone ── */}
          <View style={[styles.sectionCard, styles.dangerCard]}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="warning" size={20} color={colors.accent.danger} />
              <Text style={[styles.sectionTitle, { color: colors.accent.danger }]}>Maintenance & Cleanup</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.8 }]}
              onPress={deleteOldBackups}
            >
              <MaterialIcons name="delete-sweep" size={20} color={colors.accent.danger} />
              <Text style={styles.dangerBtnText}>Prune Old Backups</Text>
            </Pressable>
            <Text style={styles.dangerHint}>Cleans up backups keeping only the latest {MAX_BACKUPS} files.</Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </AnimatedPage>
    </ProtectedRoute>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const getStyles = (theme: any) => {
  const { colors, spacing, radius, shadows } = theme;

  return StyleSheet.create({
    container: {
      paddingBottom: 30,
      backgroundColor: colors.bg.card,
    },

    // Header
    header: {
      paddingHorizontal: spacing.lg,
      paddingTop: 16,
      paddingBottom: spacing.md,
      backgroundColor: colors.bg.card,
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 6,
    },
    title: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.text.muted,
      lineHeight: 18,
    },

    // Quick Actions
    quickActionsCard: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    actionBtn: {
      flex: 1,
      borderRadius: radius.lg,
      paddingVertical: 18,
      paddingHorizontal: spacing.md,
      alignItems: "center",
      gap: 8,
      ...shadows.card,
    },
    createBtn: {
      backgroundColor: colors.accent.success,
    },
    restoreBtn: {
      backgroundColor: colors.accent.primary,
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    actionBtnIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    actionBtnLabel: {
      fontSize: 15,
      fontWeight: "700",
      color: "#fff",
    },
    actionBtnHint: {
      fontSize: 11,
      fontWeight: "500",
      color: "rgba(255,255,255,0.8)",
    },

    // Section Cards
    sectionCard: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.subtle,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
      flex: 1,
    },
    sectionBadge: {
      backgroundColor: `${colors.accent.primary}18`,
      color: colors.accent.primary,
      fontSize: 12,
      fontWeight: "700",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      overflow: "hidden",
    },

    // Format picker
    formatRow: {
      flexDirection: "row",
      gap: 10,
    },
    formatOption: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.primary,
    },
    formatOptionActive: {
      borderColor: colors.accent.primary,
      backgroundColor: `${colors.accent.primary}0C`,
    },
    formatText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    formatTextActive: {
      color: colors.accent.primary,
      fontWeight: "700",
    },
    formatHint: {
      fontSize: 10,
      fontWeight: "500",
      color: colors.text.muted,
      marginLeft: "auto",
    },

    // Switch rows
    switchRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    switchLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
    },
    switchHint: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },

    // Frequency chips
    freqRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: spacing.md,
    },
    freqChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.md,
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.primary,
    },
    freqChipActive: {
      borderColor: colors.accent.warning,
      backgroundColor: `${colors.accent.warning}15`,
    },
    freqChipText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    freqChipTextActive: {
      color: colors.accent.warning,
      fontWeight: "700",
    },
    autoHint: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: spacing.sm,
      lineHeight: 18,
    },

    // Scope search
    scopeSearchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      paddingHorizontal: 10,
      height: 38,
      marginBottom: 10,
      gap: 6,
    },
    scopeSearchInput: {
      flex: 1,
      fontSize: 12,
      color: colors.text.primary,
    },

    // Scope - Select All
    selectAllRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      marginBottom: spacing.sm,
    },
    selectAllText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },

    // Scope - Category blocks
    categoryBlock: {
      marginBottom: spacing.sm,
    },
    categoryHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 4,
      backgroundColor: colors.bg.primary,
      borderRadius: radius.sm,
      marginBottom: 4,
    },
    categoryName: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
      flex: 1,
    },
    categoryCounts: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
      paddingHorizontal: 6,
    },
    categoryItems: {
      paddingLeft: 20,
    },
    collectionToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 5,
      paddingHorizontal: 4,
    },
    collectionToggleLabel: {
      fontSize: 12,
      fontWeight: "500",
      color: colors.text.muted,
    },

    // Empty state
    emptyState: {
      alignItems: "center",
      paddingVertical: 24,
      gap: 6,
    },
    emptyText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    emptyHint: {
      fontSize: 12,
      color: colors.text.muted,
    },

    // History items
    historyItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      gap: 8,
    },
    historyIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 6,
    },
    historyInfo: {
      flex: 1,
    },
    historyName: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 2,
    },
    historyMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    historyMeta: {
      fontSize: 10,
      fontWeight: "500",
      color: colors.text.muted,
    },
    historyMetaDot: {
      fontSize: 10,
      color: colors.text.muted,
    },
    historyActions: {
      flexDirection: "row",
      gap: 4,
    },
    historyActionBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: "center",
      justifyContent: "center",
    },

    // Summary
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    summaryItem: {
      flex: 1,
      minWidth: "42%" as any,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 10,
      alignItems: "center",
    },
    summaryValue: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 2,
    },
    summaryLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    lastBackupRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    lastBackupText: {
      fontSize: 12,
      fontWeight: "500",
      color: colors.text.muted,
    },

    // Firebase sync
    syncDesc: {
      fontSize: 12,
      color: colors.text.secondary,
      lineHeight: 18,
      marginBottom: spacing.md,
    },
    uploadBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.accent.primary,
      paddingVertical: 12,
      borderRadius: radius.md,
    },
    uploadBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#fff",
    },

    // Security / PIN
    pinStatusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: spacing.md,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      backgroundColor: `${colors.accent.success}18`,
    },
    pinStatusText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.accent.success,
    },

    // Danger zone
    dangerCard: {
      borderColor: `${colors.accent.danger}40`,
    },
    dangerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 11,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.accent.danger,
      backgroundColor: `${colors.accent.danger}15`,
    },
    dangerBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.accent.danger,
    },
    dangerHint: {
      fontSize: 11,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: spacing.sm,
    },

    // Modals
    modalBg: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
    },

    // Progress Modal
    progressModal: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.xl,
      padding: spacing.xxl,
      width: "100%",
      maxWidth: 340,
      alignItems: "center",
      ...shadows.elevated,
    },
    progressIconWrap: {
      marginBottom: spacing.md,
    },
    progressTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: spacing.lg,
      textAlign: "center",
    },
    stepsContainer: {
      alignSelf: "stretch",
      gap: 12,
      marginBottom: spacing.lg,
    },
    stepRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    stepDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.border.subtle,
      alignItems: "center",
      justifyContent: "center",
    },
    stepLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.text.muted,
    },
    progressErrorText: {
      fontSize: 12,
      color: colors.accent.danger,
      textAlign: "center",
      marginBottom: spacing.md,
    },
    progressCloseBtn: {
      backgroundColor: colors.accent.success,
      paddingVertical: 10,
      paddingHorizontal: 28,
      borderRadius: radius.md,
    },
    progressCloseBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#fff",
    },

    // Restore Modal
    restoreModal: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.xl,
      padding: spacing.lg,
      width: "100%",
      maxWidth: 380,
      alignItems: "center",
      ...shadows.elevated,
    },
    restoreWarningIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "#fff7ed",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.md,
    },
    restoreTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 6,
    },
    restoreDesc: {
      fontSize: 12,
      color: colors.text.secondary,
      textAlign: "center",
      lineHeight: 17,
      marginBottom: 12,
    },
    restoreModeContainer: {
      width: "100%",
      gap: 6,
      marginBottom: 12,
    },
    restoreModeCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      backgroundColor: colors.bg.primary,
    },
    restoreModeTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    restoreModeDesc: {
      fontSize: 10,
      color: colors.text.muted,
      lineHeight: 13,
      marginTop: 2,
    },
    restorePreview: {
      alignSelf: "stretch",
      marginBottom: spacing.md,
    },
    restorePreviewTitle: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    restorePreviewScroll: {
      maxHeight: 140,
      backgroundColor: colors.bg.primary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    restorePreviewRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 6,
    },
    restorePreviewLabel: {
      fontSize: 12,
      fontWeight: "500",
      color: colors.text.primary,
      flex: 1,
    },
    restorePreviewCount: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.accent.success,
    },
    restoreActions: {
      flexDirection: "row",
      gap: 10,
      alignSelf: "stretch",
    },
    restoreCancelBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.md,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.primary,
    },
    restoreCancelText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    restoreConfirmBtn: {
      flex: 1,
      flexDirection: "row",
      paddingVertical: 10,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    restoreConfirmText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#fff",
    },

    // PIN Modal
    pinModal: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.xl,
      padding: spacing.xl,
      width: "100%",
      maxWidth: 320,
      alignItems: "center",
      ...shadows.elevated,
    },
    pinIconWrap: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: `${colors.accent.primary}18`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.md,
    },
    pinTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 4,
    },
    pinDesc: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: "center",
      marginBottom: spacing.md,
      lineHeight: 16,
    },
    pinInput: {
      width: "100%",
      backgroundColor: colors.bg.primary,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
      textAlign: "center",
      letterSpacing: 8,
      marginBottom: spacing.md,
    },
    pinActions: {
      flexDirection: "row",
      gap: 10,
      alignSelf: "stretch",
    },
    pinCancelBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.md,
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    pinCancelText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    pinSubmitBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.md,
      alignItems: "center",
      backgroundColor: colors.accent.primary,
    },
    pinSubmitText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#fff",
    },

    // Restore list modal styles
    restoreListModal: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.xl,
      padding: spacing.lg,
      width: "100%",
      maxWidth: 380,
      maxHeight: "80%",
      ...shadows.elevated,
    },
    restoreModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: spacing.md,
    },
    restoreModalTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
      flex: 1,
    },
    restoreModalClose: {
      padding: 4,
    },
    browseFilesBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.accent.success,
      paddingVertical: 11,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    },
    browseFilesText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#fff",
    },
    recentBackupsHeading: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
    loadingBackupsWrap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 20,
    },
    loadingBackupsText: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    noBackupsWrap: {
      alignItems: "center",
      paddingVertical: 20,
      gap: 10,
    },
    noBackupsText: {
      fontSize: 13,
      color: colors.text.muted,
      fontWeight: "500",
    },
    createBackupBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accent.success,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: radius.md,
    },
    createBackupBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#fff",
    },
    restoreListScroll: {
      maxHeight: 260,
    },
    restoreItemCard: {
      backgroundColor: colors.bg.primary,
      borderRadius: radius.md,
      padding: spacing.sm,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    restoreItemHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: spacing.xs,
    },
    restoreItemName: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 2,
    },
    restoreItemMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    restoreItemMetaText: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.text.muted,
    },
    restoreItemMetaDot: {
      fontSize: 10,
      color: colors.text.muted,
    },
    restoreItemActions: {
      flexDirection: "row",
      gap: 4,
      marginTop: 4,
    },
    itemActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 6,
      borderRadius: radius.sm,
      flex: 1,
    },
    itemRestoreBtn: {
      backgroundColor: colors.accent.success,
    },
    itemShareBtn: {
      backgroundColor: colors.accent.primary,
    },
    itemDeleteBtn: {
      backgroundColor: colors.accent.danger,
    },
    itemActionBtnText: {
      fontSize: 10,
      fontWeight: "700",
      color: "#fff",
    },
  });
};

// ─── Export ───────────────────────────────────────────────────────────────────

export default function BackupRestoreRoute() {
  return <BackupRestore />;
}