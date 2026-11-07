import { MaterialIcons } from "@expo/vector-icons";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

// Components & Contexts
import { BackButton } from "../components/BackButton";
import EasyCalendarModal from "../components/EasyCalendarModal";
import ProtectedRoute from "../components/ProtectedRoute";
import { ExpenseContext } from "../context/ExpenseContext";
import { PaymentContext } from "../context/PaymentContext";
import { RawMaterialContext } from "../context/RawMaterialContext";
import { WorkerContext } from "../context/WorkerContext";
import { DeliveryPartnerContext } from "../context/DeliveryPartnerContext";
import { useScrollRestoration } from "../context/ScrollContext";
import { useTheme } from "../context/ThemeContext";
import { UserContext } from "../context/UserContext";

// Firebase
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, normalizeDateValue } from "../../src/config/firebase";

// Services & Types
import {
  addFundTransaction,
  computeAccountBalances,
  computeDailyCashFlow,
  computeFundFlowSummary,
  computeRunningBalances,
  DEFAULT_FUND_ACCOUNTS,
  deleteFundAccount,
  deleteFundTransaction,
  exportFundFlowCsv,
  exportFundFlowPdf,
  filterFundEntries,
  formatCurrency,
  formatDate,
  formatFundFlowWhatsApp,
  formatTime,
  getDateRangeForPeriod,
  groupEntriesByDate,
  INFLOW_CATEGORIES,
  OUTFLOW_CATEGORIES,
  printFundFlowReport,
  saveFundAccount,
  subscribeFundAccounts,
  subscribeFundTransactions,
  TRANSFER_CATEGORIES,
  unifyFundEntries,
} from "../../src/services/fundFlowService";
import {
  DailyCashFlowPoint,
  DateGroupedEntries,
  FundAccount,
  FundAccountType,
  FundFlowFilter,
  FundTransaction,
  ReportPeriod,
  UnifiedFundEntry,
} from "../../src/types/fundFlow";

const PERIOD_LIST: { id: ReportPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This Week" },
  { id: "last_week", label: "Last Week" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "this_year", label: "This Year" },
  { id: "all_time", label: "All Time" },
  { id: "custom", label: "Custom" },
];

const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Other"];

export default function FundFlowManagementScreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { scrollViewRef, handleScroll, handleContentSizeChange } =
    useScrollRestoration("/settings/fund-flow");

  // App Contexts
  const { payments: customerPayments = [], loading: loadingCustPayments } =
    (useContext(PaymentContext) as any) || {};
  const { expenses = [], expensePayments = [], loading: loadingExpenses } =
    (useContext(ExpenseContext) as any) || {};
  const { logs: rawLogs = [], loading: loadingRawLogs } =
    (useContext(RawMaterialContext) as any) || {};
  const { profile: userProfile } = (useContext(UserContext) as any) || {};
  const { workers = [] } = (useContext(WorkerContext) as any) || {};
  const { partners: deliveryPartners = [] } = (useContext(DeliveryPartnerContext) as any) || {};

  // Secondary collections
  const [workerPayments, setWorkerPayments] = useState<any[]>([]);
  const [deliveryPayments, setDeliveryPayments] = useState<any[]>([]);
  const [workerBonuses, setWorkerBonuses] = useState<any[]>([]);
  const [deliveryBonuses, setDeliveryBonuses] = useState<any[]>([]);
  const [customerBonuses, setCustomerBonuses] = useState<any[]>([]);
  const [fundAccounts, setFundAccounts] = useState<FundAccount[]>(DEFAULT_FUND_ACCOUNTS);
  const [fundTransactions, setFundTransactions] = useState<FundTransaction[]>([]);
  const [loadingDirect, setLoadingDirect] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter & Period State
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>("this_month");
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  const [calendarTarget, setCalendarTarget] = useState<"start" | "end" | "record" | null>(null);

  const [activeTab, setActiveTab] = useState<"ledger" | "statement" | "accounts">("ledger");
  const [typeFilter, setTypeFilter] = useState<"all" | "inflow" | "outflow" | "transfer">("all");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [displayLimit, setDisplayLimit] = useState(50);
  const [ledgerViewMode, setLedgerViewMode] = useState<"grouped" | "flat">("grouped");

  // Debounce search query to avoid laggy keystrokes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset pagination limit when filters change
  useEffect(() => {
    setDisplayLimit(50);
  }, [selectedPeriod, typeFilter, selectedAccountId, debouncedSearchQuery, selectedCategory]);

  // Reset category filter when typeFilter changes
  useEffect(() => {
    setSelectedCategory("all");
  }, [typeFilter]);

  // Modals
  const [isInflowModalOpen, setIsInflowModalOpen] = useState(false);
  const [isOutflowModalOpen, setIsOutflowModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAccountsModalOpen, setIsAccountsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<UnifiedFundEntry | null>(null);

  // Forms State
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formMethod, setFormMethod] = useState("Cash");
  const [formFromAccountId, setFormFromAccountId] = useState("acc_cash_default");
  const [formToAccountId, setFormToAccountId] = useState("acc_bank_default");
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formRef, setFormRef] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [savingForm, setSavingForm] = useState(false);

  // Add / Edit Account Form State
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<FundAccountType>("bank");
  const [accOpening, setAccOpening] = useState("");
  const [accBankName, setAccBankName] = useState("");
  const [accNumber, setAccNumber] = useState("");
  const [accUpiId, setAccUpiId] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // 1. Subscribe to fund_accounts & fund_transactions
  useEffect(() => {
    const unsubAccounts = subscribeFundAccounts(
      (accs) => setFundAccounts(accs),
      (err) => console.log("Fund Accounts error:", err)
    );

    const unsubTxs = subscribeFundTransactions(
      (txs) => {
        setFundTransactions(txs);
        setLoadingDirect(false);
      },
      (err) => {
        console.log("Fund Transactions error:", err);
        setLoadingDirect(false);
      }
    );

    return () => {
      unsubAccounts();
      unsubTxs();
    };
  }, []);

  // 2. Subscribe to workerPayments & deliveryPayments in real-time
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

    const qWorkerBonus = query(collection(db, "workerBonuses"), orderBy("createdAt", "desc"));
    const unsubWorkerBonus = onSnapshot(
      qWorkerBonus,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt || d.data().date),
        }));
        setWorkerBonuses(docs);
      },
      (err) => console.log("workerBonuses error in fund-flow:", err)
    );

    const qDeliveryBonus = query(collection(db, "deliveryPartnerBonuses"), orderBy("createdAt", "desc"));
    const unsubDeliveryBonus = onSnapshot(
      qDeliveryBonus,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt || d.data().date),
        }));
        setDeliveryBonuses(docs);
      },
      (err) => console.log("deliveryPartnerBonuses error in fund-flow:", err)
    );

    const qCustomerBonus = query(collection(db, "customerBonuses"), orderBy("createdAt", "desc"));
    const unsubCustomerBonus = onSnapshot(
      qCustomerBonus,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt || d.data().date),
        }));
        setCustomerBonuses(docs);
      },
      (err) => console.log("customerBonuses error in fund-flow:", err)
    );

    return () => {
      unsubWorker();
      unsubDelivery();
      unsubWorkerBonus();
      unsubDeliveryBonus();
      unsubCustomerBonus();
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // Name mapping maps for workers and delivery partners
  const workerMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    (workers || []).forEach((w: any) => {
      map.set(w.id, { name: w.name || w.fullName || "Worker" });
    });
    return map;
  }, [workers]);

  const partnerMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    (deliveryPartners || []).forEach((p: any) => {
      map.set(p.id, { name: p.name || p.partnerName || "Delivery Partner" });
    });
    return map;
  }, [deliveryPartners]);

  // Compute Date Bounds
  const dateBounds = useMemo(() => {
    return getDateRangeForPeriod(selectedPeriod, customStart, customEnd);
  }, [selectedPeriod, customStart, customEnd]);

  // Unified Stream
  const allEntries = useMemo(() => {
    return unifyFundEntries({
      customerPayments,
      expenses,
      expensePayments,
      rawLogs,
      workerPayments,
      deliveryPayments,
      workerBonuses,
      deliveryBonuses,
      customerBonuses,
      fundTransactions,
      accounts: fundAccounts,
      workerMap,
      partnerMap,
    });
  }, [
    customerPayments,
    expenses,
    expensePayments,
    rawLogs,
    workerPayments,
    deliveryPayments,
    workerBonuses,
    deliveryBonuses,
    customerBonuses,
    fundTransactions,
    fundAccounts,
    workerMap,
    partnerMap,
  ]);

  // Account Balances across ALL entries
  const accountBalances = useMemo(() => {
    return computeAccountBalances(allEntries, fundAccounts);
  }, [allEntries, fundAccounts]);

  const totalLiquidBalance = useMemo(() => {
    return Object.values(accountBalances).reduce((sum, item) => sum + item.balance, 0);
  }, [accountBalances]);

  // 1. Compute running balances chronologically across all entries
  const allEntriesWithBalances = useMemo(() => {
    return computeRunningBalances(allEntries, fundAccounts, selectedAccountId);
  }, [allEntries, fundAccounts, selectedAccountId]);

  // 2. Filtered Entries for active period, account, search, and category
  const filteredEntries = useMemo(() => {
    const filter: FundFlowFilter = {
      period: selectedPeriod,
      typeFilter,
      accountId: selectedAccountId,
      searchQuery: debouncedSearchQuery,
      categoryFilter: selectedCategory,
      customStartDate: customStart,
      customEndDate: customEnd,
    };
    return filterFundEntries(allEntriesWithBalances, filter, dateBounds);
  }, [
    allEntriesWithBalances,
    selectedPeriod,
    typeFilter,
    selectedAccountId,
    debouncedSearchQuery,
    selectedCategory,
    customStart,
    customEnd,
    dateBounds,
  ]);

  // 3. Paginated entries for high performance
  const displayedEntries = useMemo(() => {
    return filteredEntries.slice(0, displayLimit);
  }, [filteredEntries, displayLimit]);

  // 4. Date-grouped entries for structured passbook view
  const dateGroupedEntries = useMemo(() => {
    return groupEntriesByDate(displayedEntries);
  }, [displayedEntries]);

  // 5. Daily Cash Flow Data for visual trend chart
  const dailyCashFlowData = useMemo(() => {
    return computeDailyCashFlow(filteredEntries, dateBounds);
  }, [filteredEntries, dateBounds]);

  // 6. Summary Metrics
  const summary = useMemo(() => {
    return computeFundFlowSummary(filteredEntries, allEntries, fundAccounts, dateBounds.start);
  }, [filteredEntries, allEntries, fundAccounts, dateBounds.start]);

  // Handlers for Add Inflow / Outflow / Transfer (with optional pre-filled account)
  const handleOpenInflowModal = (prefilledAccId?: any) => {
    const targetId = typeof prefilledAccId === "string" ? prefilledAccId : "";
    setFormAmount("");
    setFormCategory(INFLOW_CATEGORIES[1]); // Capital Addition
    setFormMethod("Cash");
    setFormToAccountId(targetId || fundAccounts[0]?.id || "acc_cash_default");
    setFormDate(new Date());
    setFormRef("");
    setFormNotes("");
    setIsInflowModalOpen(true);
  };

  const handleOpenOutflowModal = (prefilledAccId?: any) => {
    const targetId = typeof prefilledAccId === "string" ? prefilledAccId : "";
    setFormAmount("");
    setFormCategory(OUTFLOW_CATEGORIES[4]); // Owner Drawings
    setFormMethod("Cash");
    setFormFromAccountId(targetId || fundAccounts[0]?.id || "acc_cash_default");
    setFormDate(new Date());
    setFormRef("");
    setFormNotes("");
    setIsOutflowModalOpen(true);
  };

  const handleOpenTransferModal = (prefilledSourceAccId?: any) => {
    const source =
      typeof prefilledSourceAccId === "string"
        ? prefilledSourceAccId
        : fundAccounts[0]?.id || "acc_cash_default";
    setFormAmount("");
    setFormCategory(TRANSFER_CATEGORIES[0]);
    setFormMethod("Transfer");
    setFormFromAccountId(source);
    const targetAcc = fundAccounts.find((a) => a.id !== source) || fundAccounts[1];
    setFormToAccountId(targetAcc?.id || "acc_bank_default");
    setFormDate(new Date());
    setFormRef("");
    setFormNotes("");
    setIsTransferModalOpen(true);
  };

  const handleSaveInflow = async () => {
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive amount.");
      return;
    }
    setSavingForm(true);
    try {
      const targetAcc = fundAccounts.find((a) => a.id === formToAccountId);
      await addFundTransaction({
        type: "inflow",
        category: formCategory,
        amount: amt,
        date: formDate,
        toAccountId: formToAccountId,
        toAccountName: targetAcc?.name || formMethod,
        paymentMethod: formMethod,
        referenceNumber: formRef.trim(),
        notes: formNotes.trim(),
      });
      setIsInflowModalOpen(false);
      Alert.alert("Success", "Fund inflow recorded successfully.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to record fund inflow.");
    } finally {
      setSavingForm(false);
    }
  };

  const handleSaveOutflow = async () => {
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive amount.");
      return;
    }
    setSavingForm(true);
    try {
      const sourceAcc = fundAccounts.find((a) => a.id === formFromAccountId);
      await addFundTransaction({
        type: "outflow",
        category: formCategory,
        amount: amt,
        date: formDate,
        fromAccountId: formFromAccountId,
        fromAccountName: sourceAcc?.name || formMethod,
        paymentMethod: formMethod,
        referenceNumber: formRef.trim(),
        notes: formNotes.trim(),
      });
      setIsOutflowModalOpen(false);
      Alert.alert("Success", "Fund outflow recorded successfully.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to record fund outflow.");
    } finally {
      setSavingForm(false);
    }
  };

  const handleSaveTransfer = async () => {
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive amount.");
      return;
    }
    if (formFromAccountId === formToAccountId) {
      Alert.alert("Invalid Transfer", "Source account and destination account cannot be the same.");
      return;
    }
    setSavingForm(true);
    try {
      const fromAcc = fundAccounts.find((a) => a.id === formFromAccountId);
      const toAcc = fundAccounts.find((a) => a.id === formToAccountId);
      await addFundTransaction({
        type: "transfer",
        category: formCategory,
        amount: amt,
        date: formDate,
        fromAccountId: formFromAccountId,
        fromAccountName: fromAcc?.name || "From Account",
        toAccountId: formToAccountId,
        toAccountName: toAcc?.name || "To Account",
        paymentMethod: formMethod,
        referenceNumber: formRef.trim(),
        notes: formNotes.trim(),
      });
      setIsTransferModalOpen(false);
      Alert.alert("Success", "Contra transfer executed successfully.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to execute transfer.");
    } finally {
      setSavingForm(false);
    }
  };

  const handleDeleteEntry = (entry: UnifiedFundEntry) => {
    if (!entry.isManual) {
      Alert.alert(
        "Auto-Integrated Transaction",
        "This record is automatically synchronized from your active " +
          entry.sourceLabel +
          " module. To modify or delete it, please open the respective module in Settings/Finance."
      );
      return;
    }

    Alert.alert(
      "Confirm Deletion",
      `Are you sure you want to delete this ${entry.type} entry of ${formatCurrency(entry.amount)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFundTransaction(entry.rawId);
              setSelectedEntry(null);
              Alert.alert("Deleted", "Transaction removed successfully.");
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Failed to delete transaction.");
            }
          },
        },
      ]
    );
  };

  const handleSaveAccount = async () => {
    if (!accName.trim()) {
      Alert.alert("Required", "Please enter an account name.");
      return;
    }
    const op = parseFloat(accOpening) || 0;
    try {
      await saveFundAccount({
        id: editingAccountId || `acc_${Date.now()}`,
        name: accName.trim(),
        type: accType,
        openingBalance: op,
        bankName: accBankName.trim(),
        accountNumber: accNumber.trim(),
        upiId: accUpiId.trim(),
      });
      setAccName("");
      setAccOpening("");
      setAccBankName("");
      setAccNumber("");
      setAccUpiId("");
      setEditingAccountId(null);
      Alert.alert("Saved", "Treasury account saved successfully.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save account.");
    }
  };

  const handleShareWhatsApp = async () => {
    const text = formatFundFlowWhatsApp(summary, dateBounds.label, userProfile);
    try {
      await Share.share({ message: text });
    } catch (e) {
      console.log("Share error:", e);
    }
  };

  const isLoading =
    loadingCustPayments || loadingExpenses || loadingRawLogs || loadingDirect;

  const renderEntryCard = (item: UnifiedFundEntry, idx: number = 0) => {
    const isInflow = item.type === "inflow";
    const isTransfer = item.type === "transfer";
    const isBonus =
      item.sourceType === "worker_bonus" ||
      item.sourceType === "delivery_bonus" ||
      item.sourceType === "customer_bonus";

    const color = isInflow
      ? colors.accent.success
      : isTransfer
      ? colors.accent.info
      : isBonus
      ? "#F59E0B"
      : colors.accent.danger;

    const iconName = isInflow
      ? "arrow-downward"
      : isTransfer
      ? "swap-horiz"
      : isBonus
      ? "stars"
      : "arrow-upward";

    return (
      <Animated.View
        key={item.id}
        entering={FadeInDown.delay(Math.min(idx * 15, 150))}
      >
        <Pressable
          style={styles.entryCard}
          onPress={() => setSelectedEntry(item)}
        >
          <View style={[styles.entryIconBox, { backgroundColor: color + "15" }]}>
            <MaterialIcons name={iconName as any} size={18} color={color} />
          </View>
          <View style={styles.entryMain}>
            <View style={styles.entryRowBetween}>
              <Text style={styles.entryTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.entryAmount, { color }]}>
                {isInflow ? "+" : isTransfer ? "⇄" : "-"}
                {formatCurrency(item.amount)}
              </Text>
            </View>

            <View style={styles.entryMetaRow}>
              <Text style={styles.entryMetaCategory}>{item.category}</Text>
              <Text style={styles.entryDot}>•</Text>
              <Text style={styles.entryMetaAcc}>
                {item.accountName || item.paymentMethod}
              </Text>
              <Text style={styles.entryDot}>•</Text>
              <Text style={styles.entryMetaDate}>{formatDate(item.date)}</Text>
              {item.runningBalance !== undefined && (
                <>
                  <Text style={styles.entryDot}>•</Text>
                  <View style={styles.runningBalBadge}>
                    <Text style={styles.runningBalText}>
                      Bal: {formatCurrency(item.runningBalance)}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {item.notes ? (
              <Text style={styles.entryNotes} numberOfLines={1}>
                {item.notes}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <ProtectedRoute>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <BackButton />
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Fund Flow Management</Text>
            <Text style={styles.headerSubtitle}>
              {dateBounds.label} • {summary.netFlow >= 0 ? "Surplus" : "Deficit"}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => setIsAccountsModalOpen(true)}
              android_ripple={{ borderless: true, color: colors.border.subtle }}
            >
              <MaterialIcons name="account-balance" size={20} color={colors.text.primary} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => setIsExportModalOpen(true)}
              android_ripple={{ borderless: true, color: colors.border.subtle }}
            >
              <MaterialIcons name="share" size={20} color={colors.accent.primary} />
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Treasury Accounts Carousel */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Treasury & Liquid Balances</Text>
            <Pressable onPress={() => setIsAccountsModalOpen(true)}>
              <Text style={styles.sectionActionText}>Manage Accounts</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.treasuryScroll}
          >
            {/* Total Liquid Portfolio Card */}
            <Pressable
              style={[
                styles.treasuryCard,
                selectedAccountId === "all" && styles.treasuryCardActive,
                { borderLeftColor: colors.accent.primary, borderLeftWidth: 4 },
              ]}
              onPress={() => setSelectedAccountId("all")}
            >
              <View style={styles.treasuryCardHeader}>
                <View style={[styles.accIconWrap, { backgroundColor: colors.accent.primary + "15" }]}>
                  <MaterialIcons name="account-balance-wallet" size={18} color={colors.accent.primary} />
                </View>
                <Text style={styles.accBadge}>All Funds</Text>
              </View>
              <Text style={styles.treasuryTitle}>Total Liquid Cash</Text>
              <Text
                style={[
                  styles.treasuryAmount,
                  { color: totalLiquidBalance >= 0 ? colors.accent.primary : colors.accent.danger },
                ]}
              >
                {formatCurrency(totalLiquidBalance)}
              </Text>
              <Text style={styles.treasuryMeta}>{fundAccounts.length} Connected Accounts</Text>
            </Pressable>

            {/* Individual Accounts */}
            {fundAccounts.map((acc) => {
              const accBal = accountBalances[acc.id]?.balance || 0;
              const isSelected = selectedAccountId === acc.id;
              const iconName =
                acc.type === "cash"
                  ? "payments"
                  : acc.type === "upi"
                  ? "qr-code"
                  : "account-balance";
              const accColor =
                acc.type === "cash"
                  ? colors.accent.success
                  : acc.type === "upi"
                  ? "#8B5CF6"
                  : colors.accent.info;

              return (
                <Pressable
                  key={acc.id}
                  style={[
                    styles.treasuryCard,
                    isSelected && styles.treasuryCardActive,
                    { borderLeftColor: accColor, borderLeftWidth: 4 },
                  ]}
                  onPress={() => setSelectedAccountId(isSelected ? "all" : acc.id)}
                >
                  <View style={styles.treasuryCardHeader}>
                    <View style={[styles.accIconWrap, { backgroundColor: accColor + "15" }]}>
                      <MaterialIcons name={iconName as any} size={18} color={accColor} />
                    </View>
                    <View style={styles.treasuryBadgeRow}>
                      {accBal < 5000 && accBal >= 0 && (
                        <View style={styles.lowBalBadge}>
                          <MaterialIcons name="warning" size={10} color="#D97706" />
                          <Text style={styles.lowBalBadgeText}>Low</Text>
                        </View>
                      )}
                      {accBal < 0 && (
                        <View style={[styles.lowBalBadge, { backgroundColor: colors.accent.danger + "20" }]}>
                          <MaterialIcons name="error" size={10} color={colors.accent.danger} />
                          <Text style={[styles.lowBalBadgeText, { color: colors.accent.danger }]}>Negative</Text>
                        </View>
                      )}
                      <Text style={styles.accBadge}>{acc.type.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.treasuryTitle} numberOfLines={1}>
                    {acc.name}
                  </Text>
                  <Text
                    style={[
                      styles.treasuryAmount,
                      { color: accBal >= 0 ? colors.text.primary : colors.accent.danger },
                    ]}
                  >
                    {formatCurrency(accBal)}
                  </Text>
                  <Text style={styles.treasuryMeta}>
                    Opening: {formatCurrency(acc.openingBalance)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Period Selector Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.periodPillsContainer}
          >
            {PERIOD_LIST.map((p) => {
              const active = selectedPeriod === p.id;
              return (
                <Pressable
                  key={p.id}
                  style={[styles.periodPill, active && styles.periodPillActive]}
                  onPress={() => {
                    setSelectedPeriod(p.id);
                    if (p.id === "custom") {
                      setCalendarTarget("start");
                    }
                  }}
                >
                  <Text style={[styles.periodPillText, active && styles.periodPillTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Custom Date Pickers if selected */}
          {selectedPeriod === "custom" && (
            <View style={styles.customDateRow}>
              <Pressable
                style={styles.customDateBtn}
                onPress={() => setCalendarTarget("start")}
              >
                <MaterialIcons name="event" size={16} color={colors.accent.primary} />
                <Text style={styles.customDateBtnText}>
                  From: {customStart ? formatDate(customStart) : "Select"}
                </Text>
              </Pressable>
              <Pressable
                style={styles.customDateBtn}
                onPress={() => setCalendarTarget("end")}
              >
                <MaterialIcons name="event" size={16} color={colors.accent.primary} />
                <Text style={styles.customDateBtnText}>
                  To: {customEnd ? formatDate(customEnd) : "Select"}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Key Executive Metrics */}
          <View style={styles.metricGrid}>
            {/* Net Fund Flow */}
            <View
              style={[
                styles.metricCard,
                {
                  borderLeftColor:
                    summary.netFlow >= 0 ? colors.accent.success : colors.accent.danger,
                },
              ]}
            >
              <View style={styles.metricRowTop}>
                <Text style={styles.metricLabel}>Net Fund Flow</Text>
                <View
                  style={[
                    styles.tagBadge,
                    {
                      backgroundColor:
                        (summary.netFlow >= 0 ? colors.accent.success : colors.accent.danger) + "20",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tagBadgeText,
                      {
                        color: summary.netFlow >= 0 ? colors.accent.success : colors.accent.danger,
                      },
                    ]}
                  >
                    {summary.netFlow >= 0 ? "SURPLUS" : "DEFICIT"}
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  styles.metricValueLarge,
                  {
                    color: summary.netFlow >= 0 ? colors.accent.success : colors.accent.danger,
                  },
                ]}
              >
                {summary.netFlow >= 0 ? "+" : ""}
                {formatCurrency(summary.netFlow)}
              </Text>
              <Text style={styles.metricSub}>
                Coverage: {summary.coverageRatio.toFixed(2)}x inflow vs outflow
              </Text>
            </View>

            {/* Inflows, Outflows & Transfers Row */}
            <View style={styles.metricsRowGrid}>
              <View
                style={[
                  styles.metricCardSmall,
                  { borderLeftColor: colors.accent.success, borderLeftWidth: 3 },
                ]}
              >
                <View style={styles.miniIconRow}>
                  <View style={[styles.miniIcon, { backgroundColor: colors.accent.success + "15" }]}>
                    <MaterialIcons name="arrow-downward" size={14} color={colors.accent.success} />
                  </View>
                  <Text style={styles.metricLabelSmall}>Inflows</Text>
                </View>
                <Text style={[styles.metricValueSmall, { color: colors.accent.success }]}>
                  {formatCurrency(summary.totalInflow)}
                </Text>
                <Text style={styles.metricCountText}>{summary.inflowCount} Receipts</Text>
              </View>

              <View
                style={[
                  styles.metricCardSmall,
                  { borderLeftColor: colors.accent.danger, borderLeftWidth: 3 },
                ]}
              >
                <View style={styles.miniIconRow}>
                  <View style={[styles.miniIcon, { backgroundColor: colors.accent.danger + "15" }]}>
                    <MaterialIcons name="arrow-upward" size={14} color={colors.accent.danger} />
                  </View>
                  <Text style={styles.metricLabelSmall}>Outflows</Text>
                </View>
                <Text style={[styles.metricValueSmall, { color: colors.accent.danger }]}>
                  {formatCurrency(summary.totalOutflow)}
                </Text>
                <Text style={styles.metricCountText}>{summary.outflowCount} Payments</Text>
              </View>

              <View
                style={[
                  styles.metricCardSmall,
                  { borderLeftColor: colors.accent.info, borderLeftWidth: 3 },
                ]}
              >
                <View style={styles.miniIconRow}>
                  <View style={[styles.miniIcon, { backgroundColor: colors.accent.info + "15" }]}>
                    <MaterialIcons name="swap-horiz" size={14} color={colors.accent.info} />
                  </View>
                  <Text style={styles.metricLabelSmall}>Transfers</Text>
                </View>
                <Text style={[styles.metricValueSmall, { color: colors.accent.info }]}>
                  {formatCurrency(summary.transferVolume)}
                </Text>
                <Text style={styles.metricCountText}>{summary.transferCount} Contra</Text>
              </View>
            </View>
          </View>

          {/* Quick Action Buttons */}
          <View style={styles.quickActionRow}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.accent.success }]}
              onPress={() => handleOpenInflowModal()}
            >
              <MaterialIcons name="add-circle" size={18} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>+ Inflow</Text>
            </Pressable>

            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.accent.danger }]}
              onPress={() => handleOpenOutflowModal()}
            >
              <MaterialIcons name="remove-circle" size={18} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>- Outflow</Text>
            </Pressable>

            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.accent.info }]}
              onPress={() => handleOpenTransferModal()}
            >
              <MaterialIcons name="swap-horiz" size={18} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Transfer</Text>
            </Pressable>
          </View>

          {/* Tab Navigation */}
          <View style={styles.tabBar}>
            <Pressable
              style={[styles.tabItem, activeTab === "ledger" && styles.tabItemActive]}
              onPress={() => setActiveTab("ledger")}
            >
              <MaterialIcons
                name="receipt-long"
                size={16}
                color={activeTab === "ledger" ? colors.accent.primary : colors.text.muted}
              />
              <Text
                style={[styles.tabItemText, activeTab === "ledger" && styles.tabItemTextActive]}
              >
                Ledger ({filteredEntries.length})
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tabItem, activeTab === "statement" && styles.tabItemActive]}
              onPress={() => setActiveTab("statement")}
            >
              <MaterialIcons
                name="analytics"
                size={16}
                color={activeTab === "statement" ? colors.accent.primary : colors.text.muted}
              />
              <Text
                style={[styles.tabItemText, activeTab === "statement" && styles.tabItemTextActive]}
              >
                Statement & Sources
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tabItem, activeTab === "accounts" && styles.tabItemActive]}
              onPress={() => setActiveTab("accounts")}
            >
              <MaterialIcons
                name="account-balance"
                size={16}
                color={activeTab === "accounts" ? colors.accent.primary : colors.text.muted}
              />
              <Text
                style={[styles.tabItemText, activeTab === "accounts" && styles.tabItemTextActive]}
              >
                Accounts ({fundAccounts.length})
              </Text>
            </Pressable>
          </View>

          {/* TAB 1: LEDGER */}
          {activeTab === "ledger" && (
            <View style={styles.tabContent}>
              {/* Search & Movement Type Filter Bar */}
              <View style={styles.filterBar}>
                <View style={styles.searchBox}>
                  <MaterialIcons name="search" size={18} color={colors.text.muted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by payee, category, notes, ref..."
                    placeholderTextColor={colors.text.muted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery ? (
                    <Pressable onPress={() => setSearchQuery("")}>
                      <MaterialIcons name="close" size={16} color={colors.text.muted} />
                    </Pressable>
                  ) : null}
                </View>

                {/* Inflow / Outflow / Transfer Toggle Chips */}
                <View style={styles.typeChipsRow}>
                  {(["all", "inflow", "outflow", "transfer"] as const).map((t) => {
                    const isCur = typeFilter === t;
                    const label =
                      t === "all"
                        ? "All"
                        : t === "inflow"
                        ? "Inflows"
                        : t === "outflow"
                        ? "Outflows"
                        : "Transfers";
                    return (
                      <Pressable
                        key={t}
                        style={[styles.typeChip, isCur && styles.typeChipActive]}
                        onPress={() => setTypeFilter(t)}
                      >
                        <Text
                          style={[styles.typeChipText, isCur && styles.typeChipTextActive]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Dynamic Category Drilldown Chips */}
                {typeFilter !== "all" && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryChipsScroll}
                  >
                    <Pressable
                      style={[
                        styles.categoryChip,
                        selectedCategory === "all" && styles.categoryChipActive,
                      ]}
                      onPress={() => setSelectedCategory("all")}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          selectedCategory === "all" && styles.categoryChipTextActive,
                        ]}
                      >
                        All Categories
                      </Text>
                    </Pressable>
                    {(typeFilter === "inflow"
                      ? INFLOW_CATEGORIES
                      : typeFilter === "outflow"
                      ? OUTFLOW_CATEGORIES
                      : TRANSFER_CATEGORIES
                    ).map((cat) => {
                      const isCatActive = selectedCategory === cat;
                      return (
                        <Pressable
                          key={cat}
                          style={[styles.categoryChip, isCatActive && styles.categoryChipActive]}
                          onPress={() => setSelectedCategory(isCatActive ? "all" : cat)}
                        >
                          <Text
                            style={[
                              styles.categoryChipText,
                              isCatActive && styles.categoryChipTextActive,
                            ]}
                          >
                            {cat}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}

                {/* Ledger Controls Bar: Count & View Switch */}
                <View style={styles.ledgerControlsRow}>
                  <Text style={styles.ledgerCountText}>
                    {filteredEntries.length} {filteredEntries.length === 1 ? "transaction" : "transactions"}
                    {selectedCategory !== "all" ? ` • ${selectedCategory}` : ""}
                  </Text>

                  <View style={styles.viewModeToggleWrap}>
                    <Pressable
                      style={[
                        styles.viewModeBtn,
                        ledgerViewMode === "grouped" && styles.viewModeBtnActive,
                      ]}
                      onPress={() => setLedgerViewMode("grouped")}
                    >
                      <MaterialIcons
                        name="view-agenda"
                        size={13}
                        color={ledgerViewMode === "grouped" ? "#FFFFFF" : colors.text.muted}
                      />
                      <Text
                        style={[
                          styles.viewModeBtnText,
                          ledgerViewMode === "grouped" && styles.viewModeBtnTextActive,
                        ]}
                      >
                        By Date
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.viewModeBtn,
                        ledgerViewMode === "flat" && styles.viewModeBtnActive,
                      ]}
                      onPress={() => setLedgerViewMode("flat")}
                    >
                      <MaterialIcons
                        name="view-list"
                        size={13}
                        color={ledgerViewMode === "flat" ? "#FFFFFF" : colors.text.muted}
                      />
                      <Text
                        style={[
                          styles.viewModeBtnText,
                          ledgerViewMode === "flat" && styles.viewModeBtnTextActive,
                        ]}
                      >
                        Flat
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Transactions Stream List */}
              {isLoading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={colors.accent.primary} />
                  <Text style={styles.loadingText}>Synchronizing Fund Stream...</Text>
                </View>
              ) : filteredEntries.length === 0 ? (
                <View style={styles.emptyBox}>
                  <MaterialIcons name="inbox" size={48} color={colors.text.muted} />
                  <Text style={styles.emptyTitle}>No Fund Movements Found</Text>
                  <Text style={styles.emptySubtitle}>
                    {searchQuery
                      ? "Try clearing your search query"
                      : "Record an inflow, outflow, or change date period."}
                  </Text>
                </View>
              ) : ledgerViewMode === "grouped" ? (
                // Grouped by Date View
                dateGroupedEntries.map((group) => (
                  <View key={group.dateKey} style={styles.dateGroupContainer}>
                    <View style={styles.dateGroupHeader}>
                      <View style={styles.dateGroupTitleRow}>
                        <MaterialIcons name="event" size={13} color={colors.text.muted} />
                        <Text style={styles.dateGroupTitle}>{group.dateLabel}</Text>
                        <Text style={styles.dateGroupCount}>({group.entries.length})</Text>
                      </View>
                      <View style={styles.dateGroupTotalsRow}>
                        {group.totalInflow > 0 && (
                          <Text style={styles.dayInflowText}>
                            +{formatCurrency(group.totalInflow)}
                          </Text>
                        )}
                        {group.totalOutflow > 0 && (
                          <Text style={styles.dayOutflowText}>
                            -{formatCurrency(group.totalOutflow)}
                          </Text>
                        )}
                      </View>
                    </View>
                    {group.entries.map((item, i) => renderEntryCard(item, i))}
                  </View>
                ))
              ) : (
                // Flat View
                displayedEntries.map((item, idx) => renderEntryCard(item, idx))
              )}

              {/* Load More Button for Pagination */}
              {filteredEntries.length > displayLimit && (
                <Pressable
                  style={styles.loadMoreBtn}
                  onPress={() => setDisplayLimit((prev) => prev + 50)}
                >
                  <MaterialIcons name="expand-more" size={18} color={colors.accent.primary} />
                  <Text style={styles.loadMoreBtnText}>
                    Load More ({filteredEntries.length - displayLimit} remaining)
                  </Text>
                </Pressable>
              )}

              {/* Quick Summary Sticky Footer */}
              {filteredEntries.length > 0 && (
                <View style={styles.ledgerQuickFooter}>
                  <View style={styles.quickFooterItem}>
                    <Text style={styles.quickFooterLabel}>ITEMS</Text>
                    <Text style={styles.quickFooterValue}>{filteredEntries.length}</Text>
                  </View>
                  <View style={styles.quickFooterItem}>
                    <Text style={styles.quickFooterLabel}>INFLOW</Text>
                    <Text style={[styles.quickFooterValue, { color: colors.accent.success }]}>
                      +{formatCurrency(summary.totalInflow)}
                    </Text>
                  </View>
                  <View style={styles.quickFooterItem}>
                    <Text style={styles.quickFooterLabel}>OUTFLOW</Text>
                    <Text style={[styles.quickFooterValue, { color: colors.accent.danger }]}>
                      -{formatCurrency(summary.totalOutflow)}
                    </Text>
                  </View>
                  <View style={styles.quickFooterItem}>
                    <Text style={styles.quickFooterLabel}>NET</Text>
                    <Text
                      style={[
                        styles.quickFooterValue,
                        { color: summary.netFlow >= 0 ? colors.accent.success : colors.accent.danger },
                      ]}
                    >
                      {summary.netFlow >= 0 ? "+" : ""}
                      {formatCurrency(summary.netFlow)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* TAB 2: STATEMENT & SOURCES */}
          {activeTab === "statement" && (
            <View style={styles.tabContent}>
              {/* Liquidity Reconciled Box */}
              <View style={styles.reconCard}>
                <Text style={styles.reconTitle}>Reconciliation & Closing Balance</Text>
                <View style={styles.reconRow}>
                  <Text style={styles.reconLabel}>Opening Liquid Funds:</Text>
                  <Text style={styles.reconVal}>
                    {formatCurrency(summary.openingLiquidFunds)}
                  </Text>
                </View>
                <View style={styles.reconRow}>
                  <Text style={styles.reconLabel}>(+) Total Inflow Received:</Text>
                  <Text style={[styles.reconVal, { color: colors.accent.success }]}>
                    +{formatCurrency(summary.totalInflow)}
                  </Text>
                </View>
                <View style={styles.reconRow}>
                  <Text style={styles.reconLabel}>(-) Total Outflows Paid:</Text>
                  <Text style={[styles.reconVal, { color: colors.accent.danger }]}>
                    -{formatCurrency(summary.totalOutflow)}
                  </Text>
                </View>
                <View style={[styles.reconRow, styles.reconRowTotal]}>
                  <Text style={styles.reconLabelTotal}>(=) Closing Liquid Funds:</Text>
                  <Text
                    style={[
                      styles.reconValTotal,
                      {
                        color:
                          summary.closingLiquidFunds >= 0
                            ? colors.accent.primary
                            : colors.accent.danger,
                      },
                    ]}
                  >
                    {formatCurrency(summary.closingLiquidFunds)}
                  </Text>
                </View>
              </View>

              {/* Daily Cash Flow Movement Trend Chart */}
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <View>
                    <Text style={styles.chartTitle}>Daily Cash Flow Movement</Text>
                    <Text style={styles.chartSubtitle}>
                      {dateBounds.label} • Inflow vs Outflow
                    </Text>
                  </View>
                  <View style={styles.chartLegendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.accent.success }]} />
                      <Text style={styles.legendText}>Inflow</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.accent.danger }]} />
                      <Text style={styles.legendText}>Outflow</Text>
                    </View>
                  </View>
                </View>

                {dailyCashFlowData.length === 0 ||
                dailyCashFlowData.every((p) => p.inflow === 0 && p.outflow === 0) ? (
                  <Text style={styles.chartEmptyText}>No daily movements recorded in this period.</Text>
                ) : (
                  (() => {
                    const maxVal = Math.max(
                      ...dailyCashFlowData.map((p) => Math.max(p.inflow, p.outflow)),
                      1
                    );
                    const maxHeight = 70;

                    return (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chartBarsScroll}
                      >
                        {dailyCashFlowData.map((pt, pIdx) => {
                          const inHeight = Math.max(
                            pt.inflow > 0 ? 4 : 0,
                            Math.round((pt.inflow / maxVal) * maxHeight)
                          );
                          const outHeight = Math.max(
                            pt.outflow > 0 ? 4 : 0,
                            Math.round((pt.outflow / maxVal) * maxHeight)
                          );
                          return (
                            <View key={pIdx} style={styles.chartBarCol}>
                              <View style={[styles.barsPairWrap, { height: maxHeight }]}>
                                {/* Inflow Bar */}
                                <View style={styles.barTrackCol}>
                                  {pt.inflow > 0 && (
                                    <View
                                      style={[
                                        styles.chartBarFill,
                                        {
                                          height: inHeight,
                                          backgroundColor: colors.accent.success,
                                        },
                                      ]}
                                    />
                                  )}
                                </View>
                                {/* Outflow Bar */}
                                <View style={styles.barTrackCol}>
                                  {pt.outflow > 0 && (
                                    <View
                                      style={[
                                        styles.chartBarFill,
                                        {
                                          height: outHeight,
                                          backgroundColor: colors.accent.danger,
                                        },
                                      ]}
                                    />
                                  )}
                                </View>
                              </View>
                              <Text style={styles.chartDateLabel} numberOfLines={1}>
                                {pt.dateLabel}
                              </Text>
                            </View>
                          );
                        })}
                      </ScrollView>
                    );
                  })()
                )}
              </View>

              {/* Sources of Funds Breakdown */}
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: colors.accent.success }]}>
                  Sources of Funds (Inflows)
                </Text>
                <Text style={styles.sectionSubtitleText}>
                  {formatCurrency(summary.totalInflow)}
                </Text>
              </View>

              {summary.inflowCategories.length === 0 ? (
                <Text style={styles.noDataText}>No inflows recorded in this period</Text>
              ) : (
                summary.inflowCategories.map((cat) => (
                  <View key={cat.category} style={styles.barItem}>
                    <View style={styles.barItemHeader}>
                      <Text style={styles.barItemTitle}>{cat.category}</Text>
                      <Text style={styles.barItemAmount}>{formatCurrency(cat.totalAmount)}</Text>
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(100, Math.max(2, cat.percentage))}%`,
                            backgroundColor: colors.accent.success,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.barItemFooter}>
                      <Text style={styles.barItemMeta}>{cat.count} items</Text>
                      <Text style={styles.barItemMeta}>{cat.percentage.toFixed(1)}%</Text>
                    </View>
                  </View>
                ))
              )}

              {/* Applications of Funds Breakdown */}
              <View style={[styles.sectionHead, { marginTop: spacing.lg }]}>
                <Text style={[styles.sectionTitle, { color: colors.accent.danger }]}>
                  Applications of Funds (Outflows)
                </Text>
                <Text style={styles.sectionSubtitleText}>
                  {formatCurrency(summary.totalOutflow)}
                </Text>
              </View>

              {summary.outflowCategories.length === 0 ? (
                <Text style={styles.noDataText}>No outflows recorded in this period</Text>
              ) : (
                summary.outflowCategories.map((cat) => (
                  <View key={cat.category} style={styles.barItem}>
                    <View style={styles.barItemHeader}>
                      <Text style={styles.barItemTitle}>{cat.category}</Text>
                      <Text style={styles.barItemAmount}>{formatCurrency(cat.totalAmount)}</Text>
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(100, Math.max(2, cat.percentage))}%`,
                            backgroundColor: colors.accent.danger,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.barItemFooter}>
                      <Text style={styles.barItemMeta}>{cat.count} items</Text>
                      <Text style={styles.barItemMeta}>{cat.percentage.toFixed(1)}%</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 3: ACCOUNTS */}
          {activeTab === "accounts" && (
            <View style={styles.tabContent}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Connected Accounts & Balances</Text>
                <Pressable onPress={() => setIsAccountsModalOpen(true)}>
                  <Text style={styles.sectionActionText}>+ New Account</Text>
                </Pressable>
              </View>

              {fundAccounts.map((acc) => {
                const balInfo = accountBalances[acc.id] || { balance: 0, inflowTotal: 0, outflowTotal: 0, count: 0 };
                const netChange = balInfo.inflowTotal - balInfo.outflowTotal;
                const isLow = balInfo.balance < 5000 && balInfo.balance >= 0;
                const isNeg = balInfo.balance < 0;

                return (
                  <View key={acc.id} style={styles.accountFullCard}>
                    <View style={styles.accountFullHeader}>
                      <View style={styles.accountFullTitleWrap}>
                        <Text style={styles.accountFullName}>{acc.name}</Text>
                        <View style={styles.tagBadge}>
                          <Text style={styles.tagBadgeText}>{acc.type.toUpperCase()}</Text>
                        </View>
                        {isLow && (
                          <View style={styles.lowBalBadge}>
                            <MaterialIcons name="warning" size={10} color="#D97706" />
                            <Text style={styles.lowBalBadgeText}>Low Liquidity</Text>
                          </View>
                        )}
                        {isNeg && (
                          <View style={[styles.lowBalBadge, { backgroundColor: colors.accent.danger + "20" }]}>
                            <MaterialIcons name="error" size={10} color={colors.accent.danger} />
                            <Text style={[styles.lowBalBadgeText, { color: colors.accent.danger }]}>Negative</Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.accountFullBalance,
                          {
                            color:
                              balInfo.balance >= 0 ? colors.accent.primary : colors.accent.danger,
                          },
                        ]}
                      >
                        {formatCurrency(balInfo.balance)}
                      </Text>
                    </View>

                    <View style={styles.accountFullDetails}>
                      <Text style={styles.accountDetailItem}>
                        Opening: {formatCurrency(acc.openingBalance)} • {balInfo.count} Transactions
                      </Text>
                      {acc.bankName ? (
                        <Text style={styles.accountDetailItem}>Bank: {acc.bankName}</Text>
                      ) : null}
                      {acc.accountNumber ? (
                        <Text style={styles.accountDetailItem}>A/C: {acc.accountNumber}</Text>
                      ) : null}
                      {acc.upiId ? (
                        <Text style={styles.accountDetailItem}>UPI: {acc.upiId}</Text>
                      ) : null}
                    </View>

                    <View style={styles.accountFullStats}>
                      <Text style={styles.accStatGreen}>
                        Inflows: +{formatCurrency(balInfo.inflowTotal)}
                      </Text>
                      <Text style={styles.accStatRed}>
                        Outflows: -{formatCurrency(balInfo.outflowTotal)}
                      </Text>
                      <Text
                        style={[
                          styles.accStatNet,
                          { color: netChange >= 0 ? colors.accent.success : colors.accent.danger },
                        ]}
                      >
                        Net: {netChange >= 0 ? "+" : ""}{formatCurrency(netChange)}
                      </Text>
                    </View>

                    {/* Quick Action Buttons on Account Card */}
                    <View style={styles.accountCardActions}>
                      <Pressable
                        style={[styles.accActionBtn, { backgroundColor: colors.accent.success + "15" }]}
                        onPress={() => handleOpenInflowModal(acc.id)}
                      >
                        <MaterialIcons name="add" size={14} color={colors.accent.success} />
                        <Text style={[styles.accActionText, { color: colors.accent.success }]}>
                          Deposit
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[styles.accActionBtn, { backgroundColor: colors.accent.danger + "15" }]}
                        onPress={() => handleOpenOutflowModal(acc.id)}
                      >
                        <MaterialIcons name="remove" size={14} color={colors.accent.danger} />
                        <Text style={[styles.accActionText, { color: colors.accent.danger }]}>
                          Withdraw
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[styles.accActionBtn, { backgroundColor: colors.accent.info + "15" }]}
                        onPress={() => handleOpenTransferModal(acc.id)}
                      >
                        <MaterialIcons name="swap-horiz" size={14} color={colors.accent.info} />
                        <Text style={[styles.accActionText, { color: colors.accent.info }]}>
                          Transfer
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* ─── MODAL 1: RECORD INFLOW ─── */}
        <Modal
          visible={isInflowModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsInflowModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Record Fund Inflow (+)</Text>
                <Pressable onPress={() => setIsInflowModalOpen(false)}>
                  <MaterialIcons name="close" size={24} color={colors.text.primary} />
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <Text style={styles.inputLabel}>Inflow Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {INFLOW_CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat}
                      style={[styles.formChip, formCategory === cat && styles.formChipActive]}
                      onPress={() => setFormCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.formChipText,
                          formCategory === cat && styles.formChipTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Amount (₹)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="Enter amount (e.g. 25000)"
                  placeholderTextColor={colors.text.muted}
                  value={formAmount}
                  onChangeText={setFormAmount}
                />

                <Text style={styles.inputLabel}>Deposit To Account</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {fundAccounts.map((acc) => (
                    <Pressable
                      key={acc.id}
                      style={[styles.formChip, formToAccountId === acc.id && styles.formChipActive]}
                      onPress={() => setFormToAccountId(acc.id)}
                    >
                      <Text
                        style={[
                          styles.formChipText,
                          formToAccountId === acc.id && styles.formChipTextActive,
                        ]}
                      >
                        {acc.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Payment Method</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {PAYMENT_METHODS.map((m) => (
                    <Pressable
                      key={m}
                      style={[styles.formChip, formMethod === m && styles.formChipActive]}
                      onPress={() => setFormMethod(m)}
                    >
                      <Text
                        style={[styles.formChipText, formMethod === m && styles.formChipTextActive]}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Date</Text>
                <Pressable
                  style={styles.datePickerTrigger}
                  onPress={() => setCalendarTarget("record")}
                >
                  <MaterialIcons name="calendar-today" size={18} color={colors.accent.primary} />
                  <Text style={styles.datePickerTriggerText}>{formatDate(formDate)}</Text>
                </Pressable>

                <Text style={styles.inputLabel}>Reference / Cheque Number</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Optional reference / UTR number"
                  placeholderTextColor={colors.text.muted}
                  value={formRef}
                  onChangeText={setFormRef}
                />

                <Text style={styles.inputLabel}>Notes / Particulars</Text>
                <TextInput
                  style={[styles.textInput, { height: 70 }]}
                  multiline
                  placeholder="Additional remarks or particulars"
                  placeholderTextColor={colors.text.muted}
                  value={formNotes}
                  onChangeText={setFormNotes}
                />
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => setIsInflowModalOpen(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalBtn,
                    { backgroundColor: colors.accent.success },
                    savingForm && { opacity: 0.7 },
                  ]}
                  onPress={handleSaveInflow}
                  disabled={savingForm}
                >
                  {savingForm ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSaveBtnText}>Save Inflow</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ─── MODAL 2: RECORD OUTFLOW ─── */}
        <Modal
          visible={isOutflowModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsOutflowModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Record Fund Outflow (-)</Text>
                <Pressable onPress={() => setIsOutflowModalOpen(false)}>
                  <MaterialIcons name="close" size={24} color={colors.text.primary} />
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <Text style={styles.inputLabel}>Outflow Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {OUTFLOW_CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat}
                      style={[styles.formChip, formCategory === cat && styles.formChipActive]}
                      onPress={() => setFormCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.formChipText,
                          formCategory === cat && styles.formChipTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Amount (₹)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="Enter amount (e.g. 5000)"
                  placeholderTextColor={colors.text.muted}
                  value={formAmount}
                  onChangeText={setFormAmount}
                />

                <Text style={styles.inputLabel}>Pay From Account</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {fundAccounts.map((acc) => (
                    <Pressable
                      key={acc.id}
                      style={[
                        styles.formChip,
                        formFromAccountId === acc.id && styles.formChipActive,
                      ]}
                      onPress={() => setFormFromAccountId(acc.id)}
                    >
                      <Text
                        style={[
                          styles.formChipText,
                          formFromAccountId === acc.id && styles.formChipTextActive,
                        ]}
                      >
                        {acc.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Payment Method</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {PAYMENT_METHODS.map((m) => (
                    <Pressable
                      key={m}
                      style={[styles.formChip, formMethod === m && styles.formChipActive]}
                      onPress={() => setFormMethod(m)}
                    >
                      <Text
                        style={[styles.formChipText, formMethod === m && styles.formChipTextActive]}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Date</Text>
                <Pressable
                  style={styles.datePickerTrigger}
                  onPress={() => setCalendarTarget("record")}
                >
                  <MaterialIcons name="calendar-today" size={18} color={colors.accent.primary} />
                  <Text style={styles.datePickerTriggerText}>{formatDate(formDate)}</Text>
                </Pressable>

                <Text style={styles.inputLabel}>Reference / Voucher Number</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Optional reference / voucher"
                  placeholderTextColor={colors.text.muted}
                  value={formRef}
                  onChangeText={setFormRef}
                />

                <Text style={styles.inputLabel}>Notes / Payee Details</Text>
                <TextInput
                  style={[styles.textInput, { height: 70 }]}
                  multiline
                  placeholder="Purpose or payee name"
                  placeholderTextColor={colors.text.muted}
                  value={formNotes}
                  onChangeText={setFormNotes}
                />
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => setIsOutflowModalOpen(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalBtn,
                    { backgroundColor: colors.accent.danger },
                    savingForm && { opacity: 0.7 },
                  ]}
                  onPress={handleSaveOutflow}
                  disabled={savingForm}
                >
                  {savingForm ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSaveBtnText}>Save Outflow</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ─── MODAL 3: CONTRA TRANSFER ─── */}
        <Modal
          visible={isTransferModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsTransferModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Contra Fund Transfer (⇄)</Text>
                <Pressable onPress={() => setIsTransferModalOpen(false)}>
                  <MaterialIcons name="close" size={24} color={colors.text.primary} />
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <Text style={styles.inputLabel}>Transfer Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {TRANSFER_CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat}
                      style={[styles.formChip, formCategory === cat && styles.formChipActive]}
                      onPress={() => setFormCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.formChipText,
                          formCategory === cat && styles.formChipTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Amount (₹)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="Enter transfer amount"
                  placeholderTextColor={colors.text.muted}
                  value={formAmount}
                  onChangeText={setFormAmount}
                />

                <Text style={styles.inputLabel}>From Account (Source)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {fundAccounts.map((acc) => (
                    <Pressable
                      key={acc.id}
                      style={[
                        styles.formChip,
                        formFromAccountId === acc.id && styles.formChipActive,
                      ]}
                      onPress={() => setFormFromAccountId(acc.id)}
                    >
                      <Text
                        style={[
                          styles.formChipText,
                          formFromAccountId === acc.id && styles.formChipTextActive,
                        ]}
                      >
                        {acc.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>To Account (Destination)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {fundAccounts.map((acc) => (
                    <Pressable
                      key={acc.id}
                      style={[
                        styles.formChip,
                        formToAccountId === acc.id && styles.formChipActive,
                      ]}
                      onPress={() => setFormToAccountId(acc.id)}
                    >
                      <Text
                        style={[
                          styles.formChipText,
                          formToAccountId === acc.id && styles.formChipTextActive,
                        ]}
                      >
                        {acc.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Date</Text>
                <Pressable
                  style={styles.datePickerTrigger}
                  onPress={() => setCalendarTarget("record")}
                >
                  <MaterialIcons name="calendar-today" size={18} color={colors.accent.primary} />
                  <Text style={styles.datePickerTriggerText}>{formatDate(formDate)}</Text>
                </Pressable>

                <Text style={styles.inputLabel}>Reference / UTR / Cheque</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Reference number"
                  placeholderTextColor={colors.text.muted}
                  value={formRef}
                  onChangeText={setFormRef}
                />

                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={[styles.textInput, { height: 60 }]}
                  multiline
                  placeholder="Additional notes"
                  placeholderTextColor={colors.text.muted}
                  value={formNotes}
                  onChangeText={setFormNotes}
                />
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => setIsTransferModalOpen(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalBtn,
                    { backgroundColor: colors.accent.info },
                    savingForm && { opacity: 0.7 },
                  ]}
                  onPress={handleSaveTransfer}
                  disabled={savingForm}
                >
                  {savingForm ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSaveBtnText}>Execute Transfer</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ─── MODAL 4: MANAGE ACCOUNTS ─── */}
        <Modal
          visible={isAccountsModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsAccountsModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Manage Treasury Accounts</Text>
                <Pressable onPress={() => setIsAccountsModalOpen(false)}>
                  <MaterialIcons name="close" size={24} color={colors.text.primary} />
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalSectionTitle}>Add / Edit Account</Text>

                <Text style={styles.inputLabel}>Account Name *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. HDFC Current A/C, Cash Box"
                  placeholderTextColor={colors.text.muted}
                  value={accName}
                  onChangeText={setAccName}
                />

                <Text style={styles.inputLabel}>Account Type</Text>
                <View style={styles.typeChipsRow}>
                  {(["bank", "cash", "upi", "other"] as FundAccountType[]).map((t) => (
                    <Pressable
                      key={t}
                      style={[styles.typeChip, accType === t && styles.typeChipActive]}
                      onPress={() => setAccType(t)}
                    >
                      <Text
                        style={[styles.typeChipText, accType === t && styles.typeChipTextActive]}
                      >
                        {t.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Opening Balance (₹)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.text.muted}
                  value={accOpening}
                  onChangeText={setAccOpening}
                />

                {accType === "bank" && (
                  <>
                    <Text style={styles.inputLabel}>Bank Name</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. State Bank of India, HDFC"
                      placeholderTextColor={colors.text.muted}
                      value={accBankName}
                      onChangeText={setAccBankName}
                    />
                    <Text style={styles.inputLabel}>Account Number</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Account number or last 4 digits"
                      placeholderTextColor={colors.text.muted}
                      value={accNumber}
                      onChangeText={setAccNumber}
                    />
                  </>
                )}

                {accType === "upi" && (
                  <>
                    <Text style={styles.inputLabel}>UPI ID</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. merchant@okhdfcbank"
                      placeholderTextColor={colors.text.muted}
                      value={accUpiId}
                      onChangeText={setAccUpiId}
                    />
                  </>
                )}

                <Pressable
                  style={[styles.modalBtn, { backgroundColor: colors.accent.primary, marginTop: 12 }]}
                  onPress={handleSaveAccount}
                >
                  <Text style={styles.modalSaveBtnText}>
                    {editingAccountId ? "Update Account" : "+ Save New Account"}
                  </Text>
                </Pressable>

                <View style={{ height: 20 }} />
                <Text style={styles.modalSectionTitle}>Existing Accounts</Text>
                {fundAccounts.map((a) => (
                  <View key={a.id} style={styles.accListItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.accListName}>{a.name}</Text>
                      <Text style={styles.accListMeta}>
                        {a.type.toUpperCase()} • Opening: {formatCurrency(a.openingBalance)}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() => {
                        setEditingAccountId(a.id);
                        setAccName(a.name);
                        setAccType(a.type);
                        setAccOpening(String(a.openingBalance || 0));
                        setAccBankName(a.bankName || "");
                        setAccNumber(a.accountNumber || "");
                        setAccUpiId(a.upiId || "");
                      }}
                    >
                      <MaterialIcons name="edit" size={18} color={colors.accent.primary} />
                    </Pressable>
                    {!a.isDefault && (
                      <Pressable
                        style={styles.iconBtn}
                        onPress={() => {
                          Alert.alert("Confirm", `Delete account ${a.name}?`, [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () => deleteFundAccount(a.id),
                            },
                          ]);
                        }}
                      >
                        <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.modalBtn, styles.modalCancelBtn, { flex: 1 }]}
                  onPress={() => {
                    setIsAccountsModalOpen(false);
                    setEditingAccountId(null);
                  }}
                >
                  <Text style={styles.modalCancelBtnText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ─── MODAL 5: TRANSACTION DETAILS ─── */}
        <Modal
          visible={!!selectedEntry}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedEntry(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              {selectedEntry && (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Fund Movement Details</Text>
                    <Pressable onPress={() => setSelectedEntry(null)}>
                      <MaterialIcons name="close" size={24} color={colors.text.primary} />
                    </Pressable>
                  </View>

                  <View style={styles.modalBody}>
                    <View style={styles.detailHighlightBox}>
                      <Text style={styles.detailTypeLabel}>
                        {selectedEntry.type.toUpperCase()} • {selectedEntry.sourceLabel}
                      </Text>
                      <Text
                        style={[
                          styles.detailAmount,
                          {
                            color:
                              selectedEntry.type === "inflow"
                                ? colors.accent.success
                                : selectedEntry.type === "transfer"
                                ? colors.accent.info
                                : colors.accent.danger,
                          },
                        ]}
                      >
                        {selectedEntry.type === "inflow"
                          ? "+"
                          : selectedEntry.type === "transfer"
                          ? "⇄"
                          : "-"}
                        {formatCurrency(selectedEntry.amount)}
                      </Text>
                      <Text style={styles.detailTitle}>{selectedEntry.title}</Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Category:</Text>
                      <Text style={styles.detailVal}>{selectedEntry.category}</Text>
                    </View>
                    {selectedEntry.partyName ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Party / Recipient:</Text>
                        <Text style={styles.detailVal}>{selectedEntry.partyName}</Text>
                      </View>
                    ) : null}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Account / Mode:</Text>
                      <Text style={styles.detailVal}>
                        {selectedEntry.accountName || selectedEntry.paymentMethod}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Date & Time:</Text>
                      <Text style={styles.detailVal}>
                        {formatDate(selectedEntry.date)} {formatTime(selectedEntry.date)}
                      </Text>
                    </View>
                    {selectedEntry.referenceNumber ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Reference #:</Text>
                        <Text style={styles.detailVal}>{selectedEntry.referenceNumber}</Text>
                      </View>
                    ) : null}
                    {selectedEntry.notes ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Notes:</Text>
                        <Text style={styles.detailVal}>{selectedEntry.notes}</Text>
                      </View>
                    ) : null}

                    {selectedEntry.isManual && (
                      <Pressable
                        style={styles.deleteEntryBtn}
                        onPress={() => handleDeleteEntry(selectedEntry)}
                      >
                        <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                        <Text style={styles.deleteEntryBtnText}>Delete Transaction</Text>
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.modalFooter}>
                    <Pressable
                      style={[styles.modalBtn, styles.modalCancelBtn, { flex: 1 }]}
                      onPress={() => setSelectedEntry(null)}
                    >
                      <Text style={styles.modalCancelBtnText}>Close</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* ─── MODAL 6: EXPORT & SHARE ─── */}
        <Modal
          visible={isExportModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsExportModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Export & Share Statement</Text>
                <Pressable onPress={() => setIsExportModalOpen(false)}>
                  <MaterialIcons name="close" size={24} color={colors.text.primary} />
                </Pressable>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.exportSubtitle}>
                  Generate and share Fund Flow statement for {dateBounds.label}:
                </Text>

                <Pressable
                  style={styles.exportOption}
                  onPress={() => {
                    setIsExportModalOpen(false);
                    exportFundFlowPdf(
                      summary,
                      filteredEntries,
                      fundAccounts,
                      dateBounds.label,
                      userProfile
                    );
                  }}
                >
                  <View style={[styles.exportIcon, { backgroundColor: "#EF444415" }]}>
                    <MaterialIcons name="picture-as-pdf" size={22} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exportOptionTitle}>Download / Share PDF Statement</Text>
                    <Text style={styles.exportOptionSub}>
                      Comprehensive PDF with executive cards, breakdowns & ledger
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
                </Pressable>

                <Pressable
                  style={styles.exportOption}
                  onPress={() => {
                    setIsExportModalOpen(false);
                    printFundFlowReport(
                      summary,
                      filteredEntries,
                      fundAccounts,
                      dateBounds.label,
                      userProfile
                    );
                  }}
                >
                  <View style={[styles.exportIcon, { backgroundColor: "#3B82F615" }]}>
                    <MaterialIcons name="print" size={22} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exportOptionTitle}>Print Statement</Text>
                    <Text style={styles.exportOptionSub}>Print directly to connected printer</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
                </Pressable>

                <Pressable
                  style={styles.exportOption}
                  onPress={() => {
                    setIsExportModalOpen(false);
                    exportFundFlowCsv(
                      summary,
                      filteredEntries,
                      fundAccounts,
                      dateBounds.label,
                      userProfile
                    );
                  }}
                >
                  <View style={[styles.exportIcon, { backgroundColor: "#10B98115" }]}>
                    <MaterialIcons name="table-view" size={22} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exportOptionTitle}>Export CSV / Excel</Text>
                    <Text style={styles.exportOptionSub}>
                      Spreadsheet format for accounting & audit
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
                </Pressable>

                <Pressable
                  style={styles.exportOption}
                  onPress={() => {
                    setIsExportModalOpen(false);
                    handleShareWhatsApp();
                  }}
                >
                  <View style={[styles.exportIcon, { backgroundColor: "#25D36615" }]}>
                    <MaterialIcons name="chat" size={22} color="#25D366" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exportOptionTitle}>Share via WhatsApp</Text>
                    <Text style={styles.exportOptionSub}>
                      Formatted text summary ready to send
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
                </Pressable>
              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.modalBtn, styles.modalCancelBtn, { flex: 1 }]}
                  onPress={() => setIsExportModalOpen(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ─── CALENDAR MODALS ─── */}
        <EasyCalendarModal
          visible={calendarTarget === "record"}
          date={formDate}
          onSelectDate={(d) => {
            setFormDate(d);
            setCalendarTarget(null);
          }}
          onClose={() => setCalendarTarget(null)}
          title="Select Date"
        />

        <EasyCalendarModal
          visible={calendarTarget === "start"}
          date={customStart || new Date()}
          onSelectDate={(d) => {
            setCustomStart(d);
            setSelectedPeriod("custom");
            setCalendarTarget(null);
          }}
          onClose={() => setCalendarTarget(null)}
          title="Select Start Date"
        />

        <EasyCalendarModal
          visible={calendarTarget === "end"}
          date={customEnd || new Date()}
          onSelectDate={(d) => {
            setCustomEnd(d);
            setSelectedPeriod("custom");
            setCalendarTarget(null);
          }}
          onClose={() => setCalendarTarget(null)}
          title="Select End Date"
        />
      </View>
    </ProtectedRoute>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.primary,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.bg.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.subtle,
    },
    headerTitleWrap: {
      flex: 1,
      marginLeft: theme.spacing.sm,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    headerSubtitle: {
      fontSize: 12,
      color: theme.colors.text.muted,
      marginTop: 2,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    iconBtn: {
      padding: theme.spacing.xs,
      borderRadius: theme.radius.sm,
    },
    scrollContent: {
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.xl * 2,
    },
    sectionHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing.sm,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    sectionActionText: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.colors.accent.primary,
    },
    sectionSubtitleText: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    treasuryScroll: {
      gap: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
    },
    treasuryCard: {
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.md,
      padding: theme.spacing.md,
      minWidth: 160,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      ...theme.shadows.sm,
    },
    treasuryCardActive: {
      borderColor: theme.colors.accent.primary,
      backgroundColor: theme.colors.bg.surfaceElevated || theme.colors.bg.surface,
    },
    treasuryCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing.xs,
    },
    accIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },
    accBadge: {
      fontSize: 10,
      fontWeight: "700",
      color: theme.colors.text.muted,
    },
    treasuryBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    lowBalBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
      backgroundColor: "#F59E0B20",
    },
    lowBalBadgeText: {
      fontSize: 9,
      fontWeight: "700",
      color: "#D97706",
    },
    treasuryTitle: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.text.muted,
    },
    treasuryAmount: {
      fontSize: 18,
      fontWeight: "800",
      marginVertical: 4,
    },
    treasuryMeta: {
      fontSize: 11,
      color: theme.colors.text.muted,
    },
    periodPillsContainer: {
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.sm,
    },
    periodPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: theme.colors.bg.surface,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
    },
    periodPillActive: {
      backgroundColor: theme.colors.accent.primary,
      borderColor: theme.colors.accent.primary,
    },
    periodPillText: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.text.secondary,
    },
    periodPillTextActive: {
      color: "#FFFFFF",
    },
    customDateRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
    },
    customDateBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      padding: 10,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.surface,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
    },
    customDateBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.text.primary,
    },
    metricGrid: {
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    metricCard: {
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.md,
      padding: theme.spacing.md,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      ...theme.shadows.sm,
    },
    metricRowTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    metricLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.text.muted,
      textTransform: "uppercase",
    },
    tagBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: theme.colors.border.subtle,
    },
    tagBadgeText: {
      fontSize: 10,
      fontWeight: "700",
    },
    metricValueLarge: {
      fontSize: 26,
      fontWeight: "900",
      marginVertical: 4,
    },
    metricSub: {
      fontSize: 12,
      color: theme.colors.text.muted,
    },
    twoColumnGrid: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    metricsRowGrid: {
      flexDirection: "row",
      gap: 6,
    },
    metricCardSmall: {
      flex: 1,
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.md,
      padding: theme.spacing.sm + 4,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      ...theme.shadows.sm,
    },
    miniIconRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
    },
    miniIcon: {
      width: 22,
      height: 22,
      borderRadius: 11,
      justifyContent: "center",
      alignItems: "center",
    },
    metricLabelSmall: {
      fontSize: 11,
      fontWeight: "600",
      color: theme.colors.text.muted,
      textTransform: "uppercase",
    },
    metricValueSmall: {
      fontSize: 17,
      fontWeight: "800",
    },
    metricCountText: {
      fontSize: 11,
      color: theme.colors.text.muted,
      marginTop: 2,
    },
    quickActionRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: theme.radius.md,
      ...theme.shadows.sm,
    },
    actionBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    tabBar: {
      flexDirection: "row",
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.md,
      padding: 3,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      marginBottom: theme.spacing.md,
    },
    tabItem: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 8,
      borderRadius: theme.radius.sm,
    },
    tabItemActive: {
      backgroundColor: theme.colors.bg.primary,
      ...theme.shadows.sm,
    },
    tabItemText: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.text.muted,
    },
    tabItemTextActive: {
      color: theme.colors.accent.primary,
      fontWeight: "700",
    },
    tabContent: {
      gap: theme.spacing.sm,
    },
    filterBar: {
      gap: theme.spacing.xs,
      marginBottom: theme.spacing.xs,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.md,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: theme.colors.text.primary,
      padding: 0,
    },
    typeChipsRow: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    typeChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: theme.colors.bg.surface,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
    },
    typeChipActive: {
      backgroundColor: theme.colors.text.primary,
      borderColor: theme.colors.text.primary,
    },
    typeChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: theme.colors.text.secondary,
    },
    typeChipTextActive: {
      color: theme.colors.bg.primary,
    },
    categoryChipsScroll: {
      gap: 6,
      paddingVertical: 4,
    },
    categoryChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: theme.colors.bg.surface,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
    },
    categoryChipActive: {
      backgroundColor: theme.colors.accent.primary,
      borderColor: theme.colors.accent.primary,
    },
    categoryChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: theme.colors.text.secondary,
    },
    categoryChipTextActive: {
      color: "#FFFFFF",
    },
    ledgerControlsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 4,
      marginBottom: 2,
    },
    ledgerCountText: {
      fontSize: 11,
      fontWeight: "600",
      color: theme.colors.text.muted,
    },
    viewModeToggleWrap: {
      flexDirection: "row",
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.sm,
      padding: 2,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      gap: 2,
    },
    viewModeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 4,
    },
    viewModeBtnActive: {
      backgroundColor: theme.colors.accent.primary,
    },
    viewModeBtnText: {
      fontSize: 10,
      fontWeight: "600",
      color: theme.colors.text.muted,
    },
    viewModeBtnTextActive: {
      color: "#FFFFFF",
    },
    dateGroupContainer: {
      marginBottom: theme.spacing.sm,
    },
    dateGroupHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 4,
      paddingVertical: 4,
      marginBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.subtle,
    },
    dateGroupTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    dateGroupTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    dateGroupCount: {
      fontSize: 11,
      color: theme.colors.text.muted,
    },
    dateGroupTotalsRow: {
      flexDirection: "row",
      gap: 8,
    },
    dayInflowText: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.colors.accent.success,
    },
    dayOutflowText: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.colors.accent.danger,
    },
    loadMoreBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: theme.colors.bg.surface,
      paddingVertical: 10,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      marginVertical: 8,
    },
    loadMoreBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.colors.accent.primary,
    },
    ledgerQuickFooter: {
      flexDirection: "row",
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.md,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      marginTop: 10,
      marginBottom: 4,
      ...theme.shadows.sm,
    },
    quickFooterItem: {
      flex: 1,
      alignItems: "center",
    },
    quickFooterLabel: {
      fontSize: 9,
      fontWeight: "700",
      color: theme.colors.text.muted,
      textTransform: "uppercase",
      marginBottom: 2,
    },
    quickFooterValue: {
      fontSize: 12,
      fontWeight: "800",
      color: theme.colors.text.primary,
    },
    entryCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.md,
      padding: theme.spacing.sm + 2,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      gap: theme.spacing.sm,
      marginBottom: 6,
      ...theme.shadows.sm,
    },
    entryIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
    },
    entryMain: {
      flex: 1,
    },
    entryRowBetween: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    entryTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.primary,
      flex: 1,
      marginRight: 8,
    },
    entryAmount: {
      fontSize: 14,
      fontWeight: "800",
    },
    entryMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 2,
      flexWrap: "wrap",
    },
    entryMetaCategory: {
      fontSize: 11,
      color: theme.colors.text.muted,
      fontWeight: "600",
    },
    entryDot: {
      fontSize: 11,
      color: theme.colors.text.muted,
      marginHorizontal: 4,
    },
    entryMetaAcc: {
      fontSize: 11,
      color: theme.colors.accent.primary,
      fontWeight: "500",
    },
    entryMetaDate: {
      fontSize: 11,
      color: theme.colors.text.muted,
    },
    runningBalBadge: {
      backgroundColor: theme.colors.accent.primary + "12",
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
    },
    runningBalText: {
      fontSize: 10,
      fontWeight: "700",
      color: theme.colors.accent.primary,
    },
    entryNotes: {
      fontSize: 11,
      color: theme.colors.text.muted,
      fontStyle: "italic",
      marginTop: 2,
    },
    chartCard: {
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.md,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      marginBottom: theme.spacing.md,
      ...theme.shadows.sm,
    },
    chartHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 12,
    },
    chartTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    chartSubtitle: {
      fontSize: 11,
      color: theme.colors.text.muted,
      marginTop: 1,
    },
    chartLegendRow: {
      flexDirection: "row",
      gap: 10,
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
      fontSize: 10,
      fontWeight: "600",
      color: theme.colors.text.muted,
    },
    chartBarsScroll: {
      flexDirection: "row",
      gap: 8,
      paddingVertical: 6,
      alignItems: "flex-end",
    },
    chartBarCol: {
      alignItems: "center",
      width: 38,
    },
    barsPairWrap: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 3,
      width: "100%",
      justifyContent: "center",
    },
    barTrackCol: {
      width: 12,
      height: "100%",
      justifyContent: "flex-end",
      alignItems: "center",
    },
    chartBarFill: {
      width: 12,
      borderTopLeftRadius: 3,
      borderTopRightRadius: 3,
    },
    chartDateLabel: {
      fontSize: 9,
      color: theme.colors.text.muted,
      marginTop: 6,
      textAlign: "center",
    },
    chartEmptyText: {
      fontSize: 12,
      color: theme.colors.text.muted,
      fontStyle: "italic",
      textAlign: "center",
      paddingVertical: 14,
    },
    reconCard: {
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.md,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      marginBottom: theme.spacing.md,
      ...theme.shadows.sm,
    },
    reconTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: 10,
    },
    reconRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginVertical: 3,
    },
    reconLabel: {
      fontSize: 13,
      color: theme.colors.text.secondary,
    },
    reconVal: {
      fontSize: 13,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    reconRowTotal: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border.subtle,
      paddingTop: 8,
      marginTop: 6,
    },
    reconLabelTotal: {
      fontSize: 14,
      fontWeight: "800",
      color: theme.colors.text.primary,
    },
    reconValTotal: {
      fontSize: 16,
      fontWeight: "900",
    },
    barItem: {
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      marginBottom: 6,
    },
    barItemHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    barItemTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.colors.text.primary,
    },
    barItemAmount: {
      fontSize: 13,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    progressBarTrack: {
      height: 6,
      backgroundColor: theme.colors.border.subtle,
      borderRadius: 3,
      overflow: "hidden",
      marginVertical: 4,
    },
    progressBarFill: {
      height: "100%",
      borderRadius: 3,
    },
    barItemFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    barItemMeta: {
      fontSize: 11,
      color: theme.colors.text.muted,
    },
    noDataText: {
      fontSize: 13,
      color: theme.colors.text.muted,
      fontStyle: "italic",
      marginVertical: 6,
    },
    accountFullCard: {
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.md,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      marginBottom: theme.spacing.sm,
      ...theme.shadows.sm,
    },
    accountFullHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    accountFullTitleWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    accountFullName: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    accountFullBalance: {
      fontSize: 18,
      fontWeight: "800",
    },
    accountFullDetails: {
      gap: 2,
      marginBottom: 6,
    },
    accountDetailItem: {
      fontSize: 12,
      color: theme.colors.text.muted,
    },
    accountFullStats: {
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: theme.colors.border.subtle,
      paddingTop: 6,
      marginTop: 4,
    },
    accStatGreen: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.accent.success,
    },
    accStatRed: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.accent.danger,
    },
    accStatNet: {
      fontSize: 12,
      fontWeight: "700",
    },
    accountCardActions: {
      flexDirection: "row",
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border.subtle,
      paddingTop: 8,
      marginTop: 6,
    },
    accActionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 6,
      borderRadius: theme.radius.sm,
    },
    accActionText: {
      fontSize: 11,
      fontWeight: "700",
    },
    loadingBox: {
      padding: theme.spacing.xl,
      alignItems: "center",
    },
    loadingText: {
      marginTop: 8,
      fontSize: 13,
      color: theme.colors.text.muted,
    },
    emptyBox: {
      padding: theme.spacing.xl,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginTop: 8,
    },
    emptySubtitle: {
      fontSize: 12,
      color: theme.colors.text.muted,
      textAlign: "center",
      marginTop: 4,
    },
    // Modal Styles
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: theme.colors.bg.surface,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      maxHeight: "88%",
      padding: theme.spacing.md,
      ...theme.shadows.lg,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.subtle,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    modalBody: {
      paddingVertical: theme.spacing.sm,
    },
    modalSectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginVertical: 6,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.text.secondary,
      marginTop: 10,
      marginBottom: 4,
    },
    textInput: {
      backgroundColor: theme.colors.bg.primary,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: theme.colors.text.primary,
    },
    chipScroll: {
      flexDirection: "row",
      marginBottom: 6,
    },
    formChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: theme.colors.bg.primary,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      marginRight: 6,
    },
    formChipActive: {
      backgroundColor: theme.colors.accent.primary,
      borderColor: theme.colors.accent.primary,
    },
    formChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.text.secondary,
    },
    formChipTextActive: {
      color: "#FFFFFF",
    },
    datePickerTrigger: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.colors.bg.primary,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    datePickerTriggerText: {
      fontSize: 14,
      color: theme.colors.text.primary,
    },
    modalFooter: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border.subtle,
    },
    modalBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    modalCancelBtn: {
      backgroundColor: theme.colors.bg.primary,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
    },
    modalCancelBtnText: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.colors.text.secondary,
    },
    modalSaveBtnText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    accListItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.subtle,
    },
    accListName: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    accListMeta: {
      fontSize: 12,
      color: theme.colors.text.muted,
      marginTop: 2,
    },
    detailHighlightBox: {
      backgroundColor: theme.colors.bg.primary,
      borderRadius: theme.radius.md,
      padding: theme.spacing.md,
      alignItems: "center",
      marginBottom: theme.spacing.md,
    },
    detailTypeLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.colors.text.muted,
      letterSpacing: 0.5,
    },
    detailAmount: {
      fontSize: 28,
      fontWeight: "900",
      marginVertical: 4,
    },
    detailTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.colors.text.primary,
      textAlign: "center",
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.subtle,
    },
    detailLabel: {
      fontSize: 13,
      color: theme.colors.text.muted,
    },
    detailVal: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.colors.text.primary,
      flex: 1,
      textAlign: "right",
    },
    deleteEntryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      marginTop: 16,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.accent.danger,
    },
    deleteEntryBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: theme.colors.accent.danger,
    },
    exportSubtitle: {
      fontSize: 13,
      color: theme.colors.text.muted,
      marginBottom: theme.spacing.md,
    },
    exportOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: theme.spacing.sm + 4,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      marginBottom: theme.spacing.sm,
      backgroundColor: theme.colors.bg.primary,
    },
    exportIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    exportOptionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    exportOptionSub: {
      fontSize: 11,
      color: theme.colors.text.muted,
      marginTop: 2,
    },
  });

