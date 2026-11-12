import { normalizeDateValue } from "../src/config/firebase";
import { DateInput, RawMaterialPurchase, WorkerAttendance } from "../src/types/models";

export interface PurchaseIntervalResult {
  formatted: string;
  unit: string;
  subtext: string;
  fullSubtext: string;
  workingDays: number | null;
}

export interface MaterialIntervalSummary {
  formatted: string;
  unit: string;
  subtext: string;
  daysNumber: number | null;
}

/**
 * Formats a Firestore timestamp / Date / string into a local YYYY-MM-DD key.
 */
export function formatIntervalDateKey(dateVal: DateInput): string {
  if (!dateVal) return "";
  const d = normalizeDateValue(dateVal);
  if (!d || isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Builds the Set of local YYYY-MM-DD calendar keys where at least one worker
 * was marked present or half-day (excluding absent-only days).
 */
export function buildPresentedDatesSet(workerAttendance: WorkerAttendance[] = []): Set<string> {
  const dates = new Set<string>();
  (workerAttendance || []).forEach((att) => {
    if (att.status && att.status !== "absent") {
      const key = formatIntervalDateKey(att.createdAt || att.date);
      if (key) {
        dates.add(key);
      }
    }
  });
  return dates;
}

function extractSortedPurchaseTimestamps(logs: RawMaterialPurchase[] = []): number[] {
  return (logs || [])
    .filter((log) => log.type === "purchase")
    .map((log) => {
      const raw = log.date || log.createdAt;
      if (!raw) return null;
      if (raw instanceof Date) return raw.getTime();
      if (typeof raw === "object" && raw !== null && typeof (raw as any).toDate === "function") {
        return (raw as any).toDate().getTime();
      }
      const d = new Date(raw as string | number);
      return isNaN(d.getTime()) ? null : d.getTime();
    })
    .filter((ts): ts is number => ts !== null && Number.isFinite(ts))
    .sort((a, b) => a - b);
}

function countActiveDaysBetween(
  startMs: number,
  endMs: number,
  hasAttendanceData: boolean,
  presentedDates: Set<string>
): { activeDays: number; isSameDay: boolean } {
  const startDate = new Date(startMs);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(endMs);
  endDate.setHours(0, 0, 0, 0);
  const isSameDay = startDate.getTime() === endDate.getTime();

  if (isSameDay) {
    return { activeDays: 0, isSameDay: true };
  }

  let intervalDays = 0;
  if (hasAttendanceData) {
    const curr = new Date(startDate);
    while (curr < endDate) {
      const key = formatIntervalDateKey(curr);
      if (presentedDates.has(key)) {
        intervalDays++;
      }
      curr.setDate(curr.getDate() + 1);
    }
  } else {
    intervalDays = Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
  }

  const safeDays = Number.isFinite(intervalDays) && intervalDays > 0 ? intervalDays : 0;
  return { activeDays: safeDays, isSameDay: false };
}

/**
 * Computes Last - Current purchase intervals keyed by materialId, guarded against
 * 0 worker-present days and same-day purchases.
 */
export function computePurchaseIntervalMap(
  logs: RawMaterialPurchase[] = [],
  workerAttendance: WorkerAttendance[] = [],
  presentedDates: Set<string>
): Record<string, PurchaseIntervalResult> {
  const hasAttendanceData = (workerAttendance || []).length > 0;
  const purchasesByMaterial: Record<string, RawMaterialPurchase[]> = {};

  (logs || []).forEach((log) => {
    if (log.type === "purchase" && log.materialId) {
      if (!purchasesByMaterial[log.materialId]) {
        purchasesByMaterial[log.materialId] = [];
      }
      purchasesByMaterial[log.materialId].push(log);
    }
  });

  const result: Record<string, PurchaseIntervalResult> = {};

  Object.keys(purchasesByMaterial).forEach((matId) => {
    const timestamps = extractSortedPurchaseTimestamps(purchasesByMaterial[matId]);

    if (timestamps.length === 0) {
      result[matId] = {
        formatted: "N/A",
        unit: "",
        subtext: "No purchases logged",
        fullSubtext: "No purchases logged",
        workingDays: null,
      };
      return;
    }

    if (timestamps.length === 1) {
      result[matId] = {
        formatted: "1",
        unit: "Purchase",
        subtext: "Only 1 purchase logged",
        fullSubtext: "Only 1 purchase logged",
        workingDays: null,
      };
      return;
    }

    const prevPurchase = timestamps[timestamps.length - 2];
    const latestPurchase = timestamps[timestamps.length - 1];
    const { activeDays, isSameDay } = countActiveDaysBetween(
      prevPurchase,
      latestPurchase,
      hasAttendanceData,
      presentedDates
    );

    const isZeroActiveDays = activeDays === 0;
    const formatted = isZeroActiveDays ? (isSameDay ? "Same Day" : "0") : `${activeDays}`;
    const unit = isZeroActiveDays
      ? isSameDay
        ? ""
        : "Active Days"
      : activeDays === 1
        ? "Day"
        : "Days";
    const subtext = isZeroActiveDays
      ? isSameDay
        ? "Same-day purchases"
        : hasAttendanceData
          ? "0 active worker days"
          : "< 1 day span"
      : hasAttendanceData
        ? `${activeDays} working ${activeDays === 1 ? "day" : "days"}`
        : "Between last 2 purchases";
    const fullSubtext = isZeroActiveDays
      ? isSameDay
        ? "Both purchases logged on same day"
        : hasAttendanceData
          ? "0 worker-present days between last 2 purchases"
          : "Purchases occurred less than 1 calendar day apart"
      : hasAttendanceData
        ? `Between last 2 purchases (${activeDays} working ${activeDays === 1 ? "day" : "days"})`
        : "Between last 2 purchases";

    result[matId] = {
      formatted,
      unit,
      subtext,
      fullSubtext,
      workingDays: activeDays,
    };
  });

  return result;
}

/**
 * Computes average worker-present purchase interval across all purchases for one material,
 * safely guarding against 0 active days, 0 intervals, or same-day purchases.
 */
export function computeMaterialAveragePurchaseDays(
  materialLogs: RawMaterialPurchase[] = [],
  workerAttendance: WorkerAttendance[] = [],
  presentedDates: Set<string>
): MaterialIntervalSummary {
  const purchaseLogs = (materialLogs || []).filter((log) => log.type === "purchase");
  if (purchaseLogs.length === 0) {
    return {
      formatted: "N/A",
      unit: "",
      subtext: "No purchases logged",
      daysNumber: null,
    };
  }

  const timestamps = extractSortedPurchaseTimestamps(purchaseLogs);
  if (timestamps.length === 0) {
    return {
      formatted: "N/A",
      unit: "",
      subtext: "No purchase dates",
      daysNumber: null,
    };
  }

  const hasAttendanceData = (workerAttendance || []).length > 0;

  if (timestamps.length === 1) {
    if (hasAttendanceData) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { activeDays: presentedSince } = countActiveDaysBetween(
        timestamps[0],
        today.getTime(),
        true,
        presentedDates
      );
      return {
        formatted: "1",
        unit: "Purchase",
        subtext:
          presentedSince === 0
            ? "Bought today"
            : presentedSince === 1
              ? "1 working day ago"
              : `${presentedSince} working days ago`,
        daysNumber: null,
      };
    }

    const daysSince = Math.max(0, Math.floor((Date.now() - timestamps[0]) / (1000 * 60 * 60 * 24)));
    return {
      formatted: "1",
      unit: "Purchase",
      subtext:
        daysSince === 0 ? "Bought today" : daysSince === 1 ? "Bought 1 day ago" : `Bought ${daysSince}d ago`,
      daysNumber: null,
    };
  }

  const firstPurchase = timestamps[0];
  const lastPurchase = timestamps[timestamps.length - 1];
  const intervalsCount = Math.max(0, timestamps.length - 1);
  const { activeDays: totalPresentedDays, isSameDay: isSameDaySpan } = countActiveDaysBetween(
    firstPurchase,
    lastPurchase,
    hasAttendanceData,
    presentedDates
  );

  let avgDays = 0;
  if (intervalsCount > 0 && !isSameDaySpan) {
    if (hasAttendanceData) {
      avgDays = totalPresentedDays / intervalsCount;
    } else {
      const totalSpanDays = Math.max(0, (lastPurchase - firstPurchase) / (1000 * 60 * 60 * 24));
      avgDays = totalSpanDays / intervalsCount;
    }
  }

  if (!Number.isFinite(avgDays) || avgDays < 0) {
    avgDays = 0;
  }

  let displayVal = "";
  let unitVal = "Days";
  if (avgDays === 0) {
    if (isSameDaySpan) {
      displayVal = "Same Day";
      unitVal = "";
    } else {
      displayVal = "0";
      unitVal = "Active Days";
    }
  } else if (avgDays < 1) {
    displayVal = avgDays.toFixed(1);
    unitVal = "Day";
  } else if (avgDays < 10) {
    displayVal = avgDays.toFixed(1);
    unitVal = "Days";
  } else {
    displayVal = `${Math.round(avgDays)}`;
    unitVal = "Days";
  }

  const subtext =
    avgDays === 0
      ? isSameDaySpan
        ? `${timestamps.length} purchases on same day`
        : hasAttendanceData
          ? `0 active worker days across ${timestamps.length} purchases`
          : `Less than 1 calendar day across ${timestamps.length} purchases`
      : hasAttendanceData
        ? `Avg across ${timestamps.length} purchases (${totalPresentedDays} working ${totalPresentedDays === 1 ? "day" : "days"})`
        : `Avg across ${timestamps.length} purchases`;

  return {
    formatted: displayVal,
    unit: unitVal,
    subtext,
    daysNumber: avgDays,
  };
}

/**
 * Computes Last - Current purchase working-day interval for one material.
 */
export function computeMaterialLastPurchaseInterval(
  materialLogs: RawMaterialPurchase[] = [],
  workerAttendance: WorkerAttendance[] = [],
  presentedDates: Set<string>
): MaterialIntervalSummary {
  const purchaseLogs = (materialLogs || []).filter((log) => log.type === "purchase");
  if (purchaseLogs.length === 0) {
    return {
      formatted: "N/A",
      unit: "",
      subtext: "No purchases logged",
      daysNumber: null,
    };
  }

  const timestamps = extractSortedPurchaseTimestamps(purchaseLogs);
  if (timestamps.length === 0) {
    return {
      formatted: "N/A",
      unit: "",
      subtext: "No purchase dates",
      daysNumber: null,
    };
  }

  if (timestamps.length === 1) {
    return {
      formatted: "1",
      unit: "Purchase",
      subtext: "Only 1 purchase logged",
      daysNumber: null,
    };
  }

  const hasAttendanceData = (workerAttendance || []).length > 0;
  const prevPurchase = timestamps[timestamps.length - 2];
  const latestPurchase = timestamps[timestamps.length - 1];
  const { activeDays: intervalDays, isSameDay } = countActiveDaysBetween(
    prevPurchase,
    latestPurchase,
    hasAttendanceData,
    presentedDates
  );

  let displayVal = "";
  let unitVal = "Days";
  if (intervalDays === 0) {
    if (isSameDay) {
      displayVal = "Same Day";
      unitVal = "";
    } else {
      displayVal = "0";
      unitVal = "Active Days";
    }
  } else if (intervalDays === 1) {
    displayVal = "1";
    unitVal = "Day";
  } else {
    displayVal = `${intervalDays}`;
    unitVal = "Days";
  }

  const subtext =
    intervalDays === 0
      ? isSameDay
        ? "Both purchases logged on same day"
        : hasAttendanceData
          ? "0 worker-present days between last 2 purchases"
          : "Same-day or < 1 calendar day span"
      : hasAttendanceData
        ? `Between last 2 purchases (${intervalDays} working ${intervalDays === 1 ? "day" : "days"})`
        : "Between last 2 purchases";

  return {
    formatted: displayVal,
    unit: unitVal,
    subtext,
    daysNumber: intervalDays,
  };
}

