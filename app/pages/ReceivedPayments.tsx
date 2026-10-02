import React, { useContext, useState, useMemo, useCallback } from "react";
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
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PaymentContext } from "../context/PaymentContext";
import { CustomerContext } from "../context/CustomerContext";
import { CollectorContext } from "../context/CollectorContext";
import { OrderContext } from "../context/OrderContext";
import { UserContext } from "../context/UserContext";
import AnimatedPage from "../components/AnimatedPage";
import BackButton from "../components/BackButton";
import EasyCalendarModal from "../components/EasyCalendarModal";
import { useTheme } from "../context/ThemeContext";
import { useScrollRestoration } from "../context/ScrollContext";
import { sharePaymentReceipt } from "../../src/services/sharing/shareService";

const PAYMENT_METHODS = ["All", "Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Other"];
const TRANSACTION_TYPES = [
  { id: "All", label: "All Receipts" },
  { id: "direct_receipt", label: "Direct Receipts" },
  { id: "order_payment", label: "Order Payments" },
  { id: "advance_credit", label: "Advance Credits" },
  { id: "advance_refund", label: "Advance Refunds" },
];

export default function ReceivedPayments() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/received-payments");
  const router = useRouter();

  // Contexts
  const {
    payments,
    loading: loadingPayments,
    addPayment,
    editPayment,
    deletePayment,
    refundCustomerAdvance,
  } = (useContext(PaymentContext) as any) || { payments: [], loading: false };
  const { customers } = (useContext(CustomerContext) as any) || { customers: [] };
  const { collectors } = (useContext(CollectorContext) as any) || { collectors: [] };
  const { orders, loading: loadingOrders } = (useContext(OrderContext) as any) || { orders: [], loading: false };
  const { profile: userProfile } = (useContext(UserContext) as any) || {};

  const loading = loadingPayments || loadingOrders;

  const companyInfo = useMemo(() => {
    return {
      name: userProfile?.company?.name || userProfile?.businessName || userProfile?.fullName || "Amman Hollow Bricks",
      phone: userProfile?.company?.phone || userProfile?.mobile || "",
      address: userProfile?.company?.address || userProfile?.address || "",
    };
  }, [userProfile]);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("All");
  const [selectedMethod, setSelectedMethod] = useState("All");
  const [selectedPeriod, setSelectedPeriod] = useState<"all" | "today" | "yesterday" | "week" | "month" | "custom">("all");
  const [selectedCollector, setSelectedCollector] = useState("All");
  const [selectedCustomer, setSelectedCustomer] = useState("All");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "amount_desc" | "amount_asc">("newest");

  // Custom Date States
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [calendarPickerTarget, setCalendarPickerTarget] = useState<"start" | "end" | null>(null);

  // Modals
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);

  // Record Payment Modal states
  const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);
  const [newPayCustomerSearch, setNewPayCustomerSearch] = useState("");
  const [newPaySelectedCustomerId, setNewPaySelectedCustomerId] = useState("");
  const [newPayAmount, setNewPayAmount] = useState("");
  const [newPayDiscount, setNewPayDiscount] = useState("");
  const [newPayMethod, setNewPayMethod] = useState("Cash");
  const [newPayCollectorId, setNewPayCollectorId] = useState("");
  const [newPayNotes, setNewPayNotes] = useState("");
  const [newPayDate, setNewPayDate] = useState<Date>(new Date());
  const [isNewPayCalendarOpen, setIsNewPayCalendarOpen] = useState(false);
  const [isSavingNewPayment, setIsSavingNewPayment] = useState(false);

  // Edit Payment Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editPaymentId, setEditPaymentId] = useState("");
  const [editPayAmount, setEditPayAmount] = useState("");
  const [editPayDiscount, setEditPayDiscount] = useState("");
  const [editPayMethod, setEditPayMethod] = useState("Cash");
  const [editPayCollectorId, setEditPayCollectorId] = useState("");
  const [editPayNotes, setEditPayNotes] = useState("");
  const [editPayDate, setEditPayDate] = useState<Date>(new Date());
  const [isEditCalendarOpen, setIsEditCalendarOpen] = useState(false);
  const [isSavingEditPayment, setIsSavingEditPayment] = useState(false);

  // Refresh & Delete
  const [refreshing, setRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  // Combine Direct Receipts (PaymentContext) & Order Payments (OrderContext) & Advance Refunds
  const allIncomingPayments = useMemo(() => {
    const list: any[] = [];

    // 1. Direct receipts from PaymentContext
    if (payments && Array.isArray(payments)) {
      payments.forEach((p: any) => {
        const isRefund = p.type === "advance_refund" || (p.refundAmount && p.refundAmount > 0);
        const amt = isRefund
          ? Number(p.refundAmount || Math.abs(p.amountReceived || 0))
          : Number(p.amountReceived || p.amount || 0);

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
          discountAmount: Number(p.discountAmount || 0),
          paymentMethod: p.paymentMethod || p.paymentMode || p.paymentType || "Cash",
          createdAt: date,
          collectorId: p.collectorId || null,
          collectorName: p.collectorName || null,
          notes: p.notes || "",
          orderId: p.orderId || null,
          pendingBefore: p.pendingBefore,
          pendingAfter: p.pendingAfter,
          advanceAmount: Number(p.advanceAmount || 0),
          isRefund: isRefund,
          isAdvanceCredit: isAdvanceCredit,
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

    // Map orderId -> total amount logged in payments collection
    const loggedOrderPaymentTotals: Record<string, number> = {};
    list.forEach((p) => {
      if (p.orderId) {
        loggedOrderPaymentTotals[p.orderId] = (loggedOrderPaymentTotals[p.orderId] || 0) + p.amountReceived;
      }
    });

    // 2. Order advance/payments from OrderContext
    if (orders && Array.isArray(orders)) {
      orders.forEach((ord: any) => {
        if (ord.isCancelled || ord.status === "cancelled") return;
        const totalPaidOnOrder = Number(ord.paidAmount || 0);
        if (totalPaidOnOrder <= 0) return;

        const loggedAmt = loggedOrderPaymentTotals[ord.id] || 0;
        const unloggedAmt = totalPaidOnOrder - loggedAmt;

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
            discountAmount: Number(ord.discountAmount || 0),
            paymentMethod: ord.paymentMethod || ord.paymentMode || ord.paymentType || "Cash",
            createdAt: orderDate,
            collectorId: ord.collectorId || null,
            collectorName: ord.collectorName || null,
            notes: notesText,
            orderId: ord.id,
            advanceAmount: Number(ord.advanceAmount || ord.excessAdvance || 0),
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
  }, [payments, orders]);

  // Filter payments
  const filteredPayments = useMemo(() => {
    let list = [...allIncomingPayments];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p: any) =>
          (p.customerName || "").toLowerCase().includes(q) ||
          (p.collectorName || "").toLowerCase().includes(q) ||
          (p.notes || "").toLowerCase().includes(q) ||
          (p.orderId || "").toLowerCase().includes(q) ||
          (p.paymentMethod || "").toLowerCase().includes(q) ||
          String(p.amountReceived || "").includes(q)
      );
    }

    // Transaction Type Filter
    if (selectedType !== "All") {
      if (selectedType === "direct_receipt") {
        list = list.filter((p: any) => p.sourceType === "direct_receipt");
      } else if (selectedType === "order_payment") {
        list = list.filter((p: any) => p.sourceType === "order_payment" || p.sourceType === "order_receipt");
      } else if (selectedType === "advance_credit") {
        list = list.filter((p: any) => p.isAdvanceCredit);
      } else if (selectedType === "advance_refund") {
        list = list.filter((p: any) => p.isRefund);
      }
    }

    // Payment method filter
    if (selectedMethod !== "All") {
      list = list.filter((p: any) => (p.paymentMethod || "Cash") === selectedMethod);
    }

    // Collector filter
    if (selectedCollector !== "All") {
      if (selectedCollector === "Direct") {
        list = list.filter((p: any) => !p.collectorId);
      } else {
        list = list.filter((p: any) => p.collectorId === selectedCollector);
      }
    }

    // Customer filter
    if (selectedCustomer !== "All") {
      list = list.filter((p: any) => p.customerId === selectedCustomer);
    }

    // Min & Max amount filter
    if (minAmount.trim()) {
      const min = parseFloat(minAmount);
      if (!isNaN(min)) {
        list = list.filter((p: any) => Number(p.amountReceived || 0) >= min);
      }
    }
    if (maxAmount.trim()) {
      const max = parseFloat(maxAmount);
      if (!isNaN(max)) {
        list = list.filter((p: any) => Number(p.amountReceived || 0) <= max);
      }
    }

    // Time period filter
    const now = new Date();
    if (selectedPeriod === "today") {
      list = list.filter((p: any) => {
        const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
        return d.toDateString() === now.toDateString();
      });
    } else if (selectedPeriod === "yesterday") {
      const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      list = list.filter((p: any) => {
        const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
        return d.toDateString() === yest.toDateString();
      });
    } else if (selectedPeriod === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      list = list.filter((p: any) => {
        const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
        return d >= weekAgo;
      });
    } else if (selectedPeriod === "month") {
      list = list.filter((p: any) => {
        const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    } else if (selectedPeriod === "custom") {
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        list = list.filter((p: any) => {
          const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
          return d >= s;
        });
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        list = list.filter((p: any) => {
          const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
          return d <= e;
        });
      }
    }

    // Sort order
    list.sort((a: any, b: any) => {
      const dA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const dB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      const amtA = Number(a.amountReceived || 0);
      const amtB = Number(b.amountReceived || 0);

      if (sortBy === "oldest") return dA - dB;
      if (sortBy === "amount_desc") return amtB - amtA;
      if (sortBy === "amount_asc") return amtA - amtB;
      return dB - dA; // default newest
    });

    return list;
  }, [
    allIncomingPayments,
    searchQuery,
    selectedType,
    selectedMethod,
    selectedCollector,
    selectedCustomer,
    minAmount,
    maxAmount,
    selectedPeriod,
    startDate,
    endDate,
    sortBy,
  ]);

  // Active Filter Counter
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedType !== "All") count++;
    if (selectedPeriod !== "all") count++;
    if (selectedMethod !== "All") count++;
    if (selectedCollector !== "All") count++;
    if (selectedCustomer !== "All") count++;
    if (minAmount.trim() !== "") count++;
    if (maxAmount.trim() !== "") count++;
    if (sortBy !== "newest") count++;
    return count;
  }, [selectedType, selectedPeriod, selectedMethod, selectedCollector, selectedCustomer, minAmount, maxAmount, sortBy]);

  const resetAllFilters = () => {
    setSearchQuery("");
    setSelectedType("All");
    setSelectedPeriod("all");
    setSelectedMethod("All");
    setSelectedCollector("All");
    setSelectedCustomer("All");
    setMinAmount("");
    setMaxAmount("");
    setStartDate(null);
    setEndDate(null);
    setSortBy("newest");
  };

  // Summary Metrics
  const metrics = useMemo(() => {
    let receivedSum = 0;
    let refundSum = 0;
    let advanceCreditSum = 0;

    filteredPayments.forEach((p: any) => {
      if (p.isRefund) {
        refundSum += p.amountReceived;
      } else {
        receivedSum += p.amountReceived;
        if (p.isAdvanceCredit) {
          advanceCreditSum += (p.advanceAmount || 0);
        }
      }
    });

    const todayStr = new Date().toDateString();
    const todayReceived = (allIncomingPayments || [])
      .filter((p: any) => {
        if (p.isRefund) return false;
        const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
        return d.toDateString() === todayStr;
      })
      .reduce((sum: number, p: any) => sum + Number(p.amountReceived || 0), 0);

    const now = new Date();
    const monthReceived = (allIncomingPayments || [])
      .filter((p: any) => {
        if (p.isRefund) return false;
        const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum: number, p: any) => sum + Number(p.amountReceived || 0), 0);

    return {
      totalReceived: receivedSum,
      totalRefunds: refundSum,
      netCollected: receivedSum - refundSum,
      todayReceived,
      monthReceived,
      advanceCreditSum,
    };
  }, [filteredPayments, allIncomingPayments]);

  const methodBreakdown = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    let nonRefundTotal = 0;

    filteredPayments.forEach((p: any) => {
      if (p.isRefund) return;
      const method = p.paymentMethod || "Cash";
      if (!map[method]) map[method] = { total: 0, count: 0 };
      map[method].total += Number(p.amountReceived || 0);
      map[method].count += 1;
      nonRefundTotal += Number(p.amountReceived || 0);
    });

    return { map, nonRefundTotal };
  }, [filteredPayments]);

  const formatDate = (date: any) => {
    if (!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatTime = (date: any) => {
    if (!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  // Open & Handle "+ Record Payment"
  const openAddPaymentModal = () => {
    setNewPayCustomerSearch("");
    setNewPaySelectedCustomerId("");
    setNewPayAmount("");
    setNewPayDiscount("");
    setNewPayMethod("Cash");
    setNewPayCollectorId("");
    setNewPayNotes("");
    setNewPayDate(new Date());
    setIsAddPaymentModalOpen(true);
  };

  const handleSaveNewPayment = async () => {
    if (!newPaySelectedCustomerId) {
      Alert.alert("Missing Customer", "Please select a customer to log payment for.");
      return;
    }
    const amtNum = parseFloat(newPayAmount) || 0;
    const discNum = parseFloat(newPayDiscount) || 0;
    if (amtNum <= 0 && discNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a payment amount or a balance discount.");
      return;
    }

    const selectedCust = customers.find((c: any) => c.id === newPaySelectedCustomerId);
    if (!selectedCust) return;

    setIsSavingNewPayment(true);
    try {
      const ok = await addPayment({
        customerId: selectedCust.id,
        customerName: selectedCust.name,
        amountReceived: amtNum,
        discountAmount: discNum,
        paymentMethod: newPayMethod,
        collectorId: newPayCollectorId || null,
        collectorName: collectors.find((c: any) => c.id === newPayCollectorId)?.name || null,
        notes: newPayNotes.trim(),
        createdAt: newPayDate,
      });

      if (ok) {
        setIsAddPaymentModalOpen(false);
        Alert.alert("Success", "Payment & balance receipt logged successfully.");
      } else {
        Alert.alert("Error", "Could not complete payment transaction.");
      }
    } catch {
      Alert.alert("Error", "Unexpected transaction failure.");
    } finally {
      setIsSavingNewPayment(false);
    }
  };

  // Open & Handle "Edit Payment"
  const openEditModal = (payment: any) => {
    setEditPaymentId(payment.id);
    setEditPayAmount(String(payment.amountReceived || ""));
    setEditPayDiscount(String(payment.discountAmount || ""));
    setEditPayMethod(payment.paymentMethod || "Cash");
    setEditPayCollectorId(payment.collectorId || "");
    setEditPayNotes(payment.notes || "");
    setEditPayDate(payment.createdAt instanceof Date ? payment.createdAt : new Date(payment.createdAt || Date.now()));
    setDetailModalVisible(false);
    setIsEditModalOpen(true);
  };

  const handleSaveEditPayment = async () => {
    if (!editPaymentId || isSavingEditPayment) return;
    const amtNum = parseFloat(editPayAmount) || 0;
    const discNum = parseFloat(editPayDiscount) || 0;
    if (amtNum <= 0 && discNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a payment amount or discount.");
      return;
    }

    setIsSavingEditPayment(true);
    try {
      const targetOriginal = (payments || []).find((p: any) => p.id === editPaymentId);
      if (!targetOriginal) {
        Alert.alert("Error", "Payment record not found.");
        return;
      }

      const ok = await editPayment(
        editPaymentId,
        {
          amountReceived: amtNum,
          discountAmount: discNum,
          paymentMethod: editPayMethod,
          collectorId: editPayCollectorId || null,
          collectorName: collectors.find((c: any) => c.id === editPayCollectorId)?.name || null,
          notes: editPayNotes.trim(),
          createdAt: editPayDate,
        },
        targetOriginal
      );

      if (ok) {
        setIsEditModalOpen(false);
        Alert.alert("Success", "Payment updated successfully.");
      } else {
        Alert.alert("Error", "Failed to update payment.");
      }
    } catch {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setIsSavingEditPayment(false);
    }
  };

  // Handle Delete Payment
  const handleDeletePayment = async (paymentId: string) => {
    Alert.alert(
      "Delete Payment",
      "This will permanently delete this payment receipt and restore the customer's pending balance. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              const ok = await deletePayment(paymentId);
              if (ok) {
                setDetailModalVisible(false);
                setSelectedPayment(null);
                Alert.alert("Deleted", "Payment deleted and customer balance restored.");
              } else {
                Alert.alert("Error", "Failed to delete payment.");
              }
            } catch (err) {
              Alert.alert("Error", "Something went wrong.");
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  // Export Financial Summary / Share Report
  const handleExportOrShareReport = async () => {
    let report = `📊 *RECEIVED PAYMENTS FINANCIAL REPORT*\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `🏢 *${companyInfo.name}*\n`;
    if (companyInfo.phone) report += `📞 ${companyInfo.phone}\n`;
    report += `📅 Generated on: ${formatDate(new Date())}\n`;
    report += `🔍 Filter: ${selectedPeriod.toUpperCase()} (${filteredPayments.length} transactions)\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    report += `💰 *COLLECTIONS SUMMARY*\n`;
    report += `• Total Received: ₹${metrics.totalReceived.toLocaleString("en-IN")}\n`;
    if (metrics.totalRefunds > 0) {
      report += `• Advance Refunds Returned: -₹${metrics.totalRefunds.toLocaleString("en-IN")}\n`;
      report += `• Net Collections: ₹${metrics.netCollected.toLocaleString("en-IN")}\n`;
    }
    report += `• Today's Collections: ₹${metrics.todayReceived.toLocaleString("en-IN")}\n`;
    report += `• This Month's Collections: ₹${metrics.monthReceived.toLocaleString("en-IN")}\n\n`;

    report += `💳 *METHOD BREAKDOWN*\n`;
    Object.entries(methodBreakdown.map).forEach(([method, data]) => {
      const share = methodBreakdown.nonRefundTotal > 0 ? ((data.total / methodBreakdown.nonRefundTotal) * 100).toFixed(1) : "0";
      report += `• ${method}: ₹${data.total.toLocaleString("en-IN")} (${share}%, ${data.count} txns)\n`;
    });
    report += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📜 *RECENT TRANSACTIONS (${Math.min(filteredPayments.length, 25)})*\n`;

    filteredPayments.slice(0, 25).forEach((p: any, idx: number) => {
      const isRef = p.isRefund;
      const sign = isRef ? "-₹" : "+₹";
      report += `${idx + 1}. ${formatDate(p.createdAt)}: ${p.customerName} - ${sign}${p.amountReceived.toLocaleString("en-IN")} (${p.paymentMethod})${p.notes ? ` [${p.notes}]` : ""}\n`;
    });

    if (filteredPayments.length > 25) {
      report += `...and ${filteredPayments.length - 25} more transactions.\n`;
    }

    try {
      await Share.share({
        message: report,
        title: "Received Payments Report",
      });
    } catch (err) {
      console.error("Share error:", err);
    }
  };

  const getMethodIcon = (method: string): any => {
    switch (method) {
      case "Cash":
        return "payments";
      case "UPI":
        return "phone-android";
      case "Bank Transfer":
        return "account-balance";
      case "Card":
        return "credit-card";
      case "Cheque":
        return "receipt-long";
      case "Other":
        return "more-horiz";
      default:
        return "payments";
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "Cash":
        return "#16a34a";
      case "UPI":
        return "#7c3aed";
      case "Bank Transfer":
        return "#0284c7";
      case "Card":
        return "#e11d48";
      case "Cheque":
        return "#d97706";
      case "Other":
        return "#64748b";
      default:
        return colors.text.muted;
    }
  };

  if (loading) {
    return (
      <AnimatedPage style={{ flex: 1 }}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.loadingText}>Loading payments...</Text>
        </View>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage style={{ flex: 1 }}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.primary} />
        }
      >
        {/* Modern Header */}
        <View style={styles.header}>
          <BackButton label="Settings" onPress={() => router.push("/settings" as any)} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <View>
              <Text style={styles.headerTitle}>💰 Received Payments</Text>
              <Text style={styles.headerSubtitle}>
                Complete financial records & receipt manager
              </Text>
            </View>
          </View>

          {/* Quick Header Actions */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Pressable
              style={styles.headerPrimaryBtn}
              onPress={openAddPaymentModal}
            >
              <MaterialIcons name="add-circle" size={16} color="#FFFFFF" />
              <Text style={styles.headerPrimaryBtnText}>+ Record Payment</Text>
            </Pressable>

            <Pressable
              style={styles.headerSecondaryBtn}
              onPress={handleExportOrShareReport}
            >
              <MaterialIcons name="share" size={16} color={colors.accent.primary} />
              <Text style={styles.headerSecondaryBtnText}>Export / Share</Text>
            </Pressable>
          </View>
        </View>

        {/* Enhanced KPI Metrics Grid */}
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, { borderLeftColor: colors.accent.success }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.summaryLabel}>Total Collections</Text>
              <MaterialIcons name="account-balance-wallet" size={18} color={colors.accent.success} />
            </View>
            <Text style={[styles.summaryValue, { color: colors.accent.success }]}>
              ₹{metrics.totalReceived.toLocaleString("en-IN")}
            </Text>
            {metrics.totalRefunds > 0 && (
              <Text style={{ fontSize: 10, color: "#D97706", fontWeight: "700", marginTop: 2 }}>
                (Net: ₹{metrics.netCollected.toLocaleString("en-IN")})
              </Text>
            )}
          </View>

          <View style={[styles.summaryCard, { borderLeftColor: colors.accent.primary }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.summaryLabel}>Today's Collections</Text>
              <MaterialIcons name="today" size={18} color={colors.accent.primary} />
            </View>
            <Text style={[styles.summaryValue, { color: colors.accent.primary }]}>
              ₹{metrics.todayReceived.toLocaleString("en-IN")}
            </Text>
            <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>Real-time today</Text>
          </View>

          <View style={[styles.summaryCard, { borderLeftColor: colors.accent.info }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.summaryLabel}>This Month</Text>
              <MaterialIcons name="date-range" size={18} color={colors.accent.info} />
            </View>
            <Text style={[styles.summaryValue, { color: colors.accent.info }]}>
              ₹{metrics.monthReceived.toLocaleString("en-IN")}
            </Text>
            <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>Month to date</Text>
          </View>

          {metrics.totalRefunds > 0 ? (
            <View style={[styles.summaryCard, { borderLeftColor: "#D97706" }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.summaryLabel}>Advance Refunds</Text>
                <MaterialIcons name="assignment-return" size={18} color="#D97706" />
              </View>
              <Text style={[styles.summaryValue, { color: "#D97706" }]}>
                -₹{metrics.totalRefunds.toLocaleString("en-IN")}
              </Text>
              <Text style={{ fontSize: 10, color: "#D97706", marginTop: 2 }}>Pushed back to clients</Text>
            </View>
          ) : (
            <View style={[styles.summaryCard, { borderLeftColor: "#10B981" }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.summaryLabel}>Transactions</Text>
                <MaterialIcons name="receipt-long" size={18} color="#10B981" />
              </View>
              <Text style={[styles.summaryValue, { color: colors.text.primary }]}>
                {filteredPayments.length}
              </Text>
              <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>Matching filters</Text>
            </View>
          )}
        </View>

        {/* Method Distribution Bar & Chips */}
        {Object.keys(methodBreakdown.map).length > 0 && (
          <View style={styles.breakdownCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={styles.breakdownTitle}>Payment Method Distribution</Text>
              <Text style={{ fontSize: 11, color: colors.text.muted, fontWeight: "600" }}>
                Total: ₹{methodBreakdown.nonRefundTotal.toLocaleString("en-IN")}
              </Text>
            </View>

            {/* Distribution Visual Bar */}
            <View style={styles.distributionBar}>
              {Object.entries(methodBreakdown.map).map(([method, data]) => {
                const pct = methodBreakdown.nonRefundTotal > 0 ? (data.total / methodBreakdown.nonRefundTotal) * 100 : 0;
                if (pct <= 0) return null;
                return (
                  <View
                    key={`bar-${method}`}
                    style={{
                      height: 8,
                      width: `${pct}%`,
                      backgroundColor: getMethodColor(method),
                    }}
                  />
                );
              })}
            </View>

            {/* Method Breakdown Row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.breakdownRow}>
                {Object.entries(methodBreakdown.map).map(([method, data]) => {
                  const sharePct = methodBreakdown.nonRefundTotal > 0 ? ((data.total / methodBreakdown.nonRefundTotal) * 100).toFixed(1) : "0";
                  return (
                    <View key={method} style={styles.breakdownItem}>
                      <View style={[styles.breakdownIconWrap, { backgroundColor: `${getMethodColor(method)}18` }]}>
                        <MaterialIcons name={getMethodIcon(method)} size={16} color={getMethodColor(method)} />
                      </View>
                      <View>
                        <Text style={styles.breakdownMethodLabel}>{method} ({sharePct}%)</Text>
                        <Text style={[styles.breakdownAmount, { color: getMethodColor(method) }]}>
                          ₹{Number(data.total).toLocaleString("en-IN")}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Search Bar + Filter Button */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <View style={[styles.searchBox, { flex: 1, marginBottom: 0 }]}>
            <MaterialIcons name="search" size={20} color={colors.text.muted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search client, collector, note, order #..."
              placeholderTextColor={colors.text.muted}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <MaterialIcons name="close" size={20} color={colors.text.muted} />
              </Pressable>
            )}
          </View>

          <Pressable
            style={[
              styles.filterToggleBtn,
              activeFiltersCount > 0 && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
            ]}
            onPress={() => setIsFilterModalOpen(true)}
          >
            <MaterialIcons
              name="tune"
              size={20}
              color={activeFiltersCount > 0 ? "#ffffff" : colors.text.primary}
            />
            {activeFiltersCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Quick Transaction Type Filter Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={styles.filterRow}>
            {TRANSACTION_TYPES.map((t) => {
              const isActive = selectedType === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setSelectedType(t.id)}
                  style={[
                    styles.filterChip,
                    isActive && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                  ]}
                >
                  <Text style={[styles.filterChipText, isActive && { color: "#fff" }]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Period Filter Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={styles.filterRow}>
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "week", label: "This Week" },
              { id: "month", label: "This Month" },
              { id: "custom", label: startDate || endDate ? "Custom Date Range" : "Custom Date" },
            ].map((p) => {
              const isActive = selectedPeriod === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setSelectedPeriod(p.id as any);
                    if (p.id === "custom" && !startDate && !endDate) {
                      setCalendarPickerTarget("start");
                    }
                  }}
                  style={[
                    styles.filterChip,
                    isActive && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                  ]}
                >
                  <Text style={[styles.filterChipText, isActive && { color: "#fff" }]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Payment Method Filter Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={styles.filterRow}>
            {PAYMENT_METHODS.map((method) => {
              const isActive = selectedMethod === method;
              const methodColor = method === "All" ? colors.accent.primary : getMethodColor(method);
              return (
                <Pressable
                  key={method}
                  onPress={() => setSelectedMethod(method)}
                  style={[
                    styles.filterChip,
                    isActive && { backgroundColor: methodColor, borderColor: methodColor },
                  ]}
                >
                  {method !== "All" && (
                    <MaterialIcons
                      name={getMethodIcon(method)}
                      size={14}
                      color={isActive ? "#fff" : methodColor}
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text style={[styles.filterChipText, isActive && { color: "#fff" }]}>{method}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Active Filter Pills Bar */}
        {activeFiltersCount > 0 && (
          <View style={styles.activePillsBar}>
            <Text style={styles.activePillsLabel}>Active Filters:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                {selectedType !== "All" && (
                  <Pressable style={styles.activePill} onPress={() => setSelectedType("All")}>
                    <Text style={styles.activePillText}>
                      Type: {TRANSACTION_TYPES.find((t) => t.id === selectedType)?.label || selectedType}
                    </Text>
                    <MaterialIcons name="close" size={12} color={colors.accent.primary} />
                  </Pressable>
                )}
                {selectedPeriod !== "all" && (
                  <Pressable style={styles.activePill} onPress={() => setSelectedPeriod("all")}>
                    <Text style={styles.activePillText}>
                      Period: {selectedPeriod.toUpperCase()}
                    </Text>
                    <MaterialIcons name="close" size={12} color={colors.accent.primary} />
                  </Pressable>
                )}
                {selectedMethod !== "All" && (
                  <Pressable style={styles.activePill} onPress={() => setSelectedMethod("All")}>
                    <Text style={styles.activePillText}>Method: {selectedMethod}</Text>
                    <MaterialIcons name="close" size={12} color={colors.accent.primary} />
                  </Pressable>
                )}
                {selectedCollector !== "All" && (
                  <Pressable style={styles.activePill} onPress={() => setSelectedCollector("All")}>
                    <Text style={styles.activePillText}>
                      Collector: {selectedCollector === "Direct" ? "Direct" : collectors.find((c: any) => c.id === selectedCollector)?.name || "Selected"}
                    </Text>
                    <MaterialIcons name="close" size={12} color={colors.accent.primary} />
                  </Pressable>
                )}
                {selectedCustomer !== "All" && (
                  <Pressable style={styles.activePill} onPress={() => setSelectedCustomer("All")}>
                    <Text style={styles.activePillText}>
                      Client: {customers.find((c: any) => c.id === selectedCustomer)?.name || "Selected"}
                    </Text>
                    <MaterialIcons name="close" size={12} color={colors.accent.primary} />
                  </Pressable>
                )}
                <Pressable onPress={resetAllFilters} style={styles.clearAllBtn}>
                  <Text style={styles.clearAllBtnText}>Reset All</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        )}

        {/* Results count & current sort indicator */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={styles.resultCount}>
            {filteredPayments.length} receipt{filteredPayments.length !== 1 ? "s" : ""}
          </Text>
          <Text style={{ fontSize: 11, color: colors.text.muted, fontWeight: "600" }}>
            Sorted: {sortBy === "newest" ? "Newest First" : sortBy === "oldest" ? "Oldest First" : sortBy === "amount_desc" ? "Amount: High to Low" : "Amount: Low to High"}
          </Text>
        </View>

        {/* Payment List */}
        {filteredPayments.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="receipt-long" size={48} color={colors.border.medium} />
            <Text style={styles.emptyTitle}>No Receipts Found</Text>
            <Text style={styles.emptyDesc}>
              {activeFiltersCount > 0 || searchQuery
                ? "No received payments match your active filters or search query."
                : "When you receive payments from clients, they will appear here."}
            </Text>
            {activeFiltersCount > 0 ? (
              <Pressable style={styles.resetCtaBtn} onPress={resetAllFilters}>
                <Text style={styles.resetCtaBtnText}>Reset All Filters</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.resetCtaBtn} onPress={openAddPaymentModal}>
                <Text style={styles.resetCtaBtnText}>+ Record First Payment</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.paymentList}>
            {filteredPayments.map((payment: any) => {
              const date = payment.createdAt instanceof Date ? payment.createdAt : new Date(payment.createdAt);
              const method = payment.paymentMethod || "Cash";
              const methodColor = getMethodColor(method);
              const isRefund = payment.isRefund;
              const isOrderPay = payment.sourceType === "order_receipt" || payment.sourceType === "order_payment";
              const isAdvCredit = payment.isAdvanceCredit;

              return (
                <Pressable
                  key={payment.id}
                  style={({ pressed }) => [styles.paymentCard, pressed && styles.paymentCardPressed]}
                  onPress={() => {
                    setSelectedPayment(payment);
                    setDetailModalVisible(true);
                  }}
                >
                  <View style={styles.paymentCardLeft}>
                    <View
                      style={[
                        styles.paymentMethodBadge,
                        { backgroundColor: isRefund ? "#FEF3C7" : `${methodColor}18` },
                      ]}
                    >
                      <MaterialIcons
                        name={isRefund ? "assignment-return" : getMethodIcon(method)}
                        size={22}
                        color={isRefund ? "#D97706" : methodColor}
                      />
                    </View>
                  </View>

                  <View style={styles.paymentCardCenter}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={styles.paymentCustomerName} numberOfLines={1}>
                        {payment.customerName || "Unknown Customer"}
                      </Text>
                    </View>
                    <Text style={styles.paymentMeta}>
                      {formatDate(date)} • {formatTime(date)}
                    </Text>

                    <View style={{ flexDirection: "row", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                      {/* Source & Type Tag */}
                      {isRefund ? (
                        <View style={[styles.sourceBadge, { backgroundColor: "#FEF3C7", borderColor: "#FCD34D", borderWidth: 1 }]}>
                          <MaterialIcons name="assignment-return" size={11} color="#D97706" />
                          <Text style={[styles.sourceBadgeText, { color: "#B45309", fontWeight: "700" }]}>
                            Advance Refund
                          </Text>
                        </View>
                      ) : isAdvCredit ? (
                        <View style={[styles.sourceBadge, { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", borderWidth: 1 }]}>
                          <MaterialIcons name="stars" size={11} color="#059669" />
                          <Text style={[styles.sourceBadgeText, { color: "#065F46", fontWeight: "700" }]}>
                            Advance Credit
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.sourceBadge, { backgroundColor: isOrderPay ? `${colors.accent.info}18` : `${colors.accent.success}18` }]}>
                          <MaterialIcons
                            name={isOrderPay ? "shopping-bag" : "receipt"}
                            size={11}
                            color={isOrderPay ? colors.accent.info : colors.accent.success}
                          />
                          <Text style={[styles.sourceBadgeText, { color: isOrderPay ? colors.accent.info : colors.accent.success }]}>
                            {isOrderPay ? "Order Payment" : "Direct Receipt"}
                          </Text>
                        </View>
                      )}

                      {/* Collector Badge */}
                      {payment.collectorName ? (
                        <View style={styles.collectorBadge}>
                          <MaterialIcons name="person" size={11} color="#8b5cf6" />
                          <Text style={styles.collectorBadgeText}>{payment.collectorName}</Text>
                        </View>
                      ) : null}
                    </View>

                    {payment.notes ? (
                      <Text style={styles.paymentNotes} numberOfLines={1}>
                        {payment.notes}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.paymentCardRight}>
                    <Text
                      style={[
                        styles.paymentAmount,
                        isRefund ? { color: "#D97706" } : { color: colors.accent.success },
                      ]}
                    >
                      {isRefund ? "-₹" : "+₹"}
                      {Number(payment.amountReceived || payment.amount || 0).toLocaleString("en-IN")}
                    </Text>
                    <View
                      style={[
                        styles.methodTag,
                        { backgroundColor: isRefund ? "#FEF3C7" : `${methodColor}15` },
                      ]}
                    >
                      <Text style={[styles.methodTagText, { color: isRefund ? "#D97706" : methodColor }]}>
                        {method}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ========== DIGITAL RECEIPT & DETAILS MODAL ========== */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalFlexSpacer} onPress={() => setDetailModalVisible(false)} />
          <View style={[styles.modalContent, { maxHeight: "88%" }]}>
            {selectedPayment && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: selectedPayment.isRefund ? "#FEF3C7" : `${colors.accent.success}20`,
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      <MaterialIcons
                        name={selectedPayment.isRefund ? "assignment-return" : "receipt"}
                        size={20}
                        color={selectedPayment.isRefund ? "#D97706" : colors.accent.success}
                      />
                    </View>
                    <View>
                      <Text style={styles.modalTitle}>
                        {selectedPayment.isRefund ? "Advance Refund Receipt" : "Payment Receipt"}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.text.muted }}>
                        ID: #{String(selectedPayment.id || "").slice(-8).toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Pressable style={styles.modalCloseBtn} onPress={() => setDetailModalVisible(false)}>
                    <MaterialIcons name="close" size={24} color={colors.text.secondary} />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                  {/* Hero Amount Banner */}
                  <View style={{
                    backgroundColor: selectedPayment.isRefund ? "#FEF3C7" : `${colors.accent.success}15`,
                    borderColor: selectedPayment.isRefund ? "#FCD34D" : `${colors.accent.success}40`,
                    borderWidth: 1,
                    borderRadius: 14,
                    padding: 16,
                    alignItems: "center",
                    marginBottom: 16,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: selectedPayment.isRefund ? "#B45309" : colors.accent.success, textTransform: "uppercase" }}>
                      {selectedPayment.isRefund ? "Refund Returned to Client" : "Payment Received"}
                    </Text>
                    <Text style={{
                      fontSize: 26,
                      fontWeight: "800",
                      color: selectedPayment.isRefund ? "#D97706" : colors.accent.success,
                      marginTop: 4,
                    }}>
                      {selectedPayment.isRefund ? "-₹" : "₹"}
                      {Number(selectedPayment.amountReceived || 0).toLocaleString("en-IN")}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.text.muted, marginTop: 4 }}>
                      Mode: {selectedPayment.paymentMethod} • {formatDate(selectedPayment.createdAt)}
                    </Text>
                  </View>

                  {/* Receipt Details Box */}
                  <View style={styles.receiptDetailsBox}>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Customer / Client</Text>
                      <Text style={styles.receiptValue}>{selectedPayment.customerName}</Text>
                    </View>

                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Transaction Date</Text>
                      <Text style={styles.receiptValue}>{formatDate(selectedPayment.createdAt)}</Text>
                    </View>

                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Payment Mode</Text>
                      <Text style={styles.receiptValue}>{selectedPayment.paymentMethod}</Text>
                    </View>

                    {selectedPayment.discountAmount > 0 && (
                      <View style={styles.receiptRow}>
                        <Text style={styles.receiptLabel}>Balance Discount Applied</Text>
                        <Text style={[styles.receiptValue, { color: colors.accent.success }]}>
                          ₹{Number(selectedPayment.discountAmount).toLocaleString("en-IN")}
                        </Text>
                      </View>
                    )}

                    {selectedPayment.collectorName && (
                      <View style={styles.receiptRow}>
                        <Text style={styles.receiptLabel}>Collected By</Text>
                        <Text style={styles.receiptValue}>{selectedPayment.collectorName}</Text>
                      </View>
                    )}

                    {selectedPayment.notes && (
                      <View style={[styles.receiptRow, { alignItems: "flex-start" }]}>
                        <Text style={styles.receiptLabel}>Notes / Reference</Text>
                        <Text style={[styles.receiptValue, { flex: 1, textAlign: "right" }]}>
                          {selectedPayment.notes}
                        </Text>
                      </View>
                    )}

                    {selectedPayment.pendingAfter !== undefined && (
                      <View style={[styles.receiptRow, { borderTopWidth: 1, borderTopColor: colors.border.subtle, paddingTop: 8, marginTop: 4 }]}>
                        <Text style={[styles.receiptLabel, { fontWeight: "700" }]}>
                          {Number(selectedPayment.pendingAfter) < 0 ? "Advance Credit Remaining" : "Balance After Payment"}
                        </Text>
                        <Text style={[styles.receiptValue, { fontWeight: "800", color: Number(selectedPayment.pendingAfter) <= 0 ? colors.accent.success : colors.accent.danger }]}>
                          ₹{Math.abs(Number(selectedPayment.pendingAfter)).toLocaleString("en-IN")}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Action Buttons */}
                  <View style={{ gap: 10, marginTop: 16, marginBottom: 20 }}>
                    {/* Share on WhatsApp Button */}
                    <Pressable
                      style={[styles.modalActionPrimary, { backgroundColor: "#25D366" }]}
                      onPress={() => {
                        const targetCust = customers.find((c: any) => c.id === selectedPayment.customerId);
                        sharePaymentReceipt(selectedPayment, companyInfo, targetCust);
                      }}
                    >
                      <MaterialIcons name="share" size={18} color="#FFFFFF" />
                      <Text style={styles.modalActionPrimaryText}>Share Receipt on WhatsApp</Text>
                    </Pressable>

                    {/* Edit Button (for direct payments) */}
                    {selectedPayment.isDirectPayment && !selectedPayment.isRefund && (
                      <Pressable
                        style={[styles.modalActionSecondary, { borderColor: colors.accent.primary }]}
                        onPress={() => openEditModal(selectedPayment)}
                      >
                        <MaterialIcons name="edit" size={18} color={colors.accent.primary} />
                        <Text style={[styles.modalActionSecondaryText, { color: colors.accent.primary }]}>
                          Edit Payment Details
                        </Text>
                      </Pressable>
                    )}

                    {/* Delete Button */}
                    {selectedPayment.isDirectPayment && (
                      <Pressable
                        style={[styles.modalActionSecondary, { borderColor: colors.accent.danger }]}
                        onPress={() => handleDeletePayment(selectedPayment.id)}
                        disabled={isDeleting}
                      >
                        <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                        <Text style={[styles.modalActionSecondaryText, { color: colors.accent.danger }]}>
                          {isDeleting ? "Deleting..." : "Delete & Reverse Balance"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ========== "+ RECORD PAYMENT" MODAL ========== */}
      <Modal
        visible={isAddPaymentModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAddPaymentModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalFlexSpacer} onPress={() => setIsAddPaymentModalOpen(false)} />
          <View style={[styles.modalContent, { maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="add-circle" size={22} color={colors.accent.success} />
                <Text style={styles.modalTitle}>Record New Payment</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsAddPaymentModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Select Customer */}
              <Text style={styles.inputLabel}>Select Customer *</Text>
              <View style={styles.searchBox}>
                <MaterialIcons name="person-search" size={18} color={colors.text.muted} />
                <TextInput
                  style={styles.searchInput}
                  value={newPayCustomerSearch}
                  onChangeText={setNewPayCustomerSearch}
                  placeholder="Search customer by name or mobile..."
                  placeholderTextColor={colors.text.muted}
                />
              </View>

              {/* Customer Selection Chips / List */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {customers
                    .filter((c: any) =>
                      !newPayCustomerSearch ||
                      (c.name || "").toLowerCase().includes(newPayCustomerSearch.toLowerCase()) ||
                      (c.phone || "").includes(newPayCustomerSearch)
                    )
                    .slice(0, 10)
                    .map((cust: any) => {
                      const isSelected = newPaySelectedCustomerId === cust.id;
                      const bal = Number(cust.totalPending !== undefined ? cust.totalPending : cust.balance || 0);
                      return (
                        <Pressable
                          key={cust.id}
                          style={[
                            styles.customerSelectChip,
                            isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                          ]}
                          onPress={() => {
                            setNewPaySelectedCustomerId(cust.id);
                            if (bal > 0) {
                              setNewPayAmount(String(bal));
                            }
                          }}
                        >
                          <Text style={[styles.customerSelectChipText, isSelected && { color: "#FFFFFF" }]}>
                            {cust.name}
                          </Text>
                          <Text style={[styles.customerSelectChipBal, isSelected && { color: "#FFFFFF" }]}>
                            {bal < 0 ? `Adv: ₹${Math.abs(bal)}` : `Due: ₹${bal}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              </ScrollView>

              {/* Selected Customer Status Banner */}
              {newPaySelectedCustomerId && (() => {
                const targetCust = customers.find((c: any) => c.id === newPaySelectedCustomerId);
                if (!targetCust) return null;
                const bal = Number(targetCust.totalPending !== undefined ? targetCust.totalPending : targetCust.balance || 0);

                return (
                  <View style={{
                    backgroundColor: bal < 0 ? "#ECFDF5" : bal > 0 ? "#FEF2F2" : colors.bg.primary,
                    borderColor: bal < 0 ? "#A7F3D0" : bal > 0 ? "#FECACA" : colors.border.medium,
                    borderWidth: 1,
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 14,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary }}>
                        {targetCust.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.text.muted }}>
                        {targetCust.phone || "No phone number"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 11, color: colors.text.muted }}>
                        {bal < 0 ? "Advance Credit" : "Current Pending"}
                      </Text>
                      <Text style={{
                        fontSize: 15,
                        fontWeight: "800",
                        color: bal < 0 ? colors.accent.success : bal > 0 ? colors.accent.danger : colors.text.primary,
                      }}>
                        ₹{Math.abs(bal).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {/* Amount Input */}
              <Text style={styles.inputLabel}>Amount Received (₹) *</Text>
              <TextInput
                style={styles.modalInput}
                value={newPayAmount}
                onChangeText={setNewPayAmount}
                placeholder="Enter amount collected"
                keyboardType="numeric"
                placeholderTextColor={colors.text.muted}
              />

              {/* Quick Preset Buttons */}
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {[500, 1000, 2000, 5000].map((preset) => (
                  <Pressable
                    key={preset}
                    style={styles.presetChip}
                    onPress={() => setNewPayAmount(String(preset))}
                  >
                    <Text style={styles.presetChipText}>+₹{preset}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Discount Input */}
              <Text style={styles.inputLabel}>Balance Discount (Optional ₹)</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: `${colors.accent.success}60` }]}
                value={newPayDiscount}
                onChangeText={setNewPayDiscount}
                placeholder="Waiver / discount on pending balance"
                keyboardType="numeric"
                placeholderTextColor={colors.text.muted}
              />

              {/* Payment Method */}
              <Text style={styles.inputLabel}>Payment Method *</Text>
              <View style={styles.methodSelectorRow}>
                {["Cash", "UPI", "Bank Transfer", "Cheque", "Card"].map((m) => {
                  const active = newPayMethod === m;
                  return (
                    <Pressable
                      key={m}
                      style={[styles.methodSelectorBtn, active && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary }]}
                      onPress={() => setNewPayMethod(m)}
                    >
                      <Text style={[styles.methodSelectorBtnText, active && { color: "#FFFFFF" }]}>
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Money Collector */}
              {collectors && collectors.length > 0 && (
                <>
                  <Text style={styles.inputLabel}>Assign Money Collector (Optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <Pressable
                        style={[styles.collectorSelectChip, !newPayCollectorId && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary }]}
                        onPress={() => setNewPayCollectorId("")}
                      >
                        <Text style={[styles.collectorSelectChipText, !newPayCollectorId && { color: "#FFFFFF" }]}>
                          None / Direct
                        </Text>
                      </Pressable>
                      {collectors.map((col: any) => {
                        const isSelected = newPayCollectorId === col.id;
                        return (
                          <Pressable
                            key={col.id}
                            style={[styles.collectorSelectChip, isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary }]}
                            onPress={() => setNewPayCollectorId(col.id)}
                          >
                            <Text style={[styles.collectorSelectChipText, isSelected && { color: "#FFFFFF" }]}>
                              {col.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              )}

              {/* Payment Date */}
              <Text style={styles.inputLabel}>Payment Date *</Text>
              <Pressable
                style={styles.datePickerBtn}
                onPress={() => setIsNewPayCalendarOpen(true)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialIcons name="event" size={20} color={colors.accent.primary} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text.primary }}>
                    {formatDate(newPayDate)}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.primary }}>Change Date</Text>
              </Pressable>

              {/* Notes */}
              <Text style={styles.inputLabel}>Notes / Reference (Optional)</Text>
              <TextInput
                style={styles.modalInput}
                value={newPayNotes}
                onChangeText={setNewPayNotes}
                placeholder="e.g. Transaction ID, GPay reference"
                placeholderTextColor={colors.text.muted}
              />

              {/* Action buttons */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10, marginBottom: 20 }}>
                <Pressable
                  style={[styles.formActionBtn, styles.cancelBtn]}
                  onPress={() => setIsAddPaymentModalOpen(false)}
                  disabled={isSavingNewPayment}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.formActionBtn, styles.saveBtn, { backgroundColor: colors.accent.success }]}
                  onPress={handleSaveNewPayment}
                  disabled={isSavingNewPayment}
                >
                  {isSavingNewPayment ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Payment</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ========== "EDIT PAYMENT" MODAL ========== */}
      <Modal
        visible={isEditModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEditModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalFlexSpacer} onPress={() => setIsEditModalOpen(false)} />
          <View style={[styles.modalContent, { maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="edit" size={22} color={colors.accent.primary} />
                <Text style={styles.modalTitle}>Edit Payment Receipt</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsEditModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Amount Received (₹) *</Text>
              <TextInput
                style={styles.modalInput}
                value={editPayAmount}
                onChangeText={setEditPayAmount}
                placeholder="Enter amount"
                keyboardType="numeric"
                placeholderTextColor={colors.text.muted}
              />

              <Text style={styles.inputLabel}>Balance Discount (₹)</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: `${colors.accent.success}60` }]}
                value={editPayDiscount}
                onChangeText={setEditPayDiscount}
                placeholder="Enter discount"
                keyboardType="numeric"
                placeholderTextColor={colors.text.muted}
              />

              <Text style={styles.inputLabel}>Payment Method *</Text>
              <View style={styles.methodSelectorRow}>
                {["Cash", "UPI", "Bank Transfer", "Cheque", "Card"].map((m) => {
                  const active = editPayMethod === m;
                  return (
                    <Pressable
                      key={m}
                      style={[styles.methodSelectorBtn, active && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary }]}
                      onPress={() => setEditPayMethod(m)}
                    >
                      <Text style={[styles.methodSelectorBtnText, active && { color: "#FFFFFF" }]}>
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>Payment Date *</Text>
              <Pressable
                style={styles.datePickerBtn}
                onPress={() => setIsEditCalendarOpen(true)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialIcons name="event" size={20} color={colors.accent.primary} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text.primary }}>
                    {formatDate(editPayDate)}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.primary }}>Change Date</Text>
              </Pressable>

              <Text style={styles.inputLabel}>Notes / Reference (Optional)</Text>
              <TextInput
                style={styles.modalInput}
                value={editPayNotes}
                onChangeText={setEditPayNotes}
                placeholder="Notes"
                placeholderTextColor={colors.text.muted}
              />

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10, marginBottom: 20 }}>
                <Pressable
                  style={[styles.formActionBtn, styles.cancelBtn]}
                  onPress={() => setIsEditModalOpen(false)}
                  disabled={isSavingEditPayment}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.formActionBtn, styles.saveBtn, { backgroundColor: colors.accent.primary }]}
                  onPress={handleSaveEditPayment}
                  disabled={isSavingEditPayment}
                >
                  {isSavingEditPayment ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Update Payment</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ========== COMPREHENSIVE FILTER MODAL ========== */}
      <Modal
        visible={isFilterModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsFilterModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalFlexSpacer} onPress={() => setIsFilterModalOpen(false)} />
          <View style={[styles.modalContent, { maxHeight: "88%" }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="tune" size={22} color={colors.accent.primary} />
                <Text style={styles.modalTitle}>Filter & Sort Receipts</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsFilterModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Transaction Type */}
              <Text style={styles.filterSectionTitle}>Receipt Type</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {TRANSACTION_TYPES.map((t) => {
                  const isSelected = selectedType === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => setSelectedType(t.id)}
                      style={[
                        styles.filterChip,
                        isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                      ]}
                    >
                      <Text style={[styles.filterChipText, isSelected && { color: "#ffffff" }]}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Payment Method */}
              <Text style={styles.filterSectionTitle}>Payment Mode</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {PAYMENT_METHODS.map((method) => {
                  const isSelected = selectedMethod === method;
                  return (
                    <Pressable
                      key={method}
                      onPress={() => setSelectedMethod(method)}
                      style={[
                        styles.filterChip,
                        isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                      ]}
                    >
                      <Text style={[styles.filterChipText, isSelected && { color: "#ffffff" }]}>{method}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Amount Range */}
              <Text style={styles.filterSectionTitle}>Amount Range (₹)</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputSubLabel}>Min (₹)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={minAmount}
                    onChangeText={setMinAmount}
                    placeholder="e.g. 1000"
                    keyboardType="numeric"
                    placeholderTextColor={colors.text.muted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputSubLabel}>Max (₹)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={maxAmount}
                    onChangeText={setMaxAmount}
                    placeholder="e.g. 50000"
                    keyboardType="numeric"
                    placeholderTextColor={colors.text.muted}
                  />
                </View>
              </View>

              {/* Sort Order */}
              <Text style={styles.filterSectionTitle}>Sort By</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {[
                  { id: "newest", label: "Newest First" },
                  { id: "oldest", label: "Oldest First" },
                  { id: "amount_desc", label: "Amount: High to Low" },
                  { id: "amount_asc", label: "Amount: Low to High" },
                ].map((opt) => {
                  const isSelected = sortBy === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => setSortBy(opt.id as any)}
                      style={[
                        styles.filterChip,
                        isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                      ]}
                    >
                      <Text style={[styles.filterChipText, isSelected && { color: "#ffffff" }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Filter Modal Action Buttons */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                <Pressable
                  style={[styles.formActionBtn, styles.cancelBtn]}
                  onPress={resetAllFilters}
                >
                  <Text style={styles.cancelBtnText}>Reset All</Text>
                </Pressable>
                <Pressable
                  style={[styles.formActionBtn, styles.saveBtn, { backgroundColor: colors.accent.primary }]}
                  onPress={() => setIsFilterModalOpen(false)}
                >
                  <Text style={styles.saveBtnText}>Apply Filters ({activeFiltersCount})</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Date Pickers */}
      <EasyCalendarModal
        visible={calendarPickerTarget !== null}
        date={(calendarPickerTarget === "start" ? startDate : endDate) || new Date()}
        onSelectDate={(d) => {
          if (calendarPickerTarget === "start") {
            setStartDate(d);
            setCalendarPickerTarget("end");
          } else {
            setEndDate(d);
            setCalendarPickerTarget(null);
          }
        }}
        onClose={() => setCalendarPickerTarget(null)}
        title={calendarPickerTarget === "start" ? "Select Start Date" : "Select End Date"}
      />

      <EasyCalendarModal
        visible={isNewPayCalendarOpen}
        date={newPayDate}
        onSelectDate={(d) => {
          setNewPayDate(d);
          setIsNewPayCalendarOpen(false);
        }}
        onClose={() => setIsNewPayCalendarOpen(false)}
        title="Select Payment Date"
      />

      <EasyCalendarModal
        visible={isEditCalendarOpen}
        date={editPayDate}
        onSelectDate={(d) => {
          setEditPayDate(d);
          setIsEditCalendarOpen(false);
        }}
        onClose={() => setIsEditCalendarOpen(false)}
        title="Select Payment Date"
      />
    </AnimatedPage>
  );
}

const getStyles = (theme: any) => {
  const { colors, spacing, radius, shadows } = theme;

  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.text.muted,
      fontWeight: "600",
    },
    scrollContainer: {
      padding: 16,
      paddingBottom: 40,
    },
    header: {
      marginBottom: 16,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text.primary,
      letterSpacing: -0.5,
      marginTop: 4,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
    headerPrimaryBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.accent.success,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      shadowColor: colors.accent.success,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
    },
    headerPrimaryBtnText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 13,
    },
    headerSecondaryBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: `${colors.accent.primary}15`,
      borderColor: `${colors.accent.primary}40`,
      borderWidth: 1.5,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
    },
    headerSecondaryBtnText: {
      color: colors.accent.primary,
      fontWeight: "700",
      fontSize: 13,
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 14,
    },
    summaryCard: {
      flex: 1,
      minWidth: "47%",
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderLeftWidth: 4,
      shadowColor: "#000",
      shadowOpacity: 0.03,
      shadowRadius: 6,
      elevation: 2,
    },
    summaryLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    summaryValue: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
      marginTop: 4,
    },
    breakdownCard: {
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    breakdownTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    distributionBar: {
      flexDirection: "row",
      height: 8,
      borderRadius: 4,
      overflow: "hidden",
      backgroundColor: colors.border.subtle,
      marginBottom: 10,
    },
    breakdownRow: {
      flexDirection: "row",
      gap: 12,
    },
    breakdownItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.bg.primary,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    breakdownIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    breakdownMethodLabel: {
      fontSize: 10.5,
      color: colors.text.muted,
      fontWeight: "600",
    },
    breakdownAmount: {
      fontSize: 12.5,
      fontWeight: "700",
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.medium,
      paddingHorizontal: 12,
      height: 44,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: colors.text.primary,
    },
    filterToggleBtn: {
      width: 44,
      height: 44,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    filterBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      backgroundColor: colors.accent.danger,
      borderRadius: 9,
      minWidth: 18,
      height: 18,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    filterBadgeText: {
      color: "#ffffff",
      fontSize: 10,
      fontWeight: "800",
    },
    filterRow: {
      flexDirection: "row",
      gap: 6,
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 20,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.primary,
    },
    activePillsBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: `${colors.accent.primary}10`,
      borderRadius: 10,
      padding: 8,
      marginBottom: 10,
    },
    activePillsLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    activePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.bg.card,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    activePillText: {
      fontSize: 10.5,
      color: colors.text.secondary,
      fontWeight: "600",
    },
    clearAllBtn: {
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    clearAllBtnText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.accent.danger,
    },
    resultCount: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    paymentList: {
      gap: 10,
    },
    paymentCard: {
      flexDirection: "row",
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      shadowColor: "#000",
      shadowOpacity: 0.02,
      shadowRadius: 6,
      elevation: 1.5,
      alignItems: "center",
    },
    paymentCardPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
    paymentCardLeft: {
      marginRight: 10,
    },
    paymentMethodBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    paymentCardCenter: {
      flex: 1,
      marginRight: 8,
    },
    paymentCustomerName: {
      fontSize: 14.5,
      fontWeight: "700",
      color: colors.text.primary,
    },
    paymentMeta: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    sourceBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    sourceBadgeText: {
      fontSize: 9.5,
      fontWeight: "700",
    },
    collectorBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: "#8b5cf618",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    collectorBadgeText: {
      fontSize: 9.5,
      fontWeight: "700",
      color: "#8b5cf6",
    },
    paymentNotes: {
      fontSize: 10.5,
      color: colors.text.muted,
      fontStyle: "italic",
      marginTop: 3,
    },
    paymentCardRight: {
      alignItems: "flex-end",
    },
    paymentAmount: {
      fontSize: 15,
      fontWeight: "800",
    },
    methodTag: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      marginTop: 3,
    },
    methodTagText: {
      fontSize: 10,
      fontWeight: "700",
    },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg.card,
      borderRadius: 16,
      padding: 30,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginTop: 20,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 10,
    },
    emptyDesc: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: 4,
      lineHeight: 18,
    },
    resetCtaBtn: {
      marginTop: 14,
      backgroundColor: colors.accent.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
    },
    resetCtaBtnText: {
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "700",
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    modalFlexSpacer: {
      flex: 1,
    },
    modalContent: {
      backgroundColor: colors.bg.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 10,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      paddingBottom: 12,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.text.primary,
    },
    modalCloseBtn: {
      padding: 4,
    },
    receiptDetailsBox: {
      backgroundColor: colors.bg.primary,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      gap: 10,
    },
    receiptRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    receiptLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: "500",
    },
    receiptValue: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    modalActionPrimary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      elevation: 2,
    },
    modalActionPrimaryText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
    },
    modalActionSecondary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1.5,
      backgroundColor: colors.bg.card,
    },
    modalActionSecondaryText: {
      fontSize: 13,
      fontWeight: "700",
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
      marginBottom: 6,
    },
    inputSubLabel: {
      fontSize: 11,
      color: colors.text.muted,
      marginBottom: 4,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      fontSize: 14,
      color: colors.text.primary,
      backgroundColor: colors.bg.primary,
      marginBottom: 12,
    },
    customerSelectChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.medium,
    },
    customerSelectChipText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    customerSelectChipBal: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 2,
    },
    presetChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.medium,
    },
    presetChipText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    methodSelectorRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 12,
    },
    methodSelectorBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.medium,
    },
    methodSelectorBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.primary,
    },
    collectorSelectChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.medium,
    },
    collectorSelectChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.primary,
    },
    datePickerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    formActionBtn: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelBtn: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.medium,
    },
    cancelBtnText: {
      color: colors.text.secondary,
      fontWeight: "700",
      fontSize: 13,
    },
    saveBtn: {
      backgroundColor: colors.accent.primary,
    },
    saveBtnText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 13,
    },
    filterSectionTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 8,
    },
  });
};
