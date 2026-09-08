import React, { useState, useMemo, useContext, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { ProfitContext } from "../context/ProfitContext";
import { CustomerContext } from "../context/CustomerContext";
import { ItemContext } from "../context/ItemContext";
import { OrderContext } from "../context/OrderContext";
import { ExpenseContext } from "../context/ExpenseContext";
import { DeliveryPartnerContext } from "../context/DeliveryPartnerContext";
import { WorkerContext } from "../context/WorkerContext";
import { PaymentContext } from "../context/PaymentContext";
import { db, normalizeDateValue } from "../../src/config/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import ProtectedRoute from "../components/ProtectedRoute";
import BackButton from "../components/BackButton";

function ProfitManagementScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();

  // Core contexts
  const { forceRecalculate } = useContext(ProfitContext);
  const { orders, loading: loadingOrders } = useContext(OrderContext);
  const { expenses, loading: loadingExpenses } = useContext(ExpenseContext);
  const { items, loading: loadingItems } = useContext(ItemContext);

  const finishedProducts = useMemo(() => {
    return items ? items.filter((i) => i.itemType !== "raw_material") : [];
  }, [items]);
  const { customers, loading: loadingCustomers } = useContext(CustomerContext);
  const { partners, loading: loadingPartners } = useContext(DeliveryPartnerContext);
  const { workers, loading: loadingWorkers } = useContext(WorkerContext);
  const { payments: customerPayments, loading: loadingCustPayments } = useContext(PaymentContext);

  // Local subscriptions for analytics history
  const [deliveryTrips, setDeliveryTrips] = useState([]);
  const [deliveryPayments, setDeliveryPayments] = useState([]);
  const [workerAttendance, setWorkerAttendance] = useState([]);
  const [workerPayments, setWorkerPayments] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [loadingDelPayments, setLoadingDelPayments] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [loadingWorkerPayments, setLoadingWorkerPayments] = useState(true);

  // Navigation and Filter state
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "customers" | "items" | "delivery" | "workers" | "expenses" | "timeline" | "reports"
  const [dashboardPeriod, setDashboardPeriod] = useState("monthly"); // "today" | "weekly" | "monthly" | "yearly" | "allTime" | "custom"
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Custom date range input state
  const [startDateStr, setStartDateStr] = useState(""); // YYYY-MM-DD
  const [endDateStr, setEndDateStr] = useState(""); // YYYY-MM-DD

  // Details Modal states
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [selectedOverviewMetric, setSelectedOverviewMetric] = useState(null);
  const [activeReportTab, setActiveReportTab] = useState("customerProfit");

  // Subscribe to deliveryTrips
  useEffect(() => {
    setLoadingTrips(true);
    const tripsCol = collection(db, "deliveryTrips");
    const q = query(tripsCol, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }));
        setDeliveryTrips(data);
        setLoadingTrips(false);
      },
      (err) => {
        setLoadingTrips(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to deliveryPayments
  useEffect(() => {
    setLoadingDelPayments(true);
    const paymentsCol = collection(db, "deliveryPayments");
    const q = query(paymentsCol, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }));
        setDeliveryPayments(data);
        setLoadingDelPayments(false);
      },
      (err) => {
        setLoadingDelPayments(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to workerAttendance
  useEffect(() => {
    setLoadingAttendance(true);
    const attCol = collection(db, "workerAttendance");
    const q = query(attCol, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }));
        setWorkerAttendance(data);
        setLoadingAttendance(false);
      },
      (err) => {
        setLoadingAttendance(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to workerPayments
  useEffect(() => {
    setLoadingWorkerPayments(true);
    const pmtsCol = collection(db, "workerPayments");
    const q = query(pmtsCol, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }));
        setWorkerPayments(data);
        setLoadingWorkerPayments(false);
      },
      (err) => {
        setLoadingWorkerPayments(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await forceRecalculate();
    setRefreshing(false);
  };

  // Format date helper
  const formatDateKey = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  // Format currency Indian Rupees (₹)
  const formatAmount = (num) => {
    const val = Number(num || 0);
    return `₹${val.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  // Dynamic Date Filter logic
  const filterByDate = (itemsList, dateField) => {
    if (dashboardPeriod === "allTime") return itemsList;

    const now = new Date();
    let start = new Date();

    if (dashboardPeriod === "today") {
      start.setHours(0, 0, 0, 0);
    } else if (dashboardPeriod === "weekly") {
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (dashboardPeriod === "monthly") {
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    } else if (dashboardPeriod === "yearly") {
      start.setDate(now.getDate() - 365);
      start.setHours(0, 0, 0, 0);
    } else if (dashboardPeriod === "custom") {
      const s = startDateStr ? new Date(startDateStr) : new Date(0);
      const e = endDateStr ? new Date(endDateStr) : new Date();
      e.setHours(23, 59, 59, 999);
      return itemsList.filter((item) => {
        const d = item[dateField] ? new Date(item[dateField]) : null;
        return d && d >= s && d <= e;
      });
    }

    return itemsList.filter((item) => {
      const d = item[dateField] ? new Date(item[dateField]) : null;
      return d && d >= start && d <= now;
    });
  };

  // Apply Date Filter presets
  const applyDatePreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDateStr(formatDateKey(start));
    setEndDateStr(formatDateKey(end));
    setDashboardPeriod("custom");
  };

  // Core computations based on current date range selection
  const analyticsData = useMemo(() => {
    // 1. Filter raw collections by selected date range
    const filteredOrders = filterByDate(orders, "createdAt");
    const filteredExpenses = filterByDate(expenses, "expenseDate");
    const filteredCustPayments = filterByDate(customerPayments, "createdAt");
    const filteredTrips = filterByDate(deliveryTrips, "createdAt");
    const filteredDelPayments = filterByDate(deliveryPayments, "createdAt");
    const filteredAttendance = filterByDate(workerAttendance, "createdAt");
    const filteredWorkerPayments = filterByDate(workerPayments, "createdAt");

    // 2. Calculations
    const completedOrders = filteredOrders.filter((o) => o.status === "completed");

    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalDeliveryCost = 0;
    let pendingReceivables = 0;
    let totalPaidOnOrders = 0;

    completedOrders.forEach((order) => {
      totalRevenue += Number(order.total || 0);
      totalDeliveryCost += Number(order.shipmentCharge || 0);
      pendingReceivables += Number(order.balanceDue || 0);
      totalPaidOnOrders += Number(order.paidAmount || 0);

      // COGS Calculation
      const orderItems = order.items || [];
      if (orderItems.length > 0) {
        orderItems.forEach((itm) => {
          const matchedItem = finishedProducts.find((i) => i.id === itm.itemId);
          const unitCost = Number(matchedItem ? matchedItem.costPrice : 0);
          totalCOGS += (unitCost * Number(itm.quantity || 0));
        });
      } else {
        const matchedItem = finishedProducts.find((i) => i.id === order.itemId);
        const unitCost = Number(matchedItem ? matchedItem.costPrice : 0);
        totalCOGS += (unitCost * Number(order.quantity || 0));
      }
    });

    const grossProfit = totalRevenue - totalCOGS;
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.totalAmount || e.amount || 0), 0);
    const netProfit = grossProfit - totalExpenses - totalDeliveryCost;

    // Receivables and Payables (system-wide active totals)
    const pendingCustomerPaymentsSum = customers.reduce((sum, c) => sum + Number(c.totalPending || c.balance || 0), 0);
    const pendingPartnerPaymentsSum = partners.reduce((sum, p) => sum + Number(p.totalPending || 0), 0);
    const periodDeliveryFreightSum = filteredTrips.reduce((sum, t) => sum + Number(t.deliveryCharge || 0), 0);
    const periodDelPaymentsSum = filteredDelPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // Business Health Metrics
    const profitMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const expenseRatioPct = totalRevenue > 0 ? ((totalExpenses + totalDeliveryCost) / totalRevenue) * 100 : 0;

    const totalCustPaymentsReceived = filteredCustPayments.reduce((sum, p) => sum + Number(p.amountReceived || p.amount || 0), 0);
    const customerCollectionPct = (totalPaidOnOrders + totalCustPaymentsReceived) > 0
      ? ((totalPaidOnOrders + totalCustPaymentsReceived) / (totalRevenue + totalCustPaymentsReceived)) * 100
      : 0;

    const deliveryCostPct = totalRevenue > 0 ? (totalDeliveryCost / totalRevenue) * 100 : 0;

    return {
      ordersCount: filteredOrders.length,
      revenue: totalRevenue,
      grossProfit,
      expenses: totalExpenses,
      netProfit,
      deliveryCost: totalDeliveryCost,
      pendingCustomerPayments: pendingCustomerPaymentsSum,
      pendingPartnerPayments: pendingPartnerPaymentsSum,
      periodDeliveryFreight: periodDeliveryFreightSum,
      periodDelPayments: periodDelPaymentsSum,
      profitMarginPct,
      expenseRatioPct,
      customerCollectionPct,
      deliveryCostPct,
      pendingReceivables,
      // Pass filtered subsets for lists
      completedOrders,
      filteredOrders,
      filteredExpenses,
      filteredCustPayments,
      filteredTrips,
      filteredDelPayments,
      filteredAttendance,
      filteredWorkerPayments,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, expenses, customerPayments, deliveryTrips, deliveryPayments, workerAttendance, workerPayments, finishedProducts, customers, partners, dashboardPeriod, startDateStr, endDateStr]);

  // Search filter predicate
  const matchesSearch = (text) => {
    if (!searchQuery) return true;
    return (text || "").toLowerCase().includes(searchQuery.toLowerCase());
  };

  // Detail Modals calculations
  const customerDetailData = useMemo(() => {
    if (!selectedCustomer) return null;
    const cId = selectedCustomer.id;

    // Filter customer transactions
    const cOrders = orders.filter((o) => o.customerId === cId);
    const cPayments = customerPayments.filter((p) => p.customerId === cId);
    const cTrips = deliveryTrips.filter((t) => t.customerId === cId || orders.find((o) => o.id === t.orderId && o.customerId === cId));

    let sales = 0;
    let paid = 0;
    let profit = 0;

    cOrders.forEach((o) => {
      if (o.status === "completed") {
        sales += Number(o.total || 0);
        paid += Number(o.paidAmount || 0);

        // Profit
        const orderItems = o.items || [];
        if (orderItems.length > 0) {
          orderItems.forEach((itm) => {
            const matchedItem = finishedProducts.find((i) => i.id === itm.itemId);
            const cost = Number(matchedItem ? matchedItem.costPrice : 0);
            profit += ((Number(itm.rate || 0) - cost) * Number(itm.quantity || 0));
          });
        } else {
          const matchedItem = finishedProducts.find((i) => i.id === o.itemId);
          const cost = Number(matchedItem ? matchedItem.costPrice : 0);
          profit += ((Number(o.rate || 0) - cost) * Number(o.quantity || 0));
        }
      }
    });

    // Add customer Payments receipts
    const receivedFromReceipts = cPayments.reduce((sum, p) => sum + Number(p.amountReceived || 0), 0);
    paid += receivedFromReceipts;

    return {
      ordersCount: cOrders.length,
      sales,
      paid,
      profit,
      balance: Number(selectedCustomer.totalPending || selectedCustomer.balance || 0),
      orders: cOrders,
      payments: cPayments,
      trips: cTrips,
    };
  }, [selectedCustomer, orders, customerPayments, deliveryTrips, finishedProducts]);

  const partnerDetailData = useMemo(() => {
    if (!selectedPartner) return null;
    const pId = selectedPartner.id;

    const pTrips = deliveryTrips.filter((t) => t.partnerId === pId);
    const pPayments = deliveryPayments.filter((p) => p.partnerId === pId || p.deliveryPartnerId === pId);

    return {
      trips: pTrips,
      payments: pPayments,
    };
  }, [selectedPartner, deliveryTrips, deliveryPayments]);

  const workerDetailData = useMemo(() => {
    if (!selectedWorker) return null;
    const wId = selectedWorker.id;

    const wAttendance = workerAttendance.filter((a) => a.workerId === wId);
    const wPayments = workerPayments.filter((p) => p.workerId === wId);

    return {
      attendance: wAttendance,
      payments: wPayments,
    };
  }, [selectedWorker, workerAttendance, workerPayments]);

  // Category breakdown calculations for Expenses tab
  const categoryExpensesBreakdown = useMemo(() => {
    const categories = {
      Electricity: { amount: 0, lastDate: null },
      Labour: { amount: 0, lastDate: null },
      Fuel: { amount: 0, lastDate: null },
      Machinery: { amount: 0, lastDate: null },
      Office: { amount: 0, lastDate: null },
      Transport: { amount: 0, lastDate: null },
      Other: { amount: 0, lastDate: null },
    };

    analyticsData.filteredExpenses.forEach((e) => {
      let cat = e.category || "Other";
      if (!categories[cat]) cat = "Other";

      const amt = Number(e.totalAmount || e.amount || 0);
      categories[cat].amount += amt;

      const date = e.expenseDate;
      if (date && (!categories[cat].lastDate || date > categories[cat].lastDate)) {
        categories[cat].lastDate = date;
      }
    });

    const total = Object.values(categories).reduce((sum, c) => sum + c.amount, 0);

    return Object.keys(categories).map((name) => {
      const cat = categories[name];
      const pct = total > 0 ? (cat.amount / total) * 100 : 0;
      return {
        name,
        amount: cat.amount,
        percentage: pct,
        lastDate: cat.lastDate,
      };
    });
  }, [analyticsData.filteredExpenses]);

  // Compile Customers list with margins
  const customerProfilesList = useMemo(() => {
    return customers
      .filter((c) => matchesSearch(c.name))
      .map((cust) => {
        const cOrders = orders.filter((o) => o.customerId === cust.id && o.status === "completed");
        const cSales = cOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

        let cProfit = 0;
        let lastDate = null;

        cOrders.forEach((o) => {
          const date = o.createdAt;
          if (date && (!lastDate || date > lastDate)) {
            lastDate = date;
          }

          const orderItems = o.items || [];
          if (orderItems.length > 0) {
            orderItems.forEach((itm) => {
              const matchedItem = finishedProducts.find((i) => i.id === itm.itemId);
              const cost = Number(matchedItem ? matchedItem.costPrice : 0);
              cProfit += ((Number(itm.rate || 0) - cost) * Number(itm.quantity || 0));
            });
          } else {
            const matchedItem = finishedProducts.find((i) => i.id === o.itemId);
            const cost = Number(matchedItem ? matchedItem.costPrice : 0);
            cProfit += ((Number(o.rate || 0) - cost) * Number(o.quantity || 0));
          }
        });

        const paid = Number(cust.totalPaid || 0);
        const pending = Number(cust.totalPending || cust.balance || 0);

        return {
          ...cust,
          ordersCount: cOrders.length,
          sales: cSales,
          paid,
          pending,
          profit: cProfit,
          lastOrderDate: lastDate,
        };
      })
      .sort((a, b) => b.profit - a.profit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, orders, finishedProducts, searchQuery]);

  // Compile Items list with margins
  const itemProfilesList = useMemo(() => {
    return finishedProducts
      .filter((item) => matchesSearch(item.itemName))
      .map((item) => {
        const itemTx = analyticsData.completedOrders.reduce((acc, order) => {
          const orderItems = order.items || [];
          if (orderItems.length > 0) {
            const matched = orderItems.filter((i) => i.itemId === item.id);
            matched.forEach((m) => {
              acc.qty += Number(m.quantity || 0);
              acc.sales += (Number(m.rate || 0) * Number(m.quantity || 0));
            });
          } else if (order.itemId === item.id) {
            acc.qty += Number(order.quantity || 0);
            acc.sales += (Number(order.rate || 0) * Number(order.quantity || 0));
          }
          return acc;
        }, { qty: 0, sales: 0 });

        const sellingRate = Number(item.sellingRate || item.sellingPrice || 0);
        const costRate = Number(item.costPrice || 0);
        const marginPerUnit = sellingRate - costRate;
        const totalProfit = itemTx.qty * marginPerUnit;
        const currentStock = Number(item.openingStock !== undefined ? item.openingStock : (item.stock || 0));

        return {
          ...item,
          quantitySold: itemTx.qty,
          sales: itemTx.sales,
          sellingRate,
          costRate,
          marginPerUnit,
          totalProfit,
          currentStock,
        };
      })
      .sort((a, b) => b.totalProfit - a.totalProfit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedProducts, analyticsData.completedOrders, searchQuery]);

  // Compile Delivery Partners list
  const partnerProfilesList = useMemo(() => {
    return partners
      .filter((p) => matchesSearch(p.name))
      .map((partner) => {
        const pAllTrips = deliveryTrips.filter((t) => t.partnerId === partner.id);
        const pPeriodTrips = analyticsData.filteredTrips.filter((t) => t.partnerId === partner.id);
        const periodFreight = pPeriodTrips.reduce((sum, t) => sum + Number(t.deliveryCharge || 0), 0);

        const pPeriodPayments = analyticsData.filteredDelPayments.filter(
          (p) => p.partnerId === partner.id || p.deliveryPartnerId === partner.id
        );
        const periodPaid = pPeriodPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

        const totalPaid = Number(partner.totalPaid || 0);
        const pending = Number(partner.totalPending || 0);
        const payable = Number(partner.totalPayable || 0);

        return {
          ...partner,
          totalDeliveriesCount: pAllTrips.length,
          periodDeliveriesCount: pPeriodTrips.length,
          periodFreight,
          periodPaid,
          payable,
          paid: totalPaid,
          pending,
        };
      })
      .sort((a, b) => b.pending - a.pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partners, deliveryTrips, analyticsData.filteredTrips, analyticsData.filteredDelPayments, searchQuery]);

  // Compile Workers list
  const workerProfilesList = useMemo(() => {
    return workers
      .filter((w) => matchesSearch(w.name))
      .map((worker) => {
        const wAttendance = workerAttendance.filter((a) => a.workerId === worker.id);
        const totalPresent = wAttendance.filter((a) => a.status === "present" || a.status === "half-day").length;
        const otHours = wAttendance.reduce((sum, a) => sum + Number(a.overtimeHours || 0), 0);
        const paid = Number(worker.totalPaid || 0);
        const pending = Number(worker.totalWages || 0) - Number(worker.totalPaid || 0);

        return {
          ...worker,
          attendanceCount: totalPresent,
          paid,
          pending,
          overtime: otHours,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers, workerAttendance, searchQuery]);

  // Daily Ledger rollout helper
  const dailyLedgerRollup = useMemo(() => {
    const days = {};

    analyticsData.completedOrders.forEach((o) => {
      const dateStr = formatDateKey(o.createdAt);
      if (!dateStr) return;

      if (!days[dateStr]) {
        days[dateStr] = { date: o.createdAt, orders: 0, revenue: 0, expenses: 0, delivery: 0, profit: 0, cogs: 0 };
      }

      days[dateStr].orders += 1;
      days[dateStr].revenue += Number(o.total || 0);
      days[dateStr].delivery += Number(o.shipmentCharge || 0);

      // COGS
      const orderItems = o.items || [];
      if (orderItems.length > 0) {
        orderItems.forEach((itm) => {
          const matchedItem = finishedProducts.find((i) => i.id === itm.itemId);
          const cost = Number(matchedItem ? matchedItem.costPrice : 0);
          days[dateStr].cogs += (cost * Number(itm.quantity || 0));
        });
      } else {
        const matchedItem = finishedProducts.find((i) => i.id === o.itemId);
        const cost = Number(matchedItem ? matchedItem.costPrice : 0);
        days[dateStr].cogs += (cost * Number(o.quantity || 0));
      }
    });

    analyticsData.filteredExpenses.forEach((exp) => {
      const dateStr = formatDateKey(exp.expenseDate);
      if (!dateStr) return;

      if (!days[dateStr]) {
        days[dateStr] = { date: exp.expenseDate, orders: 0, revenue: 0, expenses: 0, delivery: 0, profit: 0, cogs: 0 };
      }

      days[dateStr].expenses += Number(exp.totalAmount || exp.amount || 0);
    });

    return Object.keys(days)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => {
        const d = days[key];
        const gross = d.revenue - d.cogs;
        d.profit = gross - d.expenses - d.delivery;
        return d;
      });
  }, [analyticsData.completedOrders, analyticsData.filteredExpenses, finishedProducts]);

  // Monthly Ledger rollup helper
  const monthlyLedgerRollup = useMemo(() => {
    const months = {};

    analyticsData.completedOrders.forEach((o) => {
      const d = new Date(o.createdAt);
      const year = d.getFullYear();
      const monthIndex = d.getMonth();
      const monthLabel = d.toLocaleString("default", { month: "long", year: "numeric" });
      const sortKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

      if (!months[sortKey]) {
        months[sortKey] = { label: monthLabel, sales: 0, expenses: 0, gross: 0, net: 0, cogs: 0, delivery: 0 };
      }

      months[sortKey].sales += Number(o.total || 0);
      months[sortKey].delivery += Number(o.shipmentCharge || 0);

      // COGS
      const orderItems = o.items || [];
      if (orderItems.length > 0) {
        orderItems.forEach((itm) => {
          const matchedItem = finishedProducts.find((i) => i.id === itm.itemId);
          const cost = Number(matchedItem ? matchedItem.costPrice : 0);
          months[sortKey].cogs += (cost * Number(itm.quantity || 0));
        });
      } else {
        const matchedItem = finishedProducts.find((i) => i.id === o.itemId);
        const cost = Number(matchedItem ? matchedItem.costPrice : 0);
        months[sortKey].cogs += (cost * Number(o.quantity || 0));
      }
    });

    analyticsData.filteredExpenses.forEach((exp) => {
      const d = new Date(exp.expenseDate);
      const year = d.getFullYear();
      const monthIndex = d.getMonth();
      const monthLabel = d.toLocaleString("default", { month: "long", year: "numeric" });
      const sortKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

      if (!months[sortKey]) {
        months[sortKey] = { label: monthLabel, sales: 0, expenses: 0, gross: 0, net: 0, cogs: 0, delivery: 0 };
      }

      months[sortKey].expenses += Number(exp.totalAmount || exp.amount || 0);
    });

    return Object.keys(months)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => {
        const m = months[key];
        m.gross = m.sales - m.cogs;
        m.net = m.gross - m.expenses - m.delivery;
        return m;
      });
  }, [analyticsData.completedOrders, analyticsData.filteredExpenses, finishedProducts]);

  const handleExportPDF = (reportName) => {
    Alert.alert(
      "Future Export feature",
      `Generating report: "${reportName}"... Standalone PDF & Excel spreadsheet printing tools will be available in the upcoming software release.`
    );
  };

  const isDataLoading =
    loadingOrders ||
    loadingExpenses ||
    loadingItems ||
    loadingCustomers ||
    loadingPartners ||
    loadingWorkers ||
    loadingCustPayments ||
    loadingTrips ||
    loadingDelPayments ||
    loadingAttendance ||
    loadingWorkerPayments;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.accent.success]} />}
    >
      {/* Header section */}
      <View style={styles.header}>
        <BackButton label="Settings" onPress={() => router.push("/settings")} style={{ marginBottom: 12 }} />
        <View style={styles.headerTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Business Analytics</Text>
            <Text style={styles.subtitle}>Dynamic dashboards, collections margins & health KPIs</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.exportFloatButton, pressed && styles.pressedEffect]}
            onPress={() => handleExportPDF("Full Analytics Summary")}
          >
            <MaterialIcons name="share" size={20} color={colors.accent.success} />
          </Pressable>
        </View>
      </View>

      {/* Date Filters Component */}
      <View style={styles.filterCard}>
        <View style={styles.periodTabs}>
          {[
            { key: "today", label: "Today" },
            { key: "weekly", label: "Week" },
            { key: "monthly", label: "Month" },
            { key: "yearly", label: "Year" },
            { key: "allTime", label: "All-Time" },
            { key: "custom", label: "Custom" },
          ].map((item) => (
            <Pressable
              key={item.key}
              style={[styles.periodTabBtn, dashboardPeriod === item.key && styles.periodTabBtnActive]}
              onPress={() => setDashboardPeriod(item.key)}
            >
              <Text style={[styles.periodTabLabel, dashboardPeriod === item.key && styles.periodTabLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {dashboardPeriod === "custom" && (
          <View style={styles.customDateInputs}>
            <View style={styles.dateInputCol}>
              <Text style={styles.dateInputLabel}>From (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.dateInput}
                value={startDateStr}
                onChangeText={setStartDateStr}
                placeholder="2026-01-01"
                placeholderTextColor={colors.text.muted}
              />
            </View>
            <View style={styles.dateInputCol}>
              <Text style={styles.dateInputLabel}>To (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.dateInput}
                value={endDateStr}
                onChangeText={setEndDateStr}
                placeholder="2026-12-31"
                placeholderTextColor={colors.text.muted}
              />
            </View>
          </View>
        )}

        <View style={styles.presetsRow}>
          <Pressable style={styles.presetBtn} onPress={() => applyDatePreset(7)}>
            <Text style={styles.presetBtnText}>Last 7 Days</Text>
          </Pressable>
          <Pressable style={styles.presetBtn} onPress={() => applyDatePreset(30)}>
            <Text style={styles.presetBtnText}>Last 30 Days</Text>
          </Pressable>
          <Pressable
            style={styles.presetBtn}
            onPress={() => {
              setStartDateStr("");
              setEndDateStr("");
              setDashboardPeriod("monthly");
            }}
          >
            <Text style={[styles.presetBtnText, { color: colors.accent.danger }]}>Reset Filters</Text>
          </Pressable>
        </View>
      </View>

      {/* Global search component (Visible on profile tabs) */}
      {["customers", "items", "delivery", "workers"].includes(activeTab) && (
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color={colors.text.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${activeTab}...`}
            placeholderTextColor={colors.text.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialIcons name="close" size={20} color={colors.text.muted} />
            </Pressable>
          ) : null}
        </View>
      )}

      {/* Screen Navigation Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.navbarScroll}
      >
        {[
          { key: "overview", label: "Overview", icon: "dashboard" },
          { key: "customers", label: "Customers", icon: "person" },
          { key: "items", label: "Products", icon: "category" },
          { key: "delivery", label: "Shipping", icon: "local-shipping" },
          { key: "workers", label: "Workers", icon: "engineering" },
          { key: "expenses", label: "Expenses", icon: "receipt-long" },
          { key: "timeline", label: "Timeline", icon: "timeline" },
          { key: "reports", label: "Reports", icon: "assessment" },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.navbarBtn, isActive && styles.navbarBtnActive]}
              onPress={() => {
                setActiveTab(tab.key);
                setSearchQuery("");
              }}
            >
              <MaterialIcons
                name={tab.icon}
                size={18}
                color={isActive ? colors.text.inverse : colors.text.muted}
              />
              <Text style={[styles.navbarBtnText, isActive && styles.navbarBtnTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Main Content Area */}
      {isDataLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent.success} />
          <Text style={styles.loadingText}>Compiling dashboard data...</Text>
        </View>
      ) : (
        <View style={styles.dashboardBody}>
          {/* TAB 1: OVERVIEW DASHBOARD */}
          {activeTab === "overview" && (
            <Animated.View entering={FadeInDown.duration(300)}>
              {/* Summary Cards Grid */}
              <Text style={styles.sectionHeader}>Overview Dashboard</Text>
              <View style={styles.statsGrid}>
                {/* Total Revenue */}
                <Pressable style={styles.statCard} onPress={() => setSelectedOverviewMetric("revenue")}>
                  <View style={[styles.statIconWrap, { backgroundColor: `${colors.accent.primary}12` }]}>
                    <MaterialIcons name="monetization-on" size={20} color={colors.accent.primary} />
                  </View>
                  <Text style={styles.statLabel}>Total Sales</Text>
                  <Text style={[styles.statValue, { color: colors.text.primary }]}>
                    {formatAmount(analyticsData.revenue)}
                  </Text>
                </Pressable>

                {/* Total Profit */}
                <Pressable style={styles.statCard} onPress={() => setSelectedOverviewMetric("grossProfit")}>
                  <View style={[styles.statIconWrap, { backgroundColor: `${colors.accent.success}12` }]}>
                    <MaterialIcons name="trending-up" size={20} color={colors.accent.success} />
                  </View>
                  <Text style={styles.statLabel}>Gross Profit</Text>
                  <Text style={[styles.statValue, { color: colors.accent.success }]}>
                    {formatAmount(analyticsData.grossProfit)}
                  </Text>
                </Pressable>

                {/* Total Expenses */}
                <Pressable style={styles.statCard} onPress={() => setSelectedOverviewMetric("expenses")}>
                  <View style={[styles.statIconWrap, { backgroundColor: `${colors.accent.danger}12` }]}>
                    <MaterialIcons name="receipt-long" size={20} color={colors.accent.danger} />
                  </View>
                  <Text style={styles.statLabel}>Total Expenses</Text>
                  <Text style={[styles.statValue, { color: colors.accent.danger }]}>
                    {formatAmount(analyticsData.expenses)}
                  </Text>
                </Pressable>

                {/* Net Profit */}
                <Pressable style={[styles.statCard, { backgroundColor: colors.accent.success }]} onPress={() => setSelectedOverviewMetric("netProfit")}>
                  <View style={[styles.statIconWrap, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                    <MaterialIcons name="account-balance-wallet" size={20} color="#fff" />
                  </View>
                  <Text style={[styles.statLabel, { color: "#e6fffa" }]}>Net Return</Text>
                  <Text style={[styles.statValue, { color: "#fff" }]}>
                    {formatAmount(analyticsData.netProfit)}
                  </Text>
                </Pressable>

                {/* Pending Customer Payments */}
                <Pressable style={styles.statCard} onPress={() => setSelectedOverviewMetric("customerReceivables")}>
                  <View style={[styles.statIconWrap, { backgroundColor: `${colors.accent.warning}12` }]}>
                    <MaterialIcons name="people-outline" size={20} color={colors.accent.warning} />
                  </View>
                  <Text style={styles.statLabel}>Customer Receivables</Text>
                  <Text style={[styles.statValue, { color: colors.accent.warning }]}>
                    {formatAmount(analyticsData.pendingCustomerPayments)}
                  </Text>
                </Pressable>

                {/* Delivery Pending Payments */}
                <Pressable style={styles.statCard} onPress={() => setSelectedOverviewMetric("shippingPayables")}>
                  <View style={[styles.statIconWrap, { backgroundColor: `${colors.accent.warning}12` }]}>
                    <MaterialIcons name="local-shipping" size={20} color={colors.accent.warning} />
                  </View>
                  <Text style={styles.statLabel}>Shipping Payables</Text>
                  <Text style={[styles.statValue, { color: colors.text.secondary }]}>
                    {formatAmount(analyticsData.pendingPartnerPayments)}
                  </Text>
                </Pressable>

                {/* Total Customers */}
                <Pressable style={styles.statCard} onPress={() => setSelectedOverviewMetric("totalCustomers")}>
                  <View style={[styles.statIconWrap, { backgroundColor: `${colors.accent.primary}12` }]}>
                    <MaterialIcons name="groups" size={20} color={colors.accent.primary} />
                  </View>
                  <Text style={styles.statLabel}>Total Customers</Text>
                  <Text style={[styles.statValue, { color: colors.text.primary }]}>
                    {customers.length.toLocaleString()}
                  </Text>
                </Pressable>

                {/* Total Orders */}
                <Pressable style={styles.statCard} onPress={() => setSelectedOverviewMetric("totalOrders")}>
                  <View style={[styles.statIconWrap, { backgroundColor: `${colors.accent.success}12` }]}>
                    <MaterialIcons name="assignment" size={20} color={colors.accent.success} />
                  </View>
                  <Text style={styles.statLabel}>Total Orders</Text>
                  <Text style={[styles.statValue, { color: colors.text.secondary }]}>
                    {analyticsData.ordersCount.toLocaleString()}
                  </Text>
                </Pressable>
              </View>

              {/* Health Scorecard Dashboard */}
              <Text style={[styles.sectionHeader, { marginTop: spacing.lg }]}>Business Health Scorecard</Text>
              <View style={styles.healthCard}>
                <View style={styles.healthItem}>
                  <View style={styles.healthHeaderRow}>
                    <Text style={styles.healthLabel}>Profit Margin % (Net Return / Revenue)</Text>
                    <Text style={[styles.healthValText, { color: colors.accent.success }]}>
                      {analyticsData.profitMarginPct.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, Math.max(0, analyticsData.profitMarginPct))}%`,
                          backgroundColor: colors.accent.success,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.healthItem}>
                  <View style={styles.healthHeaderRow}>
                    <Text style={styles.healthLabel}>Operating Expense Ratio % (OpEx / Revenue)</Text>
                    <Text style={[styles.healthValText, { color: colors.accent.danger }]}>
                      {analyticsData.expenseRatioPct.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, Math.max(0, analyticsData.expenseRatioPct))}%`,
                          backgroundColor: colors.accent.danger,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.healthItem}>
                  <View style={styles.healthHeaderRow}>
                    <Text style={styles.healthLabel}>Customer Collection Rate % (Cash Collected / Sales)</Text>
                    <Text style={[styles.healthValText, { color: colors.accent.primary }]}>
                      {analyticsData.customerCollectionPct.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, Math.max(0, analyticsData.customerCollectionPct))}%`,
                          backgroundColor: colors.accent.primary,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.healthItem}>
                  <View style={styles.healthHeaderRow}>
                    <Text style={styles.healthLabel}>Direct Delivery Shipping Cost Ratio</Text>
                    <Text style={[styles.healthValText, { color: colors.accent.warning }]}>
                      {analyticsData.deliveryCostPct.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, Math.max(0, analyticsData.deliveryCostPct))}%`,
                          backgroundColor: colors.accent.warning,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={[styles.healthHeaderRow, { borderTopWidth: 1, borderTopColor: colors.border.subtle, paddingTop: spacing.md, marginTop: spacing.xs }]}>
                  <Text style={styles.healthLabel}>Active Period Pending Receivables</Text>
                  <Text style={[styles.healthValText, { fontSize: 16, color: colors.text.primary }]}>
                    {formatAmount(analyticsData.pendingReceivables)}
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* TAB 2: CUSTOMERS PROFIT LIST */}
          {activeTab === "customers" && (
            <Animated.View entering={FadeInDown.duration(300)}>
              {customerProfilesList.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="people" size={40} color={colors.text.muted} />
                  <Text style={styles.emptyTitle}>No matching customers found</Text>
                </View>
              ) : (
                <View style={styles.reportList}>
                  <Text style={styles.sectionHeader}>Customer Margins Ledger</Text>
                  {customerProfilesList.map((cust) => (
                    <Pressable
                      key={cust.id}
                      style={({ pressed }) => [styles.breakdownCard, pressed && styles.pressedEffect]}
                      onPress={() => setSelectedCustomer(cust)}
                    >
                      <View style={styles.bdMainRow}>
                        <View style={styles.bdMetaLeft}>
                          <MaterialIcons name="person" size={20} color={colors.text.secondary} />
                          <Text style={styles.bdName}>{cust.name}</Text>
                        </View>
                        <View style={[styles.profitBadge, cust.profit >= 0 ? styles.profitPositive : styles.profitNegative]}>
                          <Text style={[styles.profitBadgeText, cust.profit >= 0 ? styles.profitPositiveText : styles.profitNegativeText]}>
                            Margin: {formatAmount(cust.profit)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.bdMetricsRow}>
                        <Text style={styles.bdMetricsItem}>
                          Orders: <Text style={styles.bdMetricsValue}>{cust.ordersCount}</Text>
                        </Text>
                        <Text style={styles.bdMetricsItem}>
                          Sales: <Text style={styles.bdMetricsValue}>{formatAmount(cust.sales)}</Text>
                        </Text>
                        <Text style={styles.bdMetricsItem}>
                          Pending: <Text style={[styles.bdMetricsValue, { color: colors.accent.danger }]}>{formatAmount(cust.pending)}</Text>
                        </Text>
                      </View>
                      {cust.lastOrderDate && (
                        <Text style={styles.cardFooterText}>
                          Last Order: {cust.lastOrderDate.toLocaleDateString("en-IN")}
                        </Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
            </Animated.View>
          )}

          {/* TAB 3: ITEM PROFIT LIST */}
          {activeTab === "items" && (
            <Animated.View entering={FadeInDown.duration(300)}>
              {itemProfilesList.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="shopping-bag" size={40} color={colors.text.muted} />
                  <Text style={styles.emptyTitle}>No matching items found</Text>
                </View>
              ) : (
                <View style={styles.reportList}>
                  <Text style={styles.sectionHeader}>Product Sales & Margin Breakdowns</Text>
                  {itemProfilesList.map((item) => (
                    <View key={item.id} style={styles.breakdownCard}>
                      <View style={styles.bdMainRow}>
                        <View style={styles.bdMetaLeft}>
                          <MaterialIcons name="shopping-bag" size={20} color={colors.text.secondary} />
                          <Text style={styles.bdName}>{item.itemName}</Text>
                        </View>
                        <View style={styles.qtyBadge}>
                          <Text style={styles.qtyBadgeText}>Sold: {item.quantitySold}</Text>
                        </View>
                      </View>

                      <View style={styles.bdMetricsRow}>
                        <Text style={styles.bdMetricsItem}>
                          Sales: <Text style={styles.bdMetricsValue}>{formatAmount(item.sales)}</Text>
                        </Text>
                        <Text style={styles.bdMetricsItem}>
                          Cost / Unit: <Text style={styles.bdMetricsValue}>{formatAmount(item.costRate)}</Text>
                        </Text>
                        <Text style={styles.bdMetricsItem}>
                          Stock: <Text style={[styles.bdMetricsValue, { color: item.currentStock < 10 ? colors.accent.danger : colors.accent.success }]}>{item.currentStock}</Text>
                        </Text>
                      </View>

                      <View style={[styles.bdMetricsRow, { borderTopWidth: 0, paddingTop: 0 }]}>
                        <Text style={styles.bdMetricsItem}>
                          Margin/Unit: <Text style={[styles.bdMetricsValue, { color: colors.accent.success }]}>{formatAmount(item.marginPerUnit)}</Text>
                        </Text>
                        <Text style={styles.bdMetricsItem}>
                          Total Profit: <Text style={[styles.bdMetricsValue, { color: colors.accent.success, fontWeight: "800" }]}>{formatAmount(item.totalProfit)}</Text>
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          )}

          {/* TAB 4: DELIVERY PARTNER LIST */}
          {activeTab === "delivery" && (
            <Animated.View entering={FadeInDown.duration(300)}>
              {/* Shipping Payables Summary Header */}
              <View style={[styles.healthCard, { marginBottom: spacing.md }]}>
                <View style={styles.healthHeaderRow}>
                  <Text style={[styles.healthLabel, { fontSize: 13, fontWeight: "800", color: colors.text.primary }]}>
                    🚚 Shipping & Delivery Freight Summary
                  </Text>
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                    onPress={() => router.push("/settings/delivery-partners")}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.primary }}>Manage Partners</Text>
                    <MaterialIcons name="chevron-right" size={16} color={colors.accent.primary} />
                  </Pressable>
                </View>
                <View style={[styles.statsGrid, { marginTop: spacing.sm, marginBottom: 0 }]}>
                  <View style={[styles.statCard, { padding: spacing.sm }]}>
                    <Text style={styles.statLabel}>Active Shippers</Text>
                    <Text style={[styles.statValue, { fontSize: 16, color: colors.text.primary }]}>
                      {partners.filter(p => p.status === "Active").length} / {partners.length}
                    </Text>
                  </View>
                  <View style={[styles.statCard, { padding: spacing.sm }]}>
                    <Text style={styles.statLabel}>Period Trips</Text>
                    <Text style={[styles.statValue, { fontSize: 16, color: colors.text.primary }]}>
                      {analyticsData.filteredTrips.length}
                    </Text>
                  </View>
                  <View style={[styles.statCard, { padding: spacing.sm }]}>
                    <Text style={styles.statLabel}>Period Freight Charges</Text>
                    <Text style={[styles.statValue, { fontSize: 16, color: colors.accent.warning }]}>
                      {formatAmount(analyticsData.periodDeliveryFreight)}
                    </Text>
                  </View>
                  <View style={[styles.statCard, { padding: spacing.sm }]}>
                    <Text style={styles.statLabel}>Total Outstanding Payables</Text>
                    <Text style={[styles.statValue, { fontSize: 16, color: colors.accent.danger, fontWeight: "800" }]}>
                      {formatAmount(analyticsData.pendingPartnerPayments)}
                    </Text>
                  </View>
                </View>
              </View>

              {partnerProfilesList.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="local-shipping" size={40} color={colors.text.muted} />
                  <Text style={styles.emptyTitle}>No matching delivery partners found</Text>
                </View>
              ) : (
                <View style={styles.reportList}>
                  <Text style={styles.sectionHeader}>Delivery Partner Accounts</Text>
                  {partnerProfilesList.map((partner) => (
                    <Pressable
                      key={partner.id}
                      style={({ pressed }) => [styles.breakdownCard, pressed && styles.pressedEffect]}
                      onPress={() => setSelectedPartner(partner)}
                    >
                      <View style={styles.bdMainRow}>
                        <View style={styles.bdMetaLeft}>
                          <MaterialIcons name="local-shipping" size={20} color={colors.text.secondary} />
                          <Text style={styles.bdName}>{partner.name}</Text>
                        </View>
                        <View style={styles.qtyBadge}>
                          <Text style={styles.qtyBadgeText}>
                            Trips: {partner.periodDeliveriesCount} ({partner.totalDeliveriesCount} Total)
                          </Text>
                        </View>
                      </View>

                      <View style={styles.bdMetricsRow}>
                        <Text style={styles.bdMetricsItem}>
                          Earned: <Text style={styles.bdMetricsValue}>{formatAmount(partner.payable)}</Text>
                        </Text>
                        <Text style={styles.bdMetricsItem}>
                          Paid: <Text style={styles.bdMetricsValue}>{formatAmount(partner.paid)}</Text>
                        </Text>
                        <Text style={styles.bdMetricsItem}>
                          Payable Balance: <Text style={[styles.bdMetricsValue, { color: partner.pending > 0 ? colors.accent.danger : colors.accent.success, fontWeight: "800" }]}>
                            {formatAmount(partner.pending)}
                          </Text>
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
                        <Pressable
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 6,
                            backgroundColor: `${colors.accent.primary}15`,
                          }}
                          onPress={() => router.push({ pathname: "/settings/delivery-partners/details", params: { id: partner.id } })}
                        >
                          <MaterialIcons name="payment" size={14} color={colors.accent.primary} />
                          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary }}>Manage & Pay</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </Animated.View>
          )}

          {/* TAB 5: WORKER PROFILE LIST */}
          {activeTab === "workers" && (
            <Animated.View entering={FadeInDown.duration(300)}>
              {workerProfilesList.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="engineering" size={40} color={colors.text.muted} />
                  <Text style={styles.emptyTitle}>No matching workers found</Text>
                </View>
              ) : (
                <View style={styles.reportList}>
                  <Text style={styles.sectionHeader}>Worker Payroll & Wages</Text>
                  {workerProfilesList.map((worker) => (
                    <Pressable
                      key={worker.id}
                      style={({ pressed }) => [styles.breakdownCard, pressed && styles.pressedEffect]}
                      onPress={() => setSelectedWorker(worker)}
                    >
                      <View style={styles.bdMainRow}>
                        <View style={styles.bdMetaLeft}>
                          <MaterialIcons name="engineering" size={20} color={colors.text.secondary} />
                          <Text style={styles.bdName}>{worker.name}</Text>
                        </View>
                        <View style={styles.qtyBadge}>
                          <Text style={styles.qtyBadgeText}>Days: {worker.attendanceCount}</Text>
                        </View>
                      </View>

                      <View style={styles.bdMetricsRow}>
                        <Text style={styles.bdMetricsItem}>
                          Salary Paid: <Text style={styles.bdMetricsValue}>{formatAmount(worker.paid)}</Text>
                        </Text>
                        <Text style={styles.bdMetricsItem}>
                          Salary Pending: <Text style={[styles.bdMetricsValue, { color: colors.accent.danger }]}>{formatAmount(worker.pending)}</Text>
                        </Text>
                        {worker.overtime > 0 && (
                          <Text style={styles.bdMetricsItem}>
                            OT: <Text style={styles.bdMetricsValue}>{worker.overtime} Hrs</Text>
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </Animated.View>
          )}

          {/* TAB 6: EXPENSE BREAKDOWNS */}
          {activeTab === "expenses" && (
            <Animated.View entering={FadeInDown.duration(300)}>
              <Text style={styles.sectionHeader}>Expenses by Category</Text>
              <View style={styles.healthCard}>
                {categoryExpensesBreakdown.map((cat) => (
                  <View key={cat.name} style={styles.healthItem}>
                    <View style={styles.healthHeaderRow}>
                      <Text style={styles.healthLabel}>
                        {cat.name} ({cat.percentage.toFixed(0)}%)
                      </Text>
                      <Text style={[styles.healthValText, { color: colors.accent.danger }]}>
                        {formatAmount(cat.amount)}
                      </Text>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(100, Math.max(0, cat.percentage))}%`,
                            backgroundColor: colors.accent.danger,
                          },
                        ]}
                      />
                    </View>
                    {cat.lastDate && (
                      <Text style={[styles.cardFooterText, { marginTop: 4 }]}>
                        Last Expense: {new Date(cat.lastDate).toLocaleDateString("en-IN")}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* TAB 7: TIMELINE (DAILY & MONTHLY ROLLUPS) */}
          {activeTab === "timeline" && (
            <Animated.View entering={FadeInDown.duration(300)}>
              {/* Daily Ledger Timeline */}
              <Text style={styles.sectionHeader}>Daily Performance Ledger</Text>
              {dailyLedgerRollup.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="history" size={40} color={colors.text.muted} />
                  <Text style={styles.emptyTitle}>No daily data in range</Text>
                </View>
              ) : (
                <View style={[styles.reportList, { marginBottom: spacing.xl }]}>
                  {dailyLedgerRollup.map((day) => (
                    <View key={formatDateKey(day.date)} style={styles.summaryCard}>
                      <View style={styles.summaryHeader}>
                        <Text style={styles.summaryDate}>
                          {new Date(day.date).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </Text>
                        <View style={[styles.profitBadge, day.profit >= 0 ? styles.profitPositive : styles.profitNegative]}>
                          <Text style={[styles.profitBadgeText, day.profit >= 0 ? styles.profitPositiveText : styles.profitNegativeText]}>
                            {day.profit >= 0 ? "+" : ""}
                            {formatAmount(day.profit)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.summaryGrid}>
                        <View style={styles.gridItem}>
                          <Text style={styles.gridLabel}>Orders</Text>
                          <Text style={styles.gridValue}>{day.orders}</Text>
                        </View>
                        <View style={styles.gridItem}>
                          <Text style={styles.gridLabel}>Revenue</Text>
                          <Text style={styles.gridValue}>{formatAmount(day.revenue)}</Text>
                        </View>
                        <View style={styles.gridItem}>
                          <Text style={styles.gridLabel}>Expenses</Text>
                          <Text style={[styles.gridValue, { color: colors.accent.danger }]}>
                            {formatAmount(day.expenses)}
                          </Text>
                        </View>
                        <View style={styles.gridItem}>
                          <Text style={styles.gridLabel}>Shipping Costs</Text>
                          <Text style={[styles.gridValue, { color: colors.accent.warning }]}>
                            {formatAmount(day.delivery)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Monthly Ledger Timeline */}
              <Text style={styles.sectionHeader}>Monthly Performance Rollups</Text>
              {monthlyLedgerRollup.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="assessment" size={40} color={colors.text.muted} />
                  <Text style={styles.emptyTitle}>No monthly data available</Text>
                </View>
              ) : (
                <View style={styles.reportList}>
                  {monthlyLedgerRollup.map((rep) => (
                    <View key={rep.label} style={styles.summaryCard}>
                      <View style={styles.summaryHeader}>
                        <Text style={[styles.summaryDate, { fontSize: 16 }]}>{rep.label}</Text>
                        <View style={[styles.profitBadge, rep.net >= 0 ? styles.profitPositive : styles.profitNegative]}>
                          <Text style={[styles.profitBadgeText, rep.net >= 0 ? styles.profitPositiveText : styles.profitNegativeText]}>
                            {rep.net >= 0 ? "+" : ""}
                            {formatAmount(rep.net)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.summaryGrid}>
                        <View style={styles.gridItem}>
                          <Text style={styles.gridLabel}>Revenue</Text>
                          <Text style={styles.gridValue}>{formatAmount(rep.sales)}</Text>
                        </View>
                        <View style={styles.gridItem}>
                          <Text style={styles.gridLabel}>Deducted Expenses</Text>
                          <Text style={[styles.gridValue, { color: colors.accent.danger }]}>
                            {formatAmount(rep.expenses)}
                          </Text>
                        </View>
                        <View style={styles.gridItem}>
                          <Text style={styles.gridLabel}>Gross Margin</Text>
                          <Text style={[styles.gridValue, { color: colors.accent.success }]}>
                            {formatAmount(rep.gross)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          )}

          {/* TAB 8: REPORT COMPILATION SHEET */}
          {activeTab === "reports" && (
            <Animated.View entering={FadeInDown.duration(300)}>
              {/* Reports subnavigation tabs */}
              <View style={styles.reportTabContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.reportTabScroll}
                >
                  {[
                    { key: "customerProfit", label: "Cust Margins", icon: "person" },
                    { key: "itemProfit", label: "Prod Margins", icon: "category" },
                    { key: "deliveryCost", label: "Shipping", icon: "local-shipping" },
                    { key: "expenseSheet", label: "Expenses", icon: "receipt-long" },
                    { key: "workerSalary", label: "Payroll", icon: "engineering" },
                    { key: "monthlySheet", label: "Monthly", icon: "calendar-month" },
                  ].map((item) => {
                    const isSubActive = activeReportTab === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        style={[styles.reportSelectorBtn, isSubActive && styles.reportSelectorBtnActive]}
                        onPress={() => setActiveReportTab(item.key)}
                      >
                        <MaterialIcons
                          name={item.icon}
                          size={14}
                          color={isSubActive ? colors.text.inverse : colors.text.secondary}
                        />
                        <Text style={[styles.reportSelectorText, isSubActive && styles.reportSelectorTextActive]}>
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* PDF & Excel Action buttons */}
              <View style={styles.actionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.exportBtn, { backgroundColor: colors.accent.success }, pressed && styles.pressedEffect]}
                  onPress={() => handleExportPDF(`${activeReportTab} PDF Report`)}
                >
                  <MaterialIcons name="picture-as-pdf" size={16} color="#fff" />
                  <Text style={styles.exportBtnText}>PDF Export</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.exportBtn, { backgroundColor: colors.accent.primary }, pressed && styles.pressedEffect]}
                  onPress={() => handleExportPDF(`${activeReportTab} Excel Report`)}
                >
                  <MaterialIcons name="grid-on" size={16} color="#fff" />
                  <Text style={styles.exportBtnText}>Excel Export</Text>
                </Pressable>
              </View>

              {/* Render Selected Sheet */}
              <View style={styles.reportSheetWrapper}>
                {/* A. Customer Profit Report */}
                {activeReportTab === "customerProfit" && (
                  <View>
                    <Text style={styles.sheetTitle}>Customer Profit Margins Report</Text>
                    {customerProfilesList.slice(0, 10).map((c) => (
                      <View key={c.id} style={styles.sheetRow}>
                        <View style={styles.sheetLeftCol}>
                          <Text style={styles.sheetColName} numberOfLines={1}>{c.name}</Text>
                          <Text style={styles.sheetColSub}>Sales: {formatAmount(c.sales)}</Text>
                        </View>
                        <View style={styles.sheetRightCol}>
                          <Text style={[styles.sheetColProfit, { color: c.profit >= 0 ? colors.accent.success : colors.accent.danger }]}>
                            {c.profit >= 0 ? "+" : ""}{formatAmount(c.profit)}
                          </Text>
                          <Text style={styles.sheetColSub}>Profit Margin</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* B. Item Profit Report */}
                {activeReportTab === "itemProfit" && (
                  <View>
                    <Text style={styles.sheetTitle}>Product Margins Report</Text>
                    {itemProfilesList.slice(0, 10).map((i) => (
                      <View key={i.id} style={styles.sheetRow}>
                        <View style={styles.sheetLeftCol}>
                          <Text style={styles.sheetColName} numberOfLines={1}>{i.itemName}</Text>
                          <Text style={styles.sheetColSub}>Sold: {i.quantitySold} units</Text>
                        </View>
                        <View style={styles.sheetRightCol}>
                          <Text style={[styles.sheetColProfit, { color: i.totalProfit >= 0 ? colors.accent.success : colors.accent.danger }]}>
                            {i.totalProfit >= 0 ? "+" : ""}{formatAmount(i.totalProfit)}
                          </Text>
                          <Text style={styles.sheetColSub}>Net Margin</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* C. Delivery Cost Report */}
                {activeReportTab === "deliveryCost" && (
                  <View>
                    <Text style={styles.sheetTitle}>Shipping Cost & Freight Report</Text>
                    {partnerProfilesList.map((p) => (
                      <View key={p.id} style={styles.sheetRow}>
                        <View style={styles.sheetLeftCol}>
                          <Text style={styles.sheetColName} numberOfLines={1}>{p.name} ({p.vehicleType || "Vehicle"})</Text>
                          <Text style={styles.sheetColSub}>{p.periodDeliveriesCount} Trips • Freight: {formatAmount(p.payable)}</Text>
                        </View>
                        <View style={styles.sheetRightCol}>
                          <Text style={[styles.sheetColProfit, { color: p.pending > 0 ? colors.accent.danger : colors.accent.success }]}>
                            {p.pending > 0 ? `Due: ${formatAmount(p.pending)}` : "Settled"}
                          </Text>
                          <Text style={styles.sheetColSub}>Pending Balance</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* D. Expense Report */}
                {activeReportTab === "expenseSheet" && (
                  <View>
                    <Text style={styles.sheetTitle}>Operating Expenses Report</Text>
                    {categoryExpensesBreakdown.map((e) => (
                      <View key={e.name} style={styles.sheetRow}>
                        <View style={styles.sheetLeftCol}>
                          <Text style={styles.sheetColName} numberOfLines={1}>{e.name}</Text>
                          <Text style={styles.sheetColSub}>{e.percentage.toFixed(1)}% of OpEx</Text>
                        </View>
                        <View style={styles.sheetRightCol}>
                          <Text style={[styles.sheetColProfit, { color: colors.accent.danger }]}>
                            {formatAmount(e.amount)}
                          </Text>
                          <Text style={styles.sheetColSub}>Spent</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* E. Worker Salary Report */}
                {activeReportTab === "workerSalary" && (
                  <View>
                    <Text style={styles.sheetTitle}>Staff Payroll Report</Text>
                    {workerProfilesList.map((w) => (
                      <View key={w.id} style={styles.sheetRow}>
                        <View style={styles.sheetLeftCol}>
                          <Text style={styles.sheetColName} numberOfLines={1}>{w.name}</Text>
                          <Text style={styles.sheetColSub}>Paid: {formatAmount(w.paid)}</Text>
                        </View>
                        <View style={styles.sheetRightCol}>
                          <Text style={[styles.sheetColProfit, { color: w.pending > 0 ? colors.accent.danger : colors.accent.success }]}>
                            {w.pending > 0 ? `Due: ${formatAmount(w.pending)}` : "Settled"}
                          </Text>
                          <Text style={styles.sheetColSub}>Pending Wages</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* F. Monthly Profit Report */}
                {activeReportTab === "monthlySheet" && (
                  <View>
                    <Text style={styles.sheetTitle}>Monthly Margin Summary Report</Text>
                    {monthlyLedgerRollup.map((m) => (
                      <View key={m.label} style={styles.sheetRow}>
                        <View style={styles.sheetLeftCol}>
                          <Text style={styles.sheetColName} numberOfLines={1}>{m.label}</Text>
                          <Text style={styles.sheetColSub}>Sales: {formatAmount(m.sales)}</Text>
                        </View>
                        <View style={styles.sheetRightCol}>
                          <Text style={[styles.sheetColProfit, { color: m.net >= 0 ? colors.accent.success : colors.accent.danger }]}>
                            {m.net >= 0 ? "+" : ""}{formatAmount(m.net)}
                          </Text>
                          <Text style={styles.sheetColSub}>Net Return</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </Animated.View>
          )}
        </View>
      )}

      {/* OVERLAY DETAILS MODAL A: CUSTOMER PROFILE DETAILS */}
      <Modal visible={!!selectedCustomer} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            {selectedCustomer && customerDetailData && (
              <View style={{ flex: 1 }}>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>{selectedCustomer.name}</Text>
                  <Pressable onPress={() => setSelectedCustomer(null)}>
                    <MaterialIcons name="close" size={24} color={colors.text.primary} />
                  </Pressable>
                </View>

                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {/* Stats Cards */}
                  <View style={styles.modalStatsGrid}>
                    <View style={styles.mStatCard}>
                      <Text style={styles.mStatLabel}>Order Count</Text>
                      <Text style={styles.mStatValue}>{customerDetailData.ordersCount}</Text>
                    </View>
                    <View style={styles.mStatCard}>
                      <Text style={styles.mStatLabel}>Total Revenue</Text>
                      <Text style={styles.mStatValue}>{formatAmount(customerDetailData.sales)}</Text>
                    </View>
                    <View style={styles.mStatCard}>
                      <Text style={styles.mStatLabel}>Paid Wages</Text>
                      <Text style={styles.mStatValue}>{formatAmount(customerDetailData.paid)}</Text>
                    </View>
                    <View style={styles.mStatCard}>
                      <Text style={styles.mStatLabel}>Current Balance</Text>
                      <Text style={[styles.mStatValue, { color: colors.accent.danger }]}>
                        {formatAmount(customerDetailData.balance)}
                      </Text>
                    </View>
                    <View style={[styles.mStatCard, { minWidth: "100%", backgroundColor: `${colors.accent.success}10` }]}>
                      <Text style={styles.mStatLabel}>Accumulated Net Margin</Text>
                      <Text style={[styles.mStatValue, { color: colors.accent.success }]}>
                        {formatAmount(customerDetailData.profit)}
                      </Text>
                    </View>
                  </View>

                  {/* Profile info */}
                  <Text style={styles.modalSubHeader}>Client Contact Card</Text>
                  <View style={styles.modalDetailsGroup}>
                    <Text style={styles.mDetailLabel}>Phone: <Text style={styles.mDetailVal}>{selectedCustomer.phone || "N/A"}</Text></Text>
                    <Text style={styles.mDetailLabel}>Address: <Text style={styles.mDetailVal}>{selectedCustomer.address || "N/A"}</Text></Text>
                  </View>

                  {/* Orders history */}
                  <Text style={styles.modalSubHeader}>Order Ledger history</Text>
                  {customerDetailData.orders.length === 0 ? (
                    <Text style={styles.mEmptyText}>No sales recorded</Text>
                  ) : (
                    customerDetailData.orders.map((o) => (
                      <View key={o.id} style={styles.modalLogItem}>
                        <View>
                          <Text style={styles.modalLogTitle}>Order ID: #{o.id.slice(-6).toUpperCase()}</Text>
                          <Text style={styles.modalLogDate}>
                            {new Date(o.createdAt).toLocaleDateString("en-IN")} — Status: {o.status}
                          </Text>
                        </View>
                        <Text style={styles.modalLogPrice}>{formatAmount(o.total)}</Text>
                      </View>
                    ))
                  )}

                  {/* Payments history */}
                  <Text style={styles.modalSubHeader}>Payment Receipts Ledger</Text>
                  {customerDetailData.payments.length === 0 ? (
                    <Text style={styles.mEmptyText}>No payments logged</Text>
                  ) : (
                    customerDetailData.payments.map((p) => (
                      <View key={p.id} style={styles.modalLogItem}>
                        <View>
                          <Text style={styles.modalLogTitle}>{p.paymentMethod || "Cash payout"}</Text>
                          <Text style={styles.modalLogDate}>
                            {new Date(p.createdAt).toLocaleDateString("en-IN")}
                          </Text>
                        </View>
                        <Text style={[styles.modalLogPrice, { color: colors.accent.success }]}>
                          {formatAmount(p.amountReceived)}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* OVERLAY DETAILS MODAL B: DELIVERY PARTNER DETAILS */}
      <Modal visible={!!selectedPartner} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            {selectedPartner && partnerDetailData && (
              <View style={{ flex: 1 }}>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>{selectedPartner.name}</Text>
                  <Pressable onPress={() => setSelectedPartner(null)}>
                    <MaterialIcons name="close" size={24} color={colors.text.primary} />
                  </Pressable>
                </View>

                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {/* Stats Grid */}
                  <View style={styles.modalStatsGrid}>
                    <View style={styles.mStatCard}>
                      <Text style={styles.mStatLabel}>Total Freight Earned</Text>
                      <Text style={styles.mStatValue}>{formatAmount(selectedPartner.totalPayable || 0)}</Text>
                    </View>
                    <View style={styles.mStatCard}>
                      <Text style={styles.mStatLabel}>Total Paid Out</Text>
                      <Text style={[styles.mStatValue, { color: colors.accent.success }]}>{formatAmount(selectedPartner.totalPaid || 0)}</Text>
                    </View>
                    <View style={[styles.mStatCard, { minWidth: "100%", backgroundColor: (selectedPartner.totalPending || 0) > 0 ? `${colors.accent.danger}12` : `${colors.accent.success}12` }]}>
                      <Text style={styles.mStatLabel}>Outstanding Payables Balance</Text>
                      <Text style={[styles.mStatValue, { color: (selectedPartner.totalPending || 0) > 0 ? colors.accent.danger : colors.accent.success, fontWeight: "800" }]}>
                        {formatAmount(selectedPartner.totalPending || 0)}
                      </Text>
                    </View>
                  </View>

                  {/* Partner Details */}
                  <View style={styles.modalDetailsGroup}>
                    <Text style={styles.mDetailLabel}>Vehicle: <Text style={styles.mDetailVal}>{selectedPartner.vehicleType} ({selectedPartner.vehicleNumber || "No Plate"})</Text></Text>
                    <Text style={styles.mDetailLabel}>Rate Config: <Text style={styles.mDetailVal}>{selectedPartner.deliveryRateType} @ {selectedPartner.deliveryRate}</Text></Text>
                    <Text style={styles.mDetailLabel}>Mobile: <Text style={styles.mDetailVal}>{selectedPartner.mobile || "N/A"}</Text></Text>
                  </View>

                  <Pressable
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.accent.primary,
                      paddingVertical: 10,
                      borderRadius: radius.md,
                      marginVertical: spacing.sm,
                      gap: 6,
                    }}
                    onPress={() => {
                      const pId = selectedPartner.id;
                      setSelectedPartner(null);
                      router.push({ pathname: "/settings/delivery-partners/details", params: { id: pId } });
                    }}
                  >
                    <MaterialIcons name="open-in-new" size={16} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Open Partner Details & Disburse Payouts</Text>
                  </Pressable>

                  {/* Shipment Logs */}
                  <Text style={styles.modalSubHeader}>Deliveries dispatch list</Text>
                  {partnerDetailData.trips.length === 0 ? (
                    <Text style={styles.mEmptyText}>No trip dispatches logged</Text>
                  ) : (
                    partnerDetailData.trips.map((t) => (
                      <View key={t.id} style={styles.modalLogItem}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modalLogTitle}>{t.customerName}</Text>
                          <Text style={styles.modalLogDate}>
                            {new Date(t.createdAt).toLocaleDateString("en-IN")} — Status: {t.paymentStatus}
                          </Text>
                        </View>
                        <Text style={styles.modalLogPrice}>{formatAmount(t.deliveryCharge)}</Text>
                      </View>
                    ))
                  )}

                  {/* Partner Payments payouts logs */}
                  <Text style={styles.modalSubHeader}>Payments payout logs</Text>
                  {partnerDetailData.payments.length === 0 ? (
                    <Text style={styles.mEmptyText}>No payments disbursed</Text>
                  ) : (
                    partnerDetailData.payments.map((p) => (
                      <View key={p.id} style={styles.modalLogItem}>
                        <View>
                          <Text style={styles.modalLogTitle}>Shipping Disburse</Text>
                          <Text style={styles.modalLogDate}>
                            {new Date(p.createdAt).toLocaleDateString("en-IN")}
                          </Text>
                        </View>
                        <Text style={[styles.modalLogPrice, { color: colors.accent.success }]}>
                          {formatAmount(p.amount)}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* OVERLAY DETAILS MODAL C: WORKER DETAILS */}
      <Modal visible={!!selectedWorker} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            {selectedWorker && workerDetailData && (
              <View style={{ flex: 1 }}>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>{selectedWorker.name}</Text>
                  <Pressable onPress={() => setSelectedWorker(null)}>
                    <MaterialIcons name="close" size={24} color={colors.text.primary} />
                  </Pressable>
                </View>

                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {/* Worker Details */}
                  <View style={styles.modalDetailsGroup}>
                    <Text style={styles.mDetailLabel}>Billing Mode: <Text style={styles.mDetailVal}>{selectedWorker.billingSystem}</Text></Text>
                    <Text style={styles.mDetailLabel}>Base Pay: <Text style={styles.mDetailVal}>
                      {selectedWorker.billingSystem === "Piece-Rate" ? `${selectedWorker.pieceRate} / Bag` : `${selectedWorker.dailyWage} / Day`}
                    </Text></Text>
                    {selectedWorker.hasShifting && (
                      <Text style={styles.mDetailLabel}>Shifting: <Text style={styles.mDetailVal}>
                        Loading: ₹{selectedWorker.loadingCost || 0} • Unloading: ₹{selectedWorker.unloadingCost || 0}
                      </Text></Text>
                    )}
                  </View>

                  {/* Worker Attendance log */}
                  <Text style={styles.modalSubHeader}>Attendance Sheets</Text>
                  {workerDetailData.attendance.length === 0 ? (
                    <Text style={styles.mEmptyText}>No attendance recorded</Text>
                  ) : (
                    workerDetailData.attendance.map((a) => (
                      <View key={a.id} style={styles.modalLogItem}>
                        <View>
                          <Text style={styles.modalLogTitle}>{a.status.toUpperCase()}</Text>
                          <Text style={styles.modalLogDate}>
                            {new Date(a.createdAt).toLocaleDateString("en-IN")} {a.overtimeHours ? `— Overtime: ${a.overtimeHours} Hrs` : ""}
                          </Text>
                        </View>
                        {a.piecesProduced > 0 && (
                          <Text style={styles.qtyBadgeText}>Produced: {a.piecesProduced} Bags</Text>
                        )}
                      </View>
                    ))
                  )}

                  {/* Worker salary payments payouts */}
                  <Text style={styles.modalSubHeader}>Wages payout logs</Text>
                  {workerDetailData.payments.length === 0 ? (
                    <Text style={styles.mEmptyText}>No wage payments logged</Text>
                  ) : (
                    workerDetailData.payments.map((p) => (
                      <View key={p.id} style={styles.modalLogItem}>
                        <View>
                          <Text style={styles.modalLogTitle}>Wage payout</Text>
                          <Text style={styles.modalLogDate}>
                            {new Date(p.createdAt).toLocaleDateString("en-IN")}
                          </Text>
                        </View>
                        <Text style={[styles.modalLogPrice, { color: colors.accent.success }]}>
                          {formatAmount(p.amount)}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* OVERLAY DETAILS MODAL D: OVERVIEW METRIC DETAILS */}
      <Modal visible={!!selectedOverviewMetric} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            {selectedOverviewMetric && (
              <View style={{ flex: 1 }}>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>
                    {selectedOverviewMetric === "revenue" && "Total Sales Profile"}
                    {selectedOverviewMetric === "grossProfit" && "Gross Profit Profile"}
                    {selectedOverviewMetric === "expenses" && "Total Expenses Profile"}
                    {selectedOverviewMetric === "netProfit" && "Net Return Profile"}
                    {selectedOverviewMetric === "customerReceivables" && "Customer Receivables Profile"}
                    {selectedOverviewMetric === "shippingPayables" && "Shipping Payables Profile"}
                    {selectedOverviewMetric === "totalCustomers" && "Customer Registry"}
                    {selectedOverviewMetric === "totalOrders" && "Orders Register"}
                  </Text>
                  <Pressable onPress={() => setSelectedOverviewMetric(null)}>
                    <MaterialIcons name="close" size={24} color={colors.text.primary} />
                  </Pressable>
                </View>

                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {/* Detailed Description/Formula card */}
                  <View style={[styles.mStatCard, { minWidth: "100%", backgroundColor: colors.bg.primary, marginBottom: spacing.md }]}>
                    <Text style={styles.mStatLabel}>
                      {selectedOverviewMetric === "revenue" && "Accumulated Billing Revenue"}
                      {selectedOverviewMetric === "grossProfit" && "Sales Revenue minus Cost of Goods Sold"}
                      {selectedOverviewMetric === "expenses" && "Operational & Materials Spending"}
                      {selectedOverviewMetric === "netProfit" && "Gross Profit minus Expenses and Delivery"}
                      {selectedOverviewMetric === "customerReceivables" && "Outstanding balances due from Clients"}
                      {selectedOverviewMetric === "shippingPayables" && "Outstanding balances due to Shippers"}
                      {selectedOverviewMetric === "totalCustomers" && "Total active customer profiles list"}
                      {selectedOverviewMetric === "totalOrders" && "Total orders register logs"}
                    </Text>
                    <Text style={[styles.mStatValue, { fontSize: 24, marginTop: 4 }]}>
                      {selectedOverviewMetric === "revenue" && formatAmount(analyticsData.revenue)}
                      {selectedOverviewMetric === "grossProfit" && formatAmount(analyticsData.grossProfit)}
                      {selectedOverviewMetric === "expenses" && formatAmount(analyticsData.expenses)}
                      {selectedOverviewMetric === "netProfit" && formatAmount(analyticsData.netProfit)}
                      {selectedOverviewMetric === "customerReceivables" && formatAmount(analyticsData.pendingCustomerPayments)}
                      {selectedOverviewMetric === "shippingPayables" && formatAmount(analyticsData.pendingPartnerPayments)}
                      {selectedOverviewMetric === "totalCustomers" && `${customers.length} Customers`}
                      {selectedOverviewMetric === "totalOrders" && `${analyticsData.ordersCount} Orders`}
                    </Text>
                  </View>

                  {/* List for each type */}
                  {selectedOverviewMetric === "revenue" && (
                    <View>
                      <Text style={styles.modalSubHeader}>Order Sales List</Text>
                      {analyticsData.completedOrders.length === 0 ? (
                        <Text style={styles.mEmptyText}>No sales recorded for this period</Text>
                      ) : (
                        analyticsData.completedOrders.map((o) => (
                          <View key={o.id} style={styles.modalLogItem}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.modalLogTitle}>{o.customerName}</Text>
                              <Text style={styles.modalLogDate}>
                                {new Date(o.createdAt).toLocaleDateString("en-IN")} • {o.itemName} (Qty: {o.quantity})
                              </Text>
                            </View>
                            <Text style={styles.modalLogPrice}>{formatAmount(o.total)}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  )}

                  {selectedOverviewMetric === "grossProfit" && (
                    <View>
                      <Text style={styles.modalSubHeader}>Gross Profit calculation</Text>
                      <View style={styles.modalDetailsGroup}>
                        <Text style={styles.mDetailLabel}>Total Sales Revenue: <Text style={[styles.mDetailVal, { color: colors.accent.success }]}>+{formatAmount(analyticsData.revenue)}</Text></Text>
                        <Text style={styles.mDetailLabel}>Total Material Cost (COGS): <Text style={[styles.mDetailVal, { color: colors.accent.danger }]}>-{formatAmount(analyticsData.revenue - analyticsData.grossProfit)}</Text></Text>
                      </View>
                      
                      <Text style={[styles.modalSubHeader, { marginTop: spacing.md }]}>Top Sales Profit Breakdown</Text>
                      {analyticsData.completedOrders.slice(0, 10).map((o) => (
                        <View key={o.id} style={styles.modalLogItem}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.modalLogTitle}>{o.itemName} (Qty: {o.quantity})</Text>
                            <Text style={styles.modalLogDate}>{o.customerName}</Text>
                          </View>
                          <Text style={styles.modalLogPrice}>{formatAmount(o.total)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {selectedOverviewMetric === "expenses" && (
                    <View>
                      <Text style={styles.modalSubHeader}>Recent Expenses</Text>
                      {analyticsData.filteredExpenses.length === 0 ? (
                        <Text style={styles.mEmptyText}>No expenses recorded for this period</Text>
                      ) : (
                        analyticsData.filteredExpenses.map((exp) => (
                          <View key={exp.id} style={styles.modalLogItem}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.modalLogTitle}>{exp.category || "General Expense"}</Text>
                              <Text style={styles.modalLogDate}>
                                {new Date(exp.expenseDate).toLocaleDateString("en-IN")} {exp.notes ? `• ${exp.notes}` : ""}
                              </Text>
                            </View>
                            <Text style={[styles.modalLogPrice, { color: colors.accent.danger }]}>
                              -{formatAmount(exp.totalAmount || exp.amount || 0)}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  )}

                  {selectedOverviewMetric === "netProfit" && (
                    <View>
                      <Text style={styles.modalSubHeader}>Net Return calculation</Text>
                      <View style={styles.modalDetailsGroup}>
                        <Text style={styles.mDetailLabel}>Gross Profit margin: <Text style={[styles.mDetailVal, { color: colors.accent.success }]}>+{formatAmount(analyticsData.grossProfit)}</Text></Text>
                        <Text style={styles.mDetailLabel}>Operating Expenses: <Text style={[styles.mDetailVal, { color: colors.accent.danger }]}>-{formatAmount(analyticsData.expenses)}</Text></Text>
                        <Text style={styles.mDetailLabel}>Logistics Delivery Costs: <Text style={[styles.mDetailVal, { color: colors.accent.danger }]}>-{formatAmount(analyticsData.deliveryCost)}</Text></Text>
                      </View>
                    </View>
                  )}

                  {selectedOverviewMetric === "customerReceivables" && (
                    <View>
                      <Text style={styles.modalSubHeader}>Outstanding Balances List</Text>
                      {customers.filter(c => (c.totalPending || c.balance || 0) > 0).length === 0 ? (
                        <Text style={styles.mEmptyText}>No outstanding receivables</Text>
                      ) : (
                        customers
                          .filter(c => (c.totalPending || c.balance || 0) > 0)
                          .map((c) => (
                            <View key={c.id} style={styles.modalLogItem}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.modalLogTitle}>{c.name}</Text>
                                <Text style={styles.modalLogDate}>{c.phone || "No phone"}</Text>
                              </View>
                              <Text style={[styles.modalLogPrice, { color: colors.accent.danger }]}>
                                {formatAmount(c.totalPending || c.balance || 0)}
                              </Text>
                            </View>
                          ))
                      )}
                    </View>
                  )}

                  {selectedOverviewMetric === "shippingPayables" && (
                    <View>
                      <Text style={styles.modalSubHeader}>Logistics Payables Breakdown</Text>
                      <View style={[styles.modalDetailsGroup, { marginBottom: spacing.md }]}>
                        <Text style={styles.mDetailLabel}>Total Shipping Payables Due: <Text style={[styles.mDetailVal, { color: colors.accent.danger, fontWeight: "800" }]}>{formatAmount(analyticsData.pendingPartnerPayments)}</Text></Text>
                        <Text style={styles.mDetailLabel}>Period Freight Charges: <Text style={styles.mDetailVal}>{formatAmount(analyticsData.periodDeliveryFreight)} ({analyticsData.filteredTrips.length} trips)</Text></Text>
                        <Text style={styles.mDetailLabel}>Period Payouts Disbursed: <Text style={[styles.mDetailVal, { color: colors.accent.success }]}>{formatAmount(analyticsData.periodDelPayments)}</Text></Text>
                      </View>

                      {partners.filter(p => (p.totalPending || 0) > 0).length === 0 ? (
                        <Text style={styles.mEmptyText}>No outstanding payables to delivery partners</Text>
                      ) : (
                        partners
                          .filter(p => (p.totalPending || 0) > 0)
                          .map((p) => (
                            <Pressable
                              key={p.id}
                              style={({ pressed }) => [styles.modalLogItem, pressed && styles.pressedEffect]}
                              onPress={() => {
                                setSelectedOverviewMetric(null);
                                setSelectedPartner(p);
                              }}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={styles.modalLogTitle}>{p.name}</Text>
                                <Text style={styles.modalLogDate}>{p.vehicleType || "Partner"} • {p.mobile || "No Mobile"}</Text>
                              </View>
                              <View style={{ alignItems: "flex-end" }}>
                                <Text style={[styles.modalLogPrice, { color: colors.accent.danger, fontWeight: "800" }]}>
                                  {formatAmount(p.totalPending || 0)}
                                </Text>
                                <Text style={{ fontSize: 10, color: colors.accent.primary, fontWeight: "600", marginTop: 2 }}>
                                  Tap to View / Pay →
                                </Text>
                              </View>
                            </Pressable>
                          ))
                      )}

                      <Pressable
                        style={{
                          marginTop: spacing.md,
                          backgroundColor: colors.accent.primary,
                          paddingVertical: 12,
                          borderRadius: radius.md,
                          alignItems: "center",
                        }}
                        onPress={() => {
                          setSelectedOverviewMetric(null);
                          router.push("/settings/delivery-partners");
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Manage All Delivery Partners</Text>
                      </Pressable>
                    </View>
                  )}

                  {selectedOverviewMetric === "totalCustomers" && (
                    <View>
                      <Text style={styles.modalSubHeader}>Customers Directory</Text>
                      {customers.length === 0 ? (
                        <Text style={styles.mEmptyText}>No customers registered</Text>
                      ) : (
                        customers.map((c) => (
                          <View key={c.id} style={styles.modalLogItem}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.modalLogTitle}>{c.name}</Text>
                              <Text style={styles.modalLogDate}>{c.phone || "No phone"}</Text>
                            </View>
                            <Text style={styles.modalLogPrice}>{formatAmount(c.totalPending || c.balance || 0)} due</Text>
                          </View>
                        ))
                      )}
                    </View>
                  )}

                  {selectedOverviewMetric === "totalOrders" && (
                    <View>
                      <Text style={styles.modalSubHeader}>Recent Orders Register</Text>
                      {analyticsData.filteredOrders.length === 0 ? (
                        <Text style={styles.mEmptyText}>No orders recorded for this period</Text>
                      ) : (
                        analyticsData.filteredOrders.map((o) => (
                          <View key={o.id} style={styles.modalLogItem}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.modalLogTitle}>#{o.id.slice(-6).toUpperCase()} — {o.customerName}</Text>
                              <Text style={styles.modalLogDate}>
                                {new Date(o.createdAt).toLocaleDateString("en-IN")} • Status: {o.status.toUpperCase()}
                              </Text>
                            </View>
                            <Text style={styles.modalLogPrice}>{formatAmount(o.total)}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export default function ProfitRoute() {
  return (
    <ProtectedRoute>
      <ProfitManagementScreen />
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    container: {
      padding: spacing.lg,
      backgroundColor: colors.bg.primary,
      flexGrow: 1,
      paddingBottom: 60,
    },
    header: {
      marginBottom: spacing.lg,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.md,
      gap: spacing.xs,
    },
    backText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.text.primary,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 2,
    },
    exportFloatButton: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      justifyContent: "center",
      alignItems: "center",
      ...shadows.subtle,
    },
    pressedEffect: {
      opacity: 0.8,
      transform: [{ scale: 0.98 }],
    },

    // Filters & Custom dates
    filterCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...shadows.card,
    },
    periodTabs: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    periodTabBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.primary,
    },
    periodTabBtnActive: {
      backgroundColor: colors.accent.success,
      borderColor: colors.accent.success,
    },
    periodTabLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    periodTabLabelActive: {
      color: colors.text.inverse,
    },
    customDateInputs: {
      flexDirection: "row",
      gap: spacing.md,
      marginVertical: spacing.sm,
    },
    dateInputCol: {
      flex: 1,
    },
    dateInputLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.text.muted,
      marginBottom: 4,
    },
    dateInput: {
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      fontSize: 12,
      color: colors.text.primary,
    },
    presetsRow: {
      flexDirection: "row",
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    presetBtn: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    presetBtnText: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.text.secondary,
    },

    // Search bar
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      marginBottom: spacing.md,
      gap: spacing.sm,
      ...shadows.subtle,
    },
    searchIcon: {
      marginRight: 2,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: colors.text.primary,
      padding: 0,
    },

    // Top horizontal selector tabs
    navbarScroll: {
      gap: spacing.xs,
      paddingBottom: 4,
      marginBottom: spacing.lg,
    },
    navbarBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.card,
      ...shadows.subtle,
    },
    navbarBtnActive: {
      backgroundColor: colors.text.primary,
      borderColor: colors.text.primary,
    },
    navbarBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.muted,
    },
    navbarBtnTextActive: {
      color: colors.text.inverse,
    },

    // Body container
    dashboardBody: {
      flex: 1,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: "800",
      textTransform: "uppercase",
      color: colors.text.muted,
      letterSpacing: 0.8,
      marginBottom: spacing.sm,
    },

    // Stat Cards overview
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    statCard: {
      flex: 1,
      minWidth: "45%",
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.md,
      ...shadows.card,
    },
    statIconWrap: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    statLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    statValue: {
      fontSize: 18,
      fontWeight: "800",
    },

    // Business Health Scorecard card
    healthCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.md,
      ...shadows.card,
    },
    healthItem: {
      gap: 4,
    },
    healthHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    healthLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: "700",
    },
    healthValText: {
      fontSize: 13,
      fontWeight: "800",
    },
    progressBarBg: {
      height: 6,
      backgroundColor: colors.bg.primary,
      borderRadius: radius.xs,
      overflow: "hidden",
    },
    progressBarFill: {
      height: "100%",
      borderRadius: radius.xs,
    },

    // Standard items list breakdowns
    reportList: {
      gap: spacing.md,
    },
    breakdownCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.md,
      ...shadows.card,
    },
    bdMainRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    bdMetaLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flex: 1,
    },
    bdName: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.text.primary,
    },
    profitBadge: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: radius.md,
    },
    profitPositive: {
      backgroundColor: "#e6fffa",
    },
    profitPositiveText: {
      color: colors.accent.success,
      fontWeight: "800",
      fontSize: 11,
    },
    profitNegative: {
      backgroundColor: "#fff5f5",
    },
    profitNegativeText: {
      color: colors.accent.danger,
      fontWeight: "800",
      fontSize: 11,
    },
    bdMetricsRow: {
      flexDirection: "row",
      gap: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      paddingTop: spacing.xs,
      marginTop: 4,
    },
    bdMetricsItem: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: "600",
      flex: 1,
    },
    bdMetricsValue: {
      color: colors.text.secondary,
      fontWeight: "700",
    },
    cardFooterText: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 6,
      textAlign: "right",
    },
    qtyBadge: {
      backgroundColor: colors.bg.primary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.sm,
    },
    qtyBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
    },

    // Daily/Monthly ledgers
    summaryCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.md,
      ...shadows.card,
    },
    summaryHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      paddingBottom: spacing.sm,
      marginBottom: spacing.sm,
    },
    summaryDate: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.text.primary,
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    gridItem: {
      width: "47%",
    },
    gridLabel: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "600",
    },
    gridValue: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 2,
    },

    // Report Tab Section
    reportTabContainer: {
      marginBottom: spacing.md,
    },
    reportTabScroll: {
      flexDirection: "row",
      gap: 6,
      backgroundColor: colors.bg.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 4,
    },
    reportSelectorBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
    },
    reportSelectorBtnActive: {
      backgroundColor: colors.accent.success,
    },
    reportSelectorText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    reportSelectorTextActive: {
      color: colors.text.inverse,
    },
    actionsRow: {
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    exportBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: radius.md,
      ...shadows.subtle,
    },
    exportBtnText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "800",
    },
    reportSheetWrapper: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.md,
      ...shadows.card,
    },
    sheetTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      paddingBottom: 6,
    },
    sheetRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    sheetLeftCol: {
      flex: 1,
      marginRight: spacing.sm,
    },
    sheetRightCol: {
      alignItems: "flex-end",
      minWidth: 90,
    },
    sheetColName: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 2,
    },
    sheetColSub: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "500",
    },
    sheetColProfit: {
      fontSize: 13,
      fontWeight: "800",
      marginBottom: 2,
    },

    // Detail Modal Styling
    modalBg: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      height: "85%",
      backgroundColor: colors.bg.primary,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
    },
    modalHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      paddingBottom: spacing.sm,
      marginBottom: spacing.md,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text.primary,
    },
    modalSubHeader: {
      fontSize: 13,
      fontWeight: "800",
      textTransform: "uppercase",
      color: colors.text.muted,
      letterSpacing: 0.8,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    modalStatsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    mStatCard: {
      flex: 1,
      minWidth: "45%",
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.md,
      padding: spacing.md,
      ...shadows.subtle,
    },
    mStatLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.text.muted,
    },
    mStatValue: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.text.primary,
      marginTop: 2,
    },
    modalDetailsGroup: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.md,
    },
    mDetailLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.muted,
      marginBottom: 4,
    },
    mDetailVal: {
      color: colors.text.primary,
      fontWeight: "500",
    },
    modalLogItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    modalLogTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    modalLogDate: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    modalLogPrice: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    mEmptyText: {
      fontSize: 12,
      color: colors.text.muted,
      fontStyle: "italic",
      textAlign: "center",
      marginVertical: spacing.md,
    },

    // Loading & Empty state helpers
    loadingContainer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 80,
      gap: spacing.md,
    },
    loadingText: {
      fontSize: 14,
      color: colors.text.muted,
    },
    emptyCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.lg,
      padding: spacing.xl,
      alignItems: "center",
      justifyContent: "center",
      ...shadows.card,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.text.secondary,
      marginTop: spacing.md,
      textAlign: "center",
    },
  });
};