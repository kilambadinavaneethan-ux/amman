import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useContext, useEffect, useMemo, useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import AnimatedPage from "../components/AnimatedPage";
import EasyCalendarModal from "../components/EasyCalendarModal";
import { DeliveryPartnerContext } from "../context/DeliveryPartnerContext";
import { ExpenseContext } from "../context/ExpenseContext";
import { ItemContext } from "../context/ItemContext";
import { CustomerContext } from "../context/CustomerContext";
import { CollectorContext } from "../context/CollectorContext";
import { WorkerContext } from "../context/WorkerContext";
import { OrderContext } from "../context/OrderContext";
import { RawMaterialContext } from "../context/RawMaterialContext";
import { RawMaterialSupplierContext } from "../context/RawMaterialSupplierContext";
import { useTheme } from "../context/ThemeContext";
import { UserContext } from "../context/UserContext";
import { db, normalizeDateValue } from "../../src/config/firebase";
import { addDoc, collection } from "firebase/firestore";
import { useScrollRestoration } from "../context/ScrollContext";
import { TransactionShareBottomSheet } from "../../src/components/sharing/TransactionShareBottomSheet";
import { adaptToTransactionData } from "../../src/utils/transactionAdapter";
import { TransactionData } from "../../src/types/sharing";

const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer", "Card", "Other"];

export default function Orders() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const paramOrderId = (params?.orderId || params?.id || params?.highlightId) as string | undefined;

  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const [dateGroupLimit, setDateGroupLimit] = useState<number>(6);

  useEffect(() => {
    if (paramOrderId) {
      setFocusedOrderId(paramOrderId);
    }
  }, [paramOrderId]);

  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/orders");
  const {
    orders: customerOrders,
    loading: ordersLoading,
    updateOrderStatus,
    editOrder,
    deleteOrder,
  } = useContext(OrderContext) as any;
  const {
    logs,
    loading: rawMaterialsLoading,
    deleteTransaction,
    updateTransaction,
  } = useContext(RawMaterialContext) as any;
  const { suppliers } = useContext(RawMaterialSupplierContext) as any;

  const loading = ordersLoading || rawMaterialsLoading;

  const { items } = useContext(ItemContext) as any;
  const { customers } = useContext(CustomerContext) as any;
  const { partners } = useContext(DeliveryPartnerContext) as any;
  const { collectors } = useContext(CollectorContext) as any;
  const { workers } = useContext(WorkerContext) as any;
  const { profile: userProfile } = useContext(UserContext) as any;

  const [shareBottomSheetVisible, setShareBottomSheetVisible] = useState(false);
  const [sharingTransactionData, setSharingTransactionData] = useState<TransactionData | null>(null);

  const { entityByIdMap, entityByNameMap, entityByPhoneMap } = useMemo(() => {
    const byId = new Map<string, any>();
    const byName = new Map<string, any>();
    const byPhone = new Map<string, any>();

    (workers || []).forEach((w: any) => {
      const pending = w.totalPending !== undefined ? Number(w.totalPending) : (Number(w.totalWages || 0) - Number(w.totalPaid || 0));
      const obj = { ...w, totalPending: pending, balance: pending, customerType: "worker" };
      if (w.id) {
        byId.set(w.id, obj);
        byId.set(`worker_${w.id}`, obj);
      }
      if (w.name) byName.set(w.name.trim().toLowerCase(), obj);
      const ph = w.phone || w.mobile || w.contactNumber;
      if (ph) byPhone.set(ph.trim(), obj);
    });

    (suppliers || []).forEach((s: any) => {
      const bal = Number(s.balance || 0);
      const obj = { ...s, totalPending: bal, balance: bal, customerType: "supplier" };
      if (s.id) {
        byId.set(s.id, obj);
        byId.set(`supplier_${s.id}`, obj);
      }
      const sName = s.name || s.supplierName;
      if (sName) byName.set(sName.trim().toLowerCase(), obj);
      const ph = s.phone || s.mobile || s.phoneNumber;
      if (ph) byPhone.set(ph.trim(), obj);
    });

    (partners || []).forEach((p: any) => {
      const pending = Number(p.totalPending || 0);
      const obj = { ...p, totalPending: pending, balance: pending, customerType: "delivery_partner" };
      if (p.id) {
        byId.set(p.id, obj);
        byId.set(`partner_${p.id}`, obj);
        byId.set(`dp_${p.id}`, obj);
      }
      if (p.name) byName.set(p.name.trim().toLowerCase(), obj);
      const ph = p.phone || p.mobile || p.driverPhone;
      if (ph) byPhone.set(ph.trim(), obj);
    });

    (customers || []).forEach((c: any) => {
      const pending = c.totalPending !== undefined ? Number(c.totalPending) : (c.balance !== undefined ? Number(c.balance) : Number(c.pendingAmount || 0));
      const obj = { ...c, totalPending: pending, balance: pending, customerType: "customer" };
      if (c.id) byId.set(c.id, obj);
      if (c.name) byName.set(c.name.trim().toLowerCase(), obj);
      const ph = c.phone || c.mobile || c.phoneNumber;
      if (ph) byPhone.set(ph.trim(), obj);
    });

    return { entityByIdMap: byId, entityByNameMap: byName, entityByPhoneMap: byPhone };
  }, [customers, workers, suppliers, partners]);

  const handleOpenShareModal = useCallback((item: any, type: 'order' | 'expense' | 'purchase' = 'order') => {
    let itemToShare = { ...item };
    const customerObj = (itemToShare.customerId && entityByIdMap.get(itemToShare.customerId)) ||
      (itemToShare.customerName && entityByNameMap.get(itemToShare.customerName.trim().toLowerCase())) ||
      (itemToShare.customerPhone && entityByPhoneMap.get(itemToShare.customerPhone.trim())) ||
      null;
    if (customerObj) {
      if (!itemToShare.customerPhoneNumbers || itemToShare.customerPhoneNumbers.length === 0) {
        itemToShare.customerPhoneNumbers = customerObj.phoneNumbers && customerObj.phoneNumbers.length > 0
          ? customerObj.phoneNumbers
          : (customerObj.phone ? [customerObj.phone] : []);
      }
      if (!itemToShare.customerPhone && customerObj.phone) {
        itemToShare.customerPhone = customerObj.phone;
      }
      if (!itemToShare.customerAddress && customerObj.address) {
        itemToShare.customerAddress = customerObj.address;
      }
      if (!itemToShare.customerGst && (customerObj.gstin || customerObj.gstNo)) {
        itemToShare.customerGst = customerObj.gstin || customerObj.gstNo;
      }
    }
    if (type === 'order' && itemToShare) {
      if (itemToShare.previousBalance === undefined) {
        const customerCurrentPending = customerObj
          ? (customerObj.totalPending !== undefined ? Number(customerObj.totalPending) : Number(customerObj.balance || 0))
          : 0;
        const thisOrderUnpaid = Number(itemToShare.balanceDue || 0);
        itemToShare.previousBalance = Math.max(0, customerCurrentPending - thisOrderUnpaid);
      }
    }
    const transaction = adaptToTransactionData(itemToShare, type, userProfile);
    setSharingTransactionData(transaction);
    setShareBottomSheetVisible(true);
  }, [userProfile, entityByIdMap, entityByNameMap, entityByPhoneMap]);

  const sortedDeliveryPartners = useMemo(() => {
    return [...(partners || [])].sort((a: any, b: any) => {
      const aFav = !!a.isFavorite;
      const bFav = !!b.isFavorite;
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [partners]);

  // O(1) lookup Maps for render-time entity resolution
  const partnerByIdMap = useMemo(() => new Map<string, any>((partners || []).map((p: any) => [p.id, p])), [partners]);
  const customerByIdMap = useMemo(() => {
    const map = new Map<string, any>();
    (customers || []).forEach((c: any) => map.set(c.id, c));
    (workers || []).forEach((w: any) => map.set(w.id, w));
    (suppliers || []).forEach((s: any) => map.set(s.id, s));
    (partners || []).forEach((p: any) => map.set(p.id, p));
    return map;
  }, [customers, workers, suppliers, partners]);
  const itemByIdMap = useMemo(() => new Map<string, any>((items || []).map((i: any) => [i.id, i])), [items]);
  const workerByIdMap = useMemo(() => new Map<string, any>((workers || []).map((w: any) => [w.id, w])), [workers]);
  const supplierByIdMap = useMemo(() => new Map<string, any>((suppliers || []).map((s: any) => [s.id, s])), [suppliers]);

  const { expenses, addExpense, updateExpense, deleteExpense } = useContext(
    ExpenseContext,
  ) as any;

  const rawMaterialOrders = useMemo(() => {
    const rawMaterialPurchases = (logs || []).filter(
      (log: any) => log.type === "purchase",
    );

    const supplierIdMap = new Map((suppliers || []).map((s: any) => [s.id, s]));
    const supplierNameMap = new Map((suppliers || []).map((s: any) => [s.name, s]));

    return rawMaterialPurchases.map((purchase: any) => {
      const supplierObj =
        (purchase.supplierId && supplierIdMap.get(purchase.supplierId)) ||
        (purchase.supplierName && supplierNameMap.get(purchase.supplierName));
      const supplierPhone = purchase.supplierPhone || supplierObj?.phone || supplierObj?.mobile || "";

      return {
        id: purchase.id,
        customerName: purchase.supplierName || "Spot Supplier",
        customerPhone: supplierPhone,
        customerPhoneNumbers: supplierObj?.phoneNumbers || (supplierPhone ? [supplierPhone] : []),
        createdAt: normalizeDateValue(purchase.date),
        status: "purchase",
        items: [
          {
            itemName: purchase.materialName || "Material",
            quantity: purchase.quantity,
            rate: purchase.costPerUnit,
          },
        ],
        total: purchase.totalCost,
        balanceDue: purchase.remainingBalance || 0,
        isRawMaterialOrder: true,
      };
    });
  }, [logs, suppliers]);



  const orders = useMemo(() => {
    const mappedCustomerOrders = (customerOrders || []).map((o: any) => {
      const customerObj =
        (o.customerId && entityByIdMap.get(o.customerId)) ||
        (o.customerName && entityByNameMap.get(o.customerName.trim().toLowerCase())) ||
        (o.customerPhone && entityByPhoneMap.get(o.customerPhone.trim()));
      const phone = o.customerPhone || customerObj?.phone || customerObj?.mobile || customerObj?.phoneNumber || "";
      const phoneNumbers = o.customerPhoneNumbers || customerObj?.phoneNumbers || (phone ? [phone] : []);
      return {
        ...o,
        customerPhone: phone,
        customerPhoneNumbers: phoneNumbers,
        createdAt: normalizeDateValue(o.createdAt),
      };
    });

    return [...mappedCustomerOrders, ...rawMaterialOrders];
  }, [customerOrders, entityByIdMap, entityByNameMap, entityByPhoneMap, rawMaterialOrders]);

  const handleOpenCustomerProfile = useCallback(
    (order: any) => {
      if (order.isRawMaterialOrder) return;

      let targetCustomerId = order.customerId;
      if (!targetCustomerId) {
        const matched =
          (order.customerName && entityByNameMap.get(order.customerName.trim().toLowerCase())) ||
          (order.customerPhone && entityByPhoneMap.get(order.customerPhone.trim()));
        if (matched) {
          targetCustomerId = matched.id;
        }
      }

      if (targetCustomerId) {
        router.push({
          pathname: "/customer-profile" as any,
          params: { id: targetCustomerId },
        });
      } else {
        Alert.alert(
          "Customer Profile",
          "No matching customer profile found for this order.",
        );
      }
    },
    [entityByNameMap, entityByPhoneMap, router],
  );

  // Sort items to show Finished Products first (itemType !== "raw_material")
  const sortedItems = useMemo(() => [...(items || [])]
    .sort((a: any, b: any) => {
      const aIsProduct = a.itemType !== "raw_material";
      const bIsProduct = b.itemType !== "raw_material";
      if (aIsProduct && !bIsProduct) return -1;
      if (!aIsProduct && bIsProduct) return 1;
      return (a.itemName || "").localeCompare(b.itemName || "");
    }), [items]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedFilterDate, setSelectedFilterDate] = useState<Date | null>(null);
  const [dateFilterPreset, setDateFilterPreset] = useState<"all" | "today" | "yesterday" | "this_month" | "custom">("all");
  const [isSearchCalendarOpen, setIsSearchCalendarOpen] = useState(false);

  // Debounce search query to eliminate typing lag
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 150);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset date group render window on filter change
  useEffect(() => {
    setDateGroupLimit(6);
  }, [debouncedSearch, filterStatus, selectedFilterDate, dateFilterPreset]);

  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editOrderDate, setEditOrderDate] = useState<Date>(new Date());
  const [isEditOrderCalendarOpen, setIsEditOrderCalendarOpen] = useState(false);
  const [isShipmentCustomized, setIsShipmentCustomized] = useState(false);
  const [editCustomerId, setEditCustomerId] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [showEditCustomerDropdown, setShowEditCustomerDropdown] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");

  const [editRawQty, setEditRawQty] = useState("");
  const [editRawCost, setEditRawCost] = useState("");
  const [editRawPaid, setEditRawPaid] = useState("");
  const [editRawSupplierId, setEditRawSupplierId] = useState("");
  const [editRawMaterialId, setEditRawMaterialId] = useState("");
  const [editRawNotes, setEditRawNotes] = useState("");
  const [editRawPaymentStatus, setEditRawPaymentStatus] = useState("balance"); // "fully" | "balance"
  const [showEditRawSupplierDropdown, setShowEditRawSupplierDropdown] =
    useState(false);
  const [showEditRawMaterialDropdown, setShowEditRawMaterialDropdown] =
    useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // Form fields for editing
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editingEditItemIndex, setEditingEditItemIndex] = useState<number | null>(null);
  const [editShipmentCharge, setEditShipmentCharge] = useState("0");
  const [editExtraAmount, setEditExtraAmount] = useState("0");
  const [editExtraAmountDescription, setEditExtraAmountDescription] =
    useState("");
  const [showEditExtraDesc, setShowEditExtraDesc] = useState(false);
  const [editDiscount, setEditDiscount] = useState("0");
  const [editDiscountType, setEditDiscountType] = useState<"amount" | "percent" | "per_brick">("amount");
  const [editPaidAmount, setEditPaidAmount] = useState("0");
  const [editPaymentMethod, setEditPaymentMethod] = useState("Cash");
  const [editDeliveryPartnerId, setEditDeliveryPartnerId] = useState("");
  const [editStatus, setEditStatus] = useState("pending");
  const [editDeliveredQty, setEditDeliveredQty] = useState("0");
  const [editShipmentDistance, setEditShipmentDistance] = useState("0");
  const [editDeliveryRateType, setEditDeliveryRateType] = useState("fixed amount");
  const [editDeliveryRate, setEditDeliveryRate] = useState("0");
  const [editDeliveryMinRate, setEditDeliveryMinRate] = useState("0");
  const [editCollectorId, setEditCollectorId] = useState("");
  const [editLoadingWorkerId, setEditLoadingWorkerId] = useState("");
  const [editUnloadingWorkerId, setEditUnloadingWorkerId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deliveryInputs, setDeliveryInputs] = useState<Record<string, string>>({});
  const [isEditDeliveryModalOpen, setIsEditDeliveryModalOpen] = useState(false);
  const [editDeliveryOrderId, setEditDeliveryOrderId] = useState("");
  const [editDeliveryIndex, setEditDeliveryIndex] = useState<number | null>(null);
  const [editDeliveryQty, setEditDeliveryQty] = useState("");
  const [editDeliveryDate, setEditDeliveryDate] = useState<Date>(new Date());
  const [editDeliveryHour, setEditDeliveryHour] = useState("12");
  const [editDeliveryMinute, setEditDeliveryMinute] = useState("00");
  const [editDeliveryAmPm, setEditDeliveryAmPm] = useState("AM");
  const [editDeliveryEntryPartnerId, setEditDeliveryEntryPartnerId] = useState("");
  const [editDeliveryNotes, setEditDeliveryNotes] = useState("");
  const [isDeliveryCalendarOpen, setIsDeliveryCalendarOpen] = useState(false);

  // Search & add new item in edit modal
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedItemQty, setSelectedItemQty] = useState("1");
  const [selectedItemRate, setSelectedItemRate] = useState("0");
  const [itemSearch, setItemSearch] = useState("");

  // Expense Form Modal State
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseStatus, setExpenseStatus] = useState<"Paid" | "Balance">(
    "Paid",
  );
  const [expenseTotalAmount, setExpenseTotalAmount] = useState("");
  const [expensePaidAmount, setExpensePaidAmount] = useState("");
  const [expensePaymentMethod, setExpensePaymentMethod] = useState("Cash");
  const [expenseDate, setExpenseDate] = useState<Date>(new Date());
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseBillImageUri, setExpenseBillImageUri] = useState<string | null>(
    null,
  );
  const [existingBillImageUrl, setExistingBillImageUrl] = useState<
    string | null
  >(null);
  const [isExpenseCalendarOpen, setIsExpenseCalendarOpen] = useState(false);
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  // Pay Modal State
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payOrder, setPayOrder] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState<Date>(new Date());
  const [isPayCalendarOpen, setIsPayCalendarOpen] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#00D68F";
      case "in-transit":
        return "#3B82F6";
      case "pending":
        return "#F59E0B";
      case "cancelled":
        return "#EF4444";
      case "purchase":
        return "#b45309";
      default:
        return "#5A5F72";
    }
  };

  const matchesDateFilter = useCallback((rawDate: any) => {
    if (dateFilterPreset === "all" && !selectedFilterDate) return true;
    if (!rawDate) return false;
    const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (isNaN(d.getTime())) return false;

    const now = new Date();

    if (dateFilterPreset === "today") {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }

    if (dateFilterPreset === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return (
        d.getFullYear() === yesterday.getFullYear() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getDate() === yesterday.getDate()
      );
    }

    if (dateFilterPreset === "this_month") {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      );
    }

    if (selectedFilterDate) {
      return (
        d.getFullYear() === selectedFilterDate.getFullYear() &&
        d.getMonth() === selectedFilterDate.getMonth() &&
        d.getDate() === selectedFilterDate.getDate()
      );
    }

    return true;
  }, [dateFilterPreset, selectedFilterDate]);

  const targetOrder = useMemo(() => {
    if (!focusedOrderId) return null;
    return (orders || []).find((o: any) => o.id === focusedOrderId);
  }, [focusedOrderId, orders]);

  const filteredOrders = useMemo(() => {
    if (focusedOrderId && targetOrder) {
      return [targetOrder];
    }
    return (orders || []).filter((order: any) => {
      const q = debouncedSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        order.customerName?.toLowerCase().includes(q) ||
        order.customerPhone?.toLowerCase().includes(q) ||
        order.items?.some((itm: any) =>
          itm.itemName?.toLowerCase().includes(q),
        ) ||
        order.itemName?.toLowerCase().includes(q);

      const matchesStatus = filterStatus === "all" || order.status === filterStatus;
      const orderDate = order.createdAt || order.orderedDate;
      const matchesDate = matchesDateFilter(orderDate);

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [orders, debouncedSearch, filterStatus, matchesDateFilter, focusedOrderId, targetOrder]);

  const filteredExpenses = useMemo(() => {
    if (focusedOrderId && targetOrder) {
      return [];
    }
    return (expenses || []).filter((expense: any) => {
      const q = debouncedSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        expense.title?.toLowerCase().includes(q) ||
        expense.category?.toLowerCase().includes(q) ||
        expense.description?.toLowerCase().includes(q);

      const matchesStatus = filterStatus === "all";
      const matchesDate = matchesDateFilter(expense.expenseDate);

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [expenses, debouncedSearch, filterStatus, matchesDateFilter, focusedOrderId, targetOrder]);

  // Grouping both orders and expenses by date string
  const { groupedData, sortedDates } = useMemo(() => {
    const groups: Record<
      string,
      { date: Date; orders: any[]; expenses: any[] }
    > = {};

    filteredOrders.forEach((order: any) => {
      const dateObj =
        order.createdAt instanceof Date
          ? order.createdAt
          : new Date(order.createdAt || Date.now());
      const dateStr = dateObj.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      if (!groups[dateStr]) {
        groups[dateStr] = { date: dateObj, orders: [], expenses: [] };
      }
      groups[dateStr].orders.push(order);
    });

    filteredExpenses.forEach((expense: any) => {
      const dateObj =
        expense.expenseDate instanceof Date
          ? expense.expenseDate
          : new Date(expense.expenseDate || Date.now());
      const dateStr = dateObj.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      if (!groups[dateStr]) {
        groups[dateStr] = { date: dateObj, orders: [], expenses: [] };
      }
      groups[dateStr].expenses.push(expense);
    });

    const dates = Object.keys(groups).sort((a, b) => {
      return groups[b].date.getTime() - groups[a].date.getTime();
    });

    return { groupedData: groups, sortedDates: dates };
  }, [filteredOrders, filteredExpenses]);

  const renderExpenseTimelineCard = useCallback((expense: any) => {
    const isBalance =
      expense.status === "Balance" ||
      expense.paymentMethod === "Balance" ||
      (expense.remainingAmount !== undefined && expense.remainingAmount > 0);

    return (
      <View
        key={expense.id}
        style={[
          styles.card,
          { borderLeftWidth: 4, borderLeftColor: colors.accent.danger },
        ]}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.clientName}>{expense.title}</Text>
            <Text style={styles.date}>
              {expense.category} • {expense.paymentMethod || "Paid"}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: "#fef2f2" }]}>
            <Text style={[styles.statusText, { color: colors.accent.danger }]}>
              Expense
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardBody}>
          {expense.description ? (
            <View style={styles.detailRow}>
              <Text style={styles.bodyLabel}>Notes</Text>
              <Text style={styles.bodyValue}>{expense.description}</Text>
            </View>
          ) : null}

          <View style={[styles.detailRow, { marginTop: 4 }]}>
            <Text style={styles.bodyLabel}>Total Expense Amount</Text>
            <Text style={[styles.totalValue, { color: colors.accent.danger }]}>
              ₹
              {Number(
                expense.totalAmount || expense.amount || 0,
              ).toLocaleString("en-IN")}
            </Text>
          </View>

          {isBalance && (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.bodyLabel}>Paid Amount</Text>
                <Text
                  style={[
                    styles.bodyValue,
                    { color: "#16a34a", fontWeight: "700" },
                  ]}
                >
                  ₹{Number(expense.paidAmount || 0).toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.bodyLabel}>Remaining Due</Text>
                <Text
                  style={[styles.balanceValue, { color: colors.accent.danger }]}
                >
                  ₹
                  {Number(expense.remainingAmount || 0).toLocaleString("en-IN")}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.cardActions}>
          <Pressable
            style={[styles.actionBtn, styles.editBtn]}
            onPress={() => handleOpenEditExpense(expense)}
          >
            <MaterialIcons name="edit" size={16} color="#3B82F6" />
            <Text style={[styles.actionBtnText, { color: "#3B82F6" }]}>
              Edit
            </Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDeleteExpense(expense)}
          >
            <MaterialIcons
              name="delete"
              size={16}
              color={colors.accent.danger}
            />
            <Text
              style={[styles.actionBtnText, { color: colors.accent.danger }]}
            >
              Delete
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }, [styles, colors]);

  const renderDateHeader = useCallback((
    dateStr: string,
    revenue: number,
    expenseTotal: number,
  ) => {
    const netCashflow = revenue - expenseTotal;
    const netColor = netCashflow >= 0 ? "#16a34a" : colors.accent.danger;
    return (
      <View style={styles.dateHeaderCard}>
        <View style={styles.dateHeaderTop}>
          <MaterialIcons
            name="calendar-today"
            size={16}
            color={colors.text.secondary}
          />
          <Text style={styles.dateHeaderText}>{dateStr}</Text>
        </View>
        <View style={styles.dailySummaryRow}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryColLabel}>Sales</Text>
            <Text style={styles.summaryColVal}>
              ₹{revenue.toLocaleString("en-IN")}
            </Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryColLabel}>Expenses</Text>
            <Text
              style={[styles.summaryColVal, { color: colors.accent.danger }]}
            >
              ₹{expenseTotal.toLocaleString("en-IN")}
            </Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryColLabel}>Net Flow</Text>
            <Text style={[styles.summaryColVal, { color: netColor }]}>
              {netCashflow >= 0 ? "+" : ""}₹
              {netCashflow.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>
      </View>
    );
  }, [styles, colors]);

  // Sync custom rate states with the selected partner's settings inside edit order modal
  React.useEffect(() => {
    if (!editModalVisible || !selectedOrder) return;
    
    if (editDeliveryPartnerId === selectedOrder.deliveryPartnerId) {
      const partner = partners.find((p: any) => p.id === editDeliveryPartnerId);
      setEditDeliveryRateType(selectedOrder.deliveryRateType || partner?.deliveryRateType || "fixed amount");
      setEditDeliveryRate(String(selectedOrder.deliveryRate !== undefined ? selectedOrder.deliveryRate : (partner?.deliveryRate || 0)));
      setEditDeliveryMinRate(String(selectedOrder.deliveryMinRate !== undefined ? selectedOrder.deliveryMinRate : (partner?.minimumRate || 0)));
      setEditShipmentDistance(String(selectedOrder.shipmentDistance || 0));
    } else {
      const partner = partners.find((p: any) => p.id === editDeliveryPartnerId);
      if (partner) {
        setEditDeliveryRateType(partner.deliveryRateType || "fixed amount");
        setEditDeliveryRate(String(partner.deliveryRate || 0));
        setEditDeliveryMinRate(String(partner.minimumRate || 0));
      } else {
        setEditDeliveryRateType("fixed amount");
        setEditDeliveryRate("0");
        setEditDeliveryMinRate("0");
      }
    }
  }, [editDeliveryPartnerId, editModalVisible, selectedOrder, partners]);

  // Auto-calculate shipment charge when delivery partner or distance or items change inside edit modal
  useEffect(() => {
    if (!editModalVisible || !selectedOrder) return;

    // Check if the current edit parameters match selectedOrder's saved properties
    const isUnchangedFromOrder =
      editDeliveryPartnerId === (selectedOrder.deliveryPartnerId || "") &&
      editDeliveryRateType === (selectedOrder.deliveryRateType || (partners.find((p: any) => p.id === editDeliveryPartnerId)?.deliveryRateType || "fixed amount")) &&
      editDeliveryRate === String(selectedOrder.deliveryRate !== undefined ? selectedOrder.deliveryRate : (partners.find((p: any) => p.id === editDeliveryPartnerId)?.deliveryRate || 0)) &&
      editDeliveryMinRate === String(selectedOrder.deliveryMinRate !== undefined ? selectedOrder.deliveryMinRate : (partners.find((p: any) => p.id === editDeliveryPartnerId)?.minimumRate || 0)) &&
      editShipmentDistance === String(selectedOrder.shipmentDistance || 0) &&
      JSON.stringify(editItems.map((i: any) => ({ id: i.itemId, q: i.quantity, r: i.rate }))) ===
        JSON.stringify(
          (selectedOrder.items || (selectedOrder.itemId ? [{ itemId: selectedOrder.itemId, quantity: selectedOrder.quantity, rate: selectedOrder.rate }] : [])).map((i: any) => ({ id: i.itemId, q: i.quantity, r: i.rate }))
        );

    // If user explicitly customized shipment charge, don't overwrite it automatically
    if (isShipmentCustomized) {
      return;
    }

    // If edit settings match selectedOrder, preserve the saved shipment charge
    if (isUnchangedFromOrder && selectedOrder.shipmentCharge !== undefined) {
      return;
    }

    if (!editDeliveryPartnerId) {
      if (editDeliveryPartnerId !== selectedOrder.deliveryPartnerId) {
        setEditShipmentCharge("0");
      }
      return;
    }
    const rateType = editDeliveryRateType;
    const rateVal = parseFloat(editDeliveryRate) || 0;
    const minRateVal = parseFloat(editDeliveryMinRate) || 0;

    let calculatedCharge = 0;
    if (rateType === "kilometre") {
      const dist = parseFloat(editShipmentDistance) || 0;
      calculatedCharge = Math.max(dist * rateVal, minRateVal);
    } else if (rateType === "per brick") {
      const totalQty = editItems.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      );
      calculatedCharge = Math.max(totalQty * rateVal, minRateVal);
    } else {
      // fixed amount
      calculatedCharge = Math.max(rateVal, minRateVal);
    }

    setEditShipmentCharge(String(calculatedCharge));
  }, [
    editDeliveryPartnerId,
    editDeliveryRateType,
    editDeliveryRate,
    editDeliveryMinRate,
    editShipmentDistance,
    editItems,
    editModalVisible,
    selectedOrder,
    partners,
    isShipmentCustomized,
  ]);

  const handleSelectItemForEdit = (itemId: string) => {
    const item = itemByIdMap.get(itemId);
    if (item) {
      setSelectedItemId(itemId);
      
      let selectedRate = item.sellingRate || item.sellingPrice || 0;
      if (selectedOrder && selectedOrder.customerId) {
        const customer = customerByIdMap.get(selectedOrder.customerId);
        if (customer && customer.isSpecial && item.specialRates && item.specialRates[customer.id] !== undefined) {
          selectedRate = item.specialRates[customer.id];
        }
      }
      setSelectedItemRate(String(selectedRate));
    }
  };

  const handleAddItemToEdit = () => {
    if (!selectedItemId) {
      Alert.alert("Error", "Please select a product to add.");
      return;
    }
    const qty = Number(selectedItemQty);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert("Error", "Quantity must be positive.");
      return;
    }
    const rate = Number(selectedItemRate);
    if (isNaN(rate) || rate < 0) {
      Alert.alert("Error", "Rate must be positive.");
      return;
    }

    const itemObj = itemByIdMap.get(selectedItemId);
    if (!itemObj) return;

    // Check inventory stock limit
    const availableStock =
      itemObj.openingStock !== undefined
        ? itemObj.openingStock
        : itemObj.stock || 0;

    const originalItemQty = selectedOrder?.items
      ? selectedOrder.items.find((itm: any) => itm.itemId === selectedItemId)
          ?.quantity || 0
      : selectedOrder?.itemId === selectedItemId
        ? selectedOrder?.quantity
        : 0;

    const totalAllowedStock = Number(availableStock) + Number(originalItemQty);

    if (editingEditItemIndex !== null) {
      const existingOtherQty = editItems
        .filter((_, idx) => idx !== editingEditItemIndex && editItems[idx].itemId === selectedItemId)
        .reduce((sum, itm) => sum + Number(itm.quantity || 0), 0);

      if (existingOtherQty + qty > totalAllowedStock) {
        Alert.alert(
          "Low Stock",
          `Only ${availableStock} units available in inventory (+${originalItemQty} already in this order). Total allowed: ${totalAllowedStock}.`,
        );
        return;
      }

      const updated = [...editItems];
      updated[editingEditItemIndex] = {
        ...updated[editingEditItemIndex],
        itemId: selectedItemId,
        itemName: itemObj.itemName,
        quantity: qty,
        rate: rate,
        rateType: itemObj.rateType || "piece",
        grossTotal: qty * rate,
      };
      setEditItems(updated);
      setEditingEditItemIndex(null);
    } else {
      const existingQty = editItems
        .filter((itm) => itm.itemId === selectedItemId)
        .reduce((sum, itm) => sum + Number(itm.quantity || 0), 0);

      if (existingQty + qty > totalAllowedStock) {
        Alert.alert(
          "Low Stock",
          `Only ${availableStock} units available in inventory (+${originalItemQty} already in this order). Total allowed: ${totalAllowedStock}.`,
        );
        return;
      }

      const existingIdx = editItems.findIndex(
        (itm) => itm.itemId === selectedItemId && itm.rate === rate,
      );
      if (existingIdx > -1) {
        const updated = [...editItems];
        updated[existingIdx].quantity += qty;
        updated[existingIdx].grossTotal = updated[existingIdx].quantity * rate;
        setEditItems(updated);
      } else {
        setEditItems([
          ...editItems,
          {
            itemId: selectedItemId,
            itemName: itemObj.itemName,
            quantity: qty,
            rate: rate,
            rateType: itemObj.rateType || "piece",
            grossTotal: qty * rate,
          },
        ]);
      }
    }

    // Reset add item inputs
    setSelectedItemId("");
    setSelectedItemQty("1");
    setSelectedItemRate("0");
    setItemSearch("");
  };

  const handleEditItemInEditModal = (index: number) => {
    const targetItem = editItems[index];
    if (!targetItem) return;
    setSelectedItemId(targetItem.itemId);
    setSelectedItemQty(String(targetItem.quantity));
    setSelectedItemRate(String(targetItem.rate));
    setEditingEditItemIndex(index);
  };

  const handleCancelEditItemInEditModal = () => {
    setEditingEditItemIndex(null);
    setSelectedItemId("");
    setSelectedItemQty("1");
    setSelectedItemRate("0");
    setItemSearch("");
  };

  const handleUpdateEditItemQuantity = (index: number, newQtyStr: string) => {
    const updated = [...editItems];
    const targetItem = updated[index];
    if (!targetItem) return;

    if (newQtyStr === "") {
      updated[index] = { ...targetItem, quantity: "", grossTotal: 0 };
      setEditItems(updated);
      return;
    }

    const qty = parseInt(newQtyStr);
    if (isNaN(qty)) return;

    const itemObj = itemByIdMap.get(targetItem.itemId);
    const availableStock = itemObj ? (itemObj.openingStock !== undefined ? itemObj.openingStock : (itemObj.stock || 0)) : 999999;
    const originalItemQty = selectedOrder?.items
      ? selectedOrder.items.find((itm: any) => itm.itemId === targetItem.itemId)?.quantity || 0
      : selectedOrder?.itemId === targetItem.itemId ? selectedOrder?.quantity : 0;
    const totalAllowedStock = Number(availableStock) + Number(originalItemQty);

    const existingOtherQty = editItems
      .filter((_, idx) => idx !== index && editItems[idx].itemId === targetItem.itemId)
      .reduce((sum, itm) => sum + Number(itm.quantity || 0), 0);

    if (qty > 0 && existingOtherQty + qty > totalAllowedStock) {
      Alert.alert("Low Stock", `Stock exceeded for "${targetItem.itemName}". Total allowed: ${totalAllowedStock}.`);
      return;
    }

    const finalQty = Math.max(0, qty);
    const currentRate = Number(targetItem.rate) || 0;
    updated[index] = {
      ...targetItem,
      quantity: finalQty,
      grossTotal: finalQty * currentRate,
    };
    setEditItems(updated);
  };

  const handleUpdateEditItemRate = (index: number, newRateStr: string) => {
    const updated = [...editItems];
    const targetItem = updated[index];
    if (!targetItem) return;

    if (newRateStr === "") {
      updated[index] = { ...targetItem, rate: "", grossTotal: 0 };
      setEditItems(updated);
      return;
    }

    const rate = parseFloat(newRateStr);
    if (isNaN(rate)) return;

    const currentQty = Number(targetItem.quantity) || 0;
    updated[index] = {
      ...targetItem,
      rate: Math.max(0, rate),
      grossTotal: currentQty * Math.max(0, rate),
    };
    setEditItems(updated);
  };

  const handleRemoveItemFromEdit = (index: number) => {
    if (editingEditItemIndex === index) {
      handleCancelEditItemInEditModal();
    } else if (editingEditItemIndex !== null && editingEditItemIndex > index) {
      setEditingEditItemIndex(editingEditItemIndex - 1);
    }
    setEditItems(editItems.filter((_, idx) => idx !== index));
  };

  const handleDeleteRawMaterialOrder = (orderId: string, order: any) => {
    Alert.alert(
      "Confirm Rollback",
      `Are you sure you want to delete/rollback this raw material purchase for "${order.items[0]?.itemName || "Material"}"? This will revert the material stock count and adjust the supplier balance due.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete & Rollback",
          style: "destructive",
          onPress: async () => {
            try {
              const success = await deleteTransaction(orderId);
              if (success) {
                Alert.alert(
                  "Success",
                  "Raw material purchase has been rolled back.",
                );
              } else {
                Alert.alert(
                  "Error",
                  "Could not delete/rollback purchase transaction.",
                );
              }
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to rollback.");
            }
          },
        },
      ],
    );
  };

  const handleEditRawMaterialOrder = (order: any) => {
    setSelectedOrder(order);

    // Find the original log entry associated with this order
    const log = logs.find((l: any) => l.id === order.id);
    if (!log) {
      Alert.alert("Error", "Could not find transaction log details.");
      return;
    }

    setEditRawQty(String(log.quantity || ""));
    setEditRawCost(String(log.costPerUnit || ""));
    setEditRawPaid(
      String(
        log.amountPaid !== undefined
          ? log.amountPaid
          : (Number(log.totalCost || 0) - Number(log.remainingBalance || 0)),
      ),
    );
    setEditRawSupplierId(log.supplierId || "");
    setEditRawMaterialId(log.materialId || "");
    setEditRawNotes(log.notes || "");
    setEditOrderDate(log.date ? normalizeDateValue(log.date) : (log.createdAt ? normalizeDateValue(log.createdAt) : new Date()));
    setEditRawPaymentStatus(
      Number(log.remainingBalance || 0) > 0 ? "balance" : "fully",
    );
    setShowEditRawSupplierDropdown(false);
    setShowEditRawMaterialDropdown(false);

    setEditModalVisible(true);
  };

  const handleSaveRawMaterialEdit = async () => {
    const parsedQty = parseFloat(editRawQty);
    const unitCost = parseFloat(editRawCost);

    if (isNaN(parsedQty) || parsedQty <= 0) {
      Alert.alert("Error", "Please enter a valid quantity greater than 0.");
      return;
    }

    if (isNaN(unitCost) || unitCost < 0) {
      Alert.alert("Error", "Cost price cannot be negative.");
      return;
    }

    const totalVal = parsedQty * unitCost;
    let paidVal = totalVal;
    let remainingVal = 0;

    if (editRawPaymentStatus === "balance") {
      paidVal = editRawPaid.trim() ? parseFloat(editRawPaid) : 0;
      if (isNaN(paidVal) || paidVal < 0 || paidVal > totalVal) {
        Alert.alert(
          "Error",
          `Amount Paid must be between 0 and total cost (₹${totalVal.toFixed(2)}).`,
        );
        return;
      }
      remainingVal = totalVal - paidVal;

      if (remainingVal > 0 && !editRawSupplierId) {
        Alert.alert(
          "Error",
          "Please select a supplier to log a purchase with an outstanding balance.",
        );
        return;
      }
    }

    const supplierObj = supplierByIdMap.get(editRawSupplierId);
    const materialObj = editRawMaterialId ? itemByIdMap.get(editRawMaterialId) : null;

    setIsSaving(true);
    try {
      const success = await updateTransaction(selectedOrder.id, {
        quantity: parsedQty,
        costPerUnit: unitCost,
        totalCost: totalVal,
        amountPaid: paidVal,
        remainingBalance: remainingVal,
        supplierId: editRawSupplierId || null,
        supplierName: supplierObj ? supplierObj.name : null,
        materialId: editRawMaterialId || selectedOrder.materialId || null,
        materialName: materialObj ? materialObj.itemName : (selectedOrder.items?.[0]?.itemName || null),
        date: editOrderDate,
        notes: editRawNotes.trim(),
      });

      setIsSaving(false);
      if (success) {
        setSelectedOrder(null);
        setEditModalVisible(false);
        Alert.alert("Success", "Raw material purchase updated successfully.");
      } else {
        Alert.alert("Error", "Failed to update raw material purchase.");
      }
    } catch (err: any) {
      setIsSaving(false);
      Alert.alert("Error", err.message || "An unexpected error occurred.");
    }
  };

  const handleStatusChangeInEditModal = (newStatus: string) => {
    setEditStatus(newStatus);
    const totalQty = editItems.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );

    if (newStatus === "completed") {
      setEditDeliveredQty(String(totalQty));
    } else if (newStatus === "pending") {
      const currentDel = Number(editDeliveredQty) || 0;
      if (currentDel >= totalQty && totalQty > 0) {
        setEditDeliveredQty("0");
      }
    } else if (newStatus === "in-transit") {
      const currentDel = Number(editDeliveredQty) || 0;
      if (currentDel === 0 && totalQty > 0) {
        setEditDeliveredQty(String(Math.min(totalQty, Math.max(1, Math.floor(totalQty / 2)))));
      }
    }
  };

  const handleDeliveredQtyChangeInEditModal = (val: string) => {
    setEditDeliveredQty(val);
    const delQty = Number(val) || 0;
    const totalQty = editItems.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );

    if (totalQty > 0) {
      if (delQty >= totalQty) {
        setEditStatus("completed");
      } else if (delQty > 0) {
        if (editStatus === "completed" || editStatus === "pending") {
          setEditStatus("in-transit");
        }
      } else if (delQty === 0) {
        if (editStatus === "completed") {
          setEditStatus("pending");
        }
      }
    }
  };

  const handleEditOrder = (order: any) => {
    setSelectedOrder(order);
    const partner = partnerByIdMap.get(order.deliveryPartnerId);
    setEditItems(
      order.items && order.items.length > 0
        ? order.items.map((itm: any) => ({
            ...itm,
            grossTotal: itm.grossTotal !== undefined ? itm.grossTotal : (Number(itm.quantity || 0) * Number(itm.rate || 0)),
          }))
        : order.itemId
          ? [
              {
                itemId: order.itemId,
                itemName: order.itemName,
                quantity: order.quantity,
                rate: order.rate,
                rateType: order.rateType || "piece",
                grossTotal: order.grossTotal !== undefined ? order.grossTotal : (Number(order.quantity || 0) * Number(order.rate || 0)),
              },
            ]
          : [],
    );

    setEditOrderDate(
      order.orderedDate
        ? normalizeDateValue(order.orderedDate)
        : (order.createdAt ? normalizeDateValue(order.createdAt) : new Date())
    );
    setEditCustomerId(order.customerId || "");
    setEditCustomerName(order.customerName || "");
    setEditCustomerPhone(order.customerPhone || "");
    setShowEditCustomerDropdown(false);
    setCustomerSearchQuery("");

    setEditShipmentCharge(String(order.shipmentCharge !== undefined ? order.shipmentCharge : 0));
    setIsShipmentCustomized(false);
    setEditExtraAmount(String(order.extraAmount !== undefined ? order.extraAmount : 0));
    setEditExtraAmountDescription(order.extraAmountDescription || "");
    setShowEditExtraDesc(!!order.extraAmountDescription);
    setEditDiscount(String(order.discount !== undefined ? order.discount : 0));
    setEditDiscountType(order.discountType || "amount");
    setEditPaidAmount(String(order.paidAmount !== undefined ? order.paidAmount : (order.amountPaid !== undefined ? order.amountPaid : 0)));
    setEditPaymentMethod(order.paymentMethod || order.paymentMode || order.paymentType || "Cash");
    setEditDeliveryPartnerId(order.deliveryPartnerId || "");
    setEditDeliveryRateType(order.deliveryRateType || partner?.deliveryRateType || "fixed amount");
    setEditDeliveryRate(String(order.deliveryRate !== undefined ? order.deliveryRate : (partner?.deliveryRate || 0)));
    setEditDeliveryMinRate(String(order.deliveryMinRate !== undefined ? order.deliveryMinRate : (partner?.minimumRate || 0)));
    setEditShipmentDistance(String(order.shipmentDistance !== undefined ? order.shipmentDistance : 0));
    setEditStatus(order.status || "pending");
    setEditDeliveredQty(String(order.deliveredQuantity || 0));
    setEditCollectorId(order.collectorId || "");
    setEditLoadingWorkerId(order.loadingWorkerId || "");
    setEditUnloadingWorkerId(order.unloadingWorkerId || "");
    setEditModalVisible(true);
    // Reset add item fields
    setSelectedItemId("");
    setSelectedItemQty("1");
    setSelectedItemRate("0");
    setItemSearch("");
  };

  const handleSaveEdit = async () => {
    if (editItems.length === 0) {
      Alert.alert("Error", "Please add at least one product to the order.");
      return;
    }
    for (const itm of editItems) {
      const itemObj = itemByIdMap.get(itm.itemId);
      if (itemObj) {
        const availableStock =
          itemObj.openingStock !== undefined
            ? itemObj.openingStock
            : itemObj.stock || 0;
        const originalQty = selectedOrder?.items
          ? selectedOrder.items.find((x: any) => x.itemId === itm.itemId)
              ?.quantity || 0
          : selectedOrder?.itemId === itm.itemId
            ? selectedOrder?.quantity
            : 0;

        const totalAllowedStock = Number(availableStock) + Number(originalQty);
        if (itm.quantity > totalAllowedStock) {
          Alert.alert(
            "Low Stock",
            `Stock exceeded for "${itm.itemName}". Available: ${availableStock} (+${originalQty} in this order). You requested ${itm.quantity}.`,
          );
          return;
        }
      }
    }

    setIsSaving(true);
    try {
      const partnerObj = partnerByIdMap.get(editDeliveryPartnerId);
      const deliveryPartnerName = partnerObj ? partnerObj.name : null;

      const totalQty = editItems.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      );
      const parsedDeliveredQty = Math.max(0, Math.min(totalQty, Number(editDeliveredQty) || 0));

      let finalStatus = editStatus;
      if (parsedDeliveredQty >= totalQty && totalQty > 0 && editStatus !== "cancelled") {
        finalStatus = "completed";
      } else if (parsedDeliveredQty > 0 && parsedDeliveredQty < totalQty && (editStatus === "pending" || editStatus === "completed")) {
        finalStatus = "in-transit";
      }

      const prevDeliveredQty = Number(selectedOrder.deliveredQuantity || 0);
      let newDeliveries = selectedOrder.deliveries || [];

      if (parsedDeliveredQty > prevDeliveredQty) {
        const addedQty = parsedDeliveredQty - prevDeliveredQty;
        newDeliveries = [
          ...newDeliveries,
          {
            date: new Date(),
            quantity: addedQty,
            deliveryPartnerId: editDeliveryPartnerId || null,
          },
        ];
      } else if (parsedDeliveredQty === totalQty && finalStatus === "completed" && newDeliveries.length === 0) {
        newDeliveries = [
          {
            date: new Date(),
            quantity: totalQty,
            deliveryPartnerId: editDeliveryPartnerId || null,
          },
        ];
      } else if (parsedDeliveredQty < prevDeliveredQty) {
        let accumulated = 0;
        const trimmedDeliveries: any[] = [];
        for (const del of newDeliveries) {
          if (accumulated + Number(del.quantity || 0) <= parsedDeliveredQty) {
            trimmedDeliveries.push(del);
            accumulated += Number(del.quantity || 0);
          } else if (accumulated < parsedDeliveredQty) {
            const partial = parsedDeliveredQty - accumulated;
            trimmedDeliveries.push({ ...del, quantity: partial });
            accumulated += partial;
            break;
          }
        }
        newDeliveries = trimmedDeliveries;
      }

      const collectorObj = collectors ? (collectors.find((c: any) => c.id === editCollectorId) || null) : null;
      const collectorName = collectorObj ? collectorObj.name : null;

      // Fast path: try O(1) id lookup first, then fall back to name/phone match
      const customerObj = (selectedOrder?.customerId && customerByIdMap.get(selectedOrder.customerId)) ||
        (customers || []).find((c: any) =>
          (c.name && selectedOrder?.customerName && c.name.trim().toLowerCase() === selectedOrder.customerName.trim().toLowerCase()) ||
          (c.phone && selectedOrder?.customerPhone && c.phone.trim() === selectedOrder.customerPhone.trim())
        );

      const customerCurrentPending = customerObj
        ? (customerObj.totalPending !== undefined ? Number(customerObj.totalPending) : Number(customerObj.balance || 0))
        : 0;

      const originalOrderUnpaid = Number(selectedOrder?.balanceDue || 0);
      const oldBalanceDue = selectedOrder?.previousBalance !== undefined
        ? Number(selectedOrder.previousBalance)
        : Math.max(0, customerCurrentPending - originalOrderUnpaid);

      const finalCustomerId = editCustomerId || selectedOrder?.customerId || null;
      const finalCustomerName = editCustomerName.trim() || selectedOrder?.customerName || "General Customer";
      const finalCustomerPhone = editCustomerPhone.trim() || selectedOrder?.customerPhone || "";

      const newOrderPayload = {
        ...selectedOrder,
        customerId: finalCustomerId,
        customerName: finalCustomerName,
        customerPhone: finalCustomerPhone,
        orderedDate: editOrderDate,
        createdAt: editOrderDate,
        items: editItems,
        grossTotal: editGrossTotal,
        shipmentCharge: editShipmentVal,
        shipmentDistance: Number(editShipmentDistance) || 0,
        deliveryRateType: editDeliveryRateType,
        deliveryRate: Number(editDeliveryRate) || 0,
        deliveryMinRate: Number(editDeliveryMinRate) || 0,
        extraAmount: editExtraVal,
        extraAmountDescription: editExtraAmountDescription.trim(),
        discount: discountVal,
        discountType: editDiscountType,
        discountAmount: editDiscountAmount,
        collectorId: editCollectorId || null,
        collectorName: collectorName,
        loadingWorkerId: editLoadingWorkerId || null,
        loadingWorkerName: loadingWorkerName,
        loadingCharge: editLoadingCharge,
        unloadingWorkerId: editUnloadingWorkerId || null,
        unloadingWorkerName: unloadingWorkerName,
        unloadingCharge: editUnloadingCharge,
        total: editTotalVal,
        paidAmount: editPaidVal,
        amountPaid: editPaidVal,
        advancePaid: editPaidVal,
        paymentMethod: editPaymentMethod || "Cash",
        paymentMode: editPaymentMethod || "Cash",
        paymentType: editPaymentMethod || "Cash",
        balanceDue: editBalanceDueVal,
        previousBalance: oldBalanceDue,
        status: finalStatus,
        deliveryPartnerId: editDeliveryPartnerId || null,
        deliveryPartnerName: deliveryPartnerName,
        deliveredQuantity: parsedDeliveredQty,
        deliveries: newDeliveries,
      };

      const success = await editOrder(
        selectedOrder.id,
        newOrderPayload,
        selectedOrder,
      );
      if (success) {
        setSelectedOrder(null);
        setEditModalVisible(false);
        Alert.alert("Success", "Order updated successfully.");
      } else {
        Alert.alert("Error", "Failed to update order.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not save order edits.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOrder = (orderId: string, orderData: any) => {
    Alert.alert(
      "Delete Order",
      `Are you sure you want to delete the order for "${orderData.customerName || "Customer"}"? This will restore product stock counts and adjust the client balance.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const success = await deleteOrder(orderId, orderData);
              if (success) {
                Alert.alert("Success", "Order deleted successfully.");
              } else {
                Alert.alert("Error", "Failed to delete order.");
              }
            } catch (err: any) {
              console.error("Delete order error:", err);
              Alert.alert("Error", err?.message || "Failed to delete order.");
            }
          },
        },
      ],
    );
  };

  const handleOpenPayModal = (order: any) => {
    setPayOrder(order);
    const customerObj = (order.customerId && (entityByIdMap.get(order.customerId) || customerByIdMap.get(order.customerId))) ||
      (customers || []).find((c: any) =>
        (c.name && order.customerName && c.name.trim().toLowerCase() === order.customerName.trim().toLowerCase()) ||
        (c.phone && order.customerPhone && c.phone.trim() === order.customerPhone.trim())
      );

    const customerPending = customerObj
      ? (customerObj.totalPending !== undefined ? Number(customerObj.totalPending) : Number(customerObj.balance || 0))
      : 0;

    let due = 0;
    if (customerPending > 0) {
      due = customerPending;
    } else if (order.isRawMaterialOrder) {
      const log = logs?.find((l: any) => l.id === order.id);
      due = Number(order.balanceDue !== undefined ? order.balanceDue : (log?.remainingBalance || 0));
    } else {
      due = Number(order.balanceDue !== undefined ? order.balanceDue : (Number(order.total || 0) - Number(order.paidAmount || 0)));
    }
    setPayAmount(due > 0 ? String(due) : "");
    setPayMethod("Cash");
    setPayNotes("");
    setPayDate(new Date());
    setIsPayModalOpen(true);
  };

  const handleSavePayment = async () => {
    if (!payOrder || isSavingPayment) return;
    const parsedAmt = parseFloat(payAmount);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount greater than zero.");
      return;
    }

    setIsSavingPayment(true);
    try {
      if (payOrder.isRawMaterialOrder) {
        const log = logs?.find((l: any) => l.id === payOrder.id);
        if (!log) {
          Alert.alert("Error", "Could not locate raw material purchase details.");
          setIsSavingPayment(false);
          return;
        }
        const currentPaid = Number(
          log.amountPaid !== undefined
            ? log.amountPaid
            : (Number(log.totalCost || 0) - Number(log.remainingBalance || 0))
        );
        const totalCost = Number(log.totalCost || payOrder.total || 0);
        const newPaid = currentPaid + parsedAmt;
        const newRemaining = Math.max(0, totalCost - newPaid);

        const success = await updateTransaction(payOrder.id, {
          ...log,
          amountPaid: newPaid,
          remainingBalance: newRemaining,
          notes: payNotes ? `${log.notes || ""} [Pay: ${payNotes}]`.trim() : log.notes,
        });

        setIsSavingPayment(false);
        if (success) {
          setIsPayModalOpen(false);
          setPayOrder(null);
          Alert.alert("Success", `Payment of ₹${parsedAmt.toLocaleString("en-IN")} recorded for raw material purchase.`);
        } else {
          Alert.alert("Error", "Failed to record payment.");
        }
      } else {
        const currentPaid = Number(payOrder.paidAmount || 0);
        const orderTotal = Number(payOrder.total || 0);
        const newPaidAmount = currentPaid + parsedAmt;
        const newBalanceDue = Math.max(0, orderTotal - newPaidAmount);

        const updatedOrder = {
          ...payOrder,
          paidAmount: newPaidAmount,
          balanceDue: newBalanceDue,
          paymentMethod: payMethod || payOrder.paymentMethod || "Cash",
          paymentMode: payMethod || payOrder.paymentMode || "Cash",
          paymentType: payMethod || payOrder.paymentType || "Cash",
          updatedAt: new Date(),
        };

        const success = await editOrder(payOrder.id, updatedOrder, payOrder);

        try {
          const finalPayDate = new Date(payDate);
          const isDateOnly = (d: Date) => {
            if (!d || isNaN(d.getTime())) return true;
            const isLocalMidnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
            const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
            const isIstUtcMidnight = d.getHours() === 5 && d.getMinutes() === 30 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
            return isLocalMidnight || isUtcMidnight || isIstUtcMidnight;
          };
          if (isDateOnly(finalPayDate)) {
            const now = new Date();
            finalPayDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
          }

          await addDoc(collection(db, "payments"), {
            customerId: payOrder.customerId || null,
            customerName: payOrder.customerName || "Customer",
            amountReceived: parsedAmt,
            paymentMethod: payMethod || "Cash",
            paymentMode: payMethod || "Cash",
            paymentType: payMethod || "Cash",
            notes: payNotes ? `Order payment: ${payNotes}` : `Payment for Order #${payOrder.id.slice(-6).toUpperCase()}`,
            orderId: payOrder.id,
            createdAt: finalPayDate,
            date: finalPayDate,
            paymentDate: finalPayDate,
          });
        } catch (pErr) {
          console.error("Error logging payment record:", pErr);
        }

        setIsSavingPayment(false);
        if (success) {
          setIsPayModalOpen(false);
          setPayOrder(null);
          Alert.alert("Success", `Payment of ₹${parsedAmt.toLocaleString("en-IN")} recorded successfully.`);
        } else {
          Alert.alert("Error", "Failed to record payment for order.");
        }
      }
    } catch (err: any) {
      setIsSavingPayment(false);
      console.error("Pay order error:", err);
      Alert.alert("Error", err?.message || "Failed to record payment.");
    }
  };

  const handleOpenEditExpense = (expense: any) => {
    setEditingExpenseId(expense.id);
    setExpenseTitle(expense.title || "");
    setExpenseCategory(expense.category || "Miscellaneous");
    setExpenseStatus(expense.status || "Paid");
    setExpenseTotalAmount(String(expense.totalAmount || expense.amount || ""));
    setExpensePaidAmount(String(expense.paidAmount || expense.amount || ""));
    setExpensePaymentMethod(expense.paymentMethod || "Cash");
    setExpenseDate(new Date(expense.expenseDate || Date.now()));
    setExpenseDescription(expense.description || "");
    setExpenseBillImageUri(null);
    setExistingBillImageUrl(expense.billImageUrl || null);
    setExpenseModalVisible(true);
  };

  const handlePickImage = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Gallery permissions are required to upload bill receipts.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setExpenseBillImageUri(result.assets[0].uri);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not pick image.");
    }
  };

  const handleSaveExpense = async () => {
    const totalAmt = parseFloat(expenseTotalAmount);
    const paidAmt =
      expenseStatus === "Paid"
        ? totalAmt
        : parseFloat(expensePaidAmount || "0");
    const remainingAmt = expenseStatus === "Paid" ? 0 : totalAmt - paidAmt;

    if (!expenseTitle.trim()) {
      Alert.alert("Input Required", "Please enter an expense title.");
      return;
    }
    if (!expenseCategory.trim()) {
      Alert.alert("Input Required", "Please enter an expense category.");
      return;
    }
    if (isNaN(totalAmt) || totalAmt <= 0) {
      Alert.alert("Invalid Input", "Please enter a valid total amount.");
      return;
    }
    if (expenseStatus === "Balance") {
      if (isNaN(paidAmt) || paidAmt < 0) {
        Alert.alert("Invalid Input", "Please enter a valid paid amount.");
        return;
      }
      if (paidAmt > totalAmt) {
        Alert.alert("Invalid Input", "Paid amount cannot exceed total amount.");
        return;
      }
    }

    setIsSavingExpense(true);
    const data = {
      title: expenseTitle.trim(),
      amount: totalAmt,
      totalAmount: totalAmt,
      paidAmount: paidAmt,
      remainingAmount: remainingAmt,
      status: expenseStatus,
      category: expenseCategory,
      paymentMethod: expensePaymentMethod,
      expenseDate: expenseDate,
      description: expenseDescription.trim(),
      billImageUrl: existingBillImageUrl,
      billImageUri: expenseBillImageUri,
    };

    let success = false;
    if (editingExpenseId) {
      success = await updateExpense(editingExpenseId, data);
    } else {
      const newId = await addExpense(data);
      success = !!newId;
    }

    setIsSavingExpense(false);
    if (success) {
      Alert.alert(
        "Success",
        `Expense ${editingExpenseId ? "updated" : "saved"} successfully.`,
      );
      setExpenseModalVisible(false);
    } else {
      Alert.alert("Transaction Failed", "Could not submit data to registry.");
    }
  };

  const handleDeleteExpense = (expense: any) => {
    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to permanently delete "${expense.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const success = await deleteExpense(expense.id);
            if (success) {
              Alert.alert("Deleted", "Expense record has been deleted.");
            } else {
              Alert.alert("Error", "Could not delete expense.");
            }
          },
        },
      ],
    );
  };

  // Calculations for Edit Modal
  const editGrossTotal = editItems.reduce(
    (sum, itm) => sum + (itm.grossTotal || (Number(itm.quantity || 0) * Number(itm.rate || 0))),
    0,
  );
  const editTotalQty = editItems.reduce(
    (sum, itm) => sum + Number(itm.quantity || 0),
    0,
  );
  const editShipmentVal = Number(editShipmentCharge) || 0;
  const editExtraVal = Number(editExtraAmount) || 0;

  const loadingWorkerObj = workerByIdMap.get(editLoadingWorkerId);
  const loadingWorkerName = loadingWorkerObj ? loadingWorkerObj.name : null;
  const editLoadingCharge = loadingWorkerObj ? editTotalQty * Number(loadingWorkerObj.loadingCost || 0) : 0;

  const unloadingWorkerObj = workerByIdMap.get(editUnloadingWorkerId);
  const unloadingWorkerName = unloadingWorkerObj ? unloadingWorkerObj.name : null;
  const editUnloadingCharge = unloadingWorkerObj ? editTotalQty * Number(unloadingWorkerObj.unloadingCost || 0) : 0;

  const discountVal = parseFloat(editDiscount) || 0;
  const subtotalBeforeDiscount = editGrossTotal + editShipmentVal + editExtraVal + editLoadingCharge + editUnloadingCharge;
  const editDiscountAmount = editDiscountType === "percent"
    ? (subtotalBeforeDiscount * discountVal) / 100
    : editDiscountType === "per_brick"
    ? discountVal * editTotalQty
    : discountVal;

  const editTotalVal = Math.max(0, subtotalBeforeDiscount - editDiscountAmount);
  const editPaidVal = Number(editPaidAmount) || 0;
  const editBalanceDueVal = Math.max(0, editTotalVal - editPaidVal);

  const handleStartEditDelivery = (
    orderId: string,
    index: number,
    currentQty: number,
    currentDate: any,
    currentPartnerId?: string,
    currentNotes?: string
  ) => {
    const parsedDate = currentDate ? (currentDate.toDate ? currentDate.toDate() : new Date(currentDate)) : new Date();
    setEditDeliveryOrderId(orderId);
    setEditDeliveryIndex(index);
    setEditDeliveryQty(String(currentQty));
    setEditDeliveryDate(parsedDate);
    
    // Extract hours and minutes
    let hr = parsedDate.getHours();
    const ampm = hr >= 12 ? "PM" : "AM";
    hr = hr % 12;
    if (hr === 0) hr = 12;
    const min = parsedDate.getMinutes();
    
    setEditDeliveryHour(String(hr));
    setEditDeliveryMinute(String(min).padStart(2, "0"));
    setEditDeliveryAmPm(ampm);
    
    setEditDeliveryEntryPartnerId(currentPartnerId || "");
    setEditDeliveryNotes(currentNotes || "");
    setIsEditDeliveryModalOpen(true);
  };

  const handleSaveEditDelivery = async () => {
    if (editDeliveryIndex === null) return;
    const qty = parseInt(editDeliveryQty);
    
    if (isNaN(qty) || qty <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a valid number of bricks delivered.");
      return;
    }

    let finalHour = parseInt(editDeliveryHour) || 12;
    if (finalHour < 1 || finalHour > 12) {
      Alert.alert("Invalid Hour", "Hour must be between 1 and 12.");
      return;
    }
    const finalMin = parseInt(editDeliveryMinute) || 0;
    if (finalMin < 0 || finalMin > 59) {
      Alert.alert("Invalid Minute", "Minute must be between 0 and 59.");
      return;
    }
    if (editDeliveryAmPm === "PM" && finalHour < 12) {
      finalHour += 12;
    } else if (editDeliveryAmPm === "AM" && finalHour === 12) {
      finalHour = 0;
    }

    const finalDate = new Date(editDeliveryDate);
    finalDate.setHours(finalHour);
    finalDate.setMinutes(finalMin);
    finalDate.setSeconds(0);
    
    const order = customerOrders.find((o: any) => o.id === editDeliveryOrderId);
    if (!order) return;

    const originalDelivery = order.deliveries[editDeliveryIndex];
    const diff = qty - Number(originalDelivery.quantity);
    
    const totalQty = order.items && order.items.length > 0 
      ? order.items.reduce((sum: number, itm: any) => sum + Number(itm.quantity || 0), 0)
      : Number(order.quantity || 0);

    const nextDeliveredQuantity = (order.deliveredQuantity || 0) + diff;
    
    if (nextDeliveredQuantity > totalQty) {
      Alert.alert(
        "Exceeded Quantity",
        `Total delivered quantity (${nextDeliveredQuantity} bricks) cannot exceed the ordered quantity (${totalQty} bricks).`
      );
      return;
    }
    
    const nextDeliveries = order.deliveries.map((del: any, idx: number) => {
      if (idx === editDeliveryIndex) {
        return {
          ...del,
          quantity: qty,
          date: finalDate,
          deliveryPartnerId: editDeliveryEntryPartnerId,
          notes: editDeliveryNotes,
        };
      }
      return del;
    });
    
    const newStatus = nextDeliveredQuantity < totalQty ? "pending" : "completed";
    
    const updatedOrder = {
      ...order,
      deliveries: nextDeliveries,
      deliveredQuantity: nextDeliveredQuantity,
      status: newStatus,
    };
    
    setIsSaving(true);
    try {
      const success = await editOrder(order.id, updatedOrder, order);
      if (success) {
        Alert.alert("Success", "Delivery record updated successfully.");
        setIsEditDeliveryModalOpen(false);
      } else {
        Alert.alert("Error", "Failed to update delivery record.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "An error occurred while saving the delivery record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDelivery = async (order: any, deliveryIndex: number) => {
    const deliveryToRemove = order.deliveries[deliveryIndex];
    if (!deliveryToRemove) return;
    
    Alert.alert(
      "Delete Delivery Record",
      `Are you sure you want to delete the delivery record of ${deliveryToRemove.quantity} bricks?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const nextDeliveries = order.deliveries.filter((_: any, idx: number) => idx !== deliveryIndex);
            const nextDeliveredQuantity = Math.max(0, (order.deliveredQuantity || 0) - Number(deliveryToRemove.quantity));
            
            const totalQty = order.items && order.items.length > 0 
              ? order.items.reduce((sum: number, itm: any) => sum + Number(itm.quantity || 0), 0)
              : Number(order.quantity || 0);
            const newStatus = nextDeliveredQuantity < totalQty ? "pending" : order.status;
            
            const updatedOrder = {
              ...order,
              deliveries: nextDeliveries,
              deliveredQuantity: nextDeliveredQuantity,
              status: newStatus,
            };
            
            setIsSaving(true);
            try {
              const success = await editOrder(order.id, updatedOrder, order);
              if (success) {
                Alert.alert("Success", "Delivery record deleted successfully.");
              } else {
                Alert.alert("Error", "Failed to update delivery record.");
              }
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "An error occurred while deleting the delivery record.");
            } finally {
              setIsSaving(false);
            }
          }
        }
      ]
    );
  };

  const handleRecordDelivery = async (order: any, remainingQty: number) => {
    const inputVal = deliveryInputs[order.id] || "";
    const qty = parseInt(inputVal);
    
    if (isNaN(qty) || qty <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a valid number of bricks delivered.");
      return;
    }
    
    if (qty > remainingQty) {
      Alert.alert(
        "Exceeded Quantity",
        `You cannot deliver more than the remaining quantity (${remainingQty} bricks).`
      );
      return;
    }
    
    const newDeliveredQuantity = (order.deliveredQuantity || 0) + qty;
    const totalQty = order.items && order.items.length > 0 
      ? order.items.reduce((sum: number, itm: any) => sum + Number(itm.quantity || 0), 0)
      : Number(order.quantity || 0);

    const isFullyDelivered = newDeliveredQuantity >= totalQty;
    const newStatus = isFullyDelivered ? "completed" : "in-transit";

    const newDeliveries = [
      ...(order.deliveries || []),
      {
        date: new Date(),
        quantity: qty,
        deliveryPartnerId: order.deliveryPartnerId || null,
      },
    ];
    
    const updatedOrder = {
      ...order,
      deliveredQuantity: newDeliveredQuantity,
      deliveries: newDeliveries,
      status: newStatus,
    };
    
    setIsSaving(true);
    try {
      const success = await editOrder(order.id, updatedOrder, order);
      if (success) {
        Alert.alert("Success", `Recorded delivery of ${qty} bricks.`);
        setDeliveryInputs(prev => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
      } else {
        Alert.alert("Error", "Failed to update delivery record.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "An error occurred while saving the delivery record.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderEditDeliveryModal = () => {
    return (
      <Modal
        visible={isEditDeliveryModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEditDeliveryModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Delivery Record</Text>
              <Pressable
                style={styles.closeBtn}
                onPress={() => setIsEditDeliveryModalOpen(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>Delivered Quantity (Bricks) *</Text>
              <TextInput
                value={editDeliveryQty}
                onChangeText={setEditDeliveryQty}
                keyboardType="numeric"
                style={styles.input}
                placeholder="Enter bricks quantity"
                placeholderTextColor={colors.text.muted}
              />

              <Text style={styles.label}>Delivery Date *</Text>
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderWidth: 1,
                  borderColor: colors.border.medium,
                  borderRadius: 10,
                  height: 42,
                  paddingHorizontal: 12,
                  backgroundColor: colors.bg.primary,
                  marginBottom: 14,
                }}
                onPress={() => setIsDeliveryCalendarOpen(true)}
              >
                <Text style={{ fontSize: 14, color: colors.text.primary }}>
                  {editDeliveryDate.toLocaleDateString("en-IN")}
                </Text>
                <MaterialIcons name="event" size={20} color={colors.text.muted} />
              </Pressable>

              <Text style={styles.label}>Delivery Time *</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <TextInput
                  value={editDeliveryHour}
                  onChangeText={setEditDeliveryHour}
                  keyboardType="numeric"
                  maxLength={2}
                  style={[styles.input, { width: 50, textAlign: "center", marginBottom: 0 }]}
                  placeholder="12"
                  placeholderTextColor={colors.text.muted}
                />
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text.secondary }}>:</Text>
                <TextInput
                  value={editDeliveryMinute}
                  onChangeText={setEditDeliveryMinute}
                  keyboardType="numeric"
                  maxLength={2}
                  style={[styles.input, { width: 50, textAlign: "center", marginBottom: 0 }]}
                  placeholder="00"
                  placeholderTextColor={colors.text.muted}
                />
                <View style={{ flexDirection: "row", gap: 4, marginLeft: 8 }}>
                  {["AM", "PM"].map((mode) => {
                    const active = editDeliveryAmPm === mode;
                    return (
                      <Pressable
                        key={mode}
                        style={[
                          styles.pill,
                          active && styles.pillActive,
                          { height: 36, justifyContent: "center", paddingVertical: 0 }
                        ]}
                        onPress={() => setEditDeliveryAmPm(mode)}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>{mode}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Text style={styles.label}>Delivery Partner / Driver</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    style={[
                      styles.itemCard,
                      !editDeliveryEntryPartnerId && styles.itemCardActive,
                      { minWidth: 130 }
                    ]}
                    onPress={() => setEditDeliveryEntryPartnerId("")}
                  >
                    <Text style={[styles.itemCardName, !editDeliveryEntryPartnerId && styles.itemCardNameActive]}>
                      No Driver (Self Pickup)
                    </Text>
                  </Pressable>
                  {partners && partners.map((p: any) => {
                    const active = editDeliveryEntryPartnerId === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        style={[styles.itemCard, active && styles.itemCardActive, { minWidth: 130 }]}
                        onPress={() => setEditDeliveryEntryPartnerId(p.id)}
                      >
                        <Text style={[styles.itemCardName, active && styles.itemCardNameActive]}>
                          {p.name}
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                          {p.vehicleType || "Driver"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={styles.label}>Delivery Notes / Remarks</Text>
              <TextInput
                value={editDeliveryNotes}
                onChangeText={setEditDeliveryNotes}
                style={[styles.input, { height: 70, textAlignVertical: "top", paddingTop: 8 }]}
                multiline
                placeholder="e.g. delivered to side gate, helper assisted"
                placeholderTextColor={colors.text.muted}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                style={[styles.footerBtn, styles.cancelFooterBtn]}
                onPress={() => setIsEditDeliveryModalOpen(false)}
              >
                <Text style={styles.cancelFooterBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.footerBtn, styles.saveFooterBtn]}
                onPress={handleSaveEditDelivery}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveFooterBtnText}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent.success} />
        <Text style={styles.loadingText}>Fetching order registry...</Text>
      </View>
    );
  }

  return (
    <AnimatedPage>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        scrollEventThrottle={32}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
      >
        <View style={styles.header}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.title}>Order History & Status</Text>
              <Text style={styles.subtitle}>
                Track client bookings, shipments, and billing.
              </Text>
            </View>
          </View>
        </View>

        {/* Selected Order Filter Banner */}
        {focusedOrderId && targetOrder && (
          <View style={{
            backgroundColor: `${colors.accent.primary}12`,
            borderColor: `${colors.accent.primary}40`,
            borderWidth: 1.5,
            borderRadius: 14,
            padding: 12,
            marginBottom: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: colors.accent.primary,
                justifyContent: "center",
                alignItems: "center",
              }}>
                <MaterialIcons name="receipt-long" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary, textTransform: "uppercase" }}>
                  Selected Order
                </Text>
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text.primary }} numberOfLines={1}>
                  {targetOrder.customerName || "Customer"} • ₹{Number(targetOrder.total || 0).toLocaleString("en-IN")}
                </Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [{
                backgroundColor: colors.bg.card,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border.medium,
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
              }, pressed && { opacity: 0.8 }]}
              onPress={() => {
                setFocusedOrderId(null);
                try {
                  router.setParams({ orderId: undefined, id: undefined, highlightId: undefined });
                } catch {
                  // safe catch
                }
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.primary }}>
                Show All
              </Text>
              <MaterialIcons name="close" size={14} color={colors.text.secondary} />
            </Pressable>
          </View>
        )}

        {/* Search & Filters */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchBox, { marginBottom: 0 }]}>
            <MaterialIcons
              name="search"
              size={20}
              color={colors.text.muted}
              style={styles.searchIcon}
            />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by client or item name..."
              placeholderTextColor={colors.text.muted}
              style={styles.searchInput}
            />
            {!!search && (
              <Pressable onPress={() => setSearch("")} style={{ padding: 4 }}>
                <MaterialIcons name="close" size={18} color={colors.text.muted} />
              </Pressable>
            )}
          </View>

          <Pressable
            style={[
              styles.calendarFilterBtn,
              (!!selectedFilterDate || dateFilterPreset !== "all") && styles.calendarFilterBtnActive,
            ]}
            onPress={() => setIsSearchCalendarOpen(true)}
          >
            <MaterialIcons
              name="calendar-month"
              size={22}
              color={selectedFilterDate || dateFilterPreset !== "all" ? colors.accent.primary : colors.text.muted}
            />
          </Pressable>
        </View>

        {/* Date Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.pillScroll, { marginBottom: 10 }]}
        >
          <View style={styles.pillRow}>
            {[
              { id: "all", label: "All Dates" },
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "this_month", label: "This Month" },
            ].map((item) => {
              const active = dateFilterPreset === item.id && !selectedFilterDate;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setDateFilterPreset(item.id as any);
                    setSelectedFilterDate(null);
                  }}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text
                    style={[styles.pillText, active && styles.pillTextActive]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              onPress={() => setIsSearchCalendarOpen(true)}
              style={[
                styles.pill,
                !!selectedFilterDate && styles.pillActive,
                { flexDirection: "row", alignItems: "center", gap: 4 },
              ]}
            >
              <MaterialIcons
                name="event"
                size={14}
                color={selectedFilterDate ? colors.accent.primary : colors.text.muted}
              />
              <Text
                style={[
                  styles.pillText,
                  !!selectedFilterDate && styles.pillTextActive,
                ]}
              >
                {selectedFilterDate
                  ? selectedFilterDate.toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "Pick Date"}
              </Text>
              {!!selectedFilterDate && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    setSelectedFilterDate(null);
                    setDateFilterPreset("all");
                  }}
                  hitSlop={8}
                >
                  <MaterialIcons
                    name="close"
                    size={14}
                    color={colors.accent.primary}
                  />
                </Pressable>
              )}
            </Pressable>
          </View>
        </ScrollView>

        {/* Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}
        >
          <View style={styles.pillRow}>
            {[
              "all",
              "pending",
              "in-transit",
              "completed",
              "cancelled",
              "purchase",
            ].map((status) => {
              const active = filterStatus === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => setFilterStatus(status)}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text
                    style={[styles.pillText, active && styles.pillTextActive]}
                  >
                    {status.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Order List */}
        <View style={styles.list}>
          {sortedDates.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons
                name="receipt"
                size={48}
                color={colors.border.medium}
              />
              <Text style={styles.emptyTitle}>No Transactions Registered</Text>
              <Text style={styles.emptyDesc}>
                No sales bookings or operations expense logs found matching your
                criteria.
              </Text>
            </View>
          ) : (
            sortedDates.slice(0, dateGroupLimit).map((dateStr) => {
              const group = groupedData[dateStr];
              const revSum = group.orders.reduce(
                (sum, o) => sum + (o.isRawMaterialOrder || o.status === "cancelled" ? 0 : Number(o.total || 0)),
                0,
              );
              const expSum =
                group.expenses.reduce(
                  (sum, e) => sum + Number(e.totalAmount || e.amount || 0),
                  0,
                ) +
                group.orders.reduce(
                  (sum, o) => sum + (o.isRawMaterialOrder && o.status !== "cancelled" ? Number(o.total || 0) : 0),
                  0,
                );

              return (
                <View key={dateStr} style={{ marginBottom: 12 }}>
                  {renderDateHeader(dateStr, revSum, expSum)}

                  {group.orders.map((order: any) => {
                    const customerObj =
                      (order.customerId && entityByIdMap.get(order.customerId)) ||
                      (order.customerName && entityByNameMap.get(order.customerName.trim().toLowerCase())) ||
                      (order.customerPhone && entityByPhoneMap.get(order.customerPhone.trim())) ||
                      null;

                    const customerTotalPending = customerObj
                      ? (customerObj.totalPending !== undefined ? Number(customerObj.totalPending) : Number(customerObj.balance || 0))
                      : Number(order.balanceDue || 0);

                    const isTargetOrder = order.id === focusedOrderId;
                    return (
                      <View
                        key={order.id}
                        style={[
                          styles.card,
                          {
                            borderLeftWidth: 4,
                            borderLeftColor: getStatusColor(order.status),
                          },
                          isTargetOrder && {
                            borderColor: colors.accent.primary,
                            borderWidth: 2,
                            backgroundColor: `${colors.accent.primary}05`,
                          },
                        ]}
                      >
                        {isTargetOrder && (
                          <View style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 5,
                            backgroundColor: `${colors.accent.primary}18`,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            alignSelf: "flex-start",
                            marginBottom: 8,
                          }}>
                            <MaterialIcons name="stars" size={14} color={colors.accent.primary} />
                            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.accent.primary }}>
                              Selected from Daily Report
                            </Text>
                          </View>
                        )}
                        <Pressable
                          style={styles.cardHeader}
                          onPress={() => handleOpenCustomerProfile(order)}
                        >
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Text
                              selectable={true}
                              style={styles.clientName}
                              numberOfLines={2}
                            >
                              {order.customerName ||
                                (order.isRawMaterialOrder ? "Supplier" : "Client")}
                            </Text>
                            {!order.isRawMaterialOrder && (
                              <MaterialIcons
                                name="chevron-right"
                                size={18}
                                color={colors.accent.primary}
                              />
                            )}
                          </View>
                          {!!order.customerPhone && (
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                                marginTop: 2,
                                marginBottom: 2,
                              }}
                            >
                              <MaterialIcons
                                name="call"
                                size={13}
                                color={colors.accent.primary}
                              />
                              <Text
                                selectable={true}
                                style={{
                                  fontSize: 13,
                                  fontWeight: "600",
                                  color: colors.text.secondary,
                                }}
                              >
                                {order.customerPhone}
                              </Text>
                            </View>
                          )}
                          <Text style={styles.date}>
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" },
                                )
                              : "Just now"}
                          </Text>
                          <Text
                            style={[
                              styles.date,
                              { marginTop: 2, fontSize: 11, opacity: 0.8 },
                            ]}
                          >
                            Ordered:{" "}
                            {new Date(
                              order.orderedDate || order.createdAt,
                            ).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor: `${getStatusColor(order.status)}15`,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              { color: getStatusColor(order.status) },
                            ]}
                          >
                            {order.status}
                          </Text>
                        </View>
                      </Pressable>

                      <View style={styles.divider} />

                      <View style={styles.cardBody}>
                        {order.items && order.items.length > 0 ? (
                          <View style={{ gap: 6 }}>
                            <Text
                              style={[
                                styles.bodyLabel,
                                {
                                  fontWeight: "700",
                                  color: colors.text.primary,
                                },
                              ]}
                            >
                              Items
                            </Text>
                            {order.items.map((item: any, idx: number) => {
                              const itemTotal = Number(item.grossTotal) || (Number(item.quantity || 0) * Number(item.rate || 0));
                              return (
                                <View key={idx} style={styles.detailRow}>
                                  <Text
                                    style={[
                                      styles.bodyValue,
                                      {
                                        fontWeight: "500",
                                        color: colors.text.primary,
                                        flex: 1,
                                        marginRight: 8,
                                      },
                                    ]}
                                  >
                                    • {item.itemName}
                                  </Text>
                                  <Text style={[styles.bodyValue, { fontWeight: "700", color: colors.text.primary }]}>
                                    {item.quantity} x {item.rate} = ₹{itemTotal.toLocaleString("en-IN")}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        ) : (
                          <>
                            <View style={styles.detailRow}>
                              <Text style={styles.bodyLabel}>Product Name</Text>
                              <Text style={styles.bodyValue}>
                                {order.itemName}
                              </Text>
                            </View>
                            <View style={styles.detailRow}>
                              <Text style={styles.bodyLabel}>
                                Quantity x Price
                              </Text>
                              <Text style={[styles.bodyValue, { fontWeight: "700" }]}>
                                {order.quantity} x {order.rate} = ₹{(Number(order.quantity || 0) * Number(order.rate || 0)).toLocaleString("en-IN")}
                              </Text>
                            </View>
                          </>
                        )}

                        <View style={[styles.divider, { marginVertical: 8 }]} />

                        {/* Full Total Breakdown Details Card */}
                        {(() => {
                          const customerObj = (order.customerId && customerByIdMap.get(order.customerId)) ||
                            (customers || []).find((c: any) =>
                              (c.name && order.customerName && c.name.trim().toLowerCase() === order.customerName.trim().toLowerCase()) ||
                              (c.phone && order.customerPhone && c.phone.trim() === order.customerPhone.trim())
                            );

                          const customerCurrentPending = customerObj
                            ? (customerObj.totalPending !== undefined ? Number(customerObj.totalPending) : Number(customerObj.balance || 0))
                            : 0;

                          const thisOrderUnpaid = Number(order.balanceDue || 0);

                          const oldBalanceDue = order.previousBalance !== undefined
                            ? Number(order.previousBalance)
                            : Math.max(0, customerCurrentPending - thisOrderUnpaid);

                          const thisOrderTotal = Number(order.total || 0);
                          const totalAmountWithOldDues = thisOrderTotal + oldBalanceDue;
                          const paidAmountVal = Number(order.paidAmount !== undefined ? order.paidAmount : (thisOrderTotal - thisOrderUnpaid) || 0);
                          const totalBalanceUnpaid = oldBalanceDue + thisOrderUnpaid;

                          return (
                            <View style={{ padding: 10, backgroundColor: colors.bg.primary, borderRadius: 10, borderWidth: 1, borderColor: colors.border.subtle }}>
                              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.primary, marginBottom: 8 }}>
                                Full Total Breakdown
                              </Text>

                              {/* Items Subtotal */}
                              {(order.grossTotal || (order.items && order.items.length > 0)) ? (
                                <View style={[styles.detailRow, { marginBottom: 4 }]}>
                                  <Text style={styles.bodyLabel}>Items Subtotal</Text>
                                  <Text style={[styles.bodyValue, { fontWeight: "600" }]}>
                                    ₹{(Number(order.grossTotal) || (order.items ? order.items.reduce((s: number, i: any) => s + (Number(i.quantity || 0) * Number(i.rate || 0)), 0) : (Number(order.quantity || 0) * Number(order.rate || 0)))).toLocaleString("en-IN")}
                                  </Text>
                                </View>
                              ) : null}

                              {/* Shipment Charge */}
                              {Number(order.shipmentCharge) > 0 ? (
                                <View style={[styles.detailRow, { marginBottom: 4 }]}>
                                  <Text style={styles.bodyLabel}>
                                    Shipment Charge {order.shipmentDistance ? `(${order.shipmentDistance} km)` : ""}
                                  </Text>
                                  <Text style={[styles.bodyValue, { fontWeight: "600", color: colors.accent.primary }]}>
                                    +₹{Number(order.shipmentCharge).toLocaleString("en-IN")}
                                  </Text>
                                </View>
                              ) : null}

                              {/* Loading Charge */}
                              {Number(order.loadingCharge) > 0 ? (
                                <View style={[styles.detailRow, { marginBottom: 4 }]}>
                                  <Text style={styles.bodyLabel}>
                                    Loading {order.loadingWorkerName ? `(${order.loadingWorkerName})` : ""}
                                  </Text>
                                  <Text style={[styles.bodyValue, { fontWeight: "600", color: colors.accent.primary }]}>
                                    +₹{Number(order.loadingCharge).toLocaleString("en-IN")}
                                  </Text>
                                </View>
                              ) : null}

                              {/* Unloading Charge */}
                              {Number(order.unloadingCharge) > 0 ? (
                                <View style={[styles.detailRow, { marginBottom: 4 }]}>
                                  <Text style={styles.bodyLabel}>
                                    Unloading {order.unloadingWorkerName ? `(${order.unloadingWorkerName})` : ""}
                                  </Text>
                                  <Text style={[styles.bodyValue, { fontWeight: "600", color: colors.accent.primary }]}>
                                    +₹{Number(order.unloadingCharge).toLocaleString("en-IN")}
                                  </Text>
                                </View>
                              ) : null}

                              {/* Extra Amount */}
                              {Number(order.extraAmount) > 0 ? (
                                <View style={[styles.detailRow, { marginBottom: 4 }]}>
                                  <Text style={styles.bodyLabel}>
                                    Extra Charge {order.extraAmountDescription ? `(${order.extraAmountDescription})` : ""}
                                  </Text>
                                  <Text style={[styles.bodyValue, { fontWeight: "600", color: colors.accent.primary }]}>
                                    +₹{Number(order.extraAmount).toLocaleString("en-IN")}
                                  </Text>
                                </View>
                              ) : null}

                              {/* Discount Amount */}
                              {(Number(order.discountAmount) > 0 || Number(order.discount) > 0) ? (
                                <View style={[styles.detailRow, { marginBottom: 4 }]}>
                                  <Text style={[styles.bodyLabel, { color: colors.accent.success, fontWeight: "600" }]}>
                                    Discount {order.discountType === "percent" ? `(${order.discount}%)` : order.discountType === "per_brick" ? `(₹${order.discount}/brick)` : ""}
                                  </Text>
                                  <Text style={[styles.bodyValue, { fontWeight: "700", color: colors.accent.success }]}>
                                    -₹{(Number(order.discountAmount) || Number(order.discount) || 0).toLocaleString("en-IN")}
                                  </Text>
                                </View>
                              ) : null}

                              {/* Current Order Total */}
                              <View style={[styles.detailRow, { marginBottom: 4 }]}>
                                <Text style={styles.bodyLabel}>Current Order Subtotal</Text>
                                <Text style={[styles.bodyValue, { fontWeight: "600" }]}>
                                  ₹{thisOrderTotal.toLocaleString("en-IN")}
                                </Text>
                              </View>

                              {/* Old Balance Due or Advance */}
                              {oldBalanceDue > 0 ? (
                                <View style={[styles.detailRow, { marginBottom: 4 }]}>
                                  <Text style={[styles.bodyLabel, { color: colors.accent.danger, fontWeight: "600" }]}>
                                    Old Balance Due (Previous)
                                  </Text>
                                  <Text style={[styles.bodyValue, { fontWeight: "700", color: colors.accent.danger }]}>
                                    +₹{oldBalanceDue.toLocaleString("en-IN")}
                                  </Text>
                                </View>
                              ) : oldBalanceDue < 0 ? (
                                <View style={[styles.detailRow, { marginBottom: 4 }]}>
                                  <Text style={[styles.bodyLabel, { color: colors.accent.success, fontWeight: "600" }]}>
                                    Advance Balance (Plus Credit)
                                  </Text>
                                  <Text style={[styles.bodyValue, { fontWeight: "700", color: colors.accent.success }]}>
                                    -₹{Math.abs(oldBalanceDue).toLocaleString("en-IN")}
                                  </Text>
                                </View>
                              ) : null}

                              <View style={[styles.divider, { marginVertical: 6 }]} />

                              {/* Net Total with Old Dues */}
                              <View style={[styles.detailRow, { marginBottom: 4 }]}>
                                <Text style={[styles.bodyLabel, { fontWeight: "800", color: colors.text.primary }]}>
                                  {order.isRawMaterialOrder ? "Total Purchase Cost" : "Total Order Amount (incl. Old Dues)"}
                                </Text>
                                <Text style={[styles.totalValue, { fontSize: 16, fontWeight: "800", color: colors.accent.primary }]}>
                                  ₹{totalAmountWithOldDues.toLocaleString("en-IN")}
                                </Text>
                              </View>

                              {/* Amount Paid */}
                              <View style={[styles.detailRow, { marginBottom: 4 }]}>
                                <Text style={styles.bodyLabel}>Amount Paid Today</Text>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.accent.success }}>
                                    ₹{paidAmountVal.toLocaleString("en-IN")}
                                  </Text>
                                  {(order.paymentMethod || order.paymentMode || order.paymentType) && paidAmountVal > 0 && (
                                    <View style={{ backgroundColor: `${colors.accent.primary}18`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.accent.primary }}>
                                        {order.paymentMethod || order.paymentMode || order.paymentType}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              </View>

                              {/* Balance Due */}
                              <View style={styles.detailRow}>
                                <Text style={styles.bodyLabel}>Total Balance Unpaid</Text>
                                <Text style={{ fontSize: 14, fontWeight: "800", color: totalBalanceUnpaid > 0 ? colors.accent.danger : colors.accent.success }}>
                                  ₹{totalBalanceUnpaid.toLocaleString("en-IN")}
                                </Text>
                              </View>
                            </View>
                          );
                        })()}

                        {/* Delivery Tracking Section */}
                        {!order.isRawMaterialOrder && (() => {
                          const totalQty = order.items && order.items.length > 0
                            ? order.items.reduce((sum: number, itm: any) => sum + Number(itm.quantity || 0), 0)
                            : Number(order.quantity || 0);
                          const totalDelivered = Number(order.deliveredQuantity || 0);
                          const remainingQty = Math.max(0, totalQty - totalDelivered);
                          return (
                            <View style={{ marginTop: 10, padding: 10, backgroundColor: colors.bg.primary, borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle }}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.primary }}>Delivery Progress</Text>
                                <Text style={{ fontSize: 11, fontWeight: "700", color: remainingQty === 0 ? "#10B981" : "#F59E0B" }}>
                                  {remainingQty === 0 ? "Fully Delivered" : `${totalDelivered} / ${totalQty} Delivered`}
                                </Text>
                              </View>

                              {/* Progress Bar */}
                              <View style={{ height: 6, backgroundColor: colors.border.medium, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
                                <View style={{ height: "100%", width: `${Math.min(100, (totalDelivered / totalQty) * 100)}%`, backgroundColor: remainingQty === 0 ? "#10B981" : colors.accent.primary }} />
                              </View>

                              {/* Deliveries History List */}
                              {order.deliveries && order.deliveries.length > 0 && (
                                <View style={{ marginBottom: 8 }}>
                                  <Text style={{ fontSize: 10, fontWeight: "600", color: colors.text.muted, marginBottom: 4 }}>Delivery History:</Text>
                                  {order.deliveries.map((del: any, idx: number) => {
                                    const delDate = del.date ? (del.date.toDate ? del.date.toDate() : new Date(del.date)) : new Date();
                                    const partnerName = del.deliveryPartnerId ? partnerByIdMap.get(del.deliveryPartnerId)?.name : "";
                                    return (
                                      <View key={idx} style={{ marginVertical: 4, paddingVertical: 4, borderBottomWidth: idx < order.deliveries.length - 1 ? 0.5 : 0, borderBottomColor: colors.border.subtle }}>
                                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                          <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.text.secondary, flex: 1 }}>
                                            ✓ {del.quantity} bricks on {delDate.toLocaleDateString("en-IN")} at {delDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                          </Text>
                                          
                                          {!order.isRawMaterialOrder && (
                                            <View style={{ flexDirection: "row", gap: 8, marginLeft: 8 }}>
                                              <Pressable onPress={() => handleStartEditDelivery(order.id, idx, del.quantity, del.date, del.deliveryPartnerId, del.notes)} style={{ padding: 2 }}>
                                                <MaterialIcons name="edit" size={14} color="#3B82F6" />
                                              </Pressable>
                                              <Pressable onPress={() => handleDeleteDelivery(order, idx)} style={{ padding: 2 }}>
                                                <MaterialIcons name="delete" size={14} color={colors.accent.danger} />
                                              </Pressable>
                                            </View>
                                          )}
                                        </View>
                                        {partnerName ? (
                                          <Text style={{ fontSize: 9.5, color: colors.text.muted, marginTop: 1 }}>
                                            🚚 Driver: {partnerName}
                                          </Text>
                                        ) : null}
                                        {del.notes ? (
                                          <Text style={{ fontSize: 9.5, color: colors.text.muted, fontStyle: "italic", marginTop: 1 }}>
                                            📝 Notes: {del.notes}
                                          </Text>
                                        ) : null}
                                      </View>
                                    );
                                  })}
                                </View>
                              )}

                              {remainingQty > 0 ? (
                                <View>
                                  <Text style={{ fontSize: 11, color: colors.text.secondary, marginBottom: 6 }}>
                                    Remaining: <Text style={{ fontWeight: "700", color: colors.accent.danger }}>{remainingQty} bricks</Text>
                                  </Text>
                                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                                    <TextInput
                                      style={{
                                        flex: 1,
                                        height: 36,
                                        backgroundColor: colors.bg.card,
                                        borderWidth: 1,
                                        borderColor: colors.border.medium,
                                        borderRadius: 6,
                                        paddingHorizontal: 10,
                                        fontSize: 13,
                                        color: colors.text.primary,
                                      }}
                                      placeholder="Enter delivered qty"
                                      placeholderTextColor={colors.text.muted}
                                      keyboardType="numeric"
                                      value={deliveryInputs[order.id] || ""}
                                      onChangeText={(val) =>
                                        setDeliveryInputs((prev) => ({
                                          ...prev,
                                          [order.id]: val,
                                        }))
                                      }
                                    />
                                    <Pressable
                                      style={{
                                        backgroundColor: colors.accent.primary,
                                        paddingVertical: 8,
                                        paddingHorizontal: 12,
                                        borderRadius: 6,
                                        justifyContent: "center",
                                        alignItems: "center",
                                      }}
                                      onPress={() => handleRecordDelivery(order, remainingQty)}
                                    >
                                      <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>
                                        Record Delivery
                                      </Text>
                                    </Pressable>
                                  </View>
                                </View>
                              ) : (
                                <Text style={{ fontSize: 11, color: "#10B981", fontWeight: "600" }}>
                                  ✓ All units successfully delivered.
                                </Text>
                              )}
                            </View>
                          );
                        })()}
                      </View>

                      <View style={styles.cardActions}>
                        <Pressable
                          style={[
                            styles.actionBtn,
                            {
                              backgroundColor: "#2563EB",
                              borderWidth: 1,
                              borderColor: "#2563EB",
                            },
                          ]}
                          onPress={() => handleOpenShareModal(order, order.isRawMaterialOrder ? "purchase" : "order")}
                        >
                          <MaterialIcons name="share" size={16} color="#FFFFFF" />
                          <Text style={[styles.actionBtnText, { color: "#FFFFFF", fontWeight: "700" }]} numberOfLines={1}>
                            Share
                          </Text>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.actionBtn,
                            {
                              backgroundColor: "#16a34a",
                              borderWidth: 1,
                              borderColor: "#16a34a",
                            },
                          ]}
                          onPress={() => handleOpenPayModal(order)}
                        >
                          <MaterialIcons name="payment" size={16} color="#FFFFFF" />
                          <Text style={[styles.actionBtnText, { color: "#FFFFFF", fontWeight: "700" }]} numberOfLines={1}>
                            Pay
                          </Text>
                        </Pressable>

                        <Pressable
                          style={[styles.actionBtn, styles.editBtn]}
                          onPress={() => {
                            if (order.isRawMaterialOrder) {
                              handleEditRawMaterialOrder(order);
                            } else {
                              handleEditOrder(order);
                            }
                          }}
                        >
                          <MaterialIcons
                            name="edit"
                            size={16}
                            color="#3B82F6"
                          />
                          <Text
                            style={[styles.actionBtnText, { color: "#3B82F6" }]}
                            numberOfLines={1}
                          >
                            Edit
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.actionBtn, styles.deleteBtn]}
                          onPress={() => {
                            if (order.isRawMaterialOrder) {
                              handleDeleteRawMaterialOrder(order.id, order);
                            } else {
                              handleDeleteOrder(order.id, order);
                            }
                          }}
                        >
                          <MaterialIcons
                            name="delete"
                            size={16}
                            color={colors.accent.danger}
                          />
                          <Text
                            style={[
                              styles.actionBtnText,
                              { color: colors.accent.danger },
                            ]}
                            numberOfLines={1}
                          >
                            Delete
                          </Text>
                        </Pressable>
                      </View>

                      {!order.isRawMaterialOrder &&
                        order.status !== "completed" &&
                        order.status !== "cancelled" && (
                          <View
                            style={[
                              styles.cardActions,
                              {
                                marginTop: 8,
                                borderTopWidth: 0,
                                paddingTop: 0,
                              },
                            ]}
                          >
                            <Pressable
                              style={[styles.actionBtn, styles.completeBtn]}
                              onPress={() =>
                                updateOrderStatus(order.id, "completed")
                              }
                            >
                              <MaterialIcons
                                name="done"
                                size={16}
                                color={colors.bg.card}
                              />
                              <Text style={styles.actionBtnText}>Complete</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.actionBtn, styles.cancelBtn]}
                              onPress={() =>
                                updateOrderStatus(order.id, "cancelled")
                              }
                            >
                              <MaterialIcons
                                name="close"
                                size={16}
                                color={colors.accent.danger}
                              />
                              <Text
                                style={[
                                  styles.actionBtnText,
                                  { color: colors.accent.danger },
                                ]}
                              >
                                Cancel
                              </Text>
                            </Pressable>
                          </View>
                        )}
                    </View>
                  );
                })}

                  {group.expenses.map((expense: any) =>
                    renderExpenseTimelineCard(expense),
                  )}
                </View>
              );
            })
          )}

          {sortedDates.length > dateGroupLimit && (
            <Pressable
              style={({ pressed }) => [
                {
                  backgroundColor: colors.bg.card,
                  borderColor: colors.border.medium,
                  borderWidth: 1,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 8,
                  marginBottom: 20,
                  flexDirection: "row",
                  gap: 8,
                },
                pressed && { opacity: 0.8, backgroundColor: colors.bg.primary },
              ]}
              onPress={() => setDateGroupLimit((prev) => prev + 15)}
            >
              <MaterialIcons name="expand-more" size={20} color={colors.accent.primary} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.accent.primary }}>
                Load Earlier Transactions ({sortedDates.length - dateGroupLimit} remaining)
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* Edit Order Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Upgraded Modal Header with Badges and Date Selector */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <Text style={styles.modalTitle}>Edit Transaction</Text>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 12,
                      backgroundColor: selectedOrder?.isRawMaterialOrder ? "#FEF3C7" : "#DBEAFE",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: selectedOrder?.isRawMaterialOrder ? "#D97706" : "#2563EB",
                      }}
                    >
                      {selectedOrder?.isRawMaterialOrder ? "Raw Material Purchase" : "Customer Sales Order"}
                    </Text>
                  </View>
                  {selectedOrder?.id && (
                    <Text style={{ fontSize: 11, color: colors.text.muted, fontFamily: "monospace" }}>
                      #{String(selectedOrder.id).slice(-6)}
                    </Text>
                  )}
                </View>
                {/* Transaction Date Button */}
                <Pressable
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: colors.bg.primary,
                    alignSelf: "flex-start",
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                    marginTop: 2,
                  }}
                  onPress={() => setIsEditOrderCalendarOpen(true)}
                >
                  <MaterialIcons name="event" size={15} color={colors.accent.primary} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text.primary }}>
                    Date: {editOrderDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                  <MaterialIcons name="edit" size={12} color={colors.text.muted} />
                </Pressable>
              </View>
              <Pressable
                style={styles.closeBtn}
                onPress={() => setEditModalVisible(false)}
              >
                <MaterialIcons
                  name="close"
                  size={24}
                  color={colors.text.muted}
                />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
            >
              {selectedOrder?.isRawMaterialOrder ? (
                <View style={{ gap: 16 }}>
                  {/* Supplier Selection */}
                  <View>
                    <Text style={styles.label}>Select Supplier</Text>
                    <Pressable
                      style={styles.dropdownToggle}
                      onPress={() =>
                        setShowEditRawSupplierDropdown(
                          !showEditRawSupplierDropdown,
                        )
                      }
                    >
                      <Text style={styles.dropdownToggleText}>
                        {editRawSupplierId
                          ? supplierByIdMap.get(editRawSupplierId)?.name || "Select Supplier"
                          : "No Supplier / Spot Purchase"}
                      </Text>
                      <MaterialIcons
                        name={
                          showEditRawSupplierDropdown
                            ? "arrow-drop-up"
                            : "arrow-drop-down"
                        }
                        size={24}
                        color={colors.text.muted}
                      />
                    </Pressable>

                    {showEditRawSupplierDropdown && (
                      <View style={styles.dropdownList}>
                        <Pressable
                          style={styles.dropdownItem}
                          onPress={() => {
                            setEditRawSupplierId("");
                            setShowEditRawSupplierDropdown(false);
                          }}
                        >
                          <Text style={styles.dropdownItemText}>
                            No Supplier / Spot Purchase
                          </Text>
                        </Pressable>
                        {suppliers
                          .filter((s: any) => s.status !== "inactive")
                          .map((supp: any) => (
                            <Pressable
                              key={supp.id}
                              style={styles.dropdownItem}
                              onPress={() => {
                                setEditRawSupplierId(supp.id);
                                setShowEditRawSupplierDropdown(false);
                              }}
                            >
                              <Text style={styles.dropdownItemText}>
                                {supp.name}
                              </Text>
                            </Pressable>
                          ))}
                      </View>
                    )}
                  </View>

                  {/* Material Selection */}
                  <View>
                    <Text style={styles.label}>Raw Material Type</Text>
                    <Pressable
                      style={styles.dropdownToggle}
                      onPress={() =>
                        setShowEditRawMaterialDropdown(!showEditRawMaterialDropdown)
                      }
                    >
                      <Text style={styles.dropdownToggleText}>
                        {editRawMaterialId
                          ? itemByIdMap.get(editRawMaterialId)?.itemName || "Select Material"
                          : (selectedOrder?.items?.[0]?.itemName || "Select Material")}
                      </Text>
                      <MaterialIcons
                        name={
                          showEditRawMaterialDropdown
                            ? "arrow-drop-up"
                            : "arrow-drop-down"
                        }
                        size={24}
                        color={colors.text.muted}
                      />
                    </Pressable>

                    {showEditRawMaterialDropdown && (
                      <View style={styles.dropdownList}>
                        {(items || [])
                          .filter((i: any) => i.itemType === "raw_material" || i.category === "Raw Material")
                          .map((mat: any) => (
                            <Pressable
                              key={mat.id}
                              style={styles.dropdownItem}
                              onPress={() => {
                                setEditRawMaterialId(mat.id);
                                setShowEditRawMaterialDropdown(false);
                              }}
                            >
                              <Text style={styles.dropdownItemText}>
                                {mat.itemName} {mat.rateType ? `(${mat.rateType})` : ""}
                              </Text>
                            </Pressable>
                          ))}
                      </View>
                    )}
                  </View>

                  {/* Quantity & Cost */}
                  <View style={styles.flexRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Quantity</Text>
                      <TextInput
                        value={editRawQty}
                        onChangeText={setEditRawQty}
                        keyboardType="numeric"
                        style={styles.input}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Cost per Unit (₹)</Text>
                      <TextInput
                        value={editRawCost}
                        onChangeText={setEditRawCost}
                        keyboardType="numeric"
                        style={styles.input}
                      />
                    </View>
                  </View>

                  {/* Total Cost Price Display */}
                  {(() => {
                    const total =
                      (parseFloat(editRawQty) || 0) *
                      (parseFloat(editRawCost) || 0);
                    if (total <= 0) return null;
                    return (
                      <View style={styles.calcContainer}>
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabelBold}>
                            Calculated Total Cost:
                          </Text>
                          <Text style={styles.calcValueBold}>
                            ₹{total.toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                  {/* Payment Status Toggle */}
                  <View>
                    <Text style={styles.label}>Payment Status</Text>
                    <View style={styles.statusRow}>
                      <Pressable
                        style={[
                          styles.statusTogglePill,
                          editRawPaymentStatus === "fully" && {
                            backgroundColor: "#ecfdf5",
                            borderColor: colors.accent.success,
                          },
                        ]}
                        onPress={() => {
                          setEditRawPaymentStatus("fully");
                          setEditRawPaid("");
                        }}
                      >
                        <Text
                          style={[
                            styles.statusTogglePillText,
                            {
                              color:
                                editRawPaymentStatus === "fully"
                                    ? "#10b981"
                                    : colors.text.muted,
                            },
                          ]}
                        >
                          FULLY PAID
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.statusTogglePill,
                          editRawPaymentStatus === "balance" && {
                            backgroundColor: "#fffbeb",
                            borderColor: colors.accent.warning,
                          },
                        ]}
                        onPress={() => {
                          setEditRawPaymentStatus("balance");
                          setEditRawPaid("0");
                        }}
                      >
                        <Text
                          style={[
                            styles.statusTogglePillText,
                            {
                              color:
                                editRawPaymentStatus === "balance"
                                    ? "#f59e0b"
                                    : colors.text.muted,
                            },
                          ]}
                        >
                          WITH BALANCE
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Custom Paid Amount */}
                  {editRawPaymentStatus === "balance" && (
                    <View>
                      <Text style={styles.label}>Amount Paid (₹)</Text>
                      <TextInput
                        value={editRawPaid}
                        onChangeText={setEditRawPaid}
                        keyboardType="numeric"
                        placeholder="e.g. 0 for full credit"
                        style={styles.input}
                      />
                    </View>
                  )}

                  {/* Notes */}
                  <View>
                    <Text style={styles.label}>Notes / Reference</Text>
                    <TextInput
                      value={editRawNotes}
                      onChangeText={setEditRawNotes}
                      placeholder="Enter note..."
                      multiline
                      numberOfLines={3}
                      style={[styles.input, { height: 60, paddingVertical: 8 }]}
                    />
                  </View>
                </View>
              ) : (
                <>
                  {/* Customer Information & Switcher */}
                  <View style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <Text style={styles.label}>Customer Details</Text>
                      <Pressable
                        onPress={() => setShowEditCustomerDropdown(!showEditCustomerDropdown)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
                      >
                        <MaterialIcons name="person-search" size={14} color={colors.accent.primary} />
                        <Text style={{ fontSize: 11, fontWeight: "600", color: colors.accent.primary }}>
                          {showEditCustomerDropdown ? "Hide Switcher" : "Change Customer"}
                        </Text>
                      </Pressable>
                    </View>

                    {showEditCustomerDropdown && (
                      <View style={{ marginBottom: 10, padding: 8, backgroundColor: colors.bg.primary, borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle }}>
                        <TextInput
                          value={customerSearchQuery}
                          onChangeText={setCustomerSearchQuery}
                          placeholder="Search customer by name or phone..."
                          placeholderTextColor={colors.text.muted}
                          style={[styles.input, { marginBottom: 6 }]}
                        />
                        <ScrollView style={{ maxHeight: 140 }} nestedScrollEnabled>
                          {(customers || [])
                            .filter((c: any) =>
                              (c.name || "").toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                              (c.phone || "").includes(customerSearchQuery)
                            )
                            .slice(0, 15)
                            .map((cust: any) => (
                              <Pressable
                                key={cust.id}
                                style={{
                                  paddingVertical: 8,
                                  paddingHorizontal: 10,
                                  borderBottomWidth: 1,
                                  borderBottomColor: colors.border.subtle,
                                  backgroundColor: editCustomerId === cust.id ? `${colors.accent.primary}15` : "transparent",
                                  borderRadius: 4,
                                }}
                                onPress={() => {
                                  setEditCustomerId(cust.id);
                                  setEditCustomerName(cust.name || "");
                                  setEditCustomerPhone(cust.phone || cust.mobile || "");
                                  setShowEditCustomerDropdown(false);
                                }}
                              >
                                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text.primary }}>
                                  {cust.name}
                                </Text>
                                {!!(cust.phone || cust.mobile) && (
                                  <Text style={{ fontSize: 11, color: colors.text.muted }}>
                                    {cust.phone || cust.mobile}
                                  </Text>
                                )}
                              </Pressable>
                            ))}
                        </ScrollView>
                      </View>
                    )}

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.label, { fontSize: 11 }]}>Name</Text>
                        <TextInput
                          value={editCustomerName}
                          onChangeText={setEditCustomerName}
                          placeholder="Customer Name"
                          style={styles.input}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.label, { fontSize: 11 }]}>Phone</Text>
                        <TextInput
                          value={editCustomerPhone}
                          onChangeText={setEditCustomerPhone}
                          placeholder="Phone Number"
                          keyboardType="phone-pad"
                          style={styles.input}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Product Section */}
                  <View style={styles.divider} />
                  <View style={styles.sectionHeader}>
                    <MaterialIcons
                      name="local-mall"
                      size={20}
                      color="#3B82F6"
                    />
                    <Text style={styles.sectionTitle}>1. Product details</Text>
                  </View>

                  <Text style={styles.label}>Search & Select Product</Text>
                  <TextInput
                    value={itemSearch}
                    onChangeText={setItemSearch}
                    placeholder="Type item name to filter..."
                    placeholderTextColor={colors.text.muted}
                    style={styles.input}
                  />

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.itemsScroll}
                  >
                    <View style={styles.itemsRow}>
                      {sortedItems
                        .filter((item: any) =>
                          item.itemName
                            ?.toLowerCase()
                            .includes(itemSearch.toLowerCase()),
                        )
                        .map((item: any) => {
                          const active = selectedItemId === item.id;
                          const stock =
                            item.openingStock !== undefined
                              ? item.openingStock
                              : item.stock || 0;

                          return (
                            <Pressable
                              key={item.id}
                              style={[
                                styles.itemCard,
                                active && styles.itemCardActive,
                              ]}
                              onPress={() => handleSelectItemForEdit(item.id)}
                            >
                              <Text
                                style={[
                                  styles.itemCardName,
                                  active && styles.itemCardNameActive,
                                  item.status === "Inactive" && { color: colors.text.muted },
                                ]}
                              >
                                {item.itemName} {item.status === "Inactive" ? "(Inactive)" : ""}
                              </Text>
                              <Text style={styles.itemCardStock}>
                                Stock: {stock} units
                              </Text>
                              <Text style={styles.itemCardPrice}>
                                ₹{item.sellingRate || item.sellingPrice || 0}
                              </Text>
                            </Pressable>
                          );
                        })}
                    </View>
                  </ScrollView>

                  <View style={[styles.flexRow, { marginTop: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Quantity</Text>
                      <TextInput
                        value={selectedItemQty}
                        onChangeText={setSelectedItemQty}
                        keyboardType="numeric"
                        style={styles.input}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Rate (₹)</Text>
                      <TextInput
                        value={selectedItemRate}
                        onChangeText={setSelectedItemRate}
                        keyboardType="numeric"
                        style={styles.input}
                      />
                    </View>
                  </View>

                  {/* Add / Update Product to Bill Button */}
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <Pressable
                      style={[styles.addButton, { flex: 1 }]}
                      onPress={handleAddItemToEdit}
                    >
                      <MaterialIcons
                        name={editingEditItemIndex !== null ? "check" : "add-shopping-cart"}
                        size={16}
                        color={colors.bg.card}
                      />
                      <Text style={styles.addButtonText}>
                        {editingEditItemIndex !== null ? "Update Item in Bill" : "Add Product to Bill"}
                      </Text>
                    </Pressable>

                    {editingEditItemIndex !== null && (
                      <Pressable
                        style={[
                          styles.addButton,
                          { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.medium },
                        ]}
                        onPress={handleCancelEditItemInEditModal}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text.primary }}>
                          Cancel
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Added Items List with Inline Stepper & Direct Rate Edit */}
                  {editItems.length > 0 && (
                    <View style={styles.addedItemsContainer}>
                      <Text style={styles.addedItemsTitle}>
                        Added Items ({editItems.length})
                      </Text>
                      {editItems.map((item, idx) => {
                        const isEditingThis = editingEditItemIndex === idx;

                        return (
                          <View
                            key={idx}
                            style={[
                              styles.addedItemRow,
                              isEditingThis && styles.addedItemRowEditing,
                              { flexDirection: "column", alignItems: "stretch", gap: 8 },
                            ]}
                          >
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <View style={styles.addedItemInfo}>
                                <Text style={styles.addedItemName}>
                                  {item.itemName}
                                </Text>
                                <Text style={styles.addedItemSub}>
                                  {item.rateType || "piece"}
                                </Text>
                              </View>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <Text style={styles.addedItemTotal}>
                                  ₹{(Number(item.grossTotal) || (Number(item.quantity || 0) * Number(item.rate || 0))).toLocaleString("en-IN")}
                                </Text>
                                <Pressable
                                  style={styles.removeItemBtn}
                                  onPress={() => handleRemoveItemFromEdit(idx)}
                                >
                                  <MaterialIcons
                                    name="delete-outline"
                                    size={20}
                                    color={colors.accent.danger}
                                  />
                                </Pressable>
                              </View>
                            </View>

                            {/* Inline Stepper & Rate Input */}
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border.subtle }}>
                              {/* Quantity Stepper */}
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <Text style={{ fontSize: 11, color: colors.text.muted, fontWeight: "600" }}>Qty:</Text>
                                <Pressable
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    backgroundColor: colors.bg.primary,
                                    borderWidth: 1,
                                    borderColor: colors.border.medium,
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                  onPress={() => {
                                    const curr = Number(item.quantity) || 0;
                                    if (curr > 1) {
                                      handleUpdateEditItemQuantity(idx, String(curr - 1));
                                    }
                                  }}
                                >
                                  <MaterialIcons name="remove" size={16} color={colors.text.primary} />
                                </Pressable>
                                <TextInput
                                  value={String(item.quantity !== undefined ? item.quantity : "")}
                                  onChangeText={(val) => handleUpdateEditItemQuantity(idx, val)}
                                  keyboardType="numeric"
                                  style={{
                                    width: 50,
                                    height: 30,
                                    borderRadius: 6,
                                    backgroundColor: colors.bg.card,
                                    borderWidth: 1,
                                    borderColor: colors.border.subtle,
                                    textAlign: "center",
                                    fontSize: 13,
                                    fontWeight: "700",
                                    color: colors.text.primary,
                                    padding: 0,
                                  }}
                                />
                                <Pressable
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    backgroundColor: colors.bg.primary,
                                    borderWidth: 1,
                                    borderColor: colors.border.medium,
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                  onPress={() => {
                                    const curr = Number(item.quantity) || 0;
                                    handleUpdateEditItemQuantity(idx, String(curr + 1));
                                  }}
                                >
                                  <MaterialIcons name="add" size={16} color={colors.text.primary} />
                                </Pressable>
                              </View>

                              {/* Direct Rate Input */}
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Text style={{ fontSize: 11, color: colors.text.muted, fontWeight: "600" }}>Rate ₹:</Text>
                                <TextInput
                                  value={String(item.rate !== undefined ? item.rate : "")}
                                  onChangeText={(val) => handleUpdateEditItemRate(idx, val)}
                                  keyboardType="numeric"
                                  style={{
                                    width: 65,
                                    height: 30,
                                    borderRadius: 6,
                                    backgroundColor: colors.bg.card,
                                    borderWidth: 1,
                                    borderColor: colors.border.subtle,
                                    textAlign: "center",
                                    fontSize: 13,
                                    fontWeight: "600",
                                    color: colors.text.primary,
                                    padding: 0,
                                  }}
                                />
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Shipments Section */}
                  <View style={styles.divider} />
                  <View style={styles.sectionHeader}>
                    <MaterialIcons
                      name="local-shipping"
                      size={20}
                      color={colors.accent.primary}
                    />
                    <Text style={styles.sectionTitle}>2. Shipments</Text>
                  </View>

                  <Text style={styles.label}>Assign Delivery Partner</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.partnersScroll}
                  >
                    <View style={styles.partnersRow}>
                      <Pressable
                        style={[
                          styles.partnerCard,
                          !editDeliveryPartnerId && styles.partnerCardActive,
                        ]}
                        onPress={() => setEditDeliveryPartnerId("")}
                      >
                        <Text
                          style={[
                            styles.partnerName,
                            !editDeliveryPartnerId && styles.partnerNameActive,
                          ]}
                        >
                          No Delivery (Self Pickup)
                        </Text>
                      </Pressable>

                      {sortedDeliveryPartners.map((p: any) => {
                        const active = editDeliveryPartnerId === p.id;
                        return (
                          <Pressable
                            key={p.id}
                            style={[
                              styles.partnerCard,
                              active && styles.partnerCardActive,
                              p.isFavorite && !active && { backgroundColor: "#fef3c7", borderColor: "#fde047" },
                            ]}
                            onPress={() => setEditDeliveryPartnerId(p.id)}
                          >
                            <Text
                              style={[
                                styles.partnerName,
                                active && styles.partnerNameActive,
                                p.isFavorite && !active && { color: "#d97706" },
                              ]}
                            >
                              {p.isFavorite ? "⭐ " : ""}{p.name} ({p.vehicleType || "Driver"})
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {/* Billed Shipment Charge & Distance */}
                  <View style={{ marginTop: 8, marginBottom: 12 }}>
                    {editDeliveryPartnerId && editDeliveryRateType === "kilometre" && (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={styles.label}>
                          Delivery Distance (KM)
                        </Text>
                        <TextInput
                          value={editShipmentDistance}
                          onChangeText={setEditShipmentDistance}
                          keyboardType="numeric"
                          placeholder="e.g. 10"
                          placeholderTextColor={colors.text.muted}
                          style={styles.input}
                        />
                      </View>
                    )}

                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={styles.label}>Billed Shipment Charge (₹)</Text>
                      {isShipmentCustomized && (
                        <Pressable
                          onPress={() => setIsShipmentCustomized(false)}
                          style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
                        >
                          <MaterialIcons name="refresh" size={13} color={colors.accent.primary} />
                          <Text style={{ fontSize: 11, color: colors.accent.primary, fontWeight: "600" }}>
                            Auto-Calculate
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    <TextInput
                      value={editShipmentCharge}
                      onChangeText={(val) => {
                        setIsShipmentCustomized(true);
                        setEditShipmentCharge(val);
                      }}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                      style={styles.input}
                    />

                    {!!editDeliveryPartnerId && (
                      <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 4, marginBottom: 4 }}>
                        {(() => {
                          const p = partners.find((x: any) => x.id === editDeliveryPartnerId);
                          if (!p) return "";
                          if (p.deliveryRateType === "kilometre") {
                            return `Partner Rate: ₹${p.deliveryRate || 0}/KM${Number(p.minimumRate || 0) > 0 ? ` (Min Floor: ₹${p.minimumRate})` : ""}`;
                          }
                          if (p.deliveryRateType === "per brick") {
                            return `Partner Rate: ₹${p.deliveryRate || 0}/brick${Number(p.minimumRate || 0) > 0 ? ` (Min Floor: ₹${p.minimumRate})` : ""}`;
                          }
                          return `Partner Fixed Rate: ₹${p.deliveryRate || 0}${Number(p.minimumRate || 0) > 0 ? ` (Min Floor: ₹${p.minimumRate})` : ""}`;
                        })()}
                      </Text>
                    )}
                  </View>

                  <Text style={styles.label}>Assign Money Collector</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.partnersScroll}>
                    <View style={styles.partnersRow}>
                      <Pressable
                        style={[
                          styles.partnerCard,
                          !editCollectorId && styles.partnerCardActive,
                        ]}
                        onPress={() => setEditCollectorId("")}
                      >
                        <Text
                          style={[
                            styles.partnerName,
                            !editCollectorId && styles.partnerNameActive,
                          ]}
                        >
                          No Collector
                        </Text>
                      </Pressable>
                      {(collectors || []).map((c: any) => {
                        const active = editCollectorId === c.id;
                        return (
                          <Pressable
                            key={c.id}
                            style={[
                              styles.partnerCard,
                              active && styles.partnerCardActive,
                            ]}
                            onPress={() => setEditCollectorId(c.id)}
                          >
                            <Text
                              style={[
                                styles.partnerName,
                                active && styles.partnerNameActive,
                              ]}
                            >
                              {c.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>

                  <Text style={styles.label}>Assign Loading Worker</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.partnersScroll}>
                    <View style={styles.partnersRow}>
                      <Pressable
                        style={[
                          styles.partnerCard,
                          !editLoadingWorkerId && styles.partnerCardActive,
                        ]}
                        onPress={() => setEditLoadingWorkerId("")}
                      >
                        <Text
                          style={[
                            styles.partnerName,
                            !editLoadingWorkerId && styles.partnerNameActive,
                          ]}
                        >
                          No Loading Worker
                        </Text>
                      </Pressable>
                      {(workers || []).map((w: any) => {
                        const active = editLoadingWorkerId === w.id;
                        return (
                          <Pressable
                            key={w.id}
                            style={[
                              styles.partnerCard,
                              active && styles.partnerCardActive,
                            ]}
                            onPress={() => setEditLoadingWorkerId(w.id)}
                          >
                            <Text
                              style={[
                                styles.partnerName,
                                active && styles.partnerNameActive,
                              ]}
                            >
                              {w.name} (₹{w.loadingCost || 0}/unit)
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>

                  <Text style={styles.label}>Assign Unloading Worker</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.partnersScroll}>
                    <View style={styles.partnersRow}>
                      <Pressable
                        style={[
                          styles.partnerCard,
                          !editUnloadingWorkerId && styles.partnerCardActive,
                        ]}
                        onPress={() => setEditUnloadingWorkerId("")}
                      >
                        <Text
                          style={[
                            styles.partnerName,
                            !editUnloadingWorkerId && styles.partnerNameActive,
                          ]}
                        >
                          No Unloading Worker
                        </Text>
                      </Pressable>
                      {(workers || []).map((w: any) => {
                        const active = editUnloadingWorkerId === w.id;
                        return (
                          <Pressable
                            key={w.id}
                            style={[
                              styles.partnerCard,
                              active && styles.partnerCardActive,
                            ]}
                            onPress={() => setEditUnloadingWorkerId(w.id)}
                          >
                            <Text
                              style={[
                                styles.partnerName,
                                active && styles.partnerNameActive,
                              ]}
                            >
                              {w.name} (₹{w.unloadingCost || 0}/unit)
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {/* Billing Calculations */}
                  <View style={styles.divider} />
                  <View style={styles.sectionHeader}>
                    <MaterialIcons
                      name="receipt"
                      size={20}
                      color={colors.accent.warning}
                    />
                    <Text style={styles.sectionTitle}>
                      3. Billing & Payments
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={styles.label}>Extra Amount / Charge (₹)</Text>
                    <Pressable
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 2,
                        marginBottom: 4,
                      }}
                      onPress={() => setShowEditExtraDesc(!showEditExtraDesc)}
                    >
                      <MaterialIcons
                        name={showEditExtraDesc ? "remove" : "add"}
                        size={16}
                        color="#3B82F6"
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "600",
                          color: "#3B82F6",
                        }}
                      >
                        Description
                      </Text>
                    </Pressable>
                  </View>
                  <TextInput
                    value={editExtraAmount}
                    onChangeText={setEditExtraAmount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.text.muted}
                    style={styles.input}
                  />

                  {showEditExtraDesc && (
                    <View>
                      <Text style={styles.label}>Extra Charge Description</Text>
                      <TextInput
                        value={editExtraAmountDescription}
                        onChangeText={setEditExtraAmountDescription}
                        placeholder="e.g. Loading charge, packaging fee"
                        placeholderTextColor={colors.text.muted}
                        style={styles.input}
                      />
                    </View>
                  )}

                  {/* Discount Section */}
                  <Text style={styles.label}>Discount (Optional)</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                    <TextInput
                      value={editDiscount}
                      onChangeText={setEditDiscount}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    />
                    <Pressable
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        backgroundColor: editDiscountType === "amount" ? colors.accent.primary : colors.bg.card,
                        borderRadius: 8,
                        justifyContent: "center",
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: colors.border.subtle,
                      }}
                      onPress={() => setEditDiscountType("amount")}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: editDiscountType === "amount" ? "#FFF" : colors.text.primary }}>₹ Flat</Text>
                    </Pressable>
                    <Pressable
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        backgroundColor: editDiscountType === "percent" ? colors.accent.primary : colors.bg.card,
                        borderRadius: 8,
                        justifyContent: "center",
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: colors.border.subtle,
                      }}
                      onPress={() => setEditDiscountType("percent")}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: editDiscountType === "percent" ? "#FFF" : colors.text.primary }}>% Percent</Text>
                    </Pressable>
                    <Pressable
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        backgroundColor: editDiscountType === "per_brick" ? colors.accent.primary : colors.bg.card,
                        borderRadius: 8,
                        justifyContent: "center",
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: colors.border.subtle,
                      }}
                      onPress={() => setEditDiscountType("per_brick")}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: editDiscountType === "per_brick" ? "#FFF" : colors.text.primary }}>₹/Brick</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.label}>Amount Paid (₹)</Text>
                  <TextInput
                    value={editPaidAmount}
                    onChangeText={setEditPaidAmount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.text.muted}
                    style={styles.input}
                  />

                  {/* Payment Method Selector */}
                  <View style={{ marginTop: 10, marginBottom: 8 }}>
                    <Text style={[styles.label, { marginBottom: 8 }]}>Payment Method</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {[
                        { key: "Cash", icon: "payments", color: colors.accent.success },
                        { key: "UPI", icon: "phone-android", color: colors.accent.info },
                        { key: "Bank Transfer", icon: "account-balance", color: colors.accent.primary },
                        { key: "Cheque", icon: "offline-pin", color: colors.accent.warning },
                        { key: "Other", icon: "more-horiz", color: colors.text.muted },
                      ].map((method) => {
                        const isSelected = editPaymentMethod === method.key;
                        return (
                          <Pressable
                            key={method.key}
                            style={({ pressed }) => [
                              {
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                paddingVertical: 7,
                                paddingHorizontal: 12,
                                borderRadius: 8,
                                borderWidth: 1.5,
                                borderColor: isSelected ? method.color : colors.border.subtle,
                                backgroundColor: isSelected ? `${method.color}15` : colors.bg.primary,
                              },
                              pressed && { opacity: 0.75 },
                            ]}
                            onPress={() => setEditPaymentMethod(method.key)}
                          >
                            <MaterialIcons
                              name={method.icon as any}
                              size={16}
                              color={isSelected ? method.color : colors.text.muted}
                            />
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: isSelected ? "700" : "600",
                                color: isSelected ? method.color : colors.text.secondary,
                              }}
                            >
                              {method.key}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Status & Delivery Progress Section */}
                  <View style={{ marginTop: 12, marginBottom: 8, padding: 12, backgroundColor: colors.bg.primary, borderRadius: 10, borderWidth: 1, borderColor: colors.border.subtle }}>
                    <Text style={[styles.label, { marginBottom: 8, color: colors.accent.primary, fontWeight: "700" }]}>
                      Order Status & Delivery Progress
                    </Text>

                    <Text style={styles.label}>Order Status</Text>
                    <View style={styles.statusRow}>
                      {["pending", "in-transit", "completed", "cancelled"].map(
                        (status) => {
                          const active = editStatus === status;
                          return (
                            <Pressable
                              key={status}
                              onPress={() => handleStatusChangeInEditModal(status)}
                              style={[
                                styles.statusTogglePill,
                                active && {
                                  backgroundColor: `${getStatusColor(status)}15`,
                                  borderColor: getStatusColor(status),
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusTogglePillText,
                                  {
                                    color: active
                                      ? getStatusColor(status)
                                      : colors.text.muted,
                                  },
                                ]}
                              >
                                {status.toUpperCase()}
                              </Text>
                            </Pressable>
                          );
                        },
                      )}
                    </View>

                    {(() => {
                      const totalQty = editItems.reduce(
                        (sum, item) => sum + Number(item.quantity || 0),
                        0,
                      );
                      const delivered = Number(editDeliveredQty) || 0;
                      const progressPct = totalQty > 0 ? Math.min(100, Math.round((delivered / totalQty) * 100)) : 0;

                      return (
                        <View style={{ marginTop: 10 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <Text style={styles.label}>Delivered Quantity Progress</Text>
                            <Text style={{ fontSize: 12, fontWeight: "700", color: editStatus === "completed" ? "#10B981" : colors.accent.primary }}>
                              {delivered} / {totalQty} ({progressPct}%)
                            </Text>
                          </View>

                          {/* Visual Progress Bar */}
                          <View
                            style={{
                              height: 8,
                              backgroundColor: colors.border.subtle,
                              borderRadius: 4,
                              overflow: "hidden",
                              marginBottom: 8,
                            }}
                          >
                            <View
                              style={{
                                height: "100%",
                                width: `${progressPct}%`,
                                backgroundColor: editStatus === "completed" ? "#10B981" : editStatus === "in-transit" ? "#3B82F6" : "#F59E0B",
                                borderRadius: 4,
                              }}
                            />
                          </View>

                          <TextInput
                            value={editDeliveredQty}
                            onChangeText={handleDeliveredQtyChangeInEditModal}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={colors.text.muted}
                            style={styles.input}
                          />
                        </View>
                      );
                    })()}
                  </View>

                  {/* Live Totals Container */}
                  {(() => {
                    const customerObj = (selectedOrder?.customerId && customerByIdMap.get(selectedOrder.customerId)) ||
                      (customers || []).find((c: any) =>
                        (c.name && selectedOrder?.customerName && c.name.trim().toLowerCase() === selectedOrder.customerName.trim().toLowerCase()) ||
                        (c.phone && selectedOrder?.customerPhone && c.phone.trim() === selectedOrder.customerPhone.trim())
                      );
                    const customerCurrentPending = customerObj
                      ? (customerObj.totalPending !== undefined ? Number(customerObj.totalPending) : Number(customerObj.balance || 0))
                      : 0;
                    const originalOrderUnpaid = Number(selectedOrder?.balanceDue || 0);
                    const oldBalanceDue = selectedOrder?.previousBalance !== undefined
                      ? Number(selectedOrder.previousBalance)
                      : Math.max(0, customerCurrentPending - originalOrderUnpaid);

                    const grandTotalWithOldDues = editTotalVal + oldBalanceDue;
                    const totalBalanceUnpaid = oldBalanceDue + editBalanceDueVal;

                    return (
                      <View style={styles.calcContainer}>
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Gross Product Total:</Text>
                          <Text style={styles.calcValue}>
                            ₹{editGrossTotal.toLocaleString("en-IN")}
                          </Text>
                        </View>
                        {editShipmentVal > 0 && (
                          <View style={styles.calcRow}>
                            <Text style={styles.calcLabel}>Shipment Charge:</Text>
                            <Text style={styles.calcValue}>
                              ₹{editShipmentVal.toLocaleString("en-IN")}
                            </Text>
                          </View>
                        )}
                        {editExtraVal > 0 && (
                          <View style={styles.calcRow}>
                            <Text style={styles.calcLabel}>Extra Charge:</Text>
                            <Text style={styles.calcValue}>
                              ₹{editExtraVal.toLocaleString("en-IN")}
                            </Text>
                          </View>
                        )}
                        {editLoadingCharge > 0 && (
                          <View style={styles.calcRow}>
                            <Text style={styles.calcLabel}>Loading Charge ({loadingWorkerName}):</Text>
                            <Text style={styles.calcValue}>
                              ₹{editLoadingCharge.toLocaleString("en-IN")}
                            </Text>
                          </View>
                        )}
                        {editUnloadingCharge > 0 && (
                          <View style={styles.calcRow}>
                            <Text style={styles.calcLabel}>Unloading Charge ({unloadingWorkerName}):</Text>
                            <Text style={styles.calcValue}>
                              ₹{editUnloadingCharge.toLocaleString("en-IN")}
                            </Text>
                          </View>
                        )}
                        {editDiscountAmount > 0 && (
                          <View style={styles.calcRow}>
                            <Text style={[styles.calcLabel, { color: colors.accent.success, fontWeight: "600" }]}>
                              Discount ({editDiscountType === "percent" ? `${editDiscount}%` : editDiscountType === "per_brick" ? `₹${editDiscount}/brick` : "Flat"}):
                            </Text>
                            <Text style={[styles.calcValue, { color: colors.accent.success, fontWeight: "700" }]}>
                              -₹{editDiscountAmount.toLocaleString("en-IN")}
                            </Text>
                          </View>
                        )}
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Current Order Subtotal:</Text>
                          <Text style={styles.calcValue}>
                            ₹{editTotalVal.toLocaleString("en-IN")}
                          </Text>
                        </View>
                        {oldBalanceDue > 0 && (
                          <View style={styles.calcRow}>
                            <Text style={[styles.calcLabel, { color: colors.accent.danger, fontWeight: "700" }]}>
                              Old Balance Due (Previous):
                            </Text>
                            <Text style={[styles.calcValue, { color: colors.accent.danger, fontWeight: "700" }]}>
                              +₹{oldBalanceDue.toLocaleString("en-IN")}
                            </Text>
                          </View>
                        )}
                        <View style={[styles.divider, { marginVertical: 4 }]} />
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabelBold}>
                            Total Order Amount (incl. Old Dues):
                          </Text>
                          <Text style={[styles.calcValueBold, { color: colors.accent.primary }]}>
                            ₹{grandTotalWithOldDues.toLocaleString("en-IN")}
                          </Text>
                        </View>
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Amount Paid Today:</Text>
                          <Text style={[styles.calcValue, { color: colors.accent.success, fontWeight: "700" }]}>
                            ₹{editPaidVal.toLocaleString("en-IN")}
                          </Text>
                        </View>
                        <View style={[styles.divider, { marginVertical: 4 }]} />
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabelBold}>
                            Total Outstanding Unpaid:
                          </Text>
                          <Text
                            style={[
                              styles.calcValueBold,
                              totalBalanceUnpaid > 0 && {
                                color: colors.accent.danger,
                              },
                            ]}
                          >
                            ₹{totalBalanceUnpaid.toLocaleString("en-IN")}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                style={[styles.footerBtn, styles.cancelFooterBtn]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelFooterBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.footerBtn, styles.saveFooterBtn]}
                onPress={() => {
                  if (selectedOrder?.isRawMaterialOrder) {
                    handleSaveRawMaterialEdit();
                  } else {
                    handleSaveEdit();
                  }
                }}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.bg.card} />
                ) : (
                  <Text style={styles.saveFooterBtnText}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Calendar Picker Modal */}
      {(() => {
        const daysInMonth = new Date(
          expenseDate.getFullYear(),
          expenseDate.getMonth() + 1,
          0,
        ).getDate();
        const firstDayIndex = new Date(
          expenseDate.getFullYear(),
          expenseDate.getMonth(),
          1,
        ).getDay();
        const monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];

        const weeks = [];
        let days = [];
        for (let i = 0; i < firstDayIndex; i++) {
          days.push(
            <View key={`empty-${i}`} style={styles.calendarEmptyDay} />,
          );
        }

        for (let d = 1; d <= daysInMonth; d++) {
          const isSelected = expenseDate.getDate() === d;
          days.push(
            <Pressable
              key={`day-${d}`}
              style={[
                styles.calendarDay,
                isSelected && styles.calendarSelectedDay,
              ]}
              onPress={() => {
                const newD = new Date(expenseDate);
                newD.setDate(d);
                setExpenseDate(newD);
                setIsExpenseCalendarOpen(false);
              }}
            >
              <Text
                style={[
                  styles.calendarDayText,
                  isSelected && styles.calendarSelectedDayText,
                ]}
              >
                {d}
              </Text>
            </Pressable>,
          );

          if (days.length === 7) {
            weeks.push(
              <View key={`week-${d}`} style={styles.calendarWeekRow}>
                {days}
              </View>,
            );
            days = [];
          }
        }
        if (days.length > 0) {
          while (days.length < 7) {
            days.push(
              <View
                key={`empty-end-${days.length}`}
                style={styles.calendarEmptyDay}
              />,
            );
          }
          weeks.push(
            <View key="week-end" style={styles.calendarWeekRow}>
              {days}
            </View>,
          );
        }

        return (
          <Modal
            visible={isExpenseCalendarOpen}
            transparent
            animationType="fade"
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.calendarCard}>
                <View style={styles.calendarHeader}>
                  <Pressable
                    onPress={() => {
                      const prev = new Date(expenseDate);
                      prev.setMonth(prev.getMonth() - 1);
                      setExpenseDate(prev);
                    }}
                  >
                    <MaterialIcons
                      name="chevron-left"
                      size={28}
                      color="#059669"
                    />
                  </Pressable>
                  <Text style={styles.calendarHeaderTitle}>
                    {monthNames[expenseDate.getMonth()]}{" "}
                    {expenseDate.getFullYear()}
                  </Text>
                  <Pressable
                    onPress={() => {
                      const next = new Date(expenseDate);
                      next.setMonth(next.getMonth() + 1);
                      setExpenseDate(next);
                    }}
                  >
                    <MaterialIcons
                      name="chevron-right"
                      size={28}
                      color="#059669"
                    />
                  </Pressable>
                </View>

                <View style={styles.calendarWeekHeader}>
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((dayName) => (
                    <Text key={dayName} style={styles.calendarWeekName}>
                      {dayName}
                    </Text>
                  ))}
                </View>
                <View style={styles.calendarGrid}>{weeks}</View>

                <Pressable
                  style={styles.calendarCloseBtn}
                  onPress={() => setIsExpenseCalendarOpen(false)}
                >
                  <Text style={styles.calendarCloseText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* Expense Form Modal */}
      <Modal
        visible={expenseModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formHeaderTitle}>
              {editingExpenseId ? "✏️ Edit Expense" : "➕ Add Expense"}
            </Text>
            <Pressable onPress={() => setExpenseModalVisible(false)}>
              <MaterialIcons name="close" size={26} color={colors.text.muted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.formScrollView}
            contentContainerStyle={styles.formContent}
          >
            {/* Title */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Expense Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Diesel for Truck KA-02"
                value={expenseTitle}
                onChangeText={setExpenseTitle}
              />
            </View>

            {/* Category selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Expense Category *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Fuel, Salary, Office, Raw Materials"
                value={expenseCategory}
                onChangeText={setExpenseCategory}
              />
            </View>

            {/* Payment Status Segment Toggle */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Payment Status *</Text>
              <View style={styles.segmentContainer}>
                <Pressable
                  style={[
                    styles.segmentBtn,
                    expenseStatus === "Paid" && styles.segmentBtnActive,
                  ]}
                  onPress={() => setExpenseStatus("Paid")}
                >
                  <MaterialIcons
                    name="check-circle"
                    size={16}
                    color={
                      expenseStatus === "Paid"
                        ? "#1A1D27"
                        : colors.text.secondary
                    }
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.segmentBtnText,
                      expenseStatus === "Paid" && styles.segmentBtnTextActive,
                    ]}
                  >
                    Fully Paid
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.segmentBtn,
                    expenseStatus === "Balance" && styles.segmentBtnActive,
                  ]}
                  onPress={() => setExpenseStatus("Balance")}
                >
                  <MaterialIcons
                    name="pending-actions"
                    size={16}
                    color={
                      expenseStatus === "Balance"
                        ? "#1A1D27"
                        : colors.text.secondary
                    }
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.segmentBtnText,
                      expenseStatus === "Balance" &&
                        styles.segmentBtnTextActive,
                    ]}
                  >
                    With Balance
                  </Text>
                </Pressable>
              </View>
            </View>

            {expenseStatus === "Paid" ? (
              <View style={styles.inputRow}>
                {/* Total Amount */}
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.inputLabel}>Amount (₹) *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="₹ 0.00"
                    keyboardType="numeric"
                    value={expenseTotalAmount}
                    onChangeText={setExpenseTotalAmount}
                  />
                </View>

                {/* Date */}
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Date *</Text>
                  <Pressable
                    style={styles.dateSelectorBtn}
                    onPress={() => setIsExpenseCalendarOpen(true)}
                  >
                    <MaterialIcons
                      name="calendar-today"
                      size={18}
                      color={colors.text.muted}
                    />
                    <Text style={styles.dateSelectorText}>
                      {expenseDate.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View>
                <View style={styles.inputRow}>
                  {/* Total Amount */}
                  <View
                    style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}
                  >
                    <Text style={styles.inputLabel}>Total Cost (₹) *</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="₹ 0.00"
                      keyboardType="numeric"
                      value={expenseTotalAmount}
                      onChangeText={setExpenseTotalAmount}
                    />
                  </View>

                  {/* Date */}
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Date *</Text>
                    <Pressable
                      style={styles.dateSelectorBtn}
                      onPress={() => setIsExpenseCalendarOpen(true)}
                    >
                      <MaterialIcons
                        name="calendar-today"
                        size={18}
                        color={colors.text.muted}
                      />
                      <Text style={styles.dateSelectorText}>
                        {expenseDate.toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.inputRow}>
                  {/* Partial Paid Amount */}
                  <View
                    style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}
                  >
                    <Text style={styles.inputLabel}>Paid Amount (₹) *</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="₹ 0.00"
                      keyboardType="numeric"
                      value={expensePaidAmount}
                      onChangeText={setExpensePaidAmount}
                    />
                  </View>

                  {/* Remaining Due Amount */}
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Remaining Due (₹)</Text>
                    <View style={[styles.textInput, styles.readOnlyInput]}>
                      <Text style={styles.readOnlyInputText}>
                        ₹
                        {Number(
                          parseFloat(expenseTotalAmount || "0") -
                            parseFloat(expensePaidAmount || "0"),
                        ).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Payment Method */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Payment Method *</Text>
              <View style={styles.methodContainer}>
                {PAYMENT_METHODS.map((method) => {
                  const isSelected = expensePaymentMethod === method;
                  return (
                    <Pressable
                      key={method}
                      style={[
                        styles.methodBtn,
                        isSelected && styles.methodBtnActive,
                      ]}
                      onPress={() => setExpensePaymentMethod(method)}
                    >
                      <Text
                        style={[
                          styles.methodText,
                          isSelected && styles.methodTextActive,
                        ]}
                      >
                        {method}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Notes / Description</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Specify extra details here..."
                multiline
                numberOfLines={3}
                value={expenseDescription}
                onChangeText={setExpenseDescription}
              />
            </View>

            {/* Bill Receipt Upload */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Receipt / Bill Image</Text>
              <View style={styles.imageUploadContainer}>
                {expenseBillImageUri || existingBillImageUrl ? (
                  <View style={styles.imagePreviewWrapper}>
                    <Image
                      source={{
                        uri:
                          expenseBillImageUri ||
                          existingBillImageUrl ||
                          undefined,
                      }}
                      style={styles.imagePreview}
                    />
                    <Pressable
                      style={styles.removeImageBtn}
                      onPress={() => {
                        setExpenseBillImageUri(null);
                        setExistingBillImageUrl(null);
                      }}
                    >
                      <MaterialIcons
                        name="cancel"
                        size={24}
                        color={colors.accent.danger}
                      />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={styles.uploadPlaceholder}
                    onPress={handlePickImage}
                  >
                    <MaterialIcons
                      name="add-a-photo"
                      size={32}
                      color={colors.text.muted}
                    />
                    <Text style={styles.uploadPlaceholderText}>
                      Upload Receipt Photo
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Form Footer */}
          <View style={styles.formFooter}>
            <Pressable
              style={[styles.formFooterBtn, styles.formCancelBtn]}
              onPress={() => setExpenseModalVisible(false)}
            >
              <Text style={styles.formCancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.formFooterBtn, styles.formSubmitBtn]}
              onPress={handleSaveExpense}
              disabled={isSavingExpense}
            >
              {isSavingExpense ? (
                <ActivityIndicator size="small" color={colors.bg.card} />
              ) : (
                <Text style={styles.formSubmitBtnText}>
                  {editingExpenseId ? "Update Registry" : "Save Expense"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
      <EasyCalendarModal
        visible={isEditOrderCalendarOpen}
        date={editOrderDate}
        onSelectDate={(newDate) => {
          setEditOrderDate(newDate);
          setIsEditOrderCalendarOpen(false);
        }}
        onClose={() => setIsEditOrderCalendarOpen(false)}
        title="Select Transaction Date"
      />
      <EasyCalendarModal
        visible={isSearchCalendarOpen}
        date={selectedFilterDate || new Date()}
        onSelectDate={(newDate) => {
          setSelectedFilterDate(newDate);
          setDateFilterPreset("custom");
          setIsSearchCalendarOpen(false);
        }}
        onClose={() => setIsSearchCalendarOpen(false)}
        title="Search / Filter Orders by Date"
      />
      <EasyCalendarModal
        visible={isDeliveryCalendarOpen}
        date={editDeliveryDate}
        onSelectDate={(newDate) => {
          setEditDeliveryDate(newDate);
          setIsDeliveryCalendarOpen(false);
        }}
        onClose={() => setIsDeliveryCalendarOpen(false)}
        title="Select Delivery Date"
      />
      {renderEditDeliveryModal()}

      {/* Pay / Record Payment Modal */}
      <Modal
        visible={isPayModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsPayModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 480 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: "#10B98115",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons name="payments" size={20} color="#10B981" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Record Payment</Text>
                  <Text style={{ fontSize: 12, color: colors.text.muted }}>
                    {payOrder?.customerName || "Client"}
                  </Text>
                </View>
              </View>
              <Pressable
                style={styles.closeBtn}
                onPress={() => setIsPayModalOpen(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
            >
              {/* Order Details Overview Box */}
              {payOrder && (
                <View
                  style={{
                    backgroundColor: colors.bg.primary,
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 16,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                    gap: 6,
                  }}
                >
                  <View style={styles.detailRow}>
                    <Text style={styles.bodyLabel}>Order Total</Text>
                    <Text style={[styles.bodyValue, { fontWeight: "700" }]}>
                      ₹{Number(payOrder.total || 0).toLocaleString("en-IN")}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.bodyLabel}>Already Paid</Text>
                    <Text style={[styles.bodyValue, { color: colors.accent.success, fontWeight: "700" }]}>
                      ₹{Number(payOrder.paidAmount || 0).toLocaleString("en-IN")}
                    </Text>
                  </View>
                  <View style={[styles.divider, { marginVertical: 4 }]} />
                  <View style={styles.detailRow}>
                    <Text style={[styles.bodyLabel, { fontWeight: "800", color: colors.accent.danger }]}>
                      Balance Remaining
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.accent.danger }}>
                      ₹{Number(payOrder.balanceDue !== undefined ? payOrder.balanceDue : (Number(payOrder.total || 0) - Number(payOrder.paidAmount || 0))).toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>
              )}

              {/* Quick Amount Select Pills */}
              {payOrder && Number(payOrder.balanceDue || 0) > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.label}>Quick Amount Select</Text>
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    <Pressable
                      style={[
                        styles.pill,
                        payAmount === String(payOrder.balanceDue) && styles.pillActive,
                      ]}
                      onPress={() => setPayAmount(String(payOrder.balanceDue))}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          payAmount === String(payOrder.balanceDue) && styles.pillTextActive,
                        ]}
                      >
                        Full Dues (₹{Number(payOrder.balanceDue).toLocaleString("en-IN")})
                      </Text>
                    </Pressable>
                    {Number(payOrder.balanceDue) >= 2 && (
                      <Pressable
                        style={[
                          styles.pill,
                          payAmount === String(Math.round(Number(payOrder.balanceDue) / 2)) && styles.pillActive,
                        ]}
                        onPress={() => setPayAmount(String(Math.round(Number(payOrder.balanceDue) / 2)))}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            payAmount === String(Math.round(Number(payOrder.balanceDue) / 2)) && styles.pillTextActive,
                          ]}
                        >
                          Half (₹{Math.round(Number(payOrder.balanceDue) / 2).toLocaleString("en-IN")})
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}

              {/* Payment Amount Input */}
              <Text style={styles.label}>Amount Received (₹) *</Text>
              <TextInput
                value={payAmount}
                onChangeText={setPayAmount}
                keyboardType="numeric"
                style={[styles.input, { fontSize: 18, fontWeight: "700", color: "#10B981" }]}
                placeholder="0.00"
                placeholderTextColor={colors.text.muted}
              />

              {/* Payment Method Selector */}
              <Text style={styles.label}>Payment Method *</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {PAYMENT_METHODS.map((method) => {
                  const active = payMethod === method;
                  return (
                    <Pressable
                      key={method}
                      style={[
                        styles.pill,
                        active && { backgroundColor: "#10B981", borderColor: "#10B981" },
                        { flex: 1, minWidth: 70, justifyContent: "center", alignItems: "center", height: 38 },
                      ]}
                      onPress={() => setPayMethod(method)}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          active && { color: "#FFFFFF", fontWeight: "700" },
                        ]}
                      >
                        {method}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Payment Date Picker */}
              <Text style={styles.label}>Payment Date *</Text>
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderWidth: 1,
                  borderColor: colors.border.medium,
                  borderRadius: 10,
                  height: 42,
                  paddingHorizontal: 12,
                  backgroundColor: colors.bg.primary,
                  marginBottom: 14,
                }}
                onPress={() => setIsPayCalendarOpen(true)}
              >
                <Text style={{ fontSize: 14, color: colors.text.primary, fontWeight: "600" }}>
                  {payDate.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
                <MaterialIcons name="event" size={20} color={colors.text.muted} />
              </Pressable>

              {/* Payment Notes */}
              <Text style={styles.label}>Payment Notes / Remarks (Optional)</Text>
              <TextInput
                value={payNotes}
                onChangeText={setPayNotes}
                style={[styles.input, { height: 60, textAlignVertical: "top", paddingTop: 8 }]}
                multiline
                placeholder="e.g. Received via GPay, Cash handed to driver"
                placeholderTextColor={colors.text.muted}
              />
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <Pressable
                style={[styles.footerBtn, styles.cancelFooterBtn]}
                onPress={() => setIsPayModalOpen(false)}
              >
                <Text style={styles.cancelFooterBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.footerBtn,
                  { backgroundColor: "#10B981" },
                ]}
                onPress={handleSavePayment}
                disabled={isSavingPayment}
              >
                {isSavingPayment ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <MaterialIcons name="check-circle" size={18} color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>
                      Confirm Payment
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Easy Calendar Modal for Payment Date */}
      <EasyCalendarModal
        visible={isPayCalendarOpen}
        date={payDate}
        onSelectDate={(newDate) => {
          setPayDate(newDate);
          setIsPayCalendarOpen(false);
        }}
        onClose={() => setIsPayCalendarOpen(false)}
        title="Select Payment Date"
      />
      <TransactionShareBottomSheet
        visible={shareBottomSheetVisible}
        transaction={sharingTransactionData}
        isDark={theme.isDark}
        onClose={() => setShareBottomSheetVisible(false)}
      />
    </AnimatedPage>
  );
}

const getStyles = (theme: any) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    container: {
      padding: 16,
      backgroundColor: colors.bg.primary,
      flexGrow: 1,
    },
    loading: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
    },
    loadingText: {
      marginTop: 12,
      color: colors.text.muted,
      fontWeight: "600",
    },
    header: {
      marginBottom: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 2,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 12,
    },
    calendarFilterBtn: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      justifyContent: "center",
      alignItems: "center",
    },
    calendarFilterBtnActive: {
      backgroundColor: "#6C5CE715",
      borderColor: colors.accent.primary,
    },
    searchBox: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 48,
      marginBottom: 12,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      color: colors.text.primary,
      fontSize: 14,
    },
    pillScroll: {
      marginBottom: 16,
      flexDirection: "row",
    },
    pillRow: {
      flexDirection: "row",
      gap: 8,
    },
    pill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    pillActive: {
      backgroundColor: "#6C5CE720",
      borderColor: colors.accent.primary,
    },
    pillText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.muted,
    },
    pillTextActive: {
      color: colors.accent.primary,
    },
    list: {
      gap: 14,
      marginBottom: 30,
    },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 48,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.secondary,
      marginTop: 12,
    },
    emptyDesc: {
      fontSize: 13,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: 4,
      paddingHorizontal: 32,
    },
    card: {
      backgroundColor: colors.bg.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.03,
      shadowRadius: 10,
      elevation: 2,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    clientName: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text.primary,
      lineHeight: 22,
    },
    date: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    statusText: {
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    divider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      marginVertical: 12,
    },
    cardBody: {
      gap: 8,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    bodyLabel: {
      fontSize: 13,
      color: colors.text.muted,
    },
    bodyValue: {
      fontSize: 13,
      color: colors.text.primary,
      fontWeight: "500",
    },
    totalValue: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    balanceValue: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.accent.danger,
    },
    cardActions: {
      flexDirection: "row",
      gap: 6,
      marginTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      paddingTop: 12,
    },
    rawMaterialNotice: {
      flexDirection: "row",
      backgroundColor: "#fffbeb",
      borderWidth: 1.5,
      borderColor: "#fde68a",
      borderRadius: 10,
      padding: 10,
      marginTop: 12,
      gap: 6,
      alignItems: "flex-start",
    },
    rawMaterialNoticeText: {
      color: colors.accent.warning,
      fontSize: 11,
      fontWeight: "500",
      flex: 1,
      lineHeight: 15,
    },
    dropdownToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 46,
      backgroundColor: colors.bg.card,
    },
    dropdownToggleText: {
      fontSize: 15,
      color: colors.text.primary,
    },
    dropdownList: {
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      borderRadius: 10,
      marginTop: 4,
      overflow: "hidden",
    },
    dropdownItem: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    dropdownItemText: {
      fontSize: 14,
      color: colors.text.primary,
    },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      height: 38,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 4,
      overflow: "hidden",
    },
    completeBtn: {
      backgroundColor: colors.accent.success,
    },
    cancelBtn: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    editBtn: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: "#3B82F6",
    },
    deleteBtn: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.accent.danger,
    },
    actionBtnText: {
      color: colors.bg.card,
      fontSize: 12,
      fontWeight: "600",
      flexShrink: 1,
    },

    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
      padding: 16,
    },
    modalContent: {
      backgroundColor: colors.bg.card,
      borderRadius: 20,
      width: "100%",
      maxHeight: "90%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 15,
      elevation: 10,
      overflow: "hidden",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
    },
    closeBtn: {
      padding: 4,
    },
    modalBody: {
      padding: 20,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    label: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
      marginBottom: 6,
      marginTop: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 10,
      height: 42,
      paddingHorizontal: 12,
      color: colors.text.primary,
      fontSize: 14,
      backgroundColor: colors.bg.primary,
      marginBottom: 10,
    },
    flexRow: {
      flexDirection: "row",
      gap: 12,
    },
    pickerWrapper: {
      marginBottom: 14,
    },
    itemsScroll: {
      flexDirection: "row",
      marginVertical: 8,
    },
    itemsRow: {
      flexDirection: "row",
      gap: 8,
    },
    itemCard: {
      padding: 10,
      borderRadius: 10,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      minWidth: 110,
      alignItems: "center",
    },
    itemCardActive: {
      backgroundColor: "#6C5CE720",
      borderColor: "#3b82f6",
    },
    itemCardName: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
      textAlign: "center",
    },
    itemCardNameActive: {
      color: "#3b82f6",
    },
    itemCardStock: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 2,
    },
    itemCardPrice: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
      marginTop: 4,
    },
    addButton: {
      backgroundColor: "#3b82f6",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      padding: 10,
      borderRadius: 8,
      gap: 6,
      marginVertical: 12,
    },
    addButtonText: {
      color: colors.bg.card,
      fontSize: 12,
      fontWeight: "600",
    },
    addedItemsContainer: {
      marginTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      paddingTop: 14,
    },
    addedItemsTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 10,
    },
    addedItemRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    addedItemRowEditing: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.bg.card,
    },
    addedItemInfo: {
      flex: 1,
    },
    addedItemName: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    addedItemSub: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    addedItemRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    addedItemTotal: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    editItemBtn: {
      padding: 4,
    },
    removeItemBtn: {
      padding: 4,
    },
    partnersScroll: {
      flexDirection: "row",
      marginVertical: 8,
    },
    partnersRow: {
      flexDirection: "row",
      gap: 8,
    },
    partnerCard: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    partnerCardActive: {
      backgroundColor: "#f5f3ff",
      borderColor: "#8b5cf6",
    },
    partnerName: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    partnerNameActive: {
      color: "#8b5cf6",
    },
    statusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginVertical: 8,
    },
    statusTogglePill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    statusTogglePillText: {
      fontSize: 10,
      fontWeight: "700",
    },
    calcContainer: {
      backgroundColor: colors.bg.primary,
      padding: 14,
      borderRadius: 12,
      marginVertical: 16,
      borderWidth: 1,
      borderColor: colors.border.medium,
      gap: 6,
    },
    calcRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    calcLabel: {
      fontSize: 12,
      color: colors.text.muted,
    },
    calcValue: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.primary,
    },
    calcLabelBold: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    calcValueBold: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.text.primary,
    },
    modalFooter: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      backgroundColor: colors.bg.card,
    },
    footerBtn: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelFooterBtn: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.medium,
    },
    saveFooterBtn: {
      backgroundColor: colors.accent.success,
    },
    cancelFooterBtnText: {
      color: colors.text.secondary,
      fontSize: 14,
      fontWeight: "600",
    },
    saveFooterBtnText: {
      color: colors.bg.card,
      fontSize: 14,
      fontWeight: "600",
    },
    dateHeaderCard: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 14,
      padding: 12,
      marginTop: 16,
      marginBottom: 8,
    },
    dateHeaderTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    dateHeaderText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    dailySummaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      padding: 10,
    },
    summaryCol: {
      alignItems: "center",
      flex: 1,
    },
    summaryColLabel: {
      fontSize: 10,
      color: colors.text.muted,
      fontWeight: "600",
      textTransform: "uppercase",
      marginBottom: 2,
    },
    summaryColVal: {
      fontSize: 13,
      fontWeight: "700",
      color: "#16a34a",
    },
    addExpenseHeaderBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accent.danger,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      gap: 4,
    },
    addExpenseHeaderBtnText: {
      color: colors.bg.card,
      fontSize: 12,
      fontWeight: "700",
    },
    formContainer: {
      flex: 1,
      backgroundColor: colors.bg.card,
    },
    formHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    formHeaderTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
    },
    formScrollView: {
      flex: 1,
    },
    formContent: {
      padding: 20,
      paddingBottom: 60,
    },
    inputGroup: {
      marginBottom: 20,
    },
    inputRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
      marginBottom: 8,
    },
    textInput: {
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 48,
      fontSize: 15,
      color: colors.text.primary,
    },
    textArea: {
      height: 80,
      paddingTop: 12,
      textAlignVertical: "top",
    },
    segmentContainer: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 16,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      borderRadius: 12,
      paddingVertical: 12,
      backgroundColor: colors.bg.card,
    },
    segmentBtnActive: {
      backgroundColor: "#059669",
      borderColor: "#059669",
    },
    segmentBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    segmentBtnTextActive: {
      color: colors.bg.card,
      fontWeight: "700",
    },
    dateSelectorBtn: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 48,
      backgroundColor: colors.bg.card,
    },
    dateSelectorText: {
      fontSize: 14,
      color: colors.text.primary,
      marginLeft: 6,
      fontWeight: "600",
    },
    readOnlyInput: {
      backgroundColor: colors.border.subtle,
      justifyContent: "center",
      borderColor: colors.border.medium,
    },
    readOnlyInputText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.accent.danger,
      paddingLeft: 14,
    },
    methodContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    methodBtn: {
      minWidth: "30%",
      flexGrow: 1,
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      backgroundColor: colors.bg.card,
    },
    methodBtnActive: {
      borderColor: "#059669",
      backgroundColor: "#e6f4ea",
    },
    methodText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    methodTextActive: {
      color: "#059669",
    },
    imageUploadContainer: {
      marginTop: 4,
    },
    imagePreviewWrapper: {
      position: "relative",
      width: "100%",
      height: 180,
      borderRadius: 12,
      overflow: "hidden",
    },
    imagePreview: {
      width: "100%",
      height: "100%",
    },
    removeImageBtn: {
      position: "absolute",
      top: 8,
      right: 8,
      backgroundColor: colors.bg.card,
      borderRadius: 12,
    },
    uploadPlaceholder: {
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      borderStyle: "dashed",
      borderRadius: 12,
      paddingVertical: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    uploadPlaceholderText: {
      color: "#059669",
      fontWeight: "700",
      fontSize: 14,
      marginTop: 6,
    },
    formFooter: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      backgroundColor: colors.bg.card,
    },
    formFooterBtn: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    formCancelBtn: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.medium,
    },
    formSubmitBtn: {
      backgroundColor: "#059669",
    },
    formCancelBtnText: {
      color: colors.text.secondary,
      fontSize: 14,
      fontWeight: "700",
    },
    formSubmitBtnText: {
      color: colors.bg.card,
      fontSize: 14,
      fontWeight: "700",
    },
    calendarCard: {
      backgroundColor: colors.bg.card,
      borderRadius: 20,
      padding: 16,
      width: "85%",
      maxWidth: 340,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 8,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    calendarHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    calendarHeaderTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
    },
    calendarWeekHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    calendarWeekName: {
      flex: 1,
      textAlign: "center",
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.muted,
    },
    calendarGrid: {
      gap: 4,
    },
    calendarWeekRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    calendarDay: {
      flex: 1,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 18,
    },
    calendarSelectedDay: {
      backgroundColor: "#059669",
    },
    calendarDayText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.primary,
    },
    calendarSelectedDayText: {
      color: colors.bg.card,
    },
    calendarEmptyDay: {
      flex: 1,
      aspectRatio: 1,
    },
    calendarCloseBtn: {
      marginTop: 16,
      alignSelf: "flex-end",
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    calendarCloseText: {
      color: colors.accent.danger,
      fontWeight: "700",
      fontSize: 14,
    },
    filterPill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
    },
    filterPillActive: {
      backgroundColor: "#6C5CE720",
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
  });
};
