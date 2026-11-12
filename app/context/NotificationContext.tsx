import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useDeferredInit } from "../../hooks/useDeferredInit";
import { db } from "../../src/config/firebase";
import { roundCurrency } from "../../utils/currency";
import { CustomerContext } from "./CustomerContext";
import { ExpenseContext } from "./ExpenseContext";
import { ItemContext } from "./ItemContext";
import { RawMaterialSupplierContext } from "./RawMaterialSupplierContext";
import { WorkerContext } from "./WorkerContext";

export interface NotificationItem {
  id: string;
  title?: string;
  description?: string;
  type?: string;
  icon?: string;
  color?: string;
  read?: boolean;
  alertKey?: string | null;
  createdAt: Date;
  [key: string]: unknown;
}

export interface SmartAlertItem {
  type: string;
  icon: string;
  color: string;
  bgColor: string;
  title: string;
  description: string;
  count: number;
  totalValue?: number;
  route: string;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  lowStockAlert: boolean;
  lowStockThreshold: number;
  dueAlertsEnabled: boolean;
  dueAlertDays: number;
  workerDueAlert: boolean;
  workerDueThreshold: number;
  supplierBalanceAlert: boolean;
  supplierBalanceThreshold: number;
  dailySummary: boolean;
  expoPushToken?: string;
  [key: string]: unknown;
}

export interface NotificationContextType {
  notifications: NotificationItem[];
  loading: boolean;
  unreadCount: number;
  smartAlerts: SmartAlertItem[];
  preferences: NotificationPreferences;
  prefsLoading: boolean;
  addNotification: (data: Record<string, any>) => Promise<string | null>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>;
  expoPushToken: string;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  emailEnabled: false,
  smsEnabled: false,
  lowStockAlert: true,
  lowStockThreshold: 5,
  dueAlertsEnabled: true,
  dueAlertDays: 7,
  workerDueAlert: true,
  workerDueThreshold: 5000,
  supplierBalanceAlert: true,
  supplierBalanceThreshold: 10000,
  dailySummary: false,
};

export const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  loading: true,
  unreadCount: 0,
  smartAlerts: [],
  preferences: DEFAULT_PREFERENCES,
  prefsLoading: true,
  addNotification: async () => null,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  deleteNotification: async () => {},
  clearAll: async () => {},
  updatePreferences: async () => {},
  expoPushToken: "",
});

// Conditionally load expo-notifications to completely bypass Expo Go SDK 53+ limitations and crashes
let Notifications: any = null;
if (Platform.OS !== "web" && Constants.appOwnership !== "expo") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require("expo-notifications");
  } catch {
    // Ignore missing optional notifications module
  }
}

// Configure notification behavior if plugin is successfully loaded
if (Notifications) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch {
    // Ignore handler setup failure
  }
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Notifications) {
    return null;
  }

  let token: string | null = null;

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    } catch {
      // Ignore Android channel failure
    }
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    // Ignore token fetch failure
  }

  return token;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [prefsLoading, setPrefsLoading] = useState<boolean>(true);
  const [expoPushToken, setExpoPushToken] = useState<string>("");

  const notificationsRef = useRef<NotificationItem[]>(notifications);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const preferencesRef = useRef<NotificationPreferences>(preferences);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  // Defer Firestore listeners and push registration to reduce startup load
  const _deferReady = useDeferredInit();

  // ─── Preferences CRUD ───
  const updatePreferences = useCallback(
    async (updates: Partial<NotificationPreferences>): Promise<void> => {
      try {
        const prefsDocRef = doc(db, "notification_settings", "default_user");
        const merged = { ...preferencesRef.current, ...updates, updatedAt: new Date() };
        await setDoc(prefsDocRef, merged, { merge: true });
      } catch {
        // Ignore preference update failure
      }
    },
    [],
  );

  // Register push notifications on mount (deferred)
  useEffect(() => {
    if (!_deferReady) return;
    if (!Notifications) {
      return;
    }

    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        setExpoPushToken(token);
        updatePreferences({ expoPushToken: token });
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [_deferReady, updatePreferences]);

  // Access existing contexts for smart alerts
  const { items } = useContext(ItemContext) || { items: [] };
  const { expenses } = (useContext(ExpenseContext) as any) || { expenses: [] };
  const { workers } = (useContext(WorkerContext) as any) || { workers: [] };
  const { suppliers } = useContext(RawMaterialSupplierContext) || { suppliers: [] };
  const { customers } = useContext(CustomerContext) || { customers: [] };

  // ─── Notifications Listener (deferred) ───
  useEffect(() => {
    if (!_deferReady) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const notifCollection = collection(db, "notifications");
    const unsubscribe = onSnapshot(
      notifCollection,
      (snapshot) => {
        const dbNotifs = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt:
              data.createdAt instanceof Date
                ? data.createdAt
                : data.createdAt?.toDate
                  ? data.createdAt.toDate()
                  : new Date(data.createdAt || Date.now()),
          } as NotificationItem;
        });
        dbNotifs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        notificationsRef.current = dbNotifs;
        setNotifications(dbNotifs);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [_deferReady]);

  // ─── Preferences Listener (deferred) ───
  useEffect(() => {
    if (!_deferReady) {
      setPrefsLoading(false);
      return;
    }
    setPrefsLoading(true);
    const prefsDocRef = doc(db, "notification_settings", "default_user");
    const unsubscribe = onSnapshot(
      prefsDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const nextPrefs = {
            ...DEFAULT_PREFERENCES,
            ...docSnap.data(),
          } as NotificationPreferences;
          preferencesRef.current = nextPrefs;
          setPreferences(nextPrefs);
        } else {
          preferencesRef.current = DEFAULT_PREFERENCES;
          setPreferences(DEFAULT_PREFERENCES);
        }
        setPrefsLoading(false);
      },
      () => {
        setPrefsLoading(false);
      },
    );
    return () => unsubscribe();
  }, [_deferReady]);

  // ─── Unread Count ───
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  // ─── Smart Business Alerts (computed from contexts) ───
  const smartAlerts = useMemo<SmartAlertItem[]>(() => {
    const alerts: SmartAlertItem[] = [];
    const threshold = preferences.lowStockThreshold || 5;

    // Low Stock Alerts
    if (preferences.lowStockAlert) {
      const lowStockItems = (items || []).filter((item) => {
        const stock = item.openingStock !== undefined ? item.openingStock : item.stock || 0;
        return (
          Number(stock) <= threshold &&
          Number(stock) >= 0 &&
          item.itemType !== "raw_material"
        );
      });
      if (lowStockItems.length > 0) {
        alerts.push({
          type: "low_stock",
          icon: "warning",
          color: "#ef4444",
          bgColor: "#fef2f2",
          title: `${lowStockItems.length} item${lowStockItems.length > 1 ? "s" : ""} low on stock`,
          description:
            lowStockItems
              .slice(0, 3)
              .map((i) => i.itemName)
              .join(", ") +
            (lowStockItems.length > 3 ? ` +${lowStockItems.length - 3} more` : ""),
          count: lowStockItems.length,
          route: "/inventory",
        });
      }
    }

    // Overdue Expense Alerts
    if (preferences.dueAlertsEnabled) {
      const dueDays = preferences.dueAlertDays || 7;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - dueDays);
      const overdueExpenses = ((expenses as any[]) || []).filter((e) => {
        const remaining =
          e.remainingAmount !== undefined
            ? Number(e.remainingAmount)
            : e.paymentMethod === "Balance"
              ? Number(e.amount || 0)
              : 0;
        if (remaining <= 0) return false;
        const expDate =
          e.expenseDate instanceof Date ? e.expenseDate : new Date(e.expenseDate);
        return expDate <= cutoff;
      });
      if (overdueExpenses.length > 0) {
        const totalOverdue = roundCurrency(
          overdueExpenses.reduce((sum, e) => {
            const rem =
              e.remainingAmount !== undefined
                ? Number(e.remainingAmount)
                : Number(e.amount || 0);
            return sum + rem;
          }, 0),
        );
        alerts.push({
          type: "overdue_expense",
          icon: "schedule",
          color: "#ea580c",
          bgColor: "#fff7ed",
          title: `${overdueExpenses.length} expense${overdueExpenses.length > 1 ? "s" : ""} overdue`,
          description: `₹${totalOverdue.toLocaleString("en-IN")} pending for ${dueDays}+ days`,
          count: overdueExpenses.length,
          totalValue: totalOverdue,
          route: "/expenses",
        });
      }
    }

    // Worker Dues Alerts
    if (preferences.workerDueAlert) {
      const wThreshold = preferences.workerDueThreshold || 5000;
      const highDueWorkers = ((workers as any[]) || []).filter((w) => {
        return w.status === "Active" && Number(w.totalPending || 0) > wThreshold;
      });
      if (highDueWorkers.length > 0) {
        const totalWorkerDue = roundCurrency(
          highDueWorkers.reduce((sum, w) => sum + Number(w.totalPending || 0), 0),
        );
        alerts.push({
          type: "worker_dues",
          icon: "engineering",
          color: "#7c3aed",
          bgColor: "#faf5ff",
          title: `${highDueWorkers.length} worker${highDueWorkers.length > 1 ? "s" : ""} with high pending dues`,
          description: `₹${totalWorkerDue.toLocaleString("en-IN")} total pending (>₹${wThreshold.toLocaleString("en-IN")} each)`,
          count: highDueWorkers.length,
          totalValue: totalWorkerDue,
          route: "/expense-balances",
        });
      }
    }

    // Supplier Balance Alerts
    if (preferences.supplierBalanceAlert) {
      const sThreshold = preferences.supplierBalanceThreshold || 10000;
      const highBalanceSuppliers = (suppliers || []).filter((s) => {
        return Number(s.balance || 0) > sThreshold;
      });
      if (highBalanceSuppliers.length > 0) {
        const totalSupplierBal = roundCurrency(
          highBalanceSuppliers.reduce((sum, s) => sum + Number(s.balance || 0), 0),
        );
        alerts.push({
          type: "supplier_balance",
          icon: "local-shipping",
          color: "#d97706",
          bgColor: "#fffbeb",
          title: `${highBalanceSuppliers.length} supplier${highBalanceSuppliers.length > 1 ? "s" : ""} with high balance`,
          description: `₹${totalSupplierBal.toLocaleString("en-IN")} total outstanding (>₹${sThreshold.toLocaleString("en-IN")} each)`,
          count: highBalanceSuppliers.length,
          totalValue: totalSupplierBal,
          route: "/expense-balances",
        });
      }
    }

    // Customer Balance Alerts
    const highBalanceCustomers = (customers || []).filter((c) => {
      const balance = Number(
        c.totalPending !== undefined ? c.totalPending : c.balance || 0,
      );
      return balance > 10000;
    });
    if (highBalanceCustomers.length > 0) {
      const totalCustBal = roundCurrency(
        highBalanceCustomers.reduce((sum, c) => {
          return sum + Number(c.totalPending !== undefined ? c.totalPending : c.balance || 0);
        }, 0),
      );
      alerts.push({
        type: "customer_balance",
        icon: "people",
        color: "#0284c7",
        bgColor: "#f0f9ff",
        title: `${highBalanceCustomers.length} customer${highBalanceCustomers.length > 1 ? "s" : ""} with high outstanding`,
        description: `₹${totalCustBal.toLocaleString("en-IN")} total receivable`,
        count: highBalanceCustomers.length,
        totalValue: totalCustBal,
        route: "/customers",
      });
    }

    return alerts;
  }, [items, expenses, workers, suppliers, customers, preferences]);

  // ─── CRUD Operations ───
  const addNotification = useCallback(
    async (data: Record<string, any>): Promise<string | null> => {
      try {
        const payload = {
          title: data.title || "",
          description: data.description || "",
          type: data.type || "info",
          icon: data.icon || "notifications",
          color: data.color || "#6C5CE7",
          read: false,
          alertKey: data.alertKey || null,
          createdAt: new Date(),
        };
        const docRef = await addDoc(collection(db, "notifications"), payload);

        if (Notifications && preferencesRef.current?.pushEnabled) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: payload.title,
                body: payload.description,
                data: { type: payload.type, notificationId: docRef.id },
                sound: true,
              },
              trigger: null,
            });
          } catch {
            // Ignore local notification schedule failure
          }
        }

        return docRef.id;
      } catch {
        return null;
      }
    },
    [],
  );

  const markAsRead = useCallback(async (id: string): Promise<void> => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch {
      // Ignore update failure
    }
  }, []);

  const markAllAsRead = useCallback(async (): Promise<void> => {
    try {
      const batch = writeBatch(db);
      (notificationsRef.current || [])
        .filter((n) => !n.read)
        .forEach((n) => {
          batch.update(doc(db, "notifications", n.id), { read: true });
        });
      await batch.commit();
    } catch {
      // Ignore batch failure
    }
  }, []);

  const deleteNotification = useCallback(async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch {
      // Ignore delete failure
    }
  }, []);

  const clearAll = useCallback(async (): Promise<void> => {
    try {
      const batch = writeBatch(db);
      (notificationsRef.current || []).forEach((n) => {
        batch.delete(doc(db, "notifications", n.id));
      });
      await batch.commit();
    } catch {
      // Ignore clear failure
    }
  }, []);

  const contextValue = useMemo<NotificationContextType>(
    () => ({
      notifications,
      loading,
      unreadCount,
      smartAlerts,
      preferences,
      prefsLoading,
      addNotification,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearAll,
      updatePreferences,
      expoPushToken,
    }),
    [
      notifications,
      loading,
      unreadCount,
      smartAlerts,
      preferences,
      prefsLoading,
      addNotification,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearAll,
      updatePreferences,
      expoPushToken,
    ],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export default function NotificationRoutePlaceholder() {
  return null;
}

