import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useDeferredInit } from "../../hooks/useDeferredInit";
import { db, normalizeDateValue } from "../../src/config/firebase";
import type { DateInput } from "../../src/types/models";
import { roundCurrency } from "../../utils/currency";
import { ExpenseContext } from "./ExpenseContext";
import { ItemContext } from "./ItemContext";
import { OrderContext } from "./OrderContext";

export interface ProfitTransaction {
  id: string;
  orderId: string;
  customerId?: string;
  itemId?: string;
  sellingPrice: number;
  costPrice: number;
  quantity: number;
  grossProfit: number;
  deliveryCost: number;
  netProfit: number;
  createdAt: Date;
  [key: string]: unknown;
}

export interface ProfitSummaryDoc {
  id: string;
  date: Date;
  totalSales: number;
  totalExpenses: number;
  totalDeliveryCost: number;
  grossProfit: number;
  netProfit: number;
  [key: string]: unknown;
}

export interface PeriodProfitMetric {
  sales: number;
  expenses: number;
  delivery: number;
  gross: number;
  net: number;
}

export interface DashboardProfitMetrics {
  today: PeriodProfitMetric;
  weekly: PeriodProfitMetric;
  monthly: PeriodProfitMetric;
  yearly: PeriodProfitMetric;
  allTime: PeriodProfitMetric;
}

export interface ProfitContextType {
  transactions: ProfitTransaction[];
  summaries: ProfitSummaryDoc[];
  loading: boolean;
  syncing: boolean;
  dashboardMetrics: DashboardProfitMetrics;
  forceRecalculate: () => Promise<void>;
}

const EMPTY_METRIC: PeriodProfitMetric = {
  sales: 0,
  expenses: 0,
  delivery: 0,
  gross: 0,
  net: 0,
};

export const ProfitContext = createContext<ProfitContextType>({
  transactions: [],
  summaries: [],
  loading: true,
  syncing: false,
  dashboardMetrics: {
    today: { ...EMPTY_METRIC },
    weekly: { ...EMPTY_METRIC },
    monthly: { ...EMPTY_METRIC },
    yearly: { ...EMPTY_METRIC },
    allTime: { ...EMPTY_METRIC },
  },
  forceRecalculate: async () => {},
});

// Helper to convert date value to YYYY-MM-DD string locally
function formatDateKey(date: DateInput): string {
  if (!date) return "";
  const d = date instanceof Date ? date : normalizeDateValue(date);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function ProfitProvider({ children }: { children: ReactNode }) {
  const { orders, loading: loadingOrders } = useContext(OrderContext) as any;
  const { expenses, loading: loadingExpenses } = useContext(ExpenseContext) as any;
  const { items, loading: loadingItems } = useContext(ItemContext);

  const finishedProducts = useMemo(() => {
    return items ? items.filter((i) => i.itemType !== "raw_material") : [];
  }, [items]);

  const [dbTransactions, setDbTransactions] = useState<ProfitTransaction[]>([]);
  const [dbSummaries, setDbSummaries] = useState<ProfitSummaryDoc[]>([]);
  const [loadingTxs, setLoadingTxs] = useState<boolean>(true);
  const [loadingSummaries, setLoadingSummaries] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);

  // Defer Firestore listeners to reduce startup load
  const _deferReady = useDeferredInit();

  // 1. Listen to profitTransactions from Firestore
  useEffect(() => {
    if (!_deferReady) {
      setLoadingTxs(false);
      return;
    }
    setLoadingTxs(true);
    const txRef = collection(db, "profitTransactions");
    const q = query(txRef, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docObj) => {
          const raw = docObj.data();
          return {
            id: docObj.id,
            ...raw,
            createdAt: raw.createdAt?.toDate ? raw.createdAt.toDate() : new Date(),
          } as ProfitTransaction;
        });
        setDbTransactions(data);
        setLoadingTxs(false);
      },
      () => {
        setLoadingTxs(false);
      },
    );
    return () => unsubscribe();
  }, [_deferReady]);

  // 2. Listen to profitSummary from Firestore
  useEffect(() => {
    if (!_deferReady) {
      setLoadingSummaries(false);
      return;
    }
    setLoadingSummaries(true);
    const summaryRef = collection(db, "profitSummary");
    const q = query(summaryRef, orderBy("date", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docObj) => {
          const raw = docObj.data();
          return {
            id: docObj.id,
            ...raw,
            date: raw.date?.toDate ? raw.date.toDate() : new Date(),
          } as ProfitSummaryDoc;
        });
        setDbSummaries(data);
        setLoadingSummaries(false);
      },
      () => {
        setLoadingSummaries(false);
      },
    );
    return () => unsubscribe();
  }, [_deferReady]);

  // 3. Background synchronization logic
  // Triggered whenever orders, expenses, items, or DB transactions are loaded/updated.
  useEffect(() => {
    if (
      loadingOrders ||
      loadingExpenses ||
      loadingItems ||
      loadingTxs ||
      loadingSummaries ||
      syncing
    ) {
      return;
    }

    const runSync = async () => {
      setSyncing(true);
      try {
        const ordersList: any[] = orders || [];
        const expensesList: any[] = expenses || [];

        const completedOrders = ordersList.filter((o) => o.status === "completed");
        const activeOrderIds = new Set(ordersList.map((o) => o.id));
        const completedOrderIds = new Set(completedOrders.map((o) => o.id));

        // ────────────────────────────────────────────────────────
        // STEP A: Delete orphan or cancelled order transactions
        // ────────────────────────────────────────────────────────
        const txsToDelete = dbTransactions.filter(
          (tx) => !activeOrderIds.has(tx.orderId) || !completedOrderIds.has(tx.orderId),
        );

        if (txsToDelete.length > 0) {
          const batch = writeBatch(db);
          txsToDelete.forEach((tx) => {
            batch.delete(doc(db, "profitTransactions", tx.id));
          });
          await batch.commit();
        }

        // ────────────────────────────────────────────────────────
        // STEP B: Generate or update completed order transactions
        // ────────────────────────────────────────────────────────
        for (const order of completedOrders) {
          const existingTxs = dbTransactions.filter((tx) => tx.orderId === order.id);
          const orderItems: any[] = order.items || [];
          const expectedTxs: Array<{
            orderId: string;
            customerId: string;
            itemId: string;
            sellingPrice: number;
            costPrice: number;
            quantity: number;
            grossProfit: number;
            deliveryCost: number;
            netProfit: number;
          }> = [];

          if (orderItems.length > 0) {
            orderItems.forEach((itm) => {
              const matchedItem = finishedProducts.find((i) => i.id === itm.itemId);
              const costPrice = Number(matchedItem ? matchedItem.costPrice || 0 : 0);
              const sellingPrice = Number(itm.rate || 0);
              const quantity = Number(itm.quantity || 0);
              const grossProfit = roundCurrency((sellingPrice - costPrice) * quantity);

              const itemGrossTotal = quantity * sellingPrice;
              const orderGrossTotal = Number(order.grossTotal || order.total || 1);
              const deliveryCost = roundCurrency(
                (itemGrossTotal / orderGrossTotal) * Number(order.shipmentCharge || 0),
              );
              const netProfit = roundCurrency(grossProfit - deliveryCost);

              expectedTxs.push({
                orderId: order.id,
                customerId: order.customerId || "anonymous",
                itemId: itm.itemId || "unknown",
                sellingPrice,
                costPrice,
                quantity,
                grossProfit,
                deliveryCost,
                netProfit,
              });
            });
          } else {
            // Fallback for single-item order structures
            const matchedItem = finishedProducts.find((i) => i.id === order.itemId);
            const costPrice = Number(matchedItem ? matchedItem.costPrice || 0 : 0);
            const sellingPrice = Number(order.rate || 0);
            const quantity = Number(order.quantity || 0);
            const grossProfit = roundCurrency((sellingPrice - costPrice) * quantity);
            const deliveryCost = roundCurrency(Number(order.shipmentCharge || 0));
            const netProfit = roundCurrency(grossProfit - deliveryCost);

            expectedTxs.push({
              orderId: order.id,
              customerId: order.customerId || "anonymous",
              itemId: order.itemId || "unknown",
              sellingPrice,
              costPrice,
              quantity,
              grossProfit,
              deliveryCost,
              netProfit,
            });
          }

          // Check if we need to write/update transactions
          let needsUpdate = existingTxs.length !== expectedTxs.length;
          if (!needsUpdate) {
            for (const exp of expectedTxs) {
              const ext = existingTxs.find((t) => t.itemId === exp.itemId);
              if (
                !ext ||
                ext.quantity !== exp.quantity ||
                ext.sellingPrice !== exp.sellingPrice ||
                ext.costPrice !== exp.costPrice ||
                Math.abs(ext.deliveryCost - exp.deliveryCost) > 0.01
              ) {
                needsUpdate = true;
                break;
              }
            }
          }

          if (needsUpdate) {
            const batch = writeBatch(db);
            // Recreate all transactions for this order
            existingTxs.forEach((tx) => {
              batch.delete(doc(db, "profitTransactions", tx.id));
            });
            expectedTxs.forEach((tx) => {
              const newRef = doc(collection(db, "profitTransactions"));
              batch.set(newRef, {
                ...tx,
                createdAt: order.createdAt || new Date(),
              });
            });
            await batch.commit();
          }
        }

        // ────────────────────────────────────────────────────────
        // STEP C: Roll up and aggregate daily summaries
        // ────────────────────────────────────────────────────────
        const dailyData: Record<
          string,
          {
            sales: number;
            expenses: number;
            delivery: number;
            gross: number;
            dateObj: Date;
          }
        > = {};

        // Aggregate from dbTransactions (current Firestore records)
        dbTransactions.forEach((tx) => {
          // If transaction is slated for deletion above, skip it
          if (txsToDelete.some((del) => del.id === tx.id)) return;

          const dateStr = formatDateKey(tx.createdAt);
          if (!dateStr) return;

          if (!dailyData[dateStr]) {
            dailyData[dateStr] = {
              sales: 0,
              expenses: 0,
              delivery: 0,
              gross: 0,
              dateObj:
                tx.createdAt instanceof Date ? tx.createdAt : normalizeDateValue(tx.createdAt),
            };
          }
          dailyData[dateStr].sales += tx.sellingPrice * tx.quantity;
          dailyData[dateStr].delivery += tx.deliveryCost;
          dailyData[dateStr].gross += tx.grossProfit;
        });

        // Integrate Expenses
        expensesList.forEach((exp) => {
          const dateStr = formatDateKey(exp.expenseDate);
          if (!dateStr) return;

          if (!dailyData[dateStr]) {
            dailyData[dateStr] = {
              sales: 0,
              expenses: 0,
              delivery: 0,
              gross: 0,
              dateObj:
                exp.expenseDate instanceof Date
                  ? exp.expenseDate
                  : normalizeDateValue(exp.expenseDate),
            };
          }
          dailyData[dateStr].expenses += Number(exp.totalAmount || exp.amount || 0);
        });

        // Write summaries to Firestore if they have changed or are missing
        const batch = writeBatch(db);
        let summaryNeedsCommit = false;

        Object.keys(dailyData).forEach((dateStr) => {
          const day = dailyData[dateStr];
          const grossProfit = roundCurrency(day.gross);
          const totalSales = roundCurrency(day.sales);
          const totalExpenses = roundCurrency(day.expenses);
          const totalDeliveryCost = roundCurrency(day.delivery);
          const netProfit = roundCurrency(grossProfit - totalExpenses - totalDeliveryCost);

          const existingSum = dbSummaries.find((s) => s.id === dateStr);

          const isDiff =
            !existingSum ||
            Math.abs(existingSum.totalSales - totalSales) > 0.1 ||
            Math.abs(existingSum.totalExpenses - totalExpenses) > 0.1 ||
            Math.abs(existingSum.totalDeliveryCost - totalDeliveryCost) > 0.1 ||
            Math.abs(existingSum.grossProfit - grossProfit) > 0.1 ||
            Math.abs(existingSum.netProfit - netProfit) > 0.1;

          if (isDiff) {
            summaryNeedsCommit = true;
            const summaryDocRef = doc(db, "profitSummary", dateStr);
            batch.set(summaryDocRef, {
              date: Timestamp.fromDate(day.dateObj),
              totalSales,
              totalExpenses,
              totalDeliveryCost,
              grossProfit,
              netProfit,
            });
          }
        });

        // Also clean up summary documents for days that have no orders and no expenses anymore
        for (const sum of dbSummaries) {
          if (!dailyData[sum.id]) {
            summaryNeedsCommit = true;
            batch.delete(doc(db, "profitSummary", sum.id));
          }
        }

        if (summaryNeedsCommit) {
          await batch.commit();
        }
      } catch {
        // Sync errors will retry on next snapshot change
      } finally {
        setSyncing(false);
      }
    };

    const timer = setTimeout(() => {
      runSync();
    }, 2500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    orders,
    expenses,
    finishedProducts,
    dbTransactions,
    dbSummaries,
    loadingOrders,
    loadingExpenses,
    loadingItems,
    loadingTxs,
    loadingSummaries,
  ]);

  // 4. Force manual recalculation (for Pull-to-refresh)
  const forceRecalculate = useCallback(async () => {
    setDbTransactions((prev) => [...prev]);
    setDbSummaries((prev) => [...prev]);
  }, []);

  // 5. Dashboard Metrics Computation
  const dashboardMetrics = useMemo<DashboardProfitMetrics>(() => {
    const now = new Date();
    const todayStr = formatDateKey(now);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const metrics: DashboardProfitMetrics = {
      today: { sales: 0, expenses: 0, delivery: 0, gross: 0, net: 0 },
      weekly: { sales: 0, expenses: 0, delivery: 0, gross: 0, net: 0 },
      monthly: { sales: 0, expenses: 0, delivery: 0, gross: 0, net: 0 },
      yearly: { sales: 0, expenses: 0, delivery: 0, gross: 0, net: 0 },
      allTime: { sales: 0, expenses: 0, delivery: 0, gross: 0, net: 0 },
    };

    // Calculate sales & gross profit & delivery from transactions
    dbTransactions.forEach((tx) => {
      const txDate = tx.createdAt;
      const salesVal = tx.sellingPrice * tx.quantity;
      const grossVal = tx.grossProfit;
      const deliveryVal = tx.deliveryCost;

      const isToday = formatDateKey(txDate) === todayStr;
      const isThisWeek = txDate >= startOfWeek;
      const isThisMonth = txDate >= startOfMonth;
      const isThisYear = txDate >= startOfYear;

      // Sales
      if (isToday) metrics.today.sales += salesVal;
      if (isThisWeek) metrics.weekly.sales += salesVal;
      if (isThisMonth) metrics.monthly.sales += salesVal;
      if (isThisYear) metrics.yearly.sales += salesVal;
      metrics.allTime.sales += salesVal;

      // Delivery
      if (isToday) metrics.today.delivery += deliveryVal;
      if (isThisWeek) metrics.weekly.delivery += deliveryVal;
      if (isThisMonth) metrics.monthly.delivery += deliveryVal;
      if (isThisYear) metrics.yearly.delivery += deliveryVal;
      metrics.allTime.delivery += deliveryVal;

      // Gross
      if (isToday) metrics.today.gross += grossVal;
      if (isThisWeek) metrics.weekly.gross += grossVal;
      if (isThisMonth) metrics.monthly.gross += grossVal;
      if (isThisYear) metrics.yearly.gross += grossVal;
      metrics.allTime.gross += grossVal;
    });

    // Calculate expenses
    ((expenses as any[]) || []).forEach((exp) => {
      const expDate =
        exp.expenseDate instanceof Date ? exp.expenseDate : normalizeDateValue(exp.expenseDate);
      const expVal = Number(exp.totalAmount || exp.amount || 0);

      const isToday = formatDateKey(expDate) === todayStr;
      const isThisWeek = expDate >= startOfWeek;
      const isThisMonth = expDate >= startOfMonth;
      const isThisYear = expDate >= startOfYear;

      if (isToday) metrics.today.expenses += expVal;
      if (isThisWeek) metrics.weekly.expenses += expVal;
      if (isThisMonth) metrics.monthly.expenses += expVal;
      if (isThisYear) metrics.yearly.expenses += expVal;
      metrics.allTime.expenses += expVal;
    });

    // Compute Net Profit = Gross Profit - Expenses - Delivery Cost
    const periods = ["today", "weekly", "monthly", "yearly", "allTime"] as const;
    periods.forEach((p) => {
      metrics[p].sales = roundCurrency(metrics[p].sales);
      metrics[p].expenses = roundCurrency(metrics[p].expenses);
      metrics[p].delivery = roundCurrency(metrics[p].delivery);
      metrics[p].gross = roundCurrency(metrics[p].gross);
      metrics[p].net = roundCurrency(
        metrics[p].gross - metrics[p].expenses - metrics[p].delivery,
      );
    });

    return metrics;
  }, [dbTransactions, expenses]);

  const profitLoading =
    loadingTxs || loadingSummaries || loadingOrders || loadingExpenses || loadingItems;

  const contextValue = useMemo<ProfitContextType>(
    () => ({
      transactions: dbTransactions,
      summaries: dbSummaries,
      loading: profitLoading,
      syncing,
      dashboardMetrics,
      forceRecalculate,
    }),
    [
      dbTransactions,
      dbSummaries,
      profitLoading,
      syncing,
      dashboardMetrics,
      forceRecalculate,
    ],
  );

  return (
    <ProfitContext.Provider value={contextValue}>
      {children}
    </ProfitContext.Provider>
  );
}

export default function ProfitRoutePlaceholder() {
  return null;
}
