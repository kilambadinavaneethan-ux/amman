import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";
import { db } from "../../src/config/firebase";
import { AuthContext } from "./AuthContext";
import { Platform } from "react-native";
import Constants from "expo-constants";

export const AlarmContext = createContext();

// Conditionally load expo-notifications
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

export function AlarmProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState("undetermined");

  // Check notification permission status on mount
  useEffect(() => {
    async function checkPermission() {
      if (!Notifications) {
        setPermissionStatus("unsupported");
        return;
      }
      try {
        const { status } = await Notifications.getPermissionsAsync();
        setPermissionStatus(status);
      } catch (e) {
      }
    }
    checkPermission();
  }, []);

  // Request notification permissions
  const requestPermissions = async () => {
    if (!Notifications) return false;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setPermissionStatus(status);
      return status === "granted";
    } catch (e) {
      return false;
    }
  };

  // Real-time listener for alarms collection
  useEffect(() => {
    setLoading(true);
    const colRef = collection(db, "alarms");
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      // Sort alarms by time for better list presentation
      const sortedData = data.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      setAlarms(sortedData);
      setLoading(false);
    }, (error) => {
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Schedule a local notification based on alarm properties
  const scheduleLocalNotification = async (alarm) => {
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

      const content = {
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

      let trigger = null;

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
    } catch (e) {
      return null;
    }
  };

  // Cancel a scheduled local notification
  const cancelLocalNotification = async (notificationId) => {
    if (!Notifications || !notificationId) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (e) {
    }
  };

  // Add a new alarm
  const addAlarm = async (alarm) => {
    try {
      let notificationId = null;
      if (alarm.isActive) {
        notificationId = await scheduleLocalNotification(alarm);
      }
      const docRef = await addDoc(collection(db, "alarms"), {
        ...alarm,
        notificationId,
        createdAt: Timestamp.now(),
      });
      return docRef.id;
    } catch (e) {
      throw e;
    }
  };

  // Update an existing alarm
  const updateAlarm = async (id, updates) => {
    try {
      const oldAlarm = alarms.find((a) => a.id === id);
      let notificationId = oldAlarm ? oldAlarm.notificationId : null;

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
    } catch (e) {
      throw e;
    }
  };

  // Delete an alarm
  const deleteAlarm = async (id) => {
    try {
      const oldAlarm = alarms.find((a) => a.id === id);
      if (oldAlarm && oldAlarm.notificationId) {
        await cancelLocalNotification(oldAlarm.notificationId);
      }
      const docRef = doc(db, "alarms", id);
      await deleteDoc(docRef);
    } catch (e) {
      throw e;
    }
  };

  // Test trigger an alarm notification immediately (5 seconds delay)
  const testAlarmNotification = async (alarm) => {
    if (!Notifications) {
      return false;
    }
    try {
      const granted = await requestPermissions();
      if (!granted) return false;

      const content = {
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
        trigger: { seconds: 2 }, // Fire after 2 seconds
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  return (
    <AlarmContext.Provider
      value={{
        alarms,
        loading,
        permissionStatus,
        requestPermissions,
        addAlarm,
        updateAlarm,
        deleteAlarm,
        testAlarmNotification,
      }}
    >
      {children}
    </AlarmContext.Provider>
  );
}

export default function AlarmRoutePlaceholder() {
  return null;
}