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
import { createContext, useContext, useEffect, useState, useMemo, useRef } from "react";
import { db } from "../../src/config/firebase";
import { ItemContext } from "./ItemContext";
import { ExpenseContext } from "./ExpenseContext";
import { WorkerContext } from "./WorkerContext";
import { RawMaterialSupplierContext } from "./RawMaterialSupplierContext";
import { CustomerContext } from "./CustomerContext";
import Constants from "expo-constants";
import { Platform } from "react-native";

export const NotificationContext = createContext(null);

// Conditionally load expo-notifications to completely bypass Expo Go SDK 53+ limitations and crashes
let Notifications = null;
if (Platform.OS !== "web" && Constants.appOwnership !== "expo") {
  try {
    Notifications = require("expo-notifications");
  } catch (e) {
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
  } catch (e) {
  }
}

async function registerForPushNotificationsAsync() {
  if (!Notifications) {
    return null;
  }

  let token;

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    } catch (e) {
    }
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }
    
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
    }
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
  }

  return token;
}

const DEFAULT_PREFERENCES = {
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

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [expoPushToken, setExpoPushToken] = useState("");
  const notificationListener = useRef();
  const responseListener = useRef();

  // Register push notifications on mount
  useEffect(() => {
    if (!Notifications) {
      return;
    }

    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        // Save push token in Firestore under preferences doc
        updatePreferences({ expoPushToken: token });
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // Access existing contexts for smart alerts
  const { items } = useContext(ItemContext) || { items: [] };
  const { expenses } = useContext(ExpenseContext) || { expenses: [] };
  const { workers } = useContext(WorkerContext) || { workers: [] };
  const { suppliers } = useContext(RawMaterialSupplierContext) || { suppliers: [] };
  const { customers } = useContext(CustomerContext) || { customers: [] };

  // ─── Notifications Listener ───
  useEffect(() => {
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
            createdAt: data.createdAt instanceof Date
              ? data.createdAt
              : data.createdAt?.toDate
                ? data.createdAt.toDate()
                : new Date(data.createdAt || Date.now()),
          };
        });
        dbNotifs.sort((a, b) => b.createdAt - a.createdAt);
        setNotifications(dbNotifs);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // ─── Preferences Listener ───
  useEffect(() => {
    setPrefsLoading(true);
    const prefsDocRef = doc(db, "notification_settings", "default_user");
    const unsubscribe = onSnapshot(
      prefsDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setPreferences({ ...DEFAULT_PREFERENCES, ...docSnap.data() });
        } else {
          setPreferences(DEFAULT_PREFERENCES);
        }
        setPrefsLoading(false);
      },
      (error) => {
        setPrefsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // ─── Unread Count ───
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  // ─── Smart Business Alerts (computed from contexts) ───
  const smartAlerts = useMemo(() => {
    const alerts = [];
    const threshold = preferences.lowStockThreshold || 5;

    // Low Stock Alerts
    if (preferences.lowStockAlert) {
      const lowStockItems = (items || []).filter((item) => {
        const stock = item.openingStock !== undefined ? item.openingStock : item.stock || 0;
        return Number(stock) <= threshold && Number(stock) >= 0 && item.itemType !== "raw_material";
      });
      if (lowStockItems.length > 0) {
        alerts.push({
          type: "low_stock",
          icon: "warning",
          color: "#ef4444",
          bgColor: "#fef2f2",
          title: `${lowStockItems.length} item${lowStockItems.length > 1 ? "s" : ""} low on stock`,
          description: lowStockItems.slice(0, 3).map((i) => i.itemName).join(", ") +
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
      const overdueExpenses = (expenses || []).filter((e) => {
        const remaining = e.remainingAmount !== undefined
          ? Number(e.remainingAmount)
          : e.paymentMethod === "Balance" ? Number(e.amount || 0) : 0;
        if (remaining <= 0) return false;
        const expDate = e.expenseDate instanceof Date ? e.expenseDate : new Date(e.expenseDate);
        return expDate <= cutoff;
      });
      if (overdueExpenses.length > 0) {
        const totalOverdue = overdueExpenses.reduce((sum, e) => {
          const rem = e.remainingAmount !== undefined ? Number(e.remainingAmount) : Number(e.amount || 0);
          return sum + rem;
        }, 0);
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
      const highDueWorkers = (workers || []).filter((w) => {
        return w.status === "Active" && Number(w.totalPending || 0) > wThreshold;
      });
      if (highDueWorkers.length > 0) {
        const totalWorkerDue = highDueWorkers.reduce((sum, w) => sum + Number(w.totalPending || 0), 0);
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
        const totalSupplierBal = highBalanceSuppliers.reduce((sum, s) => sum + Number(s.balance || 0), 0);
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
      const balance = Number(c.totalPending !== undefined ? c.totalPending : c.balance || 0);
      return balance > 10000;
    });
    if (highBalanceCustomers.length > 0) {
      const totalCustBal = highBalanceCustomers.reduce((sum, c) => {
        return sum + Number(c.totalPending !== undefined ? c.totalPending : c.balance || 0);
      }, 0);
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
  const addNotification = async (data) => {
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

      // Trigger actual device local push notification if enabled
      if (preferences.pushEnabled) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: payload.title,
              body: payload.description,
              data: { type: payload.type, notificationId: docRef.id },
              sound: true,
            },
            trigger: null, // immediate
          });
        } catch (e) {
        }
      }

      return docRef.id;
    } catch (error) {
      return null;
    }
  };

  const markAsRead = async (id) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (error) {
    }
  };

  const markAllAsRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.filter((n) => !n.read).forEach((n) => {
        batch.update(doc(db, "notifications", n.id), { read: true });
      });
      await batch.commit();
    } catch (error) {
    }
  };

  const deleteNotification = async (id) => {
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (error) {
    }
  };

  const clearAll = async () => {
    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        batch.delete(doc(db, "notifications", n.id));
      });
      await batch.commit();
    } catch (error) {
    }
  };

  // ─── Preferences CRUD ───
  const updatePreferences = async (updates) => {
    try {
      const prefsDocRef = doc(db, "notification_settings", "default_user");
      const merged = { ...preferences, ...updates, updatedAt: new Date() };
      await setDoc(prefsDocRef, merged, { merge: true });
    } catch (error) {
    }
  };

  return (
    <NotificationContext.Provider
      value={{
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
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export default function NotificationRoutePlaceholder() {
  return null;
}