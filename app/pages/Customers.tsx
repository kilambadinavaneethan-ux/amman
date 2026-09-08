import React, { useEffect, useState, useContext, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { CustomerContext } from "../context/CustomerContext";
import { CollectorContext } from "../context/CollectorContext";
import { PaymentContext } from "../context/PaymentContext";
import { WorkerContext } from "../context/WorkerContext";
import { RawMaterialSupplierContext } from "../context/RawMaterialSupplierContext";
import { DeliveryPartnerContext } from "../context/DeliveryPartnerContext";
import AnimatedPage from "../components/AnimatedPage";
import ContactsModal from "../components/ContactsModal";
import EasyCalendarModal from "../components/EasyCalendarModal";
import { useScrollRestoration } from "../context/ScrollContext";
import { PRESET_MARKINGS, getMarkingConfig, normalizeMarkings, useCustomMarkings } from "../../src/utils/markingUtils";

const AVATAR_COLORS = [
  "#00D68F",
  "#3B82F6",
  "#EF4444",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#10B981",
  "#06B6D4",
];

export default function Customers() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/customers");

  const {
    customers,
    totalCustomers,
    totalBalance,
    addCustomer,
    deleteCustomer,
    updateCustomerDueDates,
    toggleFavoriteCustomer,
  } = useContext(CustomerContext) as any;

  const { collectors } = useContext(CollectorContext) as any;
  const { addPayment } = useContext(PaymentContext) as any;
  const { workers } = useContext(WorkerContext) as any;
  const { suppliers } = useContext(RawMaterialSupplierContext) as any;
  const { partners } = useContext(DeliveryPartnerContext) as any;

  // Form states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [balance, setBalance] = useState("");
  const [selectedFormMarkings, setSelectedFormMarkings] = useState<string[]>([]);
  const [customFormMarking, setCustomFormMarking] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | "customer" | "worker" | "supplier" | "delivery_partner">("All");
  const [balanceFilter, setBalanceFilter] = useState("All"); // "All" | "Pending" | "Zero"
  const [collectorFilter, setCollectorFilter] = useState("All"); // "All" | "Unassigned" | "<collector_id>"
  const [markingFilter, setMarkingFilter] = useState("All"); // "All" | "Marked" | "<marking_label>"
  const [isSaving, setIsSaving] = useState(false);
  const [contactsVisible, setContactsVisible] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Due Date Modal states
  const [isDueModalOpen, setIsDueModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [dueDateStr, setDueDateStr] = useState("");
  const [dueNotes, setDueNotes] = useState("");
  const [savingDueDate, setSavingDueDate] = useState(false);

  // Payment Modal states
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDiscount, setPayDiscount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState<Date>(new Date());
  const [isPayCalendarOpen, setIsPayCalendarOpen] = useState<boolean>(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  // Summary Details Modal states
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [summarySearch, setSummarySearch] = useState("");
  const [summaryTypeFilter, setSummaryTypeFilter] = useState<"All" | "customer" | "worker" | "supplier" | "delivery_partner">("All");

  const openDueModal = (customer: any) => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    
    setDueDateStr(`${yyyy}-${mm}-${dd}`);
    setDueNotes("");
    setSelectedCustomer(customer);
    setIsDueModalOpen(true);
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
    if (!selectedCustomer) return;

    setSavingDueDate(true);
    const newDueDate = {
      id: `dd_${Date.now()}`,
      date: dueDateStr,
      notes: dueNotes.trim(),
      status: "Pending"
    };

    const currentDueDates = (selectedCustomer as any).dueDates || [];
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

    const success = await updateCustomerDueDates((selectedCustomer as any).id, updatedDueDates);
    setSavingDueDate(false);

    if (success) {
      setIsDueModalOpen(false);
      setDueNotes("");
      setSelectedCustomer(null);
    } else {
      Alert.alert("Error", "Could not save due date. Please try again.");
    }
  };

  const openPayModal = (customer: any) => {
    setSelectedCustomer(customer);
    const pending = Number(customer.totalPending !== undefined ? customer.totalPending : customer.balance || 0);
    setPayAmount(pending > 0 ? String(pending) : "");
    setPayDiscount("");
    setPayMethod("Cash");
    setPayNotes("");
    setPayDate(new Date());
    setIsPayModalOpen(true);
  };

  const handleSavePayment = async () => {
    if (!selectedCustomer || isSavingPayment) return;
    const amountNum = parseFloat(payAmount) || 0;
    const discountNum = parseFloat(payDiscount) || 0;
    if (amountNum <= 0 && discountNum <= 0) {
      Alert.alert("Invalid Entry", "Please enter a payment amount or a balance discount amount.");
      return;
    }
    if (amountNum < 0 || discountNum < 0) {
      Alert.alert("Invalid Entry", "Amounts cannot be negative.");
      return;
    }

    const customerPending = Number(
      (selectedCustomer as any).totalPending !== undefined
        ? (selectedCustomer as any).totalPending
        : (selectedCustomer as any).balance || 0
    );
    const totalReduction = amountNum + discountNum;
    if (totalReduction > customerPending && customerPending > 0) {
      Alert.alert(
        "Excessive Amount",
        `Total payment + discount (₹${totalReduction.toLocaleString("en-IN")}) cannot exceed customer's pending balance of ₹${customerPending.toLocaleString("en-IN")}.`
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
      customerId: (selectedCustomer as any).id,
      customerName: (selectedCustomer as any).name,
      amountReceived: amountNum,
      discountAmount: discountNum,
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
      setSelectedCustomer(null);
      Alert.alert("Success", "Payment & balance discount logged successfully.");
    } else {
      Alert.alert("Transaction Failed", "Could not complete payment transaction. Please try again.");
    }
  };

  // Automatically trigger contacts importer if query parameter `import=true` is present
  useEffect(() => {
    if (params.import === "true") {
setContactsVisible(true);
    }
  }, [params.import]);

  const handleAddCustomer = async () => {
    if (!name.trim()) {
      Alert.alert("Missing field", "Customer name is required.");
      return;
    }

    const balanceNum = balance.trim() === "" ? 0 : parseFloat(balance);
    if (isNaN(balanceNum)) {
      Alert.alert("Invalid balance", "Balance must be a number.");
      return;
    }

    const trimmedPhone = phone.trim();
    if (trimmedPhone) {
      const p1 = trimmedPhone.replace(/[^\d]/g, "");
      const duplicate = customers.find((c: any) => {
        const p2 = (c.phone || "").replace(/[^\d]/g, "");
        if (!p1 || !p2) return false;
        if (p1 === p2) return true;
        if (p1.length >= 10 && p2.length >= 10) {
          return p1.slice(-10) === p2.slice(-10);
        }
        return false;
      });

      if (duplicate) {
        Alert.alert(
          "Customer Exists",
          `A customer with this phone number is already registered under the name "${duplicate.name}".`
        );
        return;
      }
    }

    const newCustomer = {
      name: name.trim(),
      phone: trimmedPhone,
      address: address.trim(),
      notes: notes.trim(),
      balance: balanceNum,
      createdAt: new Date().toLocaleString(),
      profileMarkings: selectedFormMarkings,
      markingProfile: selectedFormMarkings[0] || "",
    };

    setIsSaving(true);
    const success = await addCustomer(newCustomer);
    setIsSaving(false);

    if (success) {
      setName("");
      setPhone("");
      setAddress("");
      setNotes("");
      setBalance("");
      setSelectedFormMarkings([]);
      setCustomFormMarking("");
      setShowAddForm(false);
    } else {
      Alert.alert("Error", "Could not sync new customer to Firestore.");
    }
  };

  const handleImportContact = (contact: { name: string; phone: string }) => {
    setName(contact.name);
    setPhone(contact.phone);
  };

  const handleDeleteCustomer = (id: string) => {
    Alert.alert("Delete customer", "Are you sure you want to delete this customer record?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteCustomer(id) },
    ]);
  };


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
    if (item.status === "Completed") return "Completed";
    if (item.status === "Cancelled") return "Cancelled";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parts = item.date.split("-");
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
    const code = name.charCodeAt(0) || 0;
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

    // 1. Process Workers first
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
        badgeColor: colors.accent.info,
        pendingWages,
        subInfo,
        originalData: w,
        isFavorite: !!w.isFavorite,
        isSpecial: !!w.isSpecial,
        dueDates: w.dueDates || [],
        collectorId: w.collectorId || null,
        collectorName: w.collectorName || null,
        profileMarkings: normalizeMarkings(w),
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
        badgeColor: colors.accent.warning,
        supplierBalance: suppBal,
        subInfo,
        originalData: s,
        isFavorite: !!s.isFavorite,
        isSpecial: !!s.isSpecial,
        dueDates: s.dueDates || [],
        collectorId: s.collectorId || null,
        collectorName: s.collectorName || null,
        profileMarkings: normalizeMarkings(s),
      });
    });

    // 3. Process Delivery Partners
    (partners || []).forEach((p: any) => {
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
        profileMarkings: normalizeMarkings(p),
      });
    });

    // 4. Process Standard Customers (skipping duplicates of Workers, Suppliers, and Delivery Partners)
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
        profileMarkings: normalizeMarkings(c),
      });
    });

    // Precompute sort keys for every unified record to achieve instantaneous sorting without O(N log N) date calculations
    result.forEach((item: any) => {
      let earliestDue: number | null = null;
      if (item.dueDates && Array.isArray(item.dueDates) && item.dueDates.length > 0) {
        for (let i = 0; i < item.dueDates.length; i++) {
          const d = item.dueDates[i];
          if (d && d.status !== "Completed" && d.status !== "Cancelled" && d.date) {
            const time = new Date(d.date).getTime();
            if (!isNaN(time)) {
              if (earliestDue === null || time < earliestDue) {
                earliestDue = time;
              }
            }
          }
        }
      }

      const bal = Number(item.displayBalance || 0);
      let tier = 4;
      if (earliestDue !== null) tier = 1;
      else if (item.isFavorite) tier = 2;
      else if (bal > 0) tier = 3;

      item._activeDueTimestamp = earliestDue;
      item._sortTier = tier;
    });

    return result;
  }, [customers, workers, suppliers, partners, colors]);

  const { allPresets: allMarkingPresets, addCustomMarking, removeCustomMarking } = useCustomMarkings(unifiedCustomers);

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
      const allPhones = (c.phoneNumbers && c.phoneNumbers.length > 0)
        ? c.phoneNumbers.join(', ')
        : (c.phone || "");
      const phoneStr = allPhones ? ` - ${allPhones}` : "";
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

  const filteredCustomers = useMemo(() => {
    return (unifiedCustomers || []).filter((customer: any) => {
      // 0. Account Type filter
      if (typeFilter !== "All" && customer.entityType !== typeFilter) {
        return false;
      }

      // 1. Search filter
      const matchesSearch =
        !searchTerm ||
        (customer.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.phone || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.address || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.profileMarkings && customer.profileMarkings.some((m: string) => m.toLowerCase().includes(searchTerm.toLowerCase())));

      // 2. Balance & Status filter
      const pendingBalance = Number(customer.displayBalance || 0);
      let matchesBalance = true;
      if (balanceFilter === "Favorites") {
        matchesBalance = !!customer.isFavorite;
      } else if (balanceFilter === "Pending") {
        matchesBalance = pendingBalance > 0;
      } else if (balanceFilter === "Zero") {
        matchesBalance = pendingBalance === 0;
      }

      // 3. Collector filter
      let matchesCollector = true;
      if (collectorFilter === "Unassigned") {
        matchesCollector = !customer.collectorId;
      } else if (collectorFilter !== "All") {
        matchesCollector = customer.collectorId === collectorFilter;
      }

      // 4. Marking filter
      let matchesMarking = true;
      if (markingFilter === "Marked") {
        matchesMarking = customer.profileMarkings && customer.profileMarkings.length > 0;
      } else if (markingFilter !== "All") {
        matchesMarking = customer.profileMarkings && customer.profileMarkings.some((m: string) => m.toLowerCase() === markingFilter.toLowerCase());
      }

      return matchesSearch && matchesBalance && matchesCollector && matchesMarking;
    }).sort((a: any, b: any) => {
      if (a._sortTier !== b._sortTier) {
        return a._sortTier - b._sortTier;
      }

      const balA = Number(a.displayBalance || 0);
      const balB = Number(b.displayBalance || 0);

      if (a._sortTier === 1) {
        // Tier 1 (Due): Earliest due date first, then highest balance first, then name
        if (a._activeDueTimestamp !== b._activeDueTimestamp) {
          return (a._activeDueTimestamp || 0) - (b._activeDueTimestamp || 0);
        }
        if (balB !== balA) return balB - balA;
        return (a.name || "").localeCompare(b.name || "");
      }

      if (a._sortTier === 2 || a._sortTier === 3) {
        // Tier 2 (Star/Special) & Tier 3 (Balance Due): Highest balance first to lowest balance
        if (balB !== balA) return balB - balA;
        return (a.name || "").localeCompare(b.name || "");
      }

      // Tier 4 (Balance 0): Alphabetical order by name
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [unifiedCustomers, typeFilter, searchTerm, balanceFilter, collectorFilter, markingFilter]);

  return (
    <AnimatedPage>
      <ContactsModal
        visible={contactsVisible}
        onClose={() => setContactsVisible(false)}
        onSelectContact={handleImportContact}
      />

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.heading}>Clients Directory</Text>
            <Text style={styles.subheading} numberOfLines={1}>Manage customer accounts.</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable style={styles.addButton} onPress={() => setShowAddForm(!showAddForm)}>
              <MaterialIcons name={showAddForm ? "close" : "add"} size={16} color={colors.bg.card} />
              <Text style={styles.addButtonText}>{showAddForm ? "Close" : "New Client"}</Text>
            </Pressable>
            <Pressable style={styles.homeButton} onPress={() => router.push("/")}>
              <MaterialIcons name="dashboard" size={16} color={colors.bg.card} />
              <Text style={styles.homeButtonText}>Home</Text>
            </Pressable>
          </View>
        </View>

        {/* Add Customer Form */}
        {showAddForm && (
          <View style={styles.formSection}>
            <Text style={styles.sectionHeader}>Create Client Account</Text>

            {/* Import from Contacts Button */}
            <Pressable
              style={styles.importContactsBtn}
              onPress={() => setContactsVisible(true)}
              disabled={isSaving}
            >
              <MaterialIcons name="import-contacts" size={20} color={colors.accent.primary} />
              <Text style={styles.importContactsBtnText}>Import From Contacts</Text>
            </Pressable>

          <Text style={styles.label}>Customer Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter client's full name"
            placeholderTextColor={colors.text.muted}
          />

          <Text style={styles.label}>Mobile / Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. +91 9876543210"
            keyboardType="phone-pad"
            placeholderTextColor={colors.text.muted}
          />

          <View style={styles.flexRow}>
            <View style={{ flex: 1, marginRight: 6 }}>
              <Text style={styles.label}>Address (Optional)</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Billing address"
                placeholderTextColor={colors.text.muted}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text style={styles.label}>Pending Balance (₹)</Text>
              <TextInput
                style={styles.input}
                value={balance}
                onChangeText={setBalance}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor={colors.text.muted}
              />
            </View>
          </View>

          <Text style={styles.label}>Internal Notes (Optional)</Text>
          <TextInput
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add special terms, payment rules, etc."
            placeholderTextColor={colors.text.muted}
          />

          {/* Profile Marking Options in Add Form */}
          <Text style={styles.label}>Mark Profile Category (Engineer, Ministry, +)</Text>
          {selectedFormMarkings.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {selectedFormMarkings.map((tag) => {
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
                      onPress={() => setSelectedFormMarkings(prev => prev.filter(t => t.toLowerCase() !== tag.toLowerCase()))}
                      hitSlop={6}
                    >
                      <MaterialIcons name="cancel" size={14} color={cfg.color} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {allMarkingPresets.map((preset) => {
              const isSelected = selectedFormMarkings.some(m => m.toLowerCase() === preset.label.toLowerCase());
              const cfg = getMarkingConfig(preset.label, theme.isDark);
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => {
                    if (isSelected) {
                      setSelectedFormMarkings(prev => prev.filter(t => t.toLowerCase() !== preset.label.toLowerCase()));
                    } else {
                      setSelectedFormMarkings(prev => [...prev, preset.label]);
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
                              setSelectedFormMarkings(prev => prev.filter(t => t.toLowerCase() !== preset.label.toLowerCase()));
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
                  {preset.isCustom && (
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
                                setSelectedFormMarkings(prev => prev.filter(t => t.toLowerCase() !== preset.label.toLowerCase()));
                              }
                            }
                          ]
                        );
                      }}
                    >
                      <MaterialIcons name="close" size={12} color={colors.text.muted} style={{ marginLeft: 2 }} />
                    </Pressable>
                  )}
                  {!preset.isCustom && (
                    <MaterialIcons name={isSelected ? "check" : "add"} size={13} color={isSelected ? cfg.color : colors.text.muted} />
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 }}>
            <TextInput
              value={customFormMarking}
              onChangeText={setCustomFormMarking}
              style={[styles.input, { flex: 1, marginBottom: 0, height: 38, fontSize: 12.5 }]}
              placeholder="Type custom mark & tap + Add"
              placeholderTextColor={colors.text.muted}
              onSubmitEditing={async () => {
                const trimmed = customFormMarking.trim();
                if (trimmed) {
                  await addCustomMarking(trimmed);
                  if (!selectedFormMarkings.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
                    setSelectedFormMarkings(prev => [...prev, trimmed]);
                  }
                  setCustomFormMarking("");
                }
              }}
              returnKeyType="done"
            />
            <Pressable
              onPress={async () => {
                const trimmed = customFormMarking.trim();
                if (trimmed) {
                  await addCustomMarking(trimmed);
                  if (!selectedFormMarkings.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
                    setSelectedFormMarkings(prev => [...prev, trimmed]);
                  }
                  setCustomFormMarking("");
                }
              }}
              disabled={!customFormMarking.trim()}
              style={{
                backgroundColor: customFormMarking.trim() ? colors.accent.primary : colors.border.medium,
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

          <Pressable style={styles.primaryButton} onPress={handleAddCustomer} disabled={isSaving}>
            <Text style={styles.primaryButtonText}>
              {isSaving ? "Saving..." : "➕ Create Customer Record"}
            </Text>
          </Pressable>
        </View>
        )}

        {/* Stats */}
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Accounts</Text>
            <Text style={styles.statValue}>{unifiedCustomers.length}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.statCard,
              styles.totalCard,
              pressed && { opacity: 0.8, transform: [{ scale: 0.99 }] },
            ]}
            onPress={() => setIsSummaryModalOpen(true)}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.statLabel}>Total Unpaid Balances</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "#fee2e2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 }}>
                <MaterialIcons name="analytics" size={14} color={colors.accent.danger} />
                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.accent.danger }}>Summary</Text>
              </View>
            </View>
            <Text style={styles.statValue}>₹{totalUnpaidBalancesSum.toLocaleString("en-IN")}</Text>
          </Pressable>
        </View>

        {/* Search & Filters */}
        <View style={styles.formSection}>
          <Text style={styles.sectionHeader}>Search & Filters</Text>
          
          {/* Account Type Filter */}
          <Text style={styles.subLabel}>Filter by Account Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <View style={styles.filterRow}>
              {[
                { label: `All Accounts (${unifiedCustomers.length})`, value: "All" },
                { label: "Customers", value: "customer" },
                { label: "Workers", value: "worker" },
                { label: "Suppliers", value: "supplier" },
                { label: "Delivery Partners", value: "delivery_partner" },
              ].map((item) => {
                const active = typeFilter === item.value;
                return (
                  <Pressable
                    key={item.value}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    onPress={() => setTypeFilter(item.value as any)}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Search Box */}
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={20} color={colors.text.muted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search by name, phone, or location..."
              placeholderTextColor={colors.text.muted}
            />
            {searchTerm ? (
              <Pressable onPress={() => setSearchTerm("")}>
                <MaterialIcons name="close" size={18} color={colors.text.muted} />
              </Pressable>
            ) : null}
          </View>

          {/* Balance Filter Row */}
          <Text style={styles.subLabel}>Filter by Balance Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <View style={styles.filterRow}>
              {[
                { label: "All Balances", value: "All" },
                { label: "⭐ Favorites", value: "Favorites" },
                { label: "Pending Balance (> ₹0)", value: "Pending" },
                { label: "Zero Balance (₹0)", value: "Zero" },
              ].map((item) => {
                const active = balanceFilter === item.value;
                return (
                  <Pressable
                    key={item.value}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    onPress={() => setBalanceFilter(item.value)}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Collector Filter Row */}
          <Text style={styles.subLabel}>Filter by Assigned Collector</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <View style={styles.filterRow}>
              <Pressable
                style={[styles.filterPill, collectorFilter === "All" && styles.filterPillActive]}
                onPress={() => setCollectorFilter("All")}
              >
                <Text style={[styles.filterPillText, collectorFilter === "All" && styles.filterPillTextActive]}>
                  All Collectors
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.filterPill, collectorFilter === "Unassigned" && styles.filterPillActive]}
                onPress={() => setCollectorFilter("Unassigned")}
              >
                <Text style={[styles.filterPillText, collectorFilter === "Unassigned" && styles.filterPillTextActive]}>
                  No Collector
                </Text>
              </Pressable>

              {collectors.map((c: any) => {
                const active = collectorFilter === c.id;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    onPress={() => setCollectorFilter(c.id)}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Profile Marking Filter Row */}
          <Text style={styles.subLabel}>Filter by Profile Marking</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <View style={styles.filterRow}>
              <Pressable
                style={[styles.filterPill, markingFilter === "All" && styles.filterPillActive]}
                onPress={() => setMarkingFilter("All")}
              >
                <Text style={[styles.filterPillText, markingFilter === "All" && styles.filterPillTextActive]}>
                  All Markings
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.filterPill, markingFilter === "Marked" && styles.filterPillActive]}
                onPress={() => setMarkingFilter("Marked")}
              >
                <Text style={[styles.filterPillText, markingFilter === "Marked" && styles.filterPillTextActive]}>
                  🏷️ Any Marked
                </Text>
              </Pressable>

              {allMarkingPresets.map((p) => {
                const active = markingFilter.toLowerCase() === p.label.toLowerCase();
                const cfg = getMarkingConfig(p.label, theme.isDark);
                return (
                  <Pressable
                    key={p.id}
                    style={[
                      styles.filterPill,
                      active && {
                        backgroundColor: cfg.bg,
                        borderColor: cfg.border,
                      },
                    ]}
                    onPress={() => setMarkingFilter(active ? "All" : p.label)}
                  >
                    <MaterialIcons
                      name={p.icon}
                      size={14}
                      color={active ? cfg.color : colors.text.muted}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.filterPillText,
                        active && { color: cfg.color, fontWeight: "800" },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Reset button */}
          {(searchTerm || balanceFilter !== "All" || collectorFilter !== "All" || markingFilter !== "All") && (
            <Pressable
              style={styles.resetFiltersBtn}
              onPress={() => {
                setSearchTerm("");
                setBalanceFilter("All");
                setCollectorFilter("All");
                setMarkingFilter("All");
              }}
            >
              <MaterialIcons name="filter-list-off" size={16} color={colors.accent.danger} />
              <Text style={styles.resetFiltersBtnText}>Reset Search & Filters</Text>
            </Pressable>
          )}
        </View>

        {/* Customer List */}
        <View style={styles.customersSection}>
          <Text style={styles.sectionHeader}>Registered Clients</Text>
          {customers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No customers in database. Add one above! 👇</Text>
            </View>
          ) : filteredCustomers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No customer matches found for &quot;{searchTerm}&quot;.</Text>
            </View>
          ) : (
            filteredCustomers.map((customer: any) => {
              const avatarColor = getAvatarColor(customer.name || "Client");
              const initial = (customer.name || "C").substring(0, 1).toUpperCase();

              return (
                <View key={customer.id} style={styles.customerCard}>
                  <Pressable
                    style={styles.cardHeaderPressable}
                    onPress={() => {
                      router.push({ pathname: "/customer-profile" as any, params: { id: customer.id } });
                    }}
                  >
                    <View style={[styles.circleAvatar, { backgroundColor: avatarColor }]}>
                      <Text style={styles.circleAvatarText}>{initial}</Text>
                    </View>
                    <View style={styles.customerInfo}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, flex: 1, marginRight: 8 }}>
                          <Text selectable={true} style={styles.customerName} numberOfLines={2}>{customer.name || "Unnamed Client"}</Text>
                          {customer.badgeText && customer.entityType !== "customer" && (
                            <View style={{
                              backgroundColor: `${customer.badgeColor || colors.accent.primary}18`,
                              borderColor: `${customer.badgeColor || colors.accent.primary}40`,
                              borderWidth: 1,
                              borderRadius: 6,
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                            }}>
                              <Text style={{ fontSize: 9.5, fontWeight: "800", color: customer.badgeColor || colors.accent.primary }}>
                                {customer.badgeText}
                              </Text>
                            </View>
                          )}
                          {customer.isSpecial && (
                            <View style={{
                              backgroundColor: "#F59E0B20",
                              borderColor: "#F59E0B40",
                              borderWidth: 1,
                              borderRadius: 4,
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                            }}>
                              <Text style={{ fontSize: 9, fontWeight: "800", color: "#D97706" }}>SPECIAL</Text>
                            </View>
                          )}
                        </View>
                        <Pressable
                          style={{ padding: 4 }}
                          onPress={(e) => {
                            e.stopPropagation();
                            toggleFavoriteCustomer(customer.id);
                          }}
                          hitSlop={8}
                        >
                          <MaterialIcons
                            name={customer.isFavorite ? "star" : "star-border"}
                            size={22}
                            color={customer.isFavorite ? "#F59E0B" : colors.text.muted}
                          />
                        </Pressable>
                      </View>
                      <Text selectable={true} style={styles.customerPhone}>
                        {(customer.phoneNumbers && customer.phoneNumbers.length > 0)
                          ? customer.phoneNumbers.join(', ')
                          : (customer.phone || "No phone number recorded")}
                      </Text>

                      {/* Profile Markings Badges on Card */}
                      {customer.profileMarkings && customer.profileMarkings.length > 0 && (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, marginBottom: 2 }}>
                          {customer.profileMarkings.map((tag: string) => {
                            const cfg = getMarkingConfig(tag, theme.isDark);
                            return (
                              <View
                                key={tag}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 3,
                                  backgroundColor: cfg.bg,
                                  borderColor: cfg.border,
                                  borderWidth: 1,
                                  borderRadius: 6,
                                  paddingHorizontal: 6,
                                  paddingVertical: 1.5,
                                }}
                              >
                                <MaterialIcons name={cfg.icon} size={11} color={cfg.color} />
                                <Text style={{ fontSize: 9.5, fontWeight: "800", color: cfg.color }}>
                                  {tag}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {customer.address ? (
                        <Text style={styles.customerAddress} numberOfLines={1}>
                          Loc: {customer.address}
                        </Text>
                      ) : null}
                      {customer.subInfo && customer.subInfo !== customer.address ? (
                        <Text style={{ fontSize: 11, fontWeight: "600", color: customer.displayBalance === 0 ? colors.accent.success : colors.text.muted, marginTop: 2 }}>
                          {customer.subInfo}
                        </Text>
                      ) : null}
                      {customer.collectorName ? (
                        <Text style={styles.customerCollector} numberOfLines={1}>
                          Collector: {customer.collectorName}
                        </Text>
                      ) : null}
                      {getLastDueDate(customer) ? (
                        <View style={[
                          styles.listDueRow, 
                          getDueDateStatus(getLastDueDate(customer)) === "Overdue" ? styles.listDueOverdue : 
                          getLastDueDate(customer).status === "Completed" ? styles.listDueCompleted : styles.listDuePending
                        ]}>
                          <MaterialIcons 
                            name={getDueDateStatus(getLastDueDate(customer)) === "Overdue" ? "error-outline" : 
                                  getLastDueDate(customer).status === "Completed" ? "check-circle" : "event"} 
                            size={12} 
                            color={
                              getDueDateStatus(getLastDueDate(customer)) === "Overdue" ? "#b91c1c" : 
                              getLastDueDate(customer).status === "Completed" ? "#15803d" : "#c2410c"
                            } 
                          />
                          <Text style={[
                            styles.listDueText,
                            {
                              color: getDueDateStatus(getLastDueDate(customer)) === "Overdue" ? "#b91c1c" : 
                                     getLastDueDate(customer).status === "Completed" ? "#15803d" : "#c2410c"
                            }
                          ]}>
                            {getDueDateStatus(getLastDueDate(customer)) === "Overdue" ? "Overdue: " : 
                             getLastDueDate(customer).status === "Completed" ? "Due (Paid): " : "Next Due: "}
                            {formatDueDate(getLastDueDate(customer).date)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color={colors.border.medium} />
                  </Pressable>

                  <View style={styles.divider} />

                  <View style={styles.cardFooter}>
                    <View style={styles.balanceCol}>
                      <Text style={styles.footerLabel}>Balance Due:</Text>
                      <Text
                        style={[
                          styles.footerValue,
                          Number(customer.balance) > 0 && { color: colors.accent.danger },
                        ]}
                      >
                        ₹{Number(customer.balance || 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                    <View style={styles.actionButtonsRow}>
                      {Number(customer.balance) > 0 && (
                        <Pressable
                          style={styles.payDueCardBtn}
                          onPress={() => openPayModal(customer)}
                        >
                          <MaterialIcons name="payments" size={14} color={colors.accent.success} />
                          <Text style={styles.payDueCardBtnText}>Pay</Text>
                        </Pressable>
                      )}
                      <Pressable
                        style={styles.addDueCardBtn}
                        onPress={() => openDueModal(customer)}
                      >
                        <MaterialIcons name="event" size={14} color={colors.accent.primary} />
                        <Text style={styles.addDueCardBtnText}>Add Due</Text>
                      </Pressable>
                      <Pressable
                        style={styles.deleteButton}
                        onPress={() => handleDeleteCustomer(customer.id)}
                      >
                        <MaterialIcons name="delete" size={16} color={colors.accent.danger} />
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Add Due Date Modal */}
      <Modal
        visible={isDueModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsDueModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setIsDueModalOpen(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Due Date</Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsDueModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              {selectedCustomer && (
                <View style={styles.modalCustomerBadge}>
                  <Text style={styles.modalCustomerBadgeText}>Client: {(selectedCustomer as any).name}</Text>
                </View>
              )}

              <Text style={styles.modalFormLabel}>Target Due Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.modalFormInput}
                value={dueDateStr}
                onChangeText={setDueDateStr}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.text.muted}
              />
              
              {/* Presets */}
              <View style={styles.modalPresetsRow}>
                <Pressable style={styles.modalPresetBtn} onPress={() => setDateOffset(3)}>
                  <Text style={styles.modalPresetText}>+3 Days</Text>
                </Pressable>
                <Pressable style={styles.modalPresetBtn} onPress={() => setDateOffset(7)}>
                  <Text style={styles.modalPresetText}>+1 Week</Text>
                </Pressable>
                <Pressable style={styles.modalPresetBtn} onPress={() => setDateOffset(14)}>
                  <Text style={styles.modalPresetText}>+2 Weeks</Text>
                </Pressable>
                <Pressable style={styles.modalPresetBtn} onPress={() => setDateOffset(30)}>
                  <Text style={styles.modalPresetText}>+30 Days</Text>
                </Pressable>
              </View>

              <Text style={styles.modalFormLabel}>Notes / Purpose</Text>
              <TextInput
                style={styles.modalFormInput}
                value={dueNotes}
                onChangeText={setDueNotes}
                placeholder="e.g. Balance for block delivery"
                placeholderTextColor={colors.text.muted}
              />

              <View style={styles.modalFormActions}>
                <Pressable 
                  style={[styles.modalFormActionBtn, styles.modalCancelBtn]} 
                  onPress={() => setIsDueModalOpen(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={[styles.modalFormActionBtn, styles.modalSaveBtn]} 
                  onPress={handleAddDueDate}
                  disabled={savingDueDate}
                >
                  {savingDueDate ? (
                    <ActivityIndicator size="small" color={colors.bg.card} />
                  ) : (
                    <Text style={styles.modalSaveBtnText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Receive Payment Modal */}
      <Modal
        visible={isPayModalOpen}
        animationType="fade"
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
              <Text style={styles.modalTitle}>Receive Payment</Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsPayModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              {selectedCustomer && (
                <View style={styles.modalCustomerBadge}>
                  <Text style={styles.modalCustomerBadgeText}>Client: {(selectedCustomer as any).name}</Text>
                </View>
              )}

              <Text style={styles.modalFormLabel}>Amount Received (₹)</Text>
              <TextInput
                style={styles.modalFormInput}
                value={payAmount}
                onChangeText={setPayAmount}
                placeholder="Enter payment amount"
                keyboardType="numeric"
                placeholderTextColor={colors.text.muted}
                autoFocus={true}
              />

              <Text style={styles.modalFormLabel}>Balance Payment Discount (₹)</Text>
              <TextInput
                style={[styles.modalFormInput, { borderColor: colors.accent.success + "80" }]}
                value={payDiscount}
                onChangeText={setPayDiscount}
                placeholder="Enter discount amount on balance"
                keyboardType="numeric"
                placeholderTextColor={colors.text.muted}
              />

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
              </View>

              <Text style={styles.modalFormLabel}>Payment Method *</Text>
              <View style={styles.modalPresetsRow}>
                {["Cash", "UPI", "Bank Transfer", "Cheque", "Other"].map((m) => {
                  const active = payMethod === m;
                  return (
                    <Pressable
                      key={m}
                      style={[
                        styles.modalPresetBtn,
                        active && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary }
                      ]}
                      onPress={() => setPayMethod(m)}
                    >
                      <Text style={[styles.modalPresetText, active && { color: colors.bg.card }]}>
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.modalFormLabel}>Payment Date *</Text>
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: colors.bg.primary,
                  borderWidth: 1,
                  borderColor: colors.border.medium,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginBottom: 14,
                }}
                onPress={() => setIsPayCalendarOpen(true)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialIcons name="event" size={20} color={colors.accent.primary} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text.primary }}>
                    {payDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.primary }}>Change Date</Text>
              </Pressable>

              <Text style={styles.modalFormLabel}>Notes (Optional)</Text>
              <TextInput
                style={styles.modalFormInput}
                value={payNotes}
                onChangeText={setPayNotes}
                placeholder="Reference logs, notes, etc."
                placeholderTextColor={colors.text.muted}
              />

              <View style={styles.modalFormActions}>
                <Pressable 
                  style={[styles.modalFormActionBtn, styles.modalCancelBtn]} 
                  onPress={() => setIsPayModalOpen(false)}
                  disabled={isSavingPayment}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={[styles.modalFormActionBtn, styles.modalSaveBtn]} 
                  onPress={handleSavePayment}
                  disabled={isSavingPayment}
                >
                  {isSavingPayment ? (
                    <ActivityIndicator size="small" color={colors.bg.card} />
                  ) : (
                    <Text style={styles.modalSaveBtnText}>Save Payment</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Pay Calendar Modal */}
      <EasyCalendarModal
        visible={isPayCalendarOpen}
        date={payDate}
        onSelectDate={(d) => {
          setPayDate(d);
          setIsPayCalendarOpen(false);
        }}
        onClose={() => setIsPayCalendarOpen(false)}
        title="Select Payment Date"
      />

      {/* Full Customer-Wise Summary Details Modal */}
      <Modal
        visible={isSummaryModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsSummaryModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setIsSummaryModalOpen(false)} />
          <View style={[styles.modalContent, { maxWidth: 500, height: "80%", maxHeight: 700, padding: 16 }]}>
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
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
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

              {/* Action Bar (Share Summary Report) */}
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  backgroundColor: colors.accent.primary + "18",
                  borderColor: colors.accent.primary + "40",
                  borderWidth: 1,
                  borderRadius: 10,
                  paddingVertical: 9,
                  paddingHorizontal: 12,
                  marginBottom: 14,
                }}
                onPress={handleShareSummary}
              >
                <MaterialIcons name="share" size={16} color={colors.accent.primary} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.primary }}>
                  Share Unpaid Summary Report
                </Text>
              </Pressable>

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
                            openPayModal(item);
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text.primary,
  },
  subheading: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  homeButton: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.text.secondary,
    borderRadius: 10,
    alignItems: "center",
    gap: 4,
  },
  homeButtonText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 12,
  },
  addButton: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.accent.primary,
    borderRadius: 10,
    alignItems: "center",
    gap: 4,
  },
  addButtonText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 12,
  },
  importContactsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: "#6C5CE740",
    borderRadius: 12,
    backgroundColor: "#6C5CE720",
    marginBottom: 20,
  },
  importContactsBtnText: {
    color: colors.accent.primary,
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 6,
  },
  formSection: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 6,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 14,
    backgroundColor: colors.bg.primary,
    color: colors.text.primary,
    fontSize: 14,
  },
  flexRow: {
    flexDirection: "row",
  },
  primaryButton: {
    backgroundColor: colors.accent.success,
    borderRadius: 10,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  primaryButtonText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 14,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: colors.bg.primary,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  statsSection: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  statCard: {
    padding: 12,
    backgroundColor: colors.bg.primary,
    borderRadius: 12,
    marginBottom: 10,
  },
  totalCard: {
    backgroundColor: "#fef2f2",
  },
  statLabel: {
    color: colors.text.muted,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: "600",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
  },
  secondaryButton: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.accent.danger,
    borderRadius: 10,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  secondaryButtonText: {
    color: colors.accent.danger,
    fontWeight: "700",
    fontSize: 13,
  },
  customersSection: {
    gap: 12,
  },
  emptyState: {
    backgroundColor: colors.bg.card,
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 13,
  },
  customerCard: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderPressable: {
    flexDirection: "row",
    alignItems: "center",
  },
  circleAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  circleAvatarText: {
    color: colors.bg.card,
    fontSize: 16,
    fontWeight: "700",
  },
  customerInfo: {
    flex: 1,
    marginLeft: 14,
  },
  customerName: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text.primary,
    lineHeight: 22,
  },
  customerPhone: {
    color: colors.text.muted,
    fontSize: 12,
    marginTop: 2,
  },
  customerAddress: {
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 2,
  },
  customerCollector: {
    color: colors.accent.primary,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: 10,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerLabel: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "600",
  },
  footerValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderColor: "#fee2e2",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#fff5f5",
  },
  deleteButtonText: {
    color: colors.accent.danger,
    fontWeight: "700",
    fontSize: 12,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text.muted,
    marginTop: 10,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filterScroll: {
    marginBottom: 8,
    flexDirection: "row",
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
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
  resetFiltersBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: "#fca5a5",
    borderRadius: 10,
    backgroundColor: "#fef2f2",
  },
  resetFiltersBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accent.danger,
  },
  listDueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  listDueOverdue: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  listDueCompleted: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  listDuePending: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  listDueText: {
    fontSize: 11,
    fontWeight: "700",
  },
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addDueCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderColor: "#6C5CE740",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#6C5CE720",
  },
  addDueCardBtnText: {
    color: colors.accent.primary,
    fontWeight: "700",
    fontSize: 12,
  },
  payDueCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderColor: `${colors.accent.success}40`,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: `${colors.accent.success}20`,
  },
  payDueCardBtnText: {
    color: colors.accent.success,
    fontWeight: "700",
    fontSize: 12,
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
  modalCustomerBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.border.subtle,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  modalCustomerBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  modalFormLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text.muted,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  modalFormInput: {
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: colors.text.primary,
    marginBottom: 12,
  },
  modalPresetsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 14,
  },
  modalPresetBtn: {
    backgroundColor: "#6C5CE720",
    borderWidth: 1,
    borderColor: "#6C5CE740",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  modalPresetText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.accent.primary,
  },
  modalFormActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 10,
  },
  modalFormActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  modalCancelBtn: {
    backgroundColor: colors.border.subtle,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  modalCancelBtnText: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: "600",
  },
  modalSaveBtn: {
    backgroundColor: colors.accent.primary,
  },
  modalSaveBtnText: {
    color: colors.bg.card,
    fontSize: 12,
    fontWeight: "700",
  },
})
};
;
