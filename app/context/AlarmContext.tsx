import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  Timestamp,
  updateDoc,
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
import { AuthContext } from "./AuthContext";

export interface AlarmItem {
  id: string;
  title?: string;
  notes?: string;
  time?: string;
  date?: string;
  type?: "once" | "daily" | "weekly" | string;
  weekday?: number | string;
  isActive?: boolean;
  notificationId?: string | null;
  createdAt?: unknown;
  [key: string]: unknown;
}

export interface AlarmContextType {
  alarms: AlarmItem[];
  loading: boolean;
  permissionStatus: string;
  requestPermissions: () => Promise<boolean>;
  addAlarm: (alarm: Partial<AlarmItem> & Record<string, any>) => Promise<string>;
  updateAlarm: (id: string, updates: Partial<AlarmItem> & Record<string, any>) => Promise<void>;
  deleteAlarm: (id: string) => Promise<void>;
  testAlarmNotification: (alarm: Partial<AlarmItem> & Record<string, any>) => Promise<boolean>;
}

export const AlarmContext = createContext<AlarmContextType>({
  alarms: [],
  loading: true,
  permissionStatus: "undetermined",
  requestPermissions: async () => false,
  addAlarm: async () => "",
  updateAlarm: async () => {},
  deleteAlarm: async () => {},
  testAlarmNotification: async () => false,
});

// Conditionally load expo-notifications
let Notifications: any = null;
if (Platform.OS !== "web" && Constants.appOwnership !== "expo") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require("expo-notifications");
  } catch {
    // Notifications module unavailable in current runtime
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
    // Ignore handler registration error
  }
}

export function AlarmProvider({ children }: { children: ReactNode }) {
  useContext(AuthContext);
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [permissionStatus, setPermissionStatus] = useState<string>("undetermined");
  const alarmsRef = useRef<AlarmItem[]>(alarms);

  useEffect(() => {
    alarmsRef.current = alarms;
  }, [alarms]);

  // Defer Firestore listener to reduce startup load
  const _deferReady = useDeferredInit();

  // Check notification permission status on mount (deferred)
  useEffect(() => {
    if (!_deferReady) return;
    async function checkPermission() {
      if (!Notifications) {
        setPermissionStatus("unsupported");
        return;
      }
      try {
        const { status } = await Notifications.getPermissionsAsync();
        setPermissionStatus(status);
      } catch {
        // Ignore permission check failure
      }
    }
    checkPermission();
  }, [_deferReady]);

  // Request notification permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (!Notifications) return false;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setPermissionStatus(status);
      return status === "granted";
    } catch {
      return false;
    }
  }, []);

  // Real-time listener for alarms collection (deferred)
  useEffect(() => {
    if (!_deferReady) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const colRef = collection(db, "alarms");
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as AlarmItem[];
        // Sort alarms by time for better list presentation
        const sortedData = data.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        alarmsRef.current = sortedData;
        setAlarms(sortedData);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [_deferReady]);

  // Schedule a local notification based on alarm properties
  const scheduleLocalNotification = useCallback(
    async (alarm: Partial<AlarmItem> & Record<string, any>): Promise<string | null> => {
      if (!Notifications) {
        return null;
      }

      try {
        // Ensure permission is granted
        const granted = await requestPermissions();
        if (!granted) {
          return null;
        }

        const [hourStr, minuteStr] = (alarm.time || "09:00").split(":");
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);

        const content: Record<string, any> = {
          title: alarm.title || "Business Alarm",
          body: alarm.notes || "Time for your scheduled reminder!",
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { alarmId: alarm.id || "" },
        };

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("alarms", {
            name: "Alarms & Reminders",
            importance: Notifications.AndroidImportance.HIGH,
            sound: true,
            vibrationPattern: [0, 250, 250, 250],
          });
          content.channelId = "alarms";
        }

        let trigger: any = null;

        if (alarm.type === "once") {
          if (!alarm.date) return null;
          const [year, month, day] = alarm.date.split("-").map(Number);
          const triggerDate = new Date(year, month - 1, day, hour, minute, 0);

          if (triggerDate.getTime() <= Date.now()) {
            // If in the past, schedule for 5 seconds in future as safeguard
            trigger = {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(Date.now() + 5000),
            };
          } else {
            trigger = {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: triggerDate,
            };
          }
        } else if (alarm.type === "daily") {
          trigger = {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
          };
        } else if (alarm.type === "weekly") {
          const weekdayVal = Number(alarm.weekday); // 1 = Sunday, 2 = Monday...
          if (isNaN(weekdayVal) || weekdayVal < 1 || weekdayVal > 7) {
            return null;
          }
          trigger = {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: weekdayVal,
            hour,
            minute,
          };
        }

        const notificationId = await Notifications.scheduleNotificationAsync({
          content,
          trigger,
        });
        return notificationId;
      } catch {
        return null;
      }
    },
    [requestPermissions],
  );

  // Cancel a scheduled local notification
  const cancelLocalNotification = useCallback(
    async (notificationId: string | null | undefined) => {
      if (!Notifications || !notificationId) return;
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
      } catch {
        // Ignore cancellation error
      }
    },
    [],
  );

  // Add a new alarm
  const addAlarm = useCallback(
    async (alarm: Partial<AlarmItem> & Record<string, any>): Promise<string> => {
      let notificationId: string | null = null;
      if (alarm.isActive) {
        notificationId = await scheduleLocalNotification(alarm);
      }
      const docRef = await addDoc(collection(db, "alarms"), {
        ...alarm,
        notificationId,
        createdAt: Timestamp.now(),
      });
      return docRef.id;
    },
    [scheduleLocalNotification],
  );

  // Update an existing alarm
  const updateAlarm = useCallback(
    async (id: string, updates: Partial<AlarmItem> & Record<string, any>): Promise<void> => {
      const oldAlarm = (alarmsRef.current || []).find((a) => a.id === id);
      let notificationId = oldAlarm ? oldAlarm.notificationId || null : null;

      const needsReschedule =
        oldAlarm &&
        (oldAlarm.isActive !== updates.isActive ||
          oldAlarm.time !== updates.time ||
          oldAlarm.date !== updates.date ||
          oldAlarm.type !== updates.type ||
          oldAlarm.weekday !== updates.weekday ||
          oldAlarm.title !== updates.title ||
          oldAlarm.notes !== updates.notes);

      if (needsReschedule) {
        if (notificationId) {
          await cancelLocalNotification(notificationId);
          notificationId = null;
        }

        const mergedAlarm = { ...oldAlarm, ...updates, id };
        if (mergedAlarm.isActive) {
          notificationId = await scheduleLocalNotification(mergedAlarm);
        }
      }

      const docRef = doc(db, "alarms", id);
      await updateDoc(docRef, {
        ...updates,
        notificationId,
      });
    },
    [cancelLocalNotification, scheduleLocalNotification],
  );

  // Delete an alarm
  const deleteAlarm = useCallback(
    async (id: string): Promise<void> => {
      const oldAlarm = (alarmsRef.current || []).find((a) => a.id === id);
      if (oldAlarm && oldAlarm.notificationId) {
        await cancelLocalNotification(oldAlarm.notificationId);
      }
      const docRef = doc(db, "alarms", id);
      await deleteDoc(docRef);
    },
    [cancelLocalNotification],
  );

  // Test trigger an alarm notification immediately (2 seconds delay)
  const testAlarmNotification = useCallback(
    async (alarm: Partial<AlarmItem> & Record<string, any>): Promise<boolean> => {
      if (!Notifications) {
        return false;
      }
      try {
        const granted = await requestPermissions();
        if (!granted) return false;

        const content: Record<string, any> = {
          title: `🔔 [Test] ${alarm.title || "Test Reminder"}`,
          body: alarm.notes || "This is a quick verification of your alarm manager.",
          sound: true,
          data: { alarmId: alarm.id || "test" },
        };

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("alarms", {
            name: "Alarms & Reminders",
            importance: Notifications.AndroidImportance.HIGH,
            sound: true,
          });
          content.channelId = "alarms";
        }

        await Notifications.scheduleNotificationAsync({
          content,
          trigger: { seconds: 2 },
        });
        return true;
      } catch {
        return false;
      }
    },
    [requestPermissions],
  );

  const contextValue = useMemo<AlarmContextType>(
    () => ({
      alarms,
      loading,
      permissionStatus,
      requestPermissions,
      addAlarm,
      updateAlarm,
      deleteAlarm,
      testAlarmNotification,
    }),
    [
      alarms,
      loading,
      permissionStatus,
      requestPermissions,
      addAlarm,
      updateAlarm,
      deleteAlarm,
      testAlarmNotification,
    ],
  );

  return (
    <AlarmContext.Provider value={contextValue}>
      {children}
    </AlarmContext.Provider>
  );
}

export default function AlarmRoutePlaceholder() {
  return null;
}

