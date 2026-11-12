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
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDeferredInit } from "../../hooks/useDeferredInit";
import { db, normalizeDateValue } from "../../src/config/firebase";
import { syncWastageStockOnConsumption } from "../../src/services/wastageService";
import type { Worker, WorkerAttendance } from "../../src/types/models";
import { getDocsOfflineSafe } from "../../src/utils/offlineHelpers";
import { roundCurrency } from "../../utils/currency";

export type RawMaterialCheckResult =
  | { ok: true }
  | {
      ok: false;
      error: "insufficient_stock" | "low_stock";
      materialName: string;
      required: number;
      available: number;
      threshold?: number;
    };

export type BulkAttendanceResult =
  | string[]
  | { error: string; message: string; stockInfo: RawMaterialCheckResult }
  | null;

export interface WorkerContextType {
  workers: Worker[];
  loading: boolean;
  todayAttendance: WorkerAttendance[];
  allAttendance: WorkerAttendance[];
  loadingAttendance: boolean;
  addWorker: (workerData: Partial<Worker> & Record<string, any>) => Promise<string | null>;
  updateWorker: (
    workerId: string,
    workerData: Partial<Worker> & Record<string, any>,
  ) => Promise<boolean>;
  deleteWorker: (workerId: string) => Promise<boolean>;
  logAttendance: (
    workerId: string,
    attendanceData: Partial<WorkerAttendance> & Record<string, any>,
  ) => Promise<string | null>;
  bulkLogAttendance: (
    entries: Array<Record<string, any>>,
    targetDate?: Date,
  ) => Promise<BulkAttendanceResult>;
  resetTodayAttendance: () => Promise<boolean>;
  logPayment: (
    workerId: string,
    paymentData: Record<string, any>,
  ) => Promise<string | null>;
  logBonus: (workerId: string, bonusData: Record<string, any>) => Promise<string | null>;
  editTodayAttendance: (
    workerId: string,
    newAttendanceData: Partial<WorkerAttendance> & Record<string, any>,
    workerType?: string,
    targetDate?: Date,
  ) => Promise<string | null>;
  deleteAttendance: (
    attendanceId: string,
    attendanceData?: Partial<WorkerAttendance> & Record<string, any>,
  ) => Promise<boolean>;
  editAttendance: (
    attendanceId: string,
    newAttendanceData: Partial<WorkerAttendance> & Record<string, any>,
    oldAttendanceData: Partial<WorkerAttendance> & Record<string, any>,
  ) => Promise<boolean>;
  deleteWorkerPayment: (
    paymentId: string,
    paymentData?: Record<string, any>,
  ) => Promise<boolean>;
  editWorkerPayment: (
    paymentId: string,
    newPaymentData: Record<string, any>,
    oldPaymentData: Record<string, any>,
  ) => Promise<boolean>;
  deleteWorkerBonus: (
    bonusId: string,
    bonusData?: Record<string, any>,
  ) => Promise<boolean>;
  editWorkerBonus: (
    bonusId: string,
    newBonusData: Record<string, any>,
    oldBonusData?: Record<string, any>,
  ) => Promise<boolean>;
  adjustRawMaterialBags: (pieces: number, isUndo?: boolean) => Promise<void>;
  syncRawMaterialBagsForAttendance: (
    attendanceId: string | null,
    newPieces: number,
    oldPieces?: number,
  ) => Promise<void>;
}

export const WorkerContext = createContext<WorkerContextType>({
  workers: [],
  loading: true,
  todayAttendance: [],
  allAttendance: [],
  loadingAttendance: true,
  addWorker: async () => null,
  updateWorker: async () => false,
  deleteWorker: async () => false,
  logAttendance: async () => null,
  bulkLogAttendance: async () => null,
  resetTodayAttendance: async () => false,
  logPayment: async () => null,
  logBonus: async () => null,
  editTodayAttendance: async () => null,
  deleteAttendance: async () => false,
  editAttendance: async () => false,
  deleteWorkerPayment: async () => false,
  editWorkerPayment: async () => false,
  deleteWorkerBonus: async () => false,
  editWorkerBonus: async () => false,
  adjustRawMaterialBags: async () => {},
  syncRawMaterialBagsForAttendance: async () => {},
});

function getTodayDateString(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseTimeToMinutes(time: unknown): number | null {
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
}

function isSchedulerDueToday(config: Record<string, any> | null): boolean {
  if (!config || !config.enabled) return false;
  const today = getTodayDateString();

  if (
    !config.scheduleType ||
    config.scheduleType === "everyday" ||
    config.scheduleType === "daily"
  ) {
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
      return true;
    }
    return config.repeatDays.includes(dayIndex);
  }

  return false;
}

function hasSchedulerAlreadyRunToday(config: Record<string, any> | null): boolean {
  if (!config) return false;
  return config.lastRunDate === getTodayDateString();
}

async function getActiveFinishedProduct(): Promise<Record<string, any> | null> {
  try {
    const q = query(collection(db, "items"), where("userId", "==", "default_user"));
    const snap = await getDocsOfflineSafe(q);
    const activeProductDoc = snap.docs.find((d: any) => {
      const data = d.data();
      return data.itemType !== "raw_material" && (data.status || "Active") === "Active";
    });
    if (activeProductDoc) {
      return { id: activeProductDoc.id, ...activeProductDoc.data() };
    }
  } catch {
    // Ignore product lookup error
  }
  return null;
}

async function checkRawMaterialStock(pieces: number): Promise<RawMaterialCheckResult> {
  try {
    const settingsRef = doc(db, "automations", "default_user_settings");
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists() || !settingsSnap.data().autoDeductBagsEnabled) {
      return { ok: true };
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
      if (lowStockThreshold > 0 && currentStock - pieces < lowStockThreshold) {
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
  } catch {
    return { ok: true };
  }
}

async function updateProductStockAndSlots(
  activeProduct: Record<string, any>,
  stockChange: number,
): Promise<{ currentStock: number; newStock: number } | null> {
  try {
    const currentStock = Number(
      activeProduct.openingStock !== undefined
        ? activeProduct.openingStock
        : activeProduct.stock || 0,
    );
    const newStock = Math.max(0, currentStock + stockChange);
    let updatedSlots: Record<string, any>[] = Array.isArray(
      activeProduct.openingStockSlots,
    )
      ? activeProduct.openingStockSlots.map((s: Record<string, any>) => ({ ...s }))
      : [];

    if (updatedSlots.length > 0) {
      const totalSlots = updatedSlots.length;
      const lastIdx = totalSlots - 1;
      const currentQty = Number(updatedSlots[lastIdx].quantity || 0);
      const newQty = currentQty + stockChange;

      if (newQty >= 0) {
        updatedSlots[lastIdx].quantity = newQty;
      } else {
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

      const total = updatedSlots.length;
      updatedSlots = updatedSlots.map((s, idx) => ({
        ...s,
        slotName:
          s.slotName && !String(s.slotName).startsWith("Slot ")
            ? s.slotName
            : `Slot ${idx + 1}`,
        slotType: idx === 0 ? "-" : idx === total - 1 && total > 1 ? "+" : "o",
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
}

function computeWorkerDayWage(
  worker: Worker,
  status: string,
  piecesProduced: number,
  overtimeHours: number,
): number {
  let dayWage = 0;
  if (worker.billingSystem === "Piece-Rate") {
    if (status !== "absent") {
      dayWage = piecesProduced * Number(worker.pieceRate || 0);
    }
  } else {
    const dailyWage = Number(worker.dailyWage || 0);
    const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);

    if (status === "present" || status === "half-day") {
      dayWage = status === "half-day" ? dailyWage / 2 : dailyWage;
      dayWage += overtimeHours * overtimeRate;
    }
  }
  return roundCurrency(dayWage);
}

async function recordSchedulerRun(
  config: Record<string, any>,
  createdEntries: number,
): Promise<void> {
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
  } catch {
    // Ignore scheduler log failure
  }
}

export function WorkerProvider({ children }: { children: ReactNode }) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [todayAttendance, setTodayAttendance] = useState<WorkerAttendance[]>([]);
  const [allAttendance, setAllAttendance] = useState<WorkerAttendance[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState<boolean>(true);
  const [attendanceSchedulerConfig, setAttendanceSchedulerConfig] = useState<Record<
    string,
    any
  > | null>(null);

  const workersRef = useRef<Worker[]>(workers);
  useEffect(() => {
    workersRef.current = workers;
  }, [workers]);

  const allAttendanceRef = useRef<WorkerAttendance[]>(allAttendance);
  useEffect(() => {
    allAttendanceRef.current = allAttendance;
  }, [allAttendance]);

  const todayAttendanceRef = useRef<WorkerAttendance[]>(todayAttendance);
  useEffect(() => {
    todayAttendanceRef.current = todayAttendance;
  }, [todayAttendance]);

  const schedulerConfigRef = useRef<Record<string, any> | null>(attendanceSchedulerConfig);
  useEffect(() => {
    schedulerConfigRef.current = attendanceSchedulerConfig;
  }, [attendanceSchedulerConfig]);

  // Defer Firestore listeners to reduce startup load
  const _deferReady = useDeferredInit();

  useEffect(() => {
    if (!_deferReady) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const workersCollection = collection(db, "workers");

    const unsubscribe = onSnapshot(
      workersCollection,
      (snapshot) => {
        const dbWorkers = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: String(data.name || ""),
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
            joinDate: normalizeDateValue(data.joinDate, data.createdAt),
          } as Worker & { createdAt: Date };
        });

        dbWorkers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        workersRef.current = dbWorkers;
        setWorkers(dbWorkers);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [_deferReady]);

  // Real-time listener for recent attendance records (last 30 days)
  useEffect(() => {
    if (!_deferReady) {
      setLoadingAttendance(false);
      return;
    }
    const attCol = collection(db, "workerAttendance");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    const attQuery = query(attCol, where("createdAt", ">=", Timestamp.fromDate(thirtyDaysAgo)));

    const unsubscribe = onSnapshot(
      attQuery,
      (snapshot) => {
        const records = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            workerId: String(data.workerId || ""),
            status: String(data.status || "present"),
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
          } as WorkerAttendance & { createdAt: Date };
        });
        records.sort(
          (a, b) =>
            (b.createdAt instanceof Date ? b.createdAt.getTime() : 0) -
            (a.createdAt instanceof Date ? a.createdAt.getTime() : 0),
        );
        allAttendanceRef.current = records;
        setAllAttendance(records);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const todays = records.filter((r) => {
          const dt =
            r.createdAt instanceof Date ? r.createdAt : normalizeDateValue(r.createdAt);
          return dt >= todayStart && dt <= todayEnd;
        });

        todayAttendanceRef.current = todays;
        setTodayAttendance(todays);
        setLoadingAttendance(false);
      },
      () => {
        setLoadingAttendance(false);
      },
    );

    return () => unsubscribe();
  }, [_deferReady]);

  useEffect(() => {
    const schedRef = doc(db, "automations", "attendance_scheduler");
    const unsubscribe = onSnapshot(
      schedRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          schedulerConfigRef.current = data;
          setAttendanceSchedulerConfig(data);
        } else {
          schedulerConfigRef.current = null;
          setAttendanceSchedulerConfig(null);
        }
      },
      () => {},
    );

    return () => unsubscribe();
  }, []);

  const syncRawMaterialBagsForAttendance = useCallback(
    async (
      attendanceId: string | null,
      newPieces: number,
      oldPieces = 0,
    ): Promise<void> => {
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
            rmData.openingStock !== undefined ? rmData.openingStock : rmData.stock || 0,
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

            if (rmData.trackWastage) {
              try {
                await syncWastageStockOnConsumption(
                  rmDoc.id,
                  diffPieces,
                  diffPieces > 0
                    ? `Wastage added from worker piece-rate production of ${diffPieces} bags`
                    : `Wastage rollback from worker attendance adjustment (${diffPieces} bags)`,
                );
              } catch (wErr) {
                console.error(
                  "Error syncing wastage on worker attendance auto-deduction:",
                  wErr,
                );
              }
            }
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
    },
    [],
  );

  const adjustRawMaterialBags = useCallback(
    async (pieces: number, isUndo = false): Promise<void> => {
      await syncRawMaterialBagsForAttendance(null, isUndo ? 0 : pieces, isUndo ? pieces : 0);
    },
    [syncRawMaterialBagsForAttendance],
  );

  const addWorker = useCallback(
    async (workerData: Partial<Worker> & Record<string, any>): Promise<string | null> => {
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
      } catch {
        return null;
      }
    },
    [],
  );

  const updateWorker = useCallback(
    async (
      workerId: string,
      workerData: Partial<Worker> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        const workerRef = doc(db, "workers", workerId);
        await updateDoc(workerRef, {
          ...workerData,
          updatedAt: new Date(),
        });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const deleteWorker = useCallback(async (workerId: string): Promise<boolean> => {
    try {
      const workerRef = doc(db, "workers", workerId);
      await deleteDoc(workerRef);
      return true;
    } catch {
      return false;
    }
  }, []);

  const editTodayAttendanceRef = useRef<
    ((
      workerId: string,
      newAttendanceData: Partial<WorkerAttendance> & Record<string, any>,
      workerType?: string,
      targetDate?: Date,
    ) => Promise<string | null>) | null
  >(null);

  const logAttendance = useCallback(
    async (
      workerId: string,
      attendanceData: Partial<WorkerAttendance> & Record<string, any>,
    ): Promise<string | null> => {
      try {
        const workerType = String(attendanceData.workerType || "regular");
        const createdAtDate = attendanceData.createdAt
          ? normalizeDateValue(attendanceData.createdAt)
          : new Date();
        const targetDayStart = new Date(createdAtDate);
        targetDayStart.setHours(0, 0, 0, 0);
        const targetDayEnd = new Date(createdAtDate);
        targetDayEnd.setHours(23, 59, 59, 999);

        const existing = (allAttendanceRef.current || []).find((a) => {
          if (a.workerId !== workerId) return false;
          const d =
            a.createdAt instanceof Date ? a.createdAt : normalizeDateValue(a.createdAt);
          return d >= targetDayStart && d <= targetDayEnd;
        });
        if (existing && editTodayAttendanceRef.current) {
          return await editTodayAttendanceRef.current(
            workerId,
            attendanceData,
            workerType,
            createdAtDate,
          );
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
            const updatedStockResult = await updateProductStockAndSlots(
              activeProduct,
              stockIncrement,
            );
            const currentStock = updatedStockResult
              ? updatedStockResult.currentStock
              : Number(activeProduct.openingStock || 0);
            const newStock = updatedStockResult
              ? updatedStockResult.newStock
              : currentStock + stockIncrement;

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
                (cwData.attendanceDays || 0) + (attendanceData.status !== "absent" ? 1 : 0),
              updatedAt: new Date(),
            });
          }
        } else {
          const worker = (workersRef.current || []).find((w) => w.id === workerId);
          if (worker) {
            const dayWage = computeWorkerDayWage(
              worker,
              String(attendanceData.status || "present"),
              Number(attendanceData.piecesProduced || 0),
              Number(attendanceData.overtimeHours || 0),
            );

            const workerRef = doc(db, "workers", workerId);
            const updatePayload: Record<string, any> = {
              attendanceDays:
                Number(worker.attendanceDays || 0) +
                (attendanceData.status !== "absent" ? 1 : 0),
              totalWages: roundCurrency(Number(worker.totalWages || 0) + dayWage),
              totalPending: roundCurrency(Number(worker.totalPending || 0) + dayWage),
              updatedAt: new Date(),
            };
            if (
              worker.billingSystem === "Piece-Rate" &&
              attendanceData.piecesProduced !== undefined &&
              attendanceData.status !== "absent"
            ) {
              updatePayload.lastPiecesProduced = Number(attendanceData.piecesProduced);
            }
            await updateDoc(workerRef, updatePayload);
          }
        }

        return docRef.id;
      } catch {
        return null;
      }
    },
    [syncRawMaterialBagsForAttendance],
  );

  const editTodayAttendance = useCallback(
    async (
      workerId: string,
      newAttendanceData: Partial<WorkerAttendance> & Record<string, any>,
      workerType = "regular",
      targetDate = new Date(),
    ): Promise<string | null> => {
      try {
        const targetDayStart = new Date(targetDate);
        targetDayStart.setHours(0, 0, 0, 0);
        const targetDayEnd = new Date(targetDate);
        targetDayEnd.setHours(23, 59, 59, 999);

        const q = query(
          collection(db, "workerAttendance"),
          where("workerId", "==", workerId),
        );
        const snapAll = await getDocsOfflineSafe(q);
        const targetDocs = snapAll.docs.filter((d: any) => {
          const cd = d.data().createdAt;
          const dt = normalizeDateValue(cd, new Date());
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
            saveDate.setHours(
              now.getHours(),
              now.getMinutes(),
              now.getSeconds(),
              now.getMilliseconds(),
            );
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
          const worker = (workersRef.current || []).find((w) => w.id === workerId);
          if (worker) {
            const prevWage = computeWorkerDayWage(
              worker,
              String(prevData.status || "present"),
              Number(prevData.piecesProduced || 0),
              Number(prevData.overtimeHours || 0),
            );
            const newPiecesProduced =
              newAttendanceData.piecesProduced !== undefined
                ? Number(newAttendanceData.piecesProduced)
                : 0;
            const newWage = computeWorkerDayWage(
              worker,
              String(newAttendanceData.status || "present"),
              newPiecesProduced,
              Number(newAttendanceData.overtimeHours || 0),
            );

            const prevDays = prevData.status !== "absent" ? 1 : 0;
            const newDays = newAttendanceData.status !== "absent" ? 1 : 0;

            const workerRef = doc(db, "workers", workerId);
            const updatePayload: Record<string, any> = {
              attendanceDays: Math.max(
                0,
                Number(worker.attendanceDays || 0) - prevDays + newDays,
              ),
              totalWages: Math.max(
                0,
                roundCurrency(Number(worker.totalWages || 0) - prevWage + newWage),
              ),
              totalPending: roundCurrency(
                Number(worker.totalPending || 0) - prevWage + newWage,
              ),
              updatedAt: new Date(),
            };
            if (
              worker.billingSystem === "Piece-Rate" &&
              newAttendanceData.piecesProduced !== undefined &&
              newAttendanceData.status !== "absent"
            ) {
              updatePayload.lastPiecesProduced = newPiecesProduced;
            }
            await updateDoc(workerRef, updatePayload);
          }
        }

        const piecesProduced =
          newAttendanceData.piecesProduced !== undefined
            ? Number(newAttendanceData.piecesProduced)
            : 0;

        const finalPieces = newAttendanceData.status !== "absent" ? piecesProduced : 0;
        const prevPieces =
          prevData.status !== "absent" ? Number(prevData.piecesProduced || 0) : 0;

        const diffPieces = finalPieces - prevPieces;

        if (diffPieces !== 0) {
          const activeProduct = await getActiveFinishedProduct();
          if (activeProduct) {
            const unitsPerBag = Number(
              activeProduct.unitsPerBag !== undefined ? activeProduct.unitsPerBag : 50,
            );
            const stockIncrement = diffPieces * unitsPerBag;
            const updatedStockResult = await updateProductStockAndSlots(
              activeProduct,
              stockIncrement,
            );
            const currentStock = updatedStockResult
              ? updatedStockResult.currentStock
              : Number(activeProduct.openingStock || 0);
            const newStock = updatedStockResult
              ? updatedStockResult.newStock
              : currentStock + stockIncrement;

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
          notes:
            newAttendanceData.notes !== undefined
              ? newAttendanceData.notes
              : prevData.notes || "",
          updatedAt: new Date(),
        });

        return existingDoc.id;
      } catch {
        return null;
      }
    },
    [logAttendance, syncRawMaterialBagsForAttendance],
  );

  useEffect(() => {
    editTodayAttendanceRef.current = editTodayAttendance;
  }, [editTodayAttendance]);

  const bulkLogAttendance = useCallback(
    async (
      entries: Array<Record<string, any>>,
      targetDate = new Date(),
    ): Promise<BulkAttendanceResult> => {
      try {
        const totalPieces = entries.reduce((sum, e) => {
          if (e.status !== "absent" && Number(e.piecesProduced || 0) > 0) {
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

        const results: string[] = [];
        const processedWorkerIds = new Set<string>();
        for (const entry of entries) {
          const {
            workerId,
            status,
            overtimeHours = 0,
            notes = "",
            workerType = "regular",
          } = entry;

          if (!workerId || processedWorkerIds.has(workerId)) continue;

          const alreadyLogged = (allAttendanceRef.current || []).find((a) => {
            if (a.workerId !== workerId) return false;
            const d =
              a.createdAt instanceof Date ? a.createdAt : normalizeDateValue(a.createdAt);
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
            saveDate.setHours(
              now.getHours(),
              now.getMinutes(),
              now.getSeconds(),
              now.getMilliseconds(),
            );
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
                activeProduct.unitsPerBag !== undefined ? activeProduct.unitsPerBag : 50,
              );
              const stockIncrement = finalPieces * unitsPerBag;
              const updatedStockResult = await updateProductStockAndSlots(
                activeProduct,
                stockIncrement,
              );
              const currentStock = updatedStockResult
                ? updatedStockResult.currentStock
                : Number(activeProduct.openingStock || 0);
              const newStock = updatedStockResult
                ? updatedStockResult.newStock
                : currentStock + stockIncrement;

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
            const worker = (workersRef.current || []).find((w) => w.id === workerId);
            if (worker) {
              const dayWage = computeWorkerDayWage(
                worker,
                String(status || "present"),
                piecesProduced,
                Number(overtimeHours || 0),
              );

              const workerRef = doc(db, "workers", workerId);
              const updatePayload: Record<string, any> = {
                attendanceDays:
                  Number(worker.attendanceDays || 0) + (status !== "absent" ? 1 : 0),
                totalWages: roundCurrency(Number(worker.totalWages || 0) + dayWage),
                totalPending: roundCurrency(Number(worker.totalPending || 0) + dayWage),
                updatedAt: new Date(),
              };
              if (
                worker.billingSystem === "Piece-Rate" &&
                entry.piecesProduced !== undefined &&
                status !== "absent"
              ) {
                updatePayload.lastPiecesProduced = piecesProduced;
              }
              await updateDoc(workerRef, updatePayload);
            }
          }

          results.push(docRef.id);
        }
        return results;
      } catch {
        return null;
      }
    },
    [syncRawMaterialBagsForAttendance],
  );

  // Automatic Attendance Scheduler Effect
  useEffect(() => {
    const checkAndRun = async () => {
      const config = schedulerConfigRef.current;
      if (!config || !config.enabled) return;
      if (!isSchedulerDueToday(config)) return;
      if (hasSchedulerAlreadyRunToday(config)) return;
      if (loading || loadingAttendance) return;

      const triggerMinutes = parseTimeToMinutes(config.triggerTime || "09:00 AM");
      if (triggerMinutes === null) return;

      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (nowMinutes < triggerMinutes) return;

      const targetWorkerIds: string[] =
        Array.isArray(config.workerIds) && config.workerIds.length > 0
          ? config.workerIds
          : (workersRef.current || []).map((w) => w.id);

      const entries = targetWorkerIds.reduce<Array<Record<string, any>>>(
        (acc, workerId) => {
          if ((todayAttendanceRef.current || []).find((a) => a.workerId === workerId)) {
            return acc;
          }
          const worker = (workersRef.current || []).find((w) => w.id === workerId);
          if (!worker) return acc;

          const piecesProduced =
            config.defaultStatus === "present"
              ? Number(config.defaultProductionQty || 0)
              : config.defaultStatus === "half-day"
                ? Number(((config.defaultProductionQty || 0) / 2).toFixed(2))
                : 0;

          acc.push({
            workerId,
            status: config.defaultStatus || "present",
            overtimeHours: 0,
            piecesProduced,
            notes: "Created automatically by Attendance Scheduler",
            workerType: worker.workerType || "regular",
            createdAutomatically: true,
          });
          return acc;
        },
        [],
      );

      const createdEntries = entries.length;
      if (config.saveAttendance && createdEntries > 0) {
        const result = await bulkLogAttendance(entries);
        if (!result || !Array.isArray(result)) {
          return;
        }
      }

      await recordSchedulerRun(config, createdEntries);
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
    bulkLogAttendance,
  ]);

  // Reset today's attendance — delete records and reverse wage calculations
  const resetTodayAttendance = useCallback(async (): Promise<boolean> => {
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

      const workerRollbacks: Record<string, { wageRollback: number; dayRollback: number }> =
        {};
      const contractWorkerRollbacks: Record<string, { dayRollback: number }> = {};
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
          const worker = (workersRef.current || []).find((w) => w.id === wId);
          if (worker) {
            if (!workerRollbacks[wId]) {
              workerRollbacks[wId] = { wageRollback: 0, dayRollback: 0 };
            }

            const dayWage = computeWorkerDayWage(
              worker,
              String(data.status || "present"),
              Number(data.piecesProduced || 0),
              Number(data.overtimeHours || 0),
            );

            workerRollbacks[wId].wageRollback = roundCurrency(
              workerRollbacks[wId].wageRollback + dayWage,
            );
            if (data.status !== "absent") {
              workerRollbacks[wId].dayRollback += 1;
            }
          }
        }

        await deleteDoc(doc(db, "workerAttendance", attDoc.id));
      }

      if (totalPiecesToday > 0) {
        const activeProduct = await getActiveFinishedProduct();
        if (activeProduct) {
          const unitsPerBag = Number(
            activeProduct.unitsPerBag !== undefined ? activeProduct.unitsPerBag : 50,
          );
          const stockDecrement = totalPiecesToday * unitsPerBag;
          const updatedStockResult = await updateProductStockAndSlots(
            activeProduct,
            -stockDecrement,
          );
          const currentStock = updatedStockResult
            ? updatedStockResult.currentStock
            : Number(activeProduct.openingStock || 0);
          const newStock = updatedStockResult
            ? updatedStockResult.newStock
            : Math.max(0, currentStock - stockDecrement);

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
          const p =
            attDoc.data().status !== "absent"
              ? Number(attDoc.data().piecesProduced || 0)
              : 0;
          if (p > 0) {
            await syncRawMaterialBagsForAttendance(attDoc.id, 0, p);
          }
        }
      }

      // Rollback worker totals
      for (const [wId, rollback] of Object.entries(workerRollbacks)) {
        const worker = (workersRef.current || []).find((w) => w.id === wId);
        if (worker) {
          const workerRef = doc(db, "workers", wId);
          await updateDoc(workerRef, {
            attendanceDays: Math.max(
              0,
              Number(worker.attendanceDays || 0) - rollback.dayRollback,
            ),
            totalWages: Math.max(
              0,
              roundCurrency(Number(worker.totalWages || 0) - rollback.wageRollback),
            ),
            totalPending: roundCurrency(
              Number(worker.totalPending || 0) - rollback.wageRollback,
            ),
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
        } catch {
          // Ignore contract worker rollback failure
        }
      }

      return true;
    } catch {
      return false;
    }
  }, [syncRawMaterialBagsForAttendance]);

  const logPayment = useCallback(
    async (
      workerId: string,
      paymentData: Record<string, any>,
    ): Promise<string | null> => {
      try {
        const paymentDate = paymentData.createdAt || paymentData.date || new Date();
        const docRef = await addDoc(collection(db, "workerPayments"), {
          workerId,
          ...paymentData,
          createdAt: paymentDate,
          date: paymentDate,
        });

        const worker = (workersRef.current || []).find((w) => w.id === workerId);
        if (worker) {
          const paidAmount = roundCurrency(Number(paymentData.amount || 0));
          const workerRef = doc(db, "workers", workerId);
          await updateDoc(workerRef, {
            totalPaid: roundCurrency(Number(worker.totalPaid || 0) + paidAmount),
            totalPending: roundCurrency(Number(worker.totalPending || 0) - paidAmount),
            updatedAt: new Date(),
          });
        }

        return docRef.id;
      } catch {
        return null;
      }
    },
    [],
  );

  const deleteAttendance = useCallback(
    async (
      attendanceId: string,
      attendanceData?: Partial<WorkerAttendance> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        const attPayload =
          attendanceData || (await getDoc(doc(db, "workerAttendance", attendanceId))).data();
        if (!attPayload) return false;

        const {
          workerId,
          status,
          piecesProduced,
          overtimeHours,
          workerType = "regular",
        } = attPayload;

        // 1. Revert worker totals
        if (workerType === "contract") {
          const contractWorkerRef = doc(db, "contractWorkers", String(workerId));
          const docSnap = await getDoc(contractWorkerRef);
          if (docSnap.exists()) {
            const cwData = status !== "absent" ? 1 : 0;
            await updateDoc(contractWorkerRef, {
              attendanceDays: Math.max(0, (docSnap.data().attendanceDays || 0) - cwData),
              updatedAt: new Date(),
            });
          }
        } else {
          const worker = (workersRef.current || []).find((w) => w.id === workerId);
          if (worker) {
            const dayWage = computeWorkerDayWage(
              worker,
              String(status || "present"),
              Number(piecesProduced || 0),
              Number(overtimeHours || 0),
            );

            const prevDays = status !== "absent" ? 1 : 0;
            const workerRef = doc(db, "workers", String(workerId));
            await updateDoc(workerRef, {
              attendanceDays: Math.max(0, Number(worker.attendanceDays || 0) - prevDays),
              totalWages: Math.max(
                0,
                roundCurrency(Number(worker.totalWages || 0) - dayWage),
              ),
              totalPending: roundCurrency(Number(worker.totalPending || 0) - dayWage),
              updatedAt: new Date(),
            });
          }
        }

        // 2. Revert inventory stock if piece-rate
        const pieces = Number(piecesProduced || 0);
        if (pieces > 0) {
          const activeProduct = await getActiveFinishedProduct();
          if (activeProduct) {
            const unitsPerBag = Number(
              activeProduct.unitsPerBag !== undefined ? activeProduct.unitsPerBag : 50,
            );
            const stockDecrement = pieces * unitsPerBag;
            const updatedStockResult = await updateProductStockAndSlots(
              activeProduct,
              -stockDecrement,
            );
            const currentStock = updatedStockResult
              ? updatedStockResult.currentStock
              : Number(activeProduct.openingStock || 0);
            const newStock = updatedStockResult
              ? updatedStockResult.newStock
              : Math.max(0, currentStock - stockDecrement);

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
    },
    [syncRawMaterialBagsForAttendance],
  );

  const editAttendance = useCallback(
    async (
      attendanceId: string,
      newAttendanceData: Partial<WorkerAttendance> & Record<string, any>,
      oldAttendanceData: Partial<WorkerAttendance> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        const {
          status: newStatus,
          piecesProduced: newPiecesRaw,
          overtimeHours: newOTHours,
          notes: newNotes = "",
          date: newDateStr,
        } = newAttendanceData;
        const {
          workerId,
          status: oldStatus,
          piecesProduced: oldPiecesRaw,
          overtimeHours: oldOTHours,
          workerType = "regular",
        } = oldAttendanceData;

        const newPieces = Number(newPiecesRaw || 0);
        const oldPieces = Number(oldPiecesRaw || 0);

        // 1. Revert and apply worker totals
        if (workerType === "contract") {
          const contractWorkerRef = doc(db, "contractWorkers", String(workerId));
          const docSnap = await getDoc(contractWorkerRef);
          if (docSnap.exists()) {
            const cwData = docSnap.data();
            const prevDays = oldStatus !== "absent" ? 1 : 0;
            const newDays = newStatus !== "absent" ? 1 : 0;
            await updateDoc(contractWorkerRef, {
              attendanceDays: Math.max(
                0,
                (cwData.attendanceDays || 0) - prevDays + newDays,
              ),
              updatedAt: new Date(),
            });
          }
        } else {
          const worker = (workersRef.current || []).find((w) => w.id === workerId);
          if (worker) {
            const oldWage = computeWorkerDayWage(
              worker,
              String(oldStatus || "present"),
              oldPieces,
              Number(oldOTHours || 0),
            );
            const newWage = computeWorkerDayWage(
              worker,
              String(newStatus || "present"),
              newPieces,
              Number(newOTHours || 0),
            );

            const prevDays = oldStatus !== "absent" ? 1 : 0;
            const newDays = newStatus !== "absent" ? 1 : 0;

            const workerRef = doc(db, "workers", String(workerId));
            await updateDoc(workerRef, {
              attendanceDays: Math.max(
                0,
                Number(worker.attendanceDays || 0) - prevDays + newDays,
              ),
              totalWages: Math.max(
                0,
                roundCurrency(Number(worker.totalWages || 0) - oldWage + newWage),
              ),
              totalPending: roundCurrency(
                Number(worker.totalPending || 0) - oldWage + newWage,
              ),
              updatedAt: new Date(),
            });
          }
        }

        // 2. Adjust inventory stock
        const diffPieces = newPieces - oldPieces;
        if (diffPieces !== 0) {
          const activeProduct = await getActiveFinishedProduct();
          if (activeProduct) {
            const unitsPerBag = Number(
              activeProduct.unitsPerBag !== undefined ? activeProduct.unitsPerBag : 50,
            );
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
        const updateData: Record<string, any> = {
          status: newStatus,
          overtimeHours: Number(newOTHours || 0),
          piecesProduced: newPieces,
          notes: newNotes,
          updatedAt: new Date(),
        };
        if (newDateStr) {
          updateData.date = newDateStr;
          updateData.createdAt = new Date(String(newDateStr));
        }
        await updateDoc(doc(db, "workerAttendance", attendanceId), updateData);
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    },
    [syncRawMaterialBagsForAttendance],
  );

  const deleteWorkerPayment = useCallback(
    async (paymentId: string, paymentData?: Record<string, any>): Promise<boolean> => {
      try {
        const payPayload =
          paymentData || (await getDoc(doc(db, "workerPayments", paymentId))).data();
        if (!payPayload) return false;

        const { workerId, amount } = payPayload;

        const worker = (workersRef.current || []).find((w) => w.id === workerId);
        if (worker) {
          const paidAmount = roundCurrency(Number(amount || 0));
          const workerRef = doc(db, "workers", String(workerId));
          await updateDoc(workerRef, {
            totalPaid: Math.max(
              0,
              roundCurrency(Number(worker.totalPaid || 0) - paidAmount),
            ),
            totalPending: roundCurrency(Number(worker.totalPending || 0) + paidAmount),
            updatedAt: new Date(),
          });
        }

        await deleteDoc(doc(db, "workerPayments", paymentId));
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    },
    [],
  );

  const editWorkerPayment = useCallback(
    async (
      paymentId: string,
      newPaymentData: Record<string, any>,
      oldPaymentData: Record<string, any>,
    ): Promise<boolean> => {
      try {
        const { amount: newAmount, method, notes, createdAt } = newPaymentData;
        const { workerId, amount: oldAmount } = oldPaymentData;

        const diff = roundCurrency(Number(newAmount) - Number(oldAmount));

        const worker = (workersRef.current || []).find((w) => w.id === workerId);
        if (worker) {
          const workerRef = doc(db, "workers", String(workerId));
          await updateDoc(workerRef, {
            totalPaid: Math.max(0, roundCurrency(Number(worker.totalPaid || 0) + diff)),
            totalPending: roundCurrency(Number(worker.totalPending || 0) - diff),
            updatedAt: new Date(),
          });
        }

        const updateData: Record<string, any> = {
          amount: roundCurrency(Number(newAmount)),
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
    },
    [],
  );

  const logBonus = useCallback(
    async (workerId: string, bonusData: Record<string, any>): Promise<string | null> => {
      try {
        const docRef = await addDoc(collection(db, "workerBonuses"), {
          workerId,
          amount: roundCurrency(Number(bonusData.amount || 0)),
          reason: bonusData.reason || "Performance Bonus",
          notes: bonusData.notes || "",
          createdAt: bonusData.createdAt ? new Date(bonusData.createdAt) : new Date(),
        });
        return docRef.id;
      } catch (error) {
        console.error("Error logging bonus:", error);
        return null;
      }
    },
    [],
  );

  const deleteWorkerBonus = useCallback(
    async (bonusId: string, _bonusData?: Record<string, any>): Promise<boolean> => {
      try {
        await deleteDoc(doc(db, "workerBonuses", bonusId));
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    },
    [],
  );

  const editWorkerBonus = useCallback(
    async (
      bonusId: string,
      newBonusData: Record<string, any>,
      _oldBonusData?: Record<string, any>,
    ): Promise<boolean> => {
      try {
        const { amount: newAmount, reason, notes, createdAt } = newBonusData;
        const updateData: Record<string, any> = {
          amount: roundCurrency(Number(newAmount)),
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
    },
    [],
  );

  const contextValue = useMemo<WorkerContextType>(
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
    [
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
    ],
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

