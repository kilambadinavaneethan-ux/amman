import { MaterialIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useContext, useState, useMemo, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { useScrollRestoration } from "../context/ScrollContext";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from "react-native";
import Animated, {
  FadeInDown,
} from "react-native-reanimated";
import AnimatedPage from "../components/AnimatedPage";
import BackButton from "../components/BackButton";

// Contexts
import { ExpenseContext } from "../context/ExpenseContext";
import { RawMaterialSupplierContext } from "../context/RawMaterialSupplierContext";
import { WorkerContext } from "../context/WorkerContext";
import { RawMaterialContext } from "../context/RawMaterialContext";
import { DeliveryPartnerContext } from "../context/DeliveryPartnerContext";
import { db, normalizeDateValue } from "../../src/config/firebase";
import { collection, doc, addDoc, updateDoc, increment, query, where, onSnapshot, deleteDoc } from "firebase/firestore";
import { getDocsOfflineSafe } from "../../src/utils/offlineHelpers";

// Components
import AnimatedCounter from "../components/AnimatedCounter";

const CATEGORY_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  "Fuel": { icon: "local-gas-station", color: "#059669", label: "Fuel" },
  "Driver Salary": { icon: "supervised-user-circle", color: "#0284c7", label: "Driver Salary" },
  "Labour Salary": { icon: "engineering", color: "#d97706", label: "Labour Salary" },
  "Vehicle Maintenance": { icon: "build-circle", color: "#4f46e5", label: "Vehicle Maint." },
  "Machinery Maintenance": { icon: "settings-suggest", color: "#0891b2", label: "Machinery Maint." },
  "Office Expense": { icon: "business", color: "#7c3aed", label: "Office Expense" },
  "Electricity Bill": { icon: "bolt", color: "#e11d48", label: "Electricity Bill" },
  "Rent": { icon: "home-work", color: "#6C5CE7", label: "Rent" },
  "Food": { icon: "restaurant", color: "#ea580c", label: "Food" },
  "Transport": { icon: "departure-board", color: "#16a34a", label: "Transport" },
  "Miscellaneous": { icon: "help-center", color: "#5A5F72", label: "Miscellaneous" },
};


export default function ExpenseBalances() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();

  // Add Expense Modal State
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addCategory, setAddCategory] = useState("Miscellaneous");
  const [addStatus, setAddStatus] = useState<"Paid" | "Balance">("Paid");
  const [addTotalAmount, setAddTotalAmount] = useState("");
  const [addPaidAmount, setAddPaidAmount] = useState("");
  const [addPaymentMethod, setAddPaymentMethod] = useState("Cash");
  const [addNotes, setAddNotes] = useState("");
  const [isSavingAddExpense, setIsSavingAddExpense] = useState(false);

  const handleOpenAddModal = () => {
    setAddTitle("");
    setAddCategory("Miscellaneous");
    setAddStatus("Paid");
    setAddTotalAmount("");
    setAddPaidAmount("");
    setAddPaymentMethod("Cash");
    setAddNotes("");
    setIsAddExpenseModalOpen(true);
  };

  useEffect(() => {
    if (params.add === "true" || params.action === "add") {
      handleOpenAddModal();
    }
  }, [params.add, params.action]);

  const handleSaveAddExpense = async () => {
    if (!addTitle.trim()) {
      Alert.alert("Required", "Please enter an expense title.");
      return;
    }
    const tot = parseFloat(addTotalAmount);
    if (isNaN(tot) || tot <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid total amount.");
      return;
    }

    let paidVal = tot;
    let remVal = 0;
    if (addStatus === "Balance") {
      const p = parseFloat(addPaidAmount || "0");
      paidVal = isNaN(p) ? 0 : p;
      remVal = Math.max(0, tot - paidVal);
    }

    setIsSavingAddExpense(true);
    try {
      const result = await addExpense({
        title: addTitle.trim(),
        category: addCategory,
        totalAmount: tot,
        amount: tot,
        paidAmount: paidVal,
        remainingAmount: remVal,
        status: addStatus,
        paymentMethod: addPaymentMethod,
        notes: addNotes.trim(),
        expenseDate: new Date(),
      });

      if (result) {
        setIsAddExpenseModalOpen(false);
        Alert.alert("Success", "New expense created successfully!");
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
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/expense-balances");
  const {
    expenses,
    loading: expensesLoading,
    // New payment system
    expensePayments,
    addExpense,
    addExpensePayment,
    undoExpensePayment,
  } = useContext(ExpenseContext) as any;

  const { suppliers, loading: suppliersLoading } = useContext(RawMaterialSupplierContext) as any;
  const { workers, loading: workersLoading, logPayment, deleteWorkerPayment } = useContext(WorkerContext) as any;
  const { addTransaction, logs, deleteTransaction: deleteRawTransaction } = useContext(RawMaterialContext) as any;
  const { partners: deliveryPartners, loading: partnersLoading } = useContext(DeliveryPartnerContext) as any;
  const loading = expensesLoading || suppliersLoading || workersLoading || partnersLoading;

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  // Payment Modal State
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payTargetType, setPayTargetType] = useState<"expense" | "supplier" | "worker" | "delivery">("expense");
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payNotes, setPayNotes] = useState("");
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [isRepayMode, setIsRepayMode] = useState(false);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

  // Real-time Firestore payment listeners for worker & delivery partner payments
  const [workerPayments, setWorkerPayments] = useState<any[]>([]);
  const [deliveryPayments, setDeliveryPayments] = useState<any[]>([]);

  useEffect(() => {
    const unsubWorkerPay = onSnapshot(collection(db, "workerPayments"), (snapshot) => {
      const docs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: normalizeDateValue(d.data().createdAt),
      }));
      setWorkerPayments(docs);
    }, (err) => console.log("workerPayments error:", err));

    const unsubDeliveryPay = onSnapshot(collection(db, "deliveryPayments"), (snapshot) => {
      const docs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: normalizeDateValue(d.data().createdAt),
      }));
      setDeliveryPayments(docs);
    }, (err) => console.log("deliveryPayments error:", err));

    return () => {
      unsubWorkerPay();
      unsubDeliveryPay();
    };
  }, []);

  const parseDate = (val: any) => {
    if (!val) return new Date();
    if (val instanceof Date) return val;
    if (typeof val.toDate === "function") return val.toDate();
    if (typeof val.seconds === "number") return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  // Unified payment history stream combining Expenses, Suppliers, Workers, and Delivery Hubs
  const allPaymentHistory = useMemo(() => {
    const p1 = (expensePayments || []).map((p: any) => ({
      id: p.id,
      rawId: p.id,
      targetType: "expense" as const,
      title: p.expenseTitle || "Expense Payment",
      category: "Direct Expense",
      amount: Number(p.amount || 0),
      paymentMethod: p.paymentMethod || "Cash",
      notes: p.notes || "",
      paidAt: parseDate(p.paidAt || p.createdAt),
      icon: "receipt" as const,
      iconColor: "#ef4444",
    }));

    const p2 = (logs || [])
      .filter((l: any) => l.type === "payment")
      .map((l: any) => ({
        id: `supplier-${l.id}`,
        rawId: l.id,
        targetType: "supplier" as const,
        title: l.supplierName || "Supplier Payment",
        category: "Raw Material Supplier",
        amount: Number(l.amount || 0),
        paymentMethod: l.paymentMethod || "Cash",
        notes: l.notes || "",
        paidAt: parseDate(l.date || l.createdAt),
        icon: "local-shipping" as const,
        iconColor: "#f59e0b",
      }));

    const workerMap = new Map<string, any>((workers || []).map((w: any) => [w.id, w]));
    const p3 = (workerPayments || []).map((w: any) => {
      const workerObj = workerMap.get(w.workerId);
      return {
        id: `worker-${w.id}`,
        rawId: w.id,
        targetType: "worker" as const,
        workerId: w.workerId,
        title: workerObj?.name || w.workerName || "Worker Payment",
        category: "Worker Wage",
        amount: Number(w.amount || 0),
        paymentMethod: w.paymentMethod || "Cash",
        notes: w.notes || "",
        paidAt: parseDate(w.createdAt || w.date),
        icon: "engineering" as const,
        iconColor: "#3b82f6",
      };
    });

    const partnerMap = new Map<string, any>((deliveryPartners || []).map((p: any) => [p.id, p]));
    const p4 = (deliveryPayments || []).map((d: any) => {
      const partnerObj = partnerMap.get(d.partnerId);
      return {
        id: `delivery-${d.id}`,
        rawId: d.id,
        partnerId: d.partnerId,
        targetType: "delivery" as const,
        title: partnerObj?.name || d.partnerName || "Delivery Partner Payment",
        category: "Delivery Partner",
        amount: Number(d.amount || 0),
        paymentMethod: d.paymentMethod || "Cash",
        notes: d.notes || "",
        paidAt: parseDate(d.createdAt || d.date),
        icon: "local-shipping" as const,
        iconColor: "#06b6d4",
      };
    });

    const combined = [...p1, ...p2, ...p3, ...p4];
    combined.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
    return combined;
  }, [expensePayments, logs, workerPayments, deliveryPayments, workers, deliveryPartners]);

  const filteredPayments = useMemo(() => {
    const queryStr = searchQuery.toLowerCase();
    if (!queryStr) return allPaymentHistory;
    return allPaymentHistory.filter((p: any) => {
      return (
        p.title?.toLowerCase().includes(queryStr) ||
        p.category?.toLowerCase().includes(queryStr) ||
        p.paymentMethod?.toLowerCase().includes(queryStr) ||
        p.notes?.toLowerCase().includes(queryStr)
      );
    });
  }, [allPaymentHistory, searchQuery]);

  // Filter pending expenses
  const pendingExpenses = useMemo(() => (expenses || []).filter((e: any) => {
    const remaining = e.remainingAmount !== undefined 
      ? Number(e.remainingAmount) 
      : (e.paymentMethod === "Balance" ? Number(e.amount || 0) : 0);
    
    const isPending = remaining > 0;
    const matchesSearch = 
      !searchQuery ||
      e.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return isPending && matchesSearch;
  }), [expenses, searchQuery]);

  // Single-pass expense metrics (outstanding + advance)
  const { totalOutstandingBalance, totalExpenseAdvance } = useMemo(() => {
    let outstanding = 0;
    let advance = 0;
    (expenses || []).forEach((e: any) => {
      const remaining = e.remainingAmount !== undefined 
        ? Number(e.remainingAmount) 
        : (e.paymentMethod === "Balance" ? Number(e.amount || 0) : 0);
      if (remaining > 0) outstanding += remaining;
      else if (remaining < 0) advance += Math.abs(remaining);
    });
    return { totalOutstandingBalance: outstanding, totalExpenseAdvance: advance };
  }, [expenses]);

  // Single-pass supplier metrics
  const { totalSupplierBalance, totalSupplierAdvance } = useMemo(() => {
    let outstanding = 0;
    let advance = 0;
    (suppliers || []).forEach((s: any) => {
      const bal = Number(s.balance || 0);
      if (bal > 0) outstanding += bal;
      else if (bal < 0) advance += Math.abs(bal);
    });
    return { totalSupplierBalance: outstanding, totalSupplierAdvance: advance };
  }, [suppliers]);

  // Single-pass worker metrics
  const { totalWorkerPending, totalWorkerAdvance } = useMemo(() => {
    let outstanding = 0;
    let advance = 0;
    (workers || []).forEach((w: any) => {
      if (w.status === "Active" || !w.status) {
        const pending = w.totalPending !== undefined
          ? Number(w.totalPending)
          : (Number(w.totalWages || 0) - Number(w.totalPaid || 0));
        const storedAdvance = Number(w.advanceAmount || 0);

        if (pending > 0) {
          outstanding += pending;
        } else if (pending < 0) {
          advance += Math.abs(pending);
        }

        if (storedAdvance > 0 && pending >= 0) {
          advance += storedAdvance;
        }
      }
    });
    return { totalWorkerPending: outstanding, totalWorkerAdvance: advance };
  }, [workers]);

  // Single-pass delivery partner metrics
  const { totalDeliveryPending, totalDeliveryAdvance } = useMemo(() => {
    let outstanding = 0;
    let advance = 0;
    (deliveryPartners || []).forEach((p: any) => {
      const pend = Number(p.totalPending || 0);
      if (pend > 0) outstanding += pend;
      else if (pend < 0) advance += Math.abs(pend);
    });
    return { totalDeliveryPending: outstanding, totalDeliveryAdvance: advance };
  }, [deliveryPartners]);

  const totalAdvancePaid = useMemo(() => totalExpenseAdvance + totalSupplierAdvance + totalWorkerAdvance + totalDeliveryAdvance, [totalExpenseAdvance, totalSupplierAdvance, totalWorkerAdvance, totalDeliveryAdvance]);

  // Filter suppliers (pending balance, advance paid, or search match)
  const pendingSuppliers = useMemo(() => (suppliers || []).filter((s: any) => {
    const balance = Number(s.balance || 0);
    const matchesSearch = 
      !searchQuery ||
      s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.contactPerson?.toLowerCase().includes(searchQuery.toLowerCase());
    return (balance !== 0 || searchQuery.trim() !== "") && s.status !== "inactive" && matchesSearch;
  }), [suppliers, searchQuery]);

  // Filter workers (shows advance paid or pending due > 0; stays visible when advance exists)
  const pendingWorkers = useMemo(() => (workers || []).filter((w: any) => {
    const pending = w.totalPending !== undefined
      ? Number(w.totalPending)
      : (Number(w.totalWages || 0) - Number(w.totalPaid || 0));
    const storedAdvance = Number(w.advanceAmount || 0);

    const hasBalanceOrAdvance = pending !== 0 || storedAdvance > 0;
    const matchesSearch =
      !searchQuery ||
      w.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.role?.toLowerCase().includes(searchQuery.toLowerCase());
    return (hasBalanceOrAdvance || searchQuery.trim() !== "") && (w.status === "Active" || !w.status) && matchesSearch;
  }), [workers, searchQuery]);

  // Filter delivery partners (pending balance, advance paid, or search match)
  const pendingDeliveries = useMemo(() => (deliveryPartners || []).filter((p: any) => {
    const pending = Number(p.totalPending || 0);
    const matchesSearch =
      !searchQuery ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone?.toLowerCase().includes(searchQuery.toLowerCase());
    return (pending !== 0 || searchQuery.trim() !== "") && p.status === "Active" && matchesSearch;
  }), [deliveryPartners, searchQuery]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const monthStart = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const totalPaidToday = useMemo(() => {
    return allPaymentHistory
      .filter((p: any) => p.paidAt >= todayStart)
      .reduce((sum: number, p: any) => sum + p.amount, 0);
  }, [allPaymentHistory, todayStart]);

  const totalPaidThisMonth = useMemo(() => {
    return allPaymentHistory
      .filter((p: any) => p.paidAt >= monthStart)
      .reduce((sum: number, p: any) => sum + p.amount, 0);
  }, [allPaymentHistory, monthStart]);

  const getDayLabel = (dateObj: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const checkDate = new Date(dateObj);
    checkDate.setHours(0, 0, 0, 0);

    if (checkDate.getTime() === today.getTime()) return "Today";
    if (checkDate.getTime() === yesterday.getTime()) return "Yesterday";
    
    return checkDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const handleUndoPayment = (payment: any) => {
    Alert.alert(
      "Undo Payment?",
      `Reverse ₹${Number(payment.amount).toLocaleString("en-IN")} payment for "${payment.title}"? The balance will be restored.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo",
          style: "destructive",
          onPress: async () => {
            try {
              let success = false;
              if (payment.targetType === "expense") {
                success = await undoExpensePayment(payment.rawId);
              } else if (payment.targetType === "supplier") {
                success = await deleteRawTransaction(payment.rawId);
              } else if (payment.targetType === "worker") {
                if (deleteWorkerPayment) {
                  success = await deleteWorkerPayment(payment.rawId);
                }
              } else if (payment.targetType === "delivery") {
                await deleteDoc(doc(db, "deliveryPayments", payment.rawId));
                if (payment.partnerId) {
                  const partnerRef = doc(db, "deliveryPartners", payment.partnerId);
                  await updateDoc(partnerRef, {
                    totalPaid: increment(-payment.amount),
                    totalPending: increment(payment.amount),
                    updatedAt: new Date(),
                  });
                }
                success = true;
              }

              if (success) {
                Alert.alert("Reversed", "Payment has been undone and balance restored.");
              } else {
                Alert.alert("Error", "Failed to undo this payment.");
              }
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "An error occurred while reversing the payment.");
            }
          },
        },
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const handleOpenPayModal = (target: any, type: "expense" | "supplier" | "worker" | "delivery", initialRepayMode = false) => {
    setSelectedTarget(target);
    setPayTargetType(type);
    setPayMethod("Cash");
    setPayNotes("");
    setIsRepayMode(initialRepayMode);

    const isAdvanceOrRepay = initialRepayMode || (
      type === "supplier" && Number(target.balance || 0) < 0
    ) || (
      type === "worker" && ((target.totalPending !== undefined ? Number(target.totalPending) : (Number(target.totalWages || 0) - Number(target.totalPaid || 0))) < 0 || Number(target.advanceAmount || 0) > 0)
    ) || (
      type === "delivery" && Number(target.totalPending || 0) < 0
    );

    if (isAdvanceOrRepay) {
      setPayAmount("");
    } else {
      if (type === "expense") {
        setPayAmount(String(target.remainingAmount !== undefined ? target.remainingAmount : target.amount));
      } else if (type === "supplier") {
        setPayAmount(String(target.balance || ""));
      } else if (type === "worker") {
        const workerPending = target.totalPending !== undefined ? Number(target.totalPending) : (Number(target.totalWages || 0) - Number(target.totalPaid || 0));
        setPayAmount(String(workerPending > 0 ? workerPending : ""));
      } else if (type === "delivery") {
        setPayAmount(String(target.totalPending || ""));
      }
    }

    setIsPayModalOpen(true);
    setShowSuccessAnim(false);
  };

  const handleClosePayModal = () => {
    setIsPayModalOpen(false);
    setSelectedTarget(null);
    setPayAmount("");
    setPayMethod("Cash");
    setPayNotes("");
    setIsRepayMode(false);
    setShowSuccessAnim(false);
  };

  const handleSavePayment = async () => {
    if (!selectedTarget) return;

    const payAmtNum = parseFloat(payAmount);
    let remaining = 0;
    if (payTargetType === "expense") {
      remaining = selectedTarget.remainingAmount !== undefined 
        ? Number(selectedTarget.remainingAmount) 
        : (selectedTarget.paymentMethod === "Balance" ? Number(selectedTarget.amount || 0) : 0);
    } else if (payTargetType === "supplier") {
      remaining = Number(selectedTarget.balance || 0);
    } else if (payTargetType === "worker") {
      remaining = Number(selectedTarget.totalWages || 0) - Number(selectedTarget.totalPaid || 0);
    } else if (payTargetType === "delivery") {
      remaining = Number(selectedTarget.totalPending || 0);
    }

    if (isNaN(payAmtNum) || payAmtNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount greater than zero.");
      return;
    }

    if (payTargetType === "expense" && payAmtNum > remaining) {
      Alert.alert(
        "Excessive Amount", 
        `Payment amount for a direct expense item cannot exceed outstanding balance of ₹${remaining.toLocaleString("en-IN")}.`
      );
      return;
    }

    const isAdvancePayment = payAmtNum > Math.max(0, remaining);
    let defaultNotes = "";
    if (isRepayMode) {
      defaultNotes = `Advance Repayment from ${selectedTarget.name || selectedTarget.title}`;
    } else {
      defaultNotes = isAdvancePayment
        ? `Advance Payment to ${selectedTarget.name || selectedTarget.title}`
        : `Paid to ${selectedTarget.name || selectedTarget.title}`;
    }
    const effectiveNotes = payNotes.trim() || defaultNotes;
    const loggedAmount = isRepayMode ? -payAmtNum : payAmtNum;

    setIsSavingPayment(true);

    try {
      let result = null;
      if (payTargetType === "expense") {
        result = await addExpensePayment(selectedTarget.id, {
          amount: payAmtNum,
          paymentMethod: payMethod,
          notes: payNotes.trim(),
        });
      } else if (payTargetType === "supplier") {
        result = await addTransaction({
          materialId: null,
          materialName: "Supplier Payment",
          type: "payment",
          quantity: 0,
          amount: loggedAmount,
          supplierId: selectedTarget.id,
          supplierName: selectedTarget.name,
          notes: effectiveNotes,
          date: new Date(),
        });
      } else if (payTargetType === "worker") {
        result = await logPayment(selectedTarget.id, {
          amount: loggedAmount,
          paymentMethod: payMethod,
          notes: effectiveNotes,
        });
      } else if (payTargetType === "delivery") {
        // Log payment in deliveryPayments
        await addDoc(collection(db, "deliveryPayments"), {
          partnerId: selectedTarget.id,
          amount: loggedAmount,
          paymentMethod: payMethod,
          notes: effectiveNotes,
          createdAt: new Date(),
        });
        // Update delivery partner totals
        const partnerRef = doc(db, "deliveryPartners", selectedTarget.id);
        await updateDoc(partnerRef, {
          totalPaid: increment(loggedAmount),
          totalPending: increment(-loggedAmount),
          updatedAt: new Date(),
        });
        
        // Auto-update matching pending trips to "Paid"
        const tripsRef = collection(db, "deliveryTrips");
        const q = query(
          tripsRef,
          where("partnerId", "==", selectedTarget.id),
          where("paymentStatus", "==", "Pending")
        );
        const tripSnap = await getDocsOfflineSafe(q);
        const pendingTrips = tripSnap.docs.map((d: any) => ({ ref: d.ref, ...d.data() } as any));
        
        // Sort in-memory by createdAt ascending
        pendingTrips.sort((a: any, b: any) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeA - timeB;
        });

        let remainingVal = payAmtNum;
        for (const trip of pendingTrips) {
          if (remainingVal <= 0) break;
          const charge = Number(trip.deliveryCharge || 0);
          if (remainingVal >= charge) {
            await updateDoc(trip.ref, {
              paymentStatus: "Paid",
              updatedAt: new Date(),
            });
            remainingVal -= charge;
          }
        }
        result = true;
      }
      
      if (result) {
        setShowSuccessAnim(true);
        setTimeout(() => {
          handleClosePayModal();
        }, 1500);
      } else {
        Alert.alert("Error", "Could not complete the payment transaction. Please try again.");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setIsSavingPayment(false);
    }
  };

  return (
    <AnimatedPage style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header Bar */}
      <View style={styles.header}>
        <BackButton label="Back" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Expense Balances</Text>
        <Pressable
          style={({ pressed }) => [
            {
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.accent.success,
              justifyContent: "center",
              alignItems: "center",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={handleOpenAddModal}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="add" size={22} color="#ffffff" />
        </Pressable>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabBar}>
        {(["pending", "history"] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tabItem, isActive && styles.activeTabItem]}
            >
              <MaterialIcons
                name={tab === "pending" ? "pending-actions" : "history"}
                size={18}
                color={isActive ? colors.accent.danger : colors.text.muted}
              />
              <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                {tab === "pending" ? "Pending Balances" : "Payment History"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.accent.danger]}
            tintColor={colors.accent.danger}
          />
        }
      >
        {activeTab === "pending" ? (
          /* PENDING BALANCES TAB */
          <View>
            {/* Unified KPI Dashboard Card */}
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={styles.unifiedCard}
            >
              <View style={styles.unifiedHeader}>
                <View style={[styles.unifiedIconWrap, { backgroundColor: `${colors.accent.danger}18` }]}>
                  <MaterialIcons name="account-balance-wallet" size={24} color={colors.accent.danger} />
                </View>
                <View style={styles.unifiedHeaderInfo}>
                  <Text style={styles.unifiedLabel}>Total Outstanding Dues</Text>
                  <AnimatedCounter
                    value={totalOutstandingBalance + totalSupplierBalance + totalWorkerPending + totalDeliveryPending}
                    prefix="₹"
                    style={styles.unifiedValue}
                  />
                </View>
              </View>

              <View style={styles.unifiedDivider} />

              <View style={styles.breakdownRow}>
                <View style={styles.breakdownCol}>
                  <Text style={styles.breakdownLabel}>EXPENSES</Text>
                  <Text style={[styles.breakdownValue, { color: colors.accent.danger }]}>
                    ₹{totalOutstandingBalance.toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.breakdownCol}>
                  <Text style={styles.breakdownLabel}>SUPPLIERS</Text>
                  <Text style={[styles.breakdownValue, { color: colors.accent.warning }]}>
                    ₹{totalSupplierBalance.toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.breakdownCol}>
                  <Text style={styles.breakdownLabel}>WORKERS</Text>
                  <Text style={[styles.breakdownValue, { color: colors.accent.primary }]}>
                    ₹{totalWorkerPending.toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.breakdownCol}>
                  <Text style={styles.breakdownLabel}>DELIVERY</Text>
                  <Text style={[styles.breakdownValue, { color: colors.accent.info }]}>
                    ₹{totalDeliveryPending.toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>
            </Animated.View>

            {totalAdvancePaid > 0 && (
              <Animated.View
                entering={FadeInDown.duration(200)}
                style={[styles.unifiedCard, { marginTop: 10, borderColor: `${colors.accent.success}40` }]}
              >
                <View style={styles.unifiedHeader}>
                  <View style={[styles.unifiedIconWrap, { backgroundColor: `${colors.accent.success}18` }]}>
                    <MaterialIcons name="paid" size={24} color={colors.accent.success} />
                  </View>
                  <View style={styles.unifiedHeaderInfo}>
                    <Text style={styles.unifiedLabel}>Total Advance Paid</Text>
                    <AnimatedCounter
                      value={totalAdvancePaid}
                      prefix="₹"
                      style={[styles.unifiedValue, { color: colors.accent.success }]}
                    />
                  </View>
                </View>

                <View style={styles.unifiedDivider} />

                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownCol}>
                    <Text style={styles.breakdownLabel}>SUPPLIERS</Text>
                    <Text style={[styles.breakdownValue, { color: colors.accent.success }]}>
                      ₹{totalSupplierAdvance.toLocaleString("en-IN")}
                    </Text>
                  </View>
                  <View style={styles.verticalDivider} />
                  <View style={styles.breakdownCol}>
                    <Text style={styles.breakdownLabel}>WORKERS</Text>
                    <Text style={[styles.breakdownValue, { color: colors.accent.success }]}>
                      ₹{totalWorkerAdvance.toLocaleString("en-IN")}
                    </Text>
                  </View>
                  <View style={styles.verticalDivider} />
                  <View style={styles.breakdownCol}>
                    <Text style={styles.breakdownLabel}>DELIVERY</Text>
                    <Text style={[styles.breakdownValue, { color: colors.accent.success }]}>
                      ₹{totalDeliveryAdvance.toLocaleString("en-IN")}
                    </Text>
                  </View>
                  {totalExpenseAdvance > 0 && (
                    <>
                      <View style={styles.verticalDivider} />
                      <View style={styles.breakdownCol}>
                        <Text style={styles.breakdownLabel}>EXPENSES</Text>
                        <Text style={[styles.breakdownValue, { color: colors.accent.success }]}>
                          ₹{totalExpenseAdvance.toLocaleString("en-IN")}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </Animated.View>
            )}

            {/* Search Bar */}
            <View style={styles.searchBarBox}>
              <MaterialIcons name="search" size={20} color={colors.text.muted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search pending by title or category..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor={colors.text.muted}
              />
              {searchQuery !== "" && (
                <Pressable onPress={() => setSearchQuery("")}>
                  <MaterialIcons name="close" size={20} color="#5A5F72" />
                </Pressable>
              )}
            </View>

            {/* Loading / List Content */}
            {loading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={colors.accent.danger} />
                <Text style={styles.loadingText}>Fetching pending balances...</Text>
              </View>
            ) : pendingExpenses.length === 0 && pendingSuppliers.length === 0 && pendingWorkers.length === 0 && pendingDeliveries.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyCircle}>
                  <MaterialIcons name="check-circle" size={48} color={colors.accent.success} />
                </View>
                <Text style={styles.emptyHeading}>All Balances Cleared! 🎉</Text>
                <Text style={styles.emptyText}>
                  There are no pending expense, supplier, worker, or delivery partner balances matching your query.
                </Text>
              </View>
            ) : (
              <View>
                {/* 1. Pending Expenses Section */}
                {pendingExpenses.length > 0 && (
                  <View style={styles.listContainer}>
                    <Text style={styles.sectionTitle}>
                      Pending Expenses ({pendingExpenses.length})
                    </Text>
                    {pendingExpenses.map((expense: any, index: number) => {
                      const catInfo = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG["Miscellaneous"];
                      const expDate = expense.expenseDate instanceof Date 
                        ? expense.expenseDate 
                        : new Date(expense.expenseDate);
                      
                      const remainingAmt = expense.remainingAmount !== undefined 
                        ? Number(expense.remainingAmount) 
                        : (expense.paymentMethod === "Balance" ? Number(expense.amount || 0) : 0);
                      
                      const paidAmt = expense.paidAmount !== undefined 
                        ? Number(expense.paidAmount) 
                        : (expense.paymentMethod === "Balance" ? 0 : Number(expense.amount || 0));

                      const isExpanded = expandedExpenseId === expense.id;

                      return (
                        <Animated.View
                          key={expense.id}
                          entering={FadeInDown.delay(Math.min(index, 5) * 30).duration(200)}
                          style={styles.expenseCard}
                        >
                          <Pressable
                            onPress={() => setExpandedExpenseId(isExpanded ? null : expense.id)}
                            style={({ pressed }) => pressed && { opacity: 0.85 }}
                          >
                            <View style={styles.cardHeader}>
                              <View style={[styles.categoryBadge, { backgroundColor: `${catInfo.color}15` }]}>
                                <MaterialIcons name={catInfo.icon as any} size={20} color={catInfo.color} />
                              </View>
                              <View style={styles.cardHeaderInfo}>
                                <Text style={styles.expenseTitle} numberOfLines={1}>
                                  {expense.title}
                                </Text>
                                <Text style={styles.categoryLabel}>{expense.category}</Text>
                              </View>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Text style={styles.expenseDateText}>
                                  {expDate.toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                  })}
                                </Text>
                                <MaterialIcons 
                                  name={isExpanded ? "expand-less" : "expand-more"} 
                                  size={20} 
                                  color={colors.text.muted} 
                                />
                              </View>
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.cardDetailsRow}>
                              <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>Total Amount</Text>
                                <Text style={styles.detailValue}>
                                  ₹{Number(expense.amount || expense.totalAmount).toLocaleString("en-IN")}
                                </Text>
                              </View>
                              <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>Paid</Text>
                                <Text style={[styles.detailValue, { color: colors.accent.success }]}>
                                  ₹{paidAmt.toLocaleString("en-IN")}
                                </Text>
                              </View>
                              <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>Balance Due</Text>
                                <Text style={[styles.detailValue, { color: colors.accent.danger }]}>
                                  ₹{remainingAmt.toLocaleString("en-IN")}
                                </Text>
                              </View>
                            </View>
                          </Pressable>

                          {isExpanded && (
                            <Animated.View 
                              entering={FadeInDown.duration(200)}
                              style={{ 
                                marginTop: 4, 
                                padding: 12, 
                                backgroundColor: colors.bg.primary, 
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: colors.border.subtle,
                                marginBottom: 12
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.secondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                Expense Profile / Details
                              </Text>
                              
                              {expense.description ? (
                                <Text style={{ fontSize: 13, color: colors.text.primary, lineHeight: 18, marginBottom: 10 }}>
                                  {expense.description}
                                </Text>
                              ) : (
                                <Text style={{ fontSize: 13, color: colors.text.muted, fontStyle: "italic", marginBottom: 10 }}>
                                  No description provided for this expense.
                                </Text>
                              )}

                              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 16 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", fontWeight: "600" }}>
                                    Payment Method
                                  </Text>
                                  <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: "600", marginTop: 2 }}>
                                    {expense.paymentMethod || "Balance / Unpaid"}
                                  </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", fontWeight: "600" }}>
                                    Logged Date
                                  </Text>
                                  <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: "600", marginTop: 2 }}>
                                    {expDate.toLocaleDateString("en-IN", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric"
                                    })}
                                  </Text>
                                </View>
                              </View>

                              {expense.billImageUrl ? (
                                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border.subtle, paddingTop: 12 }}>
                                  <Text style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", fontWeight: "600", marginBottom: 6 }}>
                                    Attached Invoice / Receipt
                                  </Text>
                                  <Image 
                                    source={{ uri: expense.billImageUrl }} 
                                    style={{ width: "100%", height: 160, borderRadius: 8, backgroundColor: colors.bg.elevated }} 
                                    resizeMode="cover"
                                  />
                                </View>
                              ) : null}
                            </Animated.View>
                          )}

                          <Pressable
                            style={styles.payBtn}
                            onPress={() => handleOpenPayModal(expense, "expense")}
                          >
                            <MaterialIcons name="payment" size={16} color="#1A1D27" />
                            <Text style={styles.payBtnText}>Pay Balance</Text>
                          </Pressable>
                        </Animated.View>
                      );
                    })}
                  </View>
                )}

                {/* 2. Pending Supplier Balances Section */}
                {pendingSuppliers.length > 0 && (
                  <View style={[styles.listContainer, pendingExpenses.length > 0 && { marginTop: 20 }]}>
                    <Text style={[styles.sectionTitle, { color: colors.accent.warning }]}>
                      Pending Supplier Balances ({pendingSuppliers.length})
                    </Text>
                    {pendingSuppliers.map((supplier: any, index: number) => {
                      const balance = Number(supplier.balance || 0);
                      return (
                        <Animated.View
                          key={supplier.id}
                          entering={FadeInDown.delay(Math.min(index, 5) * 30).duration(200)}
                          style={[styles.expenseCard, { borderColor: colors.border.accent, borderWidth: 1 }]}
                        >
                          <Pressable
                            onPress={() => router.push({ pathname: "/settings/raw-materials/suppliers/details", params: { id: supplier.id } } as any)}
                          >
                            <View style={styles.cardHeader}>
                              <View style={[styles.categoryBadge, { backgroundColor: colors.accent.primaryMuted }]}>
                                <MaterialIcons name="local-shipping" size={20} color={colors.accent.warning} />
                              </View>
                              <View style={styles.cardHeaderInfo}>
                                <Text style={styles.expenseTitle} numberOfLines={1}>
                                  {supplier.name}
                                </Text>
                                <Text style={styles.categoryLabel}>Agent: {supplier.contactPerson || "N/A"}</Text>
                              </View>
                              <MaterialIcons name="chevron-right" size={20} color={colors.border.medium} />
                            </View>

                            <View style={styles.divider} />

                            {(() => {
                              const totalPurchased = (logs || [])
                                .filter((log: any) => log.supplierId === supplier.id && log.type === "purchase")
                                .reduce((sum: number, log: any) => sum + Number(log.totalCost || 0), 0);
                              
                              const totalPaid = (logs || [])
                                .filter((log: any) => log.supplierId === supplier.id)
                                .reduce((sum: number, log: any) => {
                                  if (log.type === "purchase") {
                                    return sum + Number(log.amountPaid || 0);
                                  } else if (log.type === "payment") {
                                    return sum + Number(log.amount || 0);
                                  }
                                  return sum;
                                }, 0);

                              return (
                                <View style={styles.cardDetailsRow}>
                                  <View style={styles.detailCol}>
                                    <Text style={styles.detailLabel}>Total Purchased</Text>
                                    <Text style={styles.detailValue}>₹{totalPurchased.toLocaleString("en-IN")}</Text>
                                  </View>
                                  <View style={styles.detailCol}>
                                    <Text style={styles.detailLabel}>Total Paid</Text>
                                    <Text style={styles.detailValue}>₹{totalPaid.toLocaleString("en-IN")}</Text>
                                  </View>
                                  <View style={styles.detailCol}>
                                    <Text style={styles.detailLabel}>{balance < 0 ? "Advance Paid" : "Balance Due"}</Text>
                                    <Text style={[styles.detailValue, { color: balance < 0 ? "#10b981" : "#b45309" }]}>
                                      ₹{Math.abs(balance).toLocaleString("en-IN")}
                                    </Text>
                                  </View>
                                </View>
                              );
                            })()}
                          </Pressable>

                          {balance < 0 ? (
                            <View style={styles.cardBtnRow}>
                              <Pressable
                                style={[
                                  styles.payBtnFlex,
                                  {
                                    backgroundColor: colors.accent.danger,
                                  }
                                ]}
                                onPress={() => handleOpenPayModal(supplier, "supplier", false)}
                              >
                                <MaterialIcons
                                  name="add-circle-outline"
                                  size={16}
                                  color="#ffffff"
                                />
                                <Text style={[styles.payBtnText, { color: "#ffffff" }]}>
                                  Pay Advance
                                </Text>
                              </Pressable>

                              <Pressable
                                style={[
                                  styles.repayBtnFlex,
                                  {
                                    borderColor: "#10b981",
                                    backgroundColor: "#10b98115",
                                  }
                                ]}
                                onPress={() => handleOpenPayModal(supplier, "supplier", true)}
                              >
                                <MaterialIcons
                                  name="remove-circle-outline"
                                  size={16}
                                  color="#10b981"
                                />
                                <Text style={[styles.repayBtnText, { color: "#10b981" }]}>
                                  Repay Advance
                                </Text>
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable
                              style={[
                                styles.payBtn,
                                {
                                  backgroundColor: colors.accent.warning,
                                  marginTop: 12
                                }
                              ]}
                              onPress={() => handleOpenPayModal(supplier, "supplier", false)}
                            >
                              <MaterialIcons
                                name="payment"
                                size={16}
                                color="#1A1D27"
                              />
                              <Text style={[styles.payBtnText, { color: "#1A1D27" }]}>
                                Pay Balance
                              </Text>
                            </Pressable>
                          )}
                        </Animated.View>
                      );
                    })}
                  </View>
                )}

                {/* 3. Pending Worker Dues Section */}
                {pendingWorkers.length > 0 && (
                  <View style={[styles.listContainer, (pendingExpenses.length > 0 || pendingSuppliers.length > 0) && { marginTop: 20 }]}>
                    <Text style={[styles.sectionTitle, { color: colors.accent.primary }]}>
                      Worker Accounts & Balances ({pendingWorkers.length})
                    </Text>
                    {pendingWorkers.map((worker: any, index: number) => {
                      const pending = worker.totalPending !== undefined
                        ? Number(worker.totalPending)
                        : (Number(worker.totalWages || 0) - Number(worker.totalPaid || 0));
                      const storedAdvance = Number(worker.advanceAmount || 0);
                      const effectiveAdvance = pending < 0 ? Math.abs(pending) : storedAdvance;
                      const isAdvance = pending < 0 || (pending === 0 && storedAdvance > 0);
                      const totalEarned = Number(worker.totalWages || 0);
                      const totalPaid = Number(worker.totalPaid || 0);
                      const roleIcons: Record<string, string> = {
                        Labour: "construction",
                        Operator: "engineering",
                        Helper: "handyman",
                        Driver: "local-shipping",
                        Supervisor: "supervisor-account",
                      };
                      const roleIcon = roleIcons[worker.role] || "person";

                      return (
                        <Animated.View
                          key={worker.id}
                          entering={FadeInDown.delay(Math.min(index, 5) * 30).duration(200)}
                          style={[styles.expenseCard, { borderColor: colors.border.accent, borderWidth: 1 }]}
                        >
                          <Pressable
                            onPress={() => router.push({ pathname: "/settings/workers/details", params: { id: worker.id } } as any)}
                          >
                            <View style={styles.cardHeader}>
                              <View style={[styles.categoryBadge, { backgroundColor: colors.accent.primaryMuted }]}>
                                <MaterialIcons name={roleIcon as any} size={20} color={colors.accent.primary} />
                              </View>
                              <View style={styles.cardHeaderInfo}>
                                <Text style={styles.expenseTitle} numberOfLines={1}>
                                  {worker.name}
                                </Text>
                                <Text style={styles.categoryLabel}>
                                  {worker.role || "Worker"} • {worker.billingSystem === "Piece-Rate" ? "Piece-Rate" : "Time-Based"}
                                </Text>
                              </View>
                              <MaterialIcons name="chevron-right" size={20} color="#363B4D" />
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.cardDetailsRow}>
                              <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>Total Earned</Text>
                                <Text style={styles.detailValue}>
                                  ₹{totalEarned.toLocaleString("en-IN")}
                                </Text>
                              </View>
                              <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>Total Paid</Text>
                                <Text style={[styles.detailValue, { color: "#00D68F" }]}>
                                  ₹{totalPaid.toLocaleString("en-IN")}
                                </Text>
                              </View>
                              <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>{isAdvance ? "Advance Paid" : "Pending Due"}</Text>
                                <Text style={[styles.detailValue, { color: isAdvance ? "#10b981" : "#8B5CF6" }]}>
                                  ₹{(isAdvance ? effectiveAdvance : Math.abs(pending)).toLocaleString("en-IN")}
                                </Text>
                              </View>
                            </View>
                          </Pressable>

                          {pending < 0 ? (
                            <View style={styles.cardBtnRow}>
                              <Pressable
                                style={[
                                  styles.payBtnFlex,
                                  {
                                    backgroundColor: colors.accent.danger,
                                  }
                                ]}
                                onPress={() => handleOpenPayModal(worker, "worker", false)}
                              >
                                <MaterialIcons
                                  name="add-circle-outline"
                                  size={16}
                                  color="#ffffff"
                                />
                                <Text style={[styles.payBtnText, { color: "#ffffff" }]}>
                                  Pay Advance
                                </Text>
                              </Pressable>

                              <Pressable
                                style={[
                                  styles.repayBtnFlex,
                                  {
                                    borderColor: "#10b981",
                                    backgroundColor: "#10b98115",
                                  }
                                ]}
                                onPress={() => handleOpenPayModal(worker, "worker", true)}
                              >
                                <MaterialIcons
                                  name="remove-circle-outline"
                                  size={16}
                                  color="#10b981"
                                />
                                <Text style={[styles.repayBtnText, { color: "#10b981" }]}>
                                  Repay Advance
                                </Text>
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable
                              style={[
                                styles.payBtn,
                                {
                                  backgroundColor: colors.accent.primary,
                                  marginTop: 12
                                }
                              ]}
                              onPress={() => handleOpenPayModal(worker, "worker", false)}
                            >
                              <MaterialIcons
                                name="payment"
                                size={16}
                                color="#1A1D27"
                              />
                              <Text style={[styles.payBtnText, { color: "#1A1D27" }]}>
                                Pay Balance
                              </Text>
                            </Pressable>
                          )}
                        </Animated.View>
                      );
                    })}
                  </View>
                )}

                {/* 4. Pending Delivery Partner Balances Section */}
                {pendingDeliveries.length > 0 && (
                  <View style={[styles.listContainer, (pendingExpenses.length > 0 || pendingSuppliers.length > 0 || pendingWorkers.length > 0) && { marginTop: 20 }]}>
                    <Text style={[styles.sectionTitle, { color: colors.accent.info }]}>
                      Delivery Partner Accounts ({pendingDeliveries.length})
                    </Text>
                    {pendingDeliveries.map((partner: any, index: number) => {
                      const pending = Number(partner.totalPending || 0);
                      const totalPaid = Number(partner.totalPaid || 0);
                      const totalEarned = Number(partner.totalPayable || 0);

                      return (
                        <Animated.View
                          key={partner.id}
                          entering={FadeInDown.delay(Math.min(index, 5) * 30).duration(200)}
                          style={[styles.expenseCard, { borderColor: `${colors.accent.info}40`, borderWidth: 1 }]}
                        >
                          <Pressable
                            onPress={() => router.push({ pathname: "/settings/delivery-partners/details", params: { id: partner.id } } as any)}
                          >
                            <View style={styles.cardHeader}>
                              <View style={[styles.categoryBadge, { backgroundColor: `${colors.accent.info}18` }]}>
                                <MaterialIcons name="local-shipping" size={20} color={colors.accent.info} />
                              </View>
                              <View style={styles.cardHeaderInfo}>
                                <Text style={styles.expenseTitle} numberOfLines={1}>
                                  {partner.name}
                                </Text>
                                <Text style={styles.categoryLabel}>
                                  Vehicle: {partner.vehicleNo || "N/A"} • Phone: {partner.phone || "N/A"}
                                </Text>
                              </View>
                              <MaterialIcons name="chevron-right" size={20} color="#363B4D" />
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.cardDetailsRow}>
                              <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>Total Owed</Text>
                                <Text style={styles.detailValue}>
                                  ₹{totalEarned.toLocaleString("en-IN")}
                                </Text>
                              </View>
                              <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>Total Paid</Text>
                                <Text style={[styles.detailValue, { color: "#10b981" }]}>
                                  ₹{totalPaid.toLocaleString("en-IN")}
                                </Text>
                              </View>
                              <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>{pending < 0 ? "Advance Paid" : "Pending Due"}</Text>
                                <Text style={[styles.detailValue, { color: pending < 0 ? "#10b981" : colors.accent.info }]}>
                                  ₹{Math.abs(pending).toLocaleString("en-IN")}
                                </Text>
                              </View>
                            </View>
                          </Pressable>

                          {pending < 0 ? (
                            <View style={styles.cardBtnRow}>
                              <Pressable
                                style={[
                                  styles.payBtnFlex,
                                  {
                                    backgroundColor: colors.accent.danger,
                                  }
                                ]}
                                onPress={() => handleOpenPayModal(partner, "delivery", false)}
                              >
                                <MaterialIcons
                                  name="add-circle-outline"
                                  size={16}
                                  color="#ffffff"
                                />
                                <Text style={[styles.payBtnText, { color: "#ffffff" }]}>
                                  Pay Advance
                                </Text>
                              </Pressable>

                              <Pressable
                                style={[
                                  styles.repayBtnFlex,
                                  {
                                    borderColor: "#10b981",
                                    backgroundColor: "#10b98115",
                                  }
                                ]}
                                onPress={() => handleOpenPayModal(partner, "delivery", true)}
                              >
                                <MaterialIcons
                                  name="remove-circle-outline"
                                  size={16}
                                  color="#10b981"
                                />
                                <Text style={[styles.repayBtnText, { color: "#10b981" }]}>
                                  Repay Advance
                                </Text>
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable
                              style={[
                                styles.payBtn,
                                {
                                  backgroundColor: colors.accent.info,
                                  marginTop: 12
                                }
                              ]}
                              onPress={() => handleOpenPayModal(partner, "delivery", false)}
                            >
                              <MaterialIcons
                                name="payment"
                                size={16}
                                color="#1A1D27"
                              />
                              <Text style={[styles.payBtnText, { color: "#1A1D27" }]}>
                                Pay Balance
                              </Text>
                            </Pressable>
                          )}
                        </Animated.View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </View>
        ) : (
          /* PAYMENT HISTORY TAB (Mirrored) */
          <View>
            {/* KPI Stats Grid Card */}
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={styles.receivedCard}
            >
              <View style={styles.receivedHeader}>
                <View>
                  <Text style={styles.receivedCardEmoji}>💸</Text>
                  <Text style={styles.receivedCardTitle}>Due Balance Payments</Text>
                </View>
              </View>

              <View style={styles.receivedDivider} />

              <View style={styles.receivedStatsGrid}>
                <View style={styles.receivedStatCol}>
                  <Text style={styles.receivedStatLabel}>Total Paid Today</Text>
                  <AnimatedCounter
                    value={totalPaidToday}
                    prefix="₹"
                    style={styles.receivedStatValue}
                  />
                </View>
                <View style={styles.receivedStatCol}>
                  <Text style={styles.receivedStatLabel}>Total Paid This Month</Text>
                  <AnimatedCounter
                    value={totalPaidThisMonth}
                    prefix="₹"
                    style={styles.receivedStatValue}
                  />
                </View>
              </View>
            </Animated.View>

            {/* Search Bar */}
            <View style={styles.searchBarBox}>
              <MaterialIcons name="search" size={20} color="#5A5F72" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search history by title, method or notes..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#5A5F72"
              />
              {searchQuery !== "" && (
                <Pressable onPress={() => setSearchQuery("")}>
                  <MaterialIcons name="close" size={20} color="#5A5F72" />
                </Pressable>
              )}
            </View>

            {/* Loading / List Content */}
            {loading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#ef4444" />
                <Text style={styles.loadingText}>Fetching payment history...</Text>
              </View>
            ) : filteredPayments.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyCircle}>
                  <MaterialIcons name="history" size={48} color="#363B4D" />
                </View>
                <Text style={styles.emptyHeading}>No Payments Found</Text>
                <Text style={styles.emptyText}>
                  No payments towards outstanding balances matched your search query.
                </Text>
              </View>
            ) : (
              <View style={styles.historyList}>
                <Text style={styles.sectionTitle}>
                  Due Payments List ({filteredPayments.length})
                </Text>
                {filteredPayments.map((payment: any, i: number) => {
                  return (
                    <View key={payment.id || i} style={styles.historyRow}>
                      <View style={styles.historyLeft}>
                        <View style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          backgroundColor: `${payment.iconColor}18`,
                          justifyContent: "center",
                          alignItems: "center",
                        }}>
                          <MaterialIcons name={payment.icon as any} size={20} color={payment.iconColor} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
                          <Text style={styles.historyTitle} numberOfLines={1}>
                            {payment.title}
                          </Text>
                          <Text style={styles.historyDetails} numberOfLines={1}>
                            {payment.category} • {payment.paymentMethod}{payment.notes ? ` • ${payment.notes}` : ""}
                          </Text>
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.historyAmt, { color: payment.amount < 0 ? "#ef4444" : "#10b981" }]}>
                          {payment.amount < 0 ? "-" : ""}₹{Math.abs(Number(payment.amount)).toLocaleString("en-IN")}
                        </Text>
                        <Text style={styles.historyTime}>
                          {getDayLabel(payment.paidAt)} {payment.paidAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                        <Pressable
                          style={styles.undoPaymentBtn}
                          onPress={() => handleUndoPayment(payment)}
                        >
                          <MaterialIcons name="undo" size={12} color="#ef4444" />
                          <Text style={styles.undoPaymentBtnText}>Undo</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Pay Balance Modal */}
      <Modal
        visible={isPayModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={handleClosePayModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalFlexSpacer} onPress={handleClosePayModal} />

          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {payTargetType === "expense" 
                  ? "💸 Pay Expense Balance" 
                  : payTargetType === "supplier" 
                    ? "💸 Pay Supplier Balance" 
                    : payTargetType === "worker"
                      ? "💸 Pay Worker Pending Dues"
                      : "💸 Pay Delivery Partner Balance"}
              </Text>
              <Pressable style={styles.modalCloseBtn} onPress={handleClosePayModal}>
                <MaterialIcons name="close" size={24} color="#5A5F72" />
              </Pressable>
            </View>

            {showSuccessAnim ? (
              <View style={styles.successContainer}>
                <MaterialIcons name="check-circle" size={80} color="#00D68F" />
                <Text style={styles.successTitle}>Transaction Recorded!</Text>
                <Text style={styles.successSub}>
                  {payTargetType === "expense" 
                    ? "Expense balance updated successfully" 
                    : payTargetType === "supplier" 
                      ? "Supplier balance updated successfully" 
                      : payTargetType === "worker"
                        ? "Worker pending dues updated successfully"
                        : "Delivery partner balance updated successfully"}
                </Text>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Outstanding Card details */}
                <View style={styles.selectedExpenseDetails}>
                  <Text style={styles.selectedExpenseTitle}>
                    {selectedTarget?.title || selectedTarget?.name}
                  </Text>
                  <Text style={styles.selectedExpenseCategory}>
                    {payTargetType === "expense" 
                      ? `Category: ${selectedTarget?.category}` 
                      : payTargetType === "supplier" 
                        ? `Agent: ${selectedTarget?.contactPerson || "N/A"}` 
                        : payTargetType === "worker"
                          ? `Role: ${selectedTarget?.role}`
                          : `Vehicle: ${selectedTarget?.vehicleNo || "N/A"}`}
                  </Text>

                  <View style={styles.modalGrid}>
                    <View style={styles.modalGridCol}>
                      <Text style={styles.modalGridLabel}>
                        {payTargetType === "expense" ? "Total Cost" : payTargetType === "supplier" ? "Owed Balance" : payTargetType === "worker" ? "Total Earned" : "Total Owed"}
                      </Text>
                      <Text style={styles.modalGridVal}>
                        ₹{(() => {
                          if (!selectedTarget) return "0";
                          if (payTargetType === "expense") {
                            return Number(selectedTarget.amount || selectedTarget.totalAmount || 0).toLocaleString("en-IN");
                          } else if (payTargetType === "supplier") {
                            return Number(selectedTarget.balance || 0).toLocaleString("en-IN");
                          } else if (payTargetType === "worker") {
                            return Number(selectedTarget.totalWages || 0).toLocaleString("en-IN");
                          } else {
                            return Number(selectedTarget.totalPayable || 0).toLocaleString("en-IN");
                          }
                        })()}
                      </Text>
                    </View>
                    <View style={styles.modalGridCol}>
                      <Text style={styles.modalGridLabel}>Outstanding</Text>
                      <Text style={[styles.modalGridVal, { color: "#ef4444" }]}>
                        ₹{(() => {
                          if (!selectedTarget) return "0";
                          if (payTargetType === "expense") {
                            return (selectedTarget.remainingAmount !== undefined 
                              ? Number(selectedTarget.remainingAmount) 
                              : (selectedTarget.paymentMethod === "Balance" ? Number(selectedTarget.amount || 0) : 0)
                            ).toLocaleString("en-IN");
                          } else if (payTargetType === "supplier") {
                            return Number(selectedTarget.balance || 0).toLocaleString("en-IN");
                          } else if (payTargetType === "worker") {
                            return (Number(selectedTarget.totalWages || 0) - Number(selectedTarget.totalPaid || 0)).toLocaleString("en-IN");
                          } else {
                            return Number(selectedTarget.totalPending || 0).toLocaleString("en-IN");
                          }
                        })()}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Transaction Mode Selector */}
                {payTargetType !== "expense" && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={styles.fieldLabel}>Transaction Type</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                      <Pressable
                        style={{
                          flex: 1,
                          height: 38,
                          borderRadius: 8,
                          justifyContent: "center",
                          alignItems: "center",
                          flexDirection: "row",
                          gap: 4,
                          backgroundColor: !isRepayMode ? colors.accent.primary : colors.bg.primary,
                          borderWidth: 1,
                          borderColor: !isRepayMode ? colors.accent.primary : colors.border.medium,
                        }}
                        onPress={() => setIsRepayMode(false)}
                      >
                        <MaterialIcons name="add" size={16} color={!isRepayMode ? "#ffffff" : colors.text.secondary} />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: !isRepayMode ? "#ffffff" : colors.text.secondary }}>
                          Pay / Give Advance
                        </Text>
                      </Pressable>

                      <Pressable
                        style={{
                          flex: 1,
                          height: 38,
                          borderRadius: 8,
                          justifyContent: "center",
                          alignItems: "center",
                          flexDirection: "row",
                          gap: 4,
                          backgroundColor: isRepayMode ? "#ef4444" : colors.bg.primary,
                          borderWidth: 1,
                          borderColor: isRepayMode ? "#ef4444" : colors.border.medium,
                        }}
                        onPress={() => setIsRepayMode(true)}
                      >
                        <MaterialIcons name="remove" size={16} color={isRepayMode ? "#ffffff" : colors.text.secondary} />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: isRepayMode ? "#ffffff" : colors.text.secondary }}>
                          Repayable Advance
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Amount input */}
                <Text style={styles.fieldLabel}>
                  {isRepayMode ? "Amount to Repay (₹) *" : "Amount to Pay (₹) *"}
                </Text>
                <TextInput
                  style={styles.amountInput}
                  keyboardType="numeric"
                  value={payAmount}
                  onChangeText={setPayAmount}
                  placeholder="Enter amount to pay"
                  placeholderTextColor="#5A5F72"
                />

                {/* Advance Banner Indicator */}
                {(() => {
                  const numVal = parseFloat(payAmount);
                  if (isNaN(numVal) || numVal <= 0) return null;
                  if (isRepayMode) {
                    return (
                      <View style={{ backgroundColor: "#ef444415", padding: 10, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: "#ef444440", flexDirection: "row", alignItems: "center" }}>
                        <MaterialIcons name="stars" size={18} color="#ef4444" style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 12, color: "#ef4444", fontWeight: "700" }}>
                          Deducts ₹{numVal.toLocaleString("en-IN")} from Advance/Paid Balance
                        </Text>
                      </View>
                    );
                  }
                  let rem = 0;
                  if (selectedTarget) {
                    if (payTargetType === "expense") {
                      rem = selectedTarget.remainingAmount !== undefined 
                        ? Number(selectedTarget.remainingAmount) 
                        : (selectedTarget.paymentMethod === "Balance" ? Number(selectedTarget.amount || 0) : 0);
                    } else if (payTargetType === "supplier") {
                      rem = Number(selectedTarget.balance || 0);
                    } else if (payTargetType === "worker") {
                      rem = Number(selectedTarget.totalWages || 0) - Number(selectedTarget.totalPaid || 0);
                    } else if (payTargetType === "delivery") {
                      rem = Number(selectedTarget.totalPending || 0);
                    }
                  }
                  const excess = numVal - Math.max(0, rem);
                  if (excess > 0 && payTargetType !== "expense") {
                    return (
                      <View style={{ backgroundColor: "#10b98115", padding: 10, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: "#10b98140", flexDirection: "row", alignItems: "center" }}>
                        <MaterialIcons name="stars" size={18} color="#10b981" style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 12, color: "#10b981", fontWeight: "700" }}>
                          Includes ₹{excess.toLocaleString("en-IN")} Advance Payment
                        </Text>
                      </View>
                    );
                  }
                  return null;
                })()}

                {/* Quick actions */}
                <View style={styles.shortcutRow}>
                  <Pressable
                    style={styles.shortcutBtn}
                    onPress={() => {
                      if (!selectedTarget) return;
                      let remaining = 0;
                      if (payTargetType === "expense") {
                        remaining = selectedTarget.remainingAmount !== undefined 
                          ? Number(selectedTarget.remainingAmount) 
                          : (selectedTarget.paymentMethod === "Balance" ? Number(selectedTarget.amount || 0) : 0);
                      } else if (payTargetType === "supplier") {
                        remaining = Number(selectedTarget.balance || 0);
                      } else if (payTargetType === "worker") {
                        remaining = Number(selectedTarget.totalWages || 0) - Number(selectedTarget.totalPaid || 0);
                      } else if (payTargetType === "delivery") {
                        remaining = Number(selectedTarget.totalPending || 0);
                      }
                      setPayAmount(String(Math.max(0, remaining)));
                    }}
                  >
                    <Text style={styles.shortcutBtnText}>Full Pay</Text>
                  </Pressable>
                  {payTargetType !== "expense" && (
                    <Pressable
                      style={[styles.shortcutBtn, { backgroundColor: `${colors.accent.primary}18`, borderColor: colors.accent.primary }]}
                      onPress={() => {
                        if (!selectedTarget) return;
                        let rem = 0;
                        if (payTargetType === "supplier") rem = Number(selectedTarget.balance || 0);
                        else if (payTargetType === "worker") rem = Number(selectedTarget.totalWages || 0) - Number(selectedTarget.totalPaid || 0);
                        else if (payTargetType === "delivery") rem = Number(selectedTarget.totalPending || 0);
                        const advanceTarget = Math.max(0, rem) + 1000;
                        setPayAmount(String(advanceTarget));
                      }}
                    >
                      <Text style={[styles.shortcutBtnText, { color: colors.accent.primary, fontWeight: "700" }]}>+ Advance</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.shortcutBtn} onPress={() => setPayAmount("1000")}>
                    <Text style={styles.shortcutBtnText}>₹1,000</Text>
                  </Pressable>
                  <Pressable style={styles.shortcutBtn} onPress={() => setPayAmount("5000")}>
                    <Text style={styles.shortcutBtnText}>₹5,000</Text>
                  </Pressable>
                </View>

                {/* Payment Method Selector Grid */}
                <Text style={styles.fieldLabel}>Payment Method *</Text>
                <View style={styles.methodGrid}>
                  {[
                    { key: "Cash", icon: "payments", color: "#10b981" },
                    { key: "UPI", icon: "phone-android", color: "#3b82f6" },
                    { key: "Bank Transfer", icon: "account-balance", color: "#8b5cf6" },
                    { key: "Card", icon: "credit-card", color: "#f59e0b" },
                    { key: "Other", icon: "more-horiz", color: "#64748b" },
                  ].map((method) => {
                    const isSelected = payMethod === method.key;
                    return (
                      <Pressable
                        key={method.key}
                        style={[
                          styles.methodChip,
                          isSelected && {
                            borderColor: method.color,
                            backgroundColor: `${method.color}08`,
                          },
                        ]}
                        onPress={() => setPayMethod(method.key)}
                      >
                        <MaterialIcons
                          name={method.icon as any}
                          size={20}
                          color={isSelected ? method.color : "#5A5F72"}
                        />
                        <Text
                          style={[
                            styles.methodChipText,
                            isSelected && {
                              color: method.color,
                              fontWeight: "700",
                            },
                          ]}
                        >
                          {method.key}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Notes */}
                <Text style={styles.fieldLabel}>Notes (Optional)</Text>
                <TextInput
                  style={[
                    styles.amountInput,
                    {
                      height: 60,
                      textAlignVertical: "top",
                      paddingVertical: 10,
                    },
                  ]}
                  multiline={true}
                  numberOfLines={2}
                  value={payNotes}
                  onChangeText={setPayNotes}
                  placeholder="Reference, receiver name, remarks..."
                  placeholderTextColor="#5A5F72"
                />

                {/* Submit Payment button */}
                <Pressable
                  style={styles.submitPaymentBtn}
                  onPress={handleSavePayment}
                  disabled={isSavingPayment}
                >
                  {isSavingPayment ? (
                    <ActivityIndicator size="small" color="#1A1D27" />
                  ) : (
                    <Text style={styles.submitPaymentBtnText}>
                      Submit Payment
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Expense Modal */}
      <Modal
        visible={isAddExpenseModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAddExpenseModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalFlexSpacer}
            onPress={() => setIsAddExpenseModalOpen(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log New Expense</Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => setIsAddExpenseModalOpen(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <Text style={styles.fieldLabel}>Expense Title *</Text>
              <TextInput
                style={styles.amountInput}
                value={addTitle}
                onChangeText={setAddTitle}
                placeholder="e.g. Fuel for Delivery Van, Office Rent"
                placeholderTextColor={colors.text.muted}
              />

              {/* Category */}
              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {Object.keys(CATEGORY_CONFIG).map((cat) => {
                    const isSelected = addCategory === cat;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => setAddCategory(cat)}
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
                value={addTotalAmount}
                onChangeText={setAddTotalAmount}
                placeholder="0.00"
                keyboardType="numeric"
                placeholderTextColor={colors.text.muted}
              />

              {/* Status Selector */}
              <Text style={styles.fieldLabel}>Payment Status</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                <Pressable
                  onPress={() => setAddStatus("Paid")}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    alignItems: "center",
                    borderRadius: 10,
                    backgroundColor: addStatus === "Paid" ? colors.accent.success : colors.bg.primary,
                    borderWidth: 1,
                    borderColor: addStatus === "Paid" ? colors.accent.success : colors.border.subtle,
                  }}
                >
                  <Text style={{ fontWeight: "700", color: addStatus === "Paid" ? "#ffffff" : colors.text.secondary }}>
                    Fully Paid
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setAddStatus("Balance")}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    alignItems: "center",
                    borderRadius: 10,
                    backgroundColor: addStatus === "Balance" ? colors.accent.warning : colors.bg.primary,
                    borderWidth: 1,
                    borderColor: addStatus === "Balance" ? colors.accent.warning : colors.border.subtle,
                  }}
                >
                  <Text style={{ fontWeight: "700", color: addStatus === "Balance" ? "#ffffff" : colors.text.secondary }}>
                    Partial / Unpaid
                  </Text>
                </Pressable>
              </View>

              {/* If Partial / Unpaid, ask for Paid Amount */}
              {addStatus === "Balance" && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.fieldLabel}>Paid Amount So Far (₹)</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={addPaidAmount}
                    onChangeText={setAddPaidAmount}
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
                    onPress={() => setAddPaymentMethod(m)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      backgroundColor: addPaymentMethod === m ? colors.accent.primary : colors.bg.primary,
                      borderWidth: 1,
                      borderColor: addPaymentMethod === m ? colors.accent.primary : colors.border.subtle,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: addPaymentMethod === m ? "#ffffff" : colors.text.secondary }}>
                      {m}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Notes */}
              <Text style={styles.fieldLabel}>Notes / Remarks</Text>
              <TextInput
                style={[styles.amountInput, { height: 70, textAlignVertical: "top" }]}
                value={addNotes}
                onChangeText={setAddNotes}
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
    </AnimatedPage>
  );
}

const getStyles = (theme: any) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    unifiedCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.lg,
      marginBottom: spacing.md,
      ...shadows.card,
    },
    unifiedHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    unifiedIconWrap: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      justifyContent: "center",
      alignItems: "center",
    },
    unifiedHeaderInfo: {
      flex: 1,
    },
    unifiedLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
      marginBottom: 2,
    },
    unifiedValue: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.text.primary,
    },
    unifiedDivider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      marginVertical: spacing.md,
    },
    breakdownRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    breakdownCol: {
      flex: 1,
      alignItems: "center",
    },
    breakdownLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.text.muted,
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    breakdownValue: {
      fontSize: 14,
      fontWeight: "800",
    },
    verticalDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border.subtle,
    },
  header: {
    height: 56,
    backgroundColor: colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
  },
  tabBar: {
    flexDirection: "row",
    height: 48,
    backgroundColor: colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTabItem: {
    borderBottomColor: "#ef4444",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
  },
  activeTabText: {
    color: colors.accent.danger,
    fontWeight: "700",
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
    flexGrow: 1,
  },
  kpiContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  summaryIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "600",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text.inverse,
  },
  searchBarBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: colors.bg.card,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bg.elevated,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyHeading: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  listContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.secondary,
    marginBottom: 12,
  },
  expenseCard: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  categoryBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  expenseTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  categoryLabel: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
    fontWeight: "500",
  },
  expenseDateText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: colors.bg.elevated,
    marginVertical: 12,
  },
  cardDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  detailCol: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: "600",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  payBtn: {
    backgroundColor: colors.accent.danger,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    height: 36,
    gap: 6,
  },
  payBtnText: {
    color: colors.text.inverse,
    fontSize: 12,
    fontWeight: "700",
  },
  cardBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  payBtnFlex: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    height: 36,
    gap: 4,
  },
  repayBtnFlex: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1.5,
    height: 36,
    gap: 4,
  },
  repayBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // Received Payments card styles (mirrors Home.tsx)
  receivedCard: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 3,
    padding: 16,
    marginBottom: 20,
  },
  receivedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  receivedCardEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  receivedCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
  },
  receivedDivider: {
    height: 1,
    backgroundColor: colors.bg.elevated,
    marginVertical: 14,
  },
  receivedStatsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  receivedStatCol: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  receivedStatLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
    marginBottom: 6,
  },
  receivedStatValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.accent.success,
  },

  // History List styles
  historyList: {
    flex: 1,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.bg.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: 12,
    marginBottom: 10,
  },
  historyLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 10,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  historyDetails: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  historyAmt: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accent.success,
  },
  historyTime: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 2,
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: "flex-end",
  },
  modalFlexSpacer: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: colors.bg.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: "75%",
    maxHeight: "90%",
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text.primary,
  },
  modalCloseBtn: {
    padding: 4,
  },
  selectedExpenseDetails: {
    backgroundColor: colors.bg.primary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: 14,
    marginBottom: 16,
  },
  selectedExpenseTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
  },
  selectedExpenseCategory: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
    fontWeight: "500",
  },
  modalGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  modalGridCol: {
    flex: 1,
  },
  modalGridLabel: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: "600",
    marginBottom: 4,
  },
  modalGridVal: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text.primary,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
    marginBottom: 8,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 16,
    color: colors.text.primary,
    backgroundColor: colors.bg.primary,
    marginBottom: 12,
    fontWeight: "600",
  },
  shortcutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 18,
  },
  shortcutBtn: {
    flex: 1,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  shortcutBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  methodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },
  methodChip: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: colors.bg.card,
  },
  methodChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
  },
  submitPaymentBtn: {
    backgroundColor: colors.accent.danger,
    borderRadius: 14,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 10,
    marginBottom: 20,
  },
  submitPaymentBtnText: {
    color: colors.text.inverse,
    fontSize: 15,
    fontWeight: "700",
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 6,
  },
  successSub: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: "center",
  },
  undoPaymentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.accent.dangerMuted,
  },
  undoPaymentBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.accent.danger,
  },
});
};