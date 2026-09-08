import React, { useState, useEffect, useMemo, useContext, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Share,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";

// Theme & Navigation
import { useTheme } from "../context/ThemeContext";
import { useScrollRestoration } from "../context/ScrollContext";
import BackButton from "../components/BackButton";
import EasyCalendarModal from "../components/EasyCalendarModal";

// Contexts & Firebase
import { ExpenseContext } from "../context/ExpenseContext";
import { RawMaterialSupplierContext } from "../context/RawMaterialSupplierContext";
import { RawMaterialContext } from "../context/RawMaterialContext";
import { WorkerContext } from "../context/WorkerContext";
import { DeliveryPartnerContext } from "../context/DeliveryPartnerContext";
import { UserContext } from "../context/UserContext";
import { db, normalizeDateValue } from "../../src/config/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  deleteDoc,
  addDoc,
} from "firebase/firestore";

const PAYMENT_METHODS = ["All", "Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Other"];
const METHOD_COLORS: Record<string, string> = {
  Cash: "#10B981",
  UPI: "#3B82F6",
  "Bank Transfer": "#8B5CF6",
  Cheque: "#F59E0B",
  Card: "#EC4899",
  Other: "#64748B",
};

export default function ExpensePaymentManagement() {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { scrollViewRef, handleScroll, handleContentSizeChange } =
    useScrollRestoration("/settings/expense-payments");

  // Contexts
  const {
    expenses,
    expensePayments,
    addExpensePayment,
    undoExpensePayment,
  } = useContext(ExpenseContext) as any;

  const { suppliers } = useContext(RawMaterialSupplierContext) as any;
  const { logs, deleteTransaction: deleteRawTransaction } = useContext(RawMaterialContext) as any;
  const { workers } = useContext(WorkerContext) as any;
  const { partners: deliveryPartners } = useContext(DeliveryPartnerContext) as any;
  const { profile: userProfile } = useContext(UserContext) as any;

  // Real-time collections
  const [workerPayments, setWorkerPayments] = useState<any[]>([]);
  const [deliveryPayments, setDeliveryPayments] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState<"All" | "expense" | "supplier" | "worker" | "delivery">("All");
  const [selectedMethod, setSelectedMethod] = useState("All");
  const [selectedPeriod, setSelectedPeriod] = useState<"all" | "today" | "yesterday" | "week" | "month" | "custom">("all");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [calendarTarget, setCalendarTarget] = useState<"start" | "end" | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "amount_desc" | "amount_asc">("newest");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Modals
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  // Record Payment Form State
  const [recordExpenseId, setRecordExpenseId] = useState<string>("");
  const [recordPayeeTitle, setRecordPayeeTitle] = useState("");
  const [recordAmount, setRecordAmount] = useState("");
  const [recordMethod, setRecordMethod] = useState("Cash");
  const [recordNotes, setRecordNotes] = useState("");
  const [recordDate, setRecordDate] = useState<Date>(new Date());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  // Subscribe to workerPayments in real-time
  useEffect(() => {
    const qWorker = query(collection(db, "workerPayments"), orderBy("createdAt", "desc"));
    const unsubWorker = onSnapshot(
      qWorker,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt || d.data().date),
        }));
        setWorkerPayments(docs);
      },
      (err) => console.log("workerPayments error:", err)
    );
    return () => unsubWorker();
  }, []);

  // Subscribe to deliveryPayments in real-time
  useEffect(() => {
    const qDelivery = query(collection(db, "deliveryPayments"), orderBy("createdAt", "desc"));
    const unsubDelivery = onSnapshot(
      qDelivery,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt || d.data().date),
        }));
        setDeliveryPayments(docs);
      },
      (err) => console.log("deliveryPayments error:", err)
    );
    return () => unsubDelivery();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  // Helper date parser
  const parseSafeDate = (val: any): Date => {
    if (!val) return new Date();
    if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
    if (typeof val.toDate === "function") {
      try {
        const d = val.toDate();
        return isNaN(d.getTime()) ? new Date() : d;
      } catch {
        return new Date();
      }
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  // Maps for quick entity resolution
  const supplierMap = useMemo(() => {
    const map = new Map<string, any>();
    (suppliers || []).forEach((s: any) => {
      if (s.id) map.set(s.id, s);
    });
    return map;
  }, [suppliers]);

  const workerMap = useMemo(() => {
    const map = new Map<string, any>();
    (workers || []).forEach((w: any) => {
      if (w.id) map.set(w.id, w);
    });
    return map;
  }, [workers]);

  const partnerMap = useMemo(() => {
    const map = new Map<string, any>();
    (deliveryPartners || []).forEach((p: any) => {
      if (p.id) map.set(p.id, p);
    });
    return map;
  }, [deliveryPartners]);

  // Unified Outgoing Payments Stream
  const allOutgoingPayments = useMemo(() => {
    const list: any[] = [];
    const seenSignatures = new Set<string>();

    // 1. Direct Expense Payments from expense_payments collection
    (expensePayments || []).forEach((p: any) => {
      const amt = Number(p.amount || 0);
      if (amt <= 0) return;
      const d = parseSafeDate(p.paidAt || p.createdAt);
      const signature = `exp_pay_${p.id}`;
      seenSignatures.add(signature);

      list.push({
        id: `ep-${p.id}`,
        rawId: p.id,
        sourceType: "expense" as const,
        sourceLabel: "Expense Payment",
        title: p.expenseTitle || "Business Expense",
        category: p.expenseCategory || "Direct Expense",
        amount: amt,
        paymentMethod: p.paymentMethod || "Cash",
        notes: p.notes || "",
        paidAt: d,
        expenseId: p.expenseId || null,
        icon: "receipt" as const,
        iconColor: colors.accent.danger || "#EF4444",
        canUndo: true,
      });
    });

    // 2. Direct Paid Expenses (created with paidAmount > 0 or fully paid)
    (expenses || []).forEach((e: any) => {
      const paidAmt = Number(e.paidAmount !== undefined ? e.paidAmount : (e.status === "Paid" ? e.amount || e.totalAmount : 0));
      if (paidAmt <= 0) return;

      // Avoid double counting if already captured in expense_payments
      const hasSubPayment = (expensePayments || []).some((ep: any) => ep.expenseId === e.id);
      if (!hasSubPayment) {
        const d = parseSafeDate(e.expenseDate || e.createdAt);
        list.push({
          id: `exp-direct-${e.id}`,
          rawId: e.id,
          sourceType: "expense" as const,
          sourceLabel: "Direct Expense",
          title: e.title || "Business Expense",
          category: e.category || "General",
          amount: paidAmt,
          paymentMethod: e.paymentMethod || "Cash",
          notes: e.notes || "",
          paidAt: d,
          expenseId: e.id,
          icon: "receipt-long" as const,
          iconColor: colors.accent.warning || "#F59E0B",
          canUndo: false,
        });
      }
    });

    // 3. Raw Material Supplier Payments
    (logs || [])
      .filter((l: any) => l.type === "payment" && Number(l.amount || 0) > 0)
      .forEach((l: any) => {
        const amt = Number(l.amount || 0);
        const d = parseSafeDate(l.date || l.createdAt);
        const supp = supplierMap.get(l.supplierId);

        list.push({
          id: `supp-${l.id}`,
          rawId: l.id,
          sourceType: "supplier" as const,
          sourceLabel: "Supplier Payout",
          title: supp?.name || l.supplierName || "Raw Material Supplier",
          category: "Raw Materials",
          amount: amt,
          paymentMethod: l.paymentMethod || "Cash",
          notes: l.notes || "",
          paidAt: d,
          supplierId: l.supplierId || null,
          icon: "layers" as const,
          iconColor: "#8B5CF6",
          canUndo: true,
        });
      });

    // 4. Worker Wages / Payments
    (workerPayments || []).forEach((w: any) => {
      const amt = Number(w.amount || 0);
      if (amt <= 0) return;
      const d = parseSafeDate(w.createdAt || w.date);
      const worker = workerMap.get(w.workerId);

      list.push({
        id: `work-${w.id}`,
        rawId: w.id,
        sourceType: "worker" as const,
        sourceLabel: "Worker Wage",
        title: worker?.name || w.workerName || "Worker Payment",
        category: "Workforce",
        amount: amt,
        paymentMethod: w.paymentMethod || "Cash",
        notes: w.notes || "",
        paidAt: d,
        workerId: w.workerId || null,
        icon: "engineering" as const,
        iconColor: "#3B82F6",
        canUndo: true,
      });
    });

    // 5. Delivery Partner Payouts
    (deliveryPayments || []).forEach((dp: any) => {
      const amt = Number(dp.amount || 0);
      if (amt <= 0) return;
      const d = parseSafeDate(dp.createdAt || dp.date);
      const partner = partnerMap.get(dp.partnerId);

      list.push({
        id: `deliv-${dp.id}`,
        rawId: dp.id,
        sourceType: "delivery" as const,
        sourceLabel: "Delivery Payout",
        title: partner?.name || dp.partnerName || "Delivery Partner",
        category: "Logistics",
        amount: amt,
        paymentMethod: dp.paymentMethod || "Cash",
        notes: dp.notes || "",
        paidAt: d,
        partnerId: dp.partnerId || null,
        icon: "local-shipping" as const,
        iconColor: "#06B6D4",
        canUndo: true,
      });
    });

    return list;
  }, [expensePayments, expenses, logs, workerPayments, deliveryPayments, supplierMap, workerMap, partnerMap, colors]);

  // Filtered list
  const filteredPayments = useMemo(() => {
    let list = [...allOutgoingPayments];

    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        return (
          p.title.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.sourceLabel.toLowerCase().includes(q) ||
          (p.notes && p.notes.toLowerCase().includes(q)) ||
          p.paymentMethod.toLowerCase().includes(q) ||
          String(p.amount).includes(q)
        );
      });
    }

    // 2. Source Filter
    if (selectedSource !== "All") {
      list = list.filter((p) => p.sourceType === selectedSource);
    }

    // 3. Payment Method Filter
    if (selectedMethod !== "All") {
      list = list.filter((p) => p.paymentMethod.toLowerCase() === selectedMethod.toLowerCase());
    }

    // 4. Time Period Filter
    const now = new Date();
    if (selectedPeriod === "today") {
      list = list.filter((p) => p.paidAt.toDateString() === now.toDateString());
    } else if (selectedPeriod === "yesterday") {
      const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      list = list.filter((p) => p.paidAt.toDateString() === yest.toDateString());
    } else if (selectedPeriod === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      list = list.filter((p) => p.paidAt >= weekAgo);
    } else if (selectedPeriod === "month") {
      list = list.filter((p) => p.paidAt.getMonth() === now.getMonth() && p.paidAt.getFullYear() === now.getFullYear());
    } else if (selectedPeriod === "custom") {
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        list = list.filter((p) => p.paidAt >= s);
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        list = list.filter((p) => p.paidAt <= e);
      }
    }

    // 5. Sorting
    list.sort((a, b) => {
      const tA = a.paidAt.getTime();
      const tB = b.paidAt.getTime();
      if (sortBy === "oldest") return tA - tB;
      if (sortBy === "amount_desc") return b.amount - a.amount;
      if (sortBy === "amount_asc") return a.amount - b.amount;
      return tB - tA; // default newest
    });

    return list;
  }, [allOutgoingPayments, searchQuery, selectedSource, selectedMethod, selectedPeriod, startDate, endDate, sortBy]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalPaid = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
    const count = filteredPayments.length;

    const now = new Date();
    const todayPaid = allOutgoingPayments
      .filter((p) => p.paidAt.toDateString() === now.toDateString())
      .reduce((sum, p) => sum + p.amount, 0);

    const monthPaid = allOutgoingPayments
      .filter((p) => p.paidAt.getMonth() === now.getMonth() && p.paidAt.getFullYear() === now.getFullYear())
      .reduce((sum, p) => sum + p.amount, 0);

    const avgAmount = count > 0 ? Math.round(totalPaid / count) : 0;

    // Method Distribution Breakdown
    const methodTotals: Record<string, number> = {};
    filteredPayments.forEach((p) => {
      const m = p.paymentMethod || "Cash";
      methodTotals[m] = (methodTotals[m] || 0) + p.amount;
    });

    const methodBreakdown = Object.entries(methodTotals)
      .map(([method, amt]) => ({
        method,
        amount: amt,
        percentage: totalPaid > 0 ? Math.round((amt / totalPaid) * 100) : 0,
        color: METHOD_COLORS[method] || colors.accent.primary,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalPaid,
      count,
      todayPaid,
      monthPaid,
      avgAmount,
      methodBreakdown,
    };
  }, [filteredPayments, allOutgoingPayments, colors]);

  // Expenses with remaining balance for "Record Payment" dropdown
  const pendingExpenses = useMemo(() => {
    return (expenses || [])
      .filter((e: any) => {
        const rem = Number(e.remainingAmount !== undefined ? e.remainingAmount : (e.status === "Balance" ? e.amount : 0));
        return rem > 0;
      })
      .map((e: any) => ({
        id: e.id,
        title: e.title || "Untitled Expense",
        category: e.category || "General",
        remaining: Number(e.remainingAmount !== undefined ? e.remainingAmount : (e.status === "Balance" ? e.amount : 0)),
        total: Number(e.totalAmount || e.amount || 0),
      }));
  }, [expenses]);

  // Handle Save New Expense Payment
  const handleSavePayment = async () => {
    const amtNum = parseFloat(recordAmount);
    if (isNaN(amtNum) || amtNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount greater than zero.");
      return;
    }

    setIsSavingPayment(true);
    try {
      if (recordExpenseId) {
        // Log payment against existing expense
        const success = await addExpensePayment(recordExpenseId, {
          amount: amtNum,
          paymentMethod: recordMethod,
          notes: recordNotes.trim(),
        });
        if (success) {
          Alert.alert("Success", `Payment of ₹${amtNum.toLocaleString("en-IN")} logged successfully.`);
          handleCloseRecordModal();
        } else {
          Alert.alert("Error", "Failed to record expense payment.");
        }
      } else {
        // Create a standalone direct expense payment document in expense_payments
        const payDate = new Date(recordDate);
        const now = new Date();
        if (
          payDate.getFullYear() === now.getFullYear() &&
          payDate.getMonth() === now.getMonth() &&
          payDate.getDate() === now.getDate()
        ) {
          payDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        }

        await addDoc(collection(db, "expense_payments"), {
          expenseId: null,
          expenseTitle: recordPayeeTitle.trim() || "General Expense Payment",
          expenseCategory: "Direct Expense",
          amount: amtNum,
          paymentMethod: recordMethod,
          notes: recordNotes.trim(),
          paidAt: payDate,
          createdAt: payDate,
        });

        Alert.alert("Success", `Payment of ₹${amtNum.toLocaleString("en-IN")} recorded.`);
        handleCloseRecordModal();
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to record payment.");
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleCloseRecordModal = () => {
    setIsRecordModalOpen(false);
    setRecordExpenseId("");
    setRecordPayeeTitle("");
    setRecordAmount("");
    setRecordMethod("Cash");
    setRecordNotes("");
    setRecordDate(new Date());
  };

  // Handle Undo / Delete Outgoing Payment
  const handleDeletePayment = (payment: any) => {
    Alert.alert(
      "Revert Payment",
      `Are you sure you want to revert payment of ₹${payment.amount.toLocaleString("en-IN")} for "${payment.title}"? This will restore balances.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revert & Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (payment.sourceType === "expense" && payment.canUndo) {
                const success = await undoExpensePayment(payment.rawId);
                if (success) {
                  Alert.alert("Reverted", "Expense payment reverted successfully.");
                  setIsDetailModalOpen(false);
                } else {
                  Alert.alert("Error", "Failed to revert payment.");
                }
              } else if (payment.sourceType === "supplier") {
                await deleteRawTransaction(payment.rawId);
                Alert.alert("Deleted", "Supplier payment log removed.");
                setIsDetailModalOpen(false);
              } else if (payment.sourceType === "worker") {
                await deleteDoc(doc(db, "workerPayments", payment.rawId));
                Alert.alert("Deleted", "Worker payment record removed.");
                setIsDetailModalOpen(false);
              } else if (payment.sourceType === "delivery") {
                await deleteDoc(doc(db, "deliveryPayments", payment.rawId));
                Alert.alert("Deleted", "Delivery payout record removed.");
                setIsDetailModalOpen(false);
              } else {
                Alert.alert("Notice", "This payment is bound to an initial expense record and cannot be reverted standalone.");
              }
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Failed to delete payment.");
            }
          },
        },
      ]
    );
  };

  // Share Outgoing Payment Summary
  const handleShareReport = async () => {
    try {
      const company = userProfile?.businessName || "My Business";
      const totalStr = `₹${metrics.totalPaid.toLocaleString("en-IN")}`;
      const countStr = `${metrics.count} entries`;
      const dateRangeStr =
        selectedPeriod === "today"
          ? "Today"
          : selectedPeriod === "yesterday"
          ? "Yesterday"
          : selectedPeriod === "week"
          ? "This Week"
          : selectedPeriod === "month"
          ? "This Month"
          : "All Time";

      let text = `💸 *OUTGOING EXPENSE PAYMENTS REPORT*\n*${company}*\n`;
      text += `------------------------------\n`;
      text += `📅 *Period:* ${dateRangeStr}\n`;
      text += `💰 *Total Outgoing Paid:* ${totalStr}\n`;
      text += `🔢 *Total Transactions:* ${countStr}\n`;
      text += `------------------------------\n`;
      text += `📊 *PAYMENT METHOD BREAKDOWN:*\n`;
      metrics.methodBreakdown.forEach((m) => {
        text += `• ${m.method}: ₹${m.amount.toLocaleString("en-IN")} (${m.percentage}%)\n`;
      });
      text += `------------------------------\n`;
      text += `📝 *RECENT PAYMENTS (Top 10):*\n`;
      filteredPayments.slice(0, 10).forEach((p, idx) => {
        text += `${idx + 1}. ${p.title} (${p.category}) - ₹${p.amount.toLocaleString("en-IN")} via ${p.paymentMethod}\n`;
      });
      text += `\nGenerated via Hollow Block App`;

      await Share.share({ message: text });
    } catch (err) {
      console.log("Share error:", err);
    }
  };

  // Format Date String
  const formatTimeOnly = (d: Date) => {
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}:${minutesStr} ${ampm}`;
  };

  const formatFullDate = (d: Date) => {
    return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} • ${formatTimeOnly(d)}`;
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedSource !== "All") count++;
    if (selectedMethod !== "All") count++;
    if (selectedPeriod !== "all") count++;
    if (sortBy !== "newest") count++;
    return count;
  }, [selectedSource, selectedMethod, selectedPeriod, sortBy]);

  return (
    <View style={styles.screenContainer}>
      {/* Header Bar */}
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Expense Payments
          </Text>
          <Text style={styles.headerSubtitle}>
            Outgoing payments & balance payouts
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.7 }]}
            onPress={handleShareReport}
            accessibilityLabel="Share Report"
          >
            <MaterialIcons name="share" size={20} color={colors.accent.primary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.headerPrimaryBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
            onPress={() => setIsRecordModalOpen(true)}
          >
            <MaterialIcons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.headerPrimaryBtnText}>Pay</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent.primary]} />
        }
      >
        {/* KPI Metric Cards */}
        <Animated.View entering={FadeInDown.duration(200)} style={styles.metricGrid}>
          {/* Main Total Paid Card */}
          <View style={[styles.metricCard, { borderLeftColor: colors.accent.danger || "#EF4444" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.metricLabel}>Total Outgoing</Text>
              <View style={[styles.miniIconWrap, { backgroundColor: `${colors.accent.danger || "#EF4444"}15` }]}>
                <MaterialIcons name="arrow-upward" size={14} color={colors.accent.danger || "#EF4444"} />
              </View>
            </View>
            <Text style={[styles.metricValue, { color: colors.accent.danger || "#EF4444" }]}>
              ₹{metrics.totalPaid.toLocaleString("en-IN")}
            </Text>
            <Text style={styles.metricSubtext}>
              {metrics.count} {metrics.count === 1 ? "payment" : "payments"} recorded
            </Text>
          </View>

          {/* Today's Paid Card */}
          <View style={[styles.metricCard, { borderLeftColor: colors.accent.warning || "#F59E0B" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.metricLabel}>Paid Today</Text>
              <View style={[styles.miniIconWrap, { backgroundColor: `${colors.accent.warning || "#F59E0B"}15` }]}>
                <MaterialIcons name="today" size={14} color={colors.accent.warning || "#F59E0B"} />
              </View>
            </View>
            <Text style={[styles.metricValue, { color: colors.accent.warning || "#F59E0B" }]}>
              ₹{metrics.todayPaid.toLocaleString("en-IN")}
            </Text>
            <Text style={styles.metricSubtext}>This month: ₹{metrics.monthPaid.toLocaleString("en-IN")}</Text>
          </View>
        </Animated.View>

        {/* Payment Method Distribution Bar */}
        {metrics.methodBreakdown.length > 0 && (
          <View style={styles.distributionCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={styles.distributionTitle}>Payment Methods Share</Text>
              <Text style={styles.distributionSubtitle}>Avg ₹{metrics.avgAmount.toLocaleString("en-IN")} / payout</Text>
            </View>

            {/* Progress Segmented Bar */}
            <View style={styles.progressBar}>
              {metrics.methodBreakdown.map((m) => (
                <View
                  key={m.method}
                  style={{
                    width: `${m.percentage}%`,
                    backgroundColor: m.color,
                    height: "100%",
                  }}
                />
              ))}
            </View>

            {/* Legend Pills */}
            <View style={styles.legendWrap}>
              {metrics.methodBreakdown.map((m) => (
                <View key={m.method} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: m.color }]} />
                  <Text style={styles.legendText}>
                    {m.method}: <Text style={{ fontWeight: "700", color: colors.text.primary }}>₹{m.amount.toLocaleString("en-IN")}</Text> ({m.percentage}%)
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Source Categories Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
          style={{ marginBottom: 12 }}
        >
          {[
            { key: "All", label: "All Outgoing", icon: "all-inclusive" },
            { key: "expense", label: "Direct Expenses", icon: "receipt" },
            { key: "supplier", label: "Suppliers", icon: "layers" },
            { key: "worker", label: "Worker Wages", icon: "engineering" },
            { key: "delivery", label: "Delivery Payouts", icon: "local-shipping" },
          ].map((cat) => {
            const isActive = selectedSource === cat.key;
            return (
              <Pressable
                key={cat.key}
                style={({ pressed }) => [
                  styles.categoryTab,
                  isActive && styles.categoryTabActive,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => setSelectedSource(cat.key as any)}
              >
                <MaterialIcons
                  name={cat.icon as any}
                  size={15}
                  color={isActive ? "#FFFFFF" : colors.text.secondary}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.categoryTabText, isActive && styles.categoryTabTextActive]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Search & Quick Period Bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <MaterialIcons name="search" size={20} color={colors.text.muted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by payee, category, notes..."
              placeholderTextColor={colors.text.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <MaterialIcons name="cancel" size={18} color={colors.text.muted} />
              </Pressable>
            )}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.filterBtn,
              activeFiltersCount > 0 && styles.filterBtnActive,
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setIsFilterModalOpen(true)}
          >
            <MaterialIcons
              name="tune"
              size={20}
              color={activeFiltersCount > 0 ? "#FFFFFF" : colors.accent.primary}
            />
            {activeFiltersCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Quick Period Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, marginBottom: 16 }}
        >
          {[
            { id: "all", label: "All Time" },
            { id: "today", label: "Today" },
            { id: "yesterday", label: "Yesterday" },
            { id: "week", label: "This Week" },
            { id: "month", label: "This Month" },
          ].map((p) => (
            <Pressable
              key={p.id}
              style={({ pressed }) => [
                styles.periodPill,
                selectedPeriod === p.id && styles.periodPillActive,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setSelectedPeriod(p.id as any)}
            >
              <Text
                style={[
                  styles.periodPillText,
                  selectedPeriod === p.id && styles.periodPillTextActive,
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Transaction Cards List Header */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeaderTitle}>
            Transactions ({filteredPayments.length})
          </Text>
          <Text style={styles.listHeaderSubtitle}>Tap for receipt voucher</Text>
        </View>

        {/* List of Payments */}
        {filteredPayments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="money-off" size={48} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>No expense payments found</Text>
            <Text style={styles.emptySubtitle}>
              Try adjusting your search terms or filter selection.
            </Text>
            <Pressable
              style={styles.emptyActionBtn}
              onPress={() => {
                setSearchQuery("");
                setSelectedSource("All");
                setSelectedMethod("All");
                setSelectedPeriod("all");
              }}
            >
              <Text style={styles.emptyActionBtnText}>Reset All Filters</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 10, marginBottom: 40 }}>
            {filteredPayments.map((payment) => {
              const methodColor = METHOD_COLORS[payment.paymentMethod] || colors.accent.primary;
              return (
                <Pressable
                  key={payment.id}
                  style={({ pressed }) => [
                    styles.paymentCard,
                    pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                  ]}
                  onPress={() => {
                    setSelectedPayment(payment);
                    setIsDetailModalOpen(true);
                  }}
                >
                  <View style={[styles.iconWrap, { backgroundColor: `${payment.iconColor}15` }]}>
                    <MaterialIcons name={payment.icon as any} size={22} color={payment.iconColor} />
                  </View>

                  <View style={styles.cardInfo}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {payment.title}
                      </Text>
                      <View style={[styles.sourceBadge, { backgroundColor: `${payment.iconColor}1A` }]}>
                        <Text style={[styles.sourceBadgeText, { color: payment.iconColor }]}>
                          {payment.sourceLabel}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.cardDate} numberOfLines={1}>
                      {formatFullDate(payment.paidAt)}
                      {payment.notes ? ` • ${payment.notes}` : ""}
                    </Text>
                  </View>

                  <View style={styles.cardRight}>
                    <Text style={styles.cardAmount}>
                      -₹{payment.amount.toLocaleString("en-IN")}
                    </Text>

                    <View style={[styles.methodBadge, { borderColor: `${methodColor}40` }]}>
                      <View style={[styles.methodDot, { backgroundColor: methodColor }]} />
                      <Text style={[styles.methodBadgeText, { color: methodColor }]}>
                        {payment.paymentMethod}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* RECORD PAYMENT MODAL */}
      <Modal
        visible={isRecordModalOpen}
        animationType="slide"
        transparent
        onRequestClose={handleCloseRecordModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={[styles.miniIconWrap, { backgroundColor: `${colors.accent.primary}15` }]}>
                  <MaterialIcons name="payments" size={18} color={colors.accent.primary} />
                </View>
                <Text style={styles.modalTitle}>Record Expense Payment</Text>
              </View>
              <Pressable onPress={handleCloseRecordModal} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {/* Option A: Select an Expense with Pending Balance */}
              {pendingExpenses.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.fieldLabel}>Link to Pending Balance Expense (Optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    <Pressable
                      style={[
                        styles.expenseSelectChip,
                        !recordExpenseId && styles.expenseSelectChipActive,
                      ]}
                      onPress={() => setRecordExpenseId("")}
                    >
                      <Text
                        style={[
                          styles.expenseSelectChipText,
                          !recordExpenseId && styles.expenseSelectChipTextActive,
                        ]}
                      >
                        General Outgoing
                      </Text>
                    </Pressable>

                    {pendingExpenses.map((pe: any) => {
                      const isSelected = recordExpenseId === pe.id;
                      return (
                        <Pressable
                          key={pe.id}
                          style={[
                            styles.expenseSelectChip,
                            isSelected && styles.expenseSelectChipActive,
                          ]}
                          onPress={() => {
                            setRecordExpenseId(pe.id);
                            setRecordAmount(String(pe.remaining));
                            setRecordPayeeTitle(pe.title);
                          }}
                        >
                          <Text
                            style={[
                              styles.expenseSelectChipText,
                              isSelected && styles.expenseSelectChipTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {pe.title} (Due ₹{pe.remaining.toLocaleString("en-IN")})
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Payee / Title (if general) */}
              {!recordExpenseId && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.fieldLabel}>Expense Title / Payee *</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. Fuel for Truck, Office Supplies, Factory Rent"
                    placeholderTextColor={colors.text.muted}
                    value={recordPayeeTitle}
                    onChangeText={setRecordPayeeTitle}
                  />
                </View>
              )}

              {/* Payment Amount */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.fieldLabel}>Payment Amount (₹) *</Text>
                <TextInput
                  style={[styles.modalInput, { fontSize: 18, fontWeight: "700", color: colors.accent.primary }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  value={recordAmount}
                  onChangeText={setRecordAmount}
                />
              </View>

              {/* Payment Method Selector */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.fieldLabel}>Payment Method</Text>
                <View style={styles.methodSelectorWrap}>
                  {["Cash", "UPI", "Bank Transfer", "Cheque", "Card"].map((m) => {
                    const isSelected = recordMethod === m;
                    const c = METHOD_COLORS[m] || colors.accent.primary;
                    return (
                      <Pressable
                        key={m}
                        style={[
                          styles.methodChip,
                          isSelected && { backgroundColor: c, borderColor: c },
                        ]}
                        onPress={() => setRecordMethod(m)}
                      >
                        <Text style={[styles.methodChipText, isSelected && { color: "#FFFFFF", fontWeight: "700" }]}>
                          {m}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Date Selector */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.fieldLabel}>Payment Date</Text>
                <Pressable style={styles.datePickerBtn} onPress={() => setIsDatePickerOpen(true)}>
                  <MaterialIcons name="event" size={18} color={colors.accent.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.datePickerBtnText}>
                    {recordDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </Pressable>
              </View>

              {/* Notes / Reference */}
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.fieldLabel}>Notes / Reference Number</Text>
                <TextInput
                  style={[styles.modalInput, { height: 70, textAlignVertical: "top" }]}
                  placeholder="e.g. Paid via PhonePe, UTR #12345678, Bill #890"
                  placeholderTextColor={colors.text.muted}
                  multiline
                  value={recordNotes}
                  onChangeText={setRecordNotes}
                />
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActionsRow}>
              <Pressable style={styles.modalCancelBtn} onPress={handleCloseRecordModal}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalSubmitBtn, isSavingPayment && { opacity: 0.6 }]}
                onPress={handleSavePayment}
                disabled={isSavingPayment}
              >
                {isSavingPayment ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Confirm Payment</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* PAYMENT DETAILS / VOUCHER MODAL */}
      <Modal
        visible={isDetailModalOpen && !!selectedPayment}
        animationType="fade"
        transparent
        onRequestClose={() => setIsDetailModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { maxWidth: 440 }]}>
            {selectedPayment && (
              <>
                <View style={styles.voucherHeader}>
                  <View style={[styles.voucherIconWrap, { backgroundColor: `${selectedPayment.iconColor}15` }]}>
                    <MaterialIcons name={selectedPayment.icon} size={28} color={selectedPayment.iconColor} />
                  </View>
                  <Text style={styles.voucherLabel}>PAYMENT VOUCHER</Text>
                  <Text style={styles.voucherAmount}>
                    -₹{selectedPayment.amount.toLocaleString("en-IN")}
                  </Text>
                  <Text style={styles.voucherTitle}>{selectedPayment.title}</Text>
                </View>

                {/* Voucher Rows */}
                <View style={styles.voucherDetailsCard}>
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherRowLabel}>Category</Text>
                    <Text style={styles.voucherRowValue}>{selectedPayment.category}</Text>
                  </View>

                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherRowLabel}>Source</Text>
                    <Text style={styles.voucherRowValue}>{selectedPayment.sourceLabel}</Text>
                  </View>

                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherRowLabel}>Payment Method</Text>
                    <Text style={[styles.voucherRowValue, { color: METHOD_COLORS[selectedPayment.paymentMethod] || colors.text.primary, fontWeight: "700" }]}>
                      {selectedPayment.paymentMethod}
                    </Text>
                  </View>

                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherRowLabel}>Date & Time</Text>
                    <Text style={styles.voucherRowValue}>{formatFullDate(selectedPayment.paidAt)}</Text>
                  </View>

                  {selectedPayment.notes ? (
                    <View style={styles.voucherRow}>
                      <Text style={styles.voucherRowLabel}>Notes</Text>
                      <Text style={[styles.voucherRowValue, { flex: 1, textAlign: "right" }]}>
                        {selectedPayment.notes}
                      </Text>
                    </View>
                  ) : null}

                  <View style={[styles.voucherRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.voucherRowLabel}>Transaction Ref</Text>
                    <Text style={[styles.voucherRowValue, { fontFamily: "monospace", fontSize: 11 }]}>
                      {selectedPayment.rawId}
                    </Text>
                  </View>
                </View>

                {/* Voucher Actions */}
                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                  <Pressable
                    style={({ pressed }) => [styles.voucherShareBtn, pressed && { opacity: 0.8 }]}
                    onPress={async () => {
                      const text = `🧾 *EXPENSE PAYMENT VOUCHER*\n*${userProfile?.businessName || "My Business"}*\n------------------------------\n• Payee: ${selectedPayment.title}\n• Category: ${selectedPayment.category}\n• Amount Paid: ₹${selectedPayment.amount.toLocaleString("en-IN")}\n• Method: ${selectedPayment.paymentMethod}\n• Date: ${formatFullDate(selectedPayment.paidAt)}\n${selectedPayment.notes ? `• Notes: ${selectedPayment.notes}\n` : ""}------------------------------\nRef: #${selectedPayment.rawId.slice(-6).toUpperCase()}`;
                      await Share.share({ message: text });
                    }}
                  >
                    <MaterialIcons name="share" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.voucherShareBtnText}>Share Voucher</Text>
                  </Pressable>

                  {selectedPayment.canUndo && (
                    <Pressable
                      style={({ pressed }) => [styles.voucherDeleteBtn, pressed && { opacity: 0.8 }]}
                      onPress={() => handleDeletePayment(selectedPayment)}
                    >
                      <MaterialIcons name="delete-outline" size={18} color={colors.accent.danger} />
                    </Pressable>
                  )}

                  <Pressable
                    style={({ pressed }) => [styles.voucherCloseBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => setIsDetailModalOpen(false)}
                  >
                    <Text style={styles.voucherCloseBtnText}>Close</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ADVANCED FILTER MODAL */}
      <Modal
        visible={isFilterModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFilterModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Outgoing Payments</Text>
              <Pressable onPress={() => setIsFilterModalOpen(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {/* Payment Method */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.fieldLabel}>Payment Method</Text>
                <View style={styles.methodSelectorWrap}>
                  {PAYMENT_METHODS.map((m) => (
                    <Pressable
                      key={m}
                      style={[
                        styles.methodChip,
                        selectedMethod === m && styles.methodChipActive,
                      ]}
                      onPress={() => setSelectedMethod(m)}
                    >
                      <Text style={[styles.methodChipText, selectedMethod === m && styles.methodChipTextActive]}>
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Sort By */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.fieldLabel}>Sort Transactions</Text>
                <View style={styles.methodSelectorWrap}>
                  {[
                    { id: "newest", label: "Newest First" },
                    { id: "oldest", label: "Oldest First" },
                    { id: "amount_desc", label: "Highest Amount" },
                    { id: "amount_asc", label: "Lowest Amount" },
                  ].map((s) => (
                    <Pressable
                      key={s.id}
                      style={[
                        styles.methodChip,
                        sortBy === s.id && styles.methodChipActive,
                      ]}
                      onPress={() => setSortBy(s.id as any)}
                    >
                      <Text style={[styles.methodChipText, sortBy === s.id && styles.methodChipTextActive]}>
                        {s.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Custom Date Range */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.fieldLabel}>Custom Date Range</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    style={[styles.datePickerBtn, { flex: 1 }]}
                    onPress={() => setCalendarTarget("start")}
                  >
                    <MaterialIcons name="event" size={16} color={colors.accent.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.datePickerBtnText}>
                      {startDate ? startDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "Start Date"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.datePickerBtn, { flex: 1 }]}
                    onPress={() => setCalendarTarget("end")}
                  >
                    <MaterialIcons name="event" size={16} color={colors.accent.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.datePickerBtnText}>
                      {endDate ? endDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "End Date"}
                    </Text>
                  </Pressable>
                </View>

                {(startDate || endDate) && (
                  <Pressable
                    style={{ alignSelf: "flex-end", marginTop: 6 }}
                    onPress={() => {
                      setStartDate(null);
                      setEndDate(null);
                      if (selectedPeriod === "custom") setSelectedPeriod("all");
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.accent.danger }}>Clear Custom Range</Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => {
                  setSelectedMethod("All");
                  setSelectedSource("All");
                  setSelectedPeriod("all");
                  setSortBy("newest");
                  setStartDate(null);
                  setEndDate(null);
                  setIsFilterModalOpen(false);
                }}
              >
                <Text style={styles.modalCancelBtnText}>Reset All</Text>
              </Pressable>

              <Pressable
                style={styles.modalSubmitBtn}
                onPress={() => setIsFilterModalOpen(false)}
              >
                <Text style={styles.modalSubmitBtnText}>Apply Filters</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* EASY CALENDAR MODALS */}
      <EasyCalendarModal
        visible={isDatePickerOpen}
        date={recordDate}
        onSelectDate={(d) => setRecordDate(d)}
        onClose={() => setIsDatePickerOpen(false)}
        title="Select Payment Date"
      />

      <EasyCalendarModal
        visible={calendarTarget === "start"}
        date={startDate || new Date()}
        onSelectDate={(d) => {
          setStartDate(d);
          setSelectedPeriod("custom");
          setCalendarTarget(null);
        }}
        onClose={() => setCalendarTarget(null)}
        title="Select Start Date"
      />

      <EasyCalendarModal
        visible={calendarTarget === "end"}
        date={endDate || new Date()}
        onSelectDate={(d) => {
          setEndDate(d);
          setSelectedPeriod("custom");
          setCalendarTarget(null);
        }}
        onClose={() => setCalendarTarget(null)}
        title="Select End Date"
      />
    </View>
  );
}

function getStyles(theme: any) {
  const { colors, spacing, radius, shadows } = theme;

  return StyleSheet.create({
    screenContainer: {
      flex: 1,
      backgroundColor: colors.bg.primary,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.bg.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      ...shadows.subtle,
    },
    headerTitleWrap: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.text.primary,
    },
    headerSubtitle: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.text.muted,
      marginTop: 1,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    headerIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.bg.primary,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    headerPrimaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.accent.primary,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
    },
    headerPrimaryBtnText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },
    scrollContent: {
      padding: spacing.md,
      paddingBottom: 60,
    },
    metricGrid: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 14,
    },
    metricCard: {
      flex: 1,
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      padding: 12,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.subtle,
    },
    metricLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    metricValue: {
      fontSize: 17,
      fontWeight: "800",
      marginTop: 4,
      marginBottom: 2,
    },
    metricSubtext: {
      fontSize: 10,
      fontWeight: "500",
      color: colors.text.muted,
    },
    miniIconWrap: {
      width: 22,
      height: 22,
      borderRadius: 11,
      justifyContent: "center",
      alignItems: "center",
    },
    distributionCard: {
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      padding: 12,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.subtle,
    },
    distributionTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    distributionSubtitle: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
    },
    progressBar: {
      height: 8,
      backgroundColor: colors.bg.primary,
      borderRadius: 4,
      flexDirection: "row",
      overflow: "hidden",
      marginBottom: 8,
    },
    legendWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontSize: 10.5,
      color: colors.text.secondary,
    },
    categoryScroll: {
      gap: 8,
      paddingVertical: 2,
    },
    categoryTab: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    categoryTabActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    categoryTabText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    categoryTabTextActive: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    searchInputWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: colors.text.primary,
      padding: 0,
    },
    filterBtn: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.bg.card,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border.subtle,
      position: "relative",
    },
    filterBtnActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    filterBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      backgroundColor: colors.accent.danger || "#EF4444",
      borderRadius: 9,
      width: 18,
      height: 18,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: "#FFFFFF",
    },
    filterBadgeText: {
      color: "#FFFFFF",
      fontSize: 9,
      fontWeight: "800",
    },
    periodPill: {
      backgroundColor: colors.bg.card,
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    periodPillActive: {
      backgroundColor: `${colors.accent.primary}18`,
      borderColor: colors.accent.primary,
    },
    periodPillText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    periodPillTextActive: {
      color: colors.accent.primary,
      fontWeight: "700",
    },
    listHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    listHeaderTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    listHeaderSubtitle: {
      fontSize: 10.5,
      fontWeight: "600",
      color: colors.text.muted,
    },
    paymentCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.subtle,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 10,
    },
    cardInfo: {
      flex: 1,
      marginRight: 8,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
      flexShrink: 1,
    },
    sourceBadge: {
      paddingHorizontal: 5,
      paddingVertical: 1.5,
      borderRadius: 4,
    },
    sourceBadgeText: {
      fontSize: 9.5,
      fontWeight: "700",
    },
    cardDate: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    cardRight: {
      alignItems: "flex-end",
    },
    cardAmount: {
      fontSize: 14.5,
      fontWeight: "800",
      color: colors.accent.danger || "#EF4444",
      marginBottom: 3,
    },
    methodBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: 6,
      borderWidth: 1,
    },
    methodDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    methodBadgeText: {
      fontSize: 10,
      fontWeight: "700",
    },
    emptyContainer: {
      paddingVertical: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 10,
      marginBottom: 4,
    },
    emptySubtitle: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: "center",
      paddingHorizontal: 30,
      marginBottom: 14,
    },
    emptyActionBtn: {
      backgroundColor: colors.bg.card,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    emptyActionBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent.primary,
    },

    // Modals
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.md,
    },
    modalContainer: {
      width: "100%",
      maxWidth: 480,
      backgroundColor: colors.bg.card,
      borderRadius: 16,
      padding: 16,
      ...shadows.medium,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text.primary,
    },
    fieldLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 6,
    },
    modalInput: {
      backgroundColor: colors.bg.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    expenseSelectChip: {
      backgroundColor: colors.bg.primary,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      maxWidth: 220,
    },
    expenseSelectChipActive: {
      backgroundColor: `${colors.accent.primary}18`,
      borderColor: colors.accent.primary,
    },
    expenseSelectChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    expenseSelectChipTextActive: {
      color: colors.accent.primary,
      fontWeight: "700",
    },
    methodSelectorWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    methodChip: {
      backgroundColor: colors.bg.primary,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    methodChipActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    methodChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    methodChipTextActive: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    datePickerBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    datePickerBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.primary,
    },
    modalActionsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: 10,
      marginTop: 14,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    modalCancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
    },
    modalCancelBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    modalSubmitBtn: {
      backgroundColor: colors.accent.primary,
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: 8,
      minWidth: 110,
      alignItems: "center",
    },
    modalSubmitBtnText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },

    // Voucher Modal Styles
    voucherHeader: {
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      borderStyle: "dashed",
      marginBottom: 12,
    },
    voucherIconWrap: {
      width: 50,
      height: 50,
      borderRadius: 25,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 8,
    },
    voucherLabel: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1,
      color: colors.text.muted,
      textTransform: "uppercase",
    },
    voucherAmount: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.accent.danger || "#EF4444",
      marginTop: 2,
    },
    voucherTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 2,
    },
    voucherDetailsCard: {
      backgroundColor: colors.bg.primary,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    voucherRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    voucherRowLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
    },
    voucherRowValue: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.primary,
    },
    voucherShareBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent.primary,
      paddingVertical: 9,
      borderRadius: 8,
    },
    voucherShareBtnText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
    },
    voucherDeleteBtn: {
      width: 38,
      height: 38,
      borderRadius: 8,
      backgroundColor: `${colors.accent.danger || "#EF4444"}15`,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: `${colors.accent.danger || "#EF4444"}30`,
    },
    voucherCloseBtn: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      justifyContent: "center",
      alignItems: "center",
    },
    voucherCloseBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
  });
}
