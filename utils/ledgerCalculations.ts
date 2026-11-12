import { normalizeDateValue } from "../src/config/firebase";
import { roundCurrency } from "./currency";
import {
  BonusEntry,
  Customer,
  DeliveryPartner,
  DeliveryPayment,
  DeliveryTrip,
  Expense,
  ExpensePayment,
  InventoryItem,
  Order,
  PaymentRecord,
  RawMaterialPurchase,
  RawMaterialSupplier,
  Worker,
  WorkerAttendance,
  WorkerPayment,
} from "../src/types/models";

// ============================================================================
// BONUS MANAGEMENT HUB HELPERS
// ============================================================================

export interface BonusStats {
  totalAll: number;
  totalCount: number;
  totalWorker: number;
  countWorker: number;
  totalDelivery: number;
  countDelivery: number;
  totalCustomer: number;
  countCustomer: number;
  totalOther: number;
  countOther: number;
  filteredTotal: number;
  filteredCount: number;
}

export function buildUnifiedBonuses(params: {
  workerBonusesRaw: any[];
  deliveryBonusesRaw: any[];
  customerBonusesRaw: any[];
  otherBonusesRaw: any[];
  workerMap: Map<string, { name: string; phone?: string }>;
  partnerMap: Map<string, { name: string; phone?: string }>;
  customerMap: Map<string, { name: string; phone?: string; markings: string[] }>;
}): BonusEntry[] {
  const {
    workerBonusesRaw,
    deliveryBonusesRaw,
    customerBonusesRaw,
    otherBonusesRaw,
    workerMap,
    partnerMap,
    customerMap,
  } = params;

  const list: BonusEntry[] = [];

  (workerBonusesRaw || []).forEach((item) => {
    const recipient = workerMap.get(item.workerId);
    list.push({
      id: item.id,
      type: "worker",
      recipientId: item.workerId,
      recipientName: recipient?.name || item.workerName || "Worker",
      recipientPhone: recipient?.phone,
      amount: roundCurrency(item.amount || 0),
      reason: item.reason || "Performance Bonus",
      notes: item.notes || "",
      createdAt:
        item.createdAt instanceof Date
          ? item.createdAt
          : new Date(item.createdAt || Date.now()),
      updatedAt: item.updatedAt ? normalizeDateValue(item.updatedAt) : undefined,
      rawData: item,
    });
  });

  (deliveryBonusesRaw || []).forEach((item) => {
    const recipient = partnerMap.get(item.partnerId);
    list.push({
      id: item.id,
      type: "delivery",
      recipientId: item.partnerId,
      recipientName: recipient?.name || item.partnerName || "Delivery Partner",
      recipientPhone: recipient?.phone,
      amount: roundCurrency(item.amount || 0),
      reason: item.reason || "Performance Bonus",
      notes: item.notes || "",
      createdAt:
        item.createdAt instanceof Date
          ? item.createdAt
          : new Date(item.createdAt || Date.now()),
      updatedAt: item.updatedAt ? normalizeDateValue(item.updatedAt) : undefined,
      rawData: item,
    });
  });

  (customerBonusesRaw || []).forEach((item) => {
    const recipient = customerMap.get(item.customerId);
    const marks = item.markings || recipient?.markings || [];
    list.push({
      id: item.id,
      type: "customer",
      recipientId: item.customerId,
      recipientName: recipient?.name || item.customerName || "Marked Customer",
      recipientPhone: recipient?.phone || item.customerPhone,
      markings: marks,
      amount: roundCurrency(item.amount || 0),
      reason: item.reason || "Contractor Commission",
      notes: item.notes || "",
      createdAt:
        item.createdAt instanceof Date
          ? item.createdAt
          : new Date(item.createdAt || Date.now()),
      updatedAt: item.updatedAt ? normalizeDateValue(item.updatedAt) : undefined,
      rawData: item,
    });
  });

  (otherBonusesRaw || []).forEach((item) => {
    list.push({
      id: item.id,
      type: "other",
      recipientId: item.id,
      recipientName: item.recipientName || "Recipient",
      recipientPhone: item.recipientPhone || "",
      recipientRole: item.recipientRole || "Other",
      amount: roundCurrency(item.amount || 0),
      reason: item.reason || "Festival Gift / Perk",
      notes: item.notes || "",
      createdAt:
        item.createdAt instanceof Date
          ? item.createdAt
          : new Date(item.createdAt || Date.now()),
      updatedAt: item.updatedAt ? normalizeDateValue(item.updatedAt) : undefined,
      rawData: item,
    });
  });

  return list;
}

export function filterAndSortBonuses(params: {
  unifiedBonuses: BonusEntry[];
  selectedTab: "all" | "worker" | "delivery" | "customer" | "other";
  searchQuery: string;
  sortBy: "newest" | "oldest" | "amount_desc" | "amount_asc";
  isDateInFilter: (date: Date) => boolean;
}): BonusEntry[] {
  const { unifiedBonuses, selectedTab, searchQuery, sortBy, isDateInFilter } = params;
  const q = searchQuery.trim().toLowerCase();

  return (unifiedBonuses || [])
    .filter((b) => {
      if (selectedTab !== "all" && b.type !== selectedTab) return false;
      if (!isDateInFilter(b.createdAt)) return false;

      if (q) {
        const matchName = b.recipientName.toLowerCase().includes(q);
        const matchReason = b.reason.toLowerCase().includes(q);
        const matchNotes = (b.notes || "").toLowerCase().includes(q);
        const matchPhone = (b.recipientPhone || "").toLowerCase().includes(q);
        const matchMarking = (b.markings || []).some((m) => m.toLowerCase().includes(q));
        const matchRole = (b.recipientRole || "").toLowerCase().includes(q);
        if (!matchName && !matchReason && !matchNotes && !matchPhone && !matchMarking && !matchRole) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "newest") return b.createdAt.getTime() - a.createdAt.getTime();
      if (sortBy === "oldest") return a.createdAt.getTime() - b.createdAt.getTime();
      if (sortBy === "amount_desc") return b.amount - a.amount;
      if (sortBy === "amount_asc") return a.amount - b.amount;
      return 0;
    });
}

export function computeBonusStats(
  unifiedBonuses: BonusEntry[],
  filteredBonuses: BonusEntry[]
): BonusStats {
  let totalAll = 0;
  let totalWorker = 0;
  let countWorker = 0;
  let totalDelivery = 0;
  let countDelivery = 0;
  let totalCustomer = 0;
  let countCustomer = 0;
  let totalOther = 0;
  let countOther = 0;
  let filteredTotal = 0;

  (unifiedBonuses || []).forEach((b) => {
    const amt = roundCurrency(b.amount);
    totalAll = roundCurrency(totalAll + amt);
    if (b.type === "worker") {
      totalWorker = roundCurrency(totalWorker + amt);
      countWorker += 1;
    } else if (b.type === "delivery") {
      totalDelivery = roundCurrency(totalDelivery + amt);
      countDelivery += 1;
    } else if (b.type === "customer") {
      totalCustomer = roundCurrency(totalCustomer + amt);
      countCustomer += 1;
    } else if (b.type === "other") {
      totalOther = roundCurrency(totalOther + amt);
      countOther += 1;
    }
  });

  (filteredBonuses || []).forEach((b) => {
    filteredTotal = roundCurrency(filteredTotal + b.amount);
  });

  return {
    totalAll,
    totalCount: unifiedBonuses.length,
    totalWorker,
    countWorker,
    totalDelivery,
    countDelivery,
    totalCustomer,
    countCustomer,
    totalOther,
    countOther,
    filteredTotal,
    filteredCount: filteredBonuses.length,
  };
}

// ============================================================================
// CUSTOMER STATEMENT & DAILY LEDGER HELPERS
// ============================================================================

export interface DailyLedgerSummaryItem {
  dateKey: string;
  dateObj: Date;
  formattedDate: string;
  firstOrders: number;
  orderCount: number;
  firstOrderAmount: number;
  totalPayments: number;
  dayOpeningBalance: number;
  lastAmount: number;
  entries: any[];
}

export interface OverallDailyMetrics {
  totalDays: number;
  totalFirstOrders: number;
  totalPaymentsRec: number;
  latestLastAmount: number;
}

function isDateOnlyVal(d?: Date | null): boolean {
  if (!d || isNaN(d.getTime())) return true;
  return (
    (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) ||
    (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) ||
    (d.getHours() === 5 && d.getMinutes() === 30 && d.getSeconds() === 0 && d.getMilliseconds() === 0)
  );
}

function resolveOrderTimestamp(order: any): Date {
  const rawOrdered = order.orderedDate ? normalizeDateValue(order.orderedDate) : null;
  const rawCreated = order.createdAt ? normalizeDateValue(order.createdAt) : null;
  const rawDate = order.date ? normalizeDateValue(order.date) : null;

  if (rawOrdered && !isDateOnlyVal(rawOrdered)) return rawOrdered;
  if (rawOrdered) {
    const timeSource =
      rawCreated && !isDateOnlyVal(rawCreated)
        ? rawCreated
        : rawDate && !isDateOnlyVal(rawDate)
          ? rawDate
          : null;
    if (timeSource) {
      const merged = new Date(rawOrdered);
      merged.setHours(
        timeSource.getHours(),
        timeSource.getMinutes(),
        timeSource.getSeconds(),
        timeSource.getMilliseconds()
      );
      return merged;
    }
    return rawOrdered;
  }
  if (rawCreated) return rawCreated;
  if (rawDate) return rawDate;
  return new Date();
}

function resolvePaymentTimestamp(payment: any): Date {
  const rawPayDate = payment.paymentDate ? normalizeDateValue(payment.paymentDate) : null;
  const rawDate = payment.date ? normalizeDateValue(payment.date) : null;
  const rawCreated = payment.createdAt ? normalizeDateValue(payment.createdAt) : null;
  const targetDate = rawPayDate || rawDate;

  if (targetDate && !isDateOnlyVal(targetDate)) return targetDate;
  if (targetDate) {
    const timeSource = rawCreated && !isDateOnlyVal(rawCreated) ? rawCreated : null;
    if (timeSource) {
      const merged = new Date(targetDate);
      merged.setHours(
        timeSource.getHours(),
        timeSource.getMinutes(),
        timeSource.getSeconds(),
        timeSource.getMilliseconds()
      );
      return merged;
    }
    return targetDate;
  }
  if (rawCreated) return rawCreated;
  return new Date();
}

export function computeCustomerLedgerEntries(params: {
  customer: Customer | null | undefined;
  customerOrders: Order[];
  customerPayments: PaymentRecord[];
  partners: DeliveryPartner[];
}): any[] {
  const { customer, customerOrders, customerPayments, partners } = params;
  if (!customer) return [];

  const entries: any[] = [];
  const partnerMap = new Map((partners || []).map((p) => [p.id, p.name]));

  (customerOrders || []).forEach((order: any) => {
    const isCancelled = order.status === "cancelled";
    const orderDateObj = resolveOrderTimestamp(order);
    let deliveryDateObj = null;
    if (order.deliveryDate) {
      deliveryDateObj = normalizeDateValue(order.deliveryDate);
    } else if (order.status === "completed") {
      deliveryDateObj = normalizeDateValue(order.updatedAt || order.createdAt);
    }

    const deliveryPartnerName = order.deliveryPartnerId
      ? partnerMap.get(order.deliveryPartnerId) || null
      : null;

    let itemDescription = "";
    if (order.items && order.items.length > 0) {
      itemDescription = order.items
        .map((itm: any) => `${itm.itemName} (${itm.quantity} qty)`)
        .join(", ");
    } else {
      itemDescription = order.itemName ? `${order.itemName} (${order.quantity} qty)` : "Invoice Created";
    }

    const orderPaid = roundCurrency(order.paidAmount || 0);
    const orderTotal = roundCurrency(order.total || 0);
    const orderExcess = roundCurrency(Math.max(0, orderPaid - orderTotal));
    const orderUnpaid =
      order.balanceDue !== undefined
        ? roundCurrency(order.balanceDue)
        : roundCurrency(Math.max(0, orderTotal - orderPaid));
    const balChange = isCancelled
      ? 0
      : orderExcess > 0
        ? roundCurrency(-orderExcess)
        : orderUnpaid;

    entries.push({
      id: order.id,
      date: orderDateObj,
      orderDate: orderDateObj,
      deliveryDate: deliveryDateObj,
      type: "order",
      description: isCancelled ? `[CANCELLED] ${itemDescription}` : itemDescription,
      notes: order.notes !== undefined ? order.notes : order.description || "",
      orderAmount: orderTotal,
      paymentReceived: orderPaid,
      balanceChange: balChange,
      advanceAmount:
        orderExcess > 0 ? orderExcess : roundCurrency(order.advanceAmount || 0),
      deliveryPartnerName,
      original: order,
      isCancelled,
    });

    const wasCompletedBeforeCancel = !!order.completedAt || (order.deliveredQuantity || 0) > 0;
    if (isCancelled && wasCompletedBeforeCancel) {
      const cancelDateObj = order.updatedAt
        ? normalizeDateValue(order.updatedAt)
        : new Date(orderDateObj.getTime() + 1000);

      entries.push({
        id: `${order.id}-cancellation`,
        date: cancelDateObj,
        orderDate: cancelDateObj,
        deliveryDate: null,
        type: "cancellation",
        description: `🚫 Cancelled Reversal: ${itemDescription}`,
        orderAmount: 0,
        paymentReceived: 0,
        balanceChange: roundCurrency(-(order.balanceDue || 0)),
        deliveryPartnerName: null,
        original: order,
        isCancelled: true,
      });
    }
  });

  (customerPayments || []).forEach((payment: any) => {
    const isOrderPayment =
      !!payment.orderId ||
      (payment.notes &&
        (payment.notes.toLowerCase().includes("order payment") ||
          payment.notes.toLowerCase().includes("payment for order") ||
          payment.notes.toLowerCase().includes("order #")));
    if (isOrderPayment) return;

    const payDate = resolvePaymentTimestamp(payment);
    const amtRec = roundCurrency(
      payment.amountReceived !== undefined ? payment.amountReceived : payment.amount || 0
    );
    const discAmt = roundCurrency(payment.discountAmount || 0);
    const totalBalanceReduction = roundCurrency(amtRec + discAmt);

    const isRefund =
      payment.type === "advance_refund" || (payment.refundAmount && payment.refundAmount > 0);
    if (isRefund) {
      const refAmt = roundCurrency(
        payment.refundAmount || Math.abs(payment.amountReceived || 0)
      );
      entries.push({
        id: payment.id,
        date: payDate,
        orderDate: payDate,
        deliveryDate: null,
        type: "refund",
        description: payment.notes
          ? `Refund: ${payment.notes}`
          : `Advance Refund (${payment.paymentMethod || "Cash"})`,
        notes: payment.notes || "",
        orderAmount: 0,
        paymentReceived: roundCurrency(-refAmt),
        refundAmount: refAmt,
        discountAmount: 0,
        balanceChange: refAmt,
        original: payment,
      });
      return;
    }

    let desc = `Payment: ${payment.paymentMethod || "Cash"}`;
    if (discAmt > 0) {
      if (amtRec > 0) {
        desc = `Payment: ${payment.paymentMethod || "Cash"} (Disc: ₹${discAmt.toLocaleString("en-IN")})`;
      } else {
        desc = `Balance Discount: ₹${discAmt.toLocaleString("en-IN")}`;
      }
    }

    entries.push({
      id: payment.id,
      date: payDate,
      orderDate: payDate,
      deliveryDate: null,
      type: "payment",
      description: desc,
      notes: payment.notes || "",
      orderAmount: 0,
      paymentReceived: amtRec,
      discountAmount: discAmt,
      balanceChange: roundCurrency(-totalBalanceReduction),
      original: payment,
    });
  });

  entries.sort((a, b) => {
    const timeA = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
    const timeB = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
    const diff = timeA - timeB;
    if (diff !== 0) return diff;
    if (a.type === "order" && b.type === "payment") return -1;
    if (a.type === "payment" && b.type === "order") return 1;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  const sumChanges = roundCurrency(
    entries.reduce((sum: number, entry: any) => sum + Number(entry.balanceChange || 0), 0)
  );
  const customerPending = roundCurrency(
    customer.totalPending !== undefined ? customer.totalPending : customer.balance || 0
  );
  const hasStoredOpening = customer.openingBalance !== undefined && customer.openingBalance !== null;
  const openingBalance = hasStoredOpening
    ? roundCurrency(customer.openingBalance)
    : roundCurrency(customerPending - sumChanges);

  let runningBalance = openingBalance;
  const ledger = entries.map((entry) => {
    runningBalance = roundCurrency(runningBalance + Number(entry.balanceChange || 0));
    return {
      ...entry,
      runningBalance,
    };
  });

  if (Math.abs(openingBalance) > 0.001) {
    const openingDate = customer.createdAt
      ? normalizeDateValue(customer.createdAt)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    ledger.unshift({
      id: "opening-bal",
      date: openingDate,
      orderDate: openingDate,
      deliveryDate: null,
      type: "opening",
      description: openingBalance < 0 ? "Opening Advance Balance" : "Opening Balance",
      orderAmount: openingBalance > 0 ? openingBalance : 0,
      paymentReceived: openingBalance < 0 ? Math.abs(openingBalance) : 0,
      balanceChange: openingBalance,
      runningBalance: openingBalance,
    });
  }

  return ledger;
}

export function computeDailyLedgerSummary(ledgerEntries: any[]): DailyLedgerSummaryItem[] {
  if (!ledgerEntries || ledgerEntries.length === 0) return [];

  const dayMap = new Map<string, DailyLedgerSummaryItem>();

  ledgerEntries.forEach((entry: any) => {
    if (!entry.date) return;
    const d = entry.date instanceof Date ? entry.date : new Date(entry.date);
    if (isNaN(d.getTime())) return;

    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const formattedDate = d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    if (!dayMap.has(dateKey)) {
      const prevBal =
        entry.type === "opening"
          ? roundCurrency(entry.runningBalance)
          : roundCurrency(Number(entry.runningBalance || 0) - Number(entry.balanceChange || 0));
      dayMap.set(dateKey, {
        dateKey,
        dateObj: d,
        formattedDate,
        firstOrders: 0,
        orderCount: 0,
        firstOrderAmount: 0,
        totalPayments: 0,
        dayOpeningBalance: prevBal,
        lastAmount: roundCurrency(entry.runningBalance),
        entries: [],
      });
    }

    const dayGroup = dayMap.get(dateKey)!;
    dayGroup.entries.push(entry);
    dayGroup.lastAmount = roundCurrency(entry.runningBalance);

    if (entry.type === "order" && !entry.isCancelled) {
      if (dayGroup.orderCount === 0) {
        dayGroup.firstOrderAmount = roundCurrency(entry.orderAmount || 0);
      }
      dayGroup.firstOrders = roundCurrency(dayGroup.firstOrders + Number(entry.orderAmount || 0));
      dayGroup.orderCount += 1;
      dayGroup.totalPayments = roundCurrency(
        dayGroup.totalPayments + Number(entry.paymentReceived || 0)
      );
    } else if (entry.type === "payment") {
      dayGroup.totalPayments = roundCurrency(
        dayGroup.totalPayments +
          Number(entry.paymentReceived || 0) +
          Number(entry.discountAmount || 0)
      );
    }
  });

  return Array.from(dayMap.values());
}

export function computeOverallDailyMetrics(params: {
  displayDailySummary: DailyLedgerSummaryItem[];
  ledgerSortOrder: "asc" | "desc";
  customer?: Customer | null;
}): OverallDailyMetrics {
  const { displayDailySummary, ledgerSortOrder, customer } = params;
  const totalDays = displayDailySummary.length;
  const totalFirstOrders = roundCurrency(
    displayDailySummary.reduce((sum, d) => sum + d.firstOrders, 0)
  );
  const totalPaymentsRec = roundCurrency(
    displayDailySummary.reduce((sum, d) => sum + d.totalPayments, 0)
  );
  const latestLastAmount =
    displayDailySummary.length > 0
      ? roundCurrency(
          ledgerSortOrder === "desc"
            ? displayDailySummary[0].lastAmount
            : displayDailySummary[displayDailySummary.length - 1].lastAmount
        )
      : roundCurrency(
          customer?.totalPending !== undefined ? customer.totalPending : customer?.balance || 0
        );

  return {
    totalDays,
    totalFirstOrders,
    totalPaymentsRec,
    latestLastAmount,
  };
}

// ============================================================================
// EXPENSE BALANCES & FINANCIAL MAP HELPERS
// ============================================================================

export interface WorkerFinancialSummary {
  totalEarned: number;
  totalPaid: number;
  pending: number;
  isAdvance: boolean;
  effectiveAdvance: number;
}

export interface DeliveryFinancialSummary {
  totalEarned: number;
  totalPaid: number;
  productOrderDue: number;
  pending: number;
  isAdvance: boolean;
  effectiveAdvance: number;
}

export function computeWorkerFinancialsMap(params: {
  workers: Worker[];
  workerAttendance: WorkerAttendance[];
  orders: Order[];
  workerPayments: WorkerPayment[];
}): Map<string, WorkerFinancialSummary> {
  const { workers, workerAttendance, orders, workerPayments } = params;
  const map = new Map<string, WorkerFinancialSummary>();

  (workers || []).forEach((worker) => {
    const workerAtts = (workerAttendance || []).filter(
      (a) => String(a.workerId) === String(worker.id) && a.status !== "absent"
    );
    const totalAttendanceWages = roundCurrency(
      workerAtts.reduce((sum, att) => {
        let wage = 0;
        if (worker.billingSystem === "Piece-Rate") {
          wage = Number(att.piecesProduced || 0) * Number(worker.pieceRate || 0);
        } else {
          const dailyWage = Number(worker.dailyWage || 0);
          const otHours = Number(att.overtimeHours || 0);
          const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);
          if (att.status === "present") {
            wage = dailyWage;
          } else if (att.status === "half-day") {
            wage = dailyWage / 2;
          }
          wage += otHours * overtimeRate;
        }
        return roundCurrency(sum + wage);
      }, 0)
    );

    const totalLoadingWages = roundCurrency(
      (orders || [])
        .filter((o) => String(o.loadingWorkerId) === String(worker.id))
        .reduce((sum, o) => sum + Number(o.loadingCharge || 0), 0)
    );

    const totalUnloadingWages = roundCurrency(
      (orders || [])
        .filter((o) => String(o.unloadingWorkerId) === String(worker.id))
        .reduce((sum, o) => sum + Number(o.unloadingCharge || 0), 0)
    );

    const totalEarned = roundCurrency(totalAttendanceWages + totalLoadingWages + totalUnloadingWages);

    const totalPaid = roundCurrency(
      (workerPayments || [])
        .filter((p) => String(p.workerId) === String(worker.id))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    );

    const pending = roundCurrency(totalEarned - totalPaid);
    const storedAdvance = roundCurrency(worker.advanceAmount || 0);
    const effectiveAdvance = pending < 0 ? roundCurrency(Math.abs(pending)) : storedAdvance;
    const isAdvance = pending < 0 || (pending === 0 && storedAdvance > 0);

    map.set(worker.id, {
      totalEarned,
      totalPaid,
      pending,
      isAdvance,
      effectiveAdvance,
    });
  });

  return map;
}

export function computeDeliveryFinancialsMap(params: {
  deliveryPartners: DeliveryPartner[];
  deliveryTrips: DeliveryTrip[];
  deliveryPayments: DeliveryPayment[];
  orders: Order[];
}): Map<string, DeliveryFinancialSummary> {
  const { deliveryPartners, deliveryTrips, deliveryPayments, orders } = params;
  const map = new Map<string, DeliveryFinancialSummary>();

  (deliveryPartners || []).forEach((partner) => {
    const pId = String(partner.id);
    const tripsForPartner = (deliveryTrips || []).filter((t) => String(t.partnerId) === pId);
    const tripEarnings = roundCurrency(
      tripsForPartner.reduce((sum, t) => {
        const load = Number(t.loadingCharge || 0);
        const unload = Number(t.unloadingCharge || 0);
        let base = 0;
        if (t.baseDeliveryCharge !== undefined && t.baseDeliveryCharge !== null) {
          base = Number(t.baseDeliveryCharge);
        } else if (t.deliveryCharge !== undefined && t.deliveryCharge !== null) {
          const rawDelCharge = Number(t.deliveryCharge || 0);
          base = rawDelCharge >= load + unload ? rawDelCharge - load - unload : rawDelCharge;
        }
        const total =
          t.deliveryCharge !== undefined && Number(t.deliveryCharge) > 0
            ? Math.max(Number(t.deliveryCharge), base + load + unload)
            : base + load + unload;
        return sum + total;
      }, 0)
    );

    const totalEarned = tripEarnings;
    let grossDisbursed = 0;
    let grossRepaid = 0;
    (deliveryPayments || [])
      .filter((p) => String(p.partnerId) === pId)
      .forEach((p) => {
        const rawAmt = Number(p.amount || 0);
        const isRepay = p.isRepayment || rawAmt < 0;
        const absAmt = Math.abs(rawAmt);
        if (isRepay) grossRepaid = roundCurrency(grossRepaid + absAmt);
        else grossDisbursed = roundCurrency(grossDisbursed + absAmt);
      });
    const totalPaid = roundCurrency(grossDisbursed - grossRepaid);

    const productOrders = (orders || []).filter(
      (o) =>
        String(o.customerId) === pId ||
        String(o.customerId) === `partner_${pId}` ||
        String(o.customerId) === `dp_${pId}`
    );
    const productOrderDue = roundCurrency(
      productOrders.reduce((sum, o) => {
        const balDue =
          o.balanceDue !== undefined && o.balanceDue !== null
            ? Number(o.balanceDue)
            : Math.max(0, Number(o.total || 0) - Number(o.paidAmount || 0));
        return sum + balDue;
      }, 0)
    );

    const pending = roundCurrency(totalEarned - totalPaid - productOrderDue);
    const isAdvance = pending < 0;
    const effectiveAdvance = isAdvance ? roundCurrency(Math.abs(pending)) : 0;

    map.set(partner.id, {
      totalEarned,
      totalPaid,
      productOrderDue,
      pending,
      isAdvance,
      effectiveAdvance,
    });
  });

  return map;
}

export function computeExpenseMetrics(expenses: Expense[]): {
  totalOutstandingBalance: number;
  totalExpenseAdvance: number;
} {
  let outstanding = 0;
  let advance = 0;
  (expenses || []).forEach((e) => {
    const remaining = roundCurrency(
      e.remainingAmount !== undefined
        ? Number(e.remainingAmount)
        : e.paymentMethod === "Balance"
          ? Number(e.amount || 0)
          : 0
    );
    if (remaining > 0) outstanding = roundCurrency(outstanding + remaining);
    else if (remaining < 0) advance = roundCurrency(advance + Math.abs(remaining));
  });
  return { totalOutstandingBalance: outstanding, totalExpenseAdvance: advance };
}

export function computeSupplierMetrics(suppliers: RawMaterialSupplier[]): {
  totalSupplierBalance: number;
  totalSupplierAdvance: number;
} {
  let outstanding = 0;
  let advance = 0;
  (suppliers || []).forEach((s) => {
    const bal = roundCurrency(s.balance || 0);
    if (bal > 0) outstanding = roundCurrency(outstanding + bal);
    else if (bal < 0) advance = roundCurrency(advance + Math.abs(bal));
  });
  return { totalSupplierBalance: outstanding, totalSupplierAdvance: advance };
}

export function computeWorkerBalanceMetrics(
  workers: Worker[],
  workerFinancialsMap: Map<string, WorkerFinancialSummary>
): { totalWorkerPending: number; totalWorkerAdvance: number } {
  let outstanding = 0;
  let advance = 0;
  (workers || []).forEach((w) => {
    if (w.status === "Active" || !w.status) {
      const fin = workerFinancialsMap.get(w.id);
      const pending = roundCurrency(
        fin
          ? fin.pending
          : w.totalPending !== undefined
            ? Number(w.totalPending)
            : Number(w.totalWages || 0) - Number(w.totalPaid || 0)
      );
      const storedAdvance = roundCurrency(w.advanceAmount || 0);

      if (pending > 0) outstanding = roundCurrency(outstanding + pending);
      else if (pending < 0) advance = roundCurrency(advance + Math.abs(pending));

      if (storedAdvance > 0 && pending >= 0) {
        advance = roundCurrency(advance + storedAdvance);
      }
    }
  });
  return { totalWorkerPending: outstanding, totalWorkerAdvance: advance };
}

export function computeDeliveryBalanceMetrics(
  deliveryPartners: DeliveryPartner[],
  deliveryFinancialsMap: Map<string, DeliveryFinancialSummary>
): { totalDeliveryPending: number; totalDeliveryAdvance: number } {
  let outstanding = 0;
  let advance = 0;
  (deliveryPartners || []).forEach((p) => {
    const fin = deliveryFinancialsMap.get(p.id);
    const pend = roundCurrency(fin ? fin.pending : Number(p.totalPending || 0));
    if (pend > 0) outstanding = roundCurrency(outstanding + pend);
    else if (pend < 0) advance = roundCurrency(advance + Math.abs(pend));
  });
  return { totalDeliveryPending: outstanding, totalDeliveryAdvance: advance };
}

// ============================================================================
// RECEIVED PAYMENTS HELPERS
// ============================================================================

export function buildIncomingPaymentsList(
  payments: PaymentRecord[],
  orders: Order[]
): any[] {
  const list: any[] = [];

  if (payments && Array.isArray(payments)) {
    payments.forEach((p: any) => {
      const isRefund = p.type === "advance_refund" || (p.refundAmount && p.refundAmount > 0);
      const amt = roundCurrency(
        isRefund
          ? p.refundAmount || Math.abs(p.amountReceived || 0)
          : p.amountReceived || p.amount || 0
      );

      if (amt === 0 && !isRefund && !p.discountAmount) return;

      let date = p.createdAt;
      if (!(date instanceof Date)) {
        if (date && typeof date === "object" && typeof date.toDate === "function") {
          date = date.toDate();
        } else if (date) {
          date = new Date(date);
        } else {
          date = new Date();
        }
      }

      const isAdvanceCredit = Number(p.advanceAmount || 0) > 0 || Number(p.pendingAfter || 0) < 0;

      list.push({
        id: p.id,
        customerId: p.customerId || null,
        customerName: p.customerName || "Unknown Customer",
        amountReceived: amt,
        discountAmount: roundCurrency(p.discountAmount || 0),
        paymentMethod: p.paymentMethod || p.paymentMode || p.paymentType || "Cash",
        createdAt: date,
        collectorId: p.collectorId || null,
        collectorName: p.collectorName || null,
        notes: p.notes || "",
        orderId: p.orderId || null,
        pendingBefore: p.pendingBefore,
        pendingAfter: p.pendingAfter,
        advanceAmount: roundCurrency(p.advanceAmount || 0),
        isRefund,
        isAdvanceCredit,
        sourceType: isRefund
          ? "advance_refund"
          : p.orderId
            ? "order_receipt"
            : isAdvanceCredit
              ? "advance_credit"
              : "direct_receipt",
        sourceLabel: isRefund
          ? "Advance Refund"
          : p.orderId
            ? "Order Payment"
            : isAdvanceCredit
              ? "Advance Credit"
              : "Direct Receipt",
        isDirectPayment: true,
        original: p,
      });
    });
  }

  const loggedOrderPaymentTotals: Record<string, number> = {};
  list.forEach((p) => {
    if (p.orderId) {
      loggedOrderPaymentTotals[p.orderId] = roundCurrency(
        (loggedOrderPaymentTotals[p.orderId] || 0) + p.amountReceived
      );
    }
  });

  if (orders && Array.isArray(orders)) {
    orders.forEach((ord: any) => {
      if (ord.isCancelled || ord.status === "cancelled") return;
      const totalPaidOnOrder = roundCurrency(ord.paidAmount || 0);
      if (totalPaidOnOrder <= 0) return;

      const loggedAmt = loggedOrderPaymentTotals[ord.id] || 0;
      const unloggedAmt = roundCurrency(totalPaidOnOrder - loggedAmt);

      if (unloggedAmt > 0) {
        let orderDate = ord.createdAt || ord.orderedDate;
        if (!(orderDate instanceof Date)) {
          if (orderDate && typeof orderDate === "object" && typeof orderDate.toDate === "function") {
            orderDate = orderDate.toDate();
          } else if (orderDate) {
            orderDate = new Date(orderDate);
          } else {
            orderDate = new Date();
          }
        }

        const orderNum = (ord.id || "").slice(-6).toUpperCase();
        const itemText = ord.itemName ? ` (${ord.itemName})` : "";
        const notesText = `Advance/Payment for Order #${orderNum}${itemText}`;
        const isAdv = Number(ord.advanceAmount || ord.excessAdvance || 0) > 0;

        list.push({
          id: `order-pay-${ord.id}`,
          customerId: ord.customerId || null,
          customerName: ord.customerName || "Unknown Customer",
          amountReceived: unloggedAmt,
          discountAmount: roundCurrency(ord.discountAmount || 0),
          paymentMethod: ord.paymentMethod || ord.paymentMode || ord.paymentType || "Cash",
          createdAt: orderDate,
          collectorId: ord.collectorId || null,
          collectorName: ord.collectorName || null,
          notes: notesText,
          orderId: ord.id,
          advanceAmount: roundCurrency(ord.advanceAmount || ord.excessAdvance || 0),
          isRefund: false,
          isAdvanceCredit: isAdv,
          sourceType: isAdv ? "advance_credit" : "order_payment",
          sourceLabel: "Order Payment",
          isDirectPayment: false,
          original: ord,
        });
      }
    });
  }

  return list;
}

export function computeReceivedPaymentsMetrics(
  filteredPayments: any[],
  allIncomingPayments: any[]
) {
  let receivedSum = 0;
  let refundSum = 0;
  let advanceCreditSum = 0;

  (filteredPayments || []).forEach((p: any) => {
    if (p.isRefund) {
      refundSum = roundCurrency(refundSum + Number(p.amountReceived || 0));
    } else {
      receivedSum = roundCurrency(receivedSum + Number(p.amountReceived || 0));
      if (p.isAdvanceCredit) {
        advanceCreditSum = roundCurrency(advanceCreditSum + Number(p.advanceAmount || 0));
      }
    }
  });

  const todayStr = new Date().toDateString();
  const todayReceived = roundCurrency(
    (allIncomingPayments || [])
      .filter((p: any) => {
        if (p.isRefund) return false;
        const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
        return d.toDateString() === todayStr;
      })
      .reduce((sum: number, p: any) => sum + Number(p.amountReceived || 0), 0)
  );

  const now = new Date();
  const monthReceived = roundCurrency(
    (allIncomingPayments || [])
      .filter((p: any) => {
        if (p.isRefund) return false;
        const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum: number, p: any) => sum + Number(p.amountReceived || 0), 0)
  );

  return {
    totalReceived: receivedSum,
    totalRefunds: refundSum,
    netCollected: roundCurrency(receivedSum - refundSum),
    todayReceived,
    monthReceived,
    advanceCreditSum,
  };
}

export function computePaymentMethodBreakdown(filteredPayments: any[]) {
  const map: Record<string, { total: number; count: number }> = {};
  let nonRefundTotal = 0;

  (filteredPayments || []).forEach((p: any) => {
    if (p.isRefund) return;
    const method = p.paymentMethod || "Cash";
    if (!map[method]) map[method] = { total: 0, count: 0 };
    const amt = roundCurrency(p.amountReceived || 0);
    map[method].total = roundCurrency(map[method].total + amt);
    map[method].count += 1;
    nonRefundTotal = roundCurrency(nonRefundTotal + amt);
  });

  return { map, nonRefundTotal };
}

// ============================================================================
// INVENTORY SUMMARY HELPERS
// ============================================================================

export function computeInventorySummary(items: InventoryItem[]) {
  const finishedProducts = (items || []).filter((item) => item.itemType !== "raw_material");

  let totalValuation = 0;
  let totalCostValuation = 0;
  let activeCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  finishedProducts.forEach((item) => {
    const currentStock = Number(item.openingStock !== undefined ? item.openingStock : item.stock || 0);
    const rate = Number(item.sellingRate !== undefined ? item.sellingRate : item.sellingPrice || 0);
    const cost = Number(item.costPrice || 0);

    totalValuation = roundCurrency(totalValuation + currentStock * rate);
    totalCostValuation = roundCurrency(totalCostValuation + currentStock * cost);

    if ((item.status || "Active") === "Active") activeCount++;
    if (currentStock > 0 && currentStock <= 5) lowStockCount++;
    if (currentStock === 0) outOfStockCount++;
  });

  const totalProfit = roundCurrency(totalValuation - totalCostValuation);
  const profitPct = totalValuation > 0 ? ((totalProfit / totalValuation) * 100).toFixed(1) : "0.0";

  return {
    finishedProducts,
    totalValuation,
    totalCostValuation,
    totalProfit,
    profitPct,
    activeCount,
    lowStockCount,
    outOfStockCount,
  };
}

