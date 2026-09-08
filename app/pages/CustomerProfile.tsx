import React, { useContext, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  TextInput,
  Alert,
  Switch,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { CustomerContext } from "../context/CustomerContext";
import { ItemContext } from "../context/ItemContext";
import { OrderContext } from "../context/OrderContext";
import { PaymentContext } from "../context/PaymentContext";
import { CollectorContext } from "../context/CollectorContext";
import { DeliveryPartnerContext } from "../context/DeliveryPartnerContext";
import { WorkerContext } from "../context/WorkerContext";
import { RawMaterialSupplierContext } from "../context/RawMaterialSupplierContext";
import AnimatedPage from "../components/AnimatedPage";
import BackButton from "../components/BackButton";
import EasyCalendarModal from "../components/EasyCalendarModal";
import { LedgerItemCard } from "../components/LedgerItemCard";
import { useTheme } from "../context/ThemeContext";
import { UserContext } from "../context/UserContext";
import { TransactionShareBottomSheet } from "../../src/components/sharing/TransactionShareBottomSheet";
import { CustomerShareBottomSheet } from "../../src/components/sharing/CustomerShareBottomSheet";
import { adaptToTransactionData } from "../../src/utils/transactionAdapter";
import { TransactionData, CustomerShareData } from "../../src/types/sharing";
import { PRESET_MARKINGS, getMarkingConfig, normalizeMarkings, useCustomMarkings } from "../../src/utils/markingUtils";

const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Online", "Wallet", "Other"];

export default function CustomerProfile() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const { customers, updateCustomerDueDates, updateCustomerDueAlerts, updateCustomerCollector, toggleFavoriteCustomer, updateCustomerDetails } = useContext(CustomerContext) as any;
  const { collectors } = useContext(CollectorContext) as any;
  const { partners } = useContext(DeliveryPartnerContext) as any;

  const sortedDeliveryPartners = useMemo(() => {
    return [...(partners || [])].sort((a: any, b: any) => {
      const aFav = !!a.isFavorite;
      const bFav = !!b.isFavorite;
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [partners]);
  const { workers } = useContext(WorkerContext) as any;
  const { suppliers } = useContext(RawMaterialSupplierContext) as any;
  const { orders, editOrder, deleteOrder } = useContext(OrderContext) as any;
  const { payments, addPayment, editPayment, deletePayment } = useContext(PaymentContext) as any;
  const { items } = useContext(ItemContext) as any;
  const { profile: userProfile } = useContext(UserContext) as any;

  const companyInfo = useMemo(() => {
    return {
      name: userProfile?.company?.name || userProfile?.businessName || userProfile?.fullName || 'Company Name',
      phone: userProfile?.company?.phone || userProfile?.mobile || '',
      email: userProfile?.company?.email || userProfile?.email || '',
      address: userProfile?.company?.address || userProfile?.address || '',
      gstin: userProfile?.company?.gstin || userProfile?.taxId || userProfile?.gstNo || '',
      logoUrl: userProfile?.company?.logoUrl || userProfile?.photoURL || userProfile?.logoUrl || '',
      signatureUrl: userProfile?.company?.signatureUrl || userProfile?.signatureUrl || '',
      bankName: userProfile?.company?.bankName || userProfile?.bankName || '',
      accountNo: userProfile?.company?.accountNo || userProfile?.accountNo || '',
      ifscCode: userProfile?.company?.ifscCode || userProfile?.ifscCode || '',
      upiId: userProfile?.company?.upiId || userProfile?.upiId || '',
      ...userProfile?.company,
    };
  }, [userProfile]);

  const [shareBottomSheetVisible, setShareBottomSheetVisible] = useState(false);
  const [sharingTransactionData, setSharingTransactionData] = useState<TransactionData | null>(null);
  const [customerShareModalVisible, setCustomerShareModalVisible] = useState(false);

  const { allPresets: allMarkingPresets, addCustomMarking, removeCustomMarking } = useCustomMarkings(customers);

  // Find active customer profile
  const customer = useMemo(() => {
    const foundCust = (customers || []).find((c: any) => c.id === id);
    if (foundCust) {
      return {
        ...foundCust,
        profileMarkings: normalizeMarkings(foundCust),
      };
    }

    const foundWorker = (workers || []).find((w: any) => w.id === id);
    if (foundWorker) {
      const pendingWages = foundWorker.totalPending !== undefined
        ? Number(foundWorker.totalPending)
        : (Number(foundWorker.totalWages || 0) - Number(foundWorker.totalPaid || 0));
      const customerBalanceDue = pendingWages < 0 ? Math.abs(pendingWages) : 0;

      return {
        id: foundWorker.id,
        name: foundWorker.name,
        phone: foundWorker.phone || foundWorker.mobile || foundWorker.contactNumber || foundWorker.phoneNumber || "",
        address: foundWorker.address || foundWorker.role || "Worker",
        balance: customerBalanceDue,
        totalPending: customerBalanceDue,
        entityType: "worker",
        badgeText: "Worker",
        pendingWages,
        isFavorite: !!foundWorker.isFavorite,
        isSpecial: !!foundWorker.isSpecial,
        dueDates: foundWorker.dueDates || [],
        collectorId: foundWorker.collectorId || null,
        collectorName: foundWorker.collectorName || null,
        notes: foundWorker.notes || "",
        profileMarkings: normalizeMarkings(foundWorker),
      };
    }

    const foundSupplier = (suppliers || []).find((s: any) => s.id === id);
    if (foundSupplier) {
      const suppBal = Number(foundSupplier.balance || 0);
      const customerBalanceDue = suppBal < 0 ? Math.abs(suppBal) : 0;
      return {
        id: foundSupplier.id,
        name: foundSupplier.name || foundSupplier.supplierName,
        phone: foundSupplier.phone || foundSupplier.contactNumber || foundSupplier.mobile || foundSupplier.phoneNumber || "",
        address: foundSupplier.address || "Supplier",
        balance: customerBalanceDue,
        totalPending: customerBalanceDue,
        entityType: "supplier",
        badgeText: "Supplier",
        supplierBalance: suppBal,
        isFavorite: !!foundSupplier.isFavorite,
        isSpecial: !!foundSupplier.isSpecial,
        dueDates: foundSupplier.dueDates || [],
        collectorId: foundSupplier.collectorId || null,
        collectorName: foundSupplier.collectorName || null,
        notes: foundSupplier.notes || "",
        profileMarkings: normalizeMarkings(foundSupplier),
      };
    }

    const foundPartner = (partners || []).find((p: any) => p.id === id);
    if (foundPartner) {
      const partBal = foundPartner.totalPending !== undefined
        ? Number(foundPartner.totalPending)
        : (Number(foundPartner.totalPayable || 0) - Number(foundPartner.totalPaid || 0));
      const customerBalanceDue = partBal < 0 ? Math.abs(partBal) : 0;
      return {
        id: foundPartner.id,
        name: foundPartner.name,
        phone: foundPartner.phone || foundPartner.mobile || foundPartner.contactNumber || foundPartner.phoneNumber || "",
        address: foundPartner.vehicleNumber || "Delivery Partner",
        balance: customerBalanceDue,
        totalPending: customerBalanceDue,
        entityType: "delivery_partner",
        badgeText: "Delivery Partner",
        partnerBalance: partBal,
        isFavorite: !!foundPartner.isFavorite,
        isSpecial: !!foundPartner.isSpecial,
        dueDates: foundPartner.dueDates || [],
        collectorId: foundPartner.collectorId || null,
        collectorName: foundPartner.collectorName || null,
        notes: foundPartner.notes || "",
        profileMarkings: normalizeMarkings(foundPartner),
      };
    }

    return null;
  }, [customers, workers, suppliers, partners, id]);

  const handleOpenShareModal = useCallback((item: any, type: 'order' | 'invoice' | 'expense' | 'payment' = 'order') => {
    let itemToShare = { ...item };
    if (customer) {
      const allCustomerPhones = customer.phoneNumbers && customer.phoneNumbers.length > 0
        ? customer.phoneNumbers
        : (customer.phone ? [customer.phone] : []);
      if (!itemToShare.customerPhoneNumbers || itemToShare.customerPhoneNumbers.length === 0) {
        itemToShare.customerPhoneNumbers = allCustomerPhones;
      }
      if (!itemToShare.customerPhone && customer.phone) {
        itemToShare.customerPhone = customer.phone;
      }
      if (!itemToShare.customerAddress && customer.address) {
        itemToShare.customerAddress = customer.address;
      }
      if (!itemToShare.customerGst && (customer.gstin || customer.gstNo)) {
        itemToShare.customerGst = customer.gstin || customer.gstNo;
      }
    }
    if ((type === 'order' || type === 'invoice') && itemToShare) {
      if (itemToShare.previousBalance === undefined && customer) {
        const customerCurrentPending = customer.totalPending !== undefined ? Number(customer.totalPending) : Number(customer.balance || 0);
        const thisOrderUnpaid = Number(itemToShare.balanceDue || 0);
        itemToShare.previousBalance = Math.max(0, customerCurrentPending - thisOrderUnpaid);
      }
    }
    const transaction = adaptToTransactionData(itemToShare, type, userProfile);
    setSharingTransactionData(transaction);
    setShareBottomSheetVisible(true);
  }, [userProfile, customer]);

  // Filter orders and payments for this specific customer entity
  const customerOrders = useMemo(() => (orders || []).filter((o: any) => 
    o.customerId === id || 
    o.customerId === `worker_${id}` || 
    o.customerId === `sup_${id}` || 
    o.customerId === `supplier_${id}` || 
    o.customerId === `partner_${id}`
  ), [orders, id]);

  const customerPayments = useMemo(() => (payments || []).filter((p: any) => 
    p.customerId === id || 
    p.customerId === `worker_${id}` || 
    p.customerId === `sup_${id}` || 
    p.customerId === `supplier_${id}` || 
    p.customerId === `partner_${id}`
  ), [payments, id]);

  const totalSpent = useMemo(
    () => customerOrders.reduce((sum: number, o: any) => o.status === "cancelled" ? sum : sum + (o.total || 0), 0),
    [customerOrders]
  );

  // Compute consolidated chronological ledger entries
  const ledgerEntries = React.useMemo(() => {
    const entries: any[] = [];

    // Create Map for O(1) partner lookup
    const partnerMap = new Map((partners || []).map((p: any) => [p.id, p.name]));

    customerOrders.forEach((order: any) => {
      const isCancelled = order.status === "cancelled";
      const orderDateObj = order.orderedDate
        ? (order.orderedDate instanceof Date ? order.orderedDate : new Date(order.orderedDate))
        : (order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt));
      let deliveryDateObj = null;
      if (order.deliveryDate) {
        deliveryDateObj = order.deliveryDate instanceof Date ? order.deliveryDate : new Date(order.deliveryDate);
      } else if (order.status === "completed") {
        const upDate = order.updatedAt || order.createdAt;
        deliveryDateObj = upDate instanceof Date ? upDate : (upDate?.toDate ? upDate.toDate() : new Date(upDate));
      }

      // Look up delivery partner name in O(1) time
      const deliveryPartnerName = order.deliveryPartnerId ? (partnerMap.get(order.deliveryPartnerId) || null) : null;

      // Construct detailed description for multiple items if present
      let itemDescription = "";
      if (order.items && order.items.length > 0) {
        itemDescription = order.items.map((itm: any) => `${itm.itemName} (${itm.quantity} qty)`).join(", ");
      } else {
        itemDescription = order.itemName ? `${order.itemName} (${order.quantity} qty)` : "Invoice Created";
      }

      // 1. Original Order entry
      const isCompleted = order.status === "completed";
      entries.push({
        id: order.id,
        date: orderDateObj,
        orderDate: orderDateObj,
        deliveryDate: deliveryDateObj,
        type: "order",
        description: isCancelled ? `[CANCELLED] ${itemDescription}` : itemDescription,
        orderAmount: order.total || 0,
        paymentReceived: order.paidAmount || 0,
        balanceChange: isCompleted ? (order.balanceDue || 0) : 0,
        deliveryPartnerName,
        original: order,
        isCancelled,
      });

      // 2. Cancellation Reversal entry if order was cancelled AND it had completed status
      const wasCompletedBeforeCancel = !!order.completedAt || order.deliveredQuantity > 0;
      if (isCancelled && wasCompletedBeforeCancel) {
        const cancelDateObj = order.updatedAt
          ? (order.updatedAt instanceof Date ? order.updatedAt : (order.updatedAt?.toDate ? order.updatedAt.toDate() : new Date(order.updatedAt)))
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
          balanceChange: -(order.balanceDue || 0),
          deliveryPartnerName: null,
          original: order,
          isCancelled: true,
        });
      }
    });

    customerPayments.forEach((payment: any) => {
      const isOrderPayment = !!payment.orderId || (payment.notes && (
        payment.notes.toLowerCase().includes("order payment") ||
        payment.notes.toLowerCase().includes("payment for order") ||
        payment.notes.toLowerCase().includes("order #")
      ));
      if (isOrderPayment) return;

      const payDate = payment.createdAt instanceof Date ? payment.createdAt : new Date(payment.createdAt);
      const amtRec = Number(payment.amountReceived !== undefined ? payment.amountReceived : (payment.amount || 0));
      const discAmt = Number(payment.discountAmount || 0);
      const totalBalanceReduction = amtRec + discAmt;

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
        orderAmount: 0,
        paymentReceived: amtRec,
        discountAmount: discAmt,
        balanceChange: -totalBalanceReduction,
        original: payment,
      });
    });

    // Sort by date ascending to compute running balance and show chronological flow (Oldest -> Newest)
    entries.sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();
      if (diff !== 0) return diff;
      if (a.type === "order" && b.type === "payment") return -1;
      if (a.type === "payment" && b.type === "order") return 1;
      return 0;
    });

    // Calculate opening balance
    const sumChanges = entries.reduce((sum: number, entry: any) => sum + (entry.balanceChange || 0), 0);
    const customerPending = Number(customer.totalPending !== undefined ? customer.totalPending : (customer.balance || 0));
    const openingBalance = Math.max(0, customerPending - sumChanges);

    let runningBalance = openingBalance;
    const ledger = entries.map((entry) => {
      runningBalance += entry.balanceChange;
      return {
        ...entry,
        runningBalance,
      };
    });

    // If opening balance exists, keep it at the top
    if (openingBalance > 0) {
      const openingDate = customer.createdAt ? new Date(customer.createdAt) : new Date(new Date().getTime() - 365*24*60*60*1000);
      ledger.unshift({
        id: "opening-bal",
        date: openingDate,
        orderDate: openingDate,
        deliveryDate: null,
        type: "opening",
        description: "Opening Balance",
        orderAmount: openingBalance,
        paymentReceived: 0,
        runningBalance: openingBalance,
      });
    }

    return ledger;
  }, [customerOrders, customerPayments, customer, partners]);

  // Compute daily rollup summaries for Customer Transaction Ledger (First Orders & Last Amount per day)
  const dailyLedgerSummary = React.useMemo(() => {
    if (!ledgerEntries || ledgerEntries.length === 0) return [];

    const dayMap = new Map<string, {
      dateKey: string;
      dateObj: Date;
      formattedDate: string;
      firstOrders: number;      // Total order amount for the day
      orderCount: number;       // Number of orders on that day
      firstOrderAmount: number; // Amount of the very first order of the day
      totalPayments: number;   // Total payment received on that day
      dayOpeningBalance: number; // Balance before the first entry of the day
      lastAmount: number;       // Closing running balance at end of the day
      entries: any[];
    }>();

    ledgerEntries.forEach((entry: any) => {
      if (!entry.date) return;
      const d = entry.date instanceof Date ? entry.date : new Date(entry.date);
      if (isNaN(d.getTime())) return;

      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const formattedDate = d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

      if (!dayMap.has(dateKey)) {
        const prevBal = (entry.type === "opening") ? entry.runningBalance : (entry.runningBalance - (entry.balanceChange || 0));
        dayMap.set(dateKey, {
          dateKey,
          dateObj: d,
          formattedDate,
          firstOrders: 0,
          orderCount: 0,
          firstOrderAmount: 0,
          totalPayments: 0,
          dayOpeningBalance: prevBal,
          lastAmount: entry.runningBalance,
          entries: [],
        });
      }

      const dayGroup = dayMap.get(dateKey)!;
      dayGroup.entries.push(entry);
      dayGroup.lastAmount = entry.runningBalance;

      if (entry.type === "order" && !entry.isCancelled) {
        if (dayGroup.orderCount === 0) {
          dayGroup.firstOrderAmount = entry.orderAmount || 0;
        }
        dayGroup.firstOrders += (entry.orderAmount || 0);
        dayGroup.orderCount += 1;
        dayGroup.totalPayments += (entry.paymentReceived || 0);
      } else if (entry.type === "payment") {
        dayGroup.totalPayments += (entry.paymentReceived || 0);
      }
    });

    return Array.from(dayMap.values());
  }, [ledgerEntries]);


  const customerShareData: CustomerShareData | null = useMemo(() => {
    if (!customer) return null;
    const currentPending = customer.totalPending !== undefined ? Number(customer.totalPending) : Number(customer.balance || 0);
    const oldBalance = Number(customer.openingBalance || customer.previousBalance || 0);
    const totalPaid = (ledgerEntries || []).reduce((sum: number, l: any) => sum + (l.paymentReceived || 0), 0);

    return {
      customer: {
        id: customer.id,
        name: customer.name || 'Customer',
        phone: customer.phone || '',
        phoneNumbers: customer.phoneNumbers && customer.phoneNumbers.length > 0 ? customer.phoneNumbers : (customer.phone ? [customer.phone] : []),
        address: customer.address || customer.city || '',
        gstin: customer.gstin || customer.gstNo || '',
        email: customer.email || '',
        isSpecial: !!customer.isSpecial,
        openingBalance: oldBalance,
        totalBalance: currentPending,
      },
      dueDates: (customer.dueDates || []).map((d: any) => ({
        id: d.id || String(Math.random()),
        date: d.date || '',
        notes: d.notes || '',
        status: d.status || 'Pending',
      })),
      summary: {
        totalOrdersCount: customerOrders.length,
        totalSalesAmount: totalSpent,
        totalPaidAmount: totalPaid,
        oldBalanceDue: oldBalance,
        netBalanceDue: currentPending,
      },
      ledger: (ledgerEntries || []).map((l: any) => {
        const orig = l.original || {};
        const rawItems = orig.items && Array.isArray(orig.items) && orig.items.length > 0
          ? orig.items.map((i: any) => ({
              name: i.itemName || i.name || 'Item',
              quantity: Number(i.quantity || 1),
              rate: Number(i.unitPrice || i.rate || i.price || 0),
              unit: i.unit || 'pcs',
              total: Number(i.totalPrice || i.total || ((i.quantity || 1) * (i.unitPrice || i.rate || i.price || 0))),
            }))
          : undefined;

        const rawPaid = Number(l.paymentReceived || (l.type === 'payment' ? (l.amount || l.paid) : l.paid) || 0);
        const rawAmount = Number(l.orderAmount || (l.type === 'order' ? l.amount : 0) || 0);

        return {
          id: l.id || String(Math.random()),
          date: l.date || l.orderDate,
          type: l.type === 'payment' ? 'payment' : l.type === 'opening' ? 'opening' : 'order',
          description: l.description || (l.type === 'payment' ? 'Payment Received' : `Order #${l.id?.slice(0, 8)}`),
          notes: l.notes || orig.notes || orig.note || orig.remarks || orig.paymentNotes || orig.paymentNote || '',
          amount: rawAmount,
          paid: rawPaid,
          balance: Number(l.runningBalance || 0),
          items: rawItems,
          rate: Number(orig.unitPrice || orig.rate || orig.price || (rawItems && rawItems[0]?.rate) || 0),
          quantity: Number(orig.quantity || (rawItems && rawItems[0]?.quantity) || 0),
          unit: orig.unit || (rawItems && rawItems[0]?.unit) || '',
          shipmentCharge: Number(orig.shipmentCharge || 0),
          loadingCharge: Number(orig.loadingCharge || 0),
          unloadingCharge: Number(orig.unloadingCharge || 0),
          extraAmount: Number(orig.extraAmount || 0),
          extraAmountDescription: orig.extraAmountDescription || 'Extra Charge',
          taxAmount: Number(orig.taxAmount || 0),
          discountAmount: Number(orig.discountAmount || 0),
        };
      }),
    };
  }, [customer, customerOrders, customerPayments, ledgerEntries, totalSpent]);

  // Filtering States for Item Totals & Ledger
  const [dateFilter, setDateFilter] = useState<"all" | "this_month" | "last_30" | "this_year" | "custom">("all");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [isSelectingStartDate, setIsSelectingStartDate] = useState(false);
  const [isSelectingEndDate, setIsSelectingEndDate] = useState(false);

  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<"all" | "order" | "payment">("all");
  const [ledgerSortOrder, setLedgerSortOrder] = useState<"asc" | "desc">("desc");
  const [ledgerViewMode, setLedgerViewMode] = useState<"all" | "daily">("all");


  const checkDateFilter = React.useCallback(
    (dateObj: Date) => {
      if (!dateObj || isNaN(dateObj.getTime())) return true;
      if (dateFilter === "all") return true;

      const now = new Date();
      if (dateFilter === "this_month") {
        return (
          dateObj.getFullYear() === now.getFullYear() &&
          dateObj.getMonth() === now.getMonth()
        );
      }
      if (dateFilter === "last_30") {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        return dateObj.getTime() >= thirtyDaysAgo.getTime();
      }
      if (dateFilter === "this_year") {
        return dateObj.getFullYear() === now.getFullYear();
      }
      if (dateFilter === "custom") {
        if (startDate) {
          const s = new Date(startDate);
          s.setHours(0, 0, 0, 0);
          if (dateObj.getTime() < s.getTime()) return false;
        }
        if (endDate) {
          const e = new Date(endDate);
          e.setHours(23, 59, 59, 999);
          if (dateObj.getTime() > e.getTime()) return false;
        }
        return true;
      }
      return true;
    },
    [dateFilter, startDate, endDate]
  );

  const filteredCustomerOrders = React.useMemo(() => {
    return customerOrders.filter((order: any) => {
      const orderDateObj = order.orderedDate
        ? (order.orderedDate instanceof Date ? order.orderedDate : new Date(order.orderedDate))
        : (order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt));
      return checkDateFilter(orderDateObj);
    });
  }, [customerOrders, checkDateFilter]);

  // Item Wise Totals calculation
  const itemWiseTotals = React.useMemo(() => {
    const itemMap: {
      [key: string]: {
        itemId: string;
        itemName: string;
        totalQuantity: number;
        totalAmount: number;
        rateType?: string;
      };
    } = {};

    filteredCustomerOrders.forEach((order: any) => {
      if (order.status === "cancelled") return;

      const itemList =
        order.items && order.items.length > 0
          ? order.items
          : order.itemId || order.itemName
          ? [
              {
                itemId: order.itemId || order.itemName,
                itemName: order.itemName || "Unnamed Item",
                quantity: Number(order.quantity || 0),
                rate: Number(order.rate || 0),
                rateType: order.rateType || "",
                grossTotal: Number(
                  order.grossTotal !== undefined
                    ? order.grossTotal
                    : Number(order.quantity || 0) * Number(order.rate || 0)
                ),
              },
            ]
          : [];

      itemList.forEach((itm: any) => {
        const name = itm.itemName || "Unnamed Item";
        const key = itm.itemId || name;
        const qty = Number(itm.quantity || 0);
        const gross = Number(
          itm.grossTotal !== undefined
            ? itm.grossTotal
            : qty * Number(itm.rate || 0)
        );

        if (
          itemSearchQuery.trim() &&
          !name.toLowerCase().includes(itemSearchQuery.trim().toLowerCase())
        ) {
          return;
        }

        if (!itemMap[key]) {
          itemMap[key] = {
            itemId: key,
            itemName: name,
            totalQuantity: 0,
            totalAmount: 0,
            rateType: itm.rateType || "",
          };
        }

        itemMap[key].totalQuantity += qty;
        itemMap[key].totalAmount += gross;
      });
    });

    return Object.values(itemMap).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredCustomerOrders, itemSearchQuery]);

  const itemWiseOverall = React.useMemo(() => {
    const totalQty = itemWiseTotals.reduce((sum, i) => sum + i.totalQuantity, 0);
    const totalAmt = itemWiseTotals.reduce((sum, i) => sum + i.totalAmount, 0);
    return { totalQty, totalAmt };
  }, [itemWiseTotals]);

  const displayLedgerEntries = React.useMemo(() => {
    let result = ledgerEntries.filter((entry: any) => {
      if (entry.type === "opening") return dateFilter === "all";
      return checkDateFilter(entry.date);
    });

    if (ledgerTypeFilter !== "all") {
      result = result.filter((entry: any) => {
        if (entry.type === "opening") return true;
        if (ledgerTypeFilter === "order") return entry.type === "order" || entry.type === "cancellation";
        if (ledgerTypeFilter === "payment") return entry.type === "payment";
        return true;
      });
    }

    if (ledgerSortOrder === "desc") {
      return [...result].reverse();
    }

    return result;
  }, [ledgerEntries, checkDateFilter, dateFilter, ledgerTypeFilter, ledgerSortOrder]);

  const displayDailySummary = React.useMemo(() => {
    let result = dailyLedgerSummary.filter((day: any) => {
      return checkDateFilter(day.dateObj);
    });

    if (ledgerSortOrder === "desc") {
      return [...result].reverse();
    }
    return result;
  }, [dailyLedgerSummary, checkDateFilter, ledgerSortOrder]);

  const dailyMetricsOverall = React.useMemo(() => {
    const totalDays = displayDailySummary.length;
    const totalFirstOrders = displayDailySummary.reduce((sum, d) => sum + d.firstOrders, 0);
    const totalPaymentsRec = displayDailySummary.reduce((sum, d) => sum + d.totalPayments, 0);
    const latestLastAmount = displayDailySummary.length > 0
      ? (ledgerSortOrder === "desc" ? displayDailySummary[0].lastAmount : displayDailySummary[displayDailySummary.length - 1].lastAmount)
      : (customer?.totalPending !== undefined ? Number(customer.totalPending) : Number(customer?.balance || 0));

    return {
      totalDays,
      totalFirstOrders,
      totalPaymentsRec,
      latestLastAmount,
    };
  }, [displayDailySummary, ledgerSortOrder, customer]);


  // Calculate last due date (upcoming pending, or latest completed)
  const lastDueDate = React.useMemo(() => {
    if (!customer?.dueDates || customer.dueDates.length === 0) return null;
    const pendingList = customer.dueDates.filter((d: any) => d.status !== "Completed" && d.status !== "Cancelled");
    if (pendingList.length > 0) {
      pendingList.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return pendingList[0];
    }
    const completedList = customer.dueDates.filter((d: any) => d.status === "Completed");
    if (completedList.length > 0) {
      completedList.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return completedList[0];
    }
    return null;
  }, [customer]);

  // Due Dates Management States & Methods
  const [showAddForm, setShowAddForm] = useState(false);
  const [dueDateStr, setDueDateStr] = useState("");
  const [dueNotes, setDueNotes] = useState("");
  const [savingDueDate, setSavingDueDate] = useState(false);

  // Collector Change States
  const [isCollectorModalOpen, setIsCollectorModalOpen] = useState(false);
  const [updatingCollector, setUpdatingCollector] = useState(false);

  // Editing Ledger states
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [isEditLedgerOpen, setIsEditLedgerOpen] = useState(false);
  const [editLedgerDate, setEditLedgerDate] = useState<Date>(new Date());
  const [isLedgerCalendarOpen, setIsLedgerCalendarOpen] = useState(false);
  const [savingEditLedger, setSavingEditLedger] = useState(false);

  // Marking Profile states
  const [isMarkingModalOpen, setIsMarkingModalOpen] = useState(false);
  const [selectedMarkings, setSelectedMarkings] = useState<string[]>([]);
  const [customMarkingInput, setCustomMarkingInput] = useState("");
  const [isSavingMarkings, setIsSavingMarkings] = useState(false);

  // Editing Profile states
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editProfileName, setEditProfileName] = useState("");
  const [editProfilePhoneNumbers, setEditProfilePhoneNumbers] = useState<string[]>([]);
  const [editProfileAddress, setEditProfileAddress] = useState("");
  const [editProfileNotes, setEditProfileNotes] = useState("");
  const [editProfileOpeningBalance, setEditProfileOpeningBalance] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editProfileIsSpecial, setEditProfileIsSpecial] = useState(false);
  const [editProfileMarkings, setEditProfileMarkings] = useState<string[]>([]);
  const [editProfileCustomMarking, setEditProfileCustomMarking] = useState("");

  const handleOpenMarkingModal = () => {
    if (!customer) return;
    setSelectedMarkings(normalizeMarkings(customer));
    setCustomMarkingInput("");
    setIsMarkingModalOpen(true);
  };

  const handleToggleMarking = (tag: string) => {
    setSelectedMarkings((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === tag.toLowerCase());
      if (exists) {
        return prev.filter((t) => t.toLowerCase() !== tag.toLowerCase());
      } else {
        return [...prev, tag];
      }
    });
  };

  const handleAddCustomMarking = async () => {
    const trimmed = customMarkingInput.trim();
    if (!trimmed) return;
    await addCustomMarking(trimmed);
    setSelectedMarkings((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === trimmed.toLowerCase());
      if (exists) return prev;
      return [...prev, trimmed];
    });
    setCustomMarkingInput("");
  };

  const handleSaveMarkings = async () => {
    if (!customer) return;
    setIsSavingMarkings(true);
    try {
      const success = await updateCustomerDetails(customer.id, {
        profileMarkings: selectedMarkings,
        markingProfile: selectedMarkings[0] || "",
      });
      if (success) {
        setIsMarkingModalOpen(false);
      } else {
        Alert.alert("Error", "Failed to update customer markings.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not save markings.");
    } finally {
      setIsSavingMarkings(false);
    }
  };

  const handleOpenEditProfile = () => {
    if (!customer) return;
    setEditProfileName(customer.name || "");
    setEditProfileAddress(customer.address || "");
    setEditProfileNotes(customer.notes || "");
    setEditProfileIsSpecial(!!customer.isSpecial);
    setEditProfileMarkings(normalizeMarkings(customer));
    setEditProfileCustomMarking("");

    const existingNumbers = customer.phoneNumbers && customer.phoneNumbers.length > 0 
      ? [...customer.phoneNumbers] 
      : (customer.phone ? [customer.phone] : [""]);
    setEditProfilePhoneNumbers(existingNumbers);

    const sumChanges = customerOrders.reduce((sum: number, o: any) => sum + (o.status === "completed" ? (o.balanceDue || 0) : 0), 0) - 
                       customerPayments.reduce((sum: number, p: any) => sum + (p.amountReceived || p.amount || 0), 0);
    const customerPending = Number(customer.totalPending !== undefined ? customer.totalPending : (customer.balance || 0));
    const openingBalance = Math.max(0, customerPending - sumChanges);
    setEditProfileOpeningBalance(String(openingBalance));

    setIsEditProfileOpen(true);
  };

  const handleSaveEditProfile = async () => {
    if (!editProfileName.trim()) {
      Alert.alert("Required", "Client name is required.");
      return;
    }
    const newOpeningBal = parseFloat(editProfileOpeningBalance) || 0;
    if (isNaN(newOpeningBal) || newOpeningBal < 0) {
      Alert.alert("Invalid Balance", "Opening balance must be zero or a positive number.");
      return;
    }
    setIsSavingProfile(true);
    try {
      const sumChanges = customerOrders.reduce((sum: number, o: any) => sum + (o.status === "completed" ? (o.balanceDue || 0) : 0), 0) - 
                         customerPayments.reduce((sum: number, p: any) => sum + (p.amountReceived || p.amount || 0), 0);
      const newPendingBalance = newOpeningBal + sumChanges;

      const cleanedPhones = editProfilePhoneNumbers.map(p => p.trim()).filter(Boolean);
      const primaryPhone = cleanedPhones[0] || "";

      const success = await updateCustomerDetails(customer.id, {
        name: editProfileName.trim(),
        phone: primaryPhone,
        phoneNumbers: cleanedPhones,
        address: editProfileAddress.trim(),
        notes: editProfileNotes.trim(),
        balance: newPendingBalance,
        totalPending: newPendingBalance,
        isSpecial: editProfileIsSpecial,
        profileMarkings: editProfileMarkings,
        markingProfile: editProfileMarkings[0] || "",
      });
      if (success) {
        setIsEditProfileOpen(false);
        Alert.alert("Success", "Profile updated successfully.");
      } else {
        Alert.alert("Error", "Failed to update client profile.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Edit items state variables
  const [editOrderItems, setEditOrderItems] = useState<any[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedItemQty, setSelectedItemQty] = useState("1");
  const [selectedItemRate, setSelectedItemRate] = useState("0");

  const handleSelectItemForEdit = (itemId: string) => {
    const item = items.find((i: any) => i.id === itemId);
    if (item) {
      setSelectedItemId(itemId);
      
      let selectedRate = item.sellingRate || item.sellingPrice || 0;
      if (customer && customer.isSpecial && item.specialRates && item.specialRates[customer.id] !== undefined) {
        selectedRate = item.specialRates[customer.id];
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

    const itemObj = items.find((i: any) => i.id === selectedItemId);
    if (!itemObj) return;

    const existingIdx = editOrderItems.findIndex(
      (itm) => itm.itemId === selectedItemId && itm.rate === rate,
    );
    if (existingIdx > -1) {
      const updated = [...editOrderItems];
      updated[existingIdx].quantity += qty;
      updated[existingIdx].grossTotal = updated[existingIdx].quantity * rate;
      setEditOrderItems(updated);
    } else {
      setEditOrderItems([
        ...editOrderItems,
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

    // Reset add item inputs
    setSelectedItemId("");
    setSelectedItemQty("1");
    setSelectedItemRate("0");
  };

  const handleRemoveItemFromEdit = (index: number) => {
    const updated = [...editOrderItems];
    updated.splice(index, 1);
    setEditOrderItems(updated);
  };

  // Specific edit states (Payment)
  const [editPaymentAmt, setEditPaymentAmt] = useState("");
  const [editPaymentDiscount, setEditPaymentDiscount] = useState("0");
  const [editPaymentMethod, setEditPaymentMethod] = useState("Cash");
  const [editPaymentNotes, setEditPaymentNotes] = useState("");

  // Receive Payment & Balance Discount Modal states
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDiscount, setPayDiscount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState<Date>(new Date());
  const [isPayCalendarOpen, setIsPayCalendarOpen] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  const openPayModal = () => {
    if (!customer) return;
    const pending = Number(customer.totalPending !== undefined ? customer.totalPending : customer.balance || 0);
    setPayAmount(pending > 0 ? String(pending) : "");
    setPayDiscount("");
    setPayMethod("Cash");
    setPayNotes("");
    setPayDate(new Date());
    setIsPayModalOpen(true);
  };

  const handleSavePayment = async () => {
    if (!customer || isSavingPayment) return;
    const amt = parseFloat(payAmount) || 0;
    const disc = parseFloat(payDiscount) || 0;

    if (amt <= 0 && disc <= 0) {
      Alert.alert("Invalid Entry", "Please enter a payment amount or a balance discount amount.");
      return;
    }

    if (amt < 0 || disc < 0) {
      Alert.alert("Invalid Entry", "Amounts cannot be negative.");
      return;
    }

    const pending = Number(customer.totalPending !== undefined ? customer.totalPending : customer.balance || 0);
    if ((amt + disc) > pending && pending > 0) {
      Alert.alert(
        "Excessive Amount",
        `Total payment + discount (₹${(amt + disc).toLocaleString("en-IN")}) exceeds pending balance of ₹${pending.toLocaleString("en-IN")}.`
      );
      return;
    }

    const now = new Date();
    const savePayDate = new Date(payDate);
    const isSaveDateOnly = (d: Date) => {
      if (!d || isNaN(d.getTime())) return true;
      const isLocalMidnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
      const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
      const isIstUtcMidnight = d.getHours() === 5 && d.getMinutes() === 30 && d.getSeconds() === 0;
      return isLocalMidnight || isUtcMidnight || isIstUtcMidnight;
    };
    if (
      savePayDate.getFullYear() === now.getFullYear() &&
      savePayDate.getMonth() === now.getMonth() &&
      savePayDate.getDate() === now.getDate()
    ) {
      savePayDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    } else if (isSaveDateOnly(savePayDate)) {
      savePayDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    }

    setIsSavingPayment(true);
    const result = await addPayment({
      customerId: customer.id,
      customerName: customer.name,
      amountReceived: amt,
      discountAmount: disc,
      paymentMethod: payMethod,
      notes: payNotes.trim(),
      createdAt: savePayDate,
    });
    setIsSavingPayment(false);

    if (result) {
      setIsPayModalOpen(false);
      setPayAmount("");
      setPayDiscount("");
      setPayNotes("");
      setPayDate(new Date());
      Alert.alert("Success", "Payment & balance discount logged successfully.");
    } else {
      Alert.alert("Transaction Failed", "Could not complete transaction. Please try again.");
    }
  };

  // Specific edit states (Order)
  const [editOrderPaidAmt, setEditOrderPaidAmt] = useState("");
  const [editOrderPaymentMethod, setEditOrderPaymentMethod] = useState("Cash");
  const [editOrderDiscount, setEditOrderDiscount] = useState("0");
  const [editOrderDiscountType, setEditOrderDiscountType] = useState<"amount" | "percent" | "per_brick">("amount");
  const [editOrderNotes, setEditOrderNotes] = useState("");
  const [editOrderShipment, setEditOrderShipment] = useState("");
  const [editOrderShipmentDistance, setEditOrderShipmentDistance] = useState("0");
  const [editOrderExtra, setEditOrderExtra] = useState("");
  const [editOrderExtraDesc, setEditOrderExtraDesc] = useState("");
  const [editOrderDeliveryPartnerId, setEditOrderDeliveryPartnerId] = useState("");
  const [editOrderCollectorId, setEditOrderCollectorId] = useState("");
  const [editOrderLoadingWorkerId, setEditOrderLoadingWorkerId] = useState("");
  const [editOrderUnloadingWorkerId, setEditOrderUnloadingWorkerId] = useState("");
  const [editPaymentCollectorId, setEditPaymentCollectorId] = useState("");

  const handleUpdateEditItemQty = (index: number, newQtyStr: string) => {
    const updated = [...editOrderItems];
    const qty = Math.max(1, Number(newQtyStr) || 1);
    updated[index].quantity = qty;
    updated[index].grossTotal = qty * Number(updated[index].rate || 0);
    setEditOrderItems(updated);
  };

  const handleUpdateEditItemRate = (index: number, newRateStr: string) => {
    const updated = [...editOrderItems];
    const rate = Math.max(0, Number(newRateStr) || 0);
    updated[index].rate = rate;
    updated[index].grossTotal = Number(updated[index].quantity || 1) * rate;
    setEditOrderItems(updated);
  };

  const handleIncrementEditItemQty = (index: number, delta: number) => {
    const updated = [...editOrderItems];
    const currentQty = Number(updated[index].quantity || 1);
    const newQty = Math.max(1, currentQty + delta);
    updated[index].quantity = newQty;
    updated[index].grossTotal = newQty * Number(updated[index].rate || 0);
    setEditOrderItems(updated);
  };

  const handleOpenEditLedger = (entry: any) => {
    if (entry.type === "opening") return;
    setSelectedEntry(entry);
    setEditLedgerDate(entry.date);
    
    if (entry.type === "payment") {
      setEditPaymentAmt(String(entry.original.amountReceived !== undefined ? entry.original.amountReceived : (entry.original.amount || 0)));
      setEditPaymentDiscount(String(entry.original.discountAmount || 0));
      setEditPaymentMethod(entry.original.paymentMethod || "Cash");
      setEditPaymentNotes(entry.original.notes || "");
      setEditPaymentCollectorId(entry.original.collectorId || "");
    } else if (entry.type === "order") {
      setEditOrderPaidAmt(String(entry.original.paidAmount || 0));
      setEditOrderPaymentMethod(entry.original.paymentMethod || "Cash");
      setEditOrderDiscount(String(entry.original.discount || 0));
      setEditOrderDiscountType(entry.original.discountType || "amount");
      setEditOrderNotes(entry.original.notes || "");
      setEditOrderShipment(String(entry.original.shipmentCharge || 0));
      setEditOrderShipmentDistance(String(entry.original.shipmentDistance || 0));
      setEditOrderExtra(String(entry.original.extraAmount || 0));
      setEditOrderExtraDesc(entry.original.extraAmountDescription || "");
      setEditOrderDeliveryPartnerId(entry.original.deliveryPartnerId || "");
      setEditOrderCollectorId(entry.original.collectorId || "");
      setEditOrderLoadingWorkerId(entry.original.loadingWorkerId || "");
      setEditOrderUnloadingWorkerId(entry.original.unloadingWorkerId || "");
      const itemsList = entry.original.items || (entry.original.itemId ? [{
        itemId: entry.original.itemId,
        itemName: entry.original.itemName,
        quantity: entry.original.quantity,
        rate: entry.original.rate,
        grossTotal: entry.original.grossTotal,
      }] : []);
      setEditOrderItems(itemsList.map((itm: any) => ({
        itemId: itm.itemId,
        itemName: itm.itemName,
        quantity: Number(itm.quantity || 1),
        rate: Number(itm.rate || 0),
        grossTotal: Number(itm.grossTotal || (Number(itm.quantity || 1) * Number(itm.rate || 0)))
      })));
    }
    
    setIsEditLedgerOpen(true);
  };

  // Auto-calculate shipment charge when delivery partner or distance or items change inside edit order modal
  React.useEffect(() => {
    if (!isEditLedgerOpen || !selectedEntry || selectedEntry.type !== "order") return;

    const orig = selectedEntry.original || {};
    const isUnchanged =
      editOrderDeliveryPartnerId === (orig.deliveryPartnerId || "") &&
      editOrderShipmentDistance === String(orig.shipmentDistance || 0) &&
      JSON.stringify(editOrderItems.map((i: any) => ({ id: i.itemId, q: i.quantity, r: i.rate }))) ===
        JSON.stringify(
          (orig.items || (orig.itemId ? [{ itemId: orig.itemId, quantity: orig.quantity, rate: orig.rate }] : [])).map((i: any) => ({ id: i.itemId, q: i.quantity, r: i.rate }))
        );

    if (isUnchanged && orig.shipmentCharge !== undefined) {
      return;
    }

    const partner = partners.find((p: any) => p.id === editOrderDeliveryPartnerId);
    if (!partner) {
      if (editOrderDeliveryPartnerId !== orig.deliveryPartnerId) {
        setEditOrderShipment("0");
      }
      return;
    }
    const rateType = partner.deliveryRateType || "fixed amount";
    const rateVal = parseFloat(partner.deliveryRate) || 0;
    const minRateVal = parseFloat(partner.minimumRate) || 0;

    let calculatedCharge = 0;
    if (rateType === "kilometre") {
      const dist = parseFloat(editOrderShipmentDistance) || 0;
      calculatedCharge = Math.max(dist * rateVal, minRateVal);
    } else if (rateType === "per brick") {
      const totalQty = editOrderItems.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      );
      calculatedCharge = Math.max(totalQty * rateVal, minRateVal);
    } else {
      // fixed amount
      calculatedCharge = Math.max(rateVal, minRateVal);
    }

    setEditOrderShipment(String(calculatedCharge));
  }, [
    editOrderDeliveryPartnerId,
    editOrderShipmentDistance,
    editOrderItems,
    partners,
    isEditLedgerOpen,
    selectedEntry,
  ]);

  const handleSaveEditLedger = async () => {
    if (!selectedEntry) return;
    setSavingEditLedger(true);
    
    try {
      if (selectedEntry.type === "payment") {
        const amt = parseFloat(editPaymentAmt) || 0;
        const disc = parseFloat(editPaymentDiscount) || 0;
        if (amt <= 0 && disc <= 0) {
          Alert.alert("Invalid Amount", "Please enter a valid payment amount or discount amount.");
          setSavingEditLedger(false);
          return;
        }
        
        const updatedData = {
          amountReceived: amt,
          discountAmount: disc,
          paymentMethod: editPaymentMethod,
          notes: editPaymentNotes.trim(),
          createdAt: editLedgerDate,
          collectorId: editPaymentCollectorId || null,
          collectorName: collectors.find((c: any) => c.id === editPaymentCollectorId)?.name || null,
        };
        
        const success = await editPayment(selectedEntry.id, updatedData, selectedEntry.original);
        if (success) {
          Alert.alert("Success", "Payment updated successfully.");
          setIsEditLedgerOpen(false);
        } else {
          Alert.alert("Error", "Failed to update payment.");
        }
      } else if (selectedEntry.type === "order") {
        const paidAmt = parseFloat(editOrderPaidAmt) || 0;
        const shipment = parseFloat(editOrderShipment) || 0;
        const extra = parseFloat(editOrderExtra) || 0;
        
        if (paidAmt < 0 || shipment < 0 || extra < 0) {
          Alert.alert("Invalid Amount", "Values must be greater than or equal to zero.");
          setSavingEditLedger(false);
          return;
        }

        if (editOrderItems.length === 0) {
          Alert.alert("Invalid Order", "Order must contain at least one item.");
          setSavingEditLedger(false);
          return;
        }

        const calculatedGrossTotal = editOrderItems.reduce((sum, item) => sum + Number(item.grossTotal || item.quantity * item.rate), 0);

        const loadingWorker = workers.find((w: any) => w.id === editOrderLoadingWorkerId);
        const loadingWorkerName = loadingWorker ? loadingWorker.name : null;
        const totalQty = editOrderItems.reduce((sum: number, itm: any) => sum + Number(itm.quantity || 0), 0);
        const loadingCharge = loadingWorker ? totalQty * Number(loadingWorker.loadingCost || 0) : 0;

        const unloadingWorker = workers.find((w: any) => w.id === editOrderUnloadingWorkerId);
        const unloadingWorkerName = unloadingWorker ? unloadingWorker.name : null;
        const unloadingCharge = unloadingWorker ? totalQty * Number(unloadingWorker.unloadingCost || 0) : 0;

        const partner = partners.find((p: any) => p.id === editOrderDeliveryPartnerId);
        
        let discountVal = parseFloat(editOrderDiscount) || 0;
        let calculatedDiscount = 0;
        if (editOrderDiscountType === "percent") {
          calculatedDiscount = (calculatedGrossTotal * discountVal) / 100;
        } else if (editOrderDiscountType === "per_brick") {
          calculatedDiscount = discountVal * totalQty;
        } else {
          calculatedDiscount = discountVal;
        }

        const subtotalWithServices = calculatedGrossTotal + shipment + extra + loadingCharge + unloadingCharge;
        const newTotal = Math.max(0, subtotalWithServices - calculatedDiscount);
        const newBalanceDue = Math.max(0, newTotal - paidAmt);
        
        const primaryItem = editOrderItems[0];
        
        const newOrderPayload = {
          ...selectedEntry.original,
          items: editOrderItems,
          itemId: primaryItem.itemId,
          itemName: primaryItem.itemName,
          quantity: primaryItem.quantity,
          rate: primaryItem.rate,
          rateType: primaryItem.rateType || "piece",
          grossTotal: calculatedGrossTotal,
          discount: discountVal,
          discountType: editOrderDiscountType,
          discountAmount: calculatedDiscount,
          notes: editOrderNotes.trim(),
          paymentMethod: editOrderPaymentMethod,
          shipmentCharge: shipment,
          shipmentDistance: Number(editOrderShipmentDistance) || 0,
          deliveryRateType: partner?.deliveryRateType || "fixed amount",
          deliveryRate: Number(partner?.deliveryRate || 0),
          deliveryMinRate: Number(partner?.minimumRate || 0),
          extraAmount: extra,
          extraAmountDescription: editOrderExtraDesc.trim(),
          total: newTotal,
          paidAmount: paidAmt,
          balanceDue: newBalanceDue,
          createdAt: editLedgerDate,
          orderedDate: editLedgerDate,
          deliveryPartnerId: editOrderDeliveryPartnerId || null,
          deliveryPartnerName: partner ? partner.name : null,
          collectorId: editOrderCollectorId || null,
          collectorName: collectors.find((c: any) => c.id === editOrderCollectorId)?.name || null,
          loadingWorkerId: editOrderLoadingWorkerId || null,
          loadingWorkerName: loadingWorkerName,
          loadingCharge: loadingCharge,
          unloadingWorkerId: editOrderUnloadingWorkerId || null,
          unloadingWorkerName: unloadingWorkerName,
          unloadingCharge: unloadingCharge,
        };
        
        const success = await editOrder(selectedEntry.id, newOrderPayload, selectedEntry.original);
        if (success) {
          Alert.alert("Success", "Order updated successfully.");
          setIsEditLedgerOpen(false);
        } else {
          Alert.alert("Error", "Failed to update order.");
        }
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "An error occurred while saving changes.");
    } finally {
      setSavingEditLedger(false);
    }
  };

  const handleDeleteLedgerEntry = () => {
    if (!selectedEntry) return;
    
    const entryTypeLabel = selectedEntry.type === "payment" ? "Payment" : "Bill / Invoice";
    
    Alert.alert(
      `Delete ${entryTypeLabel}`,
      `Are you sure you want to permanently delete this ${entryTypeLabel.toLowerCase()}? This action will automatically adjust the customer's pending balance.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSavingEditLedger(true);
            try {
              let success = false;
              if (selectedEntry.type === "payment") {
                success = await deletePayment(selectedEntry.id);
              } else if (selectedEntry.type === "order") {
                success = await deleteOrder(selectedEntry.id, selectedEntry.original);
              }
              
              if (success) {
                Alert.alert("Deleted", `${entryTypeLabel} has been deleted.`);
                setIsEditLedgerOpen(false);
              } else {
                Alert.alert("Error", `Failed to delete ${entryTypeLabel.toLowerCase()}.`);
              }
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "An unexpected error occurred.");
            } finally {
              setSavingEditLedger(false);
            }
          }
        }
      ]
    );
  };

  // Custom Ledger Calendar Modal Component
  const renderLedgerCalendarPicker = () => {
    const daysInMonth = new Date(editLedgerDate.getFullYear(), editLedgerDate.getMonth() + 1, 0).getDate();
    const firstDayIndex = new Date(editLedgerDate.getFullYear(), editLedgerDate.getMonth(), 1).getDay();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const weeks = [];
    let days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<View key={`empty-${i}`} style={styles.calendarEmptyDay} />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const isSelected = editLedgerDate.getDate() === d;
      days.push(
        <Pressable
          key={`day-${d}`}
          style={[styles.calendarDay, isSelected && styles.calendarSelectedDay]}
          onPress={() => {
            const newD = new Date(editLedgerDate);
            newD.setDate(d);
            setEditLedgerDate(newD);
            setIsLedgerCalendarOpen(false);
          }}
        >
          <Text style={[styles.calendarDayText, isSelected && styles.calendarSelectedDayText]}>
            {d}
          </Text>
        </Pressable>
      );

      if (days.length === 7) {
        weeks.push(<View key={`week-${d}`} style={styles.calendarWeekRow}>{days}</View>);
        days = [];
      }
    }
    if (days.length > 0) {
      while (days.length < 7) {
        days.push(<View key={`empty-end-${days.length}`} style={styles.calendarEmptyDay} />);
      }
      weeks.push(<View key="week-end" style={styles.calendarWeekRow}>{days}</View>);
    }

    return (
      <Modal visible={isLedgerCalendarOpen} transparent animationType="fade" onRequestClose={() => setIsLedgerCalendarOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
          <Pressable style={styles.modalOverlay} onPress={() => setIsLedgerCalendarOpen(false)} />
          <View style={[styles.calendarCard, { zIndex: 10 }]}>
            <View style={styles.calendarHeader}>
              <Pressable
                onPress={() => {
                  const prev = new Date(editLedgerDate);
                  prev.setMonth(prev.getMonth() - 1);
                  setEditLedgerDate(prev);
                }}
              >
                <MaterialIcons name="chevron-left" size={28} color={colors.accent.primary} />
              </Pressable>
              <Text style={styles.calendarHeaderTitle}>
                {monthNames[editLedgerDate.getMonth()]} {editLedgerDate.getFullYear()}
              </Text>
              <Pressable
                onPress={() => {
                  const next = new Date(editLedgerDate);
                  next.setMonth(next.getMonth() + 1);
                  setEditLedgerDate(next);
                }}
              >
                <MaterialIcons name="chevron-right" size={28} color={colors.accent.primary} />
              </Pressable>
            </View>

            <View style={styles.calendarWeekHeader}>
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((dayName) => (
                <Text key={dayName} style={styles.calendarWeekName}>{dayName}</Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>{weeks}</View>

            <Pressable style={styles.calendarCloseBtn} onPress={() => setIsLedgerCalendarOpen(false)}>
              <Text style={styles.calendarCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const renderEditLedgerModal = () => {
    if (!selectedEntry) return null;
    
    return (
      <Modal
        visible={isEditLedgerOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEditLedgerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setIsEditLedgerOpen(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Edit {selectedEntry.type === "payment" ? "Payment" : "Bill / Invoice"}
              </Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsEditLedgerOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Transaction Date *</Text>
              <Pressable
                style={styles.dateSelector}
                onPress={() => setIsLedgerCalendarOpen(true)}
              >
                <MaterialIcons name="calendar-today" size={18} color={colors.accent.primary} style={{ marginRight: 8 }} />
                <Text style={styles.dateSelectorText}>
                  {editLedgerDate.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </Text>
                <MaterialIcons name="edit" size={16} color={colors.text.muted} style={{ marginLeft: "auto" }} />
              </Pressable>

              {selectedEntry.type === "payment" ? (
                <View>
                  <Text style={styles.label}>Amount Received (₹)</Text>
                  <TextInput
                    value={editPaymentAmt}
                    onChangeText={setEditPaymentAmt}
                    keyboardType="numeric"
                    style={styles.input}
                    placeholder="Enter amount"
                    placeholderTextColor={colors.text.muted}
                  />

                  <Text style={styles.label}>Balance Payment Discount (₹)</Text>
                  <TextInput
                    value={editPaymentDiscount}
                    onChangeText={setEditPaymentDiscount}
                    keyboardType="numeric"
                    style={[styles.input, { borderColor: colors.accent.success + "80" }]}
                    placeholder="Enter discount amount on balance"
                    placeholderTextColor={colors.text.muted}
                  />

                  <Text style={styles.label}>Payment Method</Text>
                  <View style={styles.paymentMethodRow}>
                    {(editPaymentMethod && !PAYMENT_METHODS.includes(editPaymentMethod)
                      ? [...PAYMENT_METHODS, editPaymentMethod]
                      : PAYMENT_METHODS
                    ).map((method) => {
                      const active = editPaymentMethod === method;
                      return (
                        <Pressable
                          key={method}
                          style={[
                            styles.methodBtn,
                            active && styles.methodBtnActive,
                          ]}
                          onPress={() => setEditPaymentMethod(method)}
                        >
                          <Text style={[styles.methodBtnText, active && styles.methodBtnTextActive]}>
                            {method}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>Assign Money Collector</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        style={[
                          styles.partnerCard,
                          !editPaymentCollectorId && styles.partnerCardActive,
                        ]}
                        onPress={() => setEditPaymentCollectorId("")}
                      >
                        <Text style={[styles.partnerName, !editPaymentCollectorId && styles.partnerNameActive]}>
                          No Collector
                        </Text>
                      </Pressable>
                      {collectors.map((c: any) => {
                        const active = editPaymentCollectorId === c.id;
                        return (
                          <Pressable
                            key={c.id}
                            style={[styles.partnerCard, active && styles.partnerCardActive]}
                            onPress={() => setEditPaymentCollectorId(c.id)}
                          >
                            <Text style={[styles.partnerName, active && styles.partnerNameActive]}>
                              {c.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>

                  <Text style={styles.label}>Notes (Optional)</Text>
                  <TextInput
                    value={editPaymentNotes}
                    onChangeText={setEditPaymentNotes}
                    style={styles.input}
                    placeholder="Payment notes"
                    placeholderTextColor={colors.text.muted}
                  />
                </View>
              ) : (
                <View>
                  {/* Order Products / Items List */}
                  <Text style={[styles.label, { color: colors.accent.primary, fontSize: 12, marginTop: 8 }]}>Order Products / Items</Text>
                  
                  {/* Select Product to Add */}
                  <Text style={styles.label}>Select Product to Add</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {items.map((itm: any) => {
                        const active = selectedItemId === itm.id;
                        return (
                          <Pressable
                            key={itm.id}
                            style={[
                              styles.partnerCard,
                              active && styles.partnerCardActive,
                            ]}
                            onPress={() => handleSelectItemForEdit(itm.id)}
                          >
                            <Text style={[
                              styles.partnerName, 
                              active && styles.partnerNameActive,
                              itm.status === "Inactive" && { color: colors.text.muted }
                            ]}>
                              {itm.itemName} {itm.status === "Inactive" ? "(Inactive)" : ""}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {selectedItemId ? (
                    <View style={{ backgroundColor: colors.bg.primary, padding: 10, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: colors.border.subtle }}>
                      <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Qty to Add</Text>
                          <TextInput
                            value={selectedItemQty}
                            onChangeText={setSelectedItemQty}
                            keyboardType="numeric"
                            style={styles.input}
                            placeholder="1"
                            placeholderTextColor={colors.text.muted}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Rate per Unit (₹)</Text>
                          <TextInput
                            value={selectedItemRate}
                            onChangeText={setSelectedItemRate}
                            keyboardType="numeric"
                            style={styles.input}
                            placeholder="0"
                            placeholderTextColor={colors.text.muted}
                          />
                        </View>
                      </View>
                      
                      <Pressable
                        style={{
                          backgroundColor: colors.accent.primary,
                          borderRadius: 8,
                          paddingVertical: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "row",
                          gap: 6
                        }}
                        onPress={handleAddItemToEdit}
                      >
                        <MaterialIcons name="add-shopping-cart" size={16} color="#FFFFFF" />
                        <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>Add Product</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {/* Added Order Items List with Inline Controls */}
                  <Text style={styles.label}>Order Items ({editOrderItems.length})</Text>
                  {editOrderItems.length > 0 ? (
                    <View style={{ gap: 10, marginBottom: 16 }}>
                      {editOrderItems.map((item, idx) => (
                        <View
                          key={idx}
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            backgroundColor: colors.bg.primary,
                            borderWidth: 1,
                            borderColor: colors.border.subtle,
                            gap: 8,
                          }}
                        >
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text.primary }}>
                              {item.itemName}
                            </Text>
                            <Pressable onPress={() => handleRemoveItemFromEdit(idx)} hitSlop={8}>
                              <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                            </Pressable>
                          </View>

                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                            {/* Qty +/- Controls */}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.muted, marginRight: 2 }}>Qty:</Text>
                              <Pressable
                                style={{ padding: 4, borderRadius: 6, backgroundColor: colors.accent.primary + "15" }}
                                onPress={() => handleIncrementEditItemQty(idx, -1)}
                              >
                                <MaterialIcons name="remove" size={14} color={colors.accent.primary} />
                              </Pressable>
                              <TextInput
                                value={String(item.quantity)}
                                onChangeText={(v) => handleUpdateEditItemQty(idx, v)}
                                keyboardType="numeric"
                                style={[styles.input, { width: 52, textAlign: "center", marginBottom: 0, paddingVertical: 2, paddingHorizontal: 4, fontSize: 13, height: 32 }]}
                              />
                              <Pressable
                                style={{ padding: 4, borderRadius: 6, backgroundColor: colors.accent.primary + "15" }}
                                onPress={() => handleIncrementEditItemQty(idx, 1)}
                              >
                                <MaterialIcons name="add" size={14} color={colors.accent.primary} />
                              </Pressable>
                            </View>

                            {/* Rate Input */}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.muted }}>Rate (₹):</Text>
                              <TextInput
                                value={String(item.rate)}
                                onChangeText={(v) => handleUpdateEditItemRate(idx, v)}
                                keyboardType="numeric"
                                style={[styles.input, { width: 65, textAlign: "center", marginBottom: 0, paddingVertical: 2, paddingHorizontal: 4, fontSize: 13, height: 32 }]}
                              />
                            </View>

                            {/* Item Subtotal */}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                              <Text style={{ fontSize: 11, color: colors.text.muted }}>Total: </Text>
                              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary }}>
                                ₹{(item.grossTotal || item.quantity * item.rate).toLocaleString("en-IN")}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <View style={{ height: 1, backgroundColor: colors.border.subtle, marginVertical: 10 }} />

                  {/* Discount Section */}
                  <Text style={styles.label}>Discount (Optional)</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                    <TextInput
                      value={editOrderDiscount}
                      onChangeText={setEditOrderDiscount}
                      keyboardType="numeric"
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                    />
                    <View style={{ flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: colors.border.medium, overflow: "hidden" }}>
                      <Pressable
                        style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: editOrderDiscountType === "amount" ? colors.accent.primary : colors.bg.card, justifyContent: "center" }}
                        onPress={() => setEditOrderDiscountType("amount")}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: editOrderDiscountType === "amount" ? "#FFF" : colors.text.primary }}>₹ Flat</Text>
                      </Pressable>
                      <Pressable
                        style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: editOrderDiscountType === "percent" ? colors.accent.primary : colors.bg.card, justifyContent: "center" }}
                        onPress={() => setEditOrderDiscountType("percent")}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: editOrderDiscountType === "percent" ? "#FFF" : colors.text.primary }}>% Percent</Text>
                      </Pressable>
                      <Pressable
                        style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: editOrderDiscountType === "per_brick" ? colors.accent.primary : colors.bg.card, justifyContent: "center" }}
                        onPress={() => setEditOrderDiscountType("per_brick")}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: editOrderDiscountType === "per_brick" ? "#FFF" : colors.text.primary }}>₹/Brick</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Payment Details */}
                  <Text style={styles.label}>Amount Paid (₹)</Text>
                  <TextInput
                    value={editOrderPaidAmt}
                    onChangeText={setEditOrderPaidAmt}
                    keyboardType="numeric"
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.text.muted}
                  />

                  <Text style={styles.label}>Payment Method for Amount Paid</Text>
                  <View style={[styles.paymentMethodRow, { marginBottom: 14 }]}>
                    {(editOrderPaymentMethod && !PAYMENT_METHODS.includes(editOrderPaymentMethod)
                      ? [...PAYMENT_METHODS, editOrderPaymentMethod]
                      : PAYMENT_METHODS
                    ).map((m) => {
                      const active = editOrderPaymentMethod === m;
                      return (
                        <Pressable
                          key={m}
                          style={[styles.methodBtn, active && styles.methodBtnActive]}
                          onPress={() => setEditOrderPaymentMethod(m)}
                        >
                          <Text style={[styles.methodBtnText, active && styles.methodBtnTextActive]}>
                            {m}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>Bill Notes / Terms</Text>
                  <TextInput
                    value={editOrderNotes}
                    onChangeText={setEditOrderNotes}
                    style={styles.input}
                    placeholder="Billing terms, delivery instructions..."
                    placeholderTextColor={colors.text.muted}
                  />

                  <Text style={styles.label}>Shipment Distance (km)</Text>
                  <TextInput
                    value={editOrderShipmentDistance}
                    onChangeText={setEditOrderShipmentDistance}
                    keyboardType="numeric"
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.text.muted}
                  />

                  <Text style={styles.label}>Shipment Charge (₹)</Text>
                  <TextInput
                    value={editOrderShipment}
                    onChangeText={setEditOrderShipment}
                    keyboardType="numeric"
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.text.muted}
                  />

                  <Text style={styles.label}>Assign Delivery Partner</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        style={[
                          styles.partnerCard,
                          !editOrderDeliveryPartnerId && styles.partnerCardActive,
                        ]}
                        onPress={() => setEditOrderDeliveryPartnerId("")}
                      >
                        <Text style={[styles.partnerName, !editOrderDeliveryPartnerId && styles.partnerNameActive]}>
                          No Delivery (Self Pickup)
                        </Text>
                      </Pressable>
                      {sortedDeliveryPartners.map((p: any) => {
                        const active = editOrderDeliveryPartnerId === p.id;
                        return (
                          <Pressable
                            key={p.id}
                            style={[
                              styles.partnerCard,
                              active && styles.partnerCardActive,
                              p.isFavorite && !active && { backgroundColor: "#fef3c7", borderColor: "#fde047" },
                            ]}
                            onPress={() => setEditOrderDeliveryPartnerId(p.id)}
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

                  <Text style={styles.label}>Assign Money Collector</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        style={[
                          styles.partnerCard,
                          !editOrderCollectorId && styles.partnerCardActive,
                        ]}
                        onPress={() => setEditOrderCollectorId("")}
                      >
                        <Text style={[styles.partnerName, !editOrderCollectorId && styles.partnerNameActive]}>
                          No Collector
                        </Text>
                      </Pressable>
                      {collectors.map((c: any) => {
                        const active = editOrderCollectorId === c.id;
                        return (
                          <Pressable
                            key={c.id}
                            style={[styles.partnerCard, active && styles.partnerCardActive]}
                            onPress={() => setEditOrderCollectorId(c.id)}
                          >
                            <Text style={[styles.partnerName, active && styles.partnerNameActive]}>
                              {c.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>

                  <Text style={styles.label}>Assign Loading Worker</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        style={[
                          styles.partnerCard,
                          !editOrderLoadingWorkerId && styles.partnerCardActive,
                        ]}
                        onPress={() => setEditOrderLoadingWorkerId("")}
                      >
                        <Text style={[styles.partnerName, !editOrderLoadingWorkerId && styles.partnerNameActive]}>
                          No Loading Worker
                        </Text>
                      </Pressable>
                      {workers.filter((w: any) => w.status === "Active").map((w: any) => {
                        const active = editOrderLoadingWorkerId === w.id;
                        return (
                          <Pressable
                            key={`edit-load-${w.id}`}
                            style={[styles.partnerCard, active && styles.partnerCardActive]}
                            onPress={() => setEditOrderLoadingWorkerId(w.id)}
                          >
                            <Text style={[styles.partnerName, active && styles.partnerNameActive]}>
                              {w.name} (₹{w.loadingCost || 0}/pc)
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>

                  <Text style={styles.label}>Assign Unloading Worker</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        style={[
                          styles.partnerCard,
                          !editOrderUnloadingWorkerId && styles.partnerCardActive,
                        ]}
                        onPress={() => setEditOrderUnloadingWorkerId("")}
                      >
                        <Text style={[styles.partnerName, !editOrderUnloadingWorkerId && styles.partnerNameActive]}>
                          No Unloading Worker
                        </Text>
                      </Pressable>
                      {workers.filter((w: any) => w.status === "Active").map((w: any) => {
                        const active = editOrderUnloadingWorkerId === w.id;
                        return (
                          <Pressable
                            key={`edit-unload-${w.id}`}
                            style={[styles.partnerCard, active && styles.partnerCardActive]}
                            onPress={() => setEditOrderUnloadingWorkerId(w.id)}
                          >
                            <Text style={[styles.partnerName, active && styles.partnerNameActive]}>
                              {w.name} (₹{w.unloadingCost || 0}/pc)
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>

                  <Text style={styles.label}>Extra Amount / Charge (₹)</Text>
                  <TextInput
                    value={editOrderExtra}
                    onChangeText={setEditOrderExtra}
                    keyboardType="numeric"
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.text.muted}
                  />

                  <Text style={styles.label}>Extra Charge Description</Text>
                  <TextInput
                    value={editOrderExtraDesc}
                    onChangeText={setEditOrderExtraDesc}
                    style={styles.input}
                    placeholder="Loading charges, packaging fee..."
                    placeholderTextColor={colors.text.muted}
                  />

                  {/* Live Order Billing Breakdown Card */}
                  {(() => {
                    const grossTotal = editOrderItems.reduce((sum, item) => sum + Number(item.grossTotal || item.quantity * item.rate), 0);
                    const shipment = parseFloat(editOrderShipment) || 0;
                    const extra = parseFloat(editOrderExtra) || 0;
                    const paidAmt = parseFloat(editOrderPaidAmt) || 0;

                    const loadingWorker = workers.find((w: any) => w.id === editOrderLoadingWorkerId);
                    const totalQty = editOrderItems.reduce((sum: number, itm: any) => sum + Number(itm.quantity || 0), 0);
                    const loadingCharge = loadingWorker ? totalQty * Number(loadingWorker.loadingCost || 0) : 0;

                    const unloadingWorker = workers.find((w: any) => w.id === editOrderUnloadingWorkerId);
                    const unloadingCharge = unloadingWorker ? totalQty * Number(unloadingWorker.unloadingCost || 0) : 0;

                    let discountVal = parseFloat(editOrderDiscount) || 0;
                    let calculatedDiscount = editOrderDiscountType === "percent" ? (grossTotal * discountVal) / 100 : editOrderDiscountType === "per_brick" ? discountVal * totalQty : discountVal;

                    const netTotal = Math.max(0, grossTotal + shipment + extra + loadingCharge + unloadingCharge - calculatedDiscount);
                    const netBalance = Math.max(0, netTotal - paidAmt);

                    return (
                      <View style={{ backgroundColor: colors.bg.primary, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle, marginVertical: 14 }}>
                        <Text style={{ fontSize: 13, fontWeight: "800", color: colors.text.primary, marginBottom: 8 }}>Order Billing Breakdown</Text>
                        
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, color: colors.text.muted }}>Items Gross Subtotal</Text>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text.primary }}>₹{grossTotal.toLocaleString("en-IN")}</Text>
                        </View>

                        {loadingCharge > 0 && (
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: colors.text.muted }}>Loading Wages ({loadingWorker?.name})</Text>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text.primary }}>+ ₹{loadingCharge.toLocaleString("en-IN")}</Text>
                          </View>
                        )}

                        {unloadingCharge > 0 && (
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: colors.text.muted }}>Unloading Wages ({unloadingWorker?.name})</Text>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text.primary }}>+ ₹{unloadingCharge.toLocaleString("en-IN")}</Text>
                          </View>
                        )}

                        {shipment > 0 && (
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: colors.text.muted }}>Shipment Charge</Text>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text.primary }}>+ ₹{shipment.toLocaleString("en-IN")}</Text>
                          </View>
                        )}

                        {extra > 0 && (
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: colors.text.muted }}>Extra Charges ({editOrderExtraDesc || "Other"})</Text>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text.primary }}>+ ₹{extra.toLocaleString("en-IN")}</Text>
                          </View>
                        )}

                        {calculatedDiscount > 0 && (
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: colors.accent.success }}>Discount ({editOrderDiscountType === "percent" ? `${editOrderDiscount}%` : editOrderDiscountType === "per_brick" ? `₹${editOrderDiscount}/brick × ${totalQty}` : "Flat"})</Text>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent.success }}>- ₹{calculatedDiscount.toLocaleString("en-IN")}</Text>
                          </View>
                        )}

                        <View style={{ height: 1, backgroundColor: colors.border.subtle, marginVertical: 6 }} />

                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary }}>Final Bill Total</Text>
                          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.accent.primary }}>₹{netTotal.toLocaleString("en-IN")}</Text>
                        </View>

                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, color: colors.text.muted }}>Amount Paid</Text>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent.success }}>- ₹{paidAmt.toLocaleString("en-IN")}</Text>
                        </View>

                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border.subtle }}>
                          <Text style={{ fontSize: 13, fontWeight: "800", color: colors.text.primary }}>Net Pending Due</Text>
                          <Text style={{ fontSize: 14, fontWeight: "800", color: netBalance > 0 ? "#EF4444" : colors.accent.success }}>
                            ₹{netBalance.toLocaleString("en-IN")}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              )}

              <View style={styles.ledgerActionsRow}>
                <Pressable
                  disabled={savingEditLedger}
                  style={styles.ledgerDeleteBtn}
                  onPress={handleDeleteLedgerEntry}
                >
                  <MaterialIcons name="delete" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.ledgerDeleteBtnText}>Delete</Text>
                </Pressable>

                <Pressable
                  disabled={savingEditLedger}
                  style={styles.ledgerSaveBtn}
                  onPress={handleSaveEditLedger}
                >
                  {savingEditLedger ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialIcons name="save" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.ledgerSaveBtnText}>Save</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const renderMarkingModal = () => {
    return (
      <Modal
        visible={isMarkingModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsMarkingModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setIsMarkingModalOpen(false)} />
          <View style={[styles.modalContent, { maxHeight: "85%" }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent.primary + "20", alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name="label" size={20} color={colors.accent.primary} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Mark Profile Category</Text>
                  <Text style={{ fontSize: 11, color: colors.text.muted }}>Tag client as Engineer, Ministry, Contractor, etc.</Text>
                </View>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsMarkingModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {/* Active Selected Markings */}
              <Text style={[styles.label, { marginBottom: 8 }]}>Active Markings ({selectedMarkings.length})</Text>
              {selectedMarkings.length === 0 ? (
                <View style={{ padding: 12, borderRadius: 8, backgroundColor: theme.isDark ? "#1E293B40" : "#F8FAFC", borderWidth: 1, borderColor: colors.border.subtle, marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, color: colors.text.muted, textAlign: "center" }}>
                    No profile markings currently selected. Tap any preset below or add a custom tag.
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {selectedMarkings.map((tag) => {
                    const cfg = getMarkingConfig(tag, theme.isDark);
                    return (
                      <View
                        key={tag}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 20,
                          backgroundColor: cfg.bg,
                          borderWidth: 1.5,
                          borderColor: cfg.border,
                        }}
                      >
                        <MaterialIcons name={cfg.icon} size={15} color={cfg.color} />
                        <Text style={{ fontSize: 12.5, fontWeight: "700", color: cfg.color }}>{tag}</Text>
                        <Pressable
                          onPress={() => handleToggleMarking(tag)}
                          hitSlop={8}
                          style={{ padding: 2, marginLeft: 2 }}
                        >
                          <MaterialIcons name="cancel" size={16} color={cfg.color} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Preset Quick Options */}
              <Text style={[styles.label, { marginBottom: 8 }]}>Choose Profile Marking</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                {allMarkingPresets.map((preset) => {
                  const isSelected = selectedMarkings.some((m) => m.toLowerCase() === preset.label.toLowerCase());
                  const cfg = getMarkingConfig(preset.label, theme.isDark);

                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => handleToggleMarking(preset.label)}
                      onLongPress={() => {
                        if (preset.isCustom) {
                          Alert.alert(
                            "Delete Custom Marking",
                            `Remove "${preset.label}" from available profile markings?`,
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Delete",
                                style: "destructive",
                                onPress: () => {
                                  removeCustomMarking(preset.label);
                                  setSelectedMarkings((prev) => prev.filter((t) => t.toLowerCase() !== preset.label.toLowerCase()));
                                }
                              }
                            ]
                          );
                        }
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 20,
                        backgroundColor: isSelected ? cfg.bg : (theme.isDark ? colors.bg.primary : "#F3F4F6"),
                        borderWidth: 1.5,
                        borderColor: isSelected ? cfg.border : colors.border.medium,
                      }}
                    >
                      <MaterialIcons
                        name={preset.icon}
                        size={16}
                        color={isSelected ? cfg.color : colors.text.muted}
                      />
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: isSelected ? "800" : "600",
                          color: isSelected ? cfg.color : colors.text.secondary,
                        }}
                      >
                        {preset.label}
                      </Text>
                      {preset.isCustom ? (
                        <Pressable
                          hitSlop={8}
                          onPress={(e) => {
                            e.stopPropagation();
                            Alert.alert(
                              "Delete Custom Marking",
                              `Remove "${preset.label}" from available profile markings?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Delete",
                                  style: "destructive",
                                  onPress: () => {
                                    removeCustomMarking(preset.label);
                                    setSelectedMarkings((prev) => prev.filter((t) => t.toLowerCase() !== preset.label.toLowerCase()));
                                  }
                                }
                              ]
                            );
                          }}
                        >
                          <MaterialIcons name="close" size={14} color={colors.text.muted} style={{ marginLeft: 2 }} />
                        </Pressable>
                      ) : isSelected ? (
                        <MaterialIcons name="check" size={16} color={cfg.color} />
                      ) : (
                        <MaterialIcons name="add" size={15} color={colors.text.muted} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {/* Custom Marking Input */}
              <Text style={styles.label}>Add Custom Marking (+)</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <TextInput
                  value={customMarkingInput}
                  onChangeText={setCustomMarkingInput}
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="e.g. Sub-Contractor, Architect, VIP..."
                  placeholderTextColor={colors.text.muted}
                  onSubmitEditing={handleAddCustomMarking}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={handleAddCustomMarking}
                  disabled={!customMarkingInput.trim()}
                  style={{
                    backgroundColor: customMarkingInput.trim() ? colors.accent.primary : colors.border.medium,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <MaterialIcons name="add" size={18} color="#FFFFFF" />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>Add</Text>
                </Pressable>
              </View>

              {/* Save & Cancel Actions */}
              <View style={[styles.ledgerActionsRow, { marginTop: 10 }]}>
                <Pressable
                  disabled={isSavingMarkings}
                  style={[styles.ledgerDeleteBtn, { backgroundColor: colors.text.muted }]}
                  onPress={() => setIsMarkingModalOpen(false)}
                >
                  <Text style={styles.ledgerDeleteBtnText}>Cancel</Text>
                </Pressable>

                <Pressable
                  disabled={isSavingMarkings}
                  style={styles.ledgerSaveBtn}
                  onPress={handleSaveMarkings}
                >
                  {isSavingMarkings ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialIcons name="check-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.ledgerSaveBtnText}>Save Markings</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const renderEditProfileModal = () => {
    return (
      <Modal
        visible={isEditProfileOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsEditProfileOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setIsEditProfileOpen(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Client Profile</Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsEditProfileOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Client Name *</Text>
              <TextInput
                value={editProfileName}
                onChangeText={setEditProfileName}
                style={styles.input}
                placeholder="Enter client name"
                placeholderTextColor={colors.text.muted}
              />

              <Text style={styles.label}>Phone Numbers</Text>
              {editProfilePhoneNumbers.map((phone, idx) => (
                <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <TextInput
                    value={phone}
                    onChangeText={(val) => {
                      const next = [...editProfilePhoneNumbers];
                      next[idx] = val;
                      setEditProfilePhoneNumbers(next);
                    }}
                    keyboardType="phone-pad"
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder={`Phone number ${idx + 1}`}
                    placeholderTextColor={colors.text.muted}
                  />
                  {editProfilePhoneNumbers.length > 1 && (
                    <Pressable
                      style={{ padding: 6 }}
                      onPress={() => {
                        const next = editProfilePhoneNumbers.filter((_, i) => i !== idx);
                        setEditProfilePhoneNumbers(next);
                      }}
                    >
                      <MaterialIcons name="delete" size={20} color={colors.accent.danger} />
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 6,
                  backgroundColor: colors.accent.primary + "15",
                  alignSelf: "flex-start",
                  marginBottom: 14,
                  marginTop: 4,
                }}
                onPress={() => setEditProfilePhoneNumbers([...editProfilePhoneNumbers, ""])}
              >
                <MaterialIcons name="add" size={14} color={colors.accent.primary} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent.primary }}>Add Phone Number</Text>
              </Pressable>

              <Text style={styles.label}>Address</Text>
              <TextInput
                value={editProfileAddress}
                onChangeText={setEditProfileAddress}
                style={styles.input}
                placeholder="Enter address"
                placeholderTextColor={colors.text.muted}
              />

              <Text style={styles.label}>Opening Balance (₹)</Text>
              <TextInput
                value={editProfileOpeningBalance}
                onChangeText={setEditProfileOpeningBalance}
                keyboardType="numeric"
                style={styles.input}
                placeholder="0"
                placeholderTextColor={colors.text.muted}
              />

              {/* Profile Markings in Edit Modal */}
              <Text style={styles.label}>Profile Markings / Categories (Engineer, Ministry, +)</Text>
              {editProfileMarkings.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {editProfileMarkings.map((tag) => {
                    const cfg = getMarkingConfig(tag, theme.isDark);
                    return (
                      <View
                        key={tag}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 14,
                          backgroundColor: cfg.bg,
                          borderWidth: 1,
                          borderColor: cfg.border,
                        }}
                      >
                        <MaterialIcons name={cfg.icon} size={13} color={cfg.color} />
                        <Text style={{ fontSize: 11.5, fontWeight: "700", color: cfg.color }}>{tag}</Text>
                        <Pressable
                          onPress={() => {
                            setEditProfileMarkings((prev) => prev.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
                          }}
                          hitSlop={6}
                        >
                          <MaterialIcons name="cancel" size={14} color={cfg.color} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Presets chips in Edit Modal */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {allMarkingPresets.map((preset) => {
                  const isSelected = editProfileMarkings.some((m) => m.toLowerCase() === preset.label.toLowerCase());
                  const cfg = getMarkingConfig(preset.label, theme.isDark);
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => {
                        if (isSelected) {
                          setEditProfileMarkings((prev) => prev.filter((t) => t.toLowerCase() !== preset.label.toLowerCase()));
                        } else {
                          setEditProfileMarkings((prev) => [...prev, preset.label]);
                        }
                      }}
                      onLongPress={() => {
                        if (preset.isCustom) {
                          Alert.alert(
                            "Delete Custom Marking",
                            `Remove "${preset.label}" from available profile markings?`,
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Delete",
                                style: "destructive",
                                onPress: () => {
                                  removeCustomMarking(preset.label);
                                  setEditProfileMarkings((prev) => prev.filter((t) => t.toLowerCase() !== preset.label.toLowerCase()));
                                }
                              }
                            ]
                          );
                        }
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingVertical: 5,
                        paddingHorizontal: 8,
                        borderRadius: 14,
                        backgroundColor: isSelected ? cfg.bg : (theme.isDark ? colors.bg.primary : "#F3F4F6"),
                        borderWidth: 1,
                        borderColor: isSelected ? cfg.border : colors.border.medium,
                      }}
                    >
                      <MaterialIcons name={preset.icon} size={13} color={isSelected ? cfg.color : colors.text.muted} />
                      <Text style={{ fontSize: 11, fontWeight: isSelected ? "700" : "500", color: isSelected ? cfg.color : colors.text.secondary }}>
                        {preset.label}
                      </Text>
                      {preset.isCustom ? (
                        <Pressable
                          hitSlop={8}
                          onPress={(e) => {
                            e.stopPropagation();
                            Alert.alert(
                              "Delete Custom Marking",
                              `Remove "${preset.label}" from available profile markings?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Delete",
                                  style: "destructive",
                                  onPress: () => {
                                    removeCustomMarking(preset.label);
                                    setEditProfileMarkings((prev) => prev.filter((t) => t.toLowerCase() !== preset.label.toLowerCase()));
                                  }
                                }
                              ]
                            );
                          }}
                        >
                          <MaterialIcons name="close" size={12} color={colors.text.muted} style={{ marginLeft: 2 }} />
                        </Pressable>
                      ) : isSelected ? (
                        <MaterialIcons name="check" size={13} color={cfg.color} />
                      ) : (
                        <MaterialIcons name="add" size={13} color={colors.text.muted} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {/* Custom tag add in Edit Modal */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 }}>
                <TextInput
                  value={editProfileCustomMarking}
                  onChangeText={setEditProfileCustomMarking}
                  style={[styles.input, { flex: 1, marginBottom: 0, height: 38, fontSize: 12.5 }]}
                  placeholder="Type custom mark and tap + Add"
                  placeholderTextColor={colors.text.muted}
                  onSubmitEditing={async () => {
                    const trimmed = editProfileCustomMarking.trim();
                    if (trimmed) {
                      await addCustomMarking(trimmed);
                      if (!editProfileMarkings.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
                        setEditProfileMarkings((prev) => [...prev, trimmed]);
                      }
                      setEditProfileCustomMarking("");
                    }
                  }}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={async () => {
                    const trimmed = editProfileCustomMarking.trim();
                    if (trimmed) {
                      await addCustomMarking(trimmed);
                      if (!editProfileMarkings.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
                        setEditProfileMarkings((prev) => [...prev, trimmed]);
                      }
                      setEditProfileCustomMarking("");
                    }
                  }}
                  disabled={!editProfileCustomMarking.trim()}
                  style={{
                    backgroundColor: editProfileCustomMarking.trim() ? colors.accent.primary : colors.border.medium,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <MaterialIcons name="add" size={16} color="#FFFFFF" />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFFFFF" }}>Add</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border.subtle }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary }}>Special Customer Status</Text>
                  <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                    Mark this client as a Special Customer in the registry
                  </Text>
                </View>
                <Switch
                  value={editProfileIsSpecial}
                  onValueChange={setEditProfileIsSpecial}
                  trackColor={{ false: colors.border.medium, true: "#F59E0B40" }}
                  thumbColor={editProfileIsSpecial ? "#F59E0B" : colors.text.muted}
                />
              </View>

              <Text style={styles.label}>Notes / Terms</Text>
              <TextInput
                value={editProfileNotes}
                onChangeText={setEditProfileNotes}
                multiline
                numberOfLines={3}
                style={[styles.input, { height: 80, textAlignVertical: "top" }]}
                placeholder="Enter notes / special billing terms"
                placeholderTextColor={colors.text.muted}
              />

              <View style={[styles.ledgerActionsRow, { marginTop: 20 }]}>
                <Pressable
                  disabled={isSavingProfile}
                  style={[styles.ledgerDeleteBtn, { backgroundColor: colors.text.muted }]}
                  onPress={() => setIsEditProfileOpen(false)}
                >
                  <Text style={styles.ledgerDeleteBtnText}>Cancel</Text>
                </Pressable>

                <Pressable
                  disabled={isSavingProfile}
                  style={styles.ledgerSaveBtn}
                  onPress={handleSaveEditProfile}
                >
                  {isSavingProfile ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialIcons name="save" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.ledgerSaveBtnText}>Save Changes</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const handleAssignCollector = async (collector: any) => {
    setUpdatingCollector(true);
    const success = await updateCustomerCollector(
      customer.id,
      collector ? collector.id : null,
      collector ? collector.name : null
    );
    setUpdatingCollector(false);
    if (success) {
      setIsCollectorModalOpen(false);
    } else {
      Alert.alert("Error", "Could not update collector. Please try again.");
    }
  };

  const openAddForm = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setDueDateStr(`${yyyy}-${mm}-${dd}`);
    setDueNotes("");
    setShowAddForm(true);
  };

  const setDateOffset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setDueDateStr(`${yyyy}-${mm}-${dd}`);
  };

  const handleAddDueDate = async () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dueDateStr)) {
      Alert.alert("Invalid Date", "Please enter date in YYYY-MM-DD format.");
      return;
    }
    
    setSavingDueDate(true);
    const newDueDate = {
      id: `dd_${Date.now()}`,
      date: dueDateStr,
      notes: dueNotes.trim(),
      status: "Pending"
    };
    
    const currentDueDates = customer?.dueDates || [];
    const cancelledPreviousDueDates = currentDueDates.map((d: any) => {
      if (d.status !== "Completed") {
        return {
          ...d,
          status: "Cancelled"
        };
      }
      return d;
    });
    const updatedDueDates = [...cancelledPreviousDueDates, newDueDate];
    
    const success = await updateCustomerDueDates(customer.id, updatedDueDates);
    setSavingDueDate(false);
    
    if (success) {
      setShowAddForm(false);
      setDueNotes("");
    } else {
      Alert.alert("Error", "Could not save due date. Please try again.");
    }
  };

  const handleToggleDueDateStatus = async (item: any) => {
    const currentDueDates = customer?.dueDates || [];
    const updatedDueDates = currentDueDates.map((d: any) => {
      if (d.id === item.id) {
        return {
          ...d,
          status: d.status === "Completed" ? "Pending" : "Completed"
        };
      }
      return d;
    });
    
    const success = await updateCustomerDueDates(customer.id, updatedDueDates);
    if (!success) {
      Alert.alert("Error", "Failed to update status.");
    }
  };

  const handleDeleteDueDate = (item: any) => {
    Alert.alert(
      "Delete Due Date",
      `Remove the due date for ${formatDueDate(item.date)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const currentDueDates = customer?.dueDates || [];
            const updatedDueDates = currentDueDates.filter((d: any) => d.id !== item.id);
            const success = await updateCustomerDueDates(customer.id, updatedDueDates);
            if (!success) {
              Alert.alert("Error", "Failed to delete due date.");
            }
          }
        }
      ]
    );
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

  const getDueDateStatus = (item: any) => {
    if (item.status === "Completed") return "Completed";
    if (item.status === "Cancelled") return "Cancelled";
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const parts = item.date.split("-");
    if (parts.length !== 3) return "Pending";
    const due = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    due.setHours(0, 0, 0, 0);
    
    if (due.getTime() < today.getTime()) {
      return "Overdue";
    }
    return "Pending";
  };

  const handleCall = () => {
    if (customer?.phone) {
      Linking.openURL(`tel:${customer.phone}`);
    }
  };

  if (!customer) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#EF4444" />
        <Text style={styles.errorText}>Client profile not found.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.push("/customers")}>
          <Text style={styles.backBtnText}>Back to Customers</Text>
        </Pressable>
      </View>
    );
  }

  const handleOpenSystemProfile = () => {
    if (!customer) return;
    if (customer.entityType === "worker") {
      router.push({ pathname: "/settings/workers/details" as any, params: { id: customer.id } });
    } else if (customer.entityType === "supplier") {
      router.push({ pathname: "/settings/raw-materials/suppliers/details" as any, params: { id: customer.id } });
    }
  };

  const renderPayModal = () => {
    if (!customer) return null;
    const currentPending = Number(customer.totalPending !== undefined ? customer.totalPending : customer.balance || 0);
    const amtNum = parseFloat(payAmount) || 0;
    const discNum = parseFloat(payDiscount) || 0;
    const netReduction = amtNum + discNum;
    const newRemaining = Math.max(0, currentPending - netReduction);

    return (
      <Modal
        visible={isPayModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsPayModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setIsPayModalOpen(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="account-balance-wallet" size={24} color={colors.accent.primary} />
                <Text style={styles.modalTitle}>Receive Payment & Discount</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsPayModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              {/* Current Pending Balance Badge */}
              <View style={{
                backgroundColor: colors.accent.danger + "15",
                borderColor: colors.accent.danger + "40",
                borderWidth: 1,
                borderRadius: 10,
                padding: 12,
                marginBottom: 16,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.danger, textTransform: "uppercase" }}>Current Pending Balance</Text>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: colors.accent.danger }}>
                    ₹{currentPending.toLocaleString("en-IN")}
                  </Text>
                </View>
                <Pressable
                  style={{
                    backgroundColor: colors.accent.primary,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8
                  }}
                  onPress={() => {
                    setPayAmount(String(currentPending));
                    setPayDiscount("0");
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFF" }}>Full Payment</Text>
                </Pressable>
              </View>

              {/* Amount Received Input */}
              <Text style={styles.label}>Amount Received (₹)</Text>
              <TextInput
                value={payAmount}
                onChangeText={setPayAmount}
                keyboardType="numeric"
                style={styles.input}
                placeholder="Enter amount paid by customer"
                placeholderTextColor={colors.text.muted}
              />

              {/* Balance Payment Discount Input */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <Text style={styles.label}>Balance Payment Discount (₹)</Text>
                {currentPending > 0 && amtNum > 0 && amtNum < currentPending && (
                  <Pressable
                    onPress={() => setPayDiscount(String(Math.max(0, currentPending - amtNum)))}
                    style={{ paddingVertical: 2, paddingHorizontal: 6, backgroundColor: colors.accent.success + "20", borderRadius: 6 }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "700", color: colors.accent.success }}>
                      Waiver Remaining (₹{(currentPending - amtNum).toLocaleString("en-IN")})
                    </Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                value={payDiscount}
                onChangeText={setPayDiscount}
                keyboardType="numeric"
                style={[styles.input, { borderColor: colors.accent.success + "80" }]}
                placeholder="Enter discount amount on balance"
                placeholderTextColor={colors.text.muted}
              />

              {/* Discount Presets Row */}
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {[100, 200, 500, 1000].map((preset) => (
                  <Pressable
                    key={preset}
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: 16,
                      backgroundColor: colors.bg.primary,
                      borderWidth: 1,
                      borderColor: colors.border.medium
                    }}
                    onPress={() => setPayDiscount(String(preset))}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.secondary }}>
                      +₹{preset} Disc
                    </Text>
                  </Pressable>
                ))}
                {currentPending > 0 && (
                  <Pressable
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: 16,
                      backgroundColor: colors.accent.success + "20",
                      borderWidth: 1,
                      borderColor: colors.accent.success
                    }}
                    onPress={() => {
                      setPayAmount("0");
                      setPayDiscount(String(currentPending));
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.success }}>
                      100% Full Waiver
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Payment Method */}
              <Text style={styles.label}>Payment Method</Text>
              <View style={styles.paymentMethodRow}>
                {PAYMENT_METHODS.map((method) => {
                  const active = payMethod === method;
                  return (
                    <Pressable
                      key={method}
                      style={[styles.methodBtn, active && styles.methodBtnActive]}
                      onPress={() => setPayMethod(method)}
                    >
                      <Text style={[styles.methodBtnText, active && styles.methodBtnTextActive]}>
                        {method}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Transaction Date */}
              <Text style={styles.label}>Transaction Date</Text>
              <Pressable
                style={styles.dateSelector}
                onPress={() => setIsPayCalendarOpen(true)}
              >
                <MaterialIcons name="calendar-today" size={18} color={colors.accent.primary} style={{ marginRight: 8 }} />
                <Text style={styles.dateSelectorText}>
                  {payDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                </Text>
                <MaterialIcons name="edit" size={16} color={colors.text.muted} style={{ marginLeft: "auto" }} />
              </Pressable>

              {/* Notes */}
              <Text style={styles.label}>Notes (Optional)</Text>
              <TextInput
                value={payNotes}
                onChangeText={setPayNotes}
                style={styles.input}
                placeholder="e.g. Early payment discount, cash settlement"
                placeholderTextColor={colors.text.muted}
              />

              {/* Live Settlement Calculation Summary Box */}
              <View style={{
                backgroundColor: colors.bg.primary,
                borderRadius: 10,
                padding: 12,
                marginVertical: 14,
                borderWidth: 1,
                borderColor: colors.border.subtle,
                gap: 6
              }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.muted, textTransform: "uppercase" }}>
                  Settlement Summary
                </Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, color: colors.text.secondary }}>Pending Balance:</Text>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text.primary }}>
                    ₹{currentPending.toLocaleString("en-IN")}
                  </Text>
                </View>
                {amtNum > 0 && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 12, color: colors.text.secondary }}>(-) Cash/Payment Received:</Text>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent.success }}>
                      -₹{amtNum.toLocaleString("en-IN")}
                    </Text>
                  </View>
                )}
                {discNum > 0 && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 12, color: colors.text.secondary }}>(-) Balance Discount:</Text>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent.success }}>
                      -₹{discNum.toLocaleString("en-IN")}
                    </Text>
                  </View>
                )}
                <View style={{ height: 1, backgroundColor: colors.border.subtle, marginVertical: 4 }} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary }}>New Pending Balance:</Text>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: newRemaining === 0 ? colors.accent.success : colors.accent.danger }}>
                    ₹{newRemaining.toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>

              {/* Submit Buttons */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 6, marginBottom: 20 }}>
                <Pressable
                  style={[styles.formActionBtn, styles.cancelBtn, { flex: 1 }]}
                  onPress={() => setIsPayModalOpen(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.formActionBtn, styles.saveBtn, { flex: 2, backgroundColor: colors.accent.success }]}
                  onPress={handleSavePayment}
                  disabled={isSavingPayment}
                >
                  {isSavingPayment ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Record Payment & Discount</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        <EasyCalendarModal
          visible={isPayCalendarOpen}
          date={payDate}
          onSelectDate={(date) => {
            setPayDate(date);
            setIsPayCalendarOpen(false);
          }}
          onClose={() => setIsPayCalendarOpen(false)}
          title="Select Payment Date"
        />
      </Modal>
    );
  };

  return (
    <AnimatedPage>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <BackButton label="Customers Registry" onPress={() => router.push("/customers")} style={{ marginBottom: 12 }} />
          <View style={styles.profileSummary}>
            <Pressable
              onPress={() => {
                if (customer.entityType && customer.entityType !== "customer") {
                  handleOpenSystemProfile();
                }
              }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>
                {customer.name?.substring(0, 2).toUpperCase() || "C"}
              </Text>
            </Pressable>
            {customer.isSpecial && (
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#F59E0B20",
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
                marginBottom: 8,
                borderColor: "#F59E0B40",
                borderWidth: 1,
              }}>
                <MaterialIcons name="stars" size={14} color="#D97706" />
                <Text style={{ fontSize: 10, fontWeight: "800", color: "#D97706", letterSpacing: 0.5 }}>SPECIAL CLIENT</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Pressable
                onPress={() => {
                  if (customer.entityType && customer.entityType !== "customer") {
                    handleOpenSystemProfile();
                  }
                }}
              >
                <Text selectable={true} style={styles.profileName}>{customer.name}</Text>
              </Pressable>
              <Pressable
                style={{ padding: 4 }}
                onPress={() => toggleFavoriteCustomer(customer.id)}
                hitSlop={8}
              >
                <MaterialIcons
                  name={customer.isFavorite ? "star" : "star-border"}
                  size={26}
                  color={customer.isFavorite ? "#F59E0B" : colors.text.muted}
                />
              </Pressable>
            </View>

            {/* Profile Markings Badges + Quick Add Button */}
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: 6,
              marginVertical: 6,
            }}>
              {(customer.profileMarkings && customer.profileMarkings.length > 0) ? (
                <>
                  {customer.profileMarkings.map((tag: string) => {
                    const cfg = getMarkingConfig(tag, theme.isDark);
                    return (
                      <Pressable
                        key={tag}
                        onPress={handleOpenMarkingModal}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          backgroundColor: cfg.bg,
                          borderColor: cfg.border,
                          borderWidth: 1.5,
                          borderRadius: 14,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <MaterialIcons name={cfg.icon} size={13} color={cfg.color} />
                        <Text style={{ fontSize: 11, fontWeight: "800", color: cfg.color, letterSpacing: 0.3 }}>
                          {tag}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={handleOpenMarkingModal}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 2,
                      backgroundColor: colors.accent.primary + "18",
                      borderColor: colors.accent.primary + "40",
                      borderWidth: 1,
                      borderRadius: 14,
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                    }}
                  >
                    <MaterialIcons name="add" size={14} color={colors.accent.primary} />
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={handleOpenMarkingModal}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: colors.accent.primary + "15",
                    borderColor: colors.accent.primary + "35",
                    borderWidth: 1,
                    borderRadius: 14,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                  }}
                >
                  <MaterialIcons name="label-outline" size={13} color={colors.accent.primary} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary }}>
                    + Mark Profile (Engineer, Ministry...)
                  </Text>
                </Pressable>
              )}
            </View>

            {customer.entityType && customer.entityType !== "customer" && (
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: colors.accent.primary + "18",
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                  marginTop: 6,
                  borderWidth: 1,
                  borderColor: colors.accent.primary + "40",
                }}
                onPress={handleOpenSystemProfile}
              >
                <MaterialIcons
                  name={customer.entityType === "worker" ? "groups" : customer.entityType === "supplier" ? "perm-contact-calendar" : "local-shipping"}
                  size={14}
                  color={colors.accent.primary}
                />
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary }}>
                  View {customer.entityType === "worker" ? "Worker" : customer.entityType === "supplier" ? "Supplier" : "Delivery Partner"} Profile ↗
                </Text>
              </Pressable>
            )}
            {(() => {
              const numbers = customer.phoneNumbers && customer.phoneNumbers.length > 0 
                ? customer.phoneNumbers 
                : (customer.phone ? [customer.phone] : []);
              
              if (numbers.length > 0) {
                return (
                  <View style={{ gap: 6, alignItems: "center", marginTop: 4 }}>
                    {numbers.map((phoneNum: string, index: number) => (
                      <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Pressable 
                          style={styles.phoneRow} 
                          onPress={() => {
                            if (phoneNum) Linking.openURL(`tel:${phoneNum}`);
                          }}
                        >
                          <MaterialIcons name="phone" size={16} color={colors.accent.success} />
                          <Text selectable={true} style={styles.profilePhone}>{phoneNum}</Text>
                        </Pressable>
                        {index === 0 && (
                          <Pressable 
                            style={{ padding: 4, borderRadius: 12, backgroundColor: colors.accent.primary + "15" }}
                            onPress={handleOpenEditProfile}
                          >
                            <MaterialIcons name="add" size={16} color={colors.accent.primary} />
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </View>
                );
              } else {
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <Text style={styles.noPhoneText}>No contact number recorded</Text>
                    <Pressable 
                      style={{ padding: 4, borderRadius: 12, backgroundColor: colors.accent.primary + "15" }}
                      onPress={handleOpenEditProfile}
                    >
                      <MaterialIcons name="add" size={16} color={colors.accent.primary} />
                    </Pressable>
                  </View>
                );
              }
            })()}

            {/* Last/Next Due Date display */}
            {lastDueDate ? (
              <View style={[
                styles.lastDueBadgeRow, 
                getDueDateStatus(lastDueDate) === "Overdue" ? styles.lastDueOverdue : 
                lastDueDate.status === "Completed" ? styles.lastDueCompleted : styles.lastDuePending
              ]}>
                <MaterialIcons 
                  name={getDueDateStatus(lastDueDate) === "Overdue" ? "error-outline" : 
                        lastDueDate.status === "Completed" ? "check-circle" : "event"} 
                  size={14} 
                  color={
                    getDueDateStatus(lastDueDate) === "Overdue" ? "#991b1b" : 
                    lastDueDate.status === "Completed" ? "#166534" : "#c2410c"
                  } 
                />
                <Text style={[
                  styles.lastDueBadgeText, 
                  { 
                    color: getDueDateStatus(lastDueDate) === "Overdue" ? "#991b1b" : 
                           lastDueDate.status === "Completed" ? "#166534" : "#c2410c"
                  }
                ]}>
                  {getDueDateStatus(lastDueDate) === "Overdue" ? "Overdue: " : 
                   lastDueDate.status === "Completed" ? "Last Due (Paid): " : "Next Due: "}
                  {formatDueDate(lastDueDate.date)}
                </Text>
              </View>
            ) : (
              <View style={[styles.lastDueBadgeRow, styles.lastDueNone]}>
                <MaterialIcons name="event-busy" size={14} color={colors.text.muted} />
                <Text style={[styles.lastDueBadgeText, { color: colors.text.muted }]}>
                  No Due Dates Scheduled
                </Text>
              </View>
            )}

            {/* Quick Add Due Date button */}
            <Pressable
              style={styles.quickAddDueBtn}
              onPress={openAddForm}
            >
              <MaterialIcons name="add-alarm" size={14} color={colors.accent.primary} />
              <Text style={styles.quickAddDueBtnText}>Add Due Date</Text>
            </Pressable>

            {/* Special Customer Selection Checkbox */}
            <Pressable
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 12,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: customer.isSpecial ? "#F59E0B15" : colors.bg.primary,
                borderWidth: 1,
                borderColor: customer.isSpecial ? "#F59E0B40" : colors.border.medium,
                alignSelf: "center",
              }}
              onPress={async () => {
                const newValue = !customer.isSpecial;
                const success = await updateCustomerDetails(customer.id, {
                  isSpecial: newValue,
                });
                if (!success) {
                  Alert.alert("Error", "Failed to update special customer status.");
                }
              }}
            >
              <MaterialIcons
                name={customer.isSpecial ? "check-box" : "check-box-outline-blank"}
                size={20}
                color={customer.isSpecial ? "#D97706" : colors.text.muted}
              />
              <Text style={{
                fontSize: 13,
                fontWeight: "600",
                color: customer.isSpecial ? "#D97706" : colors.text.secondary,
              }}>
                Special Customer Selection
              </Text>
            </Pressable>

            {/* Receive Payment & Balance Discount Button */}
            <Pressable
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 14,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 12,
                backgroundColor: colors.accent.success,
                width: "100%",
                shadowColor: colors.accent.success,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 3,
              }}
              onPress={openPayModal}
            >
              <MaterialIcons name="account-balance-wallet" size={20} color="#FFFFFF" />
              <Text style={{ fontSize: 13.5, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 }}>
                Receive Payment & Balance Discount
              </Text>
            </Pressable>

            {/* Share Account Statement Button */}
            <Pressable
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 8,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 12,
                backgroundColor: colors.accent.primary,
                width: "100%",
              }}
              onPress={() => setCustomerShareModalVisible(true)}
            >
              <MaterialIcons name="share" size={18} color="#FFFFFF" />
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>
                Share Account Statement (WhatsApp / PDF)
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Business Metrics Grid */}
        <View style={styles.metricsGrid}>
          <Pressable style={styles.metricCard} onPress={openPayModal}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.metricLabel}>Pending Balance</Text>
              <MaterialIcons name="add-circle-outline" size={14} color={colors.accent.primary} />
            </View>
            <Text style={[styles.metricValue, Number(customer.balance) > 0 && { color: "#EF4444" }]}>
              ₹{Number(customer.balance || 0).toLocaleString("en-IN")}
            </Text>
            <Text style={{ fontSize: 9.5, fontWeight: "700", color: colors.accent.primary, marginTop: 2 }}>
              + Pay / Discount ↗
            </Text>
          </Pressable>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Invoices</Text>
            <Text style={styles.metricValue}>{customerOrders.length}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Spent</Text>
            <Text style={[styles.metricValue, { color: colors.accent.success }]}>
              ₹{totalSpent.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>

        {/* Meta Info */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border.subtle, paddingBottom: 8, marginBottom: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>Client Profile Info</Text>
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: colors.accent.primary + "15" }}
              onPress={handleOpenEditProfile}
            >
              <MaterialIcons name="edit" size={14} color={colors.accent.primary} style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent.primary }}>Edit Profile</Text>
            </Pressable>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={styles.infoVal}>{customer.address || "No address entered"}</Text>
          </View>
          <View style={[styles.infoBlock, { borderBottomWidth: 1 }]}>
            <Text style={styles.infoLabel}>Profile Markings</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 }}>
                {(customer.profileMarkings && customer.profileMarkings.length > 0) ? (
                  customer.profileMarkings.map((tag: string) => {
                    const cfg = getMarkingConfig(tag, theme.isDark);
                    return (
                      <View
                        key={tag}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          backgroundColor: cfg.bg,
                          borderColor: cfg.border,
                          borderWidth: 1,
                          borderRadius: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <MaterialIcons name={cfg.icon} size={12} color={cfg.color} />
                        <Text style={{ fontSize: 11, fontWeight: "700", color: cfg.color }}>{tag}</Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.infoVal}>No profile markings assigned</Text>
                )}
              </View>
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: colors.accent.primary + "15" }}
                onPress={handleOpenMarkingModal}
              >
                <MaterialIcons name="edit" size={13} color={colors.accent.primary} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.accent.primary }}>Change</Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.infoBlock, { borderBottomWidth: 1 }]}>
            <Text style={styles.infoLabel}>Notes / Terms</Text>
            <Text style={styles.infoVal}>{customer.notes || "No notes on this client"}</Text>
          </View>
          <View style={[styles.infoBlock, { borderBottomWidth: 1 }]}>
            <Text style={styles.infoLabel}>Assigned Money Collector</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.infoVal}>
                {customer.collectorName || "No Collector Assigned"}
              </Text>
              <Pressable
                style={styles.changeCollectorBtn}
                onPress={() => setIsCollectorModalOpen(true)}
              >
                <MaterialIcons name="edit" size={14} color={colors.accent.primary} />
                <Text style={styles.changeCollectorBtnText}>Change</Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.infoBlock, { borderBottomWidth: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
            <View style={{ flex: 1, marginRight: 16 }}>
              <Text style={styles.infoLabel}>Due Date Alert Notifications</Text>
              <Text style={styles.toggleRowInlineDesc}>
                {customer.dueAlertsEnabled !== false 
                  ? "Alerts enabled for this client's due dates" 
                  : "Alerts disabled for this client"}
              </Text>
            </View>
            <Switch
              value={customer.dueAlertsEnabled !== false}
              onValueChange={async (newValue) => {
                const success = await updateCustomerDueAlerts(customer.id, newValue);
                if (!success) {
                  Alert.alert("Error", "Failed to update notification settings.");
                }
              }}
              trackColor={{ false: colors.border.medium, true: "#6C5CE740" }}
              thumbColor={customer.dueAlertsEnabled !== false ? "#6C5CE7" : colors.text.muted}
            />
          </View>
        </View>

        {/* Payment Due Dates */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
              Scheduled Due Dates
            </Text>
            <Pressable style={styles.addDueBtn} onPress={openAddForm}>
              <MaterialIcons name="add" size={16} color={colors.bg.card} />
              <Text style={styles.addDueBtnText}>Add Due Date</Text>
            </Pressable>
          </View>
          
          {/* Add Due Date Form */}
          {showAddForm && (
            <View style={styles.addDueForm}>
              <Text style={styles.formLabel}>Target Due Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.formInput}
                value={dueDateStr}
                onChangeText={setDueDateStr}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.text.muted}
              />
              
              {/* Presets */}
              <View style={styles.presetsRow}>
                <Pressable style={styles.presetBtn} onPress={() => setDateOffset(3)}>
                  <Text style={styles.presetText}>+3 Days</Text>
                </Pressable>
                <Pressable style={styles.presetBtn} onPress={() => setDateOffset(7)}>
                  <Text style={styles.presetText}>+1 Week</Text>
                </Pressable>
                <Pressable style={styles.presetBtn} onPress={() => setDateOffset(14)}>
                  <Text style={styles.presetText}>+2 Weeks</Text>
                </Pressable>
                <Pressable style={styles.presetBtn} onPress={() => setDateOffset(30)}>
                  <Text style={styles.presetText}>+30 Days</Text>
                </Pressable>
              </View>

              <Text style={styles.formLabel}>Notes / Purpose</Text>
              <TextInput
                style={styles.formInput}
                value={dueNotes}
                onChangeText={setDueNotes}
                placeholder="e.g. Balance for block delivery"
                placeholderTextColor={colors.text.muted}
              />

              <View style={styles.formActions}>
                <Pressable 
                  style={[styles.formActionBtn, styles.cancelBtn]} 
                  onPress={() => setShowAddForm(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={[styles.formActionBtn, styles.saveBtn]} 
                  onPress={handleAddDueDate}
                  disabled={savingDueDate}
                >
                  {savingDueDate ? (
                    <ActivityIndicator size="small" color={colors.bg.card} />
                  ) : (
                    <Text style={styles.saveBtnText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {/* Due Dates List */}
          {(!customer.dueDates || customer.dueDates.length === 0) ? (
            <Text style={styles.emptyText}>No due dates scheduled for this client.</Text>
          ) : (
            <View style={styles.dueDatesList}>
              {[...customer.dueDates]
                .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((item: any) => {
                  const status = getDueDateStatus(item);
                  let statusBg = "#fff7ed";
                  let statusText = "#c2410c";
                  let statusLabel = "Pending";
                  
                  if (status === "Completed") {
                    statusBg = "#f0fdf4";
                    statusText = "#166534";
                    statusLabel = "Completed";
                  } else if (status === "Cancelled") {
                    statusBg = "#f3f4f6";
                    statusText = "#6b7280";
                    statusLabel = "Cancelled";
                  } else if (status === "Overdue") {
                    statusBg = "#fef2f2";
                    statusText = "#991b1b";
                    statusLabel = "Overdue";
                  }

                  return (
                    <View key={item.id} style={styles.dueDateRow}>
                      <View style={styles.dueRowLeft}>
                        <View style={styles.dueHeaderRow}>
                          <Text style={styles.dueDateText}>
                            {formatDueDate(item.date)}
                          </Text>
                          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                            <Text style={[styles.statusBadgeText, { color: statusText }]}>
                              {statusLabel}
                            </Text>
                          </View>
                        </View>
                        {item.notes ? (
                          <Text style={styles.dueNotesText}>{item.notes}</Text>
                        ) : null}
                      </View>
                      
                      <View style={styles.dueRowRight}>
                        <Pressable 
                          style={styles.dueActionBtn} 
                          onPress={() => handleToggleDueDateStatus(item)}
                        >
                          <MaterialIcons 
                            name={item.status === "Completed" ? "check-circle" : "radio-button-unchecked"} 
                            size={22} 
                            color={item.status === "Completed" ? "#00D68F" : colors.text.muted} 
                          />
                        </Pressable>
                        <Pressable 
                          style={styles.dueActionBtn} 
                          onPress={() => handleDeleteDueDate(item)}
                        >
                          <MaterialIcons name="delete-outline" size={22} color="#EF4444" />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
            </View>
          )}
        </View>

        {/* Global Filter Bar */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MaterialIcons name="filter-list" size={18} color={colors.accent.primary} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Filter Period & View
              </Text>
            </View>
            {(dateFilter !== "all" || itemSearchQuery !== "" || ledgerTypeFilter !== "all") && (
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: colors.accent.danger + "15" }}
                onPress={() => {
                  setDateFilter("all");
                  setStartDate(null);
                  setEndDate(null);
                  setItemSearchQuery("");
                  setLedgerTypeFilter("all");
                }}
              >
                <MaterialIcons name="refresh" size={13} color={colors.accent.danger} />
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.accent.danger }}>Reset</Text>
              </Pressable>
            )}
          </View>

          {/* Date Presets Row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {[
              { id: "all", label: "All Time" },
              { id: "this_month", label: "This Month" },
              { id: "last_30", label: "Last 30 Days" },
              { id: "this_year", label: "This Year" },
              { id: "custom", label: "Custom Range" },
            ].map((p) => {
              const active = dateFilter === p.id;
              return (
                <Pressable
                  key={p.id}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 20,
                    backgroundColor: active ? colors.accent.primary : colors.bg.primary,
                    borderWidth: 1,
                    borderColor: active ? colors.accent.primary : colors.border.medium,
                  }}
                  onPress={() => setDateFilter(p.id as any)}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: "600", color: active ? "#FFFFFF" : colors.text.secondary }}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Custom Date Range Selectors */}
          {dateFilter === "custom" && (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center" }}>
              <Pressable
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.bg.primary,
                  borderWidth: 1,
                  borderColor: colors.border.medium,
                }}
                onPress={() => setIsSelectingStartDate(true)}
              >
                <MaterialIcons name="event" size={16} color={colors.accent.primary} style={{ marginRight: 6 }} />
                <View>
                  <Text style={{ fontSize: 8.5, color: colors.text.muted, fontWeight: "700", textTransform: "uppercase" }}>From Date</Text>
                  <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.text.primary }}>
                    {startDate ? startDate.toLocaleDateString("en-IN") : "Select Start"}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.bg.primary,
                  borderWidth: 1,
                  borderColor: colors.border.medium,
                }}
                onPress={() => setIsSelectingEndDate(true)}
              >
                <MaterialIcons name="event" size={16} color={colors.accent.primary} style={{ marginRight: 6 }} />
                <View>
                  <Text style={{ fontSize: 8.5, color: colors.text.muted, fontWeight: "700", textTransform: "uppercase" }}>To Date</Text>
                  <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.text.primary }}>
                    {endDate ? endDate.toLocaleDateString("en-IN") : "Select End"}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}
        </View>

        {/* Item Wise Total Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
              Item-Wise Purchase Totals
            </Text>
            <View style={{ backgroundColor: colors.accent.primary + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary }}>
                {itemWiseTotals.length} {itemWiseTotals.length === 1 ? "Item" : "Items"}
              </Text>
            </View>
          </View>

          {/* Item Search Input */}
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bg.primary, borderRadius: 8, borderWidth: 1, borderColor: colors.border.medium, paddingHorizontal: 10, marginBottom: 12 }}>
            <MaterialIcons name="search" size={18} color={colors.text.muted} style={{ marginRight: 6 }} />
            <TextInput
              value={itemSearchQuery}
              onChangeText={setItemSearchQuery}
              placeholder="Search item by name..."
              placeholderTextColor={colors.text.muted}
              style={{ flex: 1, paddingVertical: 6, fontSize: 12, color: colors.text.primary }}
            />
            {itemSearchQuery !== "" && (
              <Pressable onPress={() => setItemSearchQuery("")} style={{ padding: 4 }}>
                <MaterialIcons name="cancel" size={16} color={colors.text.muted} />
              </Pressable>
            )}
          </View>

          {itemWiseTotals.length === 0 ? (
            <Text style={styles.emptyText}>No item purchase history matches the selected filters.</Text>
          ) : (
            <View style={styles.ledgerTable}>
              {/* Header row */}
              <View style={styles.ledgerHeaderRow}>
                <Text style={[styles.ledgerHeaderCell, { flex: 2.5 }]}>Item Name</Text>
                <Text style={[styles.ledgerHeaderCell, { flex: 1.5, textAlign: "right" }]}>Total Qty</Text>
                <Text style={[styles.ledgerHeaderCell, { flex: 1.8, textAlign: "right" }]}>Total Amount</Text>
              </View>

              {/* Data rows */}
              {itemWiseTotals.map((item, idx) => (
                <View key={item.itemId || idx} style={styles.ledgerRow}>
                  <View style={{ flex: 2.5 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.text.primary }}>
                      {item.itemName}
                    </Text>
                    {item.rateType ? (
                      <Text style={{ fontSize: 9.5, color: colors.text.muted, marginTop: 1 }}>
                        Rate Unit: {item.rateType}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.ledgerCell, { flex: 1.5, textAlign: "right", fontWeight: "600", color: colors.text.primary }]}>
                    {item.totalQuantity.toLocaleString("en-IN")}
                  </Text>
                  <Text style={[styles.ledgerCell, { flex: 1.8, textAlign: "right", fontWeight: "700", color: colors.accent.success }]}>
                    ₹{item.totalAmount.toLocaleString("en-IN")}
                  </Text>
                </View>
              ))}

              {/* Grand Total Row */}
              <View style={[styles.ledgerRow, { backgroundColor: colors.bg.primary, borderBottomWidth: 0, paddingTop: 10, paddingBottom: 10, marginTop: 4, borderRadius: 6 }]}>
                <Text style={{ flex: 2.5, fontSize: 12, fontWeight: "800", color: colors.text.primary, textTransform: "uppercase" }}>
                  Grand Total
                </Text>
                <Text style={[styles.ledgerCell, { flex: 1.5, textAlign: "right", fontWeight: "800", color: colors.text.primary }]}>
                  {itemWiseOverall.totalQty.toLocaleString("en-IN")}
                </Text>
                <Text style={[styles.ledgerCell, { flex: 1.8, textAlign: "right", fontWeight: "800", color: colors.accent.success }]}>
                  ₹{itemWiseOverall.totalAmt.toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Customer Ledger Section */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border.subtle, paddingBottom: 8, marginBottom: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Customer Transaction Ledger
            </Text>
            <Pressable
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 6,
                backgroundColor: colors.accent.primary + "15",
                borderWidth: 1,
                borderColor: colors.accent.primary + "30",
              }}
              onPress={() => setLedgerSortOrder(ledgerSortOrder === "desc" ? "asc" : "desc")}
            >
              <MaterialIcons
                name={ledgerSortOrder === "desc" ? "arrow-upward" : "arrow-downward"}
                size={14}
                color={colors.accent.primary}
              />
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary }}>
                {ledgerSortOrder === "desc" ? "Newest First ⬆" : "Oldest First ⬇"}
              </Text>
            </Pressable>
          </View>

          {/* Daily Calculation Overview KPI Cards */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <View style={{ flex: 1, backgroundColor: colors.bg.primary, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle }}>
              <Text style={{ fontSize: 9.5, fontWeight: "700", color: colors.text.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>
                First Orders Total
              </Text>
              <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.accent.primary, marginTop: 3 }}>
                ₹{dailyMetricsOverall.totalFirstOrders.toLocaleString("en-IN")}
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.bg.primary, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle }}>
              <Text style={{ fontSize: 9.5, fontWeight: "700", color: colors.text.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>
                Payments Rec.
              </Text>
              <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.accent.success, marginTop: 3 }}>
                ₹{dailyMetricsOverall.totalPaymentsRec.toLocaleString("en-IN")}
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.bg.primary, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle }}>
              <Text style={{ fontSize: 9.5, fontWeight: "700", color: colors.text.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>
                Last Amount (Closing)
              </Text>
              <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.accent.danger, marginTop: 3 }}>
                ₹{dailyMetricsOverall.latestLastAmount.toLocaleString("en-IN")}
              </Text>
            </View>
          </View>

          {/* Mode Switcher & Type Filter Tabs */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {/* View Mode Toggle (All Transactions vs Daily Breakdown) */}
            <View style={{ flexDirection: "row", backgroundColor: colors.bg.primary, padding: 2, borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle }}>
              <Pressable
                style={{
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  backgroundColor: ledgerViewMode === "all" ? colors.accent.primary : "transparent",
                }}
                onPress={() => setLedgerViewMode("all")}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: ledgerViewMode === "all" ? "#FFFFFF" : colors.text.secondary }}>
                  All Entries
                </Text>
              </Pressable>
              <Pressable
                style={{
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  backgroundColor: ledgerViewMode === "daily" ? colors.accent.primary : "transparent",
                }}
                onPress={() => setLedgerViewMode("daily")}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: ledgerViewMode === "daily" ? "#FFFFFF" : colors.text.secondary }}>
                  📊 Daily Breakdown
                </Text>
              </Pressable>
            </View>

            {/* Type Filter Tabs */}
            {ledgerViewMode === "all" && (
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[
                  { id: "all", label: "All Types" },
                  { id: "order", label: "Invoices" },
                  { id: "payment", label: "Payments" },
                ].map((tab) => {
                  const active = ledgerTypeFilter === tab.id;
                  return (
                    <Pressable
                      key={tab.id}
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 10,
                        borderRadius: 6,
                        backgroundColor: active ? colors.accent.primary + "20" : colors.bg.primary,
                        borderWidth: 1,
                        borderColor: active ? colors.accent.primary : colors.border.subtle,
                      }}
                      onPress={() => setLedgerTypeFilter(tab.id as any)}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "600", color: active ? colors.accent.primary : colors.text.secondary }}>
                        {tab.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {ledgerViewMode === "daily" ? (
            /* Daily Breakdown Mode */
            displayDailySummary.length === 0 ? (
              <Text style={styles.emptyText}>No daily data recorded matching the selected date filters.</Text>
            ) : (
              <View style={styles.ledgerTable}>
                {/* Header row */}
                <View style={styles.ledgerHeaderRow}>
                  <Text style={[styles.ledgerHeaderCell, { flex: 1.5 }]}>Date</Text>
                  <Text style={[styles.ledgerHeaderCell, { flex: 2, textAlign: "right" }]}>First Orders</Text>
                  <Text style={[styles.ledgerHeaderCell, { flex: 1.8, textAlign: "right" }]}>Payments</Text>
                  <Text style={[styles.ledgerHeaderCell, { flex: 2, textAlign: "right" }]}>Last Amount</Text>
                </View>

                {/* Daily rows */}
                {displayDailySummary.map((day: any) => (
                  <View
                    key={day.dateKey}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border.subtle,
                    }}
                  >
                    <View style={{ flex: 1.5 }}>
                      <Text style={{ fontSize: 11.5, fontWeight: "700", color: colors.text.primary }}>
                        {day.formattedDate}
                      </Text>
                      {day.orderCount > 0 && (
                        <Text style={{ fontSize: 9, color: colors.text.muted, marginTop: 1 }}>
                          📦 {day.orderCount} {day.orderCount === 1 ? "order" : "orders"}
                        </Text>
                      )}
                    </View>
                    <Text style={{ flex: 2, textAlign: "right", fontSize: 11.5, fontWeight: "700", color: day.firstOrders > 0 ? colors.accent.primary : colors.text.muted }}>
                      {day.firstOrders > 0 ? `₹${day.firstOrders.toLocaleString("en-IN")}` : "—"}
                    </Text>
                    <Text style={{ flex: 1.8, textAlign: "right", fontSize: 11.5, fontWeight: "700", color: day.totalPayments > 0 ? colors.accent.success : colors.text.muted }}>
                      {day.totalPayments > 0 ? `₹${day.totalPayments.toLocaleString("en-IN")}` : "—"}
                    </Text>
                    <Text style={{ flex: 2, textAlign: "right", fontSize: 12, fontWeight: "800", color: colors.accent.danger }}>
                      ₹{day.lastAmount.toLocaleString("en-IN")}
                    </Text>
                  </View>
                ))}
              </View>
            )
          ) : (
            /* All Transactions Mode */
            displayLedgerEntries.length === 0 ? (
              <Text style={styles.emptyText}>No transactions recorded matching the selected filters.</Text>
            ) : (
              <View style={styles.ledgerTable}>
                {/* Header row */}
                <View style={styles.ledgerHeaderRow}>
                  <Text style={[styles.ledgerHeaderCell, { flex: 1.4 }]}>Date</Text>
                  <Text style={[styles.ledgerHeaderCell, { flex: 2.2 }]}>Details</Text>
                  <Text style={[styles.ledgerHeaderCell, { flex: 1.5, textAlign: "right" }]}>Order Amt</Text>
                  <Text style={[styles.ledgerHeaderCell, { flex: 1.5, textAlign: "right" }]}>Payment</Text>
                  <Text style={[styles.ledgerHeaderCell, { flex: 1.5, textAlign: "right" }]}>Balance</Text>
                </View>

                {/* Data rows with Daily Headers */}
                {displayLedgerEntries.map((entry: any, index: number) => {
                  const d = entry.date ? (entry.date instanceof Date ? entry.date : new Date(entry.date)) : null;
                  const dateKey = d && !isNaN(d.getTime())
                    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                    : "";

                  let showDayHeader = false;
                  if (dateKey) {
                    if (index === 0) {
                      showDayHeader = true;
                    } else {
                      const prevEntry = displayLedgerEntries[index - 1];
                      const prevD = prevEntry?.date ? (prevEntry.date instanceof Date ? prevEntry.date : new Date(prevEntry.date)) : null;
                      const prevKey = prevD && !isNaN(prevD.getTime())
                        ? `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}-${String(prevD.getDate()).padStart(2, '0')}`
                        : "";
                      if (dateKey !== prevKey) {
                        showDayHeader = true;
                      }
                    }
                  }

                  const daySummary = showDayHeader ? dailyLedgerSummary.find((s: any) => s.dateKey === dateKey) : null;

                  return (
                    <React.Fragment key={entry.id || index}>
                      {showDayHeader && daySummary && (
                        <View
                          style={{
                            backgroundColor: colors.bg.primary,
                            borderColor: colors.accent.primary + "30",
                            borderWidth: 1,
                            borderRadius: 6,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            marginTop: index === 0 ? 4 : 10,
                            marginBottom: 4,
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <MaterialIcons name="event" size={14} color={colors.accent.primary} />
                            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.primary }}>
                              {daySummary.formattedDate}
                            </Text>
                            {daySummary.orderCount > 0 && (
                              <View style={{ backgroundColor: colors.accent.primary + "18", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 }}>
                                <Text style={{ fontSize: 9, fontWeight: "700", color: colors.accent.primary }}>
                                  {daySummary.orderCount} {daySummary.orderCount === 1 ? "order" : "orders"}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <Text style={{ fontSize: 10, color: colors.text.muted }}>
                              First Orders: <Text style={{ fontWeight: "700", color: colors.text.primary }}>₹{daySummary.firstOrders.toLocaleString("en-IN")}</Text>
                            </Text>
                            <Text style={{ fontSize: 10, color: colors.text.muted }}>
                              Last Amt: <Text style={{ fontWeight: "800", color: colors.accent.danger }}>₹{daySummary.lastAmount.toLocaleString("en-IN")}</Text>
                            </Text>
                          </View>
                        </View>
                      )}
                      <LedgerItemCard
                        entry={entry}
                        colors={colors}
                        onPress={handleOpenEditLedger}
                        onOpenEditProfile={handleOpenEditProfile}
                      />
                    </React.Fragment>
                  );
                })}
              </View>
            )
          )}
        </View>
      </ScrollView>

      {/* Collector Select Modal */}
      <Modal
        visible={isCollectorModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsCollectorModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setIsCollectorModalOpen(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Money Collector</Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsCollectorModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            {updatingCollector ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={colors.accent.primary} />
                <Text style={styles.modalLoadingText}>Assigning collector...</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                {/* List Option to Unassign Collector */}
                <Pressable
                  style={[
                    styles.collectorRow,
                    !customer.collectorId && styles.selectedCollectorRow,
                  ]}
                  onPress={() => handleAssignCollector(null)}
                >
                  <View style={styles.collectorInfo}>
                    <View style={[styles.collectorAvatar, { backgroundColor: colors.border.subtle }]}>
                      <MaterialIcons name="person-off" size={20} color={colors.text.muted} />
                    </View>
                    <Text style={[styles.collectorName, !customer.collectorId && styles.selectedCollectorName]}>
                      Unassigned (No Collector)
                    </Text>
                  </View>
                  {!customer.collectorId && (
                    <MaterialIcons name="check" size={20} color={colors.accent.primary} />
                  )}
                </Pressable>

                {/* List available collectors */}
                {collectors.length === 0 ? (
                  <View style={styles.emptyCollectors}>
                    <Text style={styles.emptyCollectorsText}>No money collectors registered in settings.</Text>
                  </View>
                ) : (
                  collectors.map((col: any) => {
                    const isSelected = customer.collectorId === col.id;
                    return (
                      <Pressable
                        key={col.id}
                        style={[
                          styles.collectorRow,
                          isSelected && styles.selectedCollectorRow,
                        ]}
                        onPress={() => handleAssignCollector(col)}
                      >
                        <View style={styles.collectorInfo}>
                          <View style={[styles.collectorAvatar, { backgroundColor: "#6C5CE720" }]}>
                            <Text style={styles.collectorInitials}>
                              {col.name?.substring(0, 2).toUpperCase() || "MC"}
                            </Text>
                          </View>
                          <Text style={[styles.collectorName, isSelected && styles.selectedCollectorName]}>
                            {col.name}
                          </Text>
                        </View>
                        {isSelected && (
                          <MaterialIcons name="check" size={20} color={colors.accent.primary} />
                        )}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {renderEditLedgerModal()}
      {renderLedgerCalendarPicker()}
      {renderEditProfileModal()}
      {renderMarkingModal()}
      {renderPayModal()}
      <EasyCalendarModal
        visible={isSelectingStartDate}
        date={startDate || new Date()}
        onSelectDate={(selectedDate) => {
          setStartDate(selectedDate);
          setIsSelectingStartDate(false);
        }}
        onClose={() => setIsSelectingStartDate(false)}
        title="Select Start Date"
      />
      <EasyCalendarModal
        visible={isSelectingEndDate}
        date={endDate || new Date()}
        onSelectDate={(selectedDate) => {
          setEndDate(selectedDate);
          setIsSelectingEndDate(false);
        }}
        onClose={() => setIsSelectingEndDate(false)}
        title="Select End Date"
      />
      <TransactionShareBottomSheet
        visible={shareBottomSheetVisible}
        transaction={sharingTransactionData}
        isDark={theme.isDark}
        onClose={() => setShareBottomSheetVisible(false)}
      />
      {customerShareData && (
        <CustomerShareBottomSheet
          visible={customerShareModalVisible}
          onClose={() => setCustomerShareModalVisible(false)}
          customerData={customerShareData}
          company={companyInfo}
          isDark={theme.isDark}
        />
      )}
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
    paddingBottom: 40,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg.primary,
    padding: 24,
  },
  errorText: {
    color: colors.text.muted,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
  },
  backBtn: {
    marginTop: 20,
    backgroundColor: "#3b82f6",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  backBtnText: {
    color: colors.bg.card,
    fontWeight: "700",
  },
  header: {
    marginBottom: 20,
  },
  backNav: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  backNavText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.secondary,
    marginLeft: 6,
  },
  profileSummary: {
    alignItems: "center",
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#6C5CE720",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#6C5CE740",
    marginBottom: 12,
  },
  avatarText: {
    color: "#0369a1",
    fontSize: 20,
    fontWeight: "700",
  },
  profileName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 6,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0fdf4",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  profilePhone: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "700",
  },
  noPhoneText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "600",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: "600",
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  section: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    paddingBottom: 8,
  },
  infoBlock: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  infoLabel: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  infoVal: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "center",
    color: colors.text.muted,
    fontSize: 13,
    paddingVertical: 12,
  },
  ledgerTable: {
    marginTop: 6,
  },
  ledgerHeaderRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border.medium,
    backgroundColor: colors.bg.primary,
  },
  ledgerHeaderCell: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text.muted,
    textTransform: "uppercase",
  },
  ledgerRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    alignItems: "flex-start",
  },
  ledgerCell: {
    fontSize: 12,
    color: colors.text.primary,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    paddingBottom: 8,
  },
  addDueBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3b82f6",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  addDueBtnText: {
    color: colors.bg.card,
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 2,
  },
  addDueForm: {
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text.muted,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    color: colors.text.primary,
    marginBottom: 10,
  },
  presetsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  presetBtn: {
    backgroundColor: "#6C5CE720",
    borderWidth: 1,
    borderColor: "#6C5CE740",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  presetText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.accent.primary,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  formActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
  },
  cancelBtn: {
    backgroundColor: colors.border.subtle,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  cancelBtnText: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: "#3b82f6",
  },
  saveBtnText: {
    color: colors.bg.card,
    fontSize: 12,
    fontWeight: "700",
  },
  dueDatesList: {
    marginTop: 4,
  },
  dueDateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  dueRowLeft: {
    flex: 1,
    marginRight: 12,
  },
  dueHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dueDateText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  dueNotesText: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
  },
  dueRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dueActionBtn: {
    padding: 6,
    borderRadius: 6,
  },
  lastDueBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginTop: 8,
  },
  lastDueOverdue: {
    backgroundColor: "#fef2f2",
  },
  lastDueCompleted: {
    backgroundColor: "#f0fdf4",
  },
  lastDuePending: {
    backgroundColor: "#fff7ed",
  },
  lastDueNone: {
    backgroundColor: colors.border.subtle,
  },
  lastDueBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  quickAddDueBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6C5CE720",
    borderWidth: 1.5,
    borderColor: "#6C5CE740",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
    marginTop: 10,
  },
  quickAddDueBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accent.primary,
  },
  toggleRowInlineDesc: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  changeCollectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6C5CE720",
    borderWidth: 1,
    borderColor: "#6C5CE740",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  changeCollectorBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accent.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
    zIndex: 1,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    minHeight: 300,
    backgroundColor: colors.bg.card,
    borderRadius: 20,
    padding: 20,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 10,
    zIndex: 10,
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
  modalLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  modalLoadingText: {
    marginTop: 12,
    color: colors.text.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  collectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    marginBottom: 10,
    backgroundColor: colors.bg.card,
  },
  selectedCollectorRow: {
    borderColor: "#6C5CE740",
    backgroundColor: "#6C5CE720",
  },
  collectorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  collectorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  collectorInitials: {
    color: "#0369a1",
    fontSize: 12,
    fontWeight: "700",
  },
  collectorName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  selectedCollectorName: {
    color: "#1e40af",
    fontWeight: "700",
  },
  emptyCollectors: {
    paddingVertical: 30,
    alignItems: "center",
  },
  emptyCollectorsText: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: "center",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text.muted,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text.primary,
    marginBottom: 10,
  },
  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 8,
    height: 42,
    paddingHorizontal: 12,
    backgroundColor: colors.bg.card,
    marginBottom: 12,
  },
  dateSelectorText: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: "500",
  },
  paymentMethodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  methodBtn: {
    minWidth: "22%",
    flexGrow: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.medium,
    backgroundColor: colors.bg.card,
    alignItems: "center",
    justifyContent: "center",
  },
  methodBtnActive: {
    backgroundColor: "#6C5CE720",
    borderColor: colors.accent.primary,
  },
  methodBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  methodBtnTextActive: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
  ledgerActionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    marginBottom: 10,
  },
  ledgerDeleteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent.danger,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  ledgerDeleteBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  ledgerSaveBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent.success,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  ledgerSaveBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
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
    backgroundColor: colors.accent.primary,
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
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  partnerCard: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.medium,
    backgroundColor: colors.bg.card,
  },
  partnerCardActive: {
    backgroundColor: "#6C5CE720",
    borderColor: colors.accent.primary,
  },
  partnerName: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  partnerNameActive: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
})
};
;
