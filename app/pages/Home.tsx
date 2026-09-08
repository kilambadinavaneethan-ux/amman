import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useContext, useMemo, useState, useEffect } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
    FadeInDown,
} from "react-native-reanimated";
import { db, normalizeDateValue } from "../../src/config/firebase";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";

// Contexts
import { CustomerContext } from "../context/CustomerContext";
import { ExpenseContext } from "../context/ExpenseContext";
import { RawMaterialSupplierContext } from "../context/RawMaterialSupplierContext";
import { ItemContext } from "../context/ItemContext";
import { OrderContext } from "../context/OrderContext";
import { PaymentContext } from "../context/PaymentContext";
import { RawMaterialContext } from "../context/RawMaterialContext";

import { WorkerContext } from "../context/WorkerContext";
import { ContractWorkerContext } from "../context/ContractWorkerContext";
import { DeliveryPartnerContext } from "../context/DeliveryPartnerContext";

// Components
import AnimatedCounter from "../components/AnimatedCounter";
import AnimatedPage from "../components/AnimatedPage";
import EasyCalendarModal from "../components/EasyCalendarModal";

import { useTheme } from "../context/ThemeContext";
import { useScrollRestoration } from "../context/ScrollContext";

export default function Home() {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/");

  // Retrieve values from Firebase-backed contexts
  const { orders, todaySales, deleteOrder, editOrder } = useContext(OrderContext) as any;
  const { totalBalance, customers } = useContext(CustomerContext) as any;
  const { expenses, addExpense, deleteExpense } = useContext(ExpenseContext) as any;
  const { items } = useContext(ItemContext) as any;
  const { payments, addPayment, deletePayment, editPayment } = useContext(PaymentContext) as any;
  const { logs: rawLogs, deleteTransaction: deleteRawTransaction } = useContext(RawMaterialContext) as any;

  const { workers, todayAttendance, allAttendance, bulkLogAttendance, editTodayAttendance } = useContext(WorkerContext) as any;
  const { suppliers } = useContext(RawMaterialSupplierContext) as any;
  const { partners: deliveryPartners } = useContext(DeliveryPartnerContext) as any;


  // Single-pass calculation for total outstanding dues and advance payments
  const expenseMetrics = useMemo(() => {
    let outstanding = 0;
    let advance = 0;
    (expenses || []).forEach((e: any) => {
      const remaining = e.remainingAmount !== undefined 
        ? Number(e.remainingAmount) 
        : (e.paymentMethod === "Balance" || e.status === "Balance" ? Number(e.amount || 0) : 0);
      if (remaining > 0) outstanding += remaining;
      else if (remaining < 0) advance += Math.abs(remaining);
    });
    return { outstanding, advance };
  }, [expenses]);

  const supplierMetrics = useMemo(() => {
    let outstanding = 0;
    let advance = 0;
    (suppliers || []).forEach((s: any) => {
      const bal = Number(s.balance || 0);
      if (bal > 0) outstanding += bal;
      else if (bal < 0) advance += Math.abs(bal);
    });
    return { outstanding, advance };
  }, [suppliers]);

  const workerMetrics = useMemo(() => {
    let outstanding = 0;
    let advance = 0;
    (workers || []).forEach((w: any) => {
      if (w.status === "Active" || !w.status) {
        const pending = w.totalPending !== undefined
          ? Number(w.totalPending)
          : (Number(w.totalWages || 0) - Number(w.totalPaid || 0));
        if (pending > 0) outstanding += pending;
        else if (pending < 0) advance += Math.abs(pending);
      }
    });
    return { outstanding, advance };
  }, [workers]);

  const deliveryMetrics = useMemo(() => {
    let outstanding = 0;
    let advance = 0;
    (deliveryPartners || []).forEach((p: any) => {
      if (p.status === "Active" || !p.status) {
        const pending = Number(p.totalPending || 0);
        if (pending > 0) outstanding += pending;
        else if (pending < 0) advance += Math.abs(pending);
      }
    });
    return { outstanding, advance };
  }, [deliveryPartners]);

  const totalOutstandingDues = useMemo(() => {
    return expenseMetrics.outstanding + supplierMetrics.outstanding + workerMetrics.outstanding + deliveryMetrics.outstanding;
  }, [expenseMetrics, supplierMetrics, workerMetrics, deliveryMetrics]);

  const totalAdvancePaid = useMemo(() => {
    return expenseMetrics.advance + supplierMetrics.advance + workerMetrics.advance + deliveryMetrics.advance;
  }, [expenseMetrics, supplierMetrics, workerMetrics, deliveryMetrics]);
  const { contractWorkers } = useContext(ContractWorkerContext) as any;



  const [refreshing, setRefreshing] = useState(false);
  const [syncTime, setSyncTime] = useState<string>("Synced just now");

  // ─── GST Due Dates State ───
  const [gstSettings, setGstSettings] = useState<any>({ gstEnabled: false, filings: {}, customReminders: [], reminderDaysBefore: 3 });
  const [gstCompletedDates, setGstCompletedDates] = useState<Record<string, boolean>>({});

  const GST_FILING_TYPES_HOME = useMemo(() => [
    { id: "gstr1", name: "GSTR-1", description: "Outward supplies", defaultDay: 11, frequency: "Monthly", icon: "upload-file" as const, color: "#3B82F6" },
    { id: "gstr3b", name: "GSTR-3B", description: "Summary return", defaultDay: 20, frequency: "Monthly", icon: "assessment" as const, color: "#10B981" },
    { id: "gstr4", name: "GSTR-4", description: "Composition scheme", defaultDay: 18, frequency: "Quarterly", icon: "article" as const, color: "#8B5CF6" },
    { id: "gstr9", name: "GSTR-9", description: "Annual return", defaultDay: 31, frequency: "Annual", icon: "calendar-today" as const, color: "#EA580C" },
    { id: "gstr9c", name: "GSTR-9C", description: "Reconciliation", defaultDay: 31, frequency: "Annual", icon: "fact-check" as const, color: "#D97706" },
    { id: "cmp08", name: "CMP-08", description: "Composition challan", defaultDay: 18, frequency: "Quarterly", icon: "receipt" as const, color: "#06B6D4" },
  ], []);

  useEffect(() => {
    const gstDocRef = doc(db, "app_settings", "gst_management");
    const unsubscribe = onSnapshot(gstDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGstSettings({
          gstEnabled: data.gstEnabled ?? false,
          filings: data.filings || {},
          customReminders: data.customReminders || [],
          reminderDaysBefore: data.reminderDaysBefore || 3,
        });
      }
    }, () => {});
    return () => unsubscribe();
  }, []);

  const upcomingGstDueDates = useMemo(() => {
    if (!gstSettings.gstEnabled) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates: any[] = [];

    GST_FILING_TYPES_HOME.forEach((filing) => {
      const custom = gstSettings.filings[filing.id] || {};
      const enabled = custom.enabled !== undefined ? custom.enabled : true;
      if (!enabled) return;
      const dueDay = custom.dueDay || filing.defaultDay;

      if (filing.frequency === "Monthly") {
        for (let i = 0; i < 3; i++) {
          const d = new Date(today.getFullYear(), today.getMonth() + i, dueDay);
          if (d >= today) {
            const key = `${filing.id}_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`;
            dates.push({ ...filing, dueDay, date: d, key, daysLeft: Math.ceil((d.getTime() - today.getTime()) / 86400000) });
            break;
          }
        }
      } else if (filing.frequency === "Quarterly") {
        const qMonths = [2, 5, 8, 11];
        for (const qm of qMonths) {
          const d = new Date(today.getFullYear(), qm + 1, dueDay);
          if (d >= today) {
            const key = `${filing.id}_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`;
            dates.push({ ...filing, dueDay, date: d, key, daysLeft: Math.ceil((d.getTime() - today.getTime()) / 86400000) });
            break;
          }
        }
      } else {
        let d = new Date(today.getFullYear(), 11, 31);
        if (d < today) d = new Date(today.getFullYear() + 1, 11, 31);
        const key = `${filing.id}_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`;
        dates.push({ ...filing, dueDay, date: d, key, daysLeft: Math.ceil((d.getTime() - today.getTime()) / 86400000) });
      }
    });

    // Custom reminders
    (gstSettings.customReminders || []).forEach((rem: any) => {
      let d = new Date(today.getFullYear(), rem.month, rem.day);
      if (d < today) d = new Date(today.getFullYear() + 1, rem.month, rem.day);
      const key = `custom_${rem.id}`;
      dates.push({
        id: rem.id, name: rem.title, description: rem.notes || "Custom reminder",
        icon: "event" as const, color: "#EC4899", date: d, key,
        daysLeft: Math.ceil((d.getTime() - today.getTime()) / 86400000), isCustom: true,
      });
    });

    dates.sort((a, b) => a.date.getTime() - b.date.getTime());
    // Only show non-completed and limit to 5
    return dates.filter((d) => !gstCompletedDates[d.key]).slice(0, 5);
  }, [gstSettings, GST_FILING_TYPES_HOME, gstCompletedDates]);

  const handleGstComplete = async (item: any) => {
    setGstCompletedDates((prev) => ({ ...prev, [item.key]: true }));
    try {
      const completedDocRef = doc(db, "app_settings", "gst_completed");
      const monthKey = `${new Date().getFullYear()}_${new Date().getMonth()}`;
      await setDoc(completedDocRef, {
        [item.key]: { completedAt: new Date(), name: item.name, monthKey },
      }, { merge: true });
    } catch (e) {}
  };

  useEffect(() => {
    const completedDocRef = doc(db, "app_settings", "gst_completed");
    const unsubscribe = onSnapshot(completedDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const completed: Record<string, boolean> = {};
        Object.keys(data).forEach((k) => { completed[k] = true; });
        setGstCompletedDates(completed);
      }
    }, () => {});
    return () => unsubscribe();
  }, []);

  const formatGstDate = (date: Date) => {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const getGstUrgencyColor = (daysLeft: number) => {
    if (daysLeft <= 3) return colors.accent.danger;
    if (daysLeft <= 7) return "#EA580C";
    if (daysLeft <= 15) return colors.accent.warning;
    return colors.accent.success;
  };

  const getGstUrgencyBg = (daysLeft: number) => {
    if (daysLeft <= 3) return `${colors.accent.danger}15`;
    if (daysLeft <= 7) return "#EA580C15";
    if (daysLeft <= 15) return `${colors.accent.warning}15`;
    return `${colors.accent.success}15`;
  };

  // Customer Unpaid Summary Modal states
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [summarySearch, setSummarySearch] = useState("");
  const [summaryTypeFilter, setSummaryTypeFilter] = useState<"All" | "customer" | "worker" | "supplier" | "delivery_partner">("All");

  const getLastDueDate = (customer: any) => {
    if (!customer.dueDates || customer.dueDates.length === 0) return null;
    const pending = customer.dueDates.filter((d: any) => d.status !== "Completed" && d.status !== "Cancelled");
    if (pending.length > 0) {
      pending.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return pending[0];
    }
    const completed = customer.dueDates.filter((d: any) => d.status === "Completed");
    if (completed.length > 0) {
      completed.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return completed[0];
    }
    return null;
  };

  const getDueDateStatus = (item: any) => {
    if (!item) return "Pending";
    if (item.status === "Completed") return "Completed";
    if (item.status === "Cancelled") return "Cancelled";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parts = item.date ? item.date.split("-") : [];
    if (parts.length !== 3) return "Pending";
    const due = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    due.setHours(0, 0, 0, 0);
    if (due.getTime() < today.getTime()) return "Overdue";
    return "Pending";
  };

  const formatDueDate = (dateStr: string) => {
    try {
      const parts = dateStr.split("-");
      if (parts.length !== 3) return dateStr;
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const getAvatarColor = (name: string) => {
    const AVATAR_COLORS = ["#00D68F", "#3B82F6", "#EF4444", "#F59E0B", "#8B5CF6", "#EC4899", "#10B981", "#06B6D4"];
    const code = (name || "").charCodeAt(0) || 0;
    return AVATAR_COLORS[code % AVATAR_COLORS.length];
  };

  const unifiedCustomers = useMemo(() => {
    const result: any[] = [];
    const claimedKeys = new Set<string>();

    const getEntityKeys = (item: any) => {
      const keys: string[] = [];
      if (item.id) keys.push(`id:${item.id}`);
      const rawPhone = item.phone || item.contactNumber || item.mobile || item.phoneNumber || "";
      const cleanPhone = rawPhone.replace(/[^\d]/g, "");
      if (cleanPhone.length >= 10) keys.push(`phone:${cleanPhone.slice(-10)}`);
      const rawName = item.name || item.supplierName || "";
      const cleanName = rawName.trim().toLowerCase();
      if (cleanName) keys.push(`name:${cleanName}`);
      return keys;
    };

    const isClaimed = (item: any) => {
      const keys = getEntityKeys(item);
      return keys.some((k) => claimedKeys.has(k));
    };

    const claimItem = (item: any) => {
      const keys = getEntityKeys(item);
      keys.forEach((k) => claimedKeys.add(k));
    };

    // 1. Process Workers
    (workers || []).forEach((w: any) => {
      if (isClaimed(w)) return;
      claimItem(w);

      const pendingWages = w.totalPending !== undefined
        ? Number(w.totalPending)
        : (Number(w.totalWages || 0) - Number(w.totalPaid || 0));
      
      const customerBalanceDue = pendingWages < 0 ? Math.abs(pendingWages) : 0;
      const subInfo = pendingWages >= 0 
        ? `₹${pendingWages.toLocaleString("en-IN")} Pending Wages Owed`
        : `₹${Math.abs(pendingWages).toLocaleString("en-IN")} Advance Owed to Business`;

      const workerPhone = w.phone || w.mobile || w.contactNumber || w.phoneNumber || w.mobileNumber || "";
      result.push({
        id: w.id,
        name: w.name,
        phone: workerPhone,
        address: w.address || w.role || "Worker",
        balance: customerBalanceDue,
        totalPending: customerBalanceDue,
        displayBalance: customerBalanceDue,
        entityType: "worker",
        badgeText: "Worker",
        badgeColor: colors.accent.info || "#3B82F6",
        pendingWages,
        subInfo,
        originalData: w,
        isFavorite: !!w.isFavorite,
        isSpecial: !!w.isSpecial,
        dueDates: w.dueDates || [],
        collectorId: w.collectorId || null,
        collectorName: w.collectorName || null,
      });
    });

    // 2. Process Suppliers
    (suppliers || []).forEach((s: any) => {
      if (isClaimed(s)) return;
      claimItem(s);

      const suppBal = Number(s.balance || 0);
      const customerBalanceDue = suppBal < 0 ? Math.abs(suppBal) : 0;
      const subInfo = suppBal >= 0 
        ? `₹${suppBal.toLocaleString("en-IN")} Supplier Balance Owed`
        : `₹${Math.abs(suppBal).toLocaleString("en-IN")} Owed to Business`;

      const supplierPhone = s.phone || s.contactNumber || s.mobile || s.phoneNumber || s.supplierPhone || "";
      result.push({
        id: s.id,
        name: s.name || s.supplierName,
        phone: supplierPhone,
        address: s.address || s.materialType || "Supplier",
        balance: customerBalanceDue,
        totalPending: customerBalanceDue,
        displayBalance: customerBalanceDue,
        entityType: "supplier",
        badgeText: "Supplier",
        badgeColor: colors.accent.warning || "#F59E0B",
        supplierBalance: suppBal,
        subInfo,
        originalData: s,
        isFavorite: !!s.isFavorite,
        isSpecial: !!s.isSpecial,
        dueDates: s.dueDates || [],
        collectorId: s.collectorId || null,
        collectorName: s.collectorName || null,
      });
    });

    // 3. Process Delivery Partners
    (deliveryPartners || []).forEach((p: any) => {
      if (isClaimed(p)) return;
      claimItem(p);

      const partBal = p.totalPending !== undefined
        ? Number(p.totalPending)
        : (Number(p.totalPayable || 0) - Number(p.totalPaid || 0));
      const customerBalanceDue = partBal < 0 ? Math.abs(partBal) : 0;
      const subInfo = partBal >= 0 
        ? `₹${partBal.toLocaleString("en-IN")} Partner Payable Owed`
        : `₹${Math.abs(partBal).toLocaleString("en-IN")} Owed to Business`;

      const partnerPhone = p.phone || p.mobile || p.contactNumber || p.phoneNumber || p.driverPhone || "";
      result.push({
        id: p.id,
        name: p.name,
        phone: partnerPhone,
        address: p.vehicleNumber || p.vehicleType || "Delivery Partner",
        balance: customerBalanceDue,
        totalPending: customerBalanceDue,
        displayBalance: customerBalanceDue,
        entityType: "delivery_partner",
        badgeText: "Delivery Partner",
        badgeColor: "#9B51E0",
        partnerBalance: partBal,
        subInfo,
        originalData: p,
        isFavorite: !!p.isFavorite,
        isSpecial: !!p.isSpecial,
        dueDates: p.dueDates || [],
        collectorId: p.collectorId || null,
        collectorName: p.collectorName || null,
      });
    });

    // 4. Process Standard Customers
    (customers || []).forEach((c: any) => {
      if (isClaimed(c)) return;
      claimItem(c);

      result.push({
        ...c,
        entityType: "customer",
        badgeText: null,
        badgeColor: colors.accent.primary,
        displayBalance: Number(c.totalPending !== undefined ? c.totalPending : (c.balance || 0)),
        subInfo: c.notes || null,
        isFavorite: !!c.isFavorite,
        isSpecial: !!c.isSpecial,
      });
    });

    return result;
  }, [customers, workers, suppliers, deliveryPartners, colors]);

  const totalUnpaidBalancesSum = useMemo(() => {
    return unifiedCustomers.reduce((sum: number, item: any) => sum + Number(item.displayBalance || 0), 0);
  }, [unifiedCustomers]);

  const unpaidCustomersList = useMemo(() => {
    return unifiedCustomers.filter((c: any) => Number(c.displayBalance || 0) > 0);
  }, [unifiedCustomers]);

  const summaryMetrics = useMemo(() => {
    const totalCount = unpaidCustomersList.length;
    const totalSum = unpaidCustomersList.reduce((sum: number, c: any) => sum + Number(c.displayBalance || 0), 0);
    const overdueCount = unpaidCustomersList.filter((c: any) => {
      const lastDue = getLastDueDate(c);
      return lastDue && getDueDateStatus(lastDue) === "Overdue";
    }).length;
    const highestBalance = unpaidCustomersList.reduce((max: number, c: any) => Math.max(max, Number(c.displayBalance || 0)), 0);
    const avgBalance = totalCount > 0 ? Math.round(totalSum / totalCount) : 0;
    return { totalCount, totalSum, overdueCount, highestBalance, avgBalance };
  }, [unpaidCustomersList]);

  const filteredUnpaidList = useMemo(() => {
    return unpaidCustomersList.filter((c: any) => {
      if (summaryTypeFilter !== "All" && c.entityType !== summaryTypeFilter) return false;
      if (summarySearch.trim()) {
        const query = summarySearch.toLowerCase();
        const matchesName = (c.name || "").toLowerCase().includes(query);
        const matchesPhone = (c.phone || "").toLowerCase().includes(query);
        const matchesAddress = (c.address || "").toLowerCase().includes(query);
        if (!matchesName && !matchesPhone && !matchesAddress) return false;
      }
      return true;
    }).sort((a: any, b: any) => Number(b.displayBalance || 0) - Number(a.displayBalance || 0));
  }, [unpaidCustomersList, summaryTypeFilter, summarySearch]);

  const handleShareSummary = async () => {
    if (unpaidCustomersList.length === 0) {
      Alert.alert("No Unpaid Accounts", "There are currently no clients with unpaid balances.");
      return;
    }
    const lines = unpaidCustomersList.map((c: any, index: number) => {
      const typeStr = c.badgeText ? ` [${c.badgeText}]` : "";
      const phoneStr = c.phone ? ` - ${c.phone}` : "";
      return `${index + 1}. ${c.name}${typeStr}: ₹${Number(c.displayBalance || 0).toLocaleString("en-IN")}${phoneStr}`;
    });
    const message = `📋 CUSTOMER-WISE UNPAID SUMMARY REPORT\n` +
      `------------------------------------\n` +
      `💰 Total Outstanding: ₹${summaryMetrics.totalSum.toLocaleString("en-IN")}\n` +
      `👥 Total Unpaid Accounts: ${summaryMetrics.totalCount}\n` +
      `🚨 Overdue Accounts: ${summaryMetrics.overdueCount}\n` +
      `------------------------------------\n\n` +
      `CLIENT BREAKDOWN:\n` + lines.join("\n");

    try {
      await Share.share({ message });
    } catch (error) {
      Alert.alert("Error", "Unable to share summary report.");
    }
  };

  // Slide-up Payment Modal states
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceivedBreakdownOpen, setIsReceivedBreakdownOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState(1); // 1: Select Customer, 2: Enter Details
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDiscount, setPaymentDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [isPaymentCalendarOpen, setIsPaymentCalendarOpen] = useState<boolean>(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);

  // Edit Received Breakdown Item Modal states
  const [isEditBreakdownModalOpen, setIsEditBreakdownModalOpen] = useState(false);
  const [editingBreakdownItem, setEditingBreakdownItem] = useState<any>(null);
  const [editBreakdownAmount, setEditBreakdownAmount] = useState("");
  const [editBreakdownDiscount, setEditBreakdownDiscount] = useState("");
  const [editBreakdownMethod, setEditBreakdownMethod] = useState("Cash");
  const [editBreakdownNotes, setEditBreakdownNotes] = useState("");
  const [isSavingEditBreakdown, setIsSavingEditBreakdown] = useState(false);

  // Add Expense Modal states
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [addExpenseTitle, setAddExpenseTitle] = useState("");
  const [addExpenseCategory, setAddExpenseCategory] = useState("Miscellaneous");
  const [addExpenseStatus, setAddExpenseStatus] = useState<"Paid" | "Balance">("Paid");
  const [addExpenseTotalAmount, setAddExpenseTotalAmount] = useState("");
  const [addExpensePaidAmount, setAddExpensePaidAmount] = useState("");
  const [addExpensePaymentMethod, setAddExpensePaymentMethod] = useState("Cash");
  const [addExpenseNotes, setAddExpenseNotes] = useState("");
  const [isSavingAddExpense, setIsSavingAddExpense] = useState(false);

  const handleOpenAddExpenseModal = () => {
    setAddExpenseTitle("");
    setAddExpenseCategory("Miscellaneous");
    setAddExpenseStatus("Paid");
    setAddExpenseTotalAmount("");
    setAddExpensePaidAmount("");
    setAddExpensePaymentMethod("Cash");
    setAddExpenseNotes("");
    setIsAddExpenseModalOpen(true);
  };

  const handleSaveAddExpense = async () => {
    if (!addExpenseTitle.trim()) {
      Alert.alert("Required", "Please enter an expense title.");
      return;
    }
    const tot = parseFloat(addExpenseTotalAmount);
    if (isNaN(tot) || tot <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid total amount.");
      return;
    }

    let paidVal = tot;
    let remVal = 0;
    if (addExpenseStatus === "Balance") {
      const p = parseFloat(addExpensePaidAmount || "0");
      paidVal = isNaN(p) ? 0 : p;
      remVal = Math.max(0, tot - paidVal);
    }

    setIsSavingAddExpense(true);
    try {
      const result = await addExpense({
        title: addExpenseTitle.trim(),
        category: addExpenseCategory,
        totalAmount: tot,
        amount: tot,
        paidAmount: paidVal,
        remainingAmount: remVal,
        status: addExpenseStatus,
        paymentMethod: addExpensePaymentMethod,
        notes: addExpenseNotes.trim(),
        expenseDate: new Date(),
      });

      if (result) {
        setIsAddExpenseModalOpen(false);
        Alert.alert("Success", "New expense logged successfully!");
      } else {
        Alert.alert("Error", "Could not create expense. Please try again.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "An unexpected error occurred while saving the expense.");
    } finally {
      setIsSavingAddExpense(false);
    }
  };

  // Visiting Card Modal states
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
  const [cardName, setCardName] = useState("");
  const [cardCategory, setCardCategory] = useState("Crusher");
  const [cardContactPerson, setCardContactPerson] = useState("");
  const [cardMobile, setCardMobile] = useState("");
  const [cardAltMobile, setCardAltMobile] = useState("");
  const [cardServices, setCardServices] = useState("");
  const [cardAddress, setCardAddress] = useState("");
  const [cardNotes, setCardNotes] = useState("");
  const [cardProducts, setCardProducts] = useState<{ id: string; name: string; rate: string }[]>([
    { id: "1", name: "", rate: "" },
  ]);
  const [isSavingCard, setIsSavingCard] = useState(false);

  const handleAddCardProduct = () => {
    setCardProducts((prev) => [
      ...prev,
      { id: String(Date.now()), name: "", rate: "" },
    ]);
  };

  const handleRemoveCardProduct = (index: number) => {
    setCardProducts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateCardProduct = (index: number, field: "name" | "rate", value: string) => {
    setCardProducts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSaveVisitingCard = async () => {
    if (!cardName.trim()) {
      Alert.alert("Error", "Please enter a Name or Business Name.");
      return;
    }
    if (!cardMobile.trim()) {
      Alert.alert("Error", "Please enter a Mobile Number.");
      return;
    }

    setIsSavingCard(true);
    try {
      const validProducts = cardProducts.filter((p) => p.name.trim() !== "");
      const productsStr = validProducts
        .map((p) => (p.rate.trim() ? `${p.name.trim()} (₹${p.rate.trim()})` : p.name.trim()))
        .join(", ");

      const finalServices = [cardServices.trim(), productsStr]
        .filter(Boolean)
        .join(", ");

      const { addDoc, collection } = require("firebase/firestore");
      await addDoc(collection(db, "visiting_cards"), {
        name: cardName.trim(),
        category: cardCategory,
        contactPerson: cardContactPerson.trim(),
        mobile: cardMobile.trim(),
        altMobile: cardAltMobile.trim(),
        services: finalServices,
        products: validProducts,
        address: cardAddress.trim(),
        notes: cardNotes.trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      Alert.alert("Success", "Visiting Card saved successfully!");
      setIsAddCardModalOpen(false);
      setCardName("");
      setCardCategory("Crusher");
      setCardContactPerson("");
      setCardMobile("");
      setCardAltMobile("");
      setCardServices("");
      setCardProducts([{ id: "1", name: "", rate: "" }]);
      setCardAddress("");
      setCardNotes("");
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", "Failed to save visiting card: " + e.message);
    } finally {
      setIsSavingCard(false);
    }
  };

  // Attendance Modal states
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [attendanceEntries, setAttendanceEntries] = useState<Record<string, { status: string; overtime: string; pieces?: string }>>({});
  const [editingWorkerIds, setEditingWorkerIds] = useState<Record<string, boolean>>({});
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [showAttendanceSuccess, setShowAttendanceSuccess] = useState(false);

  // Worker Attendance Calendar Date Selection states
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState<Date>(new Date());
  const [isAttendanceCalendarModalOpen, setIsAttendanceCalendarModalOpen] = useState(false);
  const [customAttendanceDateInput, setCustomAttendanceDateInput] = useState("");

  // Daily Report Calendar Date Selection states
  const [selectedReportDate, setSelectedReportDate] = useState<Date>(new Date());
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [customDateInput, setCustomDateInput] = useState("");
  const [dailyReportFilter, setDailyReportFilter] = useState<"all" | "completed" | "pending" | "other">("all");
  const [activityLogLimit, setActivityLogLimit] = useState<number>(10);

  // Activity Log Long-Press Profile Details Modal states
  const [selectedActivityProfile, setSelectedActivityProfile] = useState<any>(null);
  const [isActivityProfileModalOpen, setIsActivityProfileModalOpen] = useState(false);

  // Re-calculate inventory stock value reactively (finished products only)
  const finishedItems = (items || []).filter((item: any) => item.itemType !== "raw_material");

  // Selling price stock value
  const stockValue = finishedItems.reduce((sum: number, item: any) => {
    const currentStock =
      item.openingStock !== undefined ? item.openingStock : item.stock || 0;
    const rate = item.sellingRate || item.sellingPrice || 0;
    return sum + Number(currentStock) * Number(rate);
  }, 0);

  // Cost price stock value
  const stockCostValue = finishedItems.reduce((sum: number, item: any) => {
    const currentStock =
      item.openingStock !== undefined ? item.openingStock : item.stock || 0;
    const cost = item.costPrice || 0;
    return sum + Number(currentStock) * Number(cost);
  }, 0);

  // Profit margin in stock
  const stockProfit = stockValue - stockCostValue;

  // Compute payment metrics safely for current date
  const todayStartKey = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const ordersReceivedToday = useMemo(() => {
    return (orders || [])
      .filter((o: any) => {
        const oDate = o.createdAt instanceof Date ? o.createdAt : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt));
        const oTime = new Date(oDate).setHours(0, 0, 0, 0);
        return oTime === todayStartKey;
      })
      .reduce((sum: number, o: any) => {
        let paid = 0;
        if (o.amountPaid !== undefined) paid = Number(o.amountPaid || 0);
        else if (o.paidAmount !== undefined) paid = Number(o.paidAmount || 0);
        else if (o.advancePaid !== undefined) paid = Number(o.advancePaid || 0);
        else if (o.paymentStatus === "Paid" || o.paymentStatus === "fully" || o.paymentStatus === "Fully Paid") paid = Number(o.total || 0);
        else if (o.remainingBalance !== undefined) paid = Math.max(0, Number(o.total || 0) - Number(o.remainingBalance || 0));
        return sum + paid;
      }, 0);
  }, [orders, todayStartKey]);

  const paymentsReceivedToday = useMemo(() => {
    return (payments || [])
      .filter((p: any) => {
        const isOrderPayment = !!p.orderId || (p.notes && (
          p.notes.toLowerCase().includes("order payment") ||
          p.notes.toLowerCase().includes("payment for order") ||
          p.notes.toLowerCase().includes("order #")
        ));
        if (isOrderPayment) return false;
        const pDate = p.createdAt instanceof Date ? p.createdAt : (p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || p.paymentDate || p.date || p.timestamp || Date.now()));
        const pTime = new Date(pDate).setHours(0, 0, 0, 0);
        return pTime === todayStartKey;
      })
      .reduce((sum: number, p: any) => sum + Number(p.amountReceived || p.amount || 0), 0);
  }, [payments, todayStartKey]);

  const totalReceivedToday = useMemo(() => {
    return ordersReceivedToday + paymentsReceivedToday;
  }, [ordersReceivedToday, paymentsReceivedToday]);

  // Pull to refresh simulation
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      setSyncTime(`Synced at ${time}`);
    }, 1200);
  };

  const handleSavePayment = async () => {
    if (!selectedCustomer || isSavingPayment) return;
    const amountNum = parseFloat(paymentAmount) || 0;
    const discountNum = parseFloat(paymentDiscount) || 0;

    if (amountNum <= 0 && discountNum <= 0) {
      Alert.alert(
        "Invalid Entry",
        "Please enter a payment amount or a discount / waiver amount.",
      );
      return;
    }

    if (amountNum < 0 || discountNum < 0) {
      Alert.alert("Invalid Entry", "Amounts cannot be negative.");
      return;
    }

    const customerPending = Number(
      selectedCustomer.totalPending !== undefined
        ? selectedCustomer.totalPending
        : selectedCustomer.balance || 0,
    );

    if (customerPending > 0 && (amountNum + discountNum) > customerPending) {
      Alert.alert(
        "Excessive Amount",
        `Total payment + discount (₹${(amountNum + discountNum).toLocaleString("en-IN")}) cannot exceed customer's pending balance of ₹${customerPending.toLocaleString("en-IN")}.`,
      );
      return;
    }

    const now = new Date();
    const saveDate = new Date(paymentDate);
    const isSaveDateOnly = (d: Date) => {
      if (!d || isNaN(d.getTime())) return true;
      const isLocalMidnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
      const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
      const isIstUtcMidnight = d.getHours() === 5 && d.getMinutes() === 30 && d.getSeconds() === 0;
      return isLocalMidnight || isUtcMidnight || isIstUtcMidnight;
    };
    if (
      saveDate.getFullYear() === now.getFullYear() &&
      saveDate.getMonth() === now.getMonth() &&
      saveDate.getDate() === now.getDate()
    ) {
      saveDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    } else if (isSaveDateOnly(saveDate)) {
      saveDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    }

    setIsSavingPayment(true);
    const result = await addPayment({
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      amountReceived: amountNum,
      discountAmount: discountNum,
      paymentMethod,
      notes: paymentNotes.trim(),
      createdAt: saveDate,
    });
    setIsSavingPayment(false);

    if (result) {
      setShowSuccessAnim(true);
      setPaymentAmount("");
      setPaymentDiscount("");
      setPaymentNotes("");
      setPaymentMethod("Cash");
      setPaymentDate(new Date());
      setCustomerSearch("");
      setSelectedCustomer(null);
      setTimeout(() => {
        setShowSuccessAnim(false);
        setIsPaymentModalOpen(false);
        setPaymentStep(1);
        onRefresh();
      }, 1600);
    } else {
      Alert.alert(
        "Transaction Failed",
        "Could not complete payment transaction. Please try again.",
      );
    }
  };

  const handleClosePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setPaymentStep(1);
    setSelectedCustomer(null);
    setPaymentAmount("");
    setPaymentDiscount("");
    setPaymentNotes("");
    setPaymentMethod("Cash");
    setPaymentDate(new Date());
    setCustomerSearch("");
    setShowSuccessAnim(false);
  };

  const handleOpenEditBreakdownItem = (item: any) => {
    setEditingBreakdownItem(item);
    setEditBreakdownAmount(String(item.amount || ""));
    setEditBreakdownDiscount(String(item.rawObject?.discountAmount || ""));
    setEditBreakdownMethod(item.method || "Cash");
    setEditBreakdownNotes(item.rawObject?.notes || item.subtitle || "");
    setIsEditBreakdownModalOpen(true);
  };

  const handleSaveEditBreakdownItem = async () => {
    if (!editingBreakdownItem || isSavingEditBreakdown) return;
    const newAmt = parseFloat(editBreakdownAmount) || 0;
    const newDisc = parseFloat(editBreakdownDiscount) || 0;

    if (newAmt <= 0 && newDisc <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount or discount greater than zero.");
      return;
    }

    setIsSavingEditBreakdown(true);
    try {
      if (editingBreakdownItem.id.startsWith("payment-")) {
        const paymentId = editingBreakdownItem.rawId || editingBreakdownItem.id.replace("payment-", "");
        const oldObj = editingBreakdownItem.rawObject || {};
        const updatedData = {
          amountReceived: newAmt,
          discountAmount: newDisc,
          paymentMethod: editBreakdownMethod,
          notes: editBreakdownNotes.trim(),
          createdAt: editingBreakdownItem.time || oldObj.createdAt || new Date(),
        };
        const success = await editPayment(paymentId, updatedData, oldObj);
        if (success) {
          setIsEditBreakdownModalOpen(false);
          setEditingBreakdownItem(null);
          Alert.alert("Success", "Payment updated successfully.");
        } else {
          Alert.alert("Error", "Failed to update payment.");
        }
      } else if (editingBreakdownItem.id.startsWith("order-paid-")) {
        const orderId = editingBreakdownItem.rawId || editingBreakdownItem.id.replace("order-paid-", "");
        const orderObj = (orders || []).find((o: any) => o.id === orderId) || editingBreakdownItem.rawObject;
        if (orderObj) {
          const orderTotal = Number(orderObj.total || 0);
          const newBalance = Math.max(0, orderTotal - newAmt);
          const success = await editOrder(orderId, {
            ...orderObj,
            paidAmount: newAmt,
            amountPaid: newAmt,
            advancePaid: newAmt,
            balanceDue: newBalance,
            paymentMethod: editBreakdownMethod,
            updatedAt: new Date(),
          }, orderObj);
          if (success) {
            setIsEditBreakdownModalOpen(false);
            setEditingBreakdownItem(null);
            Alert.alert("Success", "Order payment updated successfully.");
          } else {
            Alert.alert("Error", "Failed to update order payment.");
          }
        }
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to save changes.");
    } finally {
      setIsSavingEditBreakdown(false);
    }
  };

  const handleDeleteBreakdownItem = (item: any) => {
    Alert.alert(
      "Delete Payment Entry",
      `Are you sure you want to delete this payment of ₹${item.amount.toLocaleString("en-IN")} from ${item.title}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (item.id.startsWith("payment-")) {
                const paymentId = item.rawId || item.id.replace("payment-", "");
                const success = await deletePayment(paymentId);
                if (success) {
                  // If this payment was linked to an order, also subtract the amount from the order's paidAmount
                  const linkedOrderId = item.rawObject?.orderId;
                  if (linkedOrderId) {
                    const orderObj = (orders || []).find((o: any) => o.id === linkedOrderId);
                    if (orderObj) {
                      const currentPaid = Number(orderObj.paidAmount || orderObj.amountPaid || orderObj.advancePaid || 0);
                      const deletedAmt = Number(item.amount || 0);
                      const newPaid = Math.max(0, currentPaid - deletedAmt);
                      const orderTotal = Number(orderObj.total || 0);
                      const newBalanceDue = Math.max(0, orderTotal - newPaid);
                      try {
                        await editOrder(linkedOrderId, {
                          ...orderObj,
                          paidAmount: newPaid,
                          amountPaid: newPaid,
                          advancePaid: newPaid,
                          balanceDue: newBalanceDue,
                          paymentStatus: newPaid <= 0 ? "PENDING" : (newPaid >= orderTotal ? "Paid" : "balance"),
                          updatedAt: new Date(),
                        }, orderObj);
                      } catch (e) {
                        console.error("Failed to update linked order after payment delete:", e);
                      }
                    }
                  }
                  Alert.alert("Success", "Payment deleted successfully.");
                } else {
                  Alert.alert("Error", "Failed to delete payment.");
                }
              } else if (item.id.startsWith("order-paid-")) {
                const orderId = item.rawId || item.id.replace("order-paid-", "");
                const orderObj = (orders || []).find((o: any) => o.id === orderId);
                if (orderObj) {
                  const orderTotal = Number(orderObj.total || 0);
                  const success = await editOrder(orderId, {
                    ...orderObj,
                    paidAmount: 0,
                    amountPaid: 0,
                    advancePaid: 0,
                    balanceDue: orderTotal,
                    paymentStatus: "PENDING",
                    updatedAt: new Date(),
                  }, orderObj);
                  if (success) {
                    Alert.alert("Success", "Order payment entry deleted successfully.");
                  } else {
                    Alert.alert("Error", "Failed to delete order payment entry.");
                  }
                } else {
                  await deleteOrder(orderId);
                  Alert.alert("Success", "Order deleted successfully.");
                }
              }
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Failed to delete item.");
            }
          },
        },
      ]
    );
  };

  // Attendance helpers
  const activeWorkers = useMemo(() => {
    const regular = (workers || [])
      .filter((w: any) => w.status === "Active")
      .map((w: any) => ({ ...w, type: "regular" }));
    const contract = (contractWorkers || [])
      .filter((cw: any) => cw.status === "Active")
      .map((cw: any) => ({
        ...cw,
        type: "contract",
        role: `Contract (${cw.contractSystem || cw.contractType || "Fixed"})`
      }));
    return [...regular, ...contract];
  }, [workers, contractWorkers]);

  const selectedAttendanceTargetKey = useMemo(() => {
    const d = new Date(selectedAttendanceDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [selectedAttendanceDate]);

  const shiftAttendanceDate = (days: number) => {
    const d = new Date(selectedAttendanceDate);
    d.setDate(d.getDate() + days);
    setSelectedAttendanceDate(d);
    setAttendanceEntries({});
    setEditingWorkerIds({});
  };

  const attendanceListForSelectedDate = useMemo(() => {
    const list = allAttendance || todayAttendance || [];
    return list.filter((a: any) => {
      if (!a.createdAt) return false;
      const d = a.createdAt instanceof Date ? a.createdAt : (a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt));
      if (isNaN(d.getTime())) return false;
      const itemDay = new Date(d).setHours(0, 0, 0, 0);
      return itemDay === selectedAttendanceTargetKey;
    });
  }, [allAttendance, todayAttendance, selectedAttendanceTargetKey]);

  const todayAttendanceMap = useMemo(() => {
    const map: Record<string, any> = {};
    (attendanceListForSelectedDate || []).forEach((a: any) => {
      if (!a.workerId) return;
      if (
        !map[a.workerId] ||
        (a.createdAt &&
          map[a.workerId].createdAt &&
          new Date(a.createdAt).getTime() > new Date(map[a.workerId].createdAt).getTime())
      ) {
        map[a.workerId] = a;
      }
    });
    return map;
  }, [attendanceListForSelectedDate]);

  const availableAttendanceDates = useMemo(() => {
    const parseDate = (val: any) => {
      if (!val) return new Date();
      if (val instanceof Date) return val;
      if (typeof val.toDate === "function") return val.toDate();
      if (typeof val.seconds === "number") return new Date(val.seconds * 1000);
      const d = new Date(val);
      return isNaN(d.getTime()) ? new Date() : d;
    };

    const datesMap: Record<number, { timestamp: number; count: number; units: number }> = {};

    (allAttendance || todayAttendance || []).forEach((a: any) => {
      if (!a.createdAt) return;
      const d = parseDate(a.createdAt);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      if (!datesMap[key]) {
        datesMap[key] = { timestamp: key, count: 0, units: 0 };
      }
      datesMap[key].count += 1;
      datesMap[key].units += Number(a.piecesProduced || 0);
    });

    // Ensure Today is always in the list
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.getTime();
    if (!datesMap[todayKey]) {
      datesMap[todayKey] = { timestamp: todayKey, count: 0, units: 0 };
    }

    return Object.values(datesMap).sort((a, b) => b.timestamp - a.timestamp);
  }, [allAttendance, todayAttendance]);

  const attendanceSummary = useMemo(() => {
    let present = 0;
    let halfDay = 0;
    let absent = 0;
    const uniqueRecords = Object.values(todayAttendanceMap);
    uniqueRecords.forEach((a: any) => {
      if (a.status === "present") present++;
      else if (a.status === "half-day") halfDay++;
      else if (a.status === "absent") absent++;
    });
    return { present, halfDay, absent, total: uniqueRecords.length };
  }, [todayAttendanceMap]);

  const totalUnitsProduced = useMemo(() => {
    return Object.values(todayAttendanceMap).reduce(
      (sum: number, a: any) => sum + Number(a.piecesProduced || 0),
      0
    );
  }, [todayAttendanceMap]);

  const handleOpenAttendanceModal = () => {
    const initial: Record<string, { status: string; overtime: string; pieces?: string }> = {};
    activeWorkers.forEach((w: any) => {
      if (!todayAttendanceMap[w.id]) {
        const defaultPieces = w.billingSystem === "Piece-Rate" 
          ? String(w.lastPiecesProduced !== undefined ? w.lastPiecesProduced : (w.perDayBagsCount || "0")) 
          : "0";
        initial[w.id] = { status: "present", overtime: "0", pieces: defaultPieces };
      }
    });
    setAttendanceEntries(initial);
    setAttendanceSearch("");
    setShowAttendanceSuccess(false);
    setIsAttendanceModalOpen(true);
  };

  const handleCloseAttendanceModal = () => {
    setIsAttendanceModalOpen(false);
    setAttendanceEntries({});
    setEditingWorkerIds({});
    setAttendanceSearch("");
    setShowAttendanceSuccess(false);
  };

  const setWorkerStatus = (workerId: string, status: string) => {
    const w = activeWorkers.find((worker: any) => worker.id === workerId);
    const defaultPieces = w?.billingSystem === "Piece-Rate" 
      ? String(w.lastPiecesProduced !== undefined ? w.lastPiecesProduced : (w.perDayBagsCount || "0")) 
      : "0";
    setAttendanceEntries((prev) => ({
      ...prev,
      [workerId]: {
        ...prev[workerId],
        status,
        overtime: status === "absent" ? "0" : (prev[workerId]?.overtime || "0"),
        pieces: status === "absent" ? "0" : (prev[workerId]?.pieces && prev[workerId]?.pieces !== "0" ? prev[workerId].pieces : defaultPieces)
      },
    }));
  };

  const setWorkerOvertime = (workerId: string, overtime: string) => {
    setAttendanceEntries((prev) => ({
      ...prev,
      [workerId]: { ...prev[workerId], overtime },
    }));
  };

  const setWorkerPieces = (workerId: string, pieces: string) => {
    setAttendanceEntries((prev) => ({
      ...prev,
      [workerId]: { ...prev[workerId], pieces },
    }));
  };

  const handleMarkAllPresent = () => {
    const updated: Record<string, { status: string; overtime: string; pieces?: string }> = {};
    activeWorkers.forEach((w: any) => {
      if (!todayAttendanceMap[w.id]) {
        const defaultPieces = w.billingSystem === "Piece-Rate"
          ? String(w.lastPiecesProduced !== undefined ? w.lastPiecesProduced : (w.perDayBagsCount || "0"))
          : "0";
        updated[w.id] = {
          status: "present",
          overtime: attendanceEntries[w.id]?.overtime || "0",
          pieces: attendanceEntries[w.id]?.pieces && attendanceEntries[w.id]?.pieces !== "0"
            ? attendanceEntries[w.id].pieces
            : defaultPieces
        };
      }
    });
    setAttendanceEntries(updated);
  };

  const handleMarkAllAbsent = () => {
    const updated: Record<string, { status: string; overtime: string }> = {};
    activeWorkers.forEach((w: any) => {
      if (!todayAttendanceMap[w.id]) {
        updated[w.id] = { status: "absent", overtime: "0" };
      }
    });
    setAttendanceEntries(updated);
  };

  const handleSaveAttendance = async () => {
    const entries = Object.entries(attendanceEntries);
    if (entries.length === 0) {
      Alert.alert("No changes", "No attendance changes to save.");
      return;
    }

    setIsSavingAttendance(true);
    try {
      const newEntries: any[] = [];
      for (const [workerId, data] of entries) {
        const w = activeWorkers.find((worker: any) => worker.id === workerId);
        const workerType = w?.type || "regular";

        const piecesToSave = data.status !== "absent" ? (Number(data.pieces) || 0) : 0;
        if (todayAttendanceMap[workerId]) {
          await editTodayAttendance(workerId, {
            status: data.status,
            overtimeHours: Number(data.overtime) || 0,
            piecesProduced: piecesToSave,
            notes: "",
          }, workerType, selectedAttendanceDate);
        } else {
          newEntries.push({
            workerId,
            status: data.status,
            overtimeHours: Number(data.overtime) || 0,
            piecesProduced: piecesToSave,
            workerType,
          });
        }
      }

      if (newEntries.length > 0) {
        const uniqueNewEntries = Array.from(
          new Map(newEntries.map((e) => [e.workerId, e])).values()
        );
        const result = await bulkLogAttendance(uniqueNewEntries, selectedAttendanceDate);
        // Check if a low-stock error was returned
        if (result && !Array.isArray(result) && result.error) {
          Alert.alert("⚠️ Stock Alert", result.message);
          return;
        }
      }

      setShowAttendanceSuccess(true);
      setTimeout(() => {
        setShowAttendanceSuccess(false);
        setIsAttendanceModalOpen(false);
        setAttendanceEntries({});
        setEditingWorkerIds({});
      }, 1600);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to save some attendance records.");
    } finally {
      setIsSavingAttendance(false);
    }
  };

  const handleQuickSaveAllStatus = async (status: "present" | "half-day" | "absent") => {
    const unmarkedWorkers = activeWorkers.filter((w: any) => !todayAttendanceMap[w.id]);
    
    if (unmarkedWorkers.length === 0) {
      Alert.alert("All Marked", `All workers have already been marked for ${getDayLabel(selectedAttendanceTargetKey)}.`);
      return;
    }

    setIsSavingAttendance(true);
    try {
      const newEntries = unmarkedWorkers.map((w: any) => {
        const lastPieces = w.lastPiecesProduced !== undefined
          ? Number(w.lastPiecesProduced)
          : Number(w.perDayBagsCount || 0);
        return {
          workerId: w.id,
          status: status,
          overtimeHours: 0,
          piecesProduced: status !== "absent" && w.billingSystem === "Piece-Rate" ? lastPieces : 0,
          workerType: w.type || "regular",
        };
      });

      const result = await bulkLogAttendance(newEntries, selectedAttendanceDate);
      // Check if a low-stock error was returned
      if (result && !Array.isArray(result) && (result as any).error) {
        Alert.alert("⚠️ Stock Alert", (result as any).message);
        return;
      }
      const statusLabel = status === "half-day" ? "Half Day" : status === "present" ? "Present" : "Absent";
      Alert.alert("Success", `Marked remaining ${unmarkedWorkers.length} workers as ${statusLabel} for ${getDayLabel(selectedAttendanceTargetKey)}.`);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to save attendance.");
    } finally {
      setIsSavingAttendance(false);
    }
  };

  const selectedTargetKey = useMemo(() => {
    const d = new Date(selectedReportDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [selectedReportDate]);

  const shiftReportDate = (days: number) => {
    const d = new Date(selectedReportDate);
    d.setDate(d.getDate() + days);
    setSelectedReportDate(d);
  };

  const availableReportDates = useMemo(() => {
    const parseDate = (val: any) => {
      if (!val) return new Date();
      if (val instanceof Date) return val;
      if (typeof val.toDate === "function") return val.toDate();
      if (typeof val.seconds === "number") return new Date(val.seconds * 1000);
      const d = new Date(val);
      return isNaN(d.getTime()) ? new Date() : d;
    };

    const datesMap: Record<number, { timestamp: number; count: number }> = {};

    const addTime = (val: any) => {
      if (!val) return;
      const d = parseDate(val);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      if (!datesMap[key]) {
        datesMap[key] = { timestamp: key, count: 0 };
      }
      datesMap[key].count += 1;
    };

    (orders || []).forEach((o: any) => {
      addTime(o.orderedDate || o.createdAt);
      if (o.completedAt) addTime(o.completedAt);
      if (o.updatedAt) addTime(o.updatedAt);
      if (Array.isArray(o.deliveries)) {
        o.deliveries.forEach((del: any) => {
          if (del && del.date) addTime(del.date);
        });
      }
    });
    (payments || []).forEach((p: any) => addTime(p.createdAt || p.paymentDate || p.date || p.timestamp || p.updatedAt));
    (expenses || []).forEach((e: any) => addTime(e.expenseDate || e.createdAt));
    (rawLogs || []).forEach((l: any) => addTime(l.date || l.createdAt));
    (allAttendance || todayAttendance || []).forEach((a: any) => addTime(a.createdAt));

    // Ensure Today is always in the list
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.getTime();
    if (!datesMap[todayKey]) {
      datesMap[todayKey] = { timestamp: todayKey, count: 0 };
    }

    return Object.values(datesMap).sort((a, b) => b.timestamp - a.timestamp);
  }, [orders, payments, expenses, rawLogs, allAttendance, todayAttendance]);

  // Combined activity daily report feed filtered for selectedReportDate
  const dailyReportFeed = useMemo(() => {
    const parseDate = (val: any): Date | null => {
      if (!val) return null;
      if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
      if (typeof val.toDate === "function") {
        try {
          const d = val.toDate();
          return isNaN(d.getTime()) ? null : d;
        } catch {
          return null;
        }
      }
      if (typeof val.seconds === "number") {
        const d = new Date(val.seconds * 1000 + (val.nanoseconds ? Math.floor(val.nanoseconds / 1000000) : 0));
        return isNaN(d.getTime()) ? null : d;
      }
      if (typeof val.toMillis === "function") {
        try {
          const d = new Date(val.toMillis());
          return isNaN(d.getTime()) ? null : d;
        } catch {
          return null;
        }
      }
      if (typeof val === "number") {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      }
      if (typeof val === "string") {
        const dateOnlyMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnlyMatch) {
          const year = parseInt(dateOnlyMatch[1], 10);
          const month = parseInt(dateOnlyMatch[2], 10) - 1;
          const day = parseInt(dateOnlyMatch[3], 10);
          return new Date(year, month, day);
        }
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    };

    const isDateOnly = (d: Date | null): boolean => {
      if (!d || isNaN(d.getTime())) return true;
      const isLocalMidnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
      const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
      const isIstUtcMidnight = d.getHours() === 5 && d.getMinutes() === 30 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
      return isLocalMidnight || isUtcMidnight || isIstUtcMidnight;
    };

    const getBestActivityDate = (...vals: any[]): Date => {
      let firstValidDate: Date | null = null;
      for (const val of vals) {
        if (!val) continue;
        const parsed = parseDate(val);
        if (!parsed) continue;
        if (!firstValidDate) {
          firstValidDate = parsed;
        }
        if (!isDateOnly(parsed)) {
          if (firstValidDate && isDateOnly(firstValidDate) && (firstValidDate.getFullYear() !== parsed.getFullYear() || firstValidDate.getMonth() !== parsed.getMonth() || firstValidDate.getDate() !== parsed.getDate())) {
            const combined = new Date(firstValidDate);
            combined.setHours(parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), parsed.getMilliseconds());
            return combined;
          }
          return parsed;
        }
      }
      return firstValidDate || new Date();
    };

    const customerMap: Record<string, any> = {};
    (customers || []).forEach((c: any) => {
      if (c.id) {
        customerMap[c.id] = c;
      }
    });

    const getCustomerName = (item: any) => {
      if (item.customerId && customerMap[item.customerId]) {
        const c = customerMap[item.customerId];
        return String(c.name || c.customerName || "General Client").trim();
      }
      const raw = item.customerName || item.clientName || item.customer || item.name;
      if (raw && String(raw).trim() !== "General Client" && String(raw).trim() !== "") {
        return String(raw).trim();
      }
      return "General Client";
    };

    const targetKey = selectedTargetKey;

    // Combine all activities
    const allActivities = [
      ...(orders || []).map((o: any) => {
        const orderItems = Array.isArray(o.items) && o.items.length > 0 ? o.items : [];
        const totalQty = orderItems.length > 0
          ? orderItems.reduce((sum: number, itm: any) => sum + Number(itm.quantity || 0), 0)
          : Number(o.quantity || 0);
        const deliveredQty = Number(o.deliveredQuantity || 0);
        const isCancelled = o.status === "cancelled";
        const isFullyCompleted = !isCancelled && (o.status === "completed" || (totalQty > 0 && deliveredQty >= totalQty));
        const isPartial = !isCancelled && !isFullyCompleted && deliveredQty > 0;

        let completedTimeVal = o.orderedDate || o.createdAt;
        if (isFullyCompleted) {
          if (Array.isArray(o.deliveries) && o.deliveries.length > 0) {
            const lastDel = o.deliveries[o.deliveries.length - 1];
            if (lastDel && lastDel.date) {
              completedTimeVal = lastDel.date;
            } else if (o.completedAt) {
              completedTimeVal = o.completedAt;
            } else if (o.updatedAt) {
              completedTimeVal = o.updatedAt;
            }
          } else if (o.completedAt) {
            completedTimeVal = o.completedAt;
          } else if (o.updatedAt) {
            completedTimeVal = o.updatedAt;
          }
        }
        const completedTime = parseDate(completedTimeVal) || parseDate(o.orderedDate || o.createdAt) || new Date();

        const totalAmount = Number(o.total || 0);
        let amountPaid = 0;
        if (o.amountPaid !== undefined) {
          amountPaid = Number(o.amountPaid || 0);
        } else if (o.paidAmount !== undefined) {
          amountPaid = Number(o.paidAmount || 0);
        } else if (o.advancePaid !== undefined) {
          amountPaid = Number(o.advancePaid || 0);
        } else if (o.paymentStatus === "Paid" || o.paymentStatus === "fully" || o.paymentStatus === "Fully Paid") {
          amountPaid = totalAmount;
        } else if (o.remainingBalance !== undefined) {
          amountPaid = Math.max(0, totalAmount - Number(o.remainingBalance || 0));
        } else if (o.balance !== undefined) {
          amountPaid = Math.max(0, totalAmount - Number(o.balance || 0));
        }

        const customerObj = o.customerId ? customerMap[o.customerId] : null;
        let customerTotalBalance = 0;
        if (customerObj) {
          customerTotalBalance = Number(customerObj.balance !== undefined ? customerObj.balance : (customerObj.pendingBalance || 0));
        } else {
          customerTotalBalance = Math.max(0, totalAmount - amountPaid);
        }

        const createdDate = getBestActivityDate(o.orderedDate, o.createdAt, o.date);

        return {
          id: `order-${o.id}`,
          rawId: o.id,
          rawOrder: o,
          customerId: o.customerId,
          type: "order" as const,
          title: getCustomerName(o),
          baseSubtitle: `${o.itemName || "Items"} (${totalQty || 0} qty)`,
          amount: totalAmount,
          amountPaid,
          balanceDue: customerTotalBalance,
          isPositive: false,
          time: createdDate,
          completedTime,
          isFullyCompleted,
          isPartial,
          isCancelled,
          deliveredQty,
          totalQty,
        };
      }),
      ...(payments || []).map((p: any) => {
        let orderTimestamp = null;
        if (p.orderId) {
          const matchedOrder = (orders || []).find((o: any) => o.id === p.orderId);
          if (matchedOrder && (matchedOrder.createdAt || matchedOrder.orderedDate)) {
            orderTimestamp = matchedOrder.createdAt || matchedOrder.orderedDate;
          }
        }
        return {
          id: `payment-${p.id}`,
          rawId: p.id,
          rawObject: p,
          customerId: p.customerId,
          orderId: p.orderId,
          notes: p.notes,
          type: "payment" as const,
          title: getCustomerName(p),
          subtitle: `Payment via ${p.paymentMethod || p.paymentMode || p.paymentType || "Cash"}${p.notes ? ` • ${p.notes}` : ""}`,
          amount: Number(p.amountReceived || p.amount || 0),
          isPositive: true,
          time: getBestActivityDate(p.createdAt, p.paymentDate, p.date, p.timestamp, p.time, p.updatedAt, p.created_at, p.payDate, orderTimestamp),
          icon: "account-balance-wallet" as const,
          iconColor: colors.accent.success,
        };
      }),
      ...(expenses || []).map((e: any) => ({
        id: `expense-${e.id}`,
        rawId: e.id,
        type: "expense" as const,
        title: e.title || e.category || "Business Expense",
        subtitle: e.notes || (e.title && e.category ? e.category : "Recorded Expense"),
        amount: Number(e.totalAmount || e.amount || 0),
        isPositive: false,
        time: getBestActivityDate(e.expenseDate, e.createdAt, e.updatedAt),
        icon: "money-off" as const,
        iconColor: colors.accent.danger,
      })),
      ...(rawLogs || []).filter((l: any) => l.type === "purchase").map((l: any) => ({
        id: `raw-${l.id}`,
        rawId: l.id,
        materialId: l.materialId,
        type: "raw_material" as const,
        title: `Bought ${l.materialName || l.itemName || "Raw Material"}`,
        subtitle: `From ${l.supplierName || "Supplier"}${l.notes ? ` • ${l.notes}` : ""}`,
        amount: Number(l.totalAmount || l.amount || 0),
        isPositive: false,
        isRawMaterial: true,
        qtyDisplay: `${l.quantity || 0} ${l.unit || 'bags'}`,
        time: getBestActivityDate(l.date, l.createdAt, l.updatedAt),
        icon: "layers" as const,
        iconColor: colors.accent.warning,
      })),
      ...(rawLogs || []).filter((l: any) => l.type === "consumption" && Number(l.quantity || 0) > 0).map((l: any) => ({
        id: `raw-use-${l.id}`,
        rawId: l.id,
        materialId: l.materialId,
        type: "raw_material_use" as const,
        title: `Used ${l.materialName || l.itemName || "Raw Material"}`,
        subtitle: `Consumption log${l.notes ? ` • ${l.notes}` : ""}`,
        amount: 0,
        isPositive: false,
        isRawMaterial: true,
        qtyDisplay: `${l.quantity || 0} ${l.unit || 'bags'}`,
        time: getBestActivityDate(l.date, l.createdAt, l.updatedAt),
        icon: "build" as const,
        iconColor: colors.accent.info,
      })),
    ];

    const dayActivities: any[] = [];
    let totalSales = 0;
    let totalReceived = 0;
    let totalExpenses = 0;

    allActivities.forEach((act) => {
      const actDate = new Date(act.time);
      actDate.setHours(0, 0, 0, 0);
      const actTime = actDate.getTime();

      if (act.type === "order") {
        const o = act.rawOrder || act;
        const createdDate = new Date(act.time);
        createdDate.setHours(0, 0, 0, 0);
        const createdTimeKey = createdDate.getTime();

        const completedDate = new Date(act.completedTime || act.time);
        completedDate.setHours(0, 0, 0, 0);
        const completedTimeKey = completedDate.getTime();

        // On creation date, add the paid/advance amount of the order to totalReceived
        if (createdTimeKey === targetKey && (act.amountPaid || 0) > 0) {
          totalReceived += Number(act.amountPaid || 0);
        }

        // If order was created after targetKey, it didn't exist yet on targetKey
        if (createdTimeKey > targetKey) {
          return;
        }

        const createdDateStr = createdDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
        const deliveryProgressStr = act.totalQty > 0 ? ` • Delivered: ${act.deliveredQty}/${act.totalQty}` : "";

        if (act.isCancelled) {
          const cancelledDate = parseDate(o.updatedAt || o.createdAt) || new Date();
          cancelledDate.setHours(0, 0, 0, 0);
          const cancelledTimeKey = cancelledDate.getTime();

          if (createdTimeKey === targetKey || cancelledTimeKey === targetKey) {
            dayActivities.push({
              ...act,
              statusText: "Cancelled",
              statusBadgeColor: colors.accent.danger || "#EF4444",
              icon: "cancel" as const,
              iconColor: colors.accent.danger || "#EF4444",
              isFullyCompleted: false,
              isCancelled: true,
              subtitle: `${act.baseSubtitle}${deliveryProgressStr}`,
            });
          }
          return;
        }

        if (act.isFullyCompleted) {
          // If the order was completed on a previous day before targetKey:
          // it was already completed in the past, so do not carry over to targetKey!
          if (completedTimeKey < targetKey) {
            return;
          }

          // If the order was completed ON targetKey:
          if (completedTimeKey === targetKey) {
            const isCarriedOver = createdTimeKey < targetKey;
            dayActivities.push({
              ...act,
              time: act.completedTime || act.time,
              statusText: "Fully Complete",
              statusBadgeColor: colors.accent.success || "#10B981",
              icon: "check-circle" as const,
              iconColor: colors.accent.success || "#10B981",
              isFullyCompleted: true,
              isCarriedOver,
              subtitle: isCarriedOver
                ? `${act.baseSubtitle}${deliveryProgressStr} • Ordered ${createdDateStr} • Completed Today`
                : `${act.baseSubtitle}${deliveryProgressStr}`,
            });

            totalSales += act.amount;
            return;
          }

          // If completedTimeKey > targetKey (e.g. created on Day 1, completed on Day 2, and now viewing Day 1):
          // On targetKey (Day 1), the order was NOT completed yet — on Day 1 it was PENDING!
          const isCarriedOver = createdTimeKey < targetKey;
          dayActivities.push({
            ...act,
            statusText: "Pending",
            statusBadgeColor: colors.accent.primary || "#3B82F6",
            icon: "pending-actions" as const,
            iconColor: colors.accent.primary || "#3B82F6",
            isFullyCompleted: false,
            isCarriedOver,
            subtitle: isCarriedOver
              ? `${act.baseSubtitle}${deliveryProgressStr} • Ordered ${createdDateStr}`
              : `${act.baseSubtitle}${deliveryProgressStr}`,
          });
          return;
        }

        // Pending / Incomplete order (not yet completed anywhere):
        // Shows as Pending on targetKey from creation date onwards
        const isCarriedOver = createdTimeKey < targetKey;
        const statusText = act.isPartial ? `Partial (${act.deliveredQty}/${act.totalQty})` : "Pending";
        const statusBadgeColor = act.isPartial ? (colors.accent.warning || "#F59E0B") : (colors.accent.primary || "#3B82F6");
        const iconName = act.isPartial ? "local-shipping" : "pending-actions";

        dayActivities.push({
          ...act,
          statusText,
          statusBadgeColor,
          icon: iconName as any,
          iconColor: statusBadgeColor,
          isFullyCompleted: false,
          isCarriedOver,
          subtitle: isCarriedOver
            ? `${act.baseSubtitle}${deliveryProgressStr} • Ordered ${createdDateStr}`
            : `${act.baseSubtitle}${deliveryProgressStr}`,
        });
      } else {
        // Payments, expenses, raw materials show on their exact date
        if (actTime === targetKey) {
          if (act.type === "payment") {
            const isOrderPayment = !!act.orderId || (act.notes && (
              act.notes.toLowerCase().includes("order payment") ||
              act.notes.toLowerCase().includes("payment for order") ||
              act.notes.toLowerCase().includes("order #")
            ));
            if (!isOrderPayment) {
              dayActivities.push(act);
              totalReceived += act.amount;
            }
          } else {
            dayActivities.push(act);
            if (act.type === "expense" || act.type === "raw_material") {
              totalExpenses += act.amount;
            }
          }
        }
      }
    });

    const dayAtt = (allAttendance || todayAttendance || []).filter((att: any) => {
      const attDate = new Date(att.createdAt);
      attDate.setHours(0, 0, 0, 0);
      return attDate.getTime() === targetKey;
    });
    const bagsSum = dayAtt.reduce((sum: number, att: any) => sum + Number(att.piecesProduced || 0), 0);

    const ordersInDay = dayActivities.filter(act => act.type === "order");
    const completedOrdersCount = ordersInDay.filter(o => (o as any).isFullyCompleted).length;
    const pendingOrdersCount = ordersInDay.filter(o => !(o as any).isFullyCompleted && !(o as any).isCancelled).length;
    const cancelledOrdersCount = ordersInDay.filter(o => (o as any).isCancelled).length;

    dayActivities.sort((a, b) => {
      const timeDiff = b.time.getTime() - a.time.getTime();
      if (timeDiff !== 0) return timeDiff;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });

    return [{
      timestamp: targetKey,
      totalSales,
      totalReceived,
      totalExpenses,
      totalBagsProduced: bagsSum,
      totalOrders: ordersInDay.length,
      completedOrders: completedOrdersCount,
      pendingOrders: pendingOrdersCount,
      cancelledOrders: cancelledOrdersCount,
      items: dayActivities,
    }];
  }, [selectedTargetKey, orders, payments, expenses, rawLogs, allAttendance, todayAttendance, customers, colors]);

  // Compute breakdown of received payments by payment method for selected date
  const receivedBreakdown = useMemo(() => {
    const targetKey = selectedTargetKey;
    const methodTotals: Record<string, { method: string; total: number; count: number; items: any[] }> = {};
    const seenSignatures = new Set<string>();

    const customerMap: Record<string, any> = {};
    (customers || []).forEach((c: any) => {
      if (c.id) customerMap[c.id] = c;
    });

    const getCustomerName = (item: any) => {
      if (item.customerId && customerMap[item.customerId]) {
        const c = customerMap[item.customerId];
        return String(c.name || c.customerName || "General Client").trim();
      }
      const raw = item.customerName || item.clientName || item.customer || item.name;
      if (raw && String(raw).trim() !== "General Client" && String(raw).trim() !== "") {
        return String(raw).trim();
      }
      return "General Client";
    };

    const addEntry = (methodRaw: string, amount: number, item: any, signature: string) => {
      if (!amount || amount <= 0) return;
      if (seenSignatures.has(signature)) return;
      seenSignatures.add(signature);

      const method = (methodRaw || "Cash").trim();
      if (!methodTotals[method]) {
        methodTotals[method] = { method, total: 0, count: 0, items: [] };
      }
      methodTotals[method].total += amount;
      methodTotals[method].count += 1;
      methodTotals[method].items.push(item);
    };

    const orderIdsWithPayments = new Set<string>();

    // Step A: First pass to collect order IDs from payments (orderId field and notes matching order #)
    (payments || []).forEach((p: any) => {
      if (p.orderId) {
        const idStr = String(p.orderId).trim();
        orderIdsWithPayments.add(idStr);
        if (idStr.length >= 6) {
          orderIdsWithPayments.add(idStr.slice(-6).toUpperCase());
        }
      }
      if (p.notes) {
        const match = p.notes.match(/#([A-Za-z0-9]+)/);
        if (match && match[1]) {
          orderIdsWithPayments.add(match[1].toUpperCase());
        }
      }
    });

    // Step 1: All Payments recorded in payments collection for selected date (both direct and order payments)
    (payments || []).forEach((p: any) => {
      const pDate = p.createdAt instanceof Date ? p.createdAt : (p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || p.paymentDate || p.date || p.timestamp || Date.now()));
      const pTime = new Date(pDate).setHours(0, 0, 0, 0);
      if (pTime === targetKey) {
        const amt = Number(p.amountReceived || p.amount || 0);
        if (amt > 0) {
          const method = p.paymentMethod || p.paymentMode || p.paymentType || "Cash";
          const isOrderPayment = !!p.orderId || (p.notes && (
            p.notes.toLowerCase().includes("order payment") ||
            p.notes.toLowerCase().includes("payment for order") ||
            p.notes.toLowerCase().includes("order #")
          ));
          const title = getCustomerName(p);
          const subtitle = p.notes ? p.notes : (isOrderPayment ? "Order Payment" : "Direct Payment");

          // Signature to deduplicate exact duplicate payment records
          const signature = `pay_${title.toLowerCase()}_${amt}_${method.toLowerCase()}_${subtitle.toLowerCase()}`;

          addEntry(method, amt, {
            id: `payment-${p.id}`,
            rawId: p.id,
            rawObject: p,
            title,
            subtitle,
            amount: amt,
            method,
            type: isOrderPayment ? "order" : "payment",
            time: pDate,
          }, signature);
        }
      }
    });

    // Step 2: Order Payments (advance/paid) recorded for selected date that do not have a separate payments document
    (orders || []).forEach((o: any) => {
      const orderShortCode = o.id ? String(o.id).slice(-6).toUpperCase() : "";
      if (o.id && (orderIdsWithPayments.has(String(o.id).trim()) || (orderShortCode && orderIdsWithPayments.has(orderShortCode)))) return;

      const oDate = o.createdAt instanceof Date ? o.createdAt : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt));
      const oTime = new Date(oDate).setHours(0, 0, 0, 0);
      if (oTime === targetKey) {
        let paid = 0;
        if (o.paidAmount !== undefined) paid = Number(o.paidAmount || 0);
        else if (o.amountPaid !== undefined) paid = Number(o.amountPaid || 0);
        else if (o.advancePaid !== undefined) paid = Number(o.advancePaid || 0);
        else if (o.paymentStatus === "Paid" || o.paymentStatus === "fully" || o.paymentStatus === "Fully Paid") paid = Number(o.total || 0);
        else if (o.remainingBalance !== undefined) paid = Math.max(0, Number(o.total || 0) - Number(o.remainingBalance || 0));

        if (paid > 0) {
          const orderItems = Array.isArray(o.items) && o.items.length > 0 ? o.items : [];
          const totalQty = orderItems.length > 0
            ? orderItems.reduce((sum: number, itm: any) => sum + Number(itm.quantity || 0), 0)
            : Number(o.quantity || 0);

          const method = o.paymentMethod || o.paymentMode || o.paymentType || "Cash";
          const title = getCustomerName(o);
          const subtitle = `Order Advance (${o.itemName || "Items"}${totalQty ? ` • ${totalQty} qty` : ""})`;

          const signature = `ord_${title.toLowerCase()}_${paid}_${method.toLowerCase()}`;

          addEntry(method, paid, {
            id: `order-paid-${o.id}`,
            rawId: o.id,
            rawObject: o,
            title,
            subtitle,
            amount: paid,
            method,
            type: "order",
            time: oDate,
          }, signature);
        }
      }
    });

    const list = Object.values(methodTotals)
      .map((m) => ({
        ...m,
        items: [...m.items].sort((a, b) => {
          const tA = a.time instanceof Date ? a.time.getTime() : new Date(a.time).getTime();
          const tB = b.time instanceof Date ? b.time.getTime() : new Date(b.time).getTime();
          return tB - tA;
        }),
      }))
      .sort((a, b) => b.total - a.total);
    const grandTotal = list.reduce((sum, item) => sum + item.total, 0);

    return {
      list,
      grandTotal,
    };
  }, [selectedTargetKey, payments, orders, customers]);

  const getDayLabel = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.getTime() === today.getTime()) return "Today";
    if (date.getTime() === yesterday.getTime()) return "Yesterday";
    
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const handlePressActivity = (item: any) => {
    if (item.type === "order") {
      const orderId = item.rawId || item.rawOrder?.id || String(item.id || "").replace(/^order-/, "");
      router.push({
        pathname: "/orders" as any,
        params: { orderId },
      });
    } else if (item.type === "payment") {
      if (item.customerId) {
        router.push({ pathname: "/customer-profile", params: { id: item.customerId } } as any);
      } else {
        router.push("/customers" as any);
      }
    } else if (item.type === "expense") {
      router.push("/expenses" as any);
    } else if (item.type === "raw_material" || item.type === "raw_material_use") {
      router.push("/raw-material-stock" as any);
    }
  };

  const handleLongPressActivity = (item: any) => {
    if (!item) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Haptics fallback if not supported on platform
    }

    let matchedCustomer: any = null;

    // 1. Direct match by customerId
    if (item.customerId) {
      matchedCustomer = (unifiedCustomers || []).find((c: any) => c.id === item.customerId)
        || (customers || []).find((c: any) => c.id === item.customerId);
    }

    // 2. Direct match for raw materials (supplier)
    if (!matchedCustomer && (item.supplierId || item.type === "raw_material")) {
      if (item.supplierId) {
        matchedCustomer = (unifiedCustomers || []).find((c: any) => c.id === item.supplierId && c.entityType === "supplier")
          || (suppliers || []).find((s: any) => s.id === item.supplierId);
      }
      if (!matchedCustomer && item.supplierName) {
        const sName = String(item.supplierName).trim().toLowerCase();
        matchedCustomer = (unifiedCustomers || []).find((c: any) => 
          String(c.name || c.supplierName || "").trim().toLowerCase() === sName
        ) || (suppliers || []).find((s: any) => String(s.name || s.supplierName || "").trim().toLowerCase() === sName);
      }
    }

    // 3. Fallback name / phone matching in unifiedCustomers
    if (!matchedCustomer) {
      const rawTitle = String(item.title || item.customerName || item.supplierName || "").trim();
      const rawPhone = String(item.phone || item.customerPhone || item.rawOrder?.customerPhone || "").replace(/[^\d]/g, "");

      if (rawPhone.length >= 10) {
        const last10 = rawPhone.slice(-10);
        matchedCustomer = (unifiedCustomers || []).find((c: any) => {
          const cPhone = String(c.phone || c.mobile || "").replace(/[^\d]/g, "");
          return cPhone.endsWith(last10);
        });
      }

      if (!matchedCustomer && rawTitle && rawTitle.toLowerCase() !== "general client" && rawTitle.toLowerCase() !== "business expense") {
        const titleLower = rawTitle.toLowerCase();
        matchedCustomer = (unifiedCustomers || []).find((c: any) => {
          const cName = String(c.name || c.customerName || "").trim().toLowerCase();
          return cName === titleLower;
        });
      }
    }

    const targetId = matchedCustomer?.id || item.customerId || null;
    const targetName = matchedCustomer?.name || matchedCustomer?.customerName || item.title || "Contact";
    const targetPhone = matchedCustomer?.phone || matchedCustomer?.mobile || item.phone || item.rawOrder?.customerPhone || "";
    const targetAddress = matchedCustomer?.address || item.rawOrder?.customerAddress || item.rawOrder?.deliveryAddress || "";
    const entityType = matchedCustomer?.entityType || (item.type === "raw_material" ? "supplier" : (item.type === "expense" ? "expense" : "customer"));
    const badgeText = matchedCustomer?.badgeText || (entityType === "supplier" ? "Supplier" : (entityType === "worker" ? "Worker" : (entityType === "expense" ? "Expense" : "Customer")));
    const badgeColor = matchedCustomer?.badgeColor || (entityType === "supplier" ? (colors.accent.warning || "#F59E0B") : (entityType === "worker" ? (colors.accent.info || "#3B82F6") : colors.accent.primary));

    // Find orders for this customer to calculate total sales / count
    let customerOrders: any[] = [];
    if (targetId) {
      customerOrders = (orders || []).filter((o: any) => o.customerId === targetId);
    } else if (targetName && targetName.toLowerCase() !== "general client") {
      const tLower = targetName.toLowerCase();
      customerOrders = (orders || []).filter((o: any) => String(o.customerName || "").trim().toLowerCase() === tLower);
    }

    // Find payments for this customer
    let customerPayments: any[] = [];
    if (targetId) {
      customerPayments = (payments || []).filter((p: any) => p.customerId === targetId);
    } else if (targetName && targetName.toLowerCase() !== "general client") {
      const tLower = targetName.toLowerCase();
      customerPayments = (payments || []).filter((p: any) => String(p.customerName || "").trim().toLowerCase() === tLower);
    }

    const totalOrderAmount = customerOrders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);
    const totalPaidAmount = customerPayments.reduce((sum: number, p: any) => sum + Number(p.amountReceived || p.amount || 0), 0);

    let computedBalance = 0;
    if (matchedCustomer && matchedCustomer.displayBalance !== undefined) {
      computedBalance = Number(matchedCustomer.displayBalance || 0);
    } else if (matchedCustomer && matchedCustomer.balance !== undefined) {
      computedBalance = Number(matchedCustomer.balance || 0);
    } else if (item.balanceDue !== undefined) {
      computedBalance = Number(item.balanceDue || 0);
    } else if (customerOrders.length > 0) {
      computedBalance = Math.max(0, totalOrderAmount - totalPaidAmount);
    }

    setSelectedActivityProfile({
      id: targetId,
      name: targetName,
      phone: targetPhone,
      address: targetAddress,
      entityType,
      badgeText,
      badgeColor,
      balance: computedBalance,
      totalOrders: customerOrders.length,
      totalSpent: totalOrderAmount,
      totalPaid: totalPaidAmount,
      matchedCustomer,
      activityLogItem: item,
      isRegistered: !!targetId,
    });
    setIsActivityProfileModalOpen(true);
  };

  const handleCallCustomer = (phoneNumber: string) => {
    if (!phoneNumber) {
      Alert.alert("No Contact Number", "No phone number is registered for this profile.");
      return;
    }
    const clean = phoneNumber.replace(/[^\d+]/g, "");
    Linking.openURL(`tel:${clean}`).catch(() => {
      Alert.alert("Error", "Unable to launch dialer on this device.");
    });
  };

  const handleWhatsAppCustomer = (phoneNumber: string) => {
    if (!phoneNumber) {
      Alert.alert("No Contact Number", "No phone number is registered for this profile.");
      return;
    }
    let clean = phoneNumber.replace(/[^\d]/g, "");
    if (clean.length === 10) clean = `91${clean}`;
    Linking.openURL(`https://wa.me/${clean}`).catch(() => {
      Alert.alert("Error", "Unable to open WhatsApp.");
    });
  };

  const handleOpenFullProfile = (profile: any) => {
    setIsActivityProfileModalOpen(false);
    if (!profile) return;

    if (profile.id) {
      if (profile.entityType === "worker") {
        router.push({ pathname: "/settings/workers/details" as any, params: { id: profile.id } });
      } else if (profile.entityType === "supplier") {
        router.push({ pathname: "/settings/raw-materials/suppliers/details" as any, params: { id: profile.id } });
      } else if (profile.entityType === "delivery_partner") {
        router.push({ pathname: "/settings/delivery-partners/details" as any, params: { id: profile.id } });
      } else {
        router.push({ pathname: "/customer-profile" as any, params: { id: profile.id } });
      }
    } else if (profile.activityLogItem?.type === "order") {
      router.push("/orders" as any);
    } else {
      router.push("/customers" as any);
    }
  };

  const handleDeleteActivity = (item: any) => {
    let itemTypeName = "Activity";
    if (item.type === "order") itemTypeName = "Order";
    else if (item.type === "payment") itemTypeName = "Payment";
    else if (item.type === "expense") itemTypeName = "Expense";
    else if (item.type === "raw_material") itemTypeName = "Raw Material Purchase";
    else if (item.type === "raw_material_use") itemTypeName = "Raw Material Consumption";

    Alert.alert(
      `Delete ${itemTypeName}`,
      `Are you sure you want to delete this ${itemTypeName.toLowerCase()} for ${item.title}? This will adjust records and balance sheets.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              let success = false;
              if (item.type === "order") {
                success = await deleteOrder(item.rawId);
              } else if (item.type === "payment") {
                success = await deletePayment(item.rawId);
              } else if (item.type === "expense") {
                success = await deleteExpense(item.rawId);
              } else if (item.type === "raw_material" || item.type === "raw_material_use") {
                success = await deleteRawTransaction(item.rawId);
              }
              if (success) {
                Alert.alert("Success", `${itemTypeName} deleted successfully.`);
              } else {
                Alert.alert("Error", `Failed to delete ${itemTypeName.toLowerCase()}.`);
              }
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "An unexpected error occurred while deleting.");
            }
          },
        },
      ]
    );
  };

  // Format relative time
  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  };

  // Quick Actions
  const QUICK_ACTIONS = [
    { id: "invoice", label: "New Order", icon: "add-shopping-cart" as const, color: colors.accent.primary, route: "/create-invoice" },
    { id: "payment", label: "Receive Payment", icon: "payments" as const, color: colors.accent.success, onPress: () => setIsPaymentModalOpen(true) },
    { id: "delivery", label: "Delivery Partners", icon: "local-shipping" as const, color: colors.accent.info, route: "/settings/delivery-partners" },
    { id: "stock", label: "Raw Material Stock", icon: "layers" as const, color: colors.accent.warning, route: "/raw-material-stock" },
  ];

  return (
    <AnimatedPage style={{ flex: 1 }}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        scrollEventThrottle={32}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.accent.primary]}
            tintColor={colors.accent.primary}
            progressBackgroundColor={colors.bg.card}
          />
        }
      >
        {/* Welcome Section */}
        <View style={[styles.heroSection, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
          <View>
            <Text style={styles.welcomeText}>Hello Manager 👋</Text>
            <Text style={styles.syncText}>{syncTime}</Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#8b5cf618",
                borderColor: "#8b5cf640",
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 20,
              },
              pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
            ]}
            onPress={() => setIsAddCardModalOpen(true)}
          >
            <MaterialIcons name="badge" size={18} color="#8b5cf6" />
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#8b5cf6" }}>+ Add Card</Text>
          </Pressable>
        </View>

        {/* Key Metrics — 3 Stat Cards */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
        >
          <Animated.View entering={FadeInDown.duration(200)}>
            <Pressable style={[styles.statCard, styles.statCardSales]} onPress={() => router.push("/orders" as any)}>
              <View style={styles.statIconWrap}>
                <MaterialIcons name="trending-up" size={22} color={colors.accent.success} />
              </View>
              <Text style={styles.statLabel}>{"Today's Sales"}</Text>
              <AnimatedCounter value={todaySales} prefix="₹" style={styles.statValue} />
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(200)}>
            <Pressable
              style={({ pressed }) => [
                styles.statCard,
                styles.statCardPending,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => setIsSummaryModalOpen(true)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs || 6 }}>
                <View style={styles.statIconWrap}>
                  <MaterialIcons name="payment" size={22} color={colors.accent.danger} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "#fee2e2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 }}>
                  <MaterialIcons name="analytics" size={11} color={colors.accent.danger} />
                  <Text style={{ fontSize: 9.5, fontWeight: "700", color: colors.accent.danger }}>Summary</Text>
                </View>
              </View>
              <Text style={styles.statLabel}>Pending Balance</Text>
              <AnimatedCounter value={totalUnpaidBalancesSum} prefix="₹" style={styles.statValue} />
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(200)}>
            <Pressable style={[styles.statCard, styles.statCardExpense]} onPress={() => router.push("/expense-balances" as any)}>
              <View style={styles.statIconWrap}>
                <MaterialIcons name="money-off" size={22} color={colors.accent.warning} />
              </View>
              <Text style={styles.statLabel}>Total Outstanding Dues</Text>
              <AnimatedCounter value={totalOutstandingDues} prefix="₹" style={styles.statValue} />
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(200)}>
            <Pressable
              style={({ pressed }) => [
                styles.statCard,
                styles.statCardAdvance,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => router.push("/expense-balances" as any)}
            >
              <View style={styles.statAdvanceTopRow}>
                <View style={styles.statIconWrapAdvance}>
                  <MaterialIcons name="account-balance-wallet" size={20} color={colors.accent.success} />
                </View>
                <View style={styles.statAdvanceBadge}>
                  <Text style={styles.statAdvanceBadgeText}>Credit</Text>
                </View>
              </View>
              <Text style={styles.statLabelAdvance}>Total Advance Paid</Text>
              <AnimatedCounter value={totalAdvancePaid} prefix="₹" style={styles.statValueAdvance} />
            </Pressable>
          </Animated.View>
        </ScrollView>

        {/* Quick Actions — 2×2 Grid */}
        <Animated.View entering={FadeInDown.duration(200)}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.id}
                style={({ pressed }) => [
                  styles.actionCard,
                  pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                ]}
                onPress={() => {
                  if (action.onPress) {
                    action.onPress();
                  } else if (action.route) {
                    router.push(action.route as any);
                  }
                }}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: `${action.color}18` }]}>
                  <MaterialIcons name={action.icon} size={24} color={action.color} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* GST Due Dates Section */}
        {gstSettings.gstEnabled && upcomingGstDueDates.length > 0 && (
          <Animated.View entering={FadeInDown.duration(200)}>
            <View style={styles.gstSection}>
              <View style={styles.gstSectionHeader}>
                <View style={styles.gstSectionLeft}>
                  <View style={styles.gstHeaderIcon}>
                    <MaterialIcons name="gavel" size={16} color="#3B82F6" />
                  </View>
                  <Text style={styles.gstSectionTitle}>GST Due Dates</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.gstManageBtn,
                    pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
                  ]}
                  onPress={() => router.push("/settings/gst-management" as any)}
                >
                  <Text style={styles.gstManageBtnText}>Manage</Text>
                  <MaterialIcons name="chevron-right" size={16} color={colors.accent.primary} />
                </Pressable>
              </View>

              {upcomingGstDueDates.map((item: any, index: number) => (
                <View key={item.key} style={[styles.gstDueItem, index === upcomingGstDueDates.length - 1 && { borderBottomWidth: 0, paddingBottom: 0, marginBottom: 0 }]}>
                  <View style={styles.gstDueLeft}>
                    <View style={[styles.gstDueIconWrap, { backgroundColor: `${item.color}15` }]}>
                      <MaterialIcons name={item.icon} size={18} color={item.color} />
                    </View>
                    <View style={styles.gstDueInfo}>
                      <Text style={styles.gstDueName}>{item.name}</Text>
                      <Text style={styles.gstDueDesc}>{item.description}</Text>
                      <Text style={styles.gstDueDateText}>
                        <MaterialIcons name="event" size={11} color={colors.text.muted} />
                        {"  "}{formatGstDate(item.date)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.gstDueRight}>
                    <View style={[styles.gstDaysLeftBadge, { backgroundColor: getGstUrgencyBg(item.daysLeft) }]}>
                      <Text style={[styles.gstDaysLeftText, { color: getGstUrgencyColor(item.daysLeft) }]}>
                        {item.daysLeft === 0 ? "Today!" : item.daysLeft === 1 ? "1d" : `${item.daysLeft}d`}
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.gstCompleteBtn,
                        pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] },
                      ]}
                      onPress={() => {
                        Alert.alert(
                          "Mark as Complete",
                          `Mark ${item.name} (due ${formatGstDate(item.date)}) as filed/completed?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Complete", onPress: () => handleGstComplete(item) },
                          ]
                        );
                      }}
                    >
                      <MaterialIcons name="check-circle" size={14} color={colors.accent.success} />
                      <Text style={styles.gstCompleteBtnText}>Complete</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Worker Attendance Header with Date Controls */}
        <Animated.View entering={FadeInDown.duration(200)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
            <Text style={styles.sectionTitle}>Worker Attendance</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Pressable
                style={({ pressed }) => [
                  styles.dateNavArrowBtn,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] },
                ]}
                onPress={() => shiftAttendanceDate(-1)}
                hitSlop={8}
                accessibilityLabel="Previous Day Attendance"
              >
                <MaterialIcons name="chevron-left" size={20} color={colors.accent.info} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.calendarBtnPill,
                  { borderColor: `${colors.accent.info}50` },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                ]}
                onPress={() => setIsAttendanceCalendarModalOpen(true)}
              >
                <MaterialIcons name="event" size={15} color={colors.accent.info} style={{ marginRight: 5 }} />
                <Text style={[styles.calendarBtnPillText, { color: colors.accent.info }]}>
                  {getDayLabel(selectedAttendanceTargetKey)}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={18} color={colors.text.secondary} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.dateNavArrowBtn,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] },
                ]}
                onPress={() => shiftAttendanceDate(1)}
                hitSlop={8}
                accessibilityLabel="Next Day Attendance"
              >
                <MaterialIcons name="chevron-right" size={20} color={colors.accent.info} />
              </Pressable>
            </View>
          </View>

          <Pressable 
            style={[styles.attendanceStrip, { flexDirection: "column", alignItems: "stretch" }]}
            onPress={handleOpenAttendanceModal}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={styles.attendanceStripLeft}>
                <MaterialIcons name="groups" size={22} color={colors.accent.info} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.attendanceStripTitle}>
                    {getDayLabel(selectedAttendanceTargetKey) === "Today"
                      ? "Today's Attendance"
                      : getDayLabel(selectedAttendanceTargetKey) === "Yesterday"
                      ? "Yesterday's Attendance"
                      : `Attendance (${getDayLabel(selectedAttendanceTargetKey)})`}
                  </Text>
                  <Text style={styles.attendanceStripSub}>
                    {attendanceSummary.total}/{activeWorkers.length} marked • {totalUnitsProduced} units
                  </Text>
                </View>
              </View>
              <View style={styles.attendanceStripRight}>
                {/* Quick Save Attendance Button */}
                {activeWorkers.some((w: any) => !todayAttendanceMap[w.id]) && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.quickSaveAttendanceBtn,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleQuickSaveAllStatus("present");
                    }}
                  >
                    <MaterialIcons name="check-circle" size={20} color={colors.accent.success} />
                  </Pressable>
                )}

                <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
              </View>
            </View>

            {/* Attendance Chips/Buttons row */}
            <View style={styles.attendanceChipsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.attendanceChipButton,
                  { backgroundColor: `${colors.accent.success}15`, borderColor: `${colors.accent.success}30` },
                  pressed && styles.buttonPressed
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  handleQuickSaveAllStatus("present");
                }}
              >
                <Text style={[styles.attendanceChipText, { color: colors.accent.success }]}>
                  Present: {attendanceSummary.present}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.attendanceChipButton,
                  { backgroundColor: `${colors.accent.warning}15`, borderColor: `${colors.accent.warning}30` },
                  pressed && styles.buttonPressed
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  handleQuickSaveAllStatus("half-day");
                }}
              >
                <Text style={[styles.attendanceChipText, { color: colors.accent.warning }]}>
                  Half Day: {attendanceSummary.halfDay}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.attendanceChipButton,
                  { backgroundColor: `${colors.accent.danger}15`, borderColor: `${colors.accent.danger}30` },
                  pressed && styles.buttonPressed
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  handleQuickSaveAllStatus("absent");
                }}
              >
                <Text style={[styles.attendanceChipText, { color: colors.accent.danger }]}>
                  Absent: {attendanceSummary.absent}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>

        {/* Received Today Strip */}
        <Animated.View entering={FadeInDown.duration(200)}>
          <Pressable 
            style={styles.receivedStrip}
            onPress={() => setIsPaymentModalOpen(true)}
          >
            <View style={styles.attendanceStripLeft}>
              <MaterialIcons name="account-balance-wallet" size={22} color={colors.accent.success} />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.attendanceStripTitle}>Received Today</Text>
                <AnimatedCounter value={totalReceivedToday} prefix="₹" style={styles.receivedStripValue} />
              </View>
            </View>
            <View style={[styles.quickPayBtn]}>
              <MaterialIcons name="add" size={18} color={colors.accent.success} />
            </View>
          </Pressable>
        </Animated.View>

        {/* Daily Report Feed */}
        <Animated.View entering={FadeInDown.duration(200)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
            <Text style={styles.sectionTitle}>Daily Report</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Pressable
                style={({ pressed }) => [
                  styles.dateNavArrowBtn,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] },
                ]}
                onPress={() => shiftReportDate(-1)}
                hitSlop={8}
                accessibilityLabel="Previous Day"
              >
                <MaterialIcons name="chevron-left" size={20} color={colors.accent.primary} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.calendarBtnPill,
                  pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                ]}
                onPress={() => setIsCalendarModalOpen(true)}
              >
                <MaterialIcons name="event" size={15} color={colors.accent.primary} style={{ marginRight: 5 }} />
                <Text style={styles.calendarBtnPillText}>
                  {getDayLabel(selectedTargetKey)}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={18} color={colors.text.secondary} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.dateNavArrowBtn,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] },
                ]}
                onPress={() => shiftReportDate(1)}
                hitSlop={8}
                accessibilityLabel="Next Day"
              >
                <MaterialIcons name="chevron-right" size={20} color={colors.accent.primary} />
              </Pressable>
            </View>
          </View>
          
          {dailyReportFeed.length === 0 ? (
            <View style={styles.activityCard}>
              <View style={styles.emptyActivity}>
                <MaterialIcons name="assessment" size={40} color={colors.text.muted} />
                <Text style={styles.emptyText}>No daily reports available yet</Text>
              </View>
            </View>
          ) : (
            dailyReportFeed.map((day) => (
              <View key={day.timestamp} style={{ marginBottom: 16 }}>
                
                {/* Main Card Container */}
                <View style={[styles.activityCard, { padding: spacing.lg }]}>
                  
                  {/* Day Date Header */}
                  <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 14,
                    paddingBottom: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border.subtle,
                  }}>
                    <MaterialIcons name="calendar-today" size={18} color={colors.accent.primary} style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text.primary }}>
                      {getDayLabel(day.timestamp)} Daily Summary
                    </Text>
                  </View>

                  {/* 2x2 Metric Summary Grid */}
                  {/* 3-Column Metric Summary Row */}
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                    {/* Sales Card */}
                    <View style={{
                      flex: 1,
                      backgroundColor: colors.bg.primary,
                      borderRadius: 12,
                      padding: 10,
                      borderLeftWidth: 4,
                      borderLeftColor: colors.accent.primary,
                      ...shadows.subtle,
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: colors.text.secondary, textTransform: "uppercase" }}>Sales</Text>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: colors.accent.primary, marginTop: 2 }}>
                        ₹{day.totalSales.toLocaleString("en-IN")}
                      </Text>
                    </View>

                    {/* Received Card */}
                    <Pressable
                      style={({ pressed }) => [{
                        flex: 1,
                        backgroundColor: colors.bg.primary,
                        borderRadius: 12,
                        padding: 10,
                        borderLeftWidth: 4,
                        borderLeftColor: colors.accent.success,
                        ...shadows.subtle,
                      }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
                      onPress={() => setIsReceivedBreakdownOpen(true)}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 10, fontWeight: "600", color: colors.text.secondary, textTransform: "uppercase" }}>Received</Text>
                        <MaterialIcons name="info-outline" size={13} color={colors.accent.success} />
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: colors.accent.success, marginTop: 2 }}>
                        ₹{day.totalReceived.toLocaleString("en-IN")}
                      </Text>
                      <Text style={{ fontSize: 9, fontWeight: "600", color: colors.text.muted, marginTop: 2 }}>Tap for breakdown ↗</Text>
                    </Pressable>

                    {/* Expenses Card */}
                    <View style={{
                      flex: 1,
                      backgroundColor: colors.bg.primary,
                      borderRadius: 12,
                      padding: 10,
                      borderLeftWidth: 4,
                      borderLeftColor: colors.accent.danger,
                      ...shadows.subtle,
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: colors.text.secondary, textTransform: "uppercase" }}>Expenses</Text>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: colors.accent.danger, marginTop: 2 }}>
                        ₹{day.totalExpenses.toLocaleString("en-IN")}
                      </Text>
                    </View>
                  </View>

                  {/* Order Status Summary Breakdown */}
                  {day.totalOrders > 0 && (
                    <View style={{
                      flexDirection: "row",
                      backgroundColor: colors.bg.primary,
                      borderRadius: 12,
                      padding: 10,
                      marginBottom: 16,
                      alignItems: "center",
                      justifyContent: "space-around",
                      borderWidth: 1,
                      borderColor: colors.border.subtle,
                    }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <MaterialIcons name="receipt-long" size={16} color={colors.accent.primary} />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.primary }}>
                          {day.totalOrders} {day.totalOrders === 1 ? "Order" : "Orders"}
                        </Text>
                      </View>
                      
                      <View style={{ height: 16, width: 1, backgroundColor: colors.border.subtle }} />
                      
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <MaterialIcons name="check-circle" size={15} color={colors.accent.success || "#10B981"} />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.success || "#10B981" }}>
                          {day.completedOrders} Fully Complete
                        </Text>
                      </View>

                      <View style={{ height: 16, width: 1, backgroundColor: colors.border.subtle }} />

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <MaterialIcons name="pending-actions" size={15} color={colors.accent.warning || "#F59E0B"} />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.warning || "#F59E0B" }}>
                          {day.pendingOrders} Incomplete
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Filter Pills for Activity Logs */}
                  {day.items.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.filterPill,
                          dailyReportFilter === "all" && styles.filterPillActive,
                          pressed && { opacity: 0.8 },
                        ]}
                        onPress={() => setDailyReportFilter("all")}
                      >
                        <Text style={[styles.filterPillText, dailyReportFilter === "all" && styles.filterPillTextActive]}>
                          All ({day.items.length})
                        </Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.filterPill,
                          dailyReportFilter === "completed" && { backgroundColor: colors.accent.success, borderColor: colors.accent.success },
                          pressed && { opacity: 0.8 },
                        ]}
                        onPress={() => setDailyReportFilter("completed")}
                      >
                        <MaterialIcons name="check-circle" size={14} color={dailyReportFilter === "completed" ? "#FFFFFF" : (colors.accent.success || "#10B981")} style={{ marginRight: 4 }} />
                        <Text style={[styles.filterPillText, dailyReportFilter === "completed" && { color: "#FFFFFF", fontWeight: "700" }]}>
                          Fully Complete ({day.completedOrders})
                        </Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.filterPill,
                          dailyReportFilter === "pending" && { backgroundColor: colors.accent.warning, borderColor: colors.accent.warning },
                          pressed && { opacity: 0.8 },
                        ]}
                        onPress={() => setDailyReportFilter("pending")}
                      >
                        <MaterialIcons name="pending-actions" size={14} color={dailyReportFilter === "pending" ? "#FFFFFF" : (colors.accent.warning || "#F59E0B")} style={{ marginRight: 4 }} />
                        <Text style={[styles.filterPillText, dailyReportFilter === "pending" && { color: "#FFFFFF", fontWeight: "700" }]}>
                          Incomplete ({day.pendingOrders})
                        </Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.filterPill,
                          dailyReportFilter === "other" && styles.filterPillActive,
                          pressed && { opacity: 0.8 },
                        ]}
                        onPress={() => setDailyReportFilter("other")}
                      >
                        <Text style={[styles.filterPillText, dailyReportFilter === "other" && styles.filterPillTextActive]}>
                          Others ({day.items.filter((i: any) => i.type !== "order").length})
                        </Text>
                      </Pressable>
                    </ScrollView>
                  )}

                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.secondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Activity Logs ({
                        day.items.filter((item: any) => {
                          if (dailyReportFilter === "completed") return item.type === "order" && item.isFullyCompleted;
                          if (dailyReportFilter === "pending") return item.type === "order" && !item.isFullyCompleted && !item.isCancelled;
                          if (dailyReportFilter === "other") return item.type !== "order";
                          return true;
                        }).length
                      })
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: `${colors.accent.primary}12`, paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 8 }}>
                      <MaterialIcons name="touch-app" size={11} color={colors.accent.primary} />
                      <Text style={{ fontSize: 10, fontWeight: "600", color: colors.accent.primary }}>
                        Hold for profile
                      </Text>
                    </View>
                  </View>

                  {/* Day Items List */}
                  <View style={{ gap: 8 }}>
                    {day.items.filter((item: any) => {
                      if (dailyReportFilter === "completed") return item.type === "order" && item.isFullyCompleted;
                      if (dailyReportFilter === "pending") return item.type === "order" && !item.isFullyCompleted && !item.isCancelled;
                      if (dailyReportFilter === "other") return item.type !== "order";
                      return true;
                    }).length === 0 ? (
                      <View style={styles.emptyActivity}>
                        <MaterialIcons name="event-busy" size={40} color={colors.text.muted} />
                        <Text style={styles.emptyText}>No matching activities for selected filter</Text>
                      </View>
                    ) : (
                      day.items.filter((item: any) => {
                        if (dailyReportFilter === "completed") return item.type === "order" && item.isFullyCompleted;
                        if (dailyReportFilter === "pending") return item.type === "order" && !item.isFullyCompleted && !item.isCancelled;
                        if (dailyReportFilter === "other") return item.type !== "order";
                        return true;
                      }).slice(0, activityLogLimit).map((item: any) => (
                        <Pressable
                          key={item.id}
                          style={({ pressed }) => [
                            {
                              flexDirection: "row",
                              alignItems: "center",
                              backgroundColor: colors.bg.card,
                              borderRadius: 10,
                              padding: 10,
                              borderWidth: 1,
                              borderColor: colors.border.subtle,
                              borderLeftWidth: 4,
                              borderLeftColor: item.iconColor,
                            },
                            pressed && { opacity: 0.8, backgroundColor: colors.bg.elevated || `${item.iconColor}08` },
                          ]}
                          onPress={() => handlePressActivity(item)}
                          onLongPress={() => handleLongPressActivity(item)}
                          delayLongPress={350}
                        >
                          <View style={[styles.activityIconWrap, { backgroundColor: `${item.iconColor}14` }]}>
                            <MaterialIcons name={item.icon} size={18} color={item.iconColor} />
                          </View>
                          
                          <View style={styles.activityInfo}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text selectable={true} style={[styles.activityTitle, { flexShrink: 1 }]} numberOfLines={1}>{item.title}</Text>
                              {item.type === "order" && item.statusText && (
                                <View style={{
                                  backgroundColor: `${item.statusBadgeColor}1A`,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: `${item.statusBadgeColor}40`,
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 3,
                                  flexShrink: 0,
                                }}>
                                  <MaterialIcons name={item.icon} size={10} color={item.statusBadgeColor} />
                                  <Text style={{ fontSize: 10, fontWeight: "700", color: item.statusBadgeColor }}>
                                    {item.statusText}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text selectable={true} style={styles.activitySubtitle} numberOfLines={2}>{item.subtitle}</Text>
                            {item.type === "order" && (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#ecfdf5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#05966930" }}>
                                  <MaterialIcons name="check-circle" size={11} color="#059669" />
                                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#059669" }}>
                                    Paid: ₹{Number(item.amountPaid || 0).toLocaleString("en-IN")}
                                  </Text>
                                </View>
                                {item.balanceDue > 0 ? (
                                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#fff7ed", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#ea580c30" }}>
                                    <MaterialIcons name="hourglass-empty" size={11} color="#ea580c" />
                                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#ea580c" }}>
                                      Due: ₹{Number(item.balanceDue || 0).toLocaleString("en-IN")}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            )}
                          </View>
                          
                          <View style={styles.activityRight}>
                            {item.isRawMaterial ? (
                              <Text style={[styles.activityAmount, { color: colors.text.secondary }]}>
                                {item.qtyDisplay}
                              </Text>
                            ) : (
                              <Text style={[styles.activityAmount, item.isPositive && { color: colors.accent.success }]}>
                                {item.isPositive ? "+" : ""}₹{Number(item.amount || 0).toLocaleString("en-IN")}
                              </Text>
                            )}
                            <Text style={styles.activityTime}>
                              {(() => {
                                if (!item.time || isNaN(item.time.getTime())) return "12:00 am";
                                let hours = item.time.getHours();
                                const minutes = item.time.getMinutes();
                                const ampm = hours >= 12 ? "pm" : "am";
                                hours = hours % 12;
                                hours = hours ? hours : 12;
                                const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
                                return `${hours}:${minutesStr} ${ampm}`;
                              })()}
                            </Text>
                          </View>
                          
                          <Pressable
                            style={({ pressed }) => [
                              { padding: 6, marginLeft: 6, borderRadius: 6 },
                              pressed && { backgroundColor: `${colors.accent.danger}15` }
                            ]}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleDeleteActivity(item);
                            }}
                            hitSlop={8}
                          >
                            <MaterialIcons name="delete-outline" size={18} color={colors.accent.danger} />
                          </Pressable>
                        </Pressable>
                      ))
                    )}
                  </View>

                  {day.items.filter((item: any) => {
                    if (dailyReportFilter === "completed") return item.type === "order" && item.isFullyCompleted;
                    if (dailyReportFilter === "pending") return item.type === "order" && !item.isFullyCompleted && !item.isCancelled;
                    if (dailyReportFilter === "other") return item.type !== "order";
                    return true;
                  }).length > 10 && (
                    <Pressable
                      style={({ pressed }) => [
                        {
                          paddingVertical: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: `${colors.accent.primary}0D`,
                          borderRadius: 8,
                          marginTop: 8,
                          flexDirection: "row",
                          gap: 6,
                        },
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={() => setActivityLogLimit((prev) => (prev > 10 ? 10 : 100))}
                    >
                      <MaterialIcons
                        name={activityLogLimit > 10 ? "expand-less" : "expand-more"}
                        size={18}
                        color={colors.accent.primary}
                      />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.primary }}>
                        {activityLogLimit > 10 ? "Show Less" : "Show All Activities"}
                      </Text>
                    </Pressable>
                  )}
                  
                </View>
              </View>
            ))
          )}
        </Animated.View>

        {/* Overview Cards Row */}
        <Animated.View entering={FadeInDown.delay(440).duration(450).springify().damping(15)}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.overviewRow}>
            <Pressable style={styles.overviewCard} onPress={() => router.push("/inventory" as any)}>
              <MaterialIcons name="inventory" size={22} color={colors.accent.info} />
              <Text style={styles.overviewLabel}>Stock Value</Text>
              <AnimatedCounter value={stockValue} prefix="₹" style={styles.overviewValue} />
            </Pressable>
            <Pressable style={styles.overviewCard} onPress={() => router.push("/orders" as any)}>
              <MaterialIcons name="receipt" size={22} color={colors.accent.primary} />
              <Text style={styles.overviewLabel}>Total Orders</Text>
              <AnimatedCounter value={orders.length} prefix="" style={styles.overviewValue} />
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Floating Action Bar */}
      <View style={styles.floatingBar}>
        <Pressable
          style={({ pressed }) => [
            styles.floatingBtn,
            styles.btnReceivedPayment,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => {
            setPaymentDate(new Date());
            setIsPaymentModalOpen(true);
          }}
        >
          <Text style={styles.floatingBtnText}>Pending Payment</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.btnPlusCircle,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => setIsQuickAddOpen(true)}
        >
          <MaterialIcons name="add" size={26} color="#FFFFFF" />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.floatingBtn,
            styles.btnBillInvoice,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => router.push("/create-invoice" as any)}
        >
          <Text style={styles.floatingBtnText}>+ Bill / Invoice</Text>
        </Pressable>
      </View>

      {/* QUICK ADD OVERLAY MODAL */}
      <Modal
        visible={isQuickAddOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsQuickAddOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsQuickAddOpen(false)}>
          <View style={{ flex: 1 }} />
          <Pressable style={styles.quickAddContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quick Operations</Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsQuickAddOpen(false)}>
                <MaterialIcons name="close" size={22} color={colors.text.muted} />
              </Pressable>
            </View>

            <View style={styles.quickAddGrid}>
              <Pressable
                style={styles.quickAddGridItem}
                onPress={() => {
                  setIsQuickAddOpen(false);
                  router.push("/customers?add=true" as any);
                }}
              >
                <View style={[styles.quickAddIconWrap, { backgroundColor: `${colors.accent.primary}18` }]}>
                  <MaterialIcons name="person-add" size={24} color={colors.accent.primary} />
                </View>
                <Text style={styles.quickAddLabel}>Add Customer</Text>
              </Pressable>

              <Pressable
                style={styles.quickAddGridItem}
                onPress={() => {
                  setIsQuickAddOpen(false);
                  router.push("/settings/raw-materials/add" as any);
                }}
              >
                <View style={[styles.quickAddIconWrap, { backgroundColor: `${colors.accent.warning}18` }]}>
                  <MaterialIcons name="add-box" size={24} color={colors.accent.warning} />
                </View>
                <Text style={styles.quickAddLabel}>Add Material</Text>
              </Pressable>

              <Pressable
                style={styles.quickAddGridItem}
                onPress={() => {
                  setIsQuickAddOpen(false);
                  handleOpenAttendanceModal();
                }}
              >
                <View style={[styles.quickAddIconWrap, { backgroundColor: `${colors.accent.info}18` }]}>
                  <MaterialIcons name="how-to-reg" size={24} color={colors.accent.info} />
                </View>
                <Text style={styles.quickAddLabel}>Mark Staff Attendance</Text>
              </Pressable>


              <Pressable
                style={styles.quickAddGridItem}
                onPress={() => {
                  setIsQuickAddOpen(false);
                  handleOpenAddExpenseModal();
                }}
              >
                <View style={[styles.quickAddIconWrap, { backgroundColor: `${colors.accent.danger}18` }]}>
                  <MaterialIcons name="money-off" size={24} color={colors.accent.danger} />
                </View>
                <Text style={styles.quickAddLabel}>Add Expense</Text>
              </Pressable>

              <Pressable
                style={styles.quickAddGridItem}
                onPress={() => {
                  setIsQuickAddOpen(false);
                  router.push("/raw-material-stock" as any);
                }}
              >
                <View style={[styles.quickAddIconWrap, { backgroundColor: `${colors.accent.success}18` }]}>
                  <MaterialIcons name="layers" size={24} color={colors.accent.success} />
                </View>
                <Text style={styles.quickAddLabel}>Raw Material Stock</Text>
              </Pressable>

              <Pressable
                style={styles.quickAddGridItem}
                onPress={() => {
                  setIsQuickAddOpen(false);
                  router.push("/settings/collectors" as any);
                }}
              >
                <View style={[styles.quickAddIconWrap, { backgroundColor: "#8b5cf618" }]}>
                  <MaterialIcons name="payments" size={24} color="#8b5cf6" />
                </View>
                <Text style={styles.quickAddLabel}>Balance Collectors</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ========== PAYMENT MODAL ========== */}
      <Modal
        visible={isPaymentModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={handleClosePaymentModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalFlexSpacer}
            onPress={handleClosePaymentModal}
          />

          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💰 Receive Payment</Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={handleClosePaymentModal}
              >
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            {showSuccessAnim ? (
              <View style={styles.successContainer}>
                <View style={styles.successBadge}>
                  <MaterialIcons name="check-circle" size={80} color={colors.accent.success} />
                </View>
                <Text style={styles.successTitle}>Payment Saved!</Text>
                <Text style={styles.successSub}>Customer balance updated successfully</Text>
              </View>
            ) : paymentStep === 1 ? (
              <View style={styles.modalStepContainer}>
                <Text style={styles.modalStepLabel}>Step 1: Select Customer with Pending Balance</Text>

                <View style={styles.modalSearchBox}>
                  <MaterialIcons name="search" size={20} color={colors.text.muted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.modalSearchInput}
                    placeholder="Search by name or customer number..."
                    value={customerSearch}
                    onChangeText={setCustomerSearch}
                    placeholderTextColor={colors.text.muted}
                  />
                </View>

                <ScrollView style={styles.modalCustList} keyboardShouldPersistTaps="handled">
                  {(() => {
                    const debtors = (customers || []).filter((c: any) => {
                      const pending =
                        c.totalPending !== undefined
                          ? Number(c.totalPending)
                          : Number(c.balance || 0);
                      return (
                        pending > 0 &&
                        ((c.name || "").toLowerCase().includes(customerSearch.toLowerCase()) ||
                         (c.phone || "").toLowerCase().includes(customerSearch.toLowerCase()))
                      );
                    });

                    if (debtors.length === 0) {
                      return (
                        <View style={styles.modalEmptyState}>
                          <Text style={styles.modalEmptyText}>
                            {customers.length === 0
                              ? "No customers registered."
                              : "No customers with pending balance > 0."}
                          </Text>
                        </View>
                      );
                    }

                    return debtors.map((cust: any) => {
                      const pendingAmt =
                        cust.totalPending !== undefined
                          ? Number(cust.totalPending)
                          : Number(cust.balance || 0);
                      return (
                        <Pressable
                          key={cust.id}
                          style={styles.modalCustRow}
                          onPress={() => {
                            setSelectedCustomer(cust);
                            setPaymentAmount(String(pendingAmt));
                            setPaymentDiscount("");
                            setPaymentStep(2);
                          }}
                        >
                          <View style={styles.modalCustInitials}>
                            <Text style={styles.modalCustInitialsText}>
                              {cust.name?.substring(0, 2).toUpperCase() || "CU"}
                            </Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.modalCustName}>{cust.name}</Text>
                            <Text style={styles.modalCustPhone}>{cust.phone || "No phone number"}</Text>
                          </View>
                          <Text style={styles.modalCustPending}>₹{pendingAmt.toLocaleString("en-IN")}</Text>
                        </Pressable>
                      );
                    });
                  })()}
                </ScrollView>
              </View>
            ) : (
              <ScrollView style={styles.modalStepContainer} keyboardShouldPersistTaps="handled">
                <Pressable
                  style={styles.backToStep1}
                  onPress={() => {
                    setSelectedCustomer(null);
                    setPaymentStep(1);
                  }}
                >
                  <MaterialIcons name="arrow-back" size={16} color={colors.accent.primary} />
                  <Text style={styles.backToStep1Text}>Change Customer</Text>
                </Pressable>

                <View style={styles.selectedCustomerCard}>
                  <View style={styles.selectedCustomerHeader}>
                    <Text style={styles.selectedCustomerName}>{selectedCustomer?.name}</Text>
                    <Text style={styles.selectedCustomerPhone}>📞 {selectedCustomer?.phone || "N/A"}</Text>
                  </View>
                  <View style={styles.selectedCustomerPendingCol}>
                    <Text style={styles.selectedPendingLabel}>Total Pending Amount:</Text>
                    <Text style={styles.selectedPendingValue}>
                      ₹{Number(
                        selectedCustomer?.totalPending !== undefined
                          ? selectedCustomer?.totalPending
                          : selectedCustomer?.balance || 0,
                      ).toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>

                {(() => {
                  const custPending = Number(
                    selectedCustomer?.totalPending !== undefined
                      ? selectedCustomer?.totalPending
                      : selectedCustomer?.balance || 0,
                  );
                  const amtNum = parseFloat(paymentAmount) || 0;
                  const discNum = parseFloat(paymentDiscount) || 0;
                  const totalRed = amtNum + discNum;
                  const remaining = Math.max(0, custPending - totalRed);
                  const isFullySettled = custPending > 0 && remaining === 0;

                  return (
                    <>
                      <Text style={styles.fieldLabel}>Payment Amount (₹) *</Text>
                      <TextInput
                        style={styles.amountInput}
                        keyboardType="numeric"
                        value={paymentAmount}
                        onChangeText={setPaymentAmount}
                        placeholder="Enter amount received"
                        placeholderTextColor={colors.text.muted}
                      />

                      <View style={styles.shortcutRow}>
                        <Pressable
                          style={styles.shortcutBtn}
                          onPress={() => {
                            setPaymentAmount(String(custPending));
                            setPaymentDiscount("0");
                          }}
                        >
                          <Text style={styles.shortcutBtnText}>Full Pay</Text>
                        </Pressable>
                        <Pressable style={styles.shortcutBtn} onPress={() => setPaymentAmount("1000")}>
                          <Text style={styles.shortcutBtnText}>₹1,000</Text>
                        </Pressable>
                        <Pressable style={styles.shortcutBtn} onPress={() => setPaymentAmount("5000")}>
                          <Text style={styles.shortcutBtnText}>₹5,000</Text>
                        </Pressable>
                        <Pressable style={styles.shortcutBtn} onPress={() => setPaymentAmount("10000")}>
                          <Text style={styles.shortcutBtnText}>₹10,000</Text>
                        </Pressable>
                      </View>

                      {/* Discount / Balance Waiver Section */}
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <Text style={styles.fieldLabel}>Discount / Waiver (₹) (Optional)</Text>
                        {custPending > 0 && amtNum > 0 && amtNum < custPending && (
                          <Pressable
                            onPress={() => setPaymentDiscount(String(Math.max(0, custPending - amtNum)))}
                            style={{
                              paddingVertical: 2,
                              paddingHorizontal: 8,
                              backgroundColor: colors.accent.success + "20",
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: colors.accent.success + "40",
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.accent.success }}>
                              Waiver Remaining (₹{(custPending - amtNum).toLocaleString("en-IN")})
                            </Text>
                          </Pressable>
                        )}
                      </View>

                      <TextInput
                        style={[styles.amountInput, { borderColor: colors.accent.success + "70" }]}
                        keyboardType="numeric"
                        value={paymentDiscount}
                        onChangeText={setPaymentDiscount}
                        placeholder="Enter discount / balance waiver amount"
                        placeholderTextColor={colors.text.muted}
                      />

                      {/* Discount Quick Presets */}
                      <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.md, flexWrap: "wrap" }}>
                        {[100, 200, 500, 1000].map((preset) => (
                          <Pressable
                            key={preset}
                            style={{
                              paddingVertical: 4,
                              paddingHorizontal: 10,
                              borderRadius: 16,
                              backgroundColor: colors.bg.elevated,
                              borderWidth: 1,
                              borderColor: colors.border.subtle,
                            }}
                            onPress={() => setPaymentDiscount(String(preset))}
                          >
                            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.secondary }}>
                              +₹{preset} Disc
                            </Text>
                          </Pressable>
                        ))}
                        {custPending > 0 && (
                          <Pressable
                            style={{
                              paddingVertical: 4,
                              paddingHorizontal: 10,
                              borderRadius: 16,
                              backgroundColor: colors.accent.success + "20",
                              borderWidth: 1,
                              borderColor: colors.accent.success,
                            }}
                            onPress={() => {
                              setPaymentAmount("0");
                              setPaymentDiscount(String(custPending));
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.success }}>
                              100% Full Waiver
                            </Text>
                          </Pressable>
                        )}
                      </View>

                      {/* Real-time Settlement Calculation Card */}
                      {(amtNum > 0 || discNum > 0 || custPending > 0) && (
                        <View style={{
                          backgroundColor: colors.bg.primary,
                          borderRadius: 12,
                          padding: 12,
                          borderWidth: 1,
                          borderColor: colors.border.subtle,
                          marginBottom: spacing.md,
                        }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: colors.text.secondary }}>Total Pending Balance:</Text>
                            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.primary }}>
                              ₹{custPending.toLocaleString("en-IN")}
                            </Text>
                          </View>
                          {amtNum > 0 && (
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                              <Text style={{ fontSize: 12, color: colors.text.secondary }}>Amount Received:</Text>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.primary }}>
                                - ₹{amtNum.toLocaleString("en-IN")}
                              </Text>
                            </View>
                          )}
                          {discNum > 0 && (
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                              <Text style={{ fontSize: 12, color: colors.accent.success, fontWeight: "600" }}>Discount / Waiver:</Text>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.success }}>
                                - ₹{discNum.toLocaleString("en-IN")}
                              </Text>
                            </View>
                          )}
                          <View style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            borderTopWidth: 1,
                            borderTopColor: colors.border.subtle,
                            paddingTop: 6,
                            marginTop: 2,
                          }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary }}>
                              Remaining Balance:
                            </Text>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={{
                                fontSize: 14,
                                fontWeight: "800",
                                color: isFullySettled ? colors.accent.success : (remaining > 0 ? colors.accent.danger : colors.text.primary),
                              }}>
                                ₹{remaining.toLocaleString("en-IN")}
                              </Text>
                              {isFullySettled && (
                                <View style={{
                                  backgroundColor: colors.accent.success + "20",
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 4,
                                }}>
                                  <Text style={{ fontSize: 10, fontWeight: "800", color: colors.accent.success }}>
                                    CLEARED
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>
                      )}
                    </>
                  );
                })()}

                <Text style={styles.fieldLabel}>Payment Method *</Text>
                <View style={styles.methodGrid}>
                  {[
                    { key: "Cash", icon: "payments", color: colors.accent.success },
                    { key: "UPI", icon: "phone-android", color: colors.accent.info },
                    { key: "Bank Transfer", icon: "account-balance", color: colors.accent.primary },
                    { key: "Cheque", icon: "offline-pin", color: colors.accent.warning },
                    { key: "Other", icon: "more-horiz", color: colors.text.muted },
                  ].map((method) => {
                    const isSelected = paymentMethod === method.key;
                    return (
                      <Pressable
                        key={method.key}
                        style={[
                          styles.methodChip,
                          isSelected && {
                            borderColor: method.color,
                            backgroundColor: `${method.color}15`,
                          },
                        ]}
                        onPress={() => setPaymentMethod(method.key)}
                      >
                        <MaterialIcons
                          name={method.icon as any}
                          size={24}
                          color={isSelected ? method.color : colors.text.muted}
                        />
                        <Text
                          style={[
                            styles.methodChipText,
                            isSelected && { color: method.color, fontWeight: "700" },
                          ]}
                        >
                          {method.key}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>Payment Date *</Text>
                <Pressable
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: colors.bg.primary,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 12,
                  }}
                  onPress={() => setIsPaymentCalendarOpen(true)}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <MaterialIcons name="event" size={20} color={colors.accent.primary} />
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text.primary }}>
                      {paymentDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.primary }}>Change Date</Text>
                </Pressable>

                <Text style={styles.fieldLabel}>Notes (Optional)</Text>
                <TextInput
                  style={[styles.amountInput, { height: 60, textAlignVertical: "top", paddingVertical: 10 }]}
                  multiline={true}
                  numberOfLines={2}
                  value={paymentNotes}
                  onChangeText={setPaymentNotes}
                  placeholder="Receipt references, remarks..."
                  placeholderTextColor={colors.text.muted}
                />

                <Pressable
                  style={styles.submitPaymentBtn}
                  onPress={handleSavePayment}
                  disabled={isSavingPayment}
                >
                  {isSavingPayment ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.submitPaymentBtnText}>Save Payment</Text>
                  )}
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Payment Calendar Modal */}
      <EasyCalendarModal
        visible={isPaymentCalendarOpen}
        date={paymentDate}
        onSelectDate={(d) => {
          setPaymentDate(d);
          setIsPaymentCalendarOpen(false);
        }}
        onClose={() => setIsPaymentCalendarOpen(false)}
        title="Select Payment Date"
      />

      {/* ========== RECEIVED PAYMENTS BREAKDOWN MODAL ========== */}
      <Modal
        visible={isReceivedBreakdownOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsReceivedBreakdownOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalFlexSpacer}
            onPress={() => setIsReceivedBreakdownOpen(false)}
          />

          <View style={[styles.modalContent, { maxHeight: "85%" }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: `${colors.accent.success}18`,
                  justifyContent: "center",
                  alignItems: "center",
                }}>
                  <MaterialIcons name="account-balance-wallet" size={20} color={colors.accent.success} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Received Breakdown</Text>
                  <Text style={{ fontSize: 12, color: colors.text.secondary, fontWeight: "600" }}>
                    {getDayLabel(selectedTargetKey)} Report
                  </Text>
                </View>
              </View>

              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => setIsReceivedBreakdownOpen(false)}
              >
                <MaterialIcons name="close" size={22} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12 }}>
              {/* Grand Total Banner */}
              <View style={{
                backgroundColor: colors.bg.primary,
                borderRadius: 16,
                padding: 16,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: `${colors.accent.success}40`,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                ...shadows.subtle,
              }}>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.secondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Total Collection
                  </Text>
                  <Text style={{ fontSize: 24, fontWeight: "900", color: colors.accent.success, marginTop: 2 }}>
                    ₹{receivedBreakdown.grandTotal.toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={{
                  backgroundColor: `${colors.accent.success}15`,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: `${colors.accent.success}30`,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.success }}>
                    {receivedBreakdown.list.reduce((sum, m) => sum + m.count, 0)} {receivedBreakdown.list.reduce((sum, m) => sum + m.count, 0) === 1 ? "Payment" : "Payments"}
                  </Text>
                </View>
              </View>

              {receivedBreakdown.list.length === 0 ? (
                <View style={styles.modalEmptyState}>
                  <MaterialIcons name="payments" size={48} color={colors.text.muted} style={{ marginBottom: 8 }} />
                  <Text style={styles.modalEmptyText}>
                    No payments received on {getDayLabel(selectedTargetKey).toLowerCase()}.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.secondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                    Payment Types Summary
                  </Text>

                  {/* Payment Type Cards */}
                  <View style={{ gap: 10, marginBottom: 20 }}>
                    {receivedBreakdown.list.map((m) => {
                      const pct = receivedBreakdown.grandTotal > 0
                        ? Math.round((m.total / receivedBreakdown.grandTotal) * 100)
                        : 0;

                      let iconName = "payments";
                      let iconColor = colors.accent.success;
                      const mUpper = m.method.toUpperCase();

                      if (mUpper.includes("UPI") || mUpper.includes("GPAY") || mUpper.includes("PHONE") || mUpper.includes("PAYTM")) {
                        iconName = "phone-android";
                        iconColor = colors.accent.info;
                      } else if (mUpper.includes("BANK") || mUpper.includes("TRANSFER") || mUpper.includes("NEFT") || mUpper.includes("ONLINE")) {
                        iconName = "account-balance";
                        iconColor = colors.accent.primary;
                      } else if (mUpper.includes("CHEQUE") || mUpper.includes("CHECK")) {
                        iconName = "offline-pin";
                        iconColor = colors.accent.warning;
                      } else if (mUpper.includes("OTHER")) {
                        iconName = "more-horiz";
                        iconColor = colors.text.muted;
                      }

                      return (
                        <View
                          key={m.method}
                          style={{
                            backgroundColor: colors.bg.card,
                            borderRadius: 14,
                            padding: 14,
                            borderWidth: 1,
                            borderColor: colors.border.subtle,
                            ...shadows.subtle,
                          }}
                        >
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                              <View style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                backgroundColor: `${iconColor}15`,
                                justifyContent: "center",
                                alignItems: "center",
                              }}>
                                <MaterialIcons name={iconName as any} size={20} color={iconColor} />
                              </View>
                              <View>
                                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text.primary }}>
                                  {m.method}
                                </Text>
                                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.muted }}>
                                  {m.count} {m.count === 1 ? "entry" : "entries"} • {pct}% of total
                                </Text>
                              </View>
                            </View>

                            <Text style={{ fontSize: 16, fontWeight: "800", color: iconColor }}>
                              ₹{m.total.toLocaleString("en-IN")}
                            </Text>
                          </View>

                          {/* Percentage Progress Bar */}
                          <View style={{ height: 5, backgroundColor: colors.bg.primary, borderRadius: 3, overflow: "hidden", marginTop: 4 }}>
                            <View style={{ width: `${pct}%`, height: "100%", backgroundColor: iconColor, borderRadius: 3 }} />
                          </View>

                          {/* List of transactions for this payment type */}
                          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border.subtle, gap: 8 }}>
                            {m.items.map((item: any) => {
                              const itemDate = item.time instanceof Date ? item.time : new Date(item.time);
                              const timeStr = !isNaN(itemDate.getTime())
                                ? itemDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                : "";

                              return (
                                <View key={item.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 }}>
                                  <View style={{ flex: 1, marginRight: 8 }}>
                                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary }} numberOfLines={1}>
                                      {item.title}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: colors.text.muted }} numberOfLines={1}>
                                      {timeStr ? `⏰ ${timeStr} • ` : ""}{item.subtitle}
                                    </Text>
                                  </View>
                                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary, marginRight: 2 }}>
                                      ₹{item.amount.toLocaleString("en-IN")}
                                    </Text>

                                  {/* Edit Action Button */}
                                  <Pressable
                                    style={({ pressed }) => ({
                                      width: 28,
                                      height: 28,
                                      borderRadius: 14,
                                      backgroundColor: `${colors.accent.primary}15`,
                                      justifyContent: "center",
                                      alignItems: "center",
                                      opacity: pressed ? 0.7 : 1,
                                    })}
                                    onPress={() => handleOpenEditBreakdownItem(item)}
                                    hitSlop={6}
                                  >
                                    <MaterialIcons name="edit" size={14} color={colors.accent.primary} />
                                  </Pressable>

                                  {/* Delete Action Button */}
                                  <Pressable
                                    style={({ pressed }) => ({
                                      width: 28,
                                      height: 28,
                                      borderRadius: 14,
                                      backgroundColor: `${colors.accent.danger}15`,
                                      justifyContent: "center",
                                      alignItems: "center",
                                      opacity: pressed ? 0.7 : 1,
                                    })}
                                    onPress={() => handleDeleteBreakdownItem(item)}
                                    hitSlop={6}
                                  >
                                    <MaterialIcons name="delete-outline" size={14} color={colors.accent.danger} />
                                  </Pressable>
                                </View>
                              </View>
                            );
                          })}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Quick action button to add payment */}
              <Pressable
                style={({ pressed }) => [
                  styles.submitPaymentBtn,
                  { marginTop: 4, flexDirection: "row", gap: 6, backgroundColor: colors.accent.success },
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => {
                  setIsReceivedBreakdownOpen(false);
                  setPaymentDate(new Date());
                  setIsPaymentModalOpen(true);
                }}
              >
                <MaterialIcons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.submitPaymentBtnText}>Receive New Payment</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========== EDIT RECEIVED BREAKDOWN ITEM MODAL ========== */}
      <Modal
        visible={isEditBreakdownModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsEditBreakdownModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable
            style={styles.modalFlexSpacer}
            onPress={() => setIsEditBreakdownModalOpen(false)}
          />

          <View style={[styles.modalContent, { paddingBottom: 24 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: `${colors.accent.primary}18`,
                  justifyContent: "center",
                  alignItems: "center",
                }}>
                  <MaterialIcons name="edit" size={20} color={colors.accent.primary} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Edit Payment Entry</Text>
                  <Text style={{ fontSize: 12, color: colors.text.secondary, fontWeight: "600" }}>
                    {editingBreakdownItem?.title || "Transaction"}
                  </Text>
                </View>
              </View>

              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => setIsEditBreakdownModalOpen(false)}
              >
                <MaterialIcons name="close" size={22} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12, gap: 16 }}>
              {/* Payment Amount Input */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary, marginBottom: 6 }}>
                  Payment Amount (₹)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: colors.bg.primary,
                    borderWidth: 1,
                    borderColor: colors.border.medium,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    fontSize: 16,
                    fontWeight: "700",
                    color: colors.text.primary,
                  }}
                  keyboardType="numeric"
                  value={editBreakdownAmount}
                  onChangeText={setEditBreakdownAmount}
                  placeholder="0.00"
                  placeholderTextColor={colors.text.muted}
                />
              </View>

              {/* Discount / Waiver Amount Input for Direct Payments */}
              {editingBreakdownItem?.id?.startsWith("payment-") && (
                <View>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.accent.success, marginBottom: 6 }}>
                    Discount / Waiver Amount (₹)
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: colors.bg.primary,
                      borderWidth: 1,
                      borderColor: colors.accent.success + "80",
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      fontSize: 16,
                      fontWeight: "700",
                      color: colors.text.primary,
                    }}
                    keyboardType="numeric"
                    value={editBreakdownDiscount}
                    onChangeText={setEditBreakdownDiscount}
                    placeholder="0.00"
                    placeholderTextColor={colors.text.muted}
                  />
                </View>
              )}

              {/* Payment Method Selection */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary, marginBottom: 8 }}>
                  Payment Method
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Other"].map((method) => {
                    const selected = editBreakdownMethod === method;
                    return (
                      <Pressable
                        key={method}
                        onPress={() => setEditBreakdownMethod(method)}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 20,
                          backgroundColor: selected ? colors.accent.primary : colors.bg.primary,
                          borderWidth: 1,
                          borderColor: selected ? colors.accent.primary : colors.border.medium,
                        }}
                      >
                        <Text style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: selected ? "#FFFFFF" : colors.text.secondary,
                        }}>
                          {method}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Notes / Description */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary, marginBottom: 6 }}>
                  Notes / Reference
                </Text>
                <TextInput
                  style={{
                    backgroundColor: colors.bg.primary,
                    borderWidth: 1,
                    borderColor: colors.border.medium,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    fontSize: 14,
                    color: colors.text.primary,
                  }}
                  value={editBreakdownNotes}
                  onChangeText={setEditBreakdownNotes}
                  placeholder="Payment notes or description..."
                  placeholderTextColor={colors.text.muted}
                />
              </View>

              {/* Submit / Save Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.submitPaymentBtn,
                  { marginTop: 8, backgroundColor: colors.accent.primary },
                  pressed && styles.buttonPressed,
                ]}
                disabled={isSavingEditBreakdown}
                onPress={handleSaveEditBreakdownItem}
              >
                {isSavingEditBreakdown ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitPaymentBtnText}>Save Changes</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ========== ADD VISITING CARD MODAL ========== */}
      <Modal
        visible={isAddCardModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsAddCardModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center", padding: 16 }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsAddCardModalOpen(false)} />
          <View style={{ width: "100%", maxWidth: 440, maxHeight: "88%", backgroundColor: colors.bg.card, borderRadius: 20, padding: 18, elevation: 10, zIndex: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border.subtle }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="badge" size={22} color="#8b5cf6" />
                <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text.primary }}>Add Visiting Card</Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  style={{ backgroundColor: "#8b5cf615", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
                  onPress={() => {
                    setIsAddCardModalOpen(false);
                    router.push("/settings/visiting-cards" as any);
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#8b5cf6" }}>View All Cards ↗</Text>
                </Pressable>

                <Pressable
                  style={styles.modalCloseBtn}
                  onPress={() => setIsAddCardModalOpen(false)}
                >
                  <MaterialIcons name="close" size={22} color={colors.text.secondary} />
                </Pressable>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Category / Role *</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {[
                  { id: "Crusher", label: "Crusher", color: "#8b5cf6" },
                  { id: "Mistry", label: "Mistry", color: "#f59e0b" },
                  { id: "Driver", label: "Driver", color: "#3b82f6" },
                  { id: "Worker", label: "Worker", color: "#10b981" },
                  { id: "Customer", label: "Customer", color: "#ec4899" },
                  { id: "Mechanic", label: "Mechanic", color: "#6366f1" },
                  { id: "Other", label: "Other", color: "#64748b" },
                ].map((c) => {
                  const active = cardCategory === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      style={{
                        paddingHorizontal: 11,
                        paddingVertical: 7,
                        borderRadius: 10,
                        backgroundColor: active ? c.color : colors.bg.primary,
                        borderWidth: 1.5,
                        borderColor: active ? c.color : colors.border.subtle,
                      }}
                      onPress={() => setCardCategory(c.id)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: active ? "800" : "600", color: active ? "#FFFFFF" : colors.text.primary }}>
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Business / Entity / Person Name *</Text>
              <TextInput
                style={styles.amountInput}
                value={cardName}
                onChangeText={setCardName}
                placeholder="e.g. Sri Balaji Stone Crusher / Ramesh Mistry"
                placeholderTextColor={colors.text.muted}
              />

              <Text style={styles.fieldLabel}>Contact Person Name</Text>
              <TextInput
                style={styles.amountInput}
                value={cardContactPerson}
                onChangeText={setCardContactPerson}
                placeholder="e.g. Kumar (Owner / Operator)"
                placeholderTextColor={colors.text.muted}
              />

              <Text style={styles.fieldLabel}>Primary Mobile Number *</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="phone-pad"
                value={cardMobile}
                onChangeText={setCardMobile}
                placeholder="e.g. 9876543210"
                placeholderTextColor={colors.text.muted}
              />

              <Text style={styles.fieldLabel}>Alternate / WhatsApp Number</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="phone-pad"
                value={cardAltMobile}
                onChangeText={setCardAltMobile}
                placeholder="e.g. 9123456789"
                placeholderTextColor={colors.text.muted}
              />

              {/* Dynamic Products List */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, marginBottom: 6 }}>
                <Text style={styles.fieldLabel}>Specific Products & Rates</Text>
                <Pressable
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accent.primary + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
                  onPress={handleAddCardProduct}
                >
                  <MaterialIcons name="add-circle" size={16} color={colors.accent.primary} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.primary }}>+ Add More Product</Text>
                </Pressable>
              </View>

              {cardProducts.map((prod, idx) => (
                <View key={prod.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <TextInput
                    style={[styles.amountInput, { flex: 2, marginBottom: 0 }]}
                    value={prod.name}
                    onChangeText={(v) => handleUpdateCardProduct(idx, "name", v)}
                    placeholder={`Product ${idx + 1} (e.g. 20mm Jelly)`}
                    placeholderTextColor={colors.text.muted}
                  />
                  <TextInput
                    style={[styles.amountInput, { flex: 1, marginBottom: 0 }]}
                    value={prod.rate}
                    onChangeText={(v) => handleUpdateCardProduct(idx, "rate", v)}
                    keyboardType="numeric"
                    placeholder="Rate (₹)"
                    placeholderTextColor={colors.text.muted}
                  />
                  {cardProducts.length > 1 && (
                    <Pressable onPress={() => handleRemoveCardProduct(idx)} hitSlop={8}>
                      <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                    </Pressable>
                  )}
                </View>
              ))}

              <Text style={styles.fieldLabel}>Products / Services Overview</Text>
              <TextInput
                style={styles.amountInput}
                value={cardServices}
                onChangeText={setCardServices}
                placeholder="e.g. 20mm Jelly, Stone Dust, Masonry Work"
                placeholderTextColor={colors.text.muted}
              />

              {/* Quick Tag Suggestions */}
              <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.muted, marginBottom: 4 }}>Quick Tags (Tap to add):</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {(
                    {
                      Crusher: ["20mm Jelly", "12mm Jelly", "Stone Dust", "M Sand", "P Sand", "40mm Jelly"],
                      Mistry: ["Masonry Work", "Block Laying", "Plastering", "Concrete", "Tile Work"],
                      Driver: ["Tipper Driver", "Tractor Driver", "Lorry Transport", "Heavy Tipper"],
                      Worker: ["Loading Staff", "Unloading Staff", "General Helper", "Operator"],
                      Customer: ["Retail Buyer", "Contractor", "Builder", "Wholesaler"],
                      Mechanic: ["Machine Maintenance", "Electrical", "Hydraulics", "Welding"],
                      Other: ["Raw Materials", "Equipment", "Supplies"],
                    }[cardCategory] || ["Raw Materials", "Services"]
                  ).map((tag) => (
                    <Pressable
                      key={tag}
                      style={{ backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.subtle, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 }}
                      onPress={() => {
                        if (!cardServices) {
                          setCardServices(tag);
                        } else if (!cardServices.includes(tag)) {
                          setCardServices(`${cardServices}, ${tag}`);
                        }
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.accent.primary }}>+ {tag}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <Text style={styles.fieldLabel}>City / Location / Address</Text>
              <TextInput
                style={styles.amountInput}
                value={cardAddress}
                onChangeText={setCardAddress}
                placeholder="e.g. Industrial Area, Mysuru"
                placeholderTextColor={colors.text.muted}
              />

              <Text style={styles.fieldLabel}>Notes / Remarks (Optional)</Text>
              <TextInput
                style={[styles.amountInput, { height: 60, textAlignVertical: "top", paddingVertical: 10 }]}
                multiline={true}
                numberOfLines={2}
                value={cardNotes}
                onChangeText={setCardNotes}
                placeholder="Notes or remarks..."
                placeholderTextColor={colors.text.muted}
              />

              <Pressable
                style={[styles.submitPaymentBtn, { backgroundColor: "#8b5cf6", marginTop: 12, borderRadius: 12 }]}
                onPress={handleSaveVisitingCard}
                disabled={isSavingCard}
              >
                {isSavingCard ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.submitPaymentBtnText}>Save Visiting Card</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ========== ATTENDANCE MODAL ========== */}
      <Modal
        visible={isAttendanceModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseAttendanceModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalFlexSpacer} onPress={handleCloseAttendanceModal} />

          <View style={[styles.modalContent, { minHeight: "85%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>👷 Mark Attendance</Text>
              <Pressable style={styles.modalCloseBtn} onPress={handleCloseAttendanceModal}>
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            {showAttendanceSuccess ? (
              <View style={styles.successContainer}>
                <View style={styles.successBadge}>
                  <MaterialIcons name="check-circle" size={80} color={colors.accent.success} />
                </View>
                <Text style={styles.successTitle}>Attendance Saved!</Text>
                <Text style={styles.successSub}>All worker attendance has been recorded</Text>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <View style={[styles.attDateBanner, { justifyContent: "space-between" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <MaterialIcons name="event" size={18} color={colors.accent.info} />
                    <Text style={styles.attDateText}>
                      {new Date(selectedAttendanceTargetKey).toLocaleDateString("en-IN", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        backgroundColor: `${colors.accent.info}20`,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 8,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => setIsAttendanceCalendarModalOpen(true)}
                  >
                    <MaterialIcons name="edit-calendar" size={14} color={colors.accent.info} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.info }}>
                      Change Date
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.modalSearchBox}>
                  <MaterialIcons name="search" size={20} color={colors.text.muted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.modalSearchInput}
                    placeholder="Search workers by name..."
                    value={attendanceSearch}
                    onChangeText={setAttendanceSearch}
                    placeholderTextColor={colors.text.muted}
                  />
                </View>

                <View style={styles.attBulkRow}>
                  <Pressable style={[styles.attBulkBtn, { backgroundColor: colors.accent.successMuted, borderColor: colors.accent.success }]} onPress={handleMarkAllPresent}>
                    <MaterialIcons name="done-all" size={16} color={colors.accent.success} />
                    <Text style={[styles.attBulkBtnText, { color: colors.accent.success }]}>All Present</Text>
                  </Pressable>
                  <Pressable style={[styles.attBulkBtn, { backgroundColor: colors.accent.dangerMuted, borderColor: colors.accent.danger }]} onPress={handleMarkAllAbsent}>
                    <MaterialIcons name="clear" size={16} color={colors.accent.danger} />
                    <Text style={[styles.attBulkBtnText, { color: colors.accent.danger }]}>All Absent</Text>
                  </Pressable>
                </View>

                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {(() => {
                    const unmarkedWorkers = activeWorkers.filter((w: any) =>
                      (!todayAttendanceMap[w.id] || editingWorkerIds[w.id]) &&
                      w.name?.toLowerCase().includes(attendanceSearch.toLowerCase())
                    );

                    const markedWorkers = activeWorkers.filter((w: any) =>
                      (todayAttendanceMap[w.id] && !editingWorkerIds[w.id]) &&
                      w.name?.toLowerCase().includes(attendanceSearch.toLowerCase())
                    );

                    if (activeWorkers.length === 0) {
                      return (
                        <View style={styles.modalEmptyState}>
                          <MaterialIcons name="person-off" size={48} color={colors.text.muted} />
                          <Text style={styles.modalEmptyText}>No active workers found. Add workers in Settings → Worker Management.</Text>
                        </View>
                      );
                    }

                    return (
                      <>
                        {unmarkedWorkers.length > 0 && (
                          <Text style={styles.attSectionTitle}>Pending ({unmarkedWorkers.length})</Text>
                        )}
                        {unmarkedWorkers.map((worker: any) => {
                          const entry = attendanceEntries[worker.id] || { status: "present", overtime: "0", pieces: "0" };
                          return (
                            <View key={worker.id} style={styles.attWorkerCard}>
                              <View style={styles.attWorkerTop}>
                                <View style={styles.attWorkerInitials}>
                                  <Text style={styles.attWorkerInitialsText}>
                                    {worker.name?.substring(0, 2).toUpperCase() || "WK"}
                                  </Text>
                                </View>
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                  <Text style={styles.attWorkerName}>{worker.name}</Text>
                                  <Text style={styles.attWorkerRole}>
                                    {worker.role} • {worker.type === "regular" ? (worker.billingSystem === "Piece-Rate" ? `Rate: ₹${Number(worker.pieceRate || 0)}/unit` : `₹${Number(worker.dailyWage || 0).toLocaleString("en-IN")}/day`) : `Contract Value: ₹${Number(worker.totalContractValue || 0).toLocaleString("en-IN")}`}
                                    {worker.hasShifting ? ` • Shifting (₹${(worker.loadingCost || 0) + (worker.unloadingCost || 0)})` : ""}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.attStatusRow}>
                                {(["present", "half-day", "absent"] as const).map((st) => {
                                  const isActive = entry.status === st;
                                  const config = {
                                    present: { bg: colors.accent.successMuted, border: colors.accent.success, text: colors.accent.success, icon: "check-circle" as const, label: "Present" },
                                    "half-day": { bg: colors.accent.warningMuted, border: colors.accent.warning, text: colors.accent.warning, icon: "timelapse" as const, label: "Half Day" },
                                    absent: { bg: colors.accent.dangerMuted, border: colors.accent.danger, text: colors.accent.danger, icon: "cancel" as const, label: "Absent" },
                                  }[st];
                                  return (
                                    <Pressable
                                      key={st}
                                      style={[
                                        styles.attStatusChip,
                                        isActive && { backgroundColor: config.bg, borderColor: config.border },
                                      ]}
                                      onPress={() => setWorkerStatus(worker.id, st)}
                                    >
                                      <MaterialIcons name={config.icon} size={16} color={isActive ? config.text : colors.text.muted} />
                                      <Text style={[styles.attStatusChipText, isActive && { color: config.text, fontWeight: "700" }]}>
                                        {config.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>

                              {entry.status !== "absent" && (
                                worker.billingSystem === "Piece-Rate" ? (
                                  <View style={styles.attOvertimeRow}>
                                    <MaterialIcons name="tag" size={16} color={colors.accent.primary} />
                                    <Text style={styles.attOvertimeLabel}>Units produced:</Text>
                                    <TextInput
                                      style={styles.attOvertimeInput}
                                      value={entry.pieces === "0" ? "" : (entry.pieces || "")}
                                      onChangeText={(v) => setWorkerPieces(worker.id, v)}
                                      keyboardType="numeric"
                                      placeholder="0"
                                      placeholderTextColor={colors.text.muted}
                                    />
                                  </View>
                                ) : (
                                  <View style={styles.attOvertimeRow}>
                                    <MaterialIcons name="more-time" size={16} color={colors.accent.primary} />
                                    <Text style={styles.attOvertimeLabel}>Overtime hrs:</Text>
                                    <TextInput
                                      style={styles.attOvertimeInput}
                                      value={entry.overtime}
                                      onChangeText={(v) => setWorkerOvertime(worker.id, v)}
                                      keyboardType="numeric"
                                      placeholder="0"
                                      placeholderTextColor={colors.text.muted}
                                    />
                                  </View>
                                )
                              )}
                            </View>
                          );
                        })}

                        {markedWorkers.length > 0 && (
                          <>
                            <Text style={[styles.attSectionTitle, { marginTop: 16 }]}>
                              Already Marked ({markedWorkers.length})
                            </Text>
                            {markedWorkers.map((worker: any) => {
                              const record = todayAttendanceMap[worker.id];
                              const statusConfig = ({
                                present: { color: colors.accent.success, label: "Present", icon: "check-circle" as const },
                                "half-day": { color: colors.accent.warning, label: "Half Day", icon: "timelapse" as const },
                                absent: { color: colors.accent.danger, label: "Absent", icon: "cancel" as const },
                              } as Record<string, { color: string; label: string; icon: any }>)[record.status] || { color: colors.text.muted, label: record.status, icon: "help" as const };

                              return (
                                <View key={worker.id} style={[styles.attWorkerCard, { opacity: 0.6 }]}>
                                  <View style={styles.attWorkerTop}>
                                    <View style={[styles.attWorkerInitials, { backgroundColor: `${statusConfig.color}20` }]}>
                                      <MaterialIcons name={statusConfig.icon} size={20} color={statusConfig.color} />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                      <Text style={styles.attWorkerName}>{worker.name}</Text>
                                      <Text style={[styles.attWorkerRole, { color: statusConfig.color }]}>
                                        {statusConfig.label}
                                        {worker.billingSystem === "Piece-Rate"
                                          ? (record.piecesProduced > 0 ? ` • ${record.piecesProduced} units` : "")
                                          : (record.overtimeHours > 0 ? ` • +${record.overtimeHours}hr OT` : "")}
                                      </Text>
                                    </View>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                      <View style={[styles.attMarkedBadge, { backgroundColor: `${statusConfig.color}15` }]}>
                                        <Text style={[styles.attMarkedBadgeText, { color: statusConfig.color }]}>✓ Marked</Text>
                                      </View>
                                      <Pressable
                                        style={({ pressed }) => [
                                          { padding: 6, borderRadius: 8, backgroundColor: colors.bg.elevated },
                                          pressed && { opacity: 0.7 }
                                        ]}
                                        onPress={() => {
                                          setAttendanceEntries((prev) => ({
                                            ...prev,
                                            [worker.id]: {
                                              status: record.status,
                                              overtime: String(record.overtimeHours || "0"),
                                              pieces: String(record.piecesProduced || "0"),
                                            }
                                          }));
                                          setEditingWorkerIds((prev) => ({
                                            ...prev,
                                            [worker.id]: true
                                          }));
                                        }}
                                      >
                                        <MaterialIcons name="edit" size={16} color={colors.text.secondary} />
                                      </Pressable>
                                    </View>
                                  </View>
                                </View>
                              );
                            })}
                          </>
                        )}

                        {unmarkedWorkers.length === 0 && markedWorkers.length > 0 && (
                          <View style={[styles.modalEmptyState, { paddingVertical: 20 }]}>
                            <MaterialIcons name="task-alt" size={40} color={colors.accent.success} />
                            <Text style={[styles.modalEmptyText, { color: colors.accent.success, fontWeight: "700" }]}>
                              All workers are marked for {getDayLabel(selectedAttendanceTargetKey).toLowerCase() === "today" ? "today" : getDayLabel(selectedAttendanceTargetKey).toLowerCase() === "yesterday" ? "yesterday" : getDayLabel(selectedAttendanceTargetKey)}!
                            </Text>
                          </View>
                        )}
                      </>
                    );
                  })()}
                </ScrollView>

                {Object.keys(attendanceEntries).length > 0 && (
                  <Pressable
                    style={styles.attSaveBtn}
                    onPress={handleSaveAttendance}
                    disabled={isSavingAttendance}
                  >
                    {isSavingAttendance ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <MaterialIcons name="save" size={18} color="#ffffff" />
                        <Text style={styles.attSaveBtnText}>
                          Save Attendance ({Object.keys(attendanceEntries).length} workers)
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ATTENDANCE CALENDAR DATE SELECTION MODAL */}
      <Modal
        visible={isAttendanceCalendarModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAttendanceCalendarModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsAttendanceCalendarModalOpen(false)}>
          <Pressable style={styles.calendarModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="calendar-today" size={20} color={colors.accent.info} />
                <Text style={styles.modalTitle}>Attendance Date</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsAttendanceCalendarModalOpen(false)}>
                <MaterialIcons name="close" size={22} color={colors.text.muted} />
              </Pressable>
            </View>

            {/* Date Navigator Header Bar */}
            <View style={styles.dateNavRow}>
              <Pressable style={styles.dateNavBtn} onPress={() => shiftAttendanceDate(-1)}>
                <MaterialIcons name="chevron-left" size={24} color={colors.text.primary} />
              </Pressable>
              <View style={styles.dateNavCenter}>
                <Text style={styles.dateNavTitle}>{getDayLabel(selectedAttendanceTargetKey)}</Text>
                <Text style={styles.dateNavSub}>
                  {new Date(selectedAttendanceTargetKey).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
                </Text>
              </View>
              <Pressable style={styles.dateNavBtn} onPress={() => shiftAttendanceDate(1)}>
                <MaterialIcons name="chevron-right" size={24} color={colors.text.primary} />
              </Pressable>
            </View>

            {/* Quick Date Pills */}
            <View style={styles.quickDateRow}>
              {[
                { label: "Today", days: 0 },
                { label: "Yesterday", days: -1 },
                { label: "7 Days Ago", days: -7 },
                { label: "30 Days Ago", days: -30 },
              ].map((item) => {
                const target = new Date();
                target.setDate(target.getDate() + item.days);
                target.setHours(0, 0, 0, 0);
                const isSelected = selectedAttendanceTargetKey === target.getTime();
                return (
                  <Pressable
                    key={item.label}
                    style={[
                      styles.quickDatePill,
                      isSelected && { backgroundColor: `${colors.accent.info}1A`, borderColor: colors.accent.info },
                    ]}
                    onPress={() => {
                      setSelectedAttendanceDate(target);
                      setAttendanceEntries({});
                      setEditingWorkerIds({});
                      setIsAttendanceCalendarModalOpen(false);
                    }}
                  >
                    <Text style={[styles.quickDatePillText, isSelected && { color: colors.accent.info, fontWeight: "700" }]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Custom YYYY-MM-DD Date Input */}
            <View style={styles.customDateContainer}>
              <Text style={styles.fieldLabel}>Custom Date (YYYY-MM-DD)</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  style={[styles.modalSearchInput, { flex: 1 }]}
                  placeholder="e.g. 2026-07-18"
                  placeholderTextColor={colors.text.muted}
                  value={customAttendanceDateInput}
                  onChangeText={setCustomAttendanceDateInput}
                />
                <Pressable
                  style={[styles.applyDateBtn, { backgroundColor: colors.accent.info }]}
                  onPress={() => {
                    const parts = customAttendanceDateInput.split("-");
                    if (parts.length === 3) {
                      const y = Number(parts[0]);
                      const m = Number(parts[1]) - 1;
                      const d = Number(parts[2]);
                      const parsed = new Date(y, m, d);
                      if (!isNaN(parsed.getTime())) {
                        setSelectedAttendanceDate(parsed);
                        setAttendanceEntries({});
                        setEditingWorkerIds({});
                        setIsAttendanceCalendarModalOpen(false);
                        setCustomAttendanceDateInput("");
                        return;
                      }
                    }
                    Alert.alert("Invalid Date", "Please enter a valid date in YYYY-MM-DD format.");
                  }}
                >
                  <Text style={styles.applyDateBtnText}>Go</Text>
                </Pressable>
              </View>
            </View>

            {/* List of Dates with Attendance History */}
            <Text style={styles.attSectionTitle}>Attendance History Dates</Text>
            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
              {availableAttendanceDates.map((item) => {
                const isSelected = selectedAttendanceTargetKey === item.timestamp;
                const itemDate = new Date(item.timestamp);
                const dateStr = itemDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                const dayName = itemDate.toLocaleDateString("en-IN", { weekday: "short" });
                const label = getDayLabel(item.timestamp);

                return (
                  <Pressable
                    key={item.timestamp}
                    style={[
                      styles.calendarDateRow,
                      isSelected && { backgroundColor: `${colors.accent.info}10`, borderColor: `${colors.accent.info}40` },
                    ]}
                    onPress={() => {
                      setSelectedAttendanceDate(itemDate);
                      setAttendanceEntries({});
                      setEditingWorkerIds({});
                      setIsAttendanceCalendarModalOpen(false);
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <MaterialIcons
                        name={isSelected ? "event-available" : "event"}
                        size={20}
                        color={isSelected ? colors.accent.info : colors.text.secondary}
                      />
                      <View>
                        <Text style={[styles.calendarDateTitle, isSelected && { color: colors.accent.info }]}>
                          {label} ({dateStr})
                        </Text>
                        <Text style={styles.calendarDateSub}>
                          {dayName} • {item.count > 0 ? `${item.count} worker${item.count > 1 ? "s" : ""} marked${item.units > 0 ? ` • ${item.units} units` : ""}` : "No attendance marked"}
                        </Text>
                      </View>
                    </View>
                    {isSelected && (
                      <MaterialIcons name="check-circle" size={20} color={colors.accent.info} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* DAILY REPORT CALENDAR DATE SELECTION MODAL */}
      <Modal
        visible={isCalendarModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCalendarModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsCalendarModalOpen(false)}>
          <Pressable style={styles.calendarModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="calendar-today" size={20} color={colors.accent.primary} />
                <Text style={styles.modalTitle}>Daily Report Date</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsCalendarModalOpen(false)}>
                <MaterialIcons name="close" size={22} color={colors.text.muted} />
              </Pressable>
            </View>

            {/* Date Navigator Header Bar */}
            <View style={styles.dateNavRow}>
              <Pressable style={styles.dateNavBtn} onPress={() => shiftReportDate(-1)}>
                <MaterialIcons name="chevron-left" size={24} color={colors.text.primary} />
              </Pressable>
              <View style={styles.dateNavCenter}>
                <Text style={styles.dateNavTitle}>{getDayLabel(selectedTargetKey)}</Text>
                <Text style={styles.dateNavSub}>
                  {new Date(selectedTargetKey).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
                </Text>
              </View>
              <Pressable style={styles.dateNavBtn} onPress={() => shiftReportDate(1)}>
                <MaterialIcons name="chevron-right" size={24} color={colors.text.primary} />
              </Pressable>
            </View>

            {/* Quick Date Pills */}
            <View style={styles.quickDateRow}>
              {[
                { label: "Today", days: 0 },
                { label: "Yesterday", days: -1 },
                { label: "7 Days Ago", days: -7 },
                { label: "30 Days Ago", days: -30 },
              ].map((item) => {
                const target = new Date();
                target.setDate(target.getDate() + item.days);
                target.setHours(0, 0, 0, 0);
                const isSelected = selectedTargetKey === target.getTime();
                return (
                  <Pressable
                    key={item.label}
                    style={[
                      styles.quickDatePill,
                      isSelected && styles.quickDatePillActive,
                    ]}
                    onPress={() => {
                      setSelectedReportDate(target);
                      setIsCalendarModalOpen(false);
                    }}
                  >
                    <Text style={[styles.quickDatePillText, isSelected && styles.quickDatePillTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Custom YYYY-MM-DD Date Input */}
            <View style={styles.customDateContainer}>
              <Text style={styles.fieldLabel}>Custom Date (YYYY-MM-DD)</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  style={[styles.modalSearchInput, { flex: 1 }]}
                  placeholder="e.g. 2026-07-18"
                  placeholderTextColor={colors.text.muted}
                  value={customDateInput}
                  onChangeText={setCustomDateInput}
                />
                <Pressable
                  style={styles.applyDateBtn}
                  onPress={() => {
                    const parts = customDateInput.split("-");
                    if (parts.length === 3) {
                      const y = Number(parts[0]);
                      const m = Number(parts[1]) - 1;
                      const d = Number(parts[2]);
                      const parsed = new Date(y, m, d);
                      if (!isNaN(parsed.getTime())) {
                        setSelectedReportDate(parsed);
                        setIsCalendarModalOpen(false);
                        setCustomDateInput("");
                        return;
                      }
                    }
                    Alert.alert("Invalid Date", "Please enter a valid date in YYYY-MM-DD format.");
                  }}
                >
                  <Text style={styles.applyDateBtnText}>Go</Text>
                </Pressable>
              </View>
            </View>

            {/* List of Dates with Activity History */}
            <Text style={styles.attSectionTitle}>Activity History Dates</Text>
            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
              {availableReportDates.map((item) => {
                const isSelected = selectedTargetKey === item.timestamp;
                const itemDate = new Date(item.timestamp);
                const dateStr = itemDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                const dayName = itemDate.toLocaleDateString("en-IN", { weekday: "short" });
                const label = getDayLabel(item.timestamp);

                return (
                  <Pressable
                    key={item.timestamp}
                    style={[
                      styles.calendarDateRow,
                      isSelected && styles.calendarDateRowActive,
                    ]}
                    onPress={() => {
                      setSelectedReportDate(itemDate);
                      setIsCalendarModalOpen(false);
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <MaterialIcons
                        name={isSelected ? "event-available" : "event"}
                        size={20}
                        color={isSelected ? colors.accent.primary : colors.text.secondary}
                      />
                      <View>
                        <Text style={[styles.calendarDateTitle, isSelected && { color: colors.accent.primary }]}>
                          {label} ({dateStr})
                        </Text>
                        <Text style={styles.calendarDateSub}>
                          {dayName} • {item.count > 0 ? `${item.count} activity log${item.count > 1 ? "s" : ""}` : "No activities"}
                        </Text>
                      </View>
                    </View>
                    {isSelected && (
                      <MaterialIcons name="check-circle" size={20} color={colors.accent.primary} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ========== LOG NEW EXPENSE MODAL ========== */}
      <Modal
        visible={isAddExpenseModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAddExpenseModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalFlexSpacer} onPress={() => setIsAddExpenseModalOpen(false)} />
          <View style={[styles.modalContent, { maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="receipt-long" size={22} color={colors.accent.danger} />
                <Text style={styles.modalTitle}>Log New Expense</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsAddExpenseModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <Text style={styles.fieldLabel}>Expense Title *</Text>
              <TextInput
                style={styles.amountInput}
                value={addExpenseTitle}
                onChangeText={setAddExpenseTitle}
                placeholder="e.g. Fuel for Delivery Van, Office Rent"
                placeholderTextColor={colors.text.muted}
              />

              {/* Category */}
              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    "Fuel",
                    "Driver Salary",
                    "Labour Salary",
                    "Vehicle Maintenance",
                    "Machinery Maintenance",
                    "Office Expense",
                    "Electricity Bill",
                    "Rent",
                    "Food",
                    "Transport",
                    "Miscellaneous",
                  ].map((cat) => {
                    const isSelected = addExpenseCategory === cat;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => setAddExpenseCategory(cat)}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          borderRadius: 20,
                          backgroundColor: isSelected ? colors.accent.primary : colors.bg.primary,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.accent.primary : colors.border.subtle,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: isSelected ? "#ffffff" : colors.text.secondary,
                          }}
                        >
                          {cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Total Amount */}
              <Text style={styles.fieldLabel}>Total Amount (₹) *</Text>
              <TextInput
                style={styles.amountInput}
                value={addExpenseTotalAmount}
                onChangeText={setAddExpenseTotalAmount}
                placeholder="0.00"
                keyboardType="numeric"
                placeholderTextColor={colors.text.muted}
              />

              {/* Status Selector */}
              <Text style={styles.fieldLabel}>Payment Status</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                <Pressable
                  onPress={() => setAddExpenseStatus("Paid")}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    alignItems: "center",
                    borderRadius: 10,
                    backgroundColor: addExpenseStatus === "Paid" ? colors.accent.success : colors.bg.primary,
                    borderWidth: 1,
                    borderColor: addExpenseStatus === "Paid" ? colors.accent.success : colors.border.subtle,
                  }}
                >
                  <Text style={{ fontWeight: "700", color: addExpenseStatus === "Paid" ? "#ffffff" : colors.text.secondary }}>
                    Fully Paid
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setAddExpenseStatus("Balance")}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    alignItems: "center",
                    borderRadius: 10,
                    backgroundColor: addExpenseStatus === "Balance" ? colors.accent.warning : colors.bg.primary,
                    borderWidth: 1,
                    borderColor: addExpenseStatus === "Balance" ? colors.accent.warning : colors.border.subtle,
                  }}
                >
                  <Text style={{ fontWeight: "700", color: addExpenseStatus === "Balance" ? "#ffffff" : colors.text.secondary }}>
                    Partial / Unpaid
                  </Text>
                </Pressable>
              </View>

              {/* If Partial / Unpaid, ask for Paid Amount */}
              {addExpenseStatus === "Balance" && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.fieldLabel}>Paid Amount So Far (₹)</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={addExpensePaidAmount}
                    onChangeText={setAddExpensePaidAmount}
                    placeholder="0.00"
                    keyboardType="numeric"
                    placeholderTextColor={colors.text.muted}
                  />
                </View>
              )}

              {/* Payment Method */}
              <Text style={styles.fieldLabel}>Payment Method</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {["Cash", "UPI", "Bank Transfer", "Card", "Other"].map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setAddExpensePaymentMethod(m)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      backgroundColor: addExpensePaymentMethod === m ? colors.accent.primary : colors.bg.primary,
                      borderWidth: 1,
                      borderColor: addExpensePaymentMethod === m ? colors.accent.primary : colors.border.subtle,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: addExpensePaymentMethod === m ? "#ffffff" : colors.text.secondary }}>
                      {m}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Notes */}
              <Text style={styles.fieldLabel}>Notes / Remarks</Text>
              <TextInput
                style={[styles.amountInput, { height: 70, textAlignVertical: "top" }]}
                value={addExpenseNotes}
                onChangeText={setAddExpenseNotes}
                multiline
                placeholder="Optional notes or details..."
                placeholderTextColor={colors.text.muted}
              />

              {/* Submit Button */}
              <Pressable
                style={[styles.submitPaymentBtn, { backgroundColor: colors.accent.success, marginTop: 16 }]}
                onPress={handleSaveAddExpense}
                disabled={isSavingAddExpense}
              >
                {isSavingAddExpense ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.submitPaymentBtnText, { color: "#ffffff" }]}>
                    Save Expense
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* Full Customer-Wise Summary Details Modal */}
      <Modal
        visible={isSummaryModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsSummaryModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.summaryModalCenterBackdrop}
        >
          <Pressable style={styles.summaryModalCenterOverlay} onPress={() => setIsSummaryModalOpen(false)} />
          <View style={styles.summaryModalCenterCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <MaterialIcons name="assessment" size={22} color={colors.accent.danger} />
                  <Text style={styles.modalTitle}>Unpaid Summary Details</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                  Customer-wise breakdown of outstanding balances
                </Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsSummaryModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Overall Summary KPI Cards */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                <View style={{ flex: 1, minWidth: 110, backgroundColor: "#fef2f2", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "#fca5a5" }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#991b1b", textTransform: "uppercase" }}>Total Outstanding</Text>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#991b1b", marginTop: 2 }}>₹{summaryMetrics.totalSum.toLocaleString("en-IN")}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 110, backgroundColor: colors.bg.primary, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border.medium }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: colors.text.muted, textTransform: "uppercase" }}>Unpaid Accounts</Text>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text.primary, marginTop: 2 }}>{summaryMetrics.totalCount}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 110, backgroundColor: summaryMetrics.overdueCount > 0 ? "#fff7ed" : colors.bg.primary, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: summaryMetrics.overdueCount > 0 ? "#fed7aa" : colors.border.medium }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: summaryMetrics.overdueCount > 0 ? "#c2410c" : colors.text.muted, textTransform: "uppercase" }}>Overdue</Text>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: summaryMetrics.overdueCount > 0 ? "#c2410c" : colors.text.primary, marginTop: 2 }}>{summaryMetrics.overdueCount}</Text>
                </View>
              </View>

              {/* Action Buttons Row (Share Report & Go to Clients Page) */}
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                <Pressable
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: colors.accent.primary + "18",
                    borderColor: colors.accent.primary + "40",
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingVertical: 9,
                    paddingHorizontal: 8,
                  }}
                  onPress={handleShareSummary}
                >
                  <MaterialIcons name="share" size={16} color={colors.accent.primary} />
                  <Text style={{ fontSize: 11.5, fontWeight: "700", color: colors.accent.primary }}>
                    Share Report
                  </Text>
                </Pressable>

                <Pressable
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: colors.text.primary,
                    borderRadius: 10,
                    paddingVertical: 9,
                    paddingHorizontal: 8,
                  }}
                  onPress={() => {
                    setIsSummaryModalOpen(false);
                    router.push("/customers" as any);
                  }}
                >
                  <MaterialIcons name="people" size={16} color={colors.bg.card} />
                  <Text style={{ fontSize: 11.5, fontWeight: "700", color: colors.bg.card }}>
                    Clients Directory ➔
                  </Text>
                </Pressable>
              </View>

              {/* Search & Filter inside Summary Modal */}
              <View style={{ marginBottom: 12 }}>
                <View style={[styles.searchBox, { height: 38, marginBottom: 8 }]}>
                  <MaterialIcons name="search" size={18} color={colors.text.muted} style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.searchInput, { fontSize: 13 }]}
                    value={summarySearch}
                    onChangeText={setSummarySearch}
                    placeholder="Search unpaid clients..."
                    placeholderTextColor={colors.text.muted}
                  />
                  {summarySearch ? (
                    <Pressable onPress={() => setSummarySearch("")}>
                      <MaterialIcons name="close" size={16} color={colors.text.muted} />
                    </Pressable>
                  ) : null}
                </View>

                {/* Filter Pills */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {[
                      { label: `All (${unpaidCustomersList.length})`, value: "All" },
                      { label: "Customers", value: "customer" },
                      { label: "Workers", value: "worker" },
                      { label: "Suppliers", value: "supplier" },
                      { label: "Delivery Partners", value: "delivery_partner" },
                    ].map((item) => {
                      const active = summaryTypeFilter === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          style={[
                            styles.filterPill,
                            { paddingVertical: 4, paddingHorizontal: 10 },
                            active && styles.filterPillActive,
                          ]}
                          onPress={() => setSummaryTypeFilter(item.value as any)}
                        >
                          <Text style={[styles.filterPillText, { fontSize: 10.5 }, active && styles.filterPillTextActive]}>
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* Customer List Header */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingHorizontal: 2 }}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: colors.text.secondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Unpaid Clients ({filteredUnpaidList.length})
                </Text>
                <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: "600" }}>
                  Sorted High ➔ Low
                </Text>
              </View>

              {/* List of Unpaid Customers */}
              {filteredUnpaidList.length === 0 ? (
                <View style={{ backgroundColor: colors.bg.primary, padding: 20, borderRadius: 12, alignItems: "center" }}>
                  <MaterialIcons name="check-circle-outline" size={32} color={colors.accent.success} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary, marginTop: 6 }}>
                    No unpaid balances found
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.text.muted, textAlign: "center", marginTop: 2 }}>
                    {summarySearch || summaryTypeFilter !== "All"
                      ? "Try adjusting your search or filters"
                      : "All clients are fully paid up!"}
                  </Text>
                </View>
              ) : (
                filteredUnpaidList.map((item: any, index: number) => {
                  const avatarColor = getAvatarColor(item.name || "Client");
                  const initial = (item.name || "C").substring(0, 1).toUpperCase();
                  const bal = Number(item.displayBalance || 0);
                  const sharePct = summaryMetrics.totalSum > 0 ? ((bal / summaryMetrics.totalSum) * 100).toFixed(1) : "0";
                  const lastDue = getLastDueDate(item);
                  const dueStatus = lastDue ? getDueDateStatus(lastDue) : null;

                  return (
                    <View
                      key={item.id}
                      style={{
                        backgroundColor: colors.bg.primary,
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: dueStatus === "Overdue" ? "#fca5a5" : colors.border.medium,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        {/* Rank Badge & Avatar */}
                        <View style={{ position: "relative", marginRight: 10 }}>
                          <View style={[styles.circleAvatar, { width: 38, height: 38, borderRadius: 19, backgroundColor: avatarColor }]}>
                            <Text style={[styles.circleAvatarText, { fontSize: 14 }]}>{initial}</Text>
                          </View>
                          <View style={{ position: "absolute", top: -4, left: -4, backgroundColor: colors.text.primary, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 8, fontWeight: "800", color: colors.bg.card }}>#{index + 1}</Text>
                          </View>
                        </View>

                        {/* Customer Info */}
                        <View style={{ flex: 1, marginRight: 6 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text.primary }} numberOfLines={1}>
                              {item.name}
                            </Text>
                            {item.badgeText && item.entityType !== "customer" && (
                              <View style={{ backgroundColor: `${item.badgeColor || colors.accent.primary}18`, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                                <Text style={{ fontSize: 9, fontWeight: "800", color: item.badgeColor || colors.accent.primary }}>
                                  {item.badgeText}
                                </Text>
                              </View>
                            )}
                          </View>
                          {item.phone ? (
                            <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 1 }}>
                              📞 {item.phone}
                            </Text>
                          ) : null}
                          {item.collectorName ? (
                            <Text style={{ fontSize: 10, fontWeight: "600", color: colors.accent.primary, marginTop: 1 }}>
                              Collector: {item.collectorName}
                            </Text>
                          ) : null}
                          {lastDue ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 }}>
                              <MaterialIcons
                                name={dueStatus === "Overdue" ? "error-outline" : "event"}
                                size={11}
                                color={dueStatus === "Overdue" ? "#b91c1c" : "#c2410c"}
                              />
                              <Text style={{ fontSize: 10, fontWeight: "700", color: dueStatus === "Overdue" ? "#b91c1c" : "#c2410c" }}>
                                {dueStatus === "Overdue" ? "Overdue: " : "Due: "}
                                {formatDueDate(lastDue.date)}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Unpaid Balance Display */}
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.accent.danger }}>
                            ₹{bal.toLocaleString("en-IN")}
                          </Text>
                          <Text style={{ fontSize: 9.5, fontWeight: "600", color: colors.text.muted, marginTop: 1 }}>
                            {sharePct}% of total
                          </Text>
                        </View>
                      </View>

                      {/* Action Buttons inside Card */}
                      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border.subtle }}>
                        <Pressable
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 3,
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 6,
                            backgroundColor: colors.bg.card,
                            borderWidth: 1,
                            borderColor: colors.border.medium,
                          }}
                          onPress={() => {
                            setIsSummaryModalOpen(false);
                            router.push({ pathname: "/customer-profile" as any, params: { id: item.id } });
                          }}
                        >
                          <MaterialIcons name="person" size={12} color={colors.text.secondary} />
                          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.secondary }}>
                            View Profile
                          </Text>
                        </Pressable>

                        <Pressable
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 3,
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 6,
                            backgroundColor: colors.accent.success + "18",
                            borderWidth: 1,
                            borderColor: colors.accent.success + "40",
                          }}
                          onPress={() => {
                            setIsSummaryModalOpen(false);
                            // Open payment flow
                            setSelectedCustomer(item);
                            const pendingAmt = Number(
                              item.totalPending !== undefined
                                ? item.totalPending
                                : item.balance || 0,
                            );
                            setPaymentAmount(pendingAmt > 0 ? String(pendingAmt) : "");
                            setPaymentDiscount("");
                            setPaymentStep(2);
                            setIsPaymentModalOpen(true);
                          }}
                        >
                          <MaterialIcons name="payments" size={12} color={colors.accent.success} />
                          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.success }}>
                            Pay / Collect
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ========== ACTIVITY LOG PROFILE DETAILS MODAL ========== */}
      <Modal
        visible={isActivityProfileModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsActivityProfileModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalFlexSpacer}
            onPress={() => setIsActivityProfileModalOpen(false)}
          />

          <View style={[styles.modalContent, { maxHeight: "90%", paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }]}>
            {/* Drag Handle Indicator */}
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border.subtle }} />
            </View>

            {selectedActivityProfile && (
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                {/* Profile Header */}
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                  paddingBottom: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border.subtle,
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                    <View style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: `${selectedActivityProfile.badgeColor || colors.accent.primary}20`,
                      borderWidth: 2,
                      borderColor: selectedActivityProfile.badgeColor || colors.accent.primary,
                      justifyContent: "center",
                      alignItems: "center",
                    }}>
                      <Text style={{
                        fontSize: 20,
                        fontWeight: "800",
                        color: selectedActivityProfile.badgeColor || colors.accent.primary,
                      }}>
                        {(selectedActivityProfile.name || "C").slice(0, 2).toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text selectable={true} style={{ fontSize: 18, fontWeight: "800", color: colors.text.primary, flexShrink: 1 }}>
                          {selectedActivityProfile.name}
                        </Text>
                        <View style={{
                          backgroundColor: `${selectedActivityProfile.badgeColor || colors.accent.primary}1A`,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: `${selectedActivityProfile.badgeColor || colors.accent.primary}40`,
                        }}>
                          <Text style={{
                            fontSize: 10.5,
                            fontWeight: "800",
                            color: selectedActivityProfile.badgeColor || colors.accent.primary,
                            textTransform: "uppercase",
                          }}>
                            {selectedActivityProfile.badgeText || "Customer"}
                          </Text>
                        </View>
                      </View>

                      <Text selectable={true} style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2, fontWeight: "500" }}>
                        {selectedActivityProfile.phone || "No phone number available"}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    style={styles.modalCloseBtn}
                    onPress={() => setIsActivityProfileModalOpen(false)}
                    hitSlop={8}
                  >
                    <MaterialIcons name="close" size={22} color={colors.text.secondary} />
                  </Pressable>
                </View>

                {/* Quick Action Contact Row */}
                {selectedActivityProfile.phone ? (
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                    <Pressable
                      style={({ pressed }) => [{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        backgroundColor: `${colors.accent.success || "#10B981"}15`,
                        borderColor: `${colors.accent.success || "#10B981"}40`,
                        borderWidth: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                      }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
                      onPress={() => handleCallCustomer(selectedActivityProfile.phone)}
                    >
                      <MaterialIcons name="call" size={18} color={colors.accent.success || "#10B981"} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.accent.success || "#10B981" }}>
                        Call
                      </Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        backgroundColor: "#25D36615",
                        borderColor: "#25D36640",
                        borderWidth: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                      }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
                      onPress={() => handleWhatsAppCustomer(selectedActivityProfile.phone)}
                    >
                      <MaterialIcons name="chat" size={18} color="#25D366" />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#25D366" }}>
                        WhatsApp
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {/* Outstanding Balance Banner */}
                <View style={{
                  backgroundColor: selectedActivityProfile.balance > 0 ? `${colors.accent.danger || "#EF4444"}12` : `${colors.accent.success || "#10B981"}12`,
                  borderColor: selectedActivityProfile.balance > 0 ? `${colors.accent.danger || "#EF4444"}35` : `${colors.accent.success || "#10B981"}35`,
                  borderWidth: 1,
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: selectedActivityProfile.balance > 0 ? `${colors.accent.danger || "#EF4444"}25` : `${colors.accent.success || "#10B981"}25`,
                      justifyContent: "center",
                      alignItems: "center",
                    }}>
                      <MaterialIcons
                        name={selectedActivityProfile.balance > 0 ? "account-balance-wallet" : "check-circle"}
                        size={20}
                        color={selectedActivityProfile.balance > 0 ? (colors.accent.danger || "#EF4444") : (colors.accent.success || "#10B981")}
                      />
                    </View>
                    <View>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.secondary, textTransform: "uppercase" }}>
                        {selectedActivityProfile.balance > 0 ? "Outstanding Dues" : "Account Balance"}
                      </Text>
                      <Text style={{
                        fontSize: 18,
                        fontWeight: "800",
                        color: selectedActivityProfile.balance > 0 ? (colors.accent.danger || "#EF4444") : (colors.accent.success || "#10B981"),
                        marginTop: 1,
                      }}>
                        ₹{Number(selectedActivityProfile.balance || 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  </View>

                  <View style={{
                    backgroundColor: selectedActivityProfile.balance > 0 ? (colors.accent.danger || "#EF4444") : (colors.accent.success || "#10B981"),
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 8,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFFFFF" }}>
                      {selectedActivityProfile.balance > 0 ? "Pending" : "Cleared"}
                    </Text>
                  </View>
                </View>

                {/* Profile Stats Summary (Orders, Sales, Payments) */}
                <View style={{
                  flexDirection: "row",
                  backgroundColor: colors.bg.primary,
                  borderRadius: 14,
                  padding: 12,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: colors.border.subtle,
                  justifyContent: "space-around",
                }}>
                  <View style={{ alignItems: "center", flex: 1 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: "600", color: colors.text.secondary, textTransform: "uppercase" }}>
                      Orders
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.accent.primary, marginTop: 3 }}>
                      {selectedActivityProfile.totalOrders}
                    </Text>
                  </View>

                  <View style={{ width: 1, height: "80%", alignSelf: "center", backgroundColor: colors.border.subtle }} />

                  <View style={{ alignItems: "center", flex: 1 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: "600", color: colors.text.secondary, textTransform: "uppercase" }}>
                      Total Value
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text.primary, marginTop: 3 }}>
                      ₹{Number(selectedActivityProfile.totalSpent || 0).toLocaleString("en-IN")}
                    </Text>
                  </View>

                  <View style={{ width: 1, height: "80%", alignSelf: "center", backgroundColor: colors.border.subtle }} />

                  <View style={{ alignItems: "center", flex: 1 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: "600", color: colors.text.secondary, textTransform: "uppercase" }}>
                      Paid
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.accent.success || "#10B981", marginTop: 3 }}>
                      ₹{Number(selectedActivityProfile.totalPaid || 0).toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>

                {/* Additional Profile Info (Address, etc.) */}
                {selectedActivityProfile.address ? (
                  <View style={{
                    backgroundColor: colors.bg.primary,
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 16,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                  }}>
                    <MaterialIcons name="place" size={18} color={colors.text.secondary} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.secondary, textTransform: "uppercase" }}>
                        Address / Location
                      </Text>
                      <Text selectable={true} style={{ fontSize: 13, color: colors.text.primary, marginTop: 2, lineHeight: 18 }}>
                        {selectedActivityProfile.address}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* Triggered Activity Log Context Card */}
                {selectedActivityProfile.activityLogItem && (
                  <Pressable
                    style={({ pressed }) => [{
                      backgroundColor: colors.bg.primary,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 20,
                      borderWidth: 1,
                      borderColor: colors.border.subtle,
                      borderLeftWidth: 4,
                      borderLeftColor: selectedActivityProfile.activityLogItem.iconColor || colors.accent.primary,
                    }, pressed && { opacity: 0.8, transform: [{ scale: 0.99 }] }]}
                    onPress={() => {
                      setIsActivityProfileModalOpen(false);
                      handlePressActivity(selectedActivityProfile.activityLogItem);
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.secondary, textTransform: "uppercase" }}>
                        Selected Activity Log
                      </Text>
                      {selectedActivityProfile.activityLogItem.type === "order" && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Text style={{ fontSize: 10.5, fontWeight: "700", color: colors.accent.primary }}>
                            Tap to view order ↗
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text selectable={true} style={{ fontSize: 14, fontWeight: "700", color: colors.text.primary }} numberOfLines={1}>
                          {selectedActivityProfile.activityLogItem.title}
                        </Text>
                        <Text selectable={true} style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }} numberOfLines={2}>
                          {selectedActivityProfile.activityLogItem.subtitle}
                        </Text>
                      </View>
                      <Text style={{
                        fontSize: 15,
                        fontWeight: "800",
                        color: selectedActivityProfile.activityLogItem.isPositive ? (colors.accent.success || "#10B981") : colors.text.primary,
                      }}>
                        {selectedActivityProfile.activityLogItem.isPositive ? "+" : ""}₹{Number(selectedActivityProfile.activityLogItem.amount || 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  </Pressable>
                )}

                {/* Action Buttons */}
                <View style={{ gap: 10, marginTop: 4 }}>
                  <Pressable
                    style={({ pressed }) => [{
                      backgroundColor: colors.accent.primary,
                      borderRadius: 14,
                      paddingVertical: 14,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 8,
                      ...shadows.elevated,
                    }, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                    onPress={() => handleOpenFullProfile(selectedActivityProfile)}
                  >
                    <MaterialIcons name="person" size={20} color="#FFFFFF" />
                    <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFFFFF" }}>
                      {selectedActivityProfile.isRegistered
                        ? (selectedActivityProfile.entityType === "worker"
                            ? "View Worker Details ↗"
                            : (selectedActivityProfile.entityType === "supplier"
                                ? "View Supplier Details ↗"
                                : (selectedActivityProfile.entityType === "delivery_partner"
                                    ? "View Partner Details ↗"
                                    : "View Full Customer Profile ↗")))
                        : "Search in Customers ↗"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [{
                      backgroundColor: colors.bg.elevated,
                      borderRadius: 14,
                      paddingVertical: 12,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: colors.border.subtle,
                    }, pressed && { opacity: 0.8 }]}
                    onPress={() => setIsActivityProfileModalOpen(false)}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text.secondary }}>
                      Close
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </AnimatedPage>
  );
}

const getStyles = (theme: any) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
  scrollContainer: {
    padding: spacing.lg,
    paddingBottom: 96,
    backgroundColor: colors.bg.primary,
    flexGrow: 1,
  },

  // Hero
  heroSection: {
    marginBottom: spacing.xl,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  syncText: {
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: "500",
    marginTop: 4,
  },

  // Stats Row
  statsRow: {
    gap: 12,
    paddingBottom: spacing.xl,
  },
  statCard: {
    width: 155,
    minWidth: 145,
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...shadows.card,
  },
  statCardSales: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.success,
  },
  statCardPending: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.danger,
  },
  statCardExpense: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.warning,
  },
  statCardAdvance: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.success,
    backgroundColor: `${colors.accent.success}0D`,
    borderColor: `${colors.accent.success}35`,
  },
  statAdvanceTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs || 6,
  },
  statIconWrapAdvance: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${colors.accent.success}1F`,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: `${colors.accent.success}35`,
  },
  statAdvanceBadge: {
    backgroundColor: `${colors.accent.success}20`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${colors.accent.success}35`,
  },
  statAdvanceBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.accent.success,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statLabelAdvance: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text.secondary,
    marginBottom: 4,
  },
  statValueAdvance: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.accent.success,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.sm,
    backgroundColor: colors.bg.elevated,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text.primary,
  },

  // Section Title
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.md,
    marginLeft: 2,
  },

  // Quick Actions Grid
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: spacing.xl,
  },
  actionCard: {
    width: "48%",
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: "center",
    ...shadows.subtle,
  },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
  },

  // Attendance Strip
  attendanceStrip: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...shadows.subtle,
  },
  attendanceStripLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  attendanceStripTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  attendanceStripSub: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  attendanceStripRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  attendanceDots: {
    flexDirection: "row",
    gap: 4,
  },
  attendanceDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  dotText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },

  // Received Strip
  receivedStrip: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...shadows.subtle,
  },
  receivedStripValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.accent.success,
    marginTop: 2,
  },
  quickPayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent.successMuted,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.accent.success,
  },

  // Activity Feed
  activityCard: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    marginBottom: spacing.xl,
    overflow: "hidden",
    ...shadows.subtle,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
  },
  activityRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  activityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  activityInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  activitySubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  activityRight: {
    alignItems: "flex-end",
  },
  activityAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  activityTime: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  emptyActivity: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: 8,
    textAlign: "center",
  },

  // Calendar Button Pill & Date Nav Buttons
  dateNavArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.accent.primary + "40",
    justifyContent: "center",
    alignItems: "center",
    ...shadows.subtle,
  },
  calendarBtnPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg.card,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.accent.primary + "40",
    ...shadows.subtle,
  },
  calendarBtnPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent.primary,
  },

  // Calendar Modal
  calendarModalContent: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: "92%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...shadows.strong,
  },
  dateNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg.primary,
    borderRadius: 14,
    padding: 8,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  dateNavBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: colors.bg.card,
  },
  dateNavCenter: {
    alignItems: "center",
  },
  dateNavTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text.primary,
  },
  dateNavSub: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 1,
  },
  quickDateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  quickDatePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  quickDatePillActive: {
    backgroundColor: colors.accent.primary + "1A",
    borderColor: colors.accent.primary,
  },
  quickDatePillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  quickDatePillTextActive: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
  customDateContainer: {
    marginBottom: 14,
  },
  applyDateBtn: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  applyDateBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  calendarDateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: radius.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  calendarDateRowActive: {
    backgroundColor: colors.accent.primary + "10",
    borderColor: colors.accent.primary + "40",
  },
  calendarDateTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
  },
  calendarDateSub: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 1,
  },
  resetDateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accent.primary + "1A",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 12,
  },
  resetDateBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent.primary,
  },

  // Overview Cards
  overviewRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: spacing.xl,
  },
  overviewCard: {
    flex: 1,
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...shadows.subtle,
  },
  overviewLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  overviewValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text.primary,
    marginTop: 4,
  },

  // Stock breakdown row styles
  stockBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    gap: 6,
  },
  stockBreakdownItem: {
    flex: 1,
    alignItems: "center",
  },
  stockBreakdownLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  stockBreakdownValue: {
    fontSize: 11,
    fontWeight: "800",
  },
  stockBreakdownDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border.subtle,
  },
  stockProfitBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  stockProfitText: {
    fontSize: 9,
    fontWeight: "800",
  },

  // ========== MODAL STYLES ==========
  summaryModalCenterBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  summaryModalCenterOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
    zIndex: 1,
  },
  summaryModalCenterCard: {
    width: "100%",
    maxWidth: 500,
    height: "80%",
    maxHeight: 700,
    backgroundColor: colors.bg.card,
    borderRadius: 24,
    padding: 16,
    zIndex: 10,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
  },
  modalFlexSpacer: {
    flex: 0.15,
  },
  modalContent: {
    flex: 0.85,
    backgroundColor: colors.bg.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    ...shadows.elevated,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bg.elevated,
  },

  // Success Animation
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  successBadge: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: 8,
  },
  successSub: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: "center",
  },

  // Payment Modal
  modalStepContainer: {
    flex: 1,
  },
  modalStepLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  modalSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg.input,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    marginBottom: spacing.md,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: "500",
  },
  modalCustList: {
    flex: 1,
  },
  modalCustRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  modalCustInitials: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent.primaryMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCustInitialsText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accent.primary,
  },
  modalCustName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  modalCustPhone: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  modalCustPending: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.accent.danger,
  },
  modalEmptyState: {
    paddingVertical: 40,
    alignItems: "center",
  },
  modalEmptyText: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: "center",
    marginTop: 8,
  },

  // Step 2
  backToStep1: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  backToStep1Text: {
    color: colors.accent.primary,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
  },
  selectedCustomerCard: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  selectedCustomerHeader: {
    marginBottom: 8,
  },
  selectedCustomerName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
  },
  selectedCustomerPhone: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
  },
  selectedCustomerPendingCol: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  selectedPendingLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: "500",
  },
  selectedPendingValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.accent.danger,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.secondary,
    marginBottom: 6,
    marginTop: 4,
  },
  amountInput: {
    backgroundColor: colors.bg.input,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  shortcutRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.lg,
  },
  shortcutBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: "center",
  },
  shortcutBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  methodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: spacing.lg,
  },
  methodChip: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.elevated,
  },
  methodChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
  },
  submitPaymentBtn: {
    backgroundColor: colors.accent.primary,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  submitPaymentBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  // ========== ATTENDANCE MODAL STYLES ==========
  attDateBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent.infoMuted,
    borderRadius: radius.sm,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: 8,
  },
  attDateText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent.info,
  },
  attBulkRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.md,
  },
  attBulkBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  attBulkBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  attSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  attWorkerCard: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  attWorkerTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  attWorkerInitials: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent.primaryMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  attWorkerInitialsText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent.primary,
  },
  attWorkerName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  attWorkerRole: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  attStatusRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  attStatusChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.card,
  },
  attStatusChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
  },
  attOvertimeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 6,
  },
  attOvertimeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  attOvertimeInput: {
    flex: 1,
    backgroundColor: colors.bg.input,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
  },
  attMarkedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  attMarkedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  attSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent.primary,
    paddingVertical: 16,
    borderRadius: radius.md,
    marginTop: 8,
  },
  attSaveBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },

  // Floating Action Bar
  floatingBar: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
    gap: 12,
  },
  floatingBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  btnReceivedPayment: {
    backgroundColor: colors.accent.success,
  },
  btnBillInvoice: {
    backgroundColor: colors.accent.primary,
    flex: 1.2,
  },
  btnPlusCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1E202C", // premium dark slate
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  floatingBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },

  // Quick Add Modal styles
  quickAddContent: {
    backgroundColor: colors.bg.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
  },
  quickAddGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 10,
  },
  quickAddGridItem: {
    width: "48%",
    backgroundColor: colors.bg.primary,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  quickAddIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  quickAddLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
  },
  quickSaveAttendanceBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${colors.accent.success}15`,
    borderWidth: 1,
    borderColor: `${colors.accent.success}30`,
    justifyContent: "center",
    alignItems: "center",
  },
  attendanceChipsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 16,
  },
  attendanceChipButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  attendanceChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    flexDirection: "row",
    alignItems: "center",
  },
  filterPillActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  filterPillTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    paddingVertical: 4,
  },
  circleAvatar: {
    justifyContent: "center",
    alignItems: "center",
  },
  circleAvatarText: {
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // ─── GST Due Dates ───
  gstSection: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.subtle,
  },
  gstSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  gstSectionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gstHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#3B82F615",
    justifyContent: "center",
    alignItems: "center",
  },
  gstSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  gstManageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  gstManageBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent.primary,
  },
  gstDueItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    marginBottom: 2,
  },
  gstDueLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  gstDueIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  gstDueInfo: {
    flex: 1,
  },
  gstDueName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  gstDueDesc: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 1,
  },
  gstDueDateText: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 3,
    fontWeight: "500",
  },
  gstDueRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  gstDaysLeftBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  gstDaysLeftText: {
    fontSize: 11,
    fontWeight: "800",
  },
  gstCompleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${colors.accent.success}12`,
    borderWidth: 1,
    borderColor: `${colors.accent.success}30`,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  gstCompleteBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent.success,
  },
});
};
