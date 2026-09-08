/* eslint-disable import/namespace */
import React, { useState, useMemo, useEffect, useCallback } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import {
  collection,
  writeBatch,
  doc,
  getCountFromServer,
  query,
  limit,
} from "firebase/firestore";
import { db } from "../../src/config/firebase";
import { getDocsOfflineSafe } from "../../src/utils/offlineHelpers";
import AnimatedPage from "../components/AnimatedPage";
import BackButton from "../components/BackButton";
import ProtectedRoute from "../components/ProtectedRoute";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../context/ThemeContext";

// ─── Types & Configurations ──────────────────────────────────────────────────

export type CollectionCategory =
  | "Core Business"
  | "Workforce & Payroll"
  | "Expenses & Ledger"
  | "Delivery & Logistics"
  | "Operations & Stock"
  | "Automations & Reminders"
  | "Media & System";

export interface CollectionConfig {
  key: string;
  label: string;
  collectionName: string;
  description: string;
  category: CollectionCategory;
  icon: keyof typeof MaterialIcons.glyphMap;
}

export interface ActivityLogItem {
  id: string;
  action: "export" | "import" | "wipe" | "factory_reset" | "cleanup";
  title: string;
  details: string;
  timestamp: string;
  count?: number;
}

export interface LocalBackupFile {
  name: string;
  uri: string;
  size: number;
  modificationTime: number;
}

const CATEGORIES: Array<"All" | CollectionCategory> = [
  "All",
  "Core Business",
  "Workforce & Payroll",
  "Expenses & Ledger",
  "Delivery & Logistics",
  "Operations & Stock",
  "Automations & Reminders",
  "Media & System",
];

const COLLECTIONS: CollectionConfig[] = [
  // Core Business
  {
    key: "customers",
    label: "Customers",
    collectionName: "customers",
    description: "Client directory, balances, credit terms, and contact profiles.",
    category: "Core Business",
    icon: "people-alt",
  },
  {
    key: "items",
    label: "Inventory Items",
    collectionName: "items",
    description: "Product catalog, stock levels, unit pricing, and dimensions.",
    category: "Core Business",
    icon: "inventory-2",
  },
  {
    key: "orders",
    label: "Orders",
    collectionName: "orders",
    description: "Invoices, transaction bills, sales lines, and dispatch statuses.",
    category: "Core Business",
    icon: "shopping-cart",
  },
  {
    key: "payments",
    label: "Customer Payments",
    collectionName: "payments",
    description: "Customer receipts, cash collections, bank deposits, and credits.",
    category: "Core Business",
    icon: "account-balance-wallet",
  },
  {
    key: "profitTransactions",
    label: "Profit Transactions",
    collectionName: "profitTransactions",
    description: "Gross & net margin entries, line profits, and cost ledgers.",
    category: "Core Business",
    icon: "trending-up",
  },
  {
    key: "profitSummary",
    label: "Profit Summaries",
    collectionName: "profitSummary",
    description: "Monthly aggregation calculations and business performance KPIs.",
    category: "Core Business",
    icon: "analytics",
  },
  {
    key: "users",
    label: "User Profiles & Business Settings",
    collectionName: "users",
    description: "Admin accounts, business metadata, company settings, and preferences.",
    category: "Core Business",
    icon: "business",
  },

  // Workforce & Payroll
  {
    key: "workers",
    label: "Workers",
    collectionName: "workers",
    description: "Staff directory, wage setups, job titles, and worker records.",
    category: "Workforce & Payroll",
    icon: "engineering",
  },
  {
    key: "workerAttendance",
    label: "Worker Attendance",
    collectionName: "workerAttendance",
    description: "Daily shift stamps, regular hours, overtime, and leave logs.",
    category: "Workforce & Payroll",
    icon: "event-available",
  },
  {
    key: "workerPayments",
    label: "Worker Payments",
    collectionName: "workerPayments",
    description: "Wage payouts, salary settlements, and cash disbursements.",
    category: "Workforce & Payroll",
    icon: "payments",
  },
  {
    key: "workerBonuses",
    label: "Worker Bonuses & Incentives",
    collectionName: "workerBonuses",
    description: "Performance bonuses, festival rewards, and shift allowances.",
    category: "Workforce & Payroll",
    icon: "stars",
  },
  {
    key: "contractWorkers",
    label: "Contract Workers",
    collectionName: "contractWorkers",
    description: "Subcontractor profiles, piece-rate contracts, and teams.",
    category: "Workforce & Payroll",
    icon: "handshake",
  },
  {
    key: "contractPayments",
    label: "Contract Worker Payments",
    collectionName: "contractPayments",
    description: "Contract settlements, milestone releases, and vouchers.",
    category: "Workforce & Payroll",
    icon: "receipt",
  },

  // Expenses & Ledger
  {
    key: "expenses",
    label: "Expenses",
    collectionName: "expenses",
    description: "Operational overheads, utility bills, factory maintenance, and taxes.",
    category: "Expenses & Ledger",
    icon: "receipt-long",
  },
  {
    key: "expensePayments",
    label: "Expense Payments",
    collectionName: "expense_payments",
    description: "Outflow cashbook entries, vendor settlements, and receipts.",
    category: "Expenses & Ledger",
    icon: "monetization-on",
  },
  {
    key: "expenseBudgets",
    label: "Expense Budgets",
    collectionName: "expense_budgets",
    description: "Category budget allocations, monthly ceilings, and alerts.",
    category: "Expenses & Ledger",
    icon: "pie-chart",
  },
  {
    key: "recurringExpenses",
    label: "Recurring Expenses",
    collectionName: "recurring_expenses",
    description: "Scheduled recurring rules, subscription templates, and rent schedules.",
    category: "Expenses & Ledger",
    icon: "autorenew",
  },

  // Delivery & Logistics
  {
    key: "deliveryPartners",
    label: "Delivery Partners",
    collectionName: "deliveryPartners",
    description: "Transporter profiles, vehicle details, driver phone numbers.",
    category: "Delivery & Logistics",
    icon: "local-shipping",
  },
  {
    key: "deliveryTrips",
    label: "Delivery Trips",
    collectionName: "deliveryTrips",
    description: "Trip dispatches, route records, item counts, and freight charges.",
    category: "Delivery & Logistics",
    icon: "alt-route",
  },
  {
    key: "deliveryPayments",
    label: "Delivery Payments",
    collectionName: "deliveryPayments",
    description: "Driver payment releases, diesel advances, and balance logs.",
    category: "Delivery & Logistics",
    icon: "price-check",
  },
  {
    key: "deliveryPartnerBonuses",
    label: "Delivery Partner Bonuses",
    collectionName: "deliveryPartnerBonuses",
    description: "Trip allowances, distance bonuses, and driver performance perks.",
    category: "Delivery & Logistics",
    icon: "loyalty",
  },
  {
    key: "moneyCollectors",
    label: "Money Collectors",
    collectionName: "moneyCollectors",
    description: "Field collection agents, assigned routes, and handover logs.",
    category: "Delivery & Logistics",
    icon: "account-balance",
  },

  // Operations & Stock
  {
    key: "rawMaterialSuppliers",
    label: "Raw Material Suppliers",
    collectionName: "raw_material_suppliers",
    description: "Quarry vendors, cement & sand suppliers, credit accounts.",
    category: "Operations & Stock",
    icon: "storefront",
  },
  {
    key: "rawMaterialLogs",
    label: "Raw Material Logs",
    collectionName: "raw_material_logs",
    description: "Inward supply manifests, weighbridge tickets, consumption logs.",
    category: "Operations & Stock",
    icon: "layers",
  },
  {
    key: "crusherContacts",
    label: "Crusher Contacts",
    collectionName: "crusherContacts",
    description: "Stone aggregate contacts, rates, quarry locations, and phonebook.",
    category: "Operations & Stock",
    icon: "terrain",
  },
  {
    key: "itemStockLogs",
    label: "Item Stock Logs",
    collectionName: "item_stock_logs",
    description: "Stock adjustments, production outputs, breakage, and audit logs.",
    category: "Operations & Stock",
    icon: "add-shopping-cart",
  },

  // Automations & Reminders
  {
    key: "automations",
    label: "Automation Configurations",
    collectionName: "automations",
    description: "Rule schedules, auto-generation switches, and thresholds.",
    category: "Automations & Reminders",
    icon: "settings-suggest",
  },
  {
    key: "automationAttendanceLogs",
    label: "Automatic Attendance Logs",
    collectionName: "automation_attendance_logs",
    description: "Scheduler execution runs, auto-logged shift summaries, and timestamps.",
    category: "Automations & Reminders",
    icon: "history-toggle-off",
  },
  {
    key: "alarms",
    label: "Alarms & Reminders",
    collectionName: "alarms",
    description: "Payment due date alerts, GST deadlines, and scheduled notifications.",
    category: "Automations & Reminders",
    icon: "alarm",
  },

  // Media & System
  {
    key: "visiting_cards",
    label: "Visiting Cards Storage",
    collectionName: "visiting_cards",
    description: "Digital business cards, scanned vendor cards, OCR contact data.",
    category: "Media & System",
    icon: "badge",
  },
  {
    key: "supportTickets",
    label: "Support Tickets",
    collectionName: "supportTickets",
    description: "Bug reports, feature suggestions, and customer assistance logs.",
    category: "Media & System",
    icon: "help-outline",
  },
  {
    key: "notifications",
    label: "System Notifications",
    collectionName: "notifications",
    description: "Broadcast alerts, push logs, reminders, and delivery messages.",
    category: "Media & System",
    icon: "notifications",
  },
];

const BACKUP_SUBDIR = "HollowBlockBusiness/Backups/";
const ACTIVITY_LOGS_STORAGE_KEY = "data_mgmt_activity_logs_v2";

// ─── CSV Converter Helper ─────────────────────────────────────────────────────

function convertToCSV(data: any[]): string {
  if (!data || data.length === 0) return "";
  const keysSet = new Set<string>();
  data.forEach((item) => {
    if (item && typeof item === "object") {
      Object.keys(item).forEach((k) => keysSet.add(k));
    }
  });
  const headers = Array.from(keysSet);
  const csvRows: string[] = [];
  csvRows.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","));

  data.forEach((item) => {
    const row = headers.map((header) => {
      let val = item ? item[header] : "";
      if (val === undefined || val === null) {
        val = "";
      } else if (typeof val === "object") {
        val = JSON.stringify(val);
      } else {
        val = String(val);
      }
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvRows.push(row.join(","));
  });

  return csvRows.join("\n");
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Component ────────────────────────────────────────────────────────────────

function DataManagement() {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();

  // Active Tab: "collections" | "backup" | "maintenance"
  const [activeTab, setActiveTab] = useState<"collections" | "backup" | "maintenance">("collections");

  // Progress & loading states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processTitle, setProcessTitle] = useState("Processing Database Operation");
  const [processSubtitle, setProcessSubtitle] = useState("");
  const [processProgress, setProcessProgress] = useState<number | null>(null);

  // Counts states
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Search & Category Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"All" | CollectionCategory>("All");

  // Multi-Selection State for Bulk Actions
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedCollectionKeys, setSelectedCollectionKeys] = useState<string[]>([]);

  // Single Wipe Confirmation State
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [activeReset, setActiveReset] = useState<CollectionConfig | null>(null);

  // Bulk Wipe Confirmation State
  const [bulkWipeVisible, setBulkWipeVisible] = useState(false);

  // Detail Inspection Modal State & Sample Data Browser
  const [inspectModalVisible, setInspectModalVisible] = useState(false);
  const [inspectConfig, setInspectConfig] = useState<CollectionConfig | null>(null);
  const [inspectTab, setInspectTab] = useState<"details" | "records">("details");
  const [sampleDocs, setSampleDocs] = useState<any[]>([]);
  const [loadingSampleDocs, setLoadingSampleDocs] = useState(false);
  const [sampleSearch, setSampleSearch] = useState("");

  // Factory reset states
  const [factoryVisible, setFactoryVisible] = useState(false);
  const [factoryInput, setFactoryInput] = useState("");

  // Import Preview & Selective Restore States
  const [importPreviewVisible, setImportPreviewVisible] = useState(false);
  const [importData, setImportData] = useState<Record<string, any>>({});
  const [importSelectedKeys, setImportSelectedKeys] = useState<string[]>([]);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");

  // Local Backups List & Activity Logs
  const [localBackups, setLocalBackups] = useState<LocalBackupFile[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);

  // ─── Activity Log Helpers ───────────────────────────────────────────────────

  const logActivity = useCallback(async (action: ActivityLogItem["action"], title: string, details: string, count?: number) => {
    try {
      const newItem: ActivityLogItem = {
        id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        action,
        title,
        details,
        timestamp: new Date().toISOString(),
        count,
      };
      setActivityLogs((prev) => {
        const updated = [newItem, ...prev].slice(0, 30);
        AsyncStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    } catch (_e) {
      // ignore
    }
  }, []);

  const loadActivityLogs = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(ACTIVITY_LOGS_STORAGE_KEY);
      if (stored) {
        setActivityLogs(JSON.parse(stored));
      }
    } catch (_e) {
      // ignore
    }
  }, []);

  // ─── Document Counts Loading (Server + Offline Fallback) ───────────────────

  const fetchDocumentCounts = useCallback(async () => {
    setLoadingCounts(true);
    const newCounts: Record<string, number> = {};

    try {
      await Promise.all(
        COLLECTIONS.map(async (config) => {
          try {
            const colRef = collection(db, config.collectionName);
            // Try fast getCountFromServer first
            const countSnap = await getCountFromServer(colRef);
            newCounts[config.key] = countSnap.data().count;
          } catch (_serverErr) {
            try {
              // Fallback to offline safe retrieval
              const colRef = collection(db, config.collectionName);
              const snapshot = await getDocsOfflineSafe(colRef);
              newCounts[config.key] = snapshot.size;
            } catch (_fallbackErr) {
              newCounts[config.key] = 0;
            }
          }
        })
      );
      setCounts(newCounts);
    } catch (err) {
      console.warn("Failed to load document counts", err);
    } finally {
      setLoadingCounts(false);
    }
  }, []);

  // ─── Local Backups Scanner ─────────────────────────────────────────────────

  const refreshLocalBackups = useCallback(async () => {
    try {
      const dirUri = `${FileSystem.documentDirectory}${BACKUP_SUBDIR}`;
      const dirInfo = await FileSystem.getInfoAsync(dirUri);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
        setLocalBackups([]);
        return;
      }

      const files = await FileSystem.readDirectoryAsync(dirUri);
      const backupFiles: LocalBackupFile[] = [];

      for (const fileName of files) {
        if (fileName.endsWith(".json") || fileName.endsWith(".csv")) {
          const fileUri = `${dirUri}${fileName}`;
          const info = await FileSystem.getInfoAsync(fileUri);
          if (info.exists && !info.isDirectory) {
            backupFiles.push({
              name: fileName,
              uri: fileUri,
              size: info.size || 0,
              modificationTime: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
            });
          }
        }
      }

      // Also check root documentDirectory for any legacy backups
      const rootFiles = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory!);
      for (const fileName of rootFiles) {
        if ((fileName.startsWith("my_business_backup_") || fileName.includes("_export_")) && fileName.endsWith(".json")) {
          const fileUri = `${FileSystem.documentDirectory}${fileName}`;
          const info = await FileSystem.getInfoAsync(fileUri);
          if (info.exists && !info.isDirectory) {
            backupFiles.push({
              name: fileName,
              uri: fileUri,
              size: info.size || 0,
              modificationTime: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
            });
          }
        }
      }

      backupFiles.sort((a, b) => b.modificationTime - a.modificationTime);
      setLocalBackups(backupFiles);
    } catch (err) {
      console.warn("Failed to scan local backups", err);
    }
  }, []);

  useEffect(() => {
    fetchDocumentCounts();
    loadActivityLogs();
    refreshLocalBackups();
  }, [fetchDocumentCounts, loadActivityLogs, refreshLocalBackups]);

  // ─── Filtering & Stats ──────────────────────────────────────────────────────

  const filteredCollections = useMemo(() => {
    return COLLECTIONS.filter((col) => {
      const matchesCategory =
        selectedCategory === "All" || col.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        col.label.toLowerCase().includes(q) ||
        col.collectionName.toLowerCase().includes(q) ||
        col.description.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [selectedCategory, searchQuery]);

  const totalCollections = COLLECTIONS.length;
  const totalDocuments = useMemo(() => {
    return Object.values(counts).reduce((acc, curr) => acc + (curr || 0), 0);
  }, [counts]);
  const activeCollectionsCount = useMemo(() => {
    return Object.values(counts).filter((c) => c > 0).length;
  }, [counts]);

  // Category breakdown metrics
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    CATEGORIES.filter((c) => c !== "All").forEach((cat) => {
      map[cat] = 0;
    });
    COLLECTIONS.forEach((col) => {
      const docCount = counts[col.key] || 0;
      if (map[col.category] !== undefined) {
        map[col.category] += docCount;
      }
    });
    return map;
  }, [counts]);

  // ─── Core Database Operations ───────────────────────────────────────────────

  // Chunk delete Firestore documents
  const deleteFirestoreCollection = async (collectionName: string): Promise<number> => {
    const colRef = collection(db, collectionName);
    const querySnapshot = await getDocsOfflineSafe(colRef);
    const docs = querySnapshot.docs;

    if (docs.length === 0) return 0;

    const batchLimit = 500;
    for (let i = 0; i < docs.length; i += batchLimit) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + batchLimit);
      chunk.forEach((d: any) => {
        batch.delete(d.ref);
      });
      await batch.commit();
    }
    return docs.length;
  };

  // Single collection wipe
  const handleWipeCollection = async () => {
    if (!activeReset) return;
    setConfirmVisible(false);
    setProcessTitle("Clearing Collection");
    setProcessSubtitle(`Purging records from ${activeReset.label}...`);
    setIsProcessing(true);

    try {
      const deletedCount = await deleteFirestoreCollection(activeReset.collectionName);
      setIsProcessing(false);
      logActivity(
        "wipe",
        `Cleared ${activeReset.label}`,
        `Deleted ${deletedCount} records from ${activeReset.collectionName}`,
        deletedCount
      );
      Alert.alert(
        "Reset Completed",
        `Successfully deleted ${deletedCount} records from the ${activeReset.label} collection.`
      );
      fetchDocumentCounts();
    } catch (_error) {
      setIsProcessing(false);
      Alert.alert("Reset Failed", `An error occurred while wiping ${activeReset.label}.`);
    } finally {
      setActiveReset(null);
    }
  };

  // Bulk Wipe for Selected Collections
  const handleBulkWipe = async () => {
    if (selectedCollectionKeys.length === 0) return;
    setBulkWipeVisible(false);
    setProcessTitle("Bulk Clearing Collections");
    setProcessSubtitle(`Purging ${selectedCollectionKeys.length} selected collections...`);
    setIsProcessing(true);

    let totalDeleted = 0;
    const clearedNames: string[] = [];

    try {
      for (let i = 0; i < selectedCollectionKeys.length; i++) {
        const key = selectedCollectionKeys[i];
        const config = COLLECTIONS.find((c) => c.key === key);
        if (config) {
          setProcessSubtitle(`Purging ${config.label} (${i + 1}/${selectedCollectionKeys.length})...`);
          const count = await deleteFirestoreCollection(config.collectionName);
          totalDeleted += count;
          clearedNames.push(config.label);
        }
      }
      setIsProcessing(false);
      logActivity(
        "wipe",
        `Bulk Wiped ${clearedNames.length} Collections`,
        `Deleted ${totalDeleted} total documents across: ${clearedNames.join(", ")}`,
        totalDeleted
      );
      Alert.alert(
        "Bulk Wipe Complete",
        `Successfully cleared ${clearedNames.length} collections. Total documents deleted: ${totalDeleted}`
      );
      setSelectedCollectionKeys([]);
      setMultiSelectMode(false);
      fetchDocumentCounts();
    } catch (_error) {
      setIsProcessing(false);
      Alert.alert("Bulk Wipe Error", "An error occurred during the bulk clear operation.");
    }
  };

  // Factory reset (All 32 collections)
  const handleFactoryReset = async () => {
    if (factoryInput !== "RESET") return;
    setFactoryVisible(false);
    setProcessTitle("Executing Factory Reset");
    setProcessSubtitle("Purging all database collections...");
    setIsProcessing(true);

    try {
      let totalDeleted = 0;
      for (let i = 0; i < COLLECTIONS.length; i++) {
        const config = COLLECTIONS[i];
        setProcessSubtitle(`Purging ${config.label} (${i + 1}/${COLLECTIONS.length})...`);
        const count = await deleteFirestoreCollection(config.collectionName);
        totalDeleted += count;
      }
      setIsProcessing(false);
      logActivity(
        "factory_reset",
        "Factory Reset Executed",
        `Purged all 32 collections. Total deleted records: ${totalDeleted}`,
        totalDeleted
      );
      Alert.alert(
        "Factory Reset Complete",
        `All system collections have been reset. Total documents deleted: ${totalDeleted}`
      );
      fetchDocumentCounts();
    } catch (_error) {
      setIsProcessing(false);
      Alert.alert("Factory Reset Failed", "An error occurred while executing the factory purge.");
    } finally {
      setFactoryInput("");
    }
  };

  // ─── Export Operations ──────────────────────────────────────────────────────

  // Full Database JSON Export
  const handleExportFullBackup = async () => {
    setProcessTitle("Generating Full Database Backup");
    setProcessSubtitle("Reading records from all 32 collections...");
    setProcessProgress(0);
    setIsProcessing(true);

    try {
      const backupData: Record<string, any> = {};
      let totalDocsCount = 0;

      for (let i = 0; i < COLLECTIONS.length; i++) {
        const config = COLLECTIONS[i];
        setProcessSubtitle(`Exporting ${config.label} (${i + 1}/${COLLECTIONS.length})...`);
        setProcessProgress(Math.round(((i + 1) / COLLECTIONS.length) * 80));

        try {
          const colRef = collection(db, config.collectionName);
          const snapshot = await getDocsOfflineSafe(colRef);
          const docs = snapshot.docs.map((d: any) => ({
            id: d.id,
            ...d.data(),
          }));
          backupData[config.collectionName] = docs;
          totalDocsCount += docs.length;
        } catch (_colErr) {
          backupData[config.collectionName] = [];
        }
      }

      setProcessSubtitle("Capturing local application state...");
      setProcessProgress(90);

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

      backupData._asyncStorage = asyncStorageData;
      backupData._metadata = {
        exportedAt: new Date().toISOString(),
        collectionsCount: COLLECTIONS.length,
        totalRecords: totalDocsCount,
        appVersion: "1.0.0",
        schemaVersion: 2,
      };

      setProcessSubtitle("Saving backup file...");
      setProcessProgress(98);

      const jsonContent = JSON.stringify(backupData, null, 2);
      const filename = `my_business_backup_${Date.now()}.json`;

      // Save into dedicated backup folder
      const dirUri = `${FileSystem.documentDirectory}${BACKUP_SUBDIR}`;
      const dirInfo = await FileSystem.getInfoAsync(dirUri);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
      }

      const fileUri = `${dirUri}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, jsonContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      setIsProcessing(false);
      logActivity(
        "export",
        "Full Database Backup",
        `Exported ${totalDocsCount} documents across 32 collections to ${filename}`,
        totalDocsCount
      );
      refreshLocalBackups();

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: "Export Full Database Backup",
          UTI: "public.json",
        });
      } else {
        Alert.alert("Backup Complete", `Backup file generated locally: ${filename}`);
      }
    } catch (err: any) {
      setIsProcessing(false);
      Alert.alert("Backup Failed", err?.message || "Failed to create database backup.");
    }
  };

  // Bulk Export for Selected Collections
  const handleExportSelectedCollections = async (format: "json" | "csv") => {
    if (selectedCollectionKeys.length === 0) return;
    const selectedConfigs = COLLECTIONS.filter((c) => selectedCollectionKeys.includes(c.key));

    setProcessTitle(`Exporting ${selectedConfigs.length} Selected Collections`);
    setProcessSubtitle("Reading records...");
    setIsProcessing(true);

    try {
      const exportBundle: Record<string, any[]> = {};
      let totalExportedDocs = 0;

      for (let i = 0; i < selectedConfigs.length; i++) {
        const config = selectedConfigs[i];
        setProcessSubtitle(`Exporting ${config.label} (${i + 1}/${selectedConfigs.length})...`);
        const colRef = collection(db, config.collectionName);
        const snapshot = await getDocsOfflineSafe(colRef);
        const docs = snapshot.docs.map((d: any) => ({
          id: d.id,
          ...d.data(),
        }));
        exportBundle[config.collectionName] = docs;
        totalExportedDocs += docs.length;
      }

      let fileContent = "";
      let mimeType = "";
      let fileExt = "";

      if (format === "csv") {
        // Flatten and concatenate with section breaks
        const sections: string[] = [];
        for (const config of selectedConfigs) {
          const docs = exportBundle[config.collectionName] || [];
          sections.push(`=== TABLE: ${config.label} (${config.collectionName}) ===`);
          sections.push(convertToCSV(docs));
          sections.push("\n");
        }
        fileContent = sections.join("\n");
        mimeType = "text/csv";
        fileExt = "csv";
      } else {
        fileContent = JSON.stringify(
          {
            _metadata: {
              exportedAt: new Date().toISOString(),
              collections: selectedConfigs.map((c) => c.collectionName),
              totalRecords: totalExportedDocs,
            },
            ...exportBundle,
          },
          null,
          2
        );
        mimeType = "application/json";
        fileExt = "json";
      }

      const filename = `selected_export_${Date.now()}.${fileExt}`;
      const dirUri = `${FileSystem.documentDirectory}${BACKUP_SUBDIR}`;
      const dirInfo = await FileSystem.getInfoAsync(dirUri);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
      }
      const fileUri = `${dirUri}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, fileContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      setIsProcessing(false);
      logActivity(
        "export",
        `Selected Export (${format.toUpperCase()})`,
        `Exported ${selectedConfigs.length} collections (${totalExportedDocs} docs)`,
        totalExportedDocs
      );
      refreshLocalBackups();

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType,
          dialogTitle: `Export ${selectedConfigs.length} Collections (${format.toUpperCase()})`,
          UTI: format === "csv" ? "public.comma-separated-values-text" : "public.json",
        });
      } else {
        Alert.alert("Export Complete", `File saved locally: ${filename}`);
      }
    } catch (err: any) {
      setIsProcessing(false);
      Alert.alert("Export Failed", err?.message || "Could not export selected collections.");
    }
  };

  // Export Single Collection (JSON or CSV)
  const handleExportSingleCollection = async (config: CollectionConfig, format: "json" | "csv") => {
    setProcessTitle(`Exporting ${config.label}`);
    setProcessSubtitle(`Extracting records as ${format.toUpperCase()}...`);
    setIsProcessing(true);

    try {
      const colRef = collection(db, config.collectionName);
      const snapshot = await getDocsOfflineSafe(colRef);
      const docsData = snapshot.docs.map((d: any) => ({
        id: d.id,
        ...d.data(),
      }));

      if (docsData.length === 0) {
        setIsProcessing(false);
        Alert.alert("Export Notice", `The collection "${config.label}" has no records to export.`);
        return;
      }

      let fileContent = "";
      let mimeType = "";
      let fileExt = "";

      if (format === "csv") {
        fileContent = convertToCSV(docsData);
        mimeType = "text/csv";
        fileExt = "csv";
      } else {
        fileContent = JSON.stringify(docsData, null, 2);
        mimeType = "application/json";
        fileExt = "json";
      }

      const filename = `${config.collectionName}_export_${Date.now()}.${fileExt}`;
      const dirUri = `${FileSystem.documentDirectory}${BACKUP_SUBDIR}`;
      const dirInfo = await FileSystem.getInfoAsync(dirUri);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
      }
      const fileUri = `${dirUri}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, fileContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      setIsProcessing(false);
      logActivity(
        "export",
        `Exported ${config.label} (${format.toUpperCase()})`,
        `Exported ${docsData.length} records to ${filename}`,
        docsData.length
      );
      refreshLocalBackups();

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType,
          dialogTitle: `Export ${config.label}`,
          UTI: format === "csv" ? "public.comma-separated-values-text" : "public.json",
        });
      } else {
        Alert.alert("Export Complete", `File saved locally: ${filename}`);
      }
    } catch (err: any) {
      setIsProcessing(false);
      Alert.alert("Export Failed", err?.message || "Could not export collection.");
    }
  };

  // ─── Live Inspection & Sample Data Browser ──────────────────────────────────

  const openInspector = async (config: CollectionConfig) => {
    setInspectConfig(config);
    setInspectTab("details");
    setSampleSearch("");
    setInspectModalVisible(true);
    setLoadingSampleDocs(true);

    try {
      const q = query(collection(db, config.collectionName), limit(10));
      const snap = await getDocsOfflineSafe(q);
      const list = snap.docs.map((d: any) => ({
        _docId: d.id,
        ...d.data(),
      }));
      setSampleDocs(list);
    } catch (e) {
      setSampleDocs([]);
    } finally {
      setLoadingSampleDocs(false);
    }
  };

  const filteredSampleDocs = useMemo(() => {
    if (!sampleSearch.trim()) return sampleDocs;
    const q = sampleSearch.toLowerCase().trim();
    return sampleDocs.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
  }, [sampleDocs, sampleSearch]);

  // ─── Import & Restore Operations ────────────────────────────────────────────

  // Import / Pick backup file
  const handleImportBackup = async () => {
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return;
      }

      const fileUri = pickerResult.assets[0].uri;
      loadBackupFromFileUri(fileUri);
    } catch (err: any) {
      Alert.alert("Import Error", err?.message || "An error occurred during file selection.");
    }
  };

  const loadBackupFromFileUri = async (fileUri: string) => {
    try {
      const fileContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      let parsedData: Record<string, any>;
      try {
        parsedData = JSON.parse(fileContent);
      } catch (_parseErr) {
        Alert.alert("Invalid File", "The selected file is not a valid JSON database backup.");
        return;
      }

      const keys = Object.keys(parsedData);
      const validCollections = COLLECTIONS.filter((c) => keys.includes(c.collectionName));

      if (validCollections.length === 0) {
        Alert.alert(
          "Invalid Backup",
          "The selected backup file does not match any database tables in this app."
        );
        return;
      }

      setImportData(parsedData);
      setImportSelectedKeys(validCollections.map((c) => c.collectionName));
      setRestoreMode("merge");
      setImportPreviewVisible(true);
    } catch (err: any) {
      Alert.alert("Read Error", err?.message || "Failed to read the backup file.");
    }
  };

  // Execute restore for selected collections (Merge vs Replace)
  const executeRestoreSelected = async () => {
    setImportPreviewVisible(false);
    setProcessTitle(restoreMode === "replace" ? "Replacing Database Tables" : "Merging Backup Data");
    setProcessSubtitle("Restoring selected records into Firestore...");
    setProcessProgress(0);
    setIsProcessing(true);

    try {
      let totalRestored = 0;
      const targetConfigs = COLLECTIONS.filter((c) => importSelectedKeys.includes(c.collectionName));

      for (let i = 0; i < targetConfigs.length; i++) {
        const config = targetConfigs[i];
        setProcessSubtitle(`Restoring ${config.label} (${i + 1}/${targetConfigs.length})...`);
        setProcessProgress(Math.round(((i + 1) / targetConfigs.length) * 90));

        // If Replace mode is selected, wipe the collection first!
        if (restoreMode === "replace") {
          await deleteFirestoreCollection(config.collectionName);
        }

        const docsArray = importData[config.collectionName];
        if (Array.isArray(docsArray) && docsArray.length > 0) {
          const batchLimit = 500;
          for (let j = 0; j < docsArray.length; j += batchLimit) {
            const batch = writeBatch(db);
            const chunk = docsArray.slice(j, j + batchLimit);

            chunk.forEach((item) => {
              const { id, _docId, ...data } = item;
              const docIdentifier = id || _docId;
              if (docIdentifier) {
                const docRef = doc(collection(db, config.collectionName), String(docIdentifier));
                batch.set(docRef, data, { merge: restoreMode === "merge" });
                totalRestored++;
              }
            });
            await batch.commit();
          }
        }
      }

      // Restore AsyncStorage data if present
      if (importData._asyncStorage && typeof importData._asyncStorage === "object") {
        const pairs: [string, string][] = [];
        for (const [k, v] of Object.entries(importData._asyncStorage)) {
          if (v !== null && typeof v === "string" && !k.startsWith("data_mgmt_activity_logs")) {
            pairs.push([k, v]);
          }
        }
        if (pairs.length > 0) {
          try {
            await AsyncStorage.multiSet(pairs);
          } catch (storageErr) {
            console.warn("Failed to restore AsyncStorage values", storageErr);
          }
        }
      }

      setIsProcessing(false);
      logActivity(
        "import",
        `Restored Backup (${restoreMode === "replace" ? "Clean Replace" : "Smart Merge"})`,
        `Restored ${totalRestored} documents across ${targetConfigs.length} collections`,
        totalRestored
      );
      Alert.alert(
        "Restore Complete",
        `Successfully restored ${totalRestored} documents across ${targetConfigs.length} collections.`
      );
      fetchDocumentCounts();
    } catch (err: any) {
      setIsProcessing(false);
      Alert.alert("Restore Failed", err?.message || "Failed to restore database from backup.");
    }
  };

  // ─── Maintenance Utilities ──────────────────────────────────────────────────

  const handleFlushCache = async () => {
    Alert.alert(
      "Flush App Cache",
      "This will clear temporary local cache and re-sync document counters from Firebase. Your database records will NOT be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Flush & Resync",
          onPress: async () => {
            setProcessTitle("Flushing Cache");
            setProcessSubtitle("Clearing offline temporary cache...");
            setIsProcessing(true);
            try {
              await fetchDocumentCounts();
              await refreshLocalBackups();
              setIsProcessing(false);
              logActivity("cleanup", "Flushed App Cache", "Refreshed live document counters and cache");
              Alert.alert("Cache Refreshed", "App cache flushed and database counters re-synced.");
            } catch (err: any) {
              setIsProcessing(false);
              Alert.alert("Cache Error", err?.message || "Failed to flush cache.");
            }
          },
        },
      ]
    );
  };

  const handlePruneLogs = async () => {
    Alert.alert(
      "Prune System Logs & Notifications",
      "This will clear old system notifications and support tickets to free up storage space. Your customers, orders, inventory, and finances remain safe.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Prune Logs",
          style: "destructive",
          onPress: async () => {
            setProcessTitle("Pruning System Logs");
            setProcessSubtitle("Deleting old notifications and temporary tickets...");
            setIsProcessing(true);
            try {
              const c1 = await deleteFirestoreCollection("notifications");
              const c2 = await deleteFirestoreCollection("supportTickets");
              const totalPruned = c1 + c2;
              setIsProcessing(false);
              logActivity(
                "cleanup",
                "Pruned System Logs",
                `Deleted ${totalPruned} log records from notifications & supportTickets`,
                totalPruned
              );
              Alert.alert("Cleanup Complete", `Deleted ${totalPruned} temporary log entries.`);
              fetchDocumentCounts();
            } catch (err: any) {
              setIsProcessing(false);
              Alert.alert("Prune Error", err?.message || "Failed to prune logs.");
            }
          },
        },
      ]
    );
  };

  const handleDeleteLocalBackup = async (file: LocalBackupFile) => {
    Alert.alert("Delete Backup File", `Are you sure you want to delete "${file.name}" from local storage?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await FileSystem.deleteAsync(file.uri, { idempotent: true });
            logActivity("cleanup", "Deleted Local Backup", `Removed ${file.name}`);
            refreshLocalBackups();
          } catch (e: any) {
            Alert.alert("Delete Failed", e?.message || "Could not delete backup file.");
          }
        },
      },
    ]);
  };

  const handleShareLocalBackup = async (file: LocalBackupFile) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: file.name.endsWith(".csv") ? "text/csv" : "application/json",
        dialogTitle: `Share ${file.name}`,
      });
    } else {
      Alert.alert("Share Unavailable", "Sharing is not supported on this platform.");
    }
  };

  return (
    <AnimatedPage>
      {/* ── Background Processing Modal ────────────────────────────────────── */}
      <Modal visible={isProcessing} transparent animationType="fade">
        <View style={styles.loaderBg}>
          <View style={styles.loaderContent}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
            <Text style={styles.loaderTitle}>{processTitle}</Text>
            <Text style={styles.loaderDesc}>{processSubtitle}</Text>
            {processProgress !== null && (
              <View style={styles.progressBarWrapper}>
                <View style={[styles.progressBarFill, { width: `${processProgress}%` }]} />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Single Wipe Confirmation Modal ─────────────────────────────────── */}
      <Modal visible={confirmVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.warningIconWrapper}>
              <MaterialIcons name="warning" size={32} color={colors.accent.warning} />
            </View>
            <Text style={styles.modalTitle}>Clear {activeReset?.label}?</Text>
            <Text style={styles.modalDesc}>
              This will permanently delete all records inside the{" "}
              <Text style={{ fontWeight: "700", color: colors.text.primary }}>
                {activeReset?.label}
              </Text>{" "}
              collection ({counts[activeReset?.key || ""] || 0} documents). This cannot be undone.
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => {
                  setConfirmVisible(false);
                  setActiveReset(null);
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.deleteBtn]}
                onPress={handleWipeCollection}
              >
                <Text style={styles.deleteBtnText}>Clear Records</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Bulk Wipe Confirmation Modal ───────────────────────────────────── */}
      <Modal visible={bulkWipeVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={[styles.warningIconWrapper, { backgroundColor: "#fee2e2" }]}>
              <MaterialIcons name="delete-sweep" size={32} color={colors.accent.danger} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.accent.danger }]}>
              Clear {selectedCollectionKeys.length} Collections?
            </Text>
            <Text style={styles.modalDesc}>
              You have selected {selectedCollectionKeys.length} collections for bulk deletion. All records in these tables will be permanently wiped.
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setBulkWipeVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.deleteBtn]}
                onPress={handleBulkWipe}
              >
                <Text style={styles.deleteBtnText}>Execute Bulk Wipe</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Detail Inspection & Live Document Browser Modal ─────────────────── */}
      <Modal visible={inspectModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxHeight: "88%" }]}>
            {/* Header */}
            <View style={styles.inspectHeaderRow}>
              <View style={[styles.inspectHeaderIcon, { backgroundColor: `${colors.accent.primary}18` }]}>
                <MaterialIcons
                  name={inspectConfig?.icon || "storage"}
                  size={24}
                  color={colors.accent.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inspectTitle}>{inspectConfig?.label}</Text>
                <Text style={styles.inspectSub}>{inspectConfig?.collectionName}</Text>
              </View>
              <Pressable
                onPress={() => setInspectModalVisible(false)}
                style={styles.inspectCloseBtn}
              >
                <MaterialIcons name="close" size={20} color={colors.text.muted} />
              </Pressable>
            </View>

            {/* Segmented Switch: Details vs Live Sample Records */}
            <View style={styles.inspectSegmentWrapper}>
              <Pressable
                style={[
                  styles.inspectSegmentBtn,
                  inspectTab === "details" && { backgroundColor: colors.accent.primary },
                ]}
                onPress={() => setInspectTab("details")}
              >
                <Text
                  style={[
                    styles.inspectSegmentText,
                    inspectTab === "details" && { color: "#fff", fontWeight: "700" },
                  ]}
                >
                  Overview & Exports
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.inspectSegmentBtn,
                  inspectTab === "records" && { backgroundColor: colors.accent.primary },
                ]}
                onPress={() => setInspectTab("records")}
              >
                <Text
                  style={[
                    styles.inspectSegmentText,
                    inspectTab === "records" && { color: "#fff", fontWeight: "700" },
                  ]}
                >
                  Live Browser ({sampleDocs.length})
                </Text>
              </Pressable>
            </View>

            {/* Tab: Overview & Exports */}
            {inspectTab === "details" ? (
              <ScrollView style={{ width: "100%" }} showsVerticalScrollIndicator={false}>
                <Text style={styles.inspectDescText}>{inspectConfig?.description}</Text>

                <View style={styles.inspectDetailsBox}>
                  <View style={styles.inspectRow}>
                    <Text style={styles.inspectLabel}>Firestore Table:</Text>
                    <Text style={styles.inspectVal}>{inspectConfig?.collectionName}</Text>
                  </View>
                  <View style={styles.inspectRow}>
                    <Text style={styles.inspectLabel}>Category:</Text>
                    <Text style={styles.inspectVal}>{inspectConfig?.category}</Text>
                  </View>
                  <View style={styles.inspectRow}>
                    <Text style={styles.inspectLabel}>Total Documents:</Text>
                    <Text style={[styles.inspectVal, { fontWeight: "800", color: colors.accent.primary }]}>
                      {inspectConfig ? counts[inspectConfig.key] || 0 : 0} records
                    </Text>
                  </View>
                </View>

                <Text style={styles.inspectSectionHeading}>Quick Table Exports</Text>
                <View style={styles.inspectExportRow}>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: colors.accent.primary, flexDirection: "row", gap: 6 }]}
                    onPress={() => {
                      if (inspectConfig) {
                        setInspectModalVisible(false);
                        handleExportSingleCollection(inspectConfig, "json");
                      }
                    }}
                  >
                    <MaterialIcons name="code" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Export JSON</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: colors.accent.success, flexDirection: "row", gap: 6 }]}
                    onPress={() => {
                      if (inspectConfig) {
                        setInspectModalVisible(false);
                        handleExportSingleCollection(inspectConfig, "csv");
                      }
                    }}
                  >
                    <MaterialIcons name="grid-on" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Export CSV</Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
              /* Tab: Live Sample Records Browser */
              <View style={{ width: "100%", flex: 1 }}>
                <View style={styles.sampleSearchBox}>
                  <MaterialIcons name="search" size={18} color={colors.text.muted} />
                  <TextInput
                    value={sampleSearch}
                    onChangeText={setSampleSearch}
                    placeholder="Search inside sample documents..."
                    placeholderTextColor={colors.text.muted}
                    style={styles.sampleSearchInput}
                  />
                  {sampleSearch ? (
                    <Pressable onPress={() => setSampleSearch("")}>
                      <MaterialIcons name="cancel" size={16} color={colors.text.muted} />
                    </Pressable>
                  ) : null}
                </View>

                {loadingSampleDocs ? (
                  <View style={{ padding: 24, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={colors.accent.primary} />
                    <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 8 }}>
                      Fetching live sample records...
                    </Text>
                  </View>
                ) : filteredSampleDocs.length === 0 ? (
                  <View style={{ padding: 24, alignItems: "center" }}>
                    <MaterialIcons name="folder-open" size={32} color={colors.text.muted} />
                    <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 6 }}>
                      No sample records found.
                    </Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={true}>
                    {filteredSampleDocs.map((item, idx) => (
                      <View key={item._docId || idx} style={styles.sampleDocCard}>
                        <View style={styles.sampleDocHeader}>
                          <Text style={styles.sampleDocId}>ID: {item._docId}</Text>
                          <Text style={styles.sampleDocIndex}>#{idx + 1}</Text>
                        </View>
                        <Text style={styles.sampleDocJson} numberOfLines={6}>
                          {JSON.stringify(item, null, 2)}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            <Pressable
              style={[styles.modalBtn, styles.cancelBtn, { marginTop: 14, width: "100%" }]}
              onPress={() => setInspectModalVisible(false)}
            >
              <Text style={styles.cancelBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Backup Preview & Selective Restore Modal ───────────────────────── */}
      <Modal visible={importPreviewVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxHeight: "88%" }]}>
            <View style={[styles.warningIconWrapper, { backgroundColor: `${colors.accent.success}18` }]}>
              <MaterialIcons name="cloud-upload" size={32} color={colors.accent.success} />
            </View>
            <Text style={styles.modalTitle}>Backup Preview & Restore</Text>
            <Text style={styles.modalDesc}>
              Select the collections you want to restore. Choose whether to merge with existing data or replace.
            </Text>

            {/* Restore Mode Selector: Merge vs Replace */}
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
                    Updates matching documents and inserts new ones. Preserves unaffected data.
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
                    Wipes selected target collections before importing fresh records.
                  </Text>
                </View>
              </Pressable>
            </View>

            {/* Selectable Collections List */}
            <ScrollView style={styles.previewList} showsVerticalScrollIndicator={true}>
              {COLLECTIONS.filter((c) => importData[c.collectionName]?.length > 0).map((config) => {
                const docCount = importData[config.collectionName]?.length || 0;
                const isSelected = importSelectedKeys.includes(config.collectionName);

                return (
                  <Pressable
                    key={config.key}
                    style={[
                      styles.previewItem,
                      isSelected && { borderColor: colors.accent.primary, backgroundColor: `${colors.accent.primary}08` },
                    ]}
                    onPress={() => {
                      if (isSelected) {
                        setImportSelectedKeys((prev) => prev.filter((k) => k !== config.collectionName));
                      } else {
                        setImportSelectedKeys((prev) => [...prev, config.collectionName]);
                      }
                    }}
                  >
                    <MaterialIcons
                      name={isSelected ? "check-box" : "check-box-outline-blank"}
                      size={22}
                      color={isSelected ? colors.accent.primary : colors.text.muted}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.previewLabel}>{config.label}</Text>
                      <Text style={styles.previewSub}>{config.collectionName}</Text>
                    </View>
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{docCount} records</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setImportPreviewVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={importSelectedKeys.length === 0}
                style={[
                  styles.modalBtn,
                  { backgroundColor: restoreMode === "replace" ? colors.accent.danger : colors.accent.success },
                  importSelectedKeys.length === 0 && { opacity: 0.5 },
                ]}
                onPress={executeRestoreSelected}
              >
                <Text style={styles.deleteBtnText}>
                  Restore ({importSelectedKeys.length})
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Factory Reset Verification Modal ───────────────────────────────── */}
      <Modal visible={factoryVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={[styles.warningIconWrapper, { backgroundColor: "#fee2e2" }]}>
              <MaterialIcons name="delete-forever" size={36} color={colors.accent.danger} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.accent.danger }]}>DANGER: FACTORY RESET</Text>
            <Text style={styles.modalDesc}>
              This will permanently delete ALL data records across all 32 database collections. Your login credentials will remain intact.
            </Text>
            <Text style={styles.typedRequirement}>
              This action cannot be undone. To verify, type &quot;RESET&quot; below:
            </Text>

            <TextInput
              value={factoryInput}
              onChangeText={setFactoryInput}
              placeholder="Type RESET here"
              placeholderTextColor={colors.text.muted}
              autoCapitalize="characters"
              style={styles.verificationInput}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => {
                  setFactoryVisible(false);
                  setFactoryInput("");
                }}
              >
                <Text style={styles.cancelBtnText}>Abort</Text>
              </Pressable>
              <Pressable
                disabled={factoryInput !== "RESET"}
                style={[
                  styles.modalBtn,
                  styles.factoryConfirmBtn,
                  factoryInput !== "RESET" && styles.factoryConfirmBtnDisabled,
                ]}
                onPress={handleFactoryReset}
              >
                <Text style={styles.deleteBtnText}>Execute Purge</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Main Screen Content ────────────────────────────────────────────── */}
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header navigation */}
        <View style={styles.header}>
          <BackButton label="Settings" onPress={() => router.push("/settings")} style={{ marginBottom: 12 }} />
          <Text style={styles.title}>Data Management</Text>
          <Text style={styles.subtitle}>
            Enterprise database governance suite for 32 collections, backups, inspection, and recovery.
          </Text>
        </View>

        {/* Database Overview Metric Cards */}
        <View style={styles.dashboardCard}>
          <View style={styles.dashboardRow}>
            <View style={styles.dashMetric}>
              <Text style={styles.dashVal}>{totalCollections}</Text>
              <Text style={styles.dashLabel}>Collections</Text>
            </View>
            <View style={styles.dashDivider} />
            <View style={styles.dashMetric}>
              <Text style={[styles.dashVal, { color: colors.accent.primary }]}>
                {loadingCounts ? "..." : totalDocuments}
              </Text>
              <Text style={styles.dashLabel}>Total Records</Text>
            </View>
            <View style={styles.dashDivider} />
            <View style={styles.dashMetric}>
              <Text style={[styles.dashVal, { color: colors.accent.success }]}>
                {activeCollectionsCount}
              </Text>
              <Text style={styles.dashLabel}>Active Tables</Text>
            </View>
          </View>
        </View>

        {/* Primary Navigation Tabs */}
        <View style={styles.tabBar}>
          <Pressable
            style={[
              styles.tabItem,
              activeTab === "collections" && { borderBottomColor: colors.accent.primary },
            ]}
            onPress={() => setActiveTab("collections")}
          >
            <MaterialIcons
              name="storage"
              size={18}
              color={activeTab === "collections" ? colors.accent.primary : colors.text.muted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "collections" && { color: colors.accent.primary, fontWeight: "700" },
              ]}
            >
              Collections ({filteredCollections.length})
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.tabItem,
              activeTab === "backup" && { borderBottomColor: colors.accent.primary },
            ]}
            onPress={() => setActiveTab("backup")}
          >
            <MaterialIcons
              name="cloud-sync"
              size={18}
              color={activeTab === "backup" ? colors.accent.primary : colors.text.muted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "backup" && { color: colors.accent.primary, fontWeight: "700" },
              ]}
            >
              Backup & Restore
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.tabItem,
              activeTab === "maintenance" && { borderBottomColor: colors.accent.primary },
            ]}
            onPress={() => setActiveTab("maintenance")}
          >
            <MaterialIcons
              name="build"
              size={18}
              color={activeTab === "maintenance" ? colors.accent.primary : colors.text.muted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "maintenance" && { color: colors.accent.primary, fontWeight: "700" },
              ]}
            >
              Maintenance
            </Text>
          </Pressable>
        </View>

        {/* ════════════ TAB 1: COLLECTIONS & INSPECTOR ════════════ */}
        {activeTab === "collections" && (
          <View>
            {/* Live Search Bar */}
            <View style={styles.searchBox}>
              <MaterialIcons name="search" size={20} color={colors.text.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search collections by name or description..."
                placeholderTextColor={colors.text.muted}
                style={styles.searchInput}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")}>
                  <MaterialIcons name="cancel" size={18} color={colors.text.muted} />
                </Pressable>
              ) : null}
            </View>

            {/* Category Horizontal Filter Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryPillsContainer}
            >
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                const catCount =
                  cat === "All"
                    ? COLLECTIONS.length
                    : COLLECTIONS.filter((c) => c.category === cat).length;

                return (
                  <Pressable
                    key={cat}
                    style={[
                      styles.pillItem,
                      isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                    ]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <Text style={[styles.pillText, isSelected && { color: "#fff", fontWeight: "700" }]}>
                      {cat} ({catCount})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Multi-Select Toolbar & Refresh */}
            <View style={styles.toolbarRow}>
              <Pressable
                style={[
                  styles.multiSelectToggleBtn,
                  multiSelectMode && { backgroundColor: `${colors.accent.primary}18`, borderColor: colors.accent.primary },
                ]}
                onPress={() => {
                  if (multiSelectMode) {
                    setSelectedCollectionKeys([]);
                  }
                  setMultiSelectMode(!multiSelectMode);
                }}
              >
                <MaterialIcons
                  name={multiSelectMode ? "check-circle" : "checklist"}
                  size={16}
                  color={multiSelectMode ? colors.accent.primary : colors.text.secondary}
                />
                <Text
                  style={[
                    styles.multiSelectToggleText,
                    multiSelectMode && { color: colors.accent.primary, fontWeight: "700" },
                  ]}
                >
                  {multiSelectMode ? "Cancel Multi-Select" : "Select Multiple"}
                </Text>
              </Pressable>

              {multiSelectMode && (
                <Pressable
                  style={styles.selectAllBtn}
                  onPress={() => {
                    if (selectedCollectionKeys.length === filteredCollections.length) {
                      setSelectedCollectionKeys([]);
                    } else {
                      setSelectedCollectionKeys(filteredCollections.map((c) => c.key));
                    }
                  }}
                >
                  <Text style={styles.selectAllText}>
                    {selectedCollectionKeys.length === filteredCollections.length ? "Deselect All" : "Select All"}
                  </Text>
                </Pressable>
              )}

              <View style={{ flex: 1 }} />

              <Pressable
                onPress={fetchDocumentCounts}
                disabled={loadingCounts}
                style={styles.refreshBtn}
              >
                {loadingCounts ? (
                  <ActivityIndicator size="small" color={colors.accent.primary} />
                ) : (
                  <MaterialIcons name="refresh" size={20} color={colors.text.secondary} />
                )}
              </Pressable>
            </View>

            {/* Multi-Selection Bulk Action Bar */}
            {multiSelectMode && selectedCollectionKeys.length > 0 && (
              <View style={styles.bulkActionBar}>
                <Text style={styles.bulkActionCount}>
                  {selectedCollectionKeys.length} Selected
                </Text>
                <View style={styles.bulkActionButtons}>
                  <Pressable
                    style={[styles.bulkBtn, { backgroundColor: colors.accent.primary }]}
                    onPress={() => handleExportSelectedCollections("json")}
                  >
                    <MaterialIcons name="code" size={14} color="#fff" />
                    <Text style={styles.bulkBtnText}>JSON</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.bulkBtn, { backgroundColor: colors.accent.success }]}
                    onPress={() => handleExportSelectedCollections("csv")}
                  >
                    <MaterialIcons name="grid-on" size={14} color="#fff" />
                    <Text style={styles.bulkBtnText}>CSV</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.bulkBtn, { backgroundColor: colors.accent.danger }]}
                    onPress={() => setBulkWipeVisible(true)}
                  >
                    <MaterialIcons name="delete" size={14} color="#fff" />
                    <Text style={styles.bulkBtnText}>Clear</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Collection Items List */}
            <View style={styles.list}>
              {filteredCollections.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="search-off" size={36} color={colors.text.muted} />
                  <Text style={styles.emptyText}>No collections match your filter criteria.</Text>
                </View>
              ) : (
                filteredCollections.map((config) => {
                  const docCount = counts[config.key] || 0;
                  const hasData = docCount > 0;
                  const isSelected = selectedCollectionKeys.includes(config.key);

                  return (
                    <Pressable
                      key={config.key}
                      style={[
                        styles.card,
                        isSelected && { borderColor: colors.accent.primary, backgroundColor: `${colors.accent.primary}05` },
                      ]}
                      onPress={() => {
                        if (multiSelectMode) {
                          if (isSelected) {
                            setSelectedCollectionKeys((prev) => prev.filter((k) => k !== config.key));
                          } else {
                            setSelectedCollectionKeys((prev) => [...prev, config.key]);
                          }
                        } else {
                          openInspector(config);
                        }
                      }}
                    >
                      {multiSelectMode && (
                        <Pressable
                          style={{ marginRight: 10 }}
                          onPress={() => {
                            if (isSelected) {
                              setSelectedCollectionKeys((prev) => prev.filter((k) => k !== config.key));
                            } else {
                              setSelectedCollectionKeys((prev) => [...prev, config.key]);
                            }
                          }}
                        >
                          <MaterialIcons
                            name={isSelected ? "check-box" : "check-box-outline-blank"}
                            size={22}
                            color={isSelected ? colors.accent.primary : colors.text.muted}
                          />
                        </Pressable>
                      )}

                      <View style={styles.cardInfo}>
                        <View style={styles.cardHeaderRow}>
                          <MaterialIcons
                            name={config.icon || "storage"}
                            size={18}
                            color={hasData ? colors.accent.primary : colors.text.muted}
                          />
                          <Text style={styles.cardLabel}>{config.label}</Text>

                          <View
                            style={[
                              styles.countBadge,
                              hasData
                                ? { backgroundColor: `${colors.accent.primary}15`, borderColor: `${colors.accent.primary}35` }
                                : { backgroundColor: colors.bg.primary, borderColor: colors.border.subtle },
                            ]}
                          >
                            <Text
                              style={[
                                styles.countBadgeText,
                                hasData ? { color: colors.accent.primary } : { color: colors.text.muted },
                              ]}
                            >
                              {docCount === 0 ? "Empty" : `${docCount} docs`}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.cardDesc}>{config.description}</Text>
                        <Text style={styles.categoryTag}>{config.category}</Text>
                      </View>

                      <View style={styles.cardActionsColumn}>
                        {/* Inspect button */}
                        <Pressable
                          style={styles.iconBtn}
                          onPress={() => openInspector(config)}
                        >
                          <MaterialIcons name="visibility" size={18} color={colors.accent.primary} />
                        </Pressable>

                        {/* Quick export button */}
                        <Pressable
                          style={styles.iconBtn}
                          onPress={() => handleExportSingleCollection(config, "json")}
                        >
                          <MaterialIcons name="file-download" size={18} color={colors.accent.success} />
                        </Pressable>

                        {/* Clear button */}
                        <Pressable
                          style={[styles.iconBtn, { backgroundColor: colors.accent.dangerMuted }]}
                          onPress={() => {
                            setActiveReset(config);
                            setConfirmVisible(true);
                          }}
                        >
                          <MaterialIcons name="delete-outline" size={18} color={colors.accent.danger} />
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
        )}

        {/* ════════════ TAB 2: BACKUP & RESTORE SUITE ════════════ */}
        {activeTab === "backup" && (
          <View>
            {/* Action Panel Card */}
            <View style={styles.actionPanelCard}>
              <View style={styles.actionPanelHeaderRow}>
                <View style={[styles.actionPanelIconWrap, { backgroundColor: `${colors.accent.primary}18` }]}>
                  <MaterialIcons name="cloud-sync" size={24} color={colors.accent.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionPanelTitle}>Full Database Backup Suite</Text>
                  <Text style={styles.actionPanelDesc}>
                    Create complete snapshots of all 32 collections, or import JSON backup packages with smart merge.
                  </Text>
                </View>
              </View>

              <View style={styles.actionButtonsRow}>
                <Pressable
                  style={({ pressed }) => [styles.actionButton, styles.exportBtn, pressed && styles.actionBtnPressed]}
                  onPress={handleExportFullBackup}
                >
                  <MaterialIcons name="cloud-download" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Export All Tables</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionButton, styles.importBtn, pressed && styles.actionBtnPressed]}
                  onPress={handleImportBackup}
                >
                  <MaterialIcons name="cloud-upload" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Import Backup File</Text>
                </Pressable>
              </View>
            </View>

            {/* Category Storage Distribution Card */}
            <View style={styles.storageDistCard}>
              <Text style={styles.storageDistTitle}>Database Category Breakdown</Text>
              <View style={styles.storageDistGrid}>
                {Object.entries(categoryBreakdown).map(([category, count]) => {
                  const percentage = totalDocuments > 0 ? Math.round((count / totalDocuments) * 100) : 0;
                  return (
                    <View key={category} style={styles.storageDistItem}>
                      <View style={styles.storageDistItemHeader}>
                        <Text style={styles.storageDistCatName} numberOfLines={1}>
                          {category}
                        </Text>
                        <Text style={styles.storageDistCatCount}>{count} docs</Text>
                      </View>
                      <View style={styles.distBarBg}>
                        <View
                          style={[
                            styles.distBarFill,
                            {
                              width: `${Math.max(percentage, count > 0 ? 6 : 0)}%`,
                              backgroundColor: count > 0 ? colors.accent.primary : colors.border.subtle,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Local Backups Manager */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>
                Local Backup Files ({localBackups.length})
              </Text>
              <Pressable onPress={refreshLocalBackups} style={styles.refreshBtn}>
                <MaterialIcons name="refresh" size={18} color={colors.text.secondary} />
              </Pressable>
            </View>

            {localBackups.length === 0 ? (
              <View style={styles.emptyLocalBackups}>
                <MaterialIcons name="folder-zip" size={32} color={colors.text.muted} />
                <Text style={styles.emptyLocalBackupsText}>
                  No backups found on this device yet. Click &quot;Export All Tables&quot; to create one.
                </Text>
              </View>
            ) : (
              <View style={styles.localBackupsList}>
                {localBackups.map((file) => (
                  <View key={file.uri} style={styles.localBackupCard}>
                    <View style={styles.localBackupIconWrap}>
                      <MaterialIcons
                        name={file.name.endsWith(".csv") ? "grid-on" : "code"}
                        size={20}
                        color={colors.accent.primary}
                      />
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.localBackupName} numberOfLines={1}>
                        {file.name}
                      </Text>
                      <Text style={styles.localBackupMeta}>
                        {formatBytes(file.size)} • {new Date(file.modificationTime).toLocaleString()}
                      </Text>
                    </View>

                    <View style={styles.localBackupActions}>
                      {/* Restore */}
                      <Pressable
                        style={styles.localBackupActionBtn}
                        onPress={() => loadBackupFromFileUri(file.uri)}
                      >
                        <MaterialIcons name="settings-backup-restore" size={18} color={colors.accent.success} />
                      </Pressable>
                      {/* Share */}
                      <Pressable
                        style={styles.localBackupActionBtn}
                        onPress={() => handleShareLocalBackup(file)}
                      >
                        <MaterialIcons name="share" size={18} color={colors.accent.primary} />
                      </Pressable>
                      {/* Delete */}
                      <Pressable
                        style={[styles.localBackupActionBtn, { backgroundColor: colors.accent.dangerMuted }]}
                        onPress={() => handleDeleteLocalBackup(file)}
                      >
                        <MaterialIcons name="delete-outline" size={18} color={colors.accent.danger} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ════════════ TAB 3: MAINTENANCE & AUDIT TRAIL ════════════ */}
        {activeTab === "maintenance" && (
          <View>
            {/* Quick Maintenance Hub */}
            <View style={styles.actionPanelCard}>
              <Text style={styles.actionPanelTitle}>Database Maintenance Utilities</Text>
              <Text style={styles.actionPanelDesc}>
                Perform routine housekeeping, flush local caches, and prune temporary records.
              </Text>

              <View style={styles.maintenanceBtnGrid}>
                <Pressable
                  style={({ pressed }) => [styles.maintenanceBtn, pressed && styles.actionBtnPressed]}
                  onPress={handleFlushCache}
                >
                  <MaterialIcons name="cleaning-services" size={20} color={colors.accent.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.maintenanceBtnTitle}>Flush App Cache</Text>
                    <Text style={styles.maintenanceBtnSubtitle}>Re-sync offline indices and reset counters</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.maintenanceBtn, pressed && styles.actionBtnPressed]}
                  onPress={handlePruneLogs}
                >
                  <MaterialIcons name="auto-delete" size={20} color={colors.accent.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.maintenanceBtnTitle}>Prune System Logs</Text>
                    <Text style={styles.maintenanceBtnSubtitle}>Clear temporary notifications & tickets</Text>
                  </View>
                </Pressable>
              </View>
            </View>

            {/* Activity Audit Log */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Recent Operations Audit Log</Text>
              {activityLogs.length > 0 && (
                <Pressable
                  onPress={() => {
                    setActivityLogs([]);
                    AsyncStorage.removeItem(ACTIVITY_LOGS_STORAGE_KEY).catch(() => {});
                  }}
                >
                  <Text style={{ fontSize: 11, color: colors.text.muted, fontWeight: "700" }}>Clear Log</Text>
                </Pressable>
              )}
            </View>

            {activityLogs.length === 0 ? (
              <View style={styles.emptyLocalBackups}>
                <MaterialIcons name="receipt-long" size={32} color={colors.text.muted} />
                <Text style={styles.emptyLocalBackupsText}>
                  No recent data operations recorded yet.
                </Text>
              </View>
            ) : (
              <View style={styles.activityLogsList}>
                {activityLogs.slice(0, 10).map((log) => (
                  <View key={log.id} style={styles.activityLogCard}>
                    <View
                      style={[
                        styles.activityLogIconWrap,
                        log.action === "export" && { backgroundColor: `${colors.accent.primary}18` },
                        log.action === "import" && { backgroundColor: `${colors.accent.success}18` },
                        (log.action === "wipe" || log.action === "factory_reset") && { backgroundColor: "#fee2e2" },
                      ]}
                    >
                      <MaterialIcons
                        name={
                          log.action === "export"
                            ? "cloud-download"
                            : log.action === "import"
                            ? "cloud-upload"
                            : log.action === "wipe"
                            ? "delete-sweep"
                            : log.action === "factory_reset"
                            ? "delete-forever"
                            : "cleaning-services"
                        }
                        size={16}
                        color={
                          log.action === "export"
                            ? colors.accent.primary
                            : log.action === "import"
                            ? colors.accent.success
                            : colors.accent.danger
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityLogTitle}>{log.title}</Text>
                      <Text style={styles.activityLogDesc}>{log.details}</Text>
                      <Text style={styles.activityLogTime}>
                        {new Date(log.timestamp).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Danger Zone Factory Reset */}
            <Text style={styles.sectionHeadingDanger}>Danger Zone</Text>
            <View style={styles.dangerCard}>
              <View style={styles.dangerHeaderRow}>
                <MaterialIcons name="warning" size={22} color={colors.accent.danger} />
                <Text style={styles.dangerHeading}>Factory Reset All Database Tables</Text>
              </View>
              <Text style={styles.dangerText}>
                Wipes all 32 collections simultaneously. Your login credentials and business profile will remain intact.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.factoryBtn, pressed && styles.factoryBtnPressed]}
                onPress={() => setFactoryVisible(true)}
              >
                <MaterialIcons name="flash-on" size={18} color={colors.text.inverse} />
                <Text style={styles.factoryBtnText}>Factory Reset Suite</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </AnimatedPage>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (theme: any) => {
  const { colors, shadows } = theme;
  return StyleSheet.create({
    container: {
      padding: 16,
      backgroundColor: colors.bg.card,
      flexGrow: 1,
    },
    header: {
      marginBottom: 16,
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
      lineHeight: 18,
    },
    dashboardCard: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },
    dashboardRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    dashMetric: {
      flex: 1,
      alignItems: "center",
    },
    dashVal: {
      fontSize: 19,
      fontWeight: "800",
      color: colors.text.primary,
    },
    dashLabel: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
      fontWeight: "600",
    },
    dashDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.border.subtle,
    },
    tabBar: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      marginBottom: 14,
    },
    tabItem: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      gap: 6,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.muted,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 42,
      marginBottom: 12,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: colors.text.primary,
    },
    categoryPillsContainer: {
      gap: 8,
      paddingBottom: 12,
    },
    pillItem: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    pillText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: "600",
    },
    toolbarRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
      gap: 8,
    },
    multiSelectToggleBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    multiSelectToggleText: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: "600",
    },
    selectAllBtn: {
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    selectAllText: {
      fontSize: 11,
      color: colors.accent.primary,
      fontWeight: "700",
    },
    refreshBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      justifyContent: "center",
      alignItems: "center",
    },
    bulkActionBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.accent.primary,
      borderRadius: 12,
      padding: 10,
      marginBottom: 12,
    },
    bulkActionCount: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    bulkActionButtons: {
      flexDirection: "row",
      gap: 6,
    },
    bulkBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
    },
    bulkBtnText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "700",
    },
    list: {
      gap: 10,
    },
    emptyState: {
      padding: 32,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    emptyText: {
      fontSize: 13,
      color: colors.text.muted,
      textAlign: "center",
    },
    card: {
      flexDirection: "row",
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 14,
      padding: 12,
      alignItems: "center",
    },
    cardInfo: {
      flex: 1,
      marginRight: 8,
    },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
      flexWrap: "wrap",
    },
    cardLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    cardDesc: {
      fontSize: 11,
      color: colors.text.muted,
      lineHeight: 15,
    },
    categoryTag: {
      fontSize: 9,
      fontWeight: "700",
      color: colors.text.muted,
      marginTop: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    countBadge: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    countBadgeText: {
      color: colors.text.muted,
      fontSize: 10,
      fontWeight: "800",
    },
    cardActionsColumn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      justifyContent: "center",
      alignItems: "center",
    },
    actionPanelCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      ...shadows.card,
    },
    actionPanelHeaderRow: {
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
      marginBottom: 12,
    },
    actionPanelIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    actionPanelTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 2,
    },
    actionPanelDesc: {
      fontSize: 12,
      color: colors.text.muted,
      lineHeight: 17,
    },
    actionButtonsRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
    },
    actionButton: {
      flex: 1,
      height: 40,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    exportBtn: {
      backgroundColor: colors.accent.primary,
    },
    importBtn: {
      backgroundColor: colors.accent.success,
    },
    actionBtnPressed: {
      opacity: 0.9,
    },
    actionBtnText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "700",
    },
    storageDistCard: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
    },
    storageDistTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    storageDistGrid: {
      gap: 8,
    },
    storageDistItem: {
      gap: 3,
    },
    storageDistItemHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    storageDistCatName: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: "600",
      flex: 1,
    },
    storageDistCatCount: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "700",
    },
    distBarBg: {
      height: 5,
      backgroundColor: colors.border.subtle,
      borderRadius: 3,
      overflow: "hidden",
    },
    distBarFill: {
      height: "100%",
      borderRadius: 3,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
      marginTop: 4,
    },
    sectionHeading: {
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      color: colors.text.muted,
      letterSpacing: 0.8,
    },
    emptyLocalBackups: {
      padding: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
      gap: 6,
    },
    emptyLocalBackupsText: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: "center",
      lineHeight: 16,
    },
    localBackupsList: {
      gap: 8,
      marginBottom: 16,
    },
    localBackupCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 10,
    },
    localBackupIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 10,
    },
    localBackupName: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    localBackupMeta: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 2,
    },
    localBackupActions: {
      flexDirection: "row",
      gap: 4,
    },
    localBackupActionBtn: {
      width: 30,
      height: 30,
      borderRadius: 6,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      justifyContent: "center",
      alignItems: "center",
    },
    maintenanceBtnGrid: {
      gap: 8,
      marginTop: 8,
    },
    maintenanceBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 12,
    },
    maintenanceBtnTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    maintenanceBtnSubtitle: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 1,
    },
    activityLogsList: {
      gap: 8,
      marginBottom: 16,
    },
    activityLogCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 10,
    },
    activityLogIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    activityLogTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    activityLogDesc: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 1,
    },
    activityLogTime: {
      fontSize: 9,
      color: colors.text.muted,
      marginTop: 3,
    },
    sectionHeadingDanger: {
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      color: colors.accent.danger,
      letterSpacing: 0.8,
      marginTop: 18,
      marginBottom: 10,
    },
    dangerCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.accent.danger,
      borderRadius: 16,
      padding: 16,
      marginBottom: 24,
    },
    dangerHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
    },
    dangerHeading: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.accent.danger,
    },
    dangerText: {
      fontSize: 12,
      color: colors.text.secondary,
      lineHeight: 17,
      marginBottom: 14,
    },
    factoryBtn: {
      backgroundColor: colors.accent.danger,
      height: 42,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    factoryBtnPressed: {
      backgroundColor: "#dc2626",
    },
    factoryBtnText: {
      color: colors.text.inverse,
      fontSize: 13,
      fontWeight: "700",
    },
    loaderBg: {
      flex: 1,
      backgroundColor: "rgba(15, 23, 42, 0.65)",
      justifyContent: "center",
      alignItems: "center",
    },
    loaderContent: {
      backgroundColor: colors.bg.card,
      padding: 24,
      borderRadius: 20,
      alignItems: "center",
      width: "82%",
      maxWidth: 320,
    },
    loaderTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 14,
      marginBottom: 4,
      textAlign: "center",
    },
    loaderDesc: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: "center",
      lineHeight: 16,
    },
    progressBarWrapper: {
      width: "100%",
      height: 6,
      backgroundColor: colors.bg.primary,
      borderRadius: 3,
      marginTop: 14,
      overflow: "hidden",
    },
    progressBarFill: {
      height: "100%",
      backgroundColor: colors.accent.primary,
      borderRadius: 3,
    },
    modalBg: {
      flex: 1,
      backgroundColor: colors.bg.overlay,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modalContent: {
      backgroundColor: colors.bg.card,
      borderRadius: 20,
      padding: 18,
      width: "100%",
      maxWidth: 420,
      alignItems: "center",
    },
    warningIconWrapper: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "#fff7ed",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 6,
      textAlign: "center",
    },
    modalDesc: {
      fontSize: 12,
      color: colors.text.secondary,
      textAlign: "center",
      lineHeight: 17,
      marginBottom: 14,
    },
    inspectHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      gap: 10,
      marginBottom: 12,
    },
    inspectHeaderIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    inspectTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text.primary,
    },
    inspectSub: {
      fontSize: 11,
      color: colors.text.muted,
    },
    inspectCloseBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.bg.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    inspectSegmentWrapper: {
      flexDirection: "row",
      backgroundColor: colors.bg.primary,
      borderRadius: 10,
      padding: 3,
      width: "100%",
      marginBottom: 12,
      gap: 4,
    },
    inspectSegmentBtn: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    inspectSegmentText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.muted,
    },
    inspectDescText: {
      fontSize: 12,
      color: colors.text.secondary,
      lineHeight: 17,
      marginBottom: 12,
    },
    inspectDetailsBox: {
      width: "100%",
      backgroundColor: colors.bg.primary,
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
      gap: 6,
    },
    inspectRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    inspectLabel: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: "600",
    },
    inspectVal: {
      fontSize: 12,
      color: colors.text.primary,
      fontWeight: "700",
    },
    inspectSectionHeading: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    inspectExportRow: {
      flexDirection: "row",
      gap: 10,
      width: "100%",
    },
    sampleSearchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      paddingHorizontal: 10,
      height: 38,
      marginBottom: 8,
      gap: 6,
    },
    sampleSearchInput: {
      flex: 1,
      fontSize: 12,
      color: colors.text.primary,
    },
    sampleDocCard: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      padding: 8,
      marginBottom: 8,
    },
    sampleDocHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    sampleDocId: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    sampleDocIndex: {
      fontSize: 10,
      color: colors.text.muted,
      fontWeight: "700",
    },
    sampleDocJson: {
      fontSize: 10,
      fontFamily: "monospace",
      color: colors.text.secondary,
      lineHeight: 14,
    },
    restoreModeContainer: {
      width: "100%",
      gap: 8,
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
    previewList: {
      width: "100%",
      maxHeight: 200,
      marginBottom: 14,
    },
    previewItem: {
      flexDirection: "row",
      alignItems: "center",
      padding: 8,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 8,
      marginBottom: 6,
      backgroundColor: colors.bg.primary,
    },
    previewLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    previewSub: {
      fontSize: 10,
      color: colors.text.muted,
    },
    typedRequirement: {
      fontSize: 11,
      color: colors.accent.danger,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 8,
    },
    verificationInput: {
      borderWidth: 1.5,
      borderColor: "#fca5a5",
      borderRadius: 10,
      height: 40,
      width: "100%",
      paddingHorizontal: 12,
      fontSize: 13,
      color: "#991b1b",
      fontWeight: "700",
      textAlign: "center",
      backgroundColor: "#fff5f5",
      marginBottom: 16,
    },
    modalActions: {
      flexDirection: "row",
      gap: 10,
      width: "100%",
    },
    modalBtn: {
      flex: 1,
      height: 40,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    cancelBtn: {
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
    },
    cancelBtnText: {
      color: colors.text.muted,
      fontSize: 12,
      fontWeight: "700",
    },
    deleteBtn: {
      backgroundColor: colors.accent.danger,
    },
    deleteBtnText: {
      color: colors.text.inverse,
      fontSize: 12,
      fontWeight: "700",
    },
    factoryConfirmBtn: {
      backgroundColor: colors.accent.danger,
    },
    factoryConfirmBtnDisabled: {
      backgroundColor: "#fca5a5",
      opacity: 0.6,
    },
  });
};

export default function DataManagementRoute() {
  return (
    <ProtectedRoute>
      <DataManagement />
    </ProtectedRoute>
  );
}