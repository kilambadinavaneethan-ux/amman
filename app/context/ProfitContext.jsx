import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { db } from "../../src/config/firebase";
import { OrderContext } from "./OrderContext";
import { ExpenseContext } from "./ExpenseContext";
import { ItemContext } from "./ItemContext";

export const ProfitContext = createContext(null);

export function ProfitProvider({ children }) {
  const { orders, loading: loadingOrders } = useContext(OrderContext);
  const { expenses, loading: loadingExpenses } = useContext(ExpenseContext);
  const { items, loading: loadingItems } = useContext(ItemContext);
  const finishedProducts = useMemo(() => {
    return items ? items.filter((i) => i.itemType !== "raw_material") : [];
  }, [items]);

  const [dbTransactions, setDbTransactions] = useState([]);
  const [dbSummaries, setDbSummaries] = useState([]);
  const [loadingTxs, setLoadingTxs] = useState(true);
  const [loadingSummaries, setLoadingSummaries] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // 1. Listen to profitTransactions from Firestore
  useEffect(() => {
    setLoadingTxs(true);
    const txRef = collection(db, "profitTransactions");
    const q = query(txRef, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docObj) => ({
          id: docObj.id,
          ...docObj.data(),
          createdAt: docObj.data().createdAt?.toDate ? docObj.data().createdAt.toDate() : new Date(),
        }));
        setDbTransactions(data);
        setLoadingTxs(false);
      },
      (error) => {
        setLoadingTxs(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Listen to profitSummary from Firestore
  useEffect(() => {
    setLoadingSummaries(true);
    const summaryRef = collection(db, "profitSummary");
    const q = query(summaryRef, orderBy("date", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docObj) => ({
          id: docObj.id,
          ...docObj.data(),
          date: docObj.data().date?.toDate ? docObj.data().date.toDate() : new Date(),
        }));
        setDbSummaries(data);
        setLoadingSummaries(false);
      },
      (error) => {
        setLoadingSummaries(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Helper to convert date object to YYYY-MM-DD string locally
  const formatDateKey = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  // 3. Background synchronization logic
  // Triggered whenever orders, expenses, items, or DB transactions are loaded/updated.
  useEffect(() => {
    if (loadingOrders || loadingExpenses || loadingItems || loadingTxs || loadingSummaries || syncing) {
      return;
    }

    const runSync = async () => {
      setSyncing(true);
      try {
        const completedOrders = orders.filter((o) => o.status === "completed");
        const activeOrderIds = new Set(orders.map((o) => o.id));
        const completedOrderIds = new Set(completedOrders.map((o) => o.id));

        // ────────────────────────────────────────────────────────
        // STEP A: Delete orphan or cancelled order transactions
        // ────────────────────────────────────────────────────────
        const txsToDelete = dbTransactions.filter(
          (tx) => !activeOrderIds.has(tx.orderId) || !completedOrderIds.has(tx.orderId)
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
          const orderItems = order.items || [];
          const expectedTxs = [];

          if (orderItems.length > 0) {
            orderItems.forEach((itm) => {
              const matchedItem = finishedProducts.find((i) => i.id === itm.itemId);
              const costPrice = Number(matchedItem ? matchedItem.costPrice : 0);
              const sellingPrice = Number(itm.rate || 0);
              const quantity = Number(itm.quantity || 0);
              const grossProfit = (sellingPrice - costPrice) * quantity;

              const itemGrossTotal = quantity * sellingPrice;
              const orderGrossTotal = Number(order.grossTotal || order.total || 1);
              const deliveryCost = (itemGrossTotal / orderGrossTotal) * Number(order.shipmentCharge || 0);
              const netProfit = grossProfit - deliveryCost;

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
            const costPrice = Number(matchedItem ? matchedItem.costPrice : 0);
            const sellingPrice = Number(order.rate || 0);
            const quantity = Number(order.quantity || 0);
            const grossProfit = (sellingPrice - costPrice) * quantity;
            const deliveryCost = Number(order.shipmentCharge || 0);
            const netProfit = grossProfit - deliveryCost;

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
        // Compute daily totals locally from expected/current synced states
        const dailyData = {};

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
              dateObj: tx.createdAt,
            };
          }
          dailyData[dateStr].sales += (tx.sellingPrice * tx.quantity);
          dailyData[dateStr].delivery += tx.deliveryCost;
          dailyData[dateStr].gross += tx.grossProfit;
        });

        // Integrate Expenses
        expenses.forEach((exp) => {
          const dateStr = formatDateKey(exp.expenseDate);
          if (!dateStr) return;

          if (!dailyData[dateStr]) {
            dailyData[dateStr] = {
              sales: 0,
              expenses: 0,
              delivery: 0,
              gross: 0,
              dateObj: exp.expenseDate,
            };
          }
          dailyData[dateStr].expenses += Number(exp.totalAmount || exp.amount || 0);
        });

        // Write summaries to Firestore if they have changed or are missing
        const batch = writeBatch(db);
        let summaryNeedsCommit = false;

        Object.keys(dailyData).forEach((dateStr) => {
          const day = dailyData[dateStr];
          const grossProfit = day.gross;
          const netProfit = grossProfit - day.expenses - day.delivery;

          const existingSum = dbSummaries.find((s) => s.id === dateStr);

          const isDiff =
            !existingSum ||
            Math.abs(existingSum.totalSales - day.sales) > 0.1 ||
            Math.abs(existingSum.totalExpenses - day.expenses) > 0.1 ||
            Math.abs(existingSum.totalDeliveryCost - day.delivery) > 0.1 ||
            Math.abs(existingSum.grossProfit - grossProfit) > 0.1 ||
            Math.abs(existingSum.netProfit - netProfit) > 0.1;

          if (isDiff) {
            summaryNeedsCommit = true;
            const summaryDocRef = doc(db, "profitSummary", dateStr);
            batch.set(summaryDocRef, {
              date: Timestamp.fromDate(day.dateObj),
              totalSales: Number(day.sales),
              totalExpenses: Number(day.expenses),
              totalDeliveryCost: Number(day.delivery),
              grossProfit: Number(grossProfit),
              netProfit: Number(netProfit),
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
      } catch (err) {
      } finally {
        setSyncing(false);
      }
    };

    const timer = setTimeout(() => {
      runSync();
    }, 2500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, expenses, finishedProducts, dbTransactions, dbSummaries, loadingOrders, loadingExpenses, loadingItems, loadingTxs, loadingSummaries]);

  // 4. Force manual recalculation (for Pull-to-refresh)
  const forceRecalculate = async () => {
    // Simply sets loaded state to trigger effect
    setDbTransactions([...dbTransactions]);
    setDbSummaries([...dbSummaries]);
  };

  // 5. Dashboard Metrics Computation
  // Computes relative metrics for Today, Week, Month, Year
  const dashboardMetrics = useMemo(() => {
    const now = new Date();
    const todayStr = formatDateKey(now);

    // Helper for start of week (last Sunday)
    const getStartOfWeek = () => {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day;
      return new Date(d.setDate(diff));
    };

    const startOfWeek = getStartOfWeek();
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const metrics = {
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
    expenses.forEach((exp) => {
      const expDate = exp.expenseDate;
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
    const periods = ["today", "weekly", "monthly", "yearly", "allTime"];
    periods.forEach((p) => {
      metrics[p].net = metrics[p].gross - metrics[p].expenses - metrics[p].delivery;
    });

    return metrics;
  }, [dbTransactions, expenses]);

  return (
    <ProfitContext.Provider
      value={{
        transactions: dbTransactions,
        summaries: dbSummaries,
        loading: loadingTxs || loadingSummaries || loadingOrders || loadingExpenses || loadingItems,
        syncing,
        dashboardMetrics,
        forceRecalculate,
      }}
    >
      {children}
    </ProfitContext.Provider>
  );
}

export default function ProfitRoutePlaceholder() {
  return null;
}