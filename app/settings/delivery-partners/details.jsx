import React, { useContext, useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { DeliveryPartnerContext } from "../../context/DeliveryPartnerContext";
import { OrderContext } from "../../context/OrderContext";
import { CustomerContext } from "../../context/CustomerContext";
import { PaymentContext } from "../../context/PaymentContext";
import { UserContext } from "../../context/UserContext";
import { DeliveryPartnerShareModal } from "../../../src/components/sharing/DeliveryPartnerShareModal";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import EasyCalendarModal from "../../components/EasyCalendarModal";
import { useTheme } from "../../context/ThemeContext";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  increment,
  where,
} from "firebase/firestore";
import { db, normalizeDateValue } from "../../../src/config/firebase";
import { getDocsOfflineSafe } from "../../../src/utils/offlineHelpers";

const BONUS_REASONS = [
  "Festival Bonus",
  "On-Time Delivery Bonus",
  "Long Distance Bonus",
  "Fuel / Maintenance Allowance",
  "High Volume Bonus",
  "Performance Reward",
  "Custom",
];

const VEHICLE_ICONS = {
  "Mini Truck": "local-shipping",
  "Pickup": "airport-shuttle",
  "Tractor": "agriculture",
  "Lorry": "rv-hookup",
  "Auto": "electric-rickshaw",
  "Other": "directions-car",
};

const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Other"];

const startOfDay = (d) => {
  const res = new Date(d);
  res.setHours(0, 0, 0, 0);
  return res;
};

const endOfDay = (d) => {
  const res = new Date(d);
  res.setHours(23, 59, 59, 999);
  return res;
};

function PartnerDetailsScreen() {
  const { theme } = useTheme();
  const { colors, isDark } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const {
    partners,
    deletePartner,
    logPartnerBonus,
    updatePartnerBonus,
    deletePartnerBonus,
    toggleFavoritePartner,
  } = useContext(DeliveryPartnerContext);

  const { orders } = useContext(OrderContext);
  const { customers } = useContext(CustomerContext) || { customers: [] };
  const { payments: generalCustomerPayments } = useContext(PaymentContext) || { payments: [] };
  const { profile: companyProfile } = useContext(UserContext) || {};

  const partner = useMemo(() => (partners || []).find((p) => p.id === id), [partners, id]);

  // Modals & Navigation States
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Active Tab: 'activity' | 'trips' | 'payments' | 'bonuses' | 'orders'
  const [activeTab, setActiveTab] = useState("activity");
  const [activitySubFilter, setActivitySubFilter] = useState("all"); // "all" | "trip" | "payment" | "repayment" | "bonus" | "order" | "cust_payment"
  const [activitySearch, setActivitySearch] = useState("");

  // Raw Firestore Data
  const [trips, setTrips] = useState([]);
  const [payments, setPayments] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [bonusesLoading, setBonusesLoading] = useState(true);

  // Period Date Filter state
  const [dateFilter, setDateFilter] = useState("all"); // "all" | "today" | "week" | "month" | "year" | "custom"
  const [customStart, setCustomStart] = useState(null);
  const [customEnd, setCustomEnd] = useState(null);

  // Shared Calendar Modal State
  const [calendarConfig, setCalendarConfig] = useState({
    visible: false,
    date: new Date(),
    title: "Select Date",
    onSelect: null,
  });

  const openCalendar = (currentDate, title, onSelect) => {
    setCalendarConfig({
      visible: true,
      date: currentDate instanceof Date ? currentDate : new Date(),
      title,
      onSelect,
    });
  };

  const closeCalendar = () => {
    setCalendarConfig((prev) => ({ ...prev, visible: false }));
  };

  // Record Payment Modal State (Disbursement / Advance to Driver)
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState(new Date());
  const [savingPayment, setSavingPayment] = useState(false);
  const [payError, setPayError] = useState("");

  // Repay Advance Modal State (Driver Returns Advance / Refund to Business)
  const [repayModalVisible, setRepayModalVisible] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState("Cash");
  const [repayNotes, setRepayNotes] = useState("");
  const [repayDate, setRepayDate] = useState(new Date());
  const [savingRepay, setSavingRepay] = useState(false);
  const [repayError, setRepayError] = useState("");

  // Add / Edit Bonus Modal State
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [isEditingBonus, setIsEditingBonus] = useState(false);
  const [selectedBonus, setSelectedBonus] = useState(null);
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusReason, setBonusReason] = useState("Festival Bonus");
  const [bonusCustomReason, setBonusCustomReason] = useState("");
  const [bonusNotes, setBonusNotes] = useState("");
  const [bonusDate, setBonusDate] = useState(new Date());
  const [savingBonus, setSavingBonus] = useState(false);
  const [bonusError, setBonusError] = useState("");
  const [deletingBonus, setDeletingBonus] = useState(false);

  // Add / Edit Trip Modal State
  const [showTripModal, setShowTripModal] = useState(false);
  const [isEditingTrip, setIsEditingTrip] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [tripCustomerName, setTripCustomerName] = useState("");
  const [tripCustomerId, setTripCustomerId] = useState(null);
  const [tripCharge, setTripCharge] = useState("");
  const [tripDeliveredItem, setTripDeliveredItem] = useState("");
  const [tripStatus, setTripStatus] = useState("Pending");
  const [tripNotes, setTripNotes] = useState("");
  const [tripDate, setTripDate] = useState(new Date());
  const [savingTrip, setSavingTrip] = useState(false);
  const [tripError, setTripError] = useState("");
  const [deletingTrip, setDeletingTrip] = useState(false);

  // Edit Payment Modal State
  const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [editPayAmount, setEditPayAmount] = useState("");
  const [editPayMethod, setEditPayMethod] = useState("Cash");
  const [editPayNotes, setEditPayNotes] = useState("");
  const [editPayDate, setEditPayDate] = useState(new Date());
  const [savingEditPayment, setSavingEditPayment] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState(false);

  // Date Filter Evaluator
  const isDateInSelectedFilter = useCallback(
    (dateVal) => {
      if (dateFilter === "all") return true;
      if (!dateVal) return false;

      const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
      if (isNaN(d.getTime())) return false;

      const now = new Date();

      if (dateFilter === "today") {
        return d >= startOfDay(now) && d <= endOfDay(now);
      }

      if (dateFilter === "week") {
        const day = now.getDay();
        const diffToMonday = (day === 0 ? -6 : 1) - day;
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);
        return d >= startOfDay(monday) && d <= endOfDay(now);
      }

      if (dateFilter === "month") {
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return d >= startOfDay(firstOfMonth) && d <= endOfDay(now);
      }

      if (dateFilter === "year") {
        const firstOfYear = new Date(now.getFullYear(), 0, 1);
        return d >= startOfDay(firstOfYear) && d <= endOfDay(now);
      }

      if (dateFilter === "custom") {
        const s = customStart ? startOfDay(customStart) : null;
        const e = customEnd ? endOfDay(customEnd) : null;
        if (s && e) return d >= s && d <= e;
        if (s) return d >= s;
        if (e) return d <= e;
        return true;
      }

      return true;
    },
    [dateFilter, customStart, customEnd]
  );

  // Subscribe to delivery trips
  useEffect(() => {
    if (!partner?.id) return;
    setTripsLoading(true);
    const tripsCollection = collection(db, "deliveryTrips");
    const q = query(tripsCollection, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbTrips = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
          };
        });
        setTrips(dbTrips);
        setTripsLoading(false);
      },
      (error) => {
        console.error("Failed to load delivery trips", error);
        setTripsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [partner?.id]);

  // Subscribe to delivery payments
  useEffect(() => {
    if (!partner?.id) return;
    setPaymentsLoading(true);
    const paymentsCollection = collection(db, "deliveryPayments");
    const q = query(paymentsCollection, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbPayments = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
          };
        });
        setPayments(dbPayments);
        setPaymentsLoading(false);
      },
      (error) => {
        console.error("Failed to load delivery payments", error);
        setPaymentsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [partner?.id]);

  // Subscribe to delivery partner bonuses
  useEffect(() => {
    if (!partner?.id) return;
    setBonusesLoading(true);
    const bonusesCollection = collection(db, "deliveryPartnerBonuses");
    const q = query(bonusesCollection, where("partnerId", "==", partner.id));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbBonuses = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
          };
        });
        dbBonuses.sort((a, b) => {
          const timeA = a.createdAt ? a.createdAt.getTime() : 0;
          const timeB = b.createdAt ? b.createdAt.getTime() : 0;
          return timeB - timeA;
        });
        setBonuses(dbBonuses);
        setBonusesLoading(false);
      },
      (error) => {
        console.error("Failed to load delivery partner bonuses", error);
        setBonusesLoading(false);
      }
    );
    return () => unsubscribe();
  }, [partner?.id]);

  // Filtered trips for partner
  const partnerTrips = useMemo(() => {
    if (!partner?.id) return [];
    const existingTripOrderIds = new Set(trips.map((t) => t.orderId).filter(Boolean));
    const orderByIdMap = new Map((orders || []).map((o) => [o.id, o]));

    const formatItemString = (obj) => {
      if (!obj) return "";
      if (obj.deliveredItem && String(obj.deliveredItem).trim()) return String(obj.deliveredItem).trim();
      if (obj.deliveredItems && String(obj.deliveredItems).trim()) return String(obj.deliveredItems).trim();
      if (Array.isArray(obj.items) && obj.items.length > 0) {
        if (obj.items.length === 1) {
          const itm = obj.items[0];
          const name = itm.itemName || itm.name || "Item";
          const qty = itm.quantity !== undefined ? itm.quantity : itm.qty;
          return qty ? `${name} (${Number(qty).toLocaleString("en-IN")} pcs)` : name;
        } else {
          return obj.items
            .map((itm) => {
              const name = itm.itemName || itm.name || "Item";
              const qty = itm.quantity !== undefined ? itm.quantity : itm.qty;
              return qty ? `${name} (${Number(qty).toLocaleString("en-IN")})` : name;
            })
            .join(", ");
        }
      }
      if (obj.itemName) {
        const qty = obj.quantity ? Number(obj.quantity).toLocaleString("en-IN") : "";
        return qty ? `${obj.itemName} (${qty} pcs)` : obj.itemName;
      }
      return "";
    };

    // Combine manual trips with orders dispatched to this partner (only completed orders)
    const orderTrips = (orders || [])
      .filter(
        (o) =>
          o.status === "completed" &&
          (o.deliveryPartnerId === partner.id || o.deliveryPartnerId === `partner_${partner.id}`) &&
          !existingTripOrderIds.has(o.id)
      )
      .map((o) => {
        const dt = o.createdAt instanceof Date ? o.createdAt : o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
        const charge = Number(o.shipmentCharge || o.deliveryRate || 0);
        return {
          id: `order-trip-${o.id}`,
          orderId: o.id,
          partnerId: partner.id,
          partnerName: partner.name,
          customerName: o.customerName || "Customer",
          deliveryCharge: charge,
          paymentStatus: Number(o.balanceDue || 0) <= 0 ? "Paid" : "Pending",
          notes: `Invoice #${o.id.slice(-6).toUpperCase()}`,
          createdAt: dt,
          deliveredItem: formatItemString(o),
          isAutoGenerated: true,
        };
      });

    const allCombined = [...trips.filter((t) => t.partnerId === partner.id), ...orderTrips];
    return allCombined
      .map((t) => {
        const linkedOrder = t.orderId ? orderByIdMap.get(t.orderId) : null;
        const itemText = formatItemString(t) || (linkedOrder ? formatItemString(linkedOrder) : "");
        return {
          ...t,
          deliveredItem: itemText,
        };
      })
      .filter((t) => isDateInSelectedFilter(t.createdAt));
  }, [trips, partner?.id, partner?.name, orders, isDateInSelectedFilter]);

  // Filtered payments for partner
  const partnerPayments = useMemo(() => {
    if (!partner?.id) return [];
    return payments
      .filter((p) => p.partnerId === partner.id)
      .filter((p) => isDateInSelectedFilter(p.createdAt));
  }, [payments, partner?.id, isDateInSelectedFilter]);

  // Filtered bonuses for partner
  const partnerBonuses = useMemo(() => {
    if (!partner?.id) return [];
    return bonuses
      .filter((b) => b.partnerId === partner.id)
      .filter((b) => isDateInSelectedFilter(b.createdAt));
  }, [bonuses, partner?.id, isDateInSelectedFilter]);

  // Orders Purchased by Delivery Partner as Customer
  const partnerCustomerOrders = useMemo(() => {
    if (!partner?.id) return [];
    return (orders || []).filter(
      (o) =>
        o.customerId === partner.id ||
        o.customerId === `partner_${partner.id}` ||
        o.customerId === `dp_${partner.id}`
    );
  }, [orders, partner?.id]);

  const filteredPartnerCustomerOrders = useMemo(() => {
    return partnerCustomerOrders.filter((o) => {
      const dt = o.createdAt instanceof Date ? o.createdAt : o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      return isDateInSelectedFilter(dt);
    });
  }, [partnerCustomerOrders, isDateInSelectedFilter]);

  // Customer Payments Paid by Partner for Product Invoices
  const partnerCustomerPayments = useMemo(() => {
    if (!partner?.id) return [];
    return (generalCustomerPayments || []).filter(
      (p) =>
        p.customerId === partner.id ||
        p.customerId === `partner_${partner.id}` ||
        p.customerId === `dp_${partner.id}`
    ).filter((p) => isDateInSelectedFilter(p.createdAt));
  }, [generalCustomerPayments, partner?.id, isDateInSelectedFilter]);

  const partnerOrderSummary = useMemo(() => {
    let totalOrderValue = 0;
    let totalOrderPaid = 0;
    let totalOrderDue = 0;
    let totalBricksCount = 0;

    filteredPartnerCustomerOrders.forEach((o) => {
      totalOrderValue += Number(o.total || 0);
      totalOrderPaid += Number(o.paidAmount || 0);
      totalOrderDue += Number(o.balanceDue || 0);

      const itemsList = o.items && o.items.length > 0 ? o.items : [o];
      itemsList.forEach((itm) => {
        totalBricksCount += Number(itm.quantity || 0);
      });
    });

    return {
      count: filteredPartnerCustomerOrders.length,
      totalBricks: totalBricksCount,
      totalValue: totalOrderValue,
      totalPaid: totalOrderPaid,
      totalDue: totalOrderDue,
    };
  }, [filteredPartnerCustomerOrders]);

  // Consolidated Chronological ALL Activity Ledger (Everything included!)
  const activityLedger = useMemo(() => {
    const entries = [];

    // 1. Delivery Trips
    partnerTrips.forEach((t) => {
      entries.push({
        id: `trip-${t.id}`,
        type: "trip",
        badgeText: "Delivery Trip",
        date: t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt),
        title: `Trip to ${t.customerName || "Customer"}`,
        subtitle: t.deliveredItem || (t.notes ? t.notes : "Delivery Trip"),
        amount: Number(t.deliveryCharge || 0),
        amountPrefix: "+",
        amountColor: "#2563eb",
        status: t.paymentStatus || "Pending",
        isPaid: t.paymentStatus === "Paid",
        raw: t,
      });
    });

    // 2. Delivery Bonuses
    partnerBonuses.forEach((b) => {
      entries.push({
        id: `bonus-${b.id}`,
        type: "bonus",
        badgeText: "Bonus Reward ⭐",
        date: b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt),
        title: `Bonus: ${b.reason || "Performance Reward"}`,
        subtitle: b.notes || "Awarded to delivery partner",
        amount: Number(b.amount || 0),
        amountPrefix: "+",
        amountColor: "#8b5cf6",
        status: "Earned",
        isPaid: true,
        raw: b,
      });
    });

    // 3. Driver Payments & Advance Repayments
    partnerPayments.forEach((p) => {
      const rawAmt = Number(p.amount || 0);
      const isRepayment = p.isRepayment || rawAmt < 0;
      const absAmt = Math.abs(rawAmt);

      if (isRepayment) {
        entries.push({
          id: `payment-${p.id}`,
          type: "repayment",
          badgeText: "Advance Repaid ↩️",
          date: p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt),
          title: `Advance Repaid (${p.paymentMethod || "Cash"})`,
          subtitle: p.notes || "Advance refunded by driver to business",
          amount: absAmt,
          amountPrefix: "+",
          amountColor: "#0d9488",
          status: "Repaid",
          isPaid: true,
          raw: p,
        });
      } else {
        entries.push({
          id: `payment-${p.id}`,
          type: "payment",
          badgeText: "Driver Payout 💸",
          date: p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt),
          title: `Payout: ${p.paymentMethod || "Cash"}`,
          subtitle: p.notes || "Disbursement paid to driver",
          amount: absAmt,
          amountPrefix: "-",
          amountColor: "#16a34a",
          status: "Paid",
          isPaid: true,
          raw: p,
        });
      }
    });

    // 4. Product Orders / Invoices Purchased by Partner as Customer
    filteredPartnerCustomerOrders.forEach((ord) => {
      const totalQty =
        ord.items && ord.items.length > 0
          ? ord.items.reduce((s, itm) => s + Number(itm.quantity || 0), 0)
          : Number(ord.quantity || 0);

      entries.push({
        id: `order-${ord.id}`,
        type: "order",
        badgeText: "Product Purchase 🛒",
        date: ord.createdAt instanceof Date ? ord.createdAt : new Date(ord.createdAt),
        title: `Invoice #${ord.id ? ord.id.slice(-6).toUpperCase() : ""}`,
        subtitle: `${totalQty.toLocaleString("en-IN")} Bricks${ord.itemName ? ` • ${ord.itemName}` : ""}`,
        amount: Number(ord.total || 0),
        amountPrefix: "",
        amountColor: colors.text.primary,
        status: ord.balanceDue > 0 ? `Due: ₹${Number(ord.balanceDue).toLocaleString("en-IN")}` : "Fully Paid",
        isPaid: ord.balanceDue <= 0,
        raw: ord,
      });
    });

    // 5. Customer Receipts Paid for Product Orders
    partnerCustomerPayments.forEach((cp) => {
      const amt = Number(cp.amountReceived || cp.amount || 0);
      entries.push({
        id: `cust-pay-${cp.id}`,
        type: "cust_payment",
        badgeText: "Order Receipt 💳",
        date: cp.createdAt instanceof Date ? cp.createdAt : new Date(cp.createdAt),
        title: `Order Receipt: ${cp.paymentMethod || "Cash"}`,
        subtitle: cp.notes || "Payment received for brick purchase",
        amount: amt,
        amountPrefix: "-",
        amountColor: "#0d9488",
        status: "Received",
        isPaid: true,
        raw: cp,
      });
    });

    // Sort descending by date
    entries.sort((a, b) => b.date.getTime() - a.date.getTime());
    return entries;
  }, [partnerTrips, partnerBonuses, partnerPayments, filteredPartnerCustomerOrders, partnerCustomerPayments, colors.text.primary]);

  // Filtered Activity Ledger by sub-filter & search
  const filteredActivityLedger = useMemo(() => {
    return activityLedger.filter((entry) => {
      if (activitySubFilter !== "all" && entry.type !== activitySubFilter) {
        return false;
      }
      if (activitySearch.trim()) {
        const query = activitySearch.toLowerCase().trim();
        const matchesTitle = entry.title.toLowerCase().includes(query);
        const matchesSubtitle = (entry.subtitle || "").toLowerCase().includes(query);
        const matchesBadge = (entry.badgeText || "").toLowerCase().includes(query);
        return matchesTitle || matchesSubtitle || matchesBadge;
      }
      return true;
    });
  }, [activityLedger, activitySubFilter, activitySearch]);

  // Counts for Sub-Filters
  const activityCounts = useMemo(() => {
    return {
      all: activityLedger.length,
      trip: activityLedger.filter((e) => e.type === "trip").length,
      payment: activityLedger.filter((e) => e.type === "payment" || e.type === "repayment").length,
      bonus: activityLedger.filter((e) => e.type === "bonus").length,
      order: activityLedger.filter((e) => e.type === "order").length,
      cust_payment: activityLedger.filter((e) => e.type === "cust_payment").length,
    };
  }, [activityLedger]);

  // Financial Totals
  const totalTripEarnings = useMemo(() => {
    return partnerTrips.reduce((sum, t) => sum + Number(t.deliveryCharge || 0), 0);
  }, [partnerTrips]);

  const totalBonusEarned = useMemo(() => {
    return partnerBonuses.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  }, [partnerBonuses]);

  const liveTotalPayable = useMemo(() => {
    return dateFilter === "all" ? Number(partner?.totalPayable || 0) : totalTripEarnings;
  }, [dateFilter, partner?.totalPayable, totalTripEarnings]);

  const liveTotalPaid = useMemo(() => {
    return dateFilter === "all"
      ? Number(partner?.totalPaid || 0)
      : partnerPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [dateFilter, partner?.totalPaid, partnerPayments]);

  const liveNetPending = useMemo(() => {
    return dateFilter === "all"
      ? Number(partner?.totalPending || 0)
      : liveTotalPayable + totalBonusEarned - liveTotalPaid;
  }, [dateFilter, partner?.totalPending, liveTotalPayable, totalBonusEarned, liveTotalPaid]);

  // Helpers
  const formatRateInfo = (type, rate, minRate) => {
    const rateVal = parseFloat(rate) || 0;
    const minVal = parseFloat(minRate) || 0;
    let label = "";
    if (type === "kilometre") label = `₹${rateVal.toFixed(2)} / KM`;
    else if (type === "per brick") label = `₹${rateVal.toFixed(2)} / Brick`;
    else label = `₹${rateVal.toFixed(2)} Fixed`;

    if (minVal > 0) {
      label += ` (Min: ₹${minVal.toFixed(2)})`;
    }
    return label;
  };

  const handleCall = () => {
    if (!partner?.mobile) {
      Alert.alert("No Phone Number", "This delivery partner does not have a phone number saved.");
      return;
    }
    Linking.openURL(`tel:${partner.mobile}`).catch(() => {
      Alert.alert("Error", "Could not open phone dialer.");
    });
  };

  const handleWhatsApp = () => {
    if (!partner?.mobile) {
      Alert.alert("No Phone Number", "This delivery partner does not have a phone number saved.");
      return;
    }
    const cleanPhone = partner.mobile.replace(/[^0-9]/g, "");
    const waUrl = `https://wa.me/${cleanPhone.length === 10 ? "91" + cleanPhone : cleanPhone}`;
    Linking.openURL(waUrl).catch(() => {
      Alert.alert("Error", "Could not launch WhatsApp.");
    });
  };

  // Reset Balance Handler
  const handleResetBalance = () => {
    if (!partner) return;
    setOptionsMenuVisible(false);
    Alert.alert(
      "Reset Balance",
      `Are you sure you want to reset the financial balance for "${partner.name}"? Total Payable, Total Paid, and Pending Balance will be set to ₹0.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset Balance",
          style: "destructive",
          onPress: async () => {
            try {
              const partnerRef = doc(db, "deliveryPartners", partner.id);
              await updateDoc(partnerRef, {
                totalPayable: 0,
                totalPaid: 0,
                totalPending: 0,
                updatedAt: new Date(),
              });
              Alert.alert("Success", `Financial balance for ${partner.name} has been reset to ₹0.`);
            } catch (err) {
              console.error("Failed to reset partner balance:", err);
              Alert.alert("Error", "Failed to reset partner balance. Please try again.");
            }
          },
        },
      ]
    );
  };

  // Delete Partner
  const handleDeletePartner = async () => {
    if (!partner) return;
    setDeleting(true);
    try {
      const ok = await deletePartner(partner.id);
      setDeleteModalVisible(false);
      if (ok) {
        router.push("/settings/delivery-partners");
      } else {
        Alert.alert("Error", "Failed to delete delivery partner from database.");
      }
    } catch (_e) {
      Alert.alert("Error", "An error occurred during deletion.");
    } finally {
      setDeleting(false);
    }
  };

  // Pay Modal Opener (Payment / Advance to Driver)
  const handleOpenPayModal = (presetAmount = null) => {
    setPayError("");
    setPayAmount(presetAmount !== null ? String(presetAmount) : "");
    setPayMethod("Cash");
    setPayNotes("");
    setPayDate(new Date());
    setPayModalVisible(true);
  };

  // Repay Advance Modal Opener (Driver Returns Advance / Refund to Business)
  const handleOpenRepayModal = () => {
    setRepayError("");
    const currentAdv = Number(partner?.totalPending || 0);
    const suggestedAmt = currentAdv < 0 ? String(Math.abs(currentAdv)) : "";
    setRepayAmount(suggestedAmt);
    setRepayMethod("Cash");
    setRepayNotes("");
    setRepayDate(new Date());
    setRepayModalVisible(true);
  };

  // Save Payment (Disbursement / Advance to Driver)
  const handleSavePayment = async () => {
    if (!partner) return;
    setPayError("");
    const payAmtNum = parseFloat(payAmount);
    if (isNaN(payAmtNum) || payAmtNum <= 0) {
      setPayError("Please enter a valid payment amount greater than zero.");
      return;
    }

    setSavingPayment(true);
    try {
      const currentPending = Number(partner.totalPending || 0);
      const isAdvancePayment = payAmtNum > Math.max(0, currentPending);
      const defaultNotes = isAdvancePayment
        ? `Advance Payment to ${partner.name}`
        : `Paid to ${partner.name}`;
      const effectiveNotes = payNotes.trim() || defaultNotes;

      // 1. Log payment document in deliveryPayments
      await addDoc(collection(db, "deliveryPayments"), {
        partnerId: partner.id,
        partnerName: partner.name,
        amount: payAmtNum,
        paymentMethod: payMethod,
        notes: effectiveNotes,
        createdAt: payDate,
      });

      // 2. Update partner totals in deliveryPartners collection
      const partnerRef = doc(db, "deliveryPartners", partner.id);
      await updateDoc(partnerRef, {
        totalPaid: increment(payAmtNum),
        totalPending: increment(-payAmtNum),
        updatedAt: new Date(),
      });

      // 3. Auto-update matching pending trips to "Paid"
      const tripsRef = collection(db, "deliveryTrips");
      const qTrips = query(
        tripsRef,
        where("partnerId", "==", partner.id),
        where("paymentStatus", "==", "Pending")
      );
      const tripSnap = await getDocsOfflineSafe(qTrips);
      const pendingTrips = tripSnap.docs.map((d) => ({ ref: d.ref, ...d.data() }));
      pendingTrips.sort((a, b) => {
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

      setPayModalVisible(false);
      Alert.alert("Success", `Payment of ₹${payAmtNum.toLocaleString("en-IN")} recorded!`);
    } catch (e) {
      console.error(e);
      setPayError(e.message || "Failed to record payment.");
    } finally {
      setSavingPayment(false);
    }
  };

  // Save Repay Advance (Driver Returns Advance / Refund to Business)
  const handleSaveRepayAdvance = async () => {
    if (!partner) return;
    setRepayError("");
    const repayAmtNum = parseFloat(repayAmount);
    if (isNaN(repayAmtNum) || repayAmtNum <= 0) {
      setRepayError("Please enter a valid repayment amount greater than zero.");
      return;
    }

    setSavingRepay(true);
    try {
      const defaultNotes = `Advance Repaid by ${partner.name}`;
      const effectiveNotes = repayNotes.trim() || defaultNotes;

      // 1. Log repayment document in deliveryPayments with negative amount / repayment flag
      await addDoc(collection(db, "deliveryPayments"), {
        partnerId: partner.id,
        partnerName: partner.name,
        amount: -repayAmtNum,
        isRepayment: true,
        type: "repayment",
        paymentMethod: repayMethod,
        notes: effectiveNotes,
        createdAt: repayDate,
      });

      // 2. Update partner totals in deliveryPartners collection
      const partnerRef = doc(db, "deliveryPartners", partner.id);
      await updateDoc(partnerRef, {
        totalPaid: increment(-repayAmtNum),
        totalPending: increment(repayAmtNum),
        updatedAt: new Date(),
      });

      setRepayModalVisible(false);
      Alert.alert(
        "Success",
        `Advance repayment of ₹${repayAmtNum.toLocaleString("en-IN")} recorded from ${partner.name}!`
      );
    } catch (e) {
      console.error(e);
      setRepayError(e.message || "Failed to record advance repayment.");
    } finally {
      setSavingRepay(false);
    }
  };

  // Add Trip Modal Opener
  const handleOpenAddTripModal = () => {
    setIsEditingTrip(false);
    setSelectedTrip(null);
    setTripError("");
    setTripCustomerName("");
    setTripCustomerId(null);
    const defaultRate = partner?.deliveryRate ? String(partner.deliveryRate) : "";
    setTripCharge(defaultRate);
    setTripDeliveredItem("");
    setTripStatus("Pending");
    setTripNotes("");
    setTripDate(new Date());
    setShowTripModal(true);
  };

  // Edit Trip Modal Opener
  const handleOpenEditTripModal = (trip) => {
    if (trip.isAutoGenerated) {
      Alert.alert(
        "Order Linked Trip",
        `This trip was automatically generated from Invoice #${trip.notes}. To edit its shipping charge, please update the linked Order.`,
        [
          { text: "Close", style: "cancel" },
          {
            text: "View Order",
            onPress: () => router.push({ pathname: "/orders", params: { highlightId: trip.orderId } }),
          },
        ]
      );
      return;
    }
    setIsEditingTrip(true);
    setSelectedTrip(trip);
    setTripError("");
    setTripCustomerName(trip.customerName || "");
    setTripCustomerId(trip.customerId || null);
    setTripCharge(String(trip.deliveryCharge || 0));
    setTripDeliveredItem(trip.deliveredItem || trip.deliveredItems || trip.itemName || "");
    setTripStatus(trip.paymentStatus || "Pending");
    setTripNotes(trip.notes || "");
    setTripDate(trip.createdAt instanceof Date ? trip.createdAt : new Date(trip.createdAt));
    setShowTripModal(true);
  };

  // Save Trip (Add or Edit)
  const handleSaveTrip = async () => {
    if (!partner) return;
    setTripError("");
    const chargeNum = parseFloat(tripCharge);
    if (isNaN(chargeNum) || chargeNum < 0) {
      setTripError("Please enter a valid delivery charge amount.");
      return;
    }

    setSavingTrip(true);
    try {
      const custName = tripCustomerName.trim() || "General Client";

      if (isEditingTrip && selectedTrip) {
        // Edit Mode
        const oldCharge = Number(selectedTrip.deliveryCharge || 0);
        const diff = chargeNum - oldCharge;

        await updateDoc(doc(db, "deliveryTrips", selectedTrip.id), {
          customerName: custName,
          deliveryCharge: chargeNum,
          deliveredItem: tripDeliveredItem.trim(),
          paymentStatus: tripStatus,
          notes: tripNotes.trim(),
          createdAt: tripDate,
          updatedAt: new Date(),
        });

        if (diff !== 0) {
          const partnerRef = doc(db, "deliveryPartners", partner.id);
          await updateDoc(partnerRef, {
            totalPayable: increment(diff),
            totalPending: increment(diff),
            updatedAt: new Date(),
          });
        }
        setShowTripModal(false);
        Alert.alert("Success", "Delivery trip record updated!");
      } else {
        // Add Mode
        const tripPayload = {
          partnerId: partner.id,
          partnerName: partner.name,
          customerName: custName,
          deliveryCharge: chargeNum,
          deliveredItem: tripDeliveredItem.trim(),
          paymentStatus: tripStatus,
          notes: tripNotes.trim(),
          createdAt: tripDate,
          updatedAt: new Date(),
        };
        if (tripCustomerId) {
          tripPayload.customerId = tripCustomerId;
        }

        await addDoc(collection(db, "deliveryTrips"), tripPayload);

        const partnerRef = doc(db, "deliveryPartners", partner.id);
        if (tripStatus === "Paid") {
          await updateDoc(partnerRef, {
            totalPayable: increment(chargeNum),
            totalPaid: increment(chargeNum),
            updatedAt: new Date(),
          });
        } else {
          await updateDoc(partnerRef, {
            totalPayable: increment(chargeNum),
            totalPending: increment(chargeNum),
            updatedAt: new Date(),
          });
        }

        setShowTripModal(false);
        Alert.alert("Success", `Delivery trip of ₹${chargeNum.toLocaleString("en-IN")} logged!`);
      }
    } catch (e) {
      console.error(e);
      setTripError(e.message || "Failed to save delivery trip.");
    } finally {
      setSavingTrip(false);
    }
  };

  // Delete Trip
  const handleDeleteTrip = () => {
    if (!selectedTrip || !partner) return;
    Alert.alert(
      "Delete Trip Record",
      `Are you sure you want to delete this trip record for "${selectedTrip.customerName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingTrip(true);
            try {
              const oldCharge = Number(selectedTrip.deliveryCharge || 0);
              await deleteDoc(doc(db, "deliveryTrips", selectedTrip.id));

              if (oldCharge > 0) {
                const partnerRef = doc(db, "deliveryPartners", partner.id);
                await updateDoc(partnerRef, {
                  totalPayable: increment(-oldCharge),
                  totalPending: increment(-oldCharge),
                  updatedAt: new Date(),
                });
              }

              setShowTripModal(false);
              setSelectedTrip(null);
              Alert.alert("Deleted", "Delivery trip record deleted.");
            } catch (e) {
              console.error(e);
              Alert.alert("Error", "Failed to delete trip record.");
            } finally {
              setDeletingTrip(false);
            }
          },
        },
      ]
    );
  };

  // Add Bonus Modal Opener
  const handleOpenAddBonusModal = () => {
    setIsEditingBonus(false);
    setSelectedBonus(null);
    setBonusError("");
    setBonusAmount("");
    setBonusReason("Festival Bonus");
    setBonusCustomReason("");
    setBonusNotes("");
    setBonusDate(new Date());
    setShowBonusModal(true);
  };

  // Edit Bonus Modal Opener
  const handleOpenEditBonusModal = (bonusItem) => {
    setIsEditingBonus(true);
    setSelectedBonus(bonusItem);
    setBonusError("");
    setBonusAmount(String(bonusItem.amount || ""));
    if (BONUS_REASONS.includes(bonusItem.reason)) {
      setBonusReason(bonusItem.reason);
      setBonusCustomReason("");
    } else {
      setBonusReason("Custom");
      setBonusCustomReason(bonusItem.reason || "");
    }
    setBonusNotes(bonusItem.notes || "");
    setBonusDate(bonusItem.createdAt instanceof Date ? bonusItem.createdAt : new Date(bonusItem.createdAt));
    setShowBonusModal(true);
  };

  // Save Bonus (Add or Edit)
  const handleSaveBonus = async () => {
    if (!partner) return;
    setBonusError("");
    const amtNum = parseFloat(bonusAmount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setBonusError("Please enter a valid bonus amount greater than zero.");
      return;
    }

    const finalReason = bonusReason === "Custom" ? bonusCustomReason.trim() || "Special Bonus" : bonusReason;

    setSavingBonus(true);
    try {
      if (isEditingBonus && selectedBonus) {
        const ok = await updatePartnerBonus(
          selectedBonus.id,
          partner.id,
          {
            amount: amtNum,
            reason: finalReason,
            notes: bonusNotes.trim(),
            createdAt: bonusDate,
          },
          selectedBonus
        );
        if (ok) {
          setShowBonusModal(false);
          Alert.alert("Success", "Bonus details updated successfully.");
        } else {
          setBonusError("Could not update bonus record.");
        }
      } else {
        const res = await logPartnerBonus(partner.id, {
          amount: amtNum,
          reason: finalReason,
          notes: bonusNotes.trim(),
          createdAt: bonusDate,
        });
        if (res) {
          setShowBonusModal(false);
          Alert.alert("Success", `₹${amtNum.toLocaleString("en-IN")} Bonus awarded to ${partner.name}!`);
        } else {
          setBonusError("Failed to record bonus. Please try again.");
        }
      }
    } catch (e) {
      console.error(e);
      setBonusError(e.message || "An unexpected error occurred.");
    } finally {
      setSavingBonus(false);
    }
  };

  // Delete Bonus
  const handleDeleteBonus = () => {
    if (!selectedBonus || !partner) return;
    Alert.alert(
      "Delete Bonus Record",
      `Are you sure you want to delete this ₹${Number(selectedBonus.amount || 0).toLocaleString("en-IN")} bonus entry?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingBonus(true);
            try {
              const ok = await deletePartnerBonus(selectedBonus.id, partner.id, selectedBonus);
              setShowBonusModal(false);
              setSelectedBonus(null);
              if (ok) {
                Alert.alert("Deleted", "Bonus record deleted.");
              } else {
                Alert.alert("Error", "Could not delete bonus record.");
              }
            } catch (e) {
              console.error(e);
              Alert.alert("Error", "An error occurred while deleting.");
            } finally {
              setDeletingBonus(false);
            }
          },
        },
      ]
    );
  };

  // Open Edit Payment Modal
  const handleOpenEditPayment = (payment) => {
    setSelectedPayment(payment);
    const absAmt = Math.abs(Number(payment.amount || 0));
    setEditPayAmount(String(absAmt || ""));
    setEditPayMethod(payment.paymentMethod || "Cash");
    setEditPayNotes(payment.notes || "");
    setEditPayDate(payment.createdAt instanceof Date ? payment.createdAt : new Date(payment.createdAt));
    setShowEditPaymentModal(true);
  };

  // Save Edit Payment
  const handleSaveEditPayment = async () => {
    if (!selectedPayment || !partner) return;
    const amountNum = parseFloat(editPayAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount greater than zero.");
      return;
    }

    setSavingEditPayment(true);
    try {
      const oldAmount = Number(selectedPayment.amount || 0);
      const isRepay = selectedPayment.isRepayment || oldAmount < 0;
      const newSignedAmount = isRepay ? -amountNum : amountNum;
      const diff = newSignedAmount - oldAmount;

      await updateDoc(doc(db, "deliveryPayments", selectedPayment.id), {
        amount: newSignedAmount,
        paymentMethod: editPayMethod,
        notes: editPayNotes.trim(),
        createdAt: editPayDate,
        updatedAt: new Date(),
      });

      if (diff !== 0) {
        const partnerRef = doc(db, "deliveryPartners", partner.id);
        await updateDoc(partnerRef, {
          totalPaid: increment(diff),
          totalPending: increment(-diff),
          updatedAt: new Date(),
        });
      }

      setShowEditPaymentModal(false);
      setSelectedPayment(null);
      Alert.alert("Success", "Payment record updated successfully.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to update payment record: " + e.message);
    } finally {
      setSavingEditPayment(false);
    }
  };

  // Delete Payment
  const handleDeletePayment = () => {
    if (!selectedPayment || !partner) return;
    const absVal = Math.abs(Number(selectedPayment.amount || 0));
    Alert.alert(
      "Delete Payment Record",
      `Are you sure you want to delete this payment record of ₹${absVal.toLocaleString("en-IN")}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingPayment(true);
            try {
              const oldAmount = Number(selectedPayment.amount || 0);
              await deleteDoc(doc(db, "deliveryPayments", selectedPayment.id));

              if (oldAmount !== 0) {
                const partnerRef = doc(db, "deliveryPartners", partner.id);
                await updateDoc(partnerRef, {
                  totalPaid: increment(-oldAmount),
                  totalPending: increment(oldAmount),
                  updatedAt: new Date(),
                });
              }

              setShowEditPaymentModal(false);
              setSelectedPayment(null);
              Alert.alert("Deleted", "Payment record deleted.");
            } catch (e) {
              console.error(e);
              Alert.alert("Error", "Failed to delete payment record.");
            } finally {
              setDeletingPayment(false);
            }
          },
        },
      ]
    );
  };

  // Handle tap on item in Activity Ledger
  const handleLedgerItemPress = (entry) => {
    if (entry.type === "trip") {
      handleOpenEditTripModal(entry.raw);
    } else if (entry.type === "bonus") {
      handleOpenEditBonusModal(entry.raw);
    } else if (entry.type === "payment" || entry.type === "repayment") {
      handleOpenEditPayment(entry.raw);
    } else if (entry.type === "order") {
      router.push({ pathname: "/orders", params: { highlightId: entry.raw.id } });
    } else if (entry.type === "cust_payment") {
      if (entry.raw.orderId) {
        router.push({ pathname: "/orders", params: { highlightId: entry.raw.orderId } });
      } else {
        Alert.alert(
          "Customer Order Receipt",
          `Receipt of ₹${Number(entry.raw.amountReceived || entry.raw.amount || 0).toLocaleString("en-IN")} received via ${entry.raw.paymentMethod || "Cash"}.\nNotes: ${entry.raw.notes || "None"}`
        );
      }
    }
  };

  if (!partner) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={colors.accent.danger} />
        <Text style={styles.errorTitle}>Partner Not Found</Text>
        <Text style={styles.errorDesc}>The delivery partner you are trying to view does not exist.</Text>
        <Pressable style={styles.backLink} onPress={() => router.push("/settings/delivery-partners")}>
          <Text style={styles.backLinkText}>Return to List</Text>
        </Pressable>
      </View>
    );
  }

  const isActive = partner.status === "Active";
  const vehicleIconName = VEHICLE_ICONS[partner.vehicleType] || "directions-car";

  return (
    <ProtectedRoute>
      <View style={styles.screenWrapper}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          {/* Top Bar Header */}
          <View style={styles.topHeader}>
            <BackButton label="Delivery Partners" onPress={() => router.push("/settings/delivery-partners")} />
            <View style={styles.headerRightActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.headerIconBtn,
                  partner.isFavorite && styles.headerIconBtnFav,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => toggleFavoritePartner(partner.id)}
                hitSlop={6}
              >
                <MaterialIcons
                  name={partner.isFavorite ? "star" : "star-border"}
                  size={20}
                  color={partner.isFavorite ? "#f59e0b" : colors.text.muted}
                />
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.headerIconBtn, pressed && styles.buttonPressed]}
                onPress={() => setShareModalVisible(true)}
                hitSlop={6}
              >
                <MaterialIcons name="share" size={19} color={colors.text.primary} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.headerIconBtn, pressed && styles.buttonPressed]}
                onPress={() =>
                  router.push({
                    pathname: "/settings/delivery-partners/edit",
                    params: { partnerId: partner.id },
                  })
                }
                hitSlop={6}
              >
                <MaterialIcons name="edit" size={19} color={colors.text.primary} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.headerIconBtn, pressed && styles.buttonPressed]}
                onPress={() => setOptionsMenuVisible(true)}
                hitSlop={6}
              >
                <MaterialIcons name="more-vert" size={20} color={colors.text.primary} />
              </Pressable>
            </View>
          </View>

          {/* Hero Driver Identity Card */}
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.avatarWrapper}>
                <MaterialIcons name={vehicleIconName} size={30} color={colors.accent.primary} />
                <View style={[styles.statusDot, isActive ? styles.statusDotActive : styles.statusDotInactive]} />
              </View>

              <View style={styles.heroNameCol}>
                <View style={styles.nameRow}>
                  <Text style={styles.heroName} numberOfLines={1}>
                    {partner.name}
                  </Text>
                  {partner.isFavorite && (
                    <View style={styles.preferredTag}>
                      <MaterialIcons name="star" size={11} color="#d97706" />
                      <Text style={styles.preferredTagText}>Preferred</Text>
                    </View>
                  )}
                </View>

                <View style={styles.rateBadge}>
                  <MaterialIcons name="local-offer" size={12} color={colors.accent.primary} />
                  <Text style={styles.rateBadgeText}>
                    {formatRateInfo(partner.deliveryRateType, partner.deliveryRate, partner.minimumRate)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Quick Driver Contact & Info Bar */}
            <View style={styles.driverInfoChipsRow}>
              {partner.vehicleNumber ? (
                <View style={styles.infoChip}>
                  <MaterialIcons name="directions-car" size={13} color={colors.text.secondary} />
                  <Text style={styles.infoChipText}>{partner.vehicleNumber}</Text>
                </View>
              ) : null}

              {partner.vehicleType ? (
                <View style={styles.infoChip}>
                  <MaterialIcons name="local-shipping" size={13} color={colors.text.secondary} />
                  <Text style={styles.infoChipText}>{partner.vehicleType}</Text>
                </View>
              ) : null}

              {partner.address ? (
                <View style={[styles.infoChip, { flexShrink: 1 }]}>
                  <MaterialIcons name="place" size={13} color={colors.text.secondary} />
                  <Text style={styles.infoChipText} numberOfLines={1}>
                    {partner.address}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Action Bar inside Hero (Call / WhatsApp / Share) */}
            <View style={styles.heroContactRow}>
              <Pressable
                style={({ pressed }) => [styles.contactBtn, styles.callBtn, pressed && styles.buttonPressed]}
                onPress={handleCall}
              >
                <MaterialIcons name="call" size={16} color="#ffffff" />
                <Text style={styles.callBtnText}>Call Driver</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.contactBtn, styles.waBtn, pressed && styles.buttonPressed]}
                onPress={handleWhatsApp}
              >
                <MaterialIcons name="chat" size={16} color="#ffffff" />
                <Text style={styles.waBtnText}>WhatsApp</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.contactBtn, styles.statementBtn, pressed && styles.buttonPressed]}
                onPress={() => setShareModalVisible(true)}
              >
                <MaterialIcons name="picture-as-pdf" size={16} color={colors.accent.primary} />
                <Text style={styles.statementBtnText}>Statement</Text>
              </Pressable>
            </View>
          </View>

          {/* Period Filter Bar */}
          <View style={styles.filterSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
              {[
                { id: "all", label: "All Time" },
                { id: "today", label: "Today" },
                { id: "week", label: "This Week" },
                { id: "month", label: "This Month" },
                { id: "year", label: "This Year" },
                { id: "custom", label: "Custom Range" },
              ].map((f) => {
                const active = dateFilter === f.id;
                return (
                  <Pressable
                    key={f.id}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    onPress={() => setDateFilter(f.id)}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {dateFilter === "custom" && (
              <View style={styles.customDateRow}>
                <Pressable
                  style={styles.datePickerBtn}
                  onPress={() =>
                    openCalendar(customStart || new Date(), "Select Start Date", (d) => setCustomStart(d))
                  }
                >
                  <MaterialIcons name="event" size={15} color={colors.accent.primary} />
                  <Text style={styles.datePickerBtnText}>
                    From: {customStart ? customStart.toLocaleDateString("en-IN") : "Select"}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.datePickerBtn}
                  onPress={() =>
                    openCalendar(customEnd || new Date(), "Select End Date", (d) => setCustomEnd(d))
                  }
                >
                  <MaterialIcons name="event" size={15} color={colors.accent.primary} />
                  <Text style={styles.datePickerBtnText}>
                    To: {customEnd ? customEnd.toLocaleDateString("en-IN") : "Select"}
                  </Text>
                </Pressable>

                {(customStart || customEnd) && (
                  <Pressable
                    style={styles.clearCustomBtn}
                    onPress={() => {
                      setCustomStart(null);
                      setCustomEnd(null);
                    }}
                  >
                    <MaterialIcons name="clear" size={16} color={colors.accent.danger} />
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* Financial Summary Card with Pay Driver & Repay Advance Buttons */}
          <View style={styles.balanceHeroCard}>
            <View style={styles.balanceMainRow}>
              <View style={styles.balanceLeftCol}>
                <Text style={styles.balanceSubheader}>
                  {liveNetPending > 0
                    ? "Net Payable to Partner"
                    : liveNetPending < 0
                    ? "Advance Paid to Partner"
                    : "Account Balance"}
                </Text>
                <Text
                  style={[
                    styles.balanceBigNumber,
                    {
                      color:
                        liveNetPending > 0
                          ? colors.accent.danger
                          : liveNetPending < 0
                          ? "#16a34a"
                          : colors.text.primary,
                    },
                  ]}
                >
                  ₹{Math.abs(liveNetPending).toLocaleString("en-IN")}
                </Text>
                <Text style={styles.balanceStatusNote}>
                  {liveNetPending > 0
                    ? "⚠️ Pending settlement"
                    : liveNetPending < 0
                    ? "✨ Driver holds advance credit"
                    : "✅ Fully settled"}
                </Text>
              </View>

              {/* Side-by-side action buttons: Pay Driver & Repay Advance */}
              <View style={styles.balanceActionsGroup}>
                <Pressable
                  style={({ pressed }) => [styles.payHeroButton, pressed && styles.buttonPressed]}
                  onPress={() => handleOpenPayModal(liveNetPending > 0 ? liveNetPending : null)}
                >
                  <MaterialIcons name="payment" size={16} color="#ffffff" />
                  <Text style={styles.payHeroButtonText}>
                    {liveNetPending > 0 ? "Pay Due" : "Pay Driver"}
                  </Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.repayHeroButton, pressed && styles.buttonPressed]}
                  onPress={handleOpenRepayModal}
                >
                  <MaterialIcons name="replay" size={16} color="#ffffff" />
                  <Text style={styles.repayHeroButtonText}>Repay Advance</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.metricsDivider} />

            {/* 3 Metric Tiles */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricTile}>
                <View style={styles.metricHeaderRow}>
                  <MaterialIcons name="local-shipping" size={15} color="#2563eb" />
                  <Text style={styles.metricLabel}>Trips Earned</Text>
                </View>
                <Text style={[styles.metricValue, { color: "#2563eb" }]}>
                  ₹{liveTotalPayable.toLocaleString("en-IN")}
                </Text>
                <Text style={styles.metricCountText}>{partnerTrips.length} trips</Text>
              </View>

              <View style={styles.metricTile}>
                <View style={styles.metricHeaderRow}>
                  <MaterialIcons name="stars" size={15} color="#8b5cf6" />
                  <Text style={styles.metricLabel}>Bonuses</Text>
                </View>
                <Text style={[styles.metricValue, { color: "#8b5cf6" }]}>
                  ₹{totalBonusEarned.toLocaleString("en-IN")}
                </Text>
                <Text style={styles.metricCountText}>{partnerBonuses.length} rewards</Text>
              </View>

              <View style={styles.metricTile}>
                <View style={styles.metricHeaderRow}>
                  <MaterialIcons name="check-circle" size={15} color="#16a34a" />
                  <Text style={styles.metricLabel}>Total Paid</Text>
                </View>
                <Text style={[styles.metricValue, { color: "#16a34a" }]}>
                  ₹{liveTotalPaid.toLocaleString("en-IN")}
                </Text>
                <Text style={styles.metricCountText}>{partnerPayments.length} payouts</Text>
              </View>
            </View>
          </View>

          {/* Quick Action Buttons Row */}
          <View style={styles.quickActionRow}>
            <Pressable
              style={({ pressed }) => [styles.quickActionBtn, styles.qaTrip, pressed && styles.buttonPressed]}
              onPress={handleOpenAddTripModal}
            >
              <MaterialIcons name="local-shipping" size={16} color="#16a34a" />
              <Text style={styles.qaTripText}>+ Log Trip</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.quickActionBtn, styles.qaBonus, pressed && styles.buttonPressed]}
              onPress={handleOpenAddBonusModal}
            >
              <MaterialIcons name="stars" size={16} color="#8b5cf6" />
              <Text style={styles.qaBonusText}>+ Bonus</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.quickActionBtn, styles.qaPay, pressed && styles.buttonPressed]}
              onPress={() => handleOpenPayModal(null)}
            >
              <MaterialIcons name="add-card" size={16} color="#2563eb" />
              <Text style={styles.qaPayText}>+ Pay</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.quickActionBtn, styles.qaRepay, pressed && styles.buttonPressed]}
              onPress={handleOpenRepayModal}
            >
              <MaterialIcons name="replay" size={16} color="#0d9488" />
              <Text style={styles.qaRepayText}>Repay</Text>
            </Pressable>
          </View>

          {/* Segmented Navigation Tabs */}
          <View style={styles.tabsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
              <Pressable
                style={[styles.tabItem, activeTab === "activity" && styles.tabItemActive]}
                onPress={() => setActiveTab("activity")}
              >
                <MaterialIcons
                  name="list-alt"
                  size={16}
                  color={activeTab === "activity" ? colors.accent.primary : colors.text.muted}
                />
                <Text style={[styles.tabText, activeTab === "activity" && styles.tabTextActive]}>
                  All Activity
                </Text>
                <View style={[styles.tabBadge, activeTab === "activity" && styles.tabBadgeActive]}>
                  <Text
                    style={[styles.tabBadgeText, activeTab === "activity" && styles.tabBadgeTextActive]}
                  >
                    {activityLedger.length}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={[styles.tabItem, activeTab === "trips" && styles.tabItemActive]}
                onPress={() => setActiveTab("trips")}
              >
                <MaterialIcons
                  name="local-shipping"
                  size={16}
                  color={activeTab === "trips" ? "#16a34a" : colors.text.muted}
                />
                <Text style={[styles.tabText, activeTab === "trips" && styles.tabTextActive]}>
                  Trips
                </Text>
                <View style={[styles.tabBadge, activeTab === "trips" && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, activeTab === "trips" && styles.tabBadgeTextActive]}>
                    {partnerTrips.length}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={[styles.tabItem, activeTab === "payments" && styles.tabItemActive]}
                onPress={() => setActiveTab("payments")}
              >
                <MaterialIcons
                  name="payment"
                  size={16}
                  color={activeTab === "payments" ? "#2563eb" : colors.text.muted}
                />
                <Text style={[styles.tabText, activeTab === "payments" && styles.tabTextActive]}>
                  Payments
                </Text>
                <View style={[styles.tabBadge, activeTab === "payments" && styles.tabBadgeActive]}>
                  <Text
                    style={[styles.tabBadgeText, activeTab === "payments" && styles.tabBadgeTextActive]}
                  >
                    {partnerPayments.length}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={[styles.tabItem, activeTab === "bonuses" && styles.tabItemActive]}
                onPress={() => setActiveTab("bonuses")}
              >
                <MaterialIcons
                  name="stars"
                  size={16}
                  color={activeTab === "bonuses" ? "#8b5cf6" : colors.text.muted}
                />
                <Text style={[styles.tabText, activeTab === "bonuses" && styles.tabTextActive]}>
                  Bonuses
                </Text>
                <View style={[styles.tabBadge, activeTab === "bonuses" && styles.tabBadgeActive]}>
                  <Text
                    style={[styles.tabBadgeText, activeTab === "bonuses" && styles.tabBadgeTextActive]}
                  >
                    {partnerBonuses.length}
                  </Text>
                </View>
              </Pressable>

              {filteredPartnerCustomerOrders.length > 0 && (
                <Pressable
                  style={[styles.tabItem, activeTab === "orders" && styles.tabItemActive]}
                  onPress={() => setActiveTab("orders")}
                >
                  <MaterialIcons
                    name="shopping-bag"
                    size={16}
                    color={activeTab === "orders" ? "#ea580c" : colors.text.muted}
                  />
                  <Text style={[styles.tabText, activeTab === "orders" && styles.tabTextActive]}>
                    Purchases
                  </Text>
                  <View style={[styles.tabBadge, activeTab === "orders" && styles.tabBadgeActive]}>
                    <Text
                      style={[styles.tabBadgeText, activeTab === "orders" && styles.tabBadgeTextActive]}
                    >
                      {filteredPartnerCustomerOrders.length}
                    </Text>
                  </View>
                </Pressable>
              )}
            </ScrollView>
          </View>

          {/* TAB CONTENTS */}

          {/* TAB 1: ALL ACTIVITY (CONSOLIDATED COMPLETE LEDGER) */}
          {activeTab === "activity" && (
            <View style={styles.tabContentArea}>
              {/* Activity Sub-Filter Pills & Search */}
              <View style={styles.activityToolbar}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subFilterScroll}
                >
                  {[
                    { id: "all", label: `All (${activityCounts.all})` },
                    { id: "trip", label: `🚚 Trips (${activityCounts.trip})` },
                    { id: "payment", label: `💸 Payouts (${activityCounts.payment})` },
                    { id: "bonus", label: `⭐ Bonuses (${activityCounts.bonus})` },
                    ...(activityCounts.order > 0
                      ? [{ id: "order", label: `🛒 Purchases (${activityCounts.order})` }]
                      : []),
                    ...(activityCounts.cust_payment > 0
                      ? [{ id: "cust_payment", label: `💳 Receipts (${activityCounts.cust_payment})` }]
                      : []),
                  ].map((sub) => {
                    const active = activitySubFilter === sub.id;
                    return (
                      <Pressable
                        key={sub.id}
                        style={[styles.subFilterPill, active && styles.subFilterPillActive]}
                        onPress={() => setActivitySubFilter(sub.id)}
                      >
                        <Text style={[styles.subFilterText, active && styles.subFilterTextActive]}>
                          {sub.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Quick Search */}
                {activityLedger.length > 5 && (
                  <View style={styles.activitySearchBox}>
                    <MaterialIcons name="search" size={16} color={colors.text.muted} />
                    <TextInput
                      style={styles.activitySearchInput}
                      value={activitySearch}
                      onChangeText={setActivitySearch}
                      placeholder="Search activity records..."
                      placeholderTextColor={colors.text.muted}
                    />
                    {activitySearch ? (
                      <Pressable onPress={() => setActivitySearch("")}>
                        <MaterialIcons name="close" size={16} color={colors.text.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>

              {tripsLoading || paymentsLoading || bonusesLoading ? (
                <ActivityIndicator size="small" color={colors.accent.primary} style={{ padding: 24 }} />
              ) : filteredActivityLedger.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="event-note" size={40} color={colors.border.medium} />
                  <Text style={styles.emptyTitle}>No Matching Activity Found</Text>
                  <Text style={styles.emptyDesc}>
                    {activitySearch || activitySubFilter !== "all"
                      ? "No records match your active sub-filter or search query."
                      : "No delivery trips, bonuses, or payments recorded for this time range."}
                  </Text>
                  {activitySearch || activitySubFilter !== "all" ? (
                    <Pressable
                      style={styles.emptyActionBtn}
                      onPress={() => {
                        setActivitySubFilter("all");
                        setActivitySearch("");
                      }}
                    >
                      <Text style={styles.emptyActionBtnText}>Clear Filter</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.emptyActionBtn} onPress={handleOpenAddTripModal}>
                      <MaterialIcons name="add" size={16} color="#ffffff" />
                      <Text style={styles.emptyActionBtnText}>Log New Trip</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <View style={styles.ledgerList}>
                  {filteredActivityLedger.map((entry) => {
                    const isTrip = entry.type === "trip";
                    const isBonus = entry.type === "bonus";
                    const isPayment = entry.type === "payment";
                    const isRepayment = entry.type === "repayment";
                    const isOrder = entry.type === "order";
                    const isCustPayment = entry.type === "cust_payment";

                    const badgeColor = isTrip
                      ? "#2563eb"
                      : isBonus
                      ? "#8b5cf6"
                      : isPayment
                      ? "#16a34a"
                      : isRepayment
                      ? "#0d9488"
                      : isOrder
                      ? "#ea580c"
                      : "#0d9488";

                    const badgeBg = `${badgeColor}15`;

                    const iconName = isTrip
                      ? "local-shipping"
                      : isBonus
                      ? "stars"
                      : isPayment
                      ? "payment"
                      : isRepayment
                      ? "replay"
                      : isOrder
                      ? "shopping-bag"
                      : "account-balance-wallet";

                    return (
                      <Pressable
                        key={entry.id}
                        style={({ pressed }) => [styles.ledgerCard, pressed && styles.cardPressed]}
                        onPress={() => handleLedgerItemPress(entry)}
                      >
                        <View style={[styles.ledgerIconCircle, { backgroundColor: badgeBg }]}>
                          <MaterialIcons name={iconName} size={18} color={badgeColor} />
                        </View>

                        <View style={styles.ledgerDetailsCol}>
                          <View style={styles.ledgerHeaderRow}>
                            <Text style={styles.ledgerTitle} numberOfLines={1}>
                              {entry.title}
                            </Text>
                            <Text
                              style={[
                                styles.ledgerAmount,
                                { color: entry.amountColor || colors.text.primary },
                              ]}
                            >
                              {entry.amountPrefix ? `${entry.amountPrefix} ` : ""}₹
                              {entry.amount.toLocaleString("en-IN")}
                            </Text>
                          </View>

                          <View style={styles.ledgerSubRow}>
                            <Text style={styles.ledgerSubtitle} numberOfLines={1}>
                              {entry.subtitle}
                            </Text>
                            <Text style={styles.ledgerDate}>
                              {entry.date.toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </Text>
                          </View>

                          <View style={styles.ledgerTagRow}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <View style={[styles.activityTypeBadge, { backgroundColor: badgeBg }]}>
                                <Text style={[styles.activityTypeBadgeText, { color: badgeColor }]}>
                                  {entry.badgeText}
                                </Text>
                              </View>

                              <View
                                style={[
                                  styles.statusPill,
                                  entry.isPaid ? styles.statusPillPaid : styles.statusPillPending,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.statusPillText,
                                    entry.isPaid ? styles.statusPillTextPaid : styles.statusPillTextPending,
                                  ]}
                                >
                                  {entry.status}
                                </Text>
                              </View>
                            </View>

                            <Text style={styles.tapToEditHint}>
                              {isOrder ? "View Order ›" : "Tap to edit ›"}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* TAB 2: DELIVERY TRIPS */}
          {activeTab === "trips" && (
            <View style={styles.tabContentArea}>
              <View style={styles.tabHeaderRow}>
                <Text style={styles.tabSectionTitle}>
                  Delivery Trips ({partnerTrips.length})
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.tabAddButton, pressed && styles.buttonPressed]}
                  onPress={handleOpenAddTripModal}
                >
                  <MaterialIcons name="add" size={16} color="#16a34a" />
                  <Text style={styles.tabAddButtonText}>+ Add Trip</Text>
                </Pressable>
              </View>

              {tripsLoading ? (
                <ActivityIndicator size="small" color="#16a34a" style={{ padding: 24 }} />
              ) : partnerTrips.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="local-shipping" size={40} color={colors.border.medium} />
                  <Text style={styles.emptyTitle}>No Delivery Trips Recorded</Text>
                  <Text style={styles.emptyDesc}>
                    Log trips to record deliveries, shipment charges, and track pending driver balances.
                  </Text>
                  <Pressable style={styles.emptyActionBtn} onPress={handleOpenAddTripModal}>
                    <MaterialIcons name="add" size={16} color="#ffffff" />
                    <Text style={styles.emptyActionBtnText}>Log First Trip</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.ledgerList}>
                  {partnerTrips.map((trip) => {
                    const isPaid = trip.paymentStatus === "Paid";
                    const tripDateObj = trip.createdAt instanceof Date ? trip.createdAt : new Date(trip.createdAt);

                    return (
                      <Pressable
                        key={trip.id}
                        style={({ pressed }) => [styles.ledgerCard, pressed && styles.cardPressed]}
                        onPress={() => handleOpenEditTripModal(trip)}
                      >
                        <View
                          style={[
                            styles.ledgerIconCircle,
                            { backgroundColor: isPaid ? "#dcfce7" : "#fee2e2" },
                          ]}
                        >
                          <MaterialIcons
                            name="local-shipping"
                            size={18}
                            color={isPaid ? "#16a34a" : colors.accent.danger}
                          />
                        </View>

                        <View style={styles.ledgerDetailsCol}>
                          <View style={styles.ledgerHeaderRow}>
                            <Text style={styles.ledgerTitle} numberOfLines={1}>
                              {trip.customerName || "Customer"}
                            </Text>
                            <Text style={[styles.ledgerAmount, { color: colors.text.primary }]}>
                              ₹{Number(trip.deliveryCharge || 0).toLocaleString("en-IN")}
                            </Text>
                          </View>

                          {trip.deliveredItem ? (
                            <View style={styles.itemTagRow}>
                              <MaterialIcons name="inventory-2" size={12} color={colors.text.secondary} />
                              <Text style={styles.itemTagText} numberOfLines={1}>
                                {trip.deliveredItem}
                              </Text>
                            </View>
                          ) : null}

                          <View style={styles.ledgerSubRow}>
                            <Text style={styles.ledgerSubtitle} numberOfLines={1}>
                              {trip.notes ? trip.notes : `Trip logged on ${tripDateObj.toLocaleDateString("en-IN")}`}
                            </Text>
                            <Text style={styles.ledgerDate}>
                              {tripDateObj.toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </Text>
                          </View>

                          <View style={styles.ledgerTagRow}>
                            <View
                              style={[
                                styles.statusPill,
                                isPaid ? styles.statusPillPaid : styles.statusPillPending,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusPillText,
                                  isPaid ? styles.statusPillTextPaid : styles.statusPillTextPending,
                                ]}
                              >
                                {trip.paymentStatus || "Pending"}
                              </Text>
                            </View>
                            {trip.isAutoGenerated && (
                              <View style={styles.autoBadge}>
                                <Text style={styles.autoBadgeText}>Invoice Generated</Text>
                              </View>
                            )}
                            <Text style={styles.tapToEditHint}>Tap to Edit ✏️</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* TAB 3: PAYMENTS */}
          {activeTab === "payments" && (
            <View style={styles.tabContentArea}>
              <View style={styles.tabHeaderRow}>
                <Text style={styles.tabSectionTitle}>
                  Payments & Advances ({partnerPayments.length})
                </Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Pressable
                    style={({ pressed }) => [styles.tabAddButton, { backgroundColor: "#0d948815", borderColor: "#0d948835" }, pressed && styles.buttonPressed]}
                    onPress={handleOpenRepayModal}
                  >
                    <MaterialIcons name="replay" size={15} color="#0d9488" />
                    <Text style={[styles.tabAddButtonText, { color: "#0d9488" }]}>Repay</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.tabAddButton, pressed && styles.buttonPressed]}
                    onPress={() => handleOpenPayModal(null)}
                  >
                    <MaterialIcons name="payment" size={15} color="#16a34a" />
                    <Text style={styles.tabAddButtonText}>+ Pay</Text>
                  </Pressable>
                </View>
              </View>

              {paymentsLoading ? (
                <ActivityIndicator size="small" color="#16a34a" style={{ padding: 24 }} />
              ) : partnerPayments.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="payment" size={40} color={colors.border.medium} />
                  <Text style={styles.emptyTitle}>No Payments Recorded</Text>
                  <Text style={styles.emptyDesc}>
                    Disbursements, advances, and advance refunds for this partner will show up here.
                  </Text>
                  <Pressable
                    style={styles.emptyActionBtn}
                    onPress={() => handleOpenPayModal(null)}
                  >
                    <MaterialIcons name="payment" size={16} color="#ffffff" />
                    <Text style={styles.emptyActionBtnText}>Record Payment</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.ledgerList}>
                  {partnerPayments.map((payment) => {
                    const rawAmt = Number(payment.amount || 0);
                    const isRepay = payment.isRepayment || rawAmt < 0;
                    const absAmt = Math.abs(rawAmt);
                    const payDateObj = payment.createdAt instanceof Date ? payment.createdAt : new Date(payment.createdAt);

                    return (
                      <Pressable
                        key={payment.id}
                        style={({ pressed }) => [styles.ledgerCard, pressed && styles.cardPressed]}
                        onPress={() => handleOpenEditPayment(payment)}
                      >
                        <View style={[styles.ledgerIconCircle, { backgroundColor: isRepay ? "#0d948818" : "#dcfce7" }]}>
                          <MaterialIcons name={isRepay ? "replay" : "payment"} size={18} color={isRepay ? "#0d9488" : "#16a34a"} />
                        </View>

                        <View style={styles.ledgerDetailsCol}>
                          <View style={styles.ledgerHeaderRow}>
                            <Text style={styles.ledgerTitle}>
                              {isRepay ? "Advance Repaid by Driver" : "Payment Disbursed"}
                            </Text>
                            <Text style={[styles.ledgerAmount, { color: isRepay ? "#0d9488" : "#16a34a" }]}>
                              {isRepay ? "+ " : "- "}₹{absAmt.toLocaleString("en-IN")}
                            </Text>
                          </View>

                          <View style={styles.ledgerSubRow}>
                            <Text style={styles.ledgerSubtitle} numberOfLines={1}>
                              {payment.notes ? payment.notes : isRepay ? "Advance returned to business" : `Paid via ${payment.paymentMethod || "Cash"}`}
                            </Text>
                            <Text style={styles.ledgerDate}>
                              {payDateObj.toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </Text>
                          </View>

                          <View style={styles.ledgerTagRow}>
                            <View style={styles.methodChip}>
                              <Text style={styles.methodChipText}>
                                {payment.paymentMethod || "Cash"}
                              </Text>
                            </View>
                            <Text style={styles.tapToEditHint}>Tap to Edit ✏️</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* TAB 4: BONUSES */}
          {activeTab === "bonuses" && (
            <View style={styles.tabContentArea}>
              <View style={styles.tabHeaderRow}>
                <Text style={styles.tabSectionTitle}>
                  Bonus Rewards ({partnerBonuses.length})
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.tabAddButton, pressed && styles.buttonPressed]}
                  onPress={handleOpenAddBonusModal}
                >
                  <MaterialIcons name="stars" size={16} color="#8b5cf6" />
                  <Text style={[styles.tabAddButtonText, { color: "#8b5cf6" }]}>+ Award Bonus</Text>
                </Pressable>
              </View>

              {bonusesLoading ? (
                <ActivityIndicator size="small" color="#8b5cf6" style={{ padding: 24 }} />
              ) : partnerBonuses.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="stars" size={40} color={colors.border.medium} />
                  <Text style={styles.emptyTitle}>No Bonuses Awarded Yet</Text>
                  <Text style={styles.emptyDesc}>
                    Incentivize on-time deliveries, festival bonuses, and fuel allowances for this partner.
                  </Text>
                  <Pressable
                    style={[styles.emptyActionBtn, { backgroundColor: "#8b5cf6" }]}
                    onPress={handleOpenAddBonusModal}
                  >
                    <MaterialIcons name="stars" size={16} color="#ffffff" />
                    <Text style={styles.emptyActionBtnText}>Award First Bonus</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.ledgerList}>
                  {partnerBonuses.map((bonus) => {
                    const bonusDateObj = bonus.createdAt instanceof Date ? bonus.createdAt : new Date(bonus.createdAt);

                    return (
                      <Pressable
                        key={bonus.id}
                        style={({ pressed }) => [styles.ledgerCard, pressed && styles.cardPressed]}
                        onPress={() => handleOpenEditBonusModal(bonus)}
                      >
                        <View style={[styles.ledgerIconCircle, { backgroundColor: "#8b5cf618" }]}>
                          <MaterialIcons name="stars" size={18} color="#8b5cf6" />
                        </View>

                        <View style={styles.ledgerDetailsCol}>
                          <View style={styles.ledgerHeaderRow}>
                            <Text style={styles.ledgerTitle} numberOfLines={1}>
                              {bonus.reason || "Special Bonus"}
                            </Text>
                            <Text style={[styles.ledgerAmount, { color: "#8b5cf6" }]}>
                              + ₹{Number(bonus.amount || 0).toLocaleString("en-IN")}
                            </Text>
                          </View>

                          <View style={styles.ledgerSubRow}>
                            <Text style={styles.ledgerSubtitle} numberOfLines={1}>
                              {bonus.notes ? bonus.notes : "Awarded bonus"}
                            </Text>
                            <Text style={styles.ledgerDate}>
                              {bonusDateObj.toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </Text>
                          </View>

                          <View style={styles.ledgerTagRow}>
                            <View style={[styles.statusPill, { backgroundColor: "#8b5cf615" }]}>
                              <Text style={[styles.statusPillText, { color: "#8b5cf6" }]}>
                                Bonus Reward ⭐
                              </Text>
                            </View>
                            <Text style={styles.tapToEditHint}>Tap to Edit ✏️</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* TAB 5: PURCHASES BY PARTNER AS CUSTOMER */}
          {activeTab === "orders" && filteredPartnerCustomerOrders.length > 0 && (
            <View style={styles.tabContentArea}>
              <View style={styles.tabHeaderRow}>
                <Text style={styles.tabSectionTitle}>Product Orders Purchased</Text>
                <Text style={styles.tabBadgeCount}>
                  {partnerOrderSummary.count} Orders • {partnerOrderSummary.totalBricks.toLocaleString("en-IN")} items
                </Text>
              </View>

              {/* Purchase Summary Card */}
              <View style={styles.purchaseStatsBox}>
                <View style={styles.purchaseStatCol}>
                  <Text style={styles.purchaseStatLabel}>Total Invoiced</Text>
                  <Text style={styles.purchaseStatVal}>
                    ₹{partnerOrderSummary.totalValue.toLocaleString("en-IN")}
                  </Text>
                </View>

                <View style={styles.purchaseStatDivider} />

                <View style={styles.purchaseStatCol}>
                  <Text style={styles.purchaseStatLabel}>Paid</Text>
                  <Text style={[styles.purchaseStatVal, { color: "#16a34a" }]}>
                    ₹{partnerOrderSummary.totalPaid.toLocaleString("en-IN")}
                  </Text>
                </View>

                <View style={styles.purchaseStatDivider} />

                <View style={styles.purchaseStatCol}>
                  <Text style={styles.purchaseStatLabel}>Order Balance</Text>
                  <Text
                    style={[
                      styles.purchaseStatVal,
                      {
                        color:
                          partnerOrderSummary.totalDue > 0 ? colors.accent.danger : "#16a34a",
                      },
                    ]}
                  >
                    ₹{partnerOrderSummary.totalDue.toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>

              <View style={styles.ledgerList}>
                {filteredPartnerCustomerOrders.map((ord) => {
                  const totalQty =
                    ord.items && ord.items.length > 0
                      ? ord.items.reduce((s, itm) => s + Number(itm.quantity || 0), 0)
                      : Number(ord.quantity || 0);
                  const orderDate = ord.createdAt instanceof Date ? ord.createdAt : new Date(ord.createdAt);

                  return (
                    <Pressable
                      key={ord.id}
                      style={({ pressed }) => [styles.ledgerCard, pressed && styles.cardPressed]}
                      onPress={() => router.push({ pathname: "/orders", params: { highlightId: ord.id } })}
                    >
                      <View style={[styles.ledgerIconCircle, { backgroundColor: "#ea580c18" }]}>
                        <MaterialIcons name="shopping-bag" size={18} color="#ea580c" />
                      </View>

                      <View style={styles.ledgerDetailsCol}>
                        <View style={styles.ledgerHeaderRow}>
                          <Text style={styles.ledgerTitle} numberOfLines={1}>
                            Invoice #{ord.id ? ord.id.slice(-6).toUpperCase() : ""}
                          </Text>
                          <Text style={[styles.ledgerAmount, { color: colors.text.primary }]}>
                            ₹{Number(ord.total || 0).toLocaleString("en-IN")}
                          </Text>
                        </View>

                        <View style={styles.ledgerSubRow}>
                          <Text style={styles.ledgerSubtitle} numberOfLines={1}>
                            {totalQty.toLocaleString("en-IN")} Bricks {ord.itemName ? `• ${ord.itemName}` : ""}
                          </Text>
                          <Text style={styles.ledgerDate}>
                            {orderDate.toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </Text>
                        </View>

                        <View style={styles.ledgerTagRow}>
                          <View
                            style={[
                              styles.statusPill,
                              ord.balanceDue > 0 ? styles.statusPillPending : styles.statusPillPaid,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusPillText,
                                ord.balanceDue > 0
                                  ? styles.statusPillTextPending
                                  : styles.statusPillTextPaid,
                              ]}
                            >
                              {ord.balanceDue > 0
                                ? `Due: ₹${Number(ord.balanceDue).toLocaleString("en-IN")}`
                                : "Fully Paid"}
                            </Text>
                          </View>
                          <Text style={styles.tapToEditHint}>View Order ›</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>

        {/* ========== MODAL: RECORD PAYMENT (DISBURSEMENT / ADVANCE) ========== */}
        <Modal visible={payModalVisible} transparent animationType="fade">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalBg}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.modalIconBadge, { backgroundColor: "#16a34a18" }]}>
                    <MaterialIcons name="payment" size={20} color="#16a34a" />
                  </View>
                  <Text style={styles.modalTitle}>Record Payment</Text>
                </View>

                <Pressable onPress={() => !savingPayment && setPayModalVisible(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={colors.text.muted} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {payError ? (
                  <View style={styles.errorAlertBox}>
                    <MaterialIcons name="error-outline" size={16} color={colors.accent.danger} />
                    <Text style={styles.errorAlertText}>{payError}</Text>
                  </View>
                ) : null}

                {/* Amount presets if pending > 0 */}
                {partner.totalPending > 0 && (
                  <View style={styles.presetChipsRow}>
                    <Text style={styles.presetLabel}>Quick Amounts:</Text>
                    <Pressable
                      style={[styles.presetChip, styles.presetChipHighlight]}
                      onPress={() => setPayAmount(String(partner.totalPending))}
                    >
                      <Text style={styles.presetChipHighlightText}>
                        Full Due: ₹{Number(partner.totalPending).toLocaleString("en-IN")}
                      </Text>
                    </Pressable>
                    {[500, 1000, 2000, 5000].map((preset) => (
                      <Pressable
                        key={preset}
                        style={styles.presetChip}
                        onPress={() => setPayAmount(String(preset))}
                      >
                        <Text style={styles.presetChipText}>₹{preset.toLocaleString("en-IN")}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <Text style={styles.formLabel}>Amount to Pay (₹) *</Text>
                <TextInput
                  style={styles.formInputBig}
                  value={payAmount}
                  onChangeText={setPayAmount}
                  placeholder="₹ 0.00"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  autoFocus={true}
                  editable={!savingPayment}
                />

                {/* Advance detection indicator */}
                {(() => {
                  const numVal = parseFloat(payAmount);
                  if (isNaN(numVal) || numVal <= 0) return null;
                  const pending = Number(partner.totalPending || 0);
                  const excess = numVal - Math.max(0, pending);
                  if (excess > 0) {
                    return (
                      <View style={styles.advanceBanner}>
                        <MaterialIcons name="stars" size={16} color="#16a34a" />
                        <Text style={styles.advanceBannerText}>
                          Includes ₹{excess.toLocaleString("en-IN")} Advance credit for future trips
                        </Text>
                      </View>
                    );
                  }
                  return null;
                })()}

                <Text style={styles.formLabel}>Payment Method *</Text>
                <View style={styles.chipsWrap}>
                  {PAYMENT_METHODS.map((m) => {
                    const selected = payMethod === m;
                    return (
                      <Pressable
                        key={m}
                        style={[styles.formSelectChip, selected && styles.formSelectChipActive]}
                        onPress={() => setPayMethod(m)}
                      >
                        <Text
                          style={[styles.formSelectChipText, selected && styles.formSelectChipTextActive]}
                        >
                          {m}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.formLabel}>Payment Date *</Text>
                <Pressable
                  style={styles.dateSelectorBtn}
                  onPress={() => openCalendar(payDate, "Select Payment Date", (d) => setPayDate(d))}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <MaterialIcons name="event" size={18} color="#16a34a" />
                    <Text style={styles.dateSelectorText}>
                      {payDate.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <Text style={styles.dateChangeLink}>Change Date</Text>
                </Pressable>

                <Text style={styles.formLabel}>Notes (Optional)</Text>
                <TextInput
                  style={styles.formInput}
                  value={payNotes}
                  onChangeText={setPayNotes}
                  placeholder="e.g. Disbursed by Cashier / Ref ID / Petrol advance"
                  placeholderTextColor={colors.text.muted}
                  editable={!savingPayment}
                />

                <Pressable
                  style={[styles.submitActionBtn, { backgroundColor: "#16a34a" }]}
                  onPress={handleSavePayment}
                  disabled={savingPayment}
                >
                  {savingPayment ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.submitActionBtnText}>Save Payment</Text>
                  )}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ========== MODAL: REPAY ADVANCE (DRIVER REFUND TO BUSINESS) ========== */}
        <Modal visible={repayModalVisible} transparent animationType="fade">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalBg}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.modalIconBadge, { backgroundColor: "#0d948818" }]}>
                    <MaterialIcons name="replay" size={20} color="#0d9488" />
                  </View>
                  <Text style={styles.modalTitle}>Repay Advance</Text>
                </View>

                <Pressable onPress={() => !savingRepay && setRepayModalVisible(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={colors.text.muted} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {repayError ? (
                  <View style={styles.errorAlertBox}>
                    <MaterialIcons name="error-outline" size={16} color={colors.accent.danger} />
                    <Text style={styles.errorAlertText}>{repayError}</Text>
                  </View>
                ) : null}

                {/* Advance info banner */}
                <View style={[styles.advanceBanner, { backgroundColor: "#0d948815", borderColor: "#0d948835" }]}>
                  <MaterialIcons name="info-outline" size={16} color="#0d9488" />
                  <Text style={[styles.advanceBannerText, { color: "#0d9488" }]}>
                    {partner.totalPending < 0
                      ? `Driver currently holds ₹${Math.abs(Number(partner.totalPending)).toLocaleString("en-IN")} in Advance.`
                      : "Record advance money returned by driver back to business."}
                  </Text>
                </View>

                {/* Quick Presets */}
                <View style={styles.presetChipsRow}>
                  <Text style={styles.presetLabel}>Quick Amounts:</Text>
                  {partner.totalPending < 0 && (
                    <Pressable
                      style={[styles.presetChip, { backgroundColor: "#0d948815", borderColor: "#0d9488" }]}
                      onPress={() => setRepayAmount(String(Math.abs(Number(partner.totalPending))))}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#0d9488" }}>
                        Full Advance: ₹{Math.abs(Number(partner.totalPending)).toLocaleString("en-IN")}
                      </Text>
                    </Pressable>
                  )}
                  {[500, 1000, 2000, 5000].map((preset) => (
                    <Pressable
                      key={preset}
                      style={styles.presetChip}
                      onPress={() => setRepayAmount(String(preset))}
                    >
                      <Text style={styles.presetChipText}>₹{preset.toLocaleString("en-IN")}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.formLabel}>Amount Returned by Driver (₹) *</Text>
                <TextInput
                  style={styles.formInputBig}
                  value={repayAmount}
                  onChangeText={setRepayAmount}
                  placeholder="₹ 0.00"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  autoFocus={true}
                  editable={!savingRepay}
                />

                <Text style={styles.formLabel}>Received Payment Method *</Text>
                <View style={styles.chipsWrap}>
                  {PAYMENT_METHODS.map((m) => {
                    const selected = repayMethod === m;
                    return (
                      <Pressable
                        key={m}
                        style={[
                          styles.formSelectChip,
                          selected && { backgroundColor: "#0d948815", borderColor: "#0d9488" },
                        ]}
                        onPress={() => setRepayMethod(m)}
                      >
                        <Text
                          style={[
                            styles.formSelectChipText,
                            selected && { color: "#0d9488", fontWeight: "800" },
                          ]}
                        >
                          {m}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.formLabel}>Repayment Date *</Text>
                <Pressable
                  style={styles.dateSelectorBtn}
                  onPress={() => openCalendar(repayDate, "Select Repayment Date", (d) => setRepayDate(d))}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <MaterialIcons name="event" size={18} color="#0d9488" />
                    <Text style={styles.dateSelectorText}>
                      {repayDate.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.dateChangeLink, { color: "#0d9488" }]}>Change Date</Text>
                </Pressable>

                <Text style={styles.formLabel}>Notes (Optional)</Text>
                <TextInput
                  style={styles.formInput}
                  value={repayNotes}
                  onChangeText={setRepayNotes}
                  placeholder="e.g. Unused trip advance refunded in cash"
                  placeholderTextColor={colors.text.muted}
                  editable={!savingRepay}
                />

                <Pressable
                  style={[styles.submitActionBtn, { backgroundColor: "#0d9488" }]}
                  onPress={handleSaveRepayAdvance}
                  disabled={savingRepay}
                >
                  {savingRepay ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.submitActionBtnText}>Record Repay Advance</Text>
                  )}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ========== MODAL: LOG / EDIT TRIP ========== */}
        <Modal visible={showTripModal} transparent animationType="fade">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalBg}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.modalIconBadge, { backgroundColor: "#2563eb18" }]}>
                    <MaterialIcons name="local-shipping" size={20} color="#2563eb" />
                  </View>
                  <Text style={styles.modalTitle}>{isEditingTrip ? "Edit Trip" : "Log Delivery Trip"}</Text>
                </View>

                <Pressable onPress={() => !savingTrip && setShowTripModal(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={colors.text.muted} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {tripError ? (
                  <View style={styles.errorAlertBox}>
                    <MaterialIcons name="error-outline" size={16} color={colors.accent.danger} />
                    <Text style={styles.errorAlertText}>{tripError}</Text>
                  </View>
                ) : null}

                <Text style={styles.formLabel}>Customer Name *</Text>
                <TextInput
                  style={styles.formInput}
                  value={tripCustomerName}
                  onChangeText={(txt) => {
                    setTripCustomerName(txt);
                    setTripCustomerId(null);
                  }}
                  placeholder="Enter client / site name"
                  placeholderTextColor={colors.text.muted}
                  editable={!savingTrip}
                />

                {/* Quick Customer Selection Chips */}
                {customers && customers.length > 0 && !isEditingTrip && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginTop: 6, marginBottom: 6 }}
                  >
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {customers.slice(0, 8).map((c) => (
                        <Pressable
                          key={c.id}
                          style={[
                            styles.customerChip,
                            tripCustomerId === c.id && styles.customerChipActive,
                          ]}
                          onPress={() => {
                            setTripCustomerName(c.name);
                            setTripCustomerId(c.id);
                          }}
                        >
                          <Text
                            style={[
                              styles.customerChipText,
                              tripCustomerId === c.id && styles.customerChipTextActive,
                            ]}
                          >
                            {c.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                )}

                <Text style={styles.formLabel}>Delivery Charge (₹) *</Text>
                <TextInput
                  style={styles.formInputBig}
                  value={tripCharge}
                  onChangeText={setTripCharge}
                  placeholder="0.00"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  editable={!savingTrip}
                />

                <Text style={styles.formLabel}>Delivered Item / Quantity (Optional)</Text>
                <TextInput
                  style={styles.formInput}
                  value={tripDeliveredItem}
                  onChangeText={setTripDeliveredItem}
                  placeholder="e.g. 5,000 Red Bricks / 20 Tons Gravel"
                  placeholderTextColor={colors.text.muted}
                  editable={!savingTrip}
                />

                <Text style={styles.formLabel}>Trip Payment Status *</Text>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                  {["Pending", "Paid"].map((st) => {
                    const selected = tripStatus === st;
                    return (
                      <Pressable
                        key={st}
                        style={[
                          styles.statusSelectChip,
                          selected &&
                            (st === "Paid"
                              ? styles.statusSelectChipPaid
                              : styles.statusSelectChipPending),
                        ]}
                        onPress={() => setTripStatus(st)}
                      >
                        <Text
                          style={[
                            styles.statusSelectChipText,
                            selected &&
                              (st === "Paid"
                                ? styles.statusSelectChipTextPaid
                                : styles.statusSelectChipTextPending),
                          ]}
                        >
                          {st === "Paid" ? "✓ Paid Directly" : "⏳ Pending Payout"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.formLabel}>Trip Date *</Text>
                <Pressable
                  style={styles.dateSelectorBtn}
                  onPress={() => openCalendar(tripDate, "Select Trip Date", (d) => setTripDate(d))}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <MaterialIcons name="event" size={18} color="#2563eb" />
                    <Text style={styles.dateSelectorText}>
                      {tripDate.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.dateChangeLink, { color: "#2563eb" }]}>Change Date</Text>
                </Pressable>

                <Text style={styles.formLabel}>Notes (Optional)</Text>
                <TextInput
                  style={styles.formInput}
                  value={tripNotes}
                  onChangeText={setTripNotes}
                  placeholder="Site location, distance, extra notes..."
                  placeholderTextColor={colors.text.muted}
                  editable={!savingTrip}
                />

                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                  {isEditingTrip && (
                    <Pressable
                      style={styles.modalDeleteBtn}
                      onPress={handleDeleteTrip}
                      disabled={savingTrip || deletingTrip}
                    >
                      <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                      <Text style={styles.modalDeleteBtnText}>Delete</Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={[styles.submitActionBtn, { flex: 2, backgroundColor: "#16a34a" }]}
                    onPress={handleSaveTrip}
                    disabled={savingTrip || deletingTrip}
                  >
                    {savingTrip ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.submitActionBtnText}>
                        {isEditingTrip ? "Save Changes" : "Save Trip"}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ========== MODAL: AWARD / EDIT BONUS ========== */}
        <Modal visible={showBonusModal} transparent animationType="fade">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalBg}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.modalIconBadge, { backgroundColor: "#8b5cf618" }]}>
                    <MaterialIcons name="stars" size={20} color="#8b5cf6" />
                  </View>
                  <Text style={styles.modalTitle}>{isEditingBonus ? "Edit Bonus" : "Award Bonus Reward"}</Text>
                </View>

                <Pressable onPress={() => !savingBonus && setShowBonusModal(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={colors.text.muted} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {bonusError ? (
                  <View style={styles.errorAlertBox}>
                    <MaterialIcons name="error-outline" size={16} color={colors.accent.danger} />
                    <Text style={styles.errorAlertText}>{bonusError}</Text>
                  </View>
                ) : null}

                <Text style={styles.formLabel}>Bonus Amount (₹) *</Text>
                <TextInput
                  style={styles.formInputBig}
                  value={bonusAmount}
                  onChangeText={setBonusAmount}
                  placeholder="₹ 0.00"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  autoFocus={!isEditingBonus}
                  editable={!savingBonus}
                />

                <Text style={styles.formLabel}>Bonus Category / Reason *</Text>
                <View style={styles.chipsWrap}>
                  {BONUS_REASONS.map((r) => {
                    const selected = bonusReason === r;
                    return (
                      <Pressable
                        key={r}
                        style={[styles.formSelectChip, selected && styles.formSelectChipPurpleActive]}
                        onPress={() => setBonusReason(r)}
                      >
                        <Text
                          style={[
                            styles.formSelectChipText,
                            selected && styles.formSelectChipTextPurpleActive,
                          ]}
                        >
                          {r}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {bonusReason === "Custom" && (
                  <>
                    <Text style={styles.formLabel}>Custom Reason Description *</Text>
                    <TextInput
                      style={styles.formInput}
                      value={bonusCustomReason}
                      onChangeText={setBonusCustomReason}
                      placeholder="e.g. Festival Gift / Safe Driving Bonus"
                      placeholderTextColor={colors.text.muted}
                      editable={!savingBonus}
                    />
                  </>
                )}

                <Text style={styles.formLabel}>Bonus Date *</Text>
                <Pressable
                  style={styles.dateSelectorBtn}
                  onPress={() => openCalendar(bonusDate, "Select Bonus Date", (d) => setBonusDate(d))}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <MaterialIcons name="event" size={18} color="#8b5cf6" />
                    <Text style={styles.dateSelectorText}>
                      {bonusDate.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.dateChangeLink, { color: "#8b5cf6" }]}>Change Date</Text>
                </Pressable>

                <Text style={styles.formLabel}>Notes (Optional)</Text>
                <TextInput
                  style={styles.formInput}
                  value={bonusNotes}
                  onChangeText={setBonusNotes}
                  placeholder="Additional remarks..."
                  placeholderTextColor={colors.text.muted}
                  editable={!savingBonus}
                />

                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                  {isEditingBonus && (
                    <Pressable
                      style={styles.modalDeleteBtn}
                      onPress={handleDeleteBonus}
                      disabled={savingBonus || deletingBonus}
                    >
                      <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                      <Text style={styles.modalDeleteBtnText}>Delete</Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={[styles.submitActionBtn, { flex: 2, backgroundColor: "#8b5cf6" }]}
                    onPress={handleSaveBonus}
                    disabled={savingBonus || deletingBonus}
                  >
                    {savingBonus ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.submitActionBtnText}>
                        {isEditingBonus ? "Save Changes" : "Award Bonus"}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ========== MODAL: EDIT PAYMENT ========== */}
        <Modal visible={showEditPaymentModal} transparent animationType="fade">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalBg}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.modalIconBadge, { backgroundColor: selectedPayment?.isRepayment ? "#0d948818" : "#16a34a18" }]}>
                    <MaterialIcons name={selectedPayment?.isRepayment ? "replay" : "payment"} size={20} color={selectedPayment?.isRepayment ? "#0d9488" : "#16a34a"} />
                  </View>
                  <Text style={styles.modalTitle}>
                    {selectedPayment?.isRepayment ? "Edit Advance Repayment" : "Edit Payment Voucher"}
                  </Text>
                </View>

                <Pressable onPress={() => !savingEditPayment && setShowEditPaymentModal(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={colors.text.muted} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.formLabel}>Amount (₹) *</Text>
                <TextInput
                  style={styles.formInputBig}
                  value={editPayAmount}
                  onChangeText={setEditPayAmount}
                  placeholder="₹ 0.00"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  editable={!savingEditPayment}
                />

                <Text style={styles.formLabel}>Payment Method *</Text>
                <View style={styles.chipsWrap}>
                  {PAYMENT_METHODS.map((m) => {
                    const selected = editPayMethod === m;
                    return (
                      <Pressable
                        key={m}
                        style={[styles.formSelectChip, selected && styles.formSelectChipActive]}
                        onPress={() => setEditPayMethod(m)}
                      >
                        <Text
                          style={[styles.formSelectChipText, selected && styles.formSelectChipTextActive]}
                        >
                          {m}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.formLabel}>Payment Date *</Text>
                <Pressable
                  style={styles.dateSelectorBtn}
                  onPress={() =>
                    openCalendar(editPayDate, "Select Payment Date", (d) => setEditPayDate(d))
                  }
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <MaterialIcons name="event" size={18} color="#16a34a" />
                    <Text style={styles.dateSelectorText}>
                      {editPayDate.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <Text style={styles.dateChangeLink}>Change Date</Text>
                </Pressable>

                <Text style={styles.formLabel}>Notes (Optional)</Text>
                <TextInput
                  style={styles.formInput}
                  value={editPayNotes}
                  onChangeText={setEditPayNotes}
                  placeholder="Notes..."
                  placeholderTextColor={colors.text.muted}
                  editable={!savingEditPayment}
                />

                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                  <Pressable
                    style={styles.modalDeleteBtn}
                    onPress={handleDeletePayment}
                    disabled={savingEditPayment || deletingPayment}
                  >
                    <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                    <Text style={styles.modalDeleteBtnText}>Delete</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.submitActionBtn, { flex: 2, backgroundColor: selectedPayment?.isRepayment ? "#0d9488" : "#16a34a" }]}
                    onPress={handleSaveEditPayment}
                    disabled={savingEditPayment || deletingPayment}
                  >
                    {savingEditPayment ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.submitActionBtnText}>Save Changes</Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ========== MODAL: OPTIONS MENU ========== */}
        <Modal visible={optionsMenuVisible} transparent animationType="fade">
          <Pressable style={styles.modalBg} onPress={() => setOptionsMenuVisible(false)}>
            <View style={[styles.modalContent, { maxWidth: 360, padding: 12 }]}>
              <Text style={styles.optionsMenuHeader}>Partner Actions</Text>

              <Pressable
                style={styles.optionMenuItem}
                onPress={() => {
                  setOptionsMenuVisible(false);
                  handleCall();
                }}
              >
                <MaterialIcons name="call" size={20} color={colors.accent.primary} />
                <Text style={styles.optionMenuText}>Call Partner ({partner.mobile})</Text>
              </Pressable>

              <Pressable
                style={styles.optionMenuItem}
                onPress={() => {
                  setOptionsMenuVisible(false);
                  handleWhatsApp();
                }}
              >
                <MaterialIcons name="chat" size={20} color="#16a34a" />
                <Text style={styles.optionMenuText}>Chat on WhatsApp</Text>
              </Pressable>

              <Pressable
                style={styles.optionMenuItem}
                onPress={() => {
                  setOptionsMenuVisible(false);
                  setShareModalVisible(true);
                }}
              >
                <MaterialIcons name="share" size={20} color="#2563eb" />
                <Text style={styles.optionMenuText}>Share Partner Statement</Text>
              </Pressable>

              <Pressable
                style={styles.optionMenuItem}
                onPress={() => {
                  setOptionsMenuVisible(false);
                  handleOpenRepayModal();
                }}
              >
                <MaterialIcons name="replay" size={20} color="#0d9488" />
                <Text style={[styles.optionMenuText, { color: "#0d9488" }]}>Repay Advance</Text>
              </Pressable>

              <Pressable
                style={styles.optionMenuItem}
                onPress={() => {
                  setOptionsMenuVisible(false);
                  router.push({
                    pathname: "/settings/delivery-partners/edit",
                    params: { partnerId: partner.id },
                  });
                }}
              >
                <MaterialIcons name="edit" size={20} color={colors.text.secondary} />
                <Text style={styles.optionMenuText}>Edit Partner Details</Text>
              </Pressable>

              <Pressable style={styles.optionMenuItem} onPress={handleResetBalance}>
                <MaterialIcons name="restart-alt" size={20} color="#f59e0b" />
                <Text style={[styles.optionMenuText, { color: "#f59e0b" }]}>Reset Financial Balance</Text>
              </Pressable>

              <View style={styles.menuDivider} />

              <Pressable
                style={styles.optionMenuItem}
                onPress={() => {
                  setOptionsMenuVisible(false);
                  setDeleteModalVisible(true);
                }}
              >
                <MaterialIcons name="delete" size={20} color={colors.accent.danger} />
                <Text style={[styles.optionMenuText, { color: colors.accent.danger }]}>
                  Delete Delivery Partner
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* ========== MODAL: DELETE PARTNER CONFIRMATION ========== */}
        <Modal visible={deleteModalVisible} transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <View style={styles.modalIconWrapper}>
                <MaterialIcons name="warning" size={36} color={colors.accent.danger} />
              </View>
              <Text style={styles.modalDeleteTitle}>Delete Delivery Partner?</Text>
              <Text style={styles.modalDeleteDesc}>
                This will permanently remove &quot;{partner.name}&quot; from your active fleet list.
                Logged historical trips will be preserved.
              </Text>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalCancelBtn]}
                  onPress={() => !deleting && setDeleteModalVisible(false)}
                  disabled={deleting}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalConfirmDeleteBtn]}
                  onPress={handleDeletePartner}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.modalConfirmDeleteBtnText}>Yes, Delete</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Unified Calendar Modal */}
        <EasyCalendarModal
          visible={calendarConfig.visible}
          date={calendarConfig.date}
          title={calendarConfig.title}
          onSelectDate={(d) => {
            if (calendarConfig.onSelect) calendarConfig.onSelect(d);
            closeCalendar();
          }}
          onClose={closeCalendar}
        />

        {/* Delivery Partner Share Statement Modal */}
        <DeliveryPartnerShareModal
          visible={shareModalVisible}
          onClose={() => setShareModalVisible(false)}
          partner={partner}
          trips={partnerTrips}
          payments={partnerPayments}
          bonuses={partnerBonuses}
          purchasedOrders={partnerCustomerOrders}
          company={companyProfile}
          initialDateFilter={dateFilter}
        />
      </View>
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors } = theme;
  return StyleSheet.create({
    screenWrapper: {
      flex: 1,
      backgroundColor: colors.bg.card,
    },
    container: {
      padding: 16,
      backgroundColor: colors.bg.card,
      flexGrow: 1,
    },
    topHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    headerRightActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    headerIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: "center",
      justifyContent: "center",
    },
    headerIconBtnFav: {
      backgroundColor: "#fef3c7",
      borderColor: "#fde047",
    },
    buttonPressed: {
      opacity: 0.75,
      transform: [{ scale: 0.97 }],
    },
    cardPressed: {
      opacity: 0.85,
    },

    // Hero Driver Card
    heroCard: {
      backgroundColor: colors.bg.primary,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 16,
      marginBottom: 14,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    avatarWrapper: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: `${colors.accent.primary}15`,
      borderWidth: 1,
      borderColor: `${colors.accent.primary}30`,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    statusDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      position: "absolute",
      bottom: -2,
      right: -2,
      borderWidth: 2,
      borderColor: colors.bg.primary,
    },
    statusDotActive: {
      backgroundColor: "#16a34a",
    },
    statusDotInactive: {
      backgroundColor: colors.accent.danger,
    },
    heroNameCol: {
      flex: 1,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
    },
    heroName: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
    },
    preferredTag: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: "#fef3c7",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#fde047",
    },
    preferredTagText: {
      fontSize: 10,
      fontWeight: "700",
      color: "#d97706",
    },
    rateBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 4,
    },
    rateBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    driverInfoChipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 12,
    },
    infoChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.bg.card,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    infoChipText: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: "600",
    },
    heroContactRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    contactBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 9,
      borderRadius: 10,
    },
    callBtn: {
      backgroundColor: colors.accent.primary,
    },
    callBtnText: {
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "700",
    },
    waBtn: {
      backgroundColor: "#16a34a",
    },
    waBtnText: {
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "700",
    },
    statementBtn: {
      backgroundColor: `${colors.accent.primary}12`,
      borderWidth: 1,
      borderColor: `${colors.accent.primary}30`,
    },
    statementBtnText: {
      color: colors.accent.primary,
      fontSize: 12,
      fontWeight: "700",
    },

    // Period Filter Bar
    filterSection: {
      marginBottom: 12,
    },
    filterBar: {
      flexDirection: "row",
      gap: 6,
      paddingVertical: 2,
    },
    filterPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    filterPillActive: {
      backgroundColor: `${colors.accent.primary}18`,
      borderColor: colors.accent.primary,
    },
    filterPillText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
    },
    filterPillTextActive: {
      color: colors.accent.primary,
      fontWeight: "700",
    },
    customDateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
    },
    datePickerBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.medium,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    datePickerBtnText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.primary,
    },
    clearCustomBtn: {
      padding: 6,
    },

    // Financial Summary Hero Card
    balanceHeroCard: {
      backgroundColor: colors.bg.primary,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 16,
      marginBottom: 14,
    },
    balanceMainRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    },
    balanceLeftCol: {
      flex: 1,
    },
    balanceSubheader: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: colors.text.muted,
      marginBottom: 2,
    },
    balanceBigNumber: {
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -0.5,
    },
    balanceStatusNote: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
      marginTop: 2,
    },
    balanceActionsGroup: {
      flexDirection: "column",
      gap: 6,
      alignItems: "flex-end",
    },
    payHeroButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "#16a34a",
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      shadowColor: "#16a34a",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
      minWidth: 110,
      justifyContent: "center",
    },
    payHeroButtonText: {
      color: "#ffffff",
      fontWeight: "800",
      fontSize: 12,
    },
    repayHeroButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "#0d9488",
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      shadowColor: "#0d9488",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
      minWidth: 110,
      justifyContent: "center",
    },
    repayHeroButtonText: {
      color: "#ffffff",
      fontWeight: "800",
      fontSize: 12,
    },
    metricsDivider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      marginVertical: 14,
    },
    metricsGrid: {
      flexDirection: "row",
      gap: 8,
    },
    metricTile: {
      flex: 1,
      backgroundColor: colors.bg.card,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    metricHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginBottom: 4,
    },
    metricLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
    },
    metricValue: {
      fontSize: 14,
      fontWeight: "800",
    },
    metricCountText: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 2,
    },

    // Quick Actions Bar
    quickActionRow: {
      flexDirection: "row",
      gap: 6,
      marginBottom: 14,
    },
    quickActionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
    },
    qaTrip: {
      backgroundColor: "#16a34a12",
      borderColor: "#16a34a35",
    },
    qaTripText: {
      color: "#16a34a",
      fontWeight: "800",
      fontSize: 11,
    },
    qaBonus: {
      backgroundColor: "#8b5cf612",
      borderColor: "#8b5cf635",
    },
    qaBonusText: {
      color: "#8b5cf6",
      fontWeight: "800",
      fontSize: 11,
    },
    qaPay: {
      backgroundColor: "#2563eb12",
      borderColor: "#2563eb35",
    },
    qaPayText: {
      color: "#2563eb",
      fontWeight: "800",
      fontSize: 11,
    },
    qaRepay: {
      backgroundColor: "#0d948812",
      borderColor: "#0d948835",
    },
    qaRepayText: {
      color: "#0d9488",
      fontWeight: "800",
      fontSize: 11,
    },

    // Tabs
    tabsContainer: {
      marginBottom: 12,
    },
    tabsScroll: {
      flexDirection: "row",
      gap: 6,
      paddingVertical: 2,
    },
    tabItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.bg.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    tabItemActive: {
      backgroundColor: colors.bg.primary,
      borderColor: colors.accent.primary,
      borderWidth: 1.5,
    },
    tabText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.muted,
    },
    tabTextActive: {
      color: colors.text.primary,
      fontWeight: "800",
    },
    tabBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: colors.bg.card,
    },
    tabBadgeActive: {
      backgroundColor: `${colors.accent.primary}18`,
    },
    tabBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.text.muted,
    },
    tabBadgeTextActive: {
      color: colors.accent.primary,
    },

    // All Activity Sub-Toolbar
    activityToolbar: {
      marginBottom: 10,
      gap: 8,
    },
    subFilterScroll: {
      flexDirection: "row",
      gap: 6,
      paddingVertical: 2,
    },
    subFilterPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    subFilterPillActive: {
      backgroundColor: `${colors.accent.primary}18`,
      borderColor: colors.accent.primary,
    },
    subFilterText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
    },
    subFilterTextActive: {
      color: colors.accent.primary,
      fontWeight: "800",
    },
    activitySearchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: 10,
      paddingVertical: 6,
      gap: 6,
    },
    activitySearchInput: {
      flex: 1,
      fontSize: 12,
      color: colors.text.primary,
      padding: 0,
    },

    // Tab Contents & Lists
    tabContentArea: {
      minHeight: 200,
    },
    tabHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    tabSectionTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.text.primary,
    },
    tabBadgeCount: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "600",
    },
    tabAddButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: "#16a34a15",
      borderWidth: 1,
      borderColor: "#16a34a35",
    },
    tabAddButtonText: {
      fontSize: 11,
      fontWeight: "700",
      color: "#16a34a",
    },

    ledgerList: {
      gap: 8,
    },
    ledgerCard: {
      flexDirection: "row",
      backgroundColor: colors.bg.primary,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      gap: 12,
    },
    ledgerIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    ledgerDetailsCol: {
      flex: 1,
    },
    ledgerHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 8,
    },
    ledgerTitle: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.text.primary,
      flex: 1,
    },
    ledgerAmount: {
      fontSize: 14,
      fontWeight: "800",
    },
    itemTagRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 2,
    },
    itemTagText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.accent.primary,
    },
    ledgerSubRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      marginTop: 2,
    },
    ledgerSubtitle: {
      fontSize: 11,
      color: colors.text.secondary,
      flex: 1,
    },
    ledgerDate: {
      fontSize: 10,
      color: colors.text.muted,
      fontWeight: "600",
    },
    ledgerTagRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 6,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: `${colors.border.subtle}80`,
    },
    activityTypeBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    activityTypeBadgeText: {
      fontSize: 9.5,
      fontWeight: "800",
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    statusPillPaid: {
      backgroundColor: "#dcfce7",
    },
    statusPillPending: {
      backgroundColor: "#fee2e2",
    },
    statusPillText: {
      fontSize: 10,
      fontWeight: "700",
    },
    statusPillTextPaid: {
      color: "#16a34a",
    },
    statusPillTextPending: {
      color: colors.accent.danger,
    },
    autoBadge: {
      backgroundColor: `${colors.accent.primary}12`,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    autoBadgeText: {
      fontSize: 9,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    methodChip: {
      backgroundColor: colors.bg.card,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    methodChipText: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    tapToEditHint: {
      fontSize: 10,
      color: colors.text.muted,
      fontWeight: "600",
    },

    // Purchases Summary Box
    purchaseStatsBox: {
      flexDirection: "row",
      backgroundColor: colors.bg.primary,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginBottom: 10,
    },
    purchaseStatCol: {
      flex: 1,
      alignItems: "center",
    },
    purchaseStatLabel: {
      fontSize: 10,
      color: colors.text.muted,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    purchaseStatVal: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.text.primary,
      marginTop: 2,
    },
    purchaseStatDivider: {
      width: 1,
      backgroundColor: colors.border.subtle,
    },

    // Empty States
    emptyCard: {
      backgroundColor: colors.bg.primary,
      borderRadius: 16,
      padding: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginTop: 4,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.text.primary,
      marginTop: 10,
    },
    emptyDesc: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: 4,
      maxWidth: "85%",
    },
    emptyActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accent.primary,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      marginTop: 14,
    },
    emptyActionBtnText: {
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "700",
    },

    // Modals
    modalBg: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.65)",
      justifyContent: "center",
      alignItems: "center",
      padding: 16,
    },
    modalContent: {
      width: "100%",
      maxWidth: 440,
      backgroundColor: colors.bg.card,
      borderRadius: 20,
      padding: 18,
      maxHeight: "90%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    modalHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    modalIconBadge: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text.primary,
    },
    errorAlertBox: {
      backgroundColor: "#fee2e2",
      padding: 10,
      borderRadius: 8,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    errorAlertText: {
      color: colors.accent.danger,
      fontSize: 12,
      fontWeight: "600",
      flex: 1,
    },

    // Form inputs
    presetChipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      marginBottom: 12,
    },
    presetLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.muted,
    },
    presetChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    presetChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    presetChipHighlight: {
      backgroundColor: "#16a34a15",
      borderColor: "#16a34a",
    },
    presetChipHighlightText: {
      fontSize: 11,
      fontWeight: "700",
      color: "#16a34a",
    },
    formLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
      marginTop: 10,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    formInput: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text.primary,
    },
    formInputBig: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 20,
      fontWeight: "800",
      color: colors.text.primary,
    },
    advanceBanner: {
      backgroundColor: "#16a34a15",
      padding: 8,
      borderRadius: 8,
      marginTop: 8,
      marginBottom: 4,
      borderWidth: 1,
      borderColor: "#16a34a35",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    advanceBannerText: {
      fontSize: 11,
      color: "#16a34a",
      fontWeight: "700",
      flex: 1,
    },
    chipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 6,
    },
    formSelectChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    formSelectChipActive: {
      backgroundColor: "#16a34a15",
      borderColor: "#16a34a",
    },
    formSelectChipPurpleActive: {
      backgroundColor: "#8b5cf615",
      borderColor: "#8b5cf6",
    },
    formSelectChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    formSelectChipTextActive: {
      color: "#16a34a",
      fontWeight: "800",
    },
    formSelectChipTextPurpleActive: {
      color: "#8b5cf6",
      fontWeight: "800",
    },
    customerChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    customerChipActive: {
      backgroundColor: "#16a34a",
      borderColor: "#16a34a",
    },
    customerChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.primary,
    },
    customerChipTextActive: {
      color: "#ffffff",
      fontWeight: "800",
    },
    statusSelectChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.primary,
      alignItems: "center",
    },
    statusSelectChipPaid: {
      backgroundColor: "#16a34a15",
      borderColor: "#16a34a",
    },
    statusSelectChipPending: {
      backgroundColor: "#fee2e2",
      borderColor: colors.accent.danger,
    },
    statusSelectChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    statusSelectChipTextPaid: {
      color: "#16a34a",
      fontWeight: "800",
    },
    statusSelectChipTextPending: {
      color: colors.accent.danger,
      fontWeight: "800",
    },
    dateSelectorBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    dateSelectorText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    dateChangeLink: {
      fontSize: 11,
      fontWeight: "800",
      color: "#16a34a",
    },
    submitActionBtn: {
      paddingVertical: 13,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 14,
    },
    submitActionBtnText: {
      color: "#ffffff",
      fontWeight: "800",
      fontSize: 14,
    },
    modalDeleteBtn: {
      flex: 1,
      backgroundColor: "#ef444415",
      borderWidth: 1,
      borderColor: "#ef444440",
      paddingVertical: 13,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 6,
      marginTop: 14,
    },
    modalDeleteBtnText: {
      color: colors.accent.danger,
      fontWeight: "800",
      fontSize: 13,
    },

    // Options Menu Modal
    optionsMenuHeader: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.text.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    optionMenuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    optionMenuText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    menuDivider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      marginVertical: 4,
    },

    // Delete Modal
    modalIconWrapper: {
      alignSelf: "center",
      marginBottom: 10,
    },
    modalDeleteTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text.primary,
      textAlign: "center",
    },
    modalDeleteDesc: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: 6,
      marginBottom: 16,
      lineHeight: 18,
    },
    modalActions: {
      flexDirection: "row",
      gap: 10,
    },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.medium,
    },
    modalCancelBtnText: {
      fontWeight: "700",
      color: colors.text.primary,
      fontSize: 13,
    },
    modalConfirmDeleteBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent.danger,
    },
    modalConfirmDeleteBtnText: {
      fontWeight: "800",
      color: "#ffffff",
      fontSize: 13,
    },

    // Error container
    errorContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    errorTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
      marginTop: 12,
    },
    errorDesc: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 4,
      textAlign: "center",
    },
    backLink: {
      marginTop: 16,
      backgroundColor: colors.accent.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    backLinkText: {
      color: "#ffffff",
      fontWeight: "700",
    },
  });
};

export default PartnerDetailsScreen;