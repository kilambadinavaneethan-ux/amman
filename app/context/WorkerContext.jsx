import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    query,
    Timestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { createContext, useEffect, useState, useMemo } from "react";
import { db, normalizeDateValue } from "../../src/config/firebase";
import { getDocsOfflineSafe } from "../../src/utils/offlineHelpers";

export const WorkerContext = createContext(null);

export function WorkerProvider({ children }) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [allAttendance, setAllAttendance] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [attendanceSchedulerConfig, setAttendanceSchedulerConfig] =
    useState(null);

  useEffect(() => {
    setLoading(true);
    const workersCollection = collection(db, "workers");

    const unsubscribe = onSnapshot(
      workersCollection,
      (snapshot) => {
        const dbWorkers = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
            joinDate: normalizeDateValue(data.joinDate, data.createdAt),
          };
        });

        // Sort by creation date descending
        dbWorkers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        setWorkers(dbWorkers);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // Real-time listener for all attendance records
  useEffect(() => {
    const attCol = collection(db, "workerAttendance");

    const unsubscribe = onSnapshot(
      attCol,
      (snapshot) => {
        const records = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }));
        records.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
        setAllAttendance(records);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const todays = records.filter((r) => {
          const dt = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
          return dt >= todayStart && dt <= todayEnd;
        });

        setTodayAttendance(todays);
        setLoadingAttendance(false);
      },
      (error) => {
        setLoadingAttendance(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const getTodayDateString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const parseTimeToMinutes = (time) => {
    if (!time || typeof time !== "string") return null;
    const normalized = time.trim().toUpperCase();

    // Check 12-hour AM/PM format: e.g. 9:00 AM, 09:00 AM, 2:30 PM
    const match12 = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (match12) {
      let hour = Number(match12[1]);
      const minute = Number(match12[2]);
      const period = match12[3];
      if (hour === 12) {
        hour = period === "AM" ? 0 : 12;
      } else if (period === "PM") {
        hour += 12;
      }
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return hour * 60 + minute;
      }
    }

    // Check 24-hour HH:MM format: e.g. 09:00, 14:30, 20:00
    const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      const hour = Number(match24[1]);
      const minute = Number(match24[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return hour * 60 + minute;
      }
    }

    return null;
  };

  const isSchedulerDueToday = (config) => {
    if (!config || !config.enabled) return false;
    const today = getTodayDateString();

    // Everyday schedule type
    if (!config.scheduleType || config.scheduleType === "everyday" || config.scheduleType === "daily") {
      return true;
    }

    if (config.scheduleType === "one-time") {
      return config.oneTimeDate === today;
    }

    if (config.scheduleType === "repeat") {
      const startDate = config.startDate || today;
      const endDate = config.endDate || "";
      if (today < startDate) return false;
      if (endDate && today > endDate) return false;
      const dayIndex = new Date().getDay();
      if (!Array.isArray(config.repeatDays) || config.repeatDays.length === 0) {
        return true; // Default all days if repeatDays array is empty
      }
      return config.repeatDays.includes(dayIndex);
    }

    return false;
  };

  const hasSchedulerAlreadyRunToday = (config) => {
    if (!config) return false;
    const today = getTodayDateString();
    return config.lastRunDate === today;
  };

  const shouldRunSchedulerNow = (config) => {
    if (!config || !config.enabled) return false;
    if (!isSchedulerDueToday(config)) return false;
    if (hasSchedulerAlreadyRunToday(config)) return false;
    if (loading || loadingAttendance) return false;

    const triggerMinutes = parseTimeToMinutes(config.triggerTime || "09:00 AM");
    if (triggerMinutes === null) return false;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Trigger if current time is AT OR ANY TIME AFTER the set trigger time on that day
    return nowMinutes >= triggerMinutes;
  };

  const buildSchedulerEntries = () => {
    if (!attendanceSchedulerConfig) return [];

    // Fall back to all active workers if workerIds array is empty or undefined
    const targetWorkerIds = (Array.isArray(attendanceSchedulerConfig.workerIds) && attendanceSchedulerConfig.workerIds.length > 0)
      ? attendanceSchedulerConfig.workerIds
      : workers.map((w) => w.id);

    return targetWorkerIds.reduce((acc, workerId) => {
      if (todayAttendance.find((a) => a.workerId === workerId)) {
        return acc;
      }

      const worker = workers.find((w) => w.id === workerId);
      if (!worker) return acc;

      const piecesProduced =
        attendanceSchedulerConfig.defaultStatus === "present"
          ? Number(attendanceSchedulerConfig.defaultProductionQty || 0)
          : attendanceSchedulerConfig.defaultStatus === "half-day"
            ? Number(
                (
                  (attendanceSchedulerConfig.defaultProductionQty || 0) / 2
                ).toFixed(2),
              )
            : 0;

      acc.push({
        workerId,
        status: attendanceSchedulerConfig.defaultStatus || "present",
        overtimeHours: 0,
        piecesProduced,
        notes: "Created automatically by Attendance Scheduler",
        workerType: worker.workerType || "regular",
        createdAutomatically: true,
      });
      return acc;
    }, []);
  };

  const recordSchedulerRun = async (config, createdEntries) => {
    try {
      const today = getTodayDateString();
      const skippedCount = Array.isArray(config.workerIds)
        ? config.workerIds.length - createdEntries
        : 0;

      await addDoc(collection(db, "automation_attendance_logs"), {
        userId: "default_user",
        date: today,
        time: config.triggerTime || "09:00 AM",
        workerCount: createdEntries,
        skippedCount,
        defaultStatus: config.defaultStatus || "present",
        statusText: config.saveAttendance ? "Completed" : "Draft Saved",
        isAutomatic: true,
        schedulerType: config.scheduleType,
        createdAt: new Date(),
      });

      const schedRef = doc(db, "automations", "attendance_scheduler");
      await updateDoc(schedRef, {
        lastRunDate: today,
        lastRunTime: config.triggerTime || "09:00 AM",
        updatedAt: new Date(),
      });
    } catch (error) {
    }
  };

  const executeAutomaticAttendance = async () => {
    if (!attendanceSchedulerConfig || !attendanceSchedulerConfig.enabled)
      return;

    const entries = buildSchedulerEntries();
    const createdEntries = entries.length;

    if (attendanceSchedulerConfig.saveAttendance && createdEntries > 0) {
      const result = await bulkLogAttendance(entries);
      if (!result) {
        return;
      }
    }

    await recordSchedulerRun(attendanceSchedulerConfig, createdEntries);
  };

  useEffect(() => {
    const schedRef = doc(db, "automations", "attendance_scheduler");
    const unsubscribe = onSnapshot(
      schedRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setAttendanceSchedulerConfig(snapshot.data());
        } else {
          setAttendanceSchedulerConfig(null);
        }
      },
      (error) => {
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const checkAndRun = async () => {
      if (!attendanceSchedulerConfig) return;
      if (!shouldRunSchedulerNow(attendanceSchedulerConfig)) return;
      await executeAutomaticAttendance();
    };

    checkAndRun();
    const interval = setInterval(checkAndRun, 60 * 1000);
    return () => clearInterval(interval);
  }, [
    attendanceSchedulerConfig,
    loading,
    loadingAttendance,
    todayAttendance,
    workers,
  ]);

  const updateProductStockAndSlots = async (activeProduct, stockChange) => {
    try {
      const currentStock = Number(
        activeProduct.openingStock !== undefined ? activeProduct.openingStock : (activeProduct.stock || 0)
      );
      const newStock = Math.max(0, currentStock + stockChange);
      let updatedSlots = Array.isArray(activeProduct.openingStockSlots)
        ? activeProduct.openingStockSlots.map((s) => ({ ...s }))
        : [];

      if (updatedSlots.length > 0) {
        // Worker production addition or rollback targets Last Slot (+ Mfg)
        const totalSlots = updatedSlots.length;
        const lastIdx = totalSlots - 1;
        const currentQty = Number(updatedSlots[lastIdx].quantity || 0);
        const newQty = currentQty + stockChange;

        if (newQty >= 0) {
          updatedSlots[lastIdx].quantity = newQty;
        } else {
          // If + Mfg slot goes negative during rollback, zero out + Mfg slot and drain deficit backwards
          updatedSlots[lastIdx].quantity = 0;
          let deficit = Math.abs(newQty);
          for (let i = totalSlots - 2; i >= 0 && deficit > 0; i--) {
            const q = Number(updatedSlots[i].quantity || 0);
            if (q <= deficit) {
              deficit -= q;
              updatedSlots[i].quantity = 0;
            } else {
              updatedSlots[i].quantity = q - deficit;
              deficit = 0;
            }
          }
        }

        // Re-enforce position roles
        const total = updatedSlots.length;
        updatedSlots = updatedSlots.map((s, idx) => ({
          ...s,
          slotName: s.slotName && !s.slotName.startsWith("Slot ") ? s.slotName : `Slot ${idx + 1}`,
          slotType: idx === 0 ? "-" : (idx === total - 1 && total > 1 ? "+" : "o"),
        }));
      }

      const productRef = doc(db, "items", activeProduct.id);
      await updateDoc(productRef, {
        openingStock: newStock,
        openingStockSlots: updatedSlots,
        updatedAt: new Date(),
      });

      return { currentStock, newStock };
    } catch (e) {
      console.error("Error updating product stock and slots:", e);
      return null;
    }
  };

  const addWorker = async (workerData) => {
    try {
      const docRef = await addDoc(collection(db, "workers"), {
        ...workerData,
        totalWages: 0,
        totalPaid: 0,
        totalPending: 0,
        attendanceDays: 0,
        createdAt: new Date(),
      });
      return docRef.id;
    } catch (error) {
      return null;
    }
  };

  const updateWorker = async (workerId, workerData) => {
    try {
      const workerRef = doc(db, "workers", workerId);
      await updateDoc(workerRef, {
        ...workerData,
        updatedAt: new Date(),
      });
      return true;
    } catch (error) {
      return false;
    }
  };

  const deleteWorker = async (workerId) => {
    try {
      const workerRef = doc(db, "workers", workerId);
      await deleteDoc(workerRef);
      return true;
    } catch (error) {
      return false;
    }
  };

  const logAttendance = async (workerId, attendanceData) => {
    try {
      const workerType = attendanceData.workerType || "regular";
      const createdAtDate = attendanceData.createdAt ? new Date(attendanceData.createdAt) : new Date();
      const targetDayStart = new Date(createdAtDate);
      targetDayStart.setHours(0, 0, 0, 0);
      const targetDayEnd = new Date(createdAtDate);
      targetDayEnd.setHours(23, 59, 59, 999);

      const existing = (allAttendance || []).find((a) => {
        if (a.workerId !== workerId) return false;
        const d = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        return d >= targetDayStart && d <= targetDayEnd;
      });
      if (existing) {
        return await editTodayAttendance(workerId, attendanceData, workerType, createdAtDate);
      }

      const docRef = await addDoc(collection(db, "workerAttendance"), {
        workerId,
        ...attendanceData,
        workerType,
        createdAt: createdAtDate,
      });

      const piecesProduced = Number(attendanceData.piecesProduced || 0);
      const finalPieces = attendanceData.status !== "absent" ? piecesProduced : 0;
      if (finalPieces > 0) {
        const activeProduct = await getActiveFinishedProduct();
        if (activeProduct) {
          const unitsPerBag = Number(
            activeProduct.unitsPerBag !== undefined ? activeProduct.unitsPerBag : 50,
          );
          const stockIncrement = finalPieces * unitsPerBag;
          const updatedStockResult = await updateProductStockAndSlots(activeProduct, stockIncrement);
          const currentStock = updatedStockResult ? updatedStockResult.currentStock : Number(activeProduct.openingStock || 0);
          const newStock = updatedStockResult ? updatedStockResult.newStock : currentStock + stockIncrement;

          await addDoc(collection(db, "item_stock_logs"), {
            itemId: activeProduct.id,
            itemName: activeProduct.itemName || "Product",
            itemType: activeProduct.itemType || "product",
            type: "production",
            quantity: stockIncrement,
            previousStock: currentStock,
            newStock,
            notes: `Production entry: ${finalPieces} bags by worker`,
            date: new Date(),
            createdAt: new Date(),
          });
        }
        await syncRawMaterialBagsForAttendance(docRef.id, finalPieces, 0);
      }

      if (workerType === "contract") {
        const contractWorkerRef = doc(db, "contractWorkers", workerId);
        const docSnap = await getDoc(contractWorkerRef);
        if (docSnap.exists()) {
          const cwData = docSnap.data();
          await updateDoc(contractWorkerRef, {
            attendanceDays:
              (cwData.attendanceDays || 0) +
              (attendanceData.status !== "absent" ? 1 : 0),
            updatedAt: new Date(),
          });
        }
      } else {
        // Update worker's attendance count and wage totals
        const worker = workers.find((w) => w.id === workerId);
        if (worker) {
          let dayWage = 0;
          if (worker.billingSystem === "Piece-Rate") {
            if (attendanceData.status !== "absent") {
              dayWage =
                Number(attendanceData.piecesProduced || 0) *
                Number(worker.pieceRate || 0);
            }
          } else {
            const dailyWage = Number(worker.dailyWage || 0);
            const overtimeHours = Number(attendanceData.overtimeHours || 0);
            const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);

            if (
              attendanceData.status === "present" ||
              attendanceData.status === "half-day"
            ) {
              dayWage =
                attendanceData.status === "half-day"
                  ? dailyWage / 2
                  : dailyWage;
              dayWage += overtimeHours * overtimeRate;
            }
          }

          const workerRef = doc(db, "workers", workerId);
          const updatePayload = {
            attendanceDays:
              (worker.attendanceDays || 0) +
              (attendanceData.status !== "absent" ? 1 : 0),
            totalWages: (worker.totalWages || 0) + dayWage,
            totalPending: (worker.totalPending || 0) + dayWage,
            updatedAt: new Date(),
          };
          if (worker.billingSystem === "Piece-Rate" && attendanceData.piecesProduced !== undefined && attendanceData.status !== "absent") {
            updatePayload.lastPiecesProduced = Number(attendanceData.piecesProduced);
          }
          await updateDoc(workerRef, updatePayload);
        }
      }

      return docRef.id;
    } catch (error) {
      return null;
    }
  };

  const getActiveFinishedProduct = async () => {
    try {
      const q = query(
        collection(db, "items"),
        where("userId", "==", "default_user"),
      );
      const snap = await getDocsOfflineSafe(q);
      const activeProductDoc = snap.docs.find((d) => {
        const data = d.data();
        return (
          data.itemType !== "raw_material" &&
          (data.status || "Active") === "Active"
        );
      });
      if (activeProductDoc) {
        return { id: activeProductDoc.id, ...activeProductDoc.data() };
      }
    } catch (e) {
    }
    return null;
  };

  // Check if there is enough raw material stock before deducting
  const checkRawMaterialStock = async (pieces) => {
    try {
      const settingsRef = doc(db, "automations", "default_user_settings");
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists() || !settingsSnap.data().autoDeductBagsEnabled) {
        return { ok: true }; // auto-deduct not enabled, skip check
      }
      const itemsSnap = await getDocsOfflineSafe(
        query(
          collection(db, "items"),
          where("itemType", "==", "raw_material"),
          where("rateType", "==", "bag"),
        ),
      );
      for (const rmDoc of itemsSnap.docs) {
        const rmData = rmDoc.data();
        const currentStock = Number(
          rmData.openingStock !== undefined ? rmData.openingStock : rmData.stock || 0,
        );
        const lowStockThreshold = Number(rmData.lowStockThreshold || 0);
        if (currentStock < pieces) {
          return {
            ok: false,
            error: "insufficient_stock",
            materialName: rmData.itemName || "Raw Material",
            required: pieces,
            available: currentStock,
          };
        }
        // Also warn if after deduction stock falls below low-stock threshold
        if (lowStockThreshold > 0 && (currentStock - pieces) < lowStockThreshold) {
          return {
            ok: false,
            error: "low_stock",
            materialName: rmData.itemName || "Raw Material",
            required: pieces,
            available: currentStock,
            threshold: lowStockThreshold,
          };
        }
      }
      return { ok: true };
    } catch (e) {
      return { ok: true }; // fail open so attendance is not blocked by a read error
    }
  };

  const syncRawMaterialBagsForAttendance = async (
    attendanceId,
    newPieces,
    oldPieces = 0,
  ) => {
    try {
      const settingsRef = doc(db, "automations", "default_user_settings");
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists() || !settingsSnap.data().autoDeductBagsEnabled) {
        return;
      }

      const diffPieces = newPieces - oldPieces;

      const itemsSnap = await getDocsOfflineSafe(
        query(
          collection(db, "items"),
          where("itemType", "==", "raw_material"),
          where("rateType", "==", "bag"),
        ),
      );

      for (const rmDoc of itemsSnap.docs) {
        const rmData = rmDoc.data();
        const currentRMStock = Number(
          rmData.openingStock !== undefined
            ? rmData.openingStock
            : rmData.stock || 0,
        );

        if (diffPieces !== 0) {
          const stockAdjustment = -diffPieces;
          const newRMStock = Math.max(0, currentRMStock + stockAdjustment);

          const rmRef = doc(db, "items", rmDoc.id);
          await updateDoc(rmRef, {
            openingStock: newRMStock,
            updatedAt: new Date(),
          });

          await addDoc(collection(db, "item_stock_logs"), {
            itemId: rmDoc.id,
            itemName: rmData.itemName || "Unknown Material",
            itemType: "raw_material",
            type: diffPieces > 0 ? "consumption" : "adjustment",
            quantity: Math.abs(diffPieces),
            previousStock: currentRMStock,
            newStock: newRMStock,
            notes:
              diffPieces > 0
                ? `Auto-deduction for production of ${diffPieces} worker bags`
                : `Auto-deduction rollback (worker attendance edited by ${Math.abs(diffPieces)} bags)`,
            date: new Date(),
            createdAt: new Date(),
          });
        }

        if (attendanceId) {
          const logsQuery = query(
            collection(db, "raw_material_logs"),
            where("attendanceId", "==", attendanceId),
            where("materialId", "==", rmDoc.id),
          );
          const existingLogsSnap = await getDocsOfflineSafe(logsQuery);

          if (!existingLogsSnap.empty) {
            const firstLogDoc = existingLogsSnap.docs[0];
            for (let i = 1; i < existingLogsSnap.docs.length; i++) {
              await deleteDoc(doc(db, "raw_material_logs", existingLogsSnap.docs[i].id));
            }

            if (newPieces > 0) {
              await updateDoc(doc(db, "raw_material_logs", firstLogDoc.id), {
                quantity: newPieces,
                type: "consumption",
                notes: `Auto-deduction for production of ${newPieces} worker bags`,
                date: new Date(),
                updatedAt: new Date(),
              });
            } else {
              await deleteDoc(doc(db, "raw_material_logs", firstLogDoc.id));
            }
          } else if (newPieces > 0) {
            await addDoc(collection(db, "raw_material_logs"), {
              userId: "default_user",
              materialId: rmDoc.id,
              materialName: rmData.itemName || "Unknown Material",
              type: "consumption",
              quantity: newPieces,
              notes: `Auto-deduction for production of ${newPieces} worker bags`,
              attendanceId,
              date: new Date(),
              createdAt: new Date(),
            });
          }
        }
      }
    } catch (e) {
      console.error("Error in syncRawMaterialBagsForAttendance:", e);
    }
  };

  const adjustRawMaterialBags = async (pieces, isUndo = false) => {
    return await syncRawMaterialBagsForAttendance(null, isUndo ? 0 : pieces, isUndo ? pieces : 0);
  };

  // Bulk log attendance for multiple workers at once
  const bulkLogAttendance = async (entries, targetDate = new Date()) => {
    try {
      // Pre-check raw material stock for all piece-rate entries combined
      const totalPieces = entries.reduce((sum, e) => {
        if (e.status !== "absent" && e.piecesProduced > 0) {
          return sum + Number(e.piecesProduced);
        }
        return sum;
      }, 0);

      if (totalPieces > 0) {
        const stockCheck = await checkRawMaterialStock(totalPieces);
        if (!stockCheck.ok) {
          const isInsufficient = stockCheck.error === "insufficient_stock";
          const msg = isInsufficient
            ? `⚠️ Low Stock Alert\n\n"${stockCheck.materialName}" has only ${stockCheck.available} bags available, but ${stockCheck.required} bags are needed for today's production.\n\nAttendance has NOT been saved. Please replenish stock first.`
            : `⚠️ Low Stock Warning\n\n"${stockCheck.materialName}" will drop below the low-stock threshold (${stockCheck.threshold} bags) after this deduction.\n\nCurrent: ${stockCheck.available} bags | Needed: ${stockCheck.required} bags\n\nAttendance has NOT been saved.`;
          return { error: stockCheck.error, message: msg, stockInfo: stockCheck };
        }
      }

      const targetDayStart = new Date(targetDate);
      targetDayStart.setHours(0, 0, 0, 0);
      const targetDayEnd = new Date(targetDate);
      targetDayEnd.setHours(23, 59, 59, 999);

      const results = [];
      const processedWorkerIds = new Set();
      for (const entry of entries) {
        const {
          workerId,
          status,
          overtimeHours = 0,
          notes = "",
          workerType = "regular",
        } = entry;

        if (!workerId || processedWorkerIds.has(workerId)) continue;

        // Skip workers that already have attendance on target date
        const alreadyLogged = (allAttendance || []).find((a) => {
          if (a.workerId !== workerId) return false;
          const d = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
          return d >= targetDayStart && d <= targetDayEnd;
        });
        if (alreadyLogged) continue;

        processedWorkerIds.add(workerId);

        const piecesProduced =
          entry.piecesProduced !== undefined ? Number(entry.piecesProduced) : 0;

        const now = new Date();
        const saveDate = new Date(targetDate);
        if (
          saveDate.getFullYear() === now.getFullYear() &&
          saveDate.getMonth() === now.getMonth() &&
          saveDate.getDate() === now.getDate()
        ) {
          saveDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        } else if (saveDate.getHours() === 0 && saveDate.getMinutes() === 0) {
          saveDate.setHours(12, 0, 0, 0);
        }

        const docRef = await addDoc(collection(db, "workerAttendance"), {
          workerId,
          status,
          overtimeHours: Number(overtimeHours),
          piecesProduced,
          notes,
          workerType,
          createdAt: saveDate,
          createdAutomatically: entry.createdAutomatically || false,
        });

        const finalPieces = status !== "absent" ? piecesProduced : 0;
        if (finalPieces > 0) {
          const activeProduct = await getActiveFinishedProduct();
          if (activeProduct) {
            const unitsPerBag = Number(
              activeProduct.unitsPerBag !== undefined
                ? activeProduct.unitsPerBag
                : 50,
            );
            const stockIncrement = finalPieces * unitsPerBag;
            const updatedStockResult = await updateProductStockAndSlots(activeProduct, stockIncrement);
            const currentStock = updatedStockResult ? updatedStockResult.currentStock : Number(activeProduct.openingStock || 0);
            const newStock = updatedStockResult ? updatedStockResult.newStock : currentStock + stockIncrement;

            await addDoc(collection(db, "item_stock_logs"), {
              itemId: activeProduct.id,
              itemName: activeProduct.itemName || "Product",
              itemType: activeProduct.itemType || "product",
              type: "production",
              quantity: stockIncrement,
              previousStock: currentStock,
              newStock,
              notes: `Production entry: ${finalPieces} bags by worker`,
              date: new Date(),
              createdAt: new Date(),
            });
          }
          await syncRawMaterialBagsForAttendance(docRef.id, finalPieces, 0);
        }

        if (workerType === "contract") {
          const contractWorkerRef = doc(db, "contractWorkers", workerId);
          const docSnap = await getDoc(contractWorkerRef);
          if (docSnap.exists()) {
            const cwData = docSnap.data();
            await updateDoc(contractWorkerRef, {
              attendanceDays:
                (cwData.attendanceDays || 0) + (status !== "absent" ? 1 : 0),
              updatedAt: new Date(),
            });
          }
        } else {
          // Update worker totals
          const worker = workers.find((w) => w.id === workerId);
          if (worker) {
            let dayWage = 0;
            if (worker.billingSystem === "Piece-Rate") {
              if (status !== "absent") {
                dayWage = piecesProduced * Number(worker.pieceRate || 0);
              }
            } else {
              const dailyWage = Number(worker.dailyWage || 0);
              const otHours = Number(overtimeHours || 0);
              const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);

              if (status === "present" || status === "half-day") {
                dayWage = status === "half-day" ? dailyWage / 2 : dailyWage;
                dayWage += otHours * overtimeRate;
              }
            }

            const workerRef = doc(db, "workers", workerId);
            const updatePayload = {
              attendanceDays:
                (worker.attendanceDays || 0) + (status !== "absent" ? 1 : 0),
              totalWages: (worker.totalWages || 0) + dayWage,
              totalPending: (worker.totalPending || 0) + dayWage,
              updatedAt: new Date(),
            };
            if (worker.billingSystem === "Piece-Rate" && entry.piecesProduced !== undefined && status !== "absent") {
              updatePayload.lastPiecesProduced = piecesProduced;
            }
            await updateDoc(workerRef, updatePayload);
          }
        }

        results.push(docRef.id);
      }
      return results;
    } catch (error) {
      return null;
    }
  };

  // Reset today's attendance — delete records and reverse wage calculations
  const resetTodayAttendance = async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const attQuery = query(
        collection(db, "workerAttendance"),
        where("createdAt", ">=", Timestamp.fromDate(todayStart)),
        where("createdAt", "<=", Timestamp.fromDate(todayEnd)),
      );

      const snapshot = await getDocsOfflineSafe(attQuery);

      if (snapshot.empty) return true;

      // Group records by worker to calculate rollback amounts
      const workerRollbacks = {};
      const contractWorkerRollbacks = {};
      let totalPiecesToday = 0;

      for (const attDoc of snapshot.docs) {
        const data = attDoc.data();
        totalPiecesToday += Number(data.piecesProduced || 0);
        const wId = data.workerId;
        const workerType = data.workerType || "regular";

        if (workerType === "contract") {
          if (!contractWorkerRollbacks[wId]) {
            contractWorkerRollbacks[wId] = { dayRollback: 0 };
          }
          if (data.status !== "absent") {
            contractWorkerRollbacks[wId].dayRollback += 1;
          }
        } else {
          const worker = workers.find((w) => w.id === wId);
          if (worker) {
            if (!workerRollbacks[wId]) {
              workerRollbacks[wId] = { wageRollback: 0, dayRollback: 0 };
            }

            let dayWage = 0;
            if (worker.billingSystem === "Piece-Rate") {
              if (data.status !== "absent") {
                dayWage =
                  Number(data.piecesProduced || 0) *
                  Number(worker.pieceRate || 0);
              }
            } else {
              const dailyWage = Number(worker.dailyWage || 0);
              const otHours = Number(data.overtimeHours || 0);
              const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);

              if (data.status === "present" || data.status === "half-day") {
                dayWage =
                  data.status === "half-day" ? dailyWage / 2 : dailyWage;
                dayWage += otHours * overtimeRate;
              }
            }

            workerRollbacks[wId].wageRollback += dayWage;
            if (data.status !== "absent") {
              workerRollbacks[wId].dayRollback += 1;
            }
          }
        }

        // Delete the attendance doc
        await deleteDoc(doc(db, "workerAttendance", attDoc.id));
      }

      if (totalPiecesToday > 0) {
        const activeProduct = await getActiveFinishedProduct();
        if (activeProduct) {
          const unitsPerBag = Number(
            activeProduct.unitsPerBag !== undefined
              ? activeProduct.unitsPerBag
              : 50,
          );
          const stockDecrement = totalPiecesToday * unitsPerBag;
          const updatedStockResult = await updateProductStockAndSlots(activeProduct, -stockDecrement);
          const currentStock = updatedStockResult ? updatedStockResult.currentStock : Number(activeProduct.openingStock || 0);
          const newStock = updatedStockResult ? updatedStockResult.newStock : Math.max(0, currentStock - stockDecrement);

          await addDoc(collection(db, "item_stock_logs"), {
            itemId: activeProduct.id,
            itemName: activeProduct.itemName || "Product",
            itemType: activeProduct.itemType || "product",
            type: "production_rollback",
            quantity: -stockDecrement,
            previousStock: currentStock,
            newStock,
            notes: `Production rollback: cleared today's attendance`,
            date: new Date(),
            createdAt: new Date(),
          });
        }
        for (const attDoc of snapshot.docs) {
          const p = attDoc.data().status !== "absent" ? Number(attDoc.data().piecesProduced || 0) : 0;
          if (p > 0) {
            await syncRawMaterialBagsForAttendance(attDoc.id, 0, p);
          }
        }
      }

      // Rollback worker totals
      for (const [wId, rollback] of Object.entries(workerRollbacks)) {
        const worker = workers.find((w) => w.id === wId);
        if (worker) {
          const workerRef = doc(db, "workers", wId);
          await updateDoc(workerRef, {
            attendanceDays: Math.max(
              0,
              (worker.attendanceDays || 0) - rollback.dayRollback,
            ),
            totalWages: Math.max(
              0,
              (worker.totalWages || 0) - rollback.wageRollback,
            ),
            totalPending: (worker.totalPending || 0) - rollback.wageRollback,
            updatedAt: new Date(),
          });
        }
      }

      // Rollback contract worker totals
      for (const [cwId, rollback] of Object.entries(contractWorkerRollbacks)) {
        try {
          const contractWorkerRef = doc(db, "contractWorkers", cwId);
          const docSnap = await getDoc(contractWorkerRef);
          if (docSnap.exists()) {
            const cwData = docSnap.data();
            await updateDoc(contractWorkerRef, {
              attendanceDays: Math.max(
                0,
                (cwData.attendanceDays || 0) - rollback.dayRollback,
              ),
              updatedAt: new Date(),
            });
          }
        } catch (e) {
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  };

  const logPayment = async (workerId, paymentData) => {
    try {
      const docRef = await addDoc(collection(db, "workerPayments"), {
        workerId,
        ...paymentData,
        createdAt: new Date(),
      });

      // Update worker payment totals
      const worker = workers.find((w) => w.id === workerId);
      if (worker) {
        const paidAmount = Number(paymentData.amount || 0);
        const workerRef = doc(db, "workers", workerId);
        await updateDoc(workerRef, {
          totalPaid: (worker.totalPaid || 0) + paidAmount,
          totalPending: (worker.totalPending || 0) - paidAmount,
          updatedAt: new Date(),
        });
      }

      return docRef.id;
    } catch (error) {
      return null;
    }
  };

  const editTodayAttendance = async (
    workerId,
    newAttendanceData,
    workerType = "regular",
    targetDate = new Date(),
  ) => {
    try {
      const targetDayStart = new Date(targetDate);
      targetDayStart.setHours(0, 0, 0, 0);
      const targetDayEnd = new Date(targetDate);
      targetDayEnd.setHours(23, 59, 59, 999);

      // Query by workerId only to avoid requiring a composite index,
      // then filter by target date range locally.
      const q = query(
        collection(db, "workerAttendance"),
        where("workerId", "==", workerId),
      );
      const snapAll = await getDocsOfflineSafe(q);
      const targetDocs = snapAll.docs.filter((d) => {
        const cd = d.data().createdAt;
        const dt = normalizeDateValue(cd, Date.now());
        return dt >= targetDayStart && dt <= targetDayEnd;
      });

      if (targetDocs.length === 0) {
        const now = new Date();
        const saveDate = new Date(targetDate);
        if (
          saveDate.getFullYear() === now.getFullYear() &&
          saveDate.getMonth() === now.getMonth() &&
          saveDate.getDate() === now.getDate()
        ) {
          saveDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        } else if (saveDate.getHours() === 0 && saveDate.getMinutes() === 0) {
          saveDate.setHours(12, 0, 0, 0);
        }

        return await logAttendance(workerId, {
          ...newAttendanceData,
          workerType,
          createdAt: saveDate,
        });
      }

      const existingDoc = targetDocs[0];
      // Clean up any extra duplicate attendance docs for this worker created previously
      if (targetDocs.length > 1) {
        for (let i = 1; i < targetDocs.length; i++) {
          try {
            await deleteDoc(doc(db, "workerAttendance", targetDocs[i].id));
          } catch (e) {
            console.error("Error deleting duplicate attendance doc:", e);
          }
        }
      }
      const prevData = existingDoc.data();
      const existingDocRef = doc(db, "workerAttendance", existingDoc.id);

      if (workerType === "contract") {
        const contractWorkerRef = doc(db, "contractWorkers", workerId);
        const docSnap = await getDoc(contractWorkerRef);
        if (docSnap.exists()) {
          const cwData = docSnap.data();
          const prevDays = prevData.status !== "absent" ? 1 : 0;
          const newDays = newAttendanceData.status !== "absent" ? 1 : 0;
          await updateDoc(contractWorkerRef, {
            attendanceDays: Math.max(
              0,
              (cwData.attendanceDays || 0) - prevDays + newDays,
            ),
            updatedAt: new Date(),
          });
        }
      } else {
        const worker = workers.find((w) => w.id === workerId);
        if (worker) {
          let prevWage = 0;
          if (worker.billingSystem === "Piece-Rate") {
            if (prevData.status !== "absent") {
              prevWage =
                Number(prevData.piecesProduced || 0) *
                Number(worker.pieceRate || 0);
            }
          } else {
            const dailyWage = Number(worker.dailyWage || 0);
            const overtimeHours = Number(prevData.overtimeHours || 0);
            const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);

            if (
              prevData.status === "present" ||
              prevData.status === "half-day"
            ) {
              prevWage =
                prevData.status === "half-day" ? dailyWage / 2 : dailyWage;
              prevWage += overtimeHours * overtimeRate;
            }
          }

          let newWage = 0;
          const newPiecesProduced =
            newAttendanceData.piecesProduced !== undefined
              ? Number(newAttendanceData.piecesProduced)
              : 0;

          if (worker.billingSystem === "Piece-Rate") {
            if (newAttendanceData.status !== "absent") {
              newWage =
                newPiecesProduced * Number(worker.pieceRate || 0);
            }
          } else {
            const dailyWage = Number(worker.dailyWage || 0);
            const overtimeHours = Number(newAttendanceData.overtimeHours || 0);
            const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);

            if (
              newAttendanceData.status === "present" ||
              newAttendanceData.status === "half-day"
            ) {
              newWage =
                newAttendanceData.status === "half-day"
                  ? dailyWage / 2
                  : dailyWage;
              newWage += overtimeHours * overtimeRate;
            }
          }

          const prevDays = prevData.status !== "absent" ? 1 : 0;
          const newDays = newAttendanceData.status !== "absent" ? 1 : 0;

          const workerRef = doc(db, "workers", workerId);
          const updatePayload = {
            attendanceDays: Math.max(
              0,
              (worker.attendanceDays || 0) - prevDays + newDays,
            ),
            totalWages: Math.max(
              0,
              (worker.totalWages || 0) - prevWage + newWage,
            ),
            totalPending: (worker.totalPending || 0) - prevWage + newWage,
            updatedAt: new Date(),
          };
          if (worker.billingSystem === "Piece-Rate" && newAttendanceData.piecesProduced !== undefined && newAttendanceData.status !== "absent") {
            updatePayload.lastPiecesProduced = newPiecesProduced;
          }
          await updateDoc(workerRef, updatePayload);
        }
      }

      const piecesProduced =
        newAttendanceData.piecesProduced !== undefined
          ? Number(newAttendanceData.piecesProduced)
          : 0;

      const finalPieces =
        newAttendanceData.status !== "absent" ? piecesProduced : 0;
      const prevPieces =
        prevData.status !== "absent" ? Number(prevData.piecesProduced || 0) : 0;

      const diffPieces = finalPieces - prevPieces;

      if (diffPieces !== 0) {
        const activeProduct = await getActiveFinishedProduct();
        if (activeProduct) {
          const unitsPerBag = Number(
            activeProduct.unitsPerBag !== undefined
              ? activeProduct.unitsPerBag
              : 50,
          );
          const stockIncrement = diffPieces * unitsPerBag;
          const updatedStockResult = await updateProductStockAndSlots(activeProduct, stockIncrement);
          const currentStock = updatedStockResult ? updatedStockResult.currentStock : Number(activeProduct.openingStock || 0);
          const newStock = updatedStockResult ? updatedStockResult.newStock : currentStock + stockIncrement;

          await addDoc(collection(db, "item_stock_logs"), {
            itemId: activeProduct.id,
            itemName: activeProduct.itemName || "Product",
            itemType: activeProduct.itemType || "product",
            type: "production_adjustment",
            quantity: stockIncrement,
            previousStock: currentStock,
            newStock,
            notes: `Attendance log edit for worker: changed production by ${diffPieces} bags`,
            date: new Date(),
            createdAt: new Date(),
          });
        }
        await syncRawMaterialBagsForAttendance(existingDoc.id, finalPieces, prevPieces);
      }

      await updateDoc(existingDocRef, {
        status: newAttendanceData.status,
        overtimeHours: Number(newAttendanceData.overtimeHours || 0),
        piecesProduced,
        notes: newAttendanceData.notes !== undefined ? newAttendanceData.notes : (prevData.notes || ""),
        updatedAt: new Date(),
      });

      return existingDoc.id;
    } catch (error) {
      return null;
    }
  };

  const deleteAttendance = async (attendanceId, attendanceData) => {
    try {
      const attPayload = attendanceData || (await getDoc(doc(db, "workerAttendance", attendanceId))).data();
      if (!attPayload) return false;

      const { workerId, status, piecesProduced, overtimeHours, workerType = "regular" } = attPayload;

      // 1. Revert worker totals
      if (workerType === "contract") {
        const contractWorkerRef = doc(db, "contractWorkers", workerId);
        const docSnap = await getDoc(contractWorkerRef);
        if (docSnap.exists()) {
          const cwData = status !== "absent" ? 1 : 0;
          await updateDoc(contractWorkerRef, {
            attendanceDays: Math.max(0, (docSnap.data().attendanceDays || 0) - cwData),
            updatedAt: new Date(),
          });
        }
      } else {
        const worker = workers.find((w) => w.id === workerId);
        if (worker) {
          let dayWage = 0;
          if (worker.billingSystem === "Piece-Rate") {
            if (status !== "absent") {
              dayWage = Number(piecesProduced || 0) * Number(worker.pieceRate || 0);
            }
          } else {
            const dailyWage = Number(worker.dailyWage || 0);
            const otHours = Number(overtimeHours || 0);
            const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);

            if (status === "present" || status === "half-day") {
              dayWage = status === "half-day" ? dailyWage / 2 : dailyWage;
              dayWage += otHours * overtimeRate;
            }
          }

          const prevDays = status !== "absent" ? 1 : 0;
          const workerRef = doc(db, "workers", workerId);
          await updateDoc(workerRef, {
            attendanceDays: Math.max(0, (worker.attendanceDays || 0) - prevDays),
            totalWages: Math.max(0, (worker.totalWages || 0) - dayWage),
            totalPending: (worker.totalPending || 0) - dayWage,
            updatedAt: new Date(),
          });
        }
      }

      // 2. Revert inventory stock if piece-rate
      const pieces = Number(piecesProduced || 0);
      if (pieces > 0) {
        const activeProduct = await getActiveFinishedProduct();
        if (activeProduct) {
          const unitsPerBag = Number(activeProduct.unitsPerBag !== undefined ? activeProduct.unitsPerBag : 50);
          const stockDecrement = pieces * unitsPerBag;
          const updatedStockResult = await updateProductStockAndSlots(activeProduct, -stockDecrement);
          const currentStock = updatedStockResult ? updatedStockResult.currentStock : Number(activeProduct.openingStock || 0);
          const newStock = updatedStockResult ? updatedStockResult.newStock : Math.max(0, currentStock - stockDecrement);

          await addDoc(collection(db, "item_stock_logs"), {
            itemId: activeProduct.id,
            itemName: activeProduct.itemName || "Product",
            itemType: activeProduct.itemType || "product",
            type: "production_rollback",
            quantity: -stockDecrement,
            previousStock: currentStock,
            newStock,
            notes: `Production rollback (attendance deleted)`,
            date: new Date(),
            createdAt: new Date(),
          });
        }
        await syncRawMaterialBagsForAttendance(attendanceId, 0, pieces);
      }

      // 3. Delete attendance doc
      await deleteDoc(doc(db, "workerAttendance", attendanceId));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const editAttendance = async (attendanceId, newAttendanceData, oldAttendanceData) => {
    try {
      const { status: newStatus, piecesProduced: newPiecesRaw, overtimeHours: newOTHours, notes: newNotes = "", date: newDateStr } = newAttendanceData;
      const { workerId, status: oldStatus, piecesProduced: oldPiecesRaw, overtimeHours: oldOTHours, workerType = "regular" } = oldAttendanceData;

      const newPieces = Number(newPiecesRaw || 0);
      const oldPieces = Number(oldPiecesRaw || 0);

      // 1. Revert and apply worker totals
      if (workerType === "contract") {
        const contractWorkerRef = doc(db, "contractWorkers", workerId);
        const docSnap = await getDoc(contractWorkerRef);
        if (docSnap.exists()) {
          const cwData = docSnap.data();
          const prevDays = oldStatus !== "absent" ? 1 : 0;
          const newDays = newStatus !== "absent" ? 1 : 0;
          await updateDoc(contractWorkerRef, {
            attendanceDays: Math.max(0, (cwData.attendanceDays || 0) - prevDays + newDays),
            updatedAt: new Date(),
          });
        }
      } else {
        const worker = workers.find((w) => w.id === workerId);
        if (worker) {
          let oldWage = 0;
          if (worker.billingSystem === "Piece-Rate") {
            if (oldStatus !== "absent") {
              oldWage = oldPieces * Number(worker.pieceRate || 0);
            }
          } else {
            const dailyWage = Number(worker.dailyWage || 0);
            const otHours = Number(oldOTHours || 0);
            const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);

            if (oldStatus === "present" || oldStatus === "half-day") {
              oldWage = oldStatus === "half-day" ? dailyWage / 2 : dailyWage;
              oldWage += otHours * overtimeRate;
            }
          }

          let newWage = 0;
          if (worker.billingSystem === "Piece-Rate") {
            if (newStatus !== "absent") {
              newWage = newPieces * Number(worker.pieceRate || 0);
            }
          } else {
            const dailyWage = Number(worker.dailyWage || 0);
            const otHours = Number(newOTHours || 0);
            const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);

            if (newStatus === "present" || newStatus === "half-day") {
              newWage = newStatus === "half-day" ? dailyWage / 2 : dailyWage;
              newWage += otHours * overtimeRate;
            }
          }

          const prevDays = oldStatus !== "absent" ? 1 : 0;
          const newDays = newStatus !== "absent" ? 1 : 0;

          const workerRef = doc(db, "workers", workerId);
          await updateDoc(workerRef, {
            attendanceDays: Math.max(0, (worker.attendanceDays || 0) - prevDays + newDays),
            totalWages: Math.max(0, (worker.totalWages || 0) - oldWage + newWage),
            totalPending: (worker.totalPending || 0) - oldWage + newWage,
            updatedAt: new Date(),
          });
        }
      }

      // 2. Adjust inventory stock
      const diffPieces = newPieces - oldPieces;
      if (diffPieces !== 0) {
        const activeProduct = await getActiveFinishedProduct();
        if (activeProduct) {
          const unitsPerBag = Number(activeProduct.unitsPerBag !== undefined ? activeProduct.unitsPerBag : 50);
          const stockChange = diffPieces * unitsPerBag;
          const currentStock = Number(activeProduct.openingStock || 0);
          const newStock = Math.max(0, currentStock + stockChange);
          const productRef = doc(db, "items", activeProduct.id);
          await updateDoc(productRef, {
            openingStock: newStock,
            updatedAt: new Date(),
          });

          await addDoc(collection(db, "item_stock_logs"), {
            itemId: activeProduct.id,
            itemName: activeProduct.itemName || "Product",
            itemType: activeProduct.itemType || "product",
            type: "production_adjustment",
            quantity: stockChange,
            previousStock: currentStock,
            newStock,
            notes: `Attendance log edit for worker: changed production by ${diffPieces} bags`,
            date: new Date(),
            createdAt: new Date(),
          });
        }
        await syncRawMaterialBagsForAttendance(attendanceId, newPieces, oldPieces);
      }

      // 3. Update attendance doc
      const updateData = {
        status: newStatus,
        overtimeHours: Number(newOTHours || 0),
        piecesProduced: newPieces,
        notes: newNotes,
        updatedAt: new Date(),
      };
      if (newDateStr) {
        updateData.date = newDateStr;
        updateData.createdAt = new Date(newDateStr);
      }
      await updateDoc(doc(db, "workerAttendance", attendanceId), updateData);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const deleteWorkerPayment = async (paymentId, paymentData) => {
    try {
      const payPayload = paymentData || (await getDoc(doc(db, "workerPayments", paymentId))).data();
      if (!payPayload) return false;

      const { workerId, amount } = payPayload;

      // Revert worker payment totals
      const worker = workers.find((w) => w.id === workerId);
      if (worker) {
        const paidAmount = Number(amount || 0);
        const workerRef = doc(db, "workers", workerId);
        await updateDoc(workerRef, {
          totalPaid: Math.max(0, (worker.totalPaid || 0) - paidAmount),
          totalPending: (worker.totalPending || 0) + paidAmount,
          updatedAt: new Date(),
        });
      }

      // Delete payment doc
      await deleteDoc(doc(db, "workerPayments", paymentId));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const editWorkerPayment = async (paymentId, newPaymentData, oldPaymentData) => {
    try {
      const { amount: newAmount, method, notes, createdAt } = newPaymentData;
      const { workerId, amount: oldAmount } = oldPaymentData;

      const diff = Number(newAmount) - Number(oldAmount);

      // Update worker payment totals
      const worker = workers.find((w) => w.id === workerId);
      if (worker) {
        const workerRef = doc(db, "workers", workerId);
        await updateDoc(workerRef, {
          totalPaid: Math.max(0, (worker.totalPaid || 0) + diff),
          totalPending: (worker.totalPending || 0) - diff,
          updatedAt: new Date(),
        });
      }

      // Update payment doc
      const updateData = {
        amount: Number(newAmount),
        method,
        notes: notes || "",
        updatedAt: new Date(),
      };
      if (createdAt) {
        updateData.createdAt = new Date(createdAt);
      }
      await updateDoc(doc(db, "workerPayments", paymentId), updateData);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const logBonus = async (workerId, bonusData) => {
    try {
      const docRef = await addDoc(collection(db, "workerBonuses"), {
        workerId,
        amount: Number(bonusData.amount || 0),
        reason: bonusData.reason || "Performance Bonus",
        notes: bonusData.notes || "",
        createdAt: bonusData.createdAt ? new Date(bonusData.createdAt) : new Date(),
      });
      return docRef.id;
    } catch (error) {
      console.error("Error logging bonus:", error);
      return null;
    }
  };

  const deleteWorkerBonus = async (bonusId, bonusData) => {
    try {
      await deleteDoc(doc(db, "workerBonuses", bonusId));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const editWorkerBonus = async (bonusId, newBonusData, oldBonusData) => {
    try {
      const { amount: newAmount, reason, notes, createdAt } = newBonusData;
      const updateData = {
        amount: Number(newAmount),
        reason: reason || "Performance Bonus",
        notes: notes || "",
        updatedAt: new Date(),
      };
      if (createdAt) {
        updateData.createdAt = new Date(createdAt);
      }
      await updateDoc(doc(db, "workerBonuses", bonusId), updateData);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const contextValue = useMemo(
    () => ({
      workers,
      loading,
      todayAttendance,
      allAttendance,
      loadingAttendance,
      addWorker,
      updateWorker,
      deleteWorker,
      logAttendance,
      bulkLogAttendance,
      resetTodayAttendance,
      logPayment,
      logBonus,
      editTodayAttendance,
      deleteAttendance,
      editAttendance,
      deleteWorkerPayment,
      editWorkerPayment,
      deleteWorkerBonus,
      editWorkerBonus,
      adjustRawMaterialBags,
      syncRawMaterialBagsForAttendance,
    }),
    [workers, loading, todayAttendance, allAttendance, loadingAttendance],
  );

  return (
    <WorkerContext.Provider value={contextValue}>
      {children}
    </WorkerContext.Provider>
  );
}

export default function WorkerRoutePlaceholder() {
  return null;
}