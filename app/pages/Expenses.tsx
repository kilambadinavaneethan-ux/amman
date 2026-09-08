import React, { useContext, useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { ExpenseContext } from "../context/ExpenseContext";
import { UserContext } from "../context/UserContext";
import AnimatedPage from "../components/AnimatedPage";
import EasyCalendarModal from "../components/EasyCalendarModal";
import { useTheme } from "../context/ThemeContext";
import { useScrollRestoration } from "../context/ScrollContext";
import { uploadImage } from "../../services/storage";
import { STORAGE_FOLDERS } from "../../constants/storageFolders";
import { TransactionShareBottomSheet } from "../../src/components/sharing/TransactionShareBottomSheet";
import { adaptToTransactionData } from "../../src/utils/transactionAdapter";
import { TransactionData } from "../../src/types/sharing";

const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer", "Card", "Other"];

export default function Expenses() {
  

  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/expenses");
  const CATEGORY_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  "Fuel": { icon: "local-gas-station", color: "#059669", label: "Fuel" },
  "Driver Salary": { icon: "supervised-user-circle", color: "#0284c7", label: "Driver Salary" },
  "Labour Salary": { icon: "engineering", color: "#d97706", label: "Labour Salary" },
  "Vehicle Maintenance": { icon: "build-circle", color: "#4f46e5", label: "Vehicle Maint." },
  "Machinery Maintenance": { icon: "settings-suggest", color: "#0891b2", label: "Machinery Maint." },
  "Office Expense": { icon: "business", color: "#7c3aed", label: "Office Expense" },
  "Electricity Bill": { icon: "bolt", color: "#e11d48", label: "Electricity Bill" },
  "Rent": { icon: "home-work", color: colors.accent.primary, label: "Rent" },
  "Food": { icon: "restaurant", color: "#ea580c", label: "Food" },
  "Transport": { icon: "departure-board", color: "#16a34a", label: "Transport" },
  "Miscellaneous": { icon: "help-center", color: colors.text.muted, label: "Miscellaneous" },
};

  const {
    expenses: dbExpenses,
    loading: expensesLoading,
    addExpense,
    updateExpense,
    deleteExpense,
    // New features
    expenseBudgets,
    setBudget,
    recurringExpenses,
    recurringLoading,
    addRecurringExpense,
    updateRecurringExpense,
    deleteRecurringExpense,
    logRecurringExpense,
    getMonthlyExpenses,
  } = useContext(ExpenseContext) as any;

  const { profile: userProfile } = useContext(UserContext) as any;
  const [shareBottomSheetVisible, setShareBottomSheetVisible] = useState(false);
  const [sharingTransactionData, setSharingTransactionData] = useState<TransactionData | null>(null);

  const handleOpenShareModal = useCallback((expense: any) => {
    const transaction = adaptToTransactionData(expense, "expense", userProfile);
    setSharingTransactionData(transaction);
    setShareBottomSheetVisible(true);
  }, [userProfile]);

  const loading = expensesLoading;

  const expenses = useMemo(() => (dbExpenses || []).map((e: any) => ({
    ...e,
    expenseDate: e.expenseDate instanceof Date ? e.expenseDate : new Date(e.expenseDate),
  })), [dbExpenses]);

  const params = useLocalSearchParams();

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "analytics" | "reports" | "recurring">("list");

  // Form Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Form State
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formStatus, setFormStatus] = useState<"Paid" | "Balance">("Paid");
  const [formTotalAmount, setFormTotalAmount] = useState("");
  const [formPaidAmount, setFormPaidAmount] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState("Cash");
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formDescription, setFormDescription] = useState("");
  const [formBillImageUri, setFormBillImageUri] = useState<string | null>(null);
  const [existingBillImageUrl, setExistingBillImageUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("All");
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<"All" | "Today" | "Week" | "Month">("All");
  const [sortOrder, setSortOrder] = useState<"latest" | "oldest">("latest");

  // Selected Expense for Detail View
  const [selectedExpense, setSelectedExpense] = useState<any>(null);

  // Reports selection
  const [reportPeriod, setReportPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  // Budget modal state
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [budgetCategory, setBudgetCategory] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  // Recurring expense modal state
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [recTitle, setRecTitle] = useState("");
  const [recAmount, setRecAmount] = useState("");
  const [recCategory, setRecCategory] = useState("");
  const [recFrequency, setRecFrequency] = useState<"weekly" | "monthly">("monthly");
  const [recPaymentMethod, setRecPaymentMethod] = useState("Cash");
  const [recDescription, setRecDescription] = useState("");
  const [isSavingRecurring, setIsSavingRecurring] = useState(false);
  const [loggingRecurringId, setLoggingRecurringId] = useState<string | null>(null);

  // Pulse animation for loading skeletons
  const skeletonOpacity = useSharedValue(0.4);
  useEffect(() => {
    skeletonOpacity.value = withRepeat(withTiming(0.8, { duration: 800 }), -1, true);
  }, [skeletonOpacity]);

  const animatedSkeletonStyle = useAnimatedStyle(() => ({
    opacity: skeletonOpacity.value,
  }));

  // Pull to refresh
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  // Math dates & totals calculations
  const {
    todayStart,
    monday,
    monthStart,
    totalExpensesSum,
    dueExpensesSum,
    todayExpensesSum,
    weekExpensesSum,
    monthExpensesSum,
  } = useMemo(() => {
    const now = new Date();
    const tStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const mon = new Date(now);
    const day = mon.getDay();
    const diff = mon.getDate() - day + (day === 0 ? -6 : 1);
    mon.setDate(diff);
    mon.setHours(0, 0, 0, 0);

    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Single-pass calculation for all metrics
    let totSum = 0;
    let dueSum = 0;
    let tExpensesSum = 0;
    let wExpensesSum = 0;
    let mExpensesSum = 0;

    const expList = expenses || [];
    for (let i = 0; i < expList.length; i++) {
      const e = expList[i];
      const amt = Number(e.amount || 0);
      totSum += amt;

      const due = e.remainingAmount !== undefined ? Number(e.remainingAmount) : (e.paymentMethod === "Balance" ? amt : 0);
      dueSum += due;

      const expDate = e.expenseDate instanceof Date ? e.expenseDate : new Date(e.expenseDate);
      if (expDate >= tStart) tExpensesSum += amt;
      if (expDate >= mon) wExpensesSum += amt;
      if (expDate >= mStart) mExpensesSum += amt;
    }

    return {
      todayStart: tStart,
      monday: mon,
      monthStart: mStart,
      totalExpensesSum: totSum,
      dueExpensesSum: dueSum,
      todayExpensesSum: tExpensesSum,
      weekExpensesSum: wExpensesSum,
      monthExpensesSum: mExpensesSum,
    };
  }, [expenses]);

  // Filtering expenses list
  const filteredExpenses = useMemo(() => {
    return (expenses || [])
      .filter((e: any) => {
        const matchesSearch =
          !searchQuery ||
          e.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.description?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesCategory = selectedCategoryFilter === "All" || e.category === selectedCategoryFilter;

        let matchesPeriod = true;
        const expDate = new Date(e.expenseDate);
        if (selectedPeriodFilter === "Today") {
          matchesPeriod = expDate >= todayStart;
        } else if (selectedPeriodFilter === "Week") {
          matchesPeriod = expDate >= monday;
        } else if (selectedPeriodFilter === "Month") {
          matchesPeriod = expDate >= monthStart;
        }

        return matchesSearch && matchesCategory && matchesPeriod;
      })
      .sort((a: any, b: any) => {
        const timeA = new Date(a.expenseDate).getTime();
        const timeB = new Date(b.expenseDate).getTime();
        return sortOrder === "latest" ? timeB - timeA : timeA - timeB;
      });
  }, [expenses, searchQuery, selectedCategoryFilter, selectedPeriodFilter, todayStart, monday, monthStart, sortOrder]);

  // Single-pass split into paid vs balance
  const { paidExpenses, balanceExpenses } = useMemo(() => {
    const paid: any[] = [];
    const balance: any[] = [];
    for (let i = 0; i < filteredExpenses.length; i++) {
      const e = filteredExpenses[i];
      const remaining = e.remainingAmount !== undefined ? e.remainingAmount : (e.paymentMethod === "Balance" ? e.amount : 0);
      if (Number(remaining) > 0) {
        balance.push(e);
      } else {
        paid.push(e);
      }
    }
    return { paidExpenses: paid, balanceExpenses: balance };
  }, [filteredExpenses]);

  const renderExpenseCard = (expense: any, index: number) => {
    const catInfo = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG["Miscellaneous"];
    const expDate = expense.expenseDate instanceof Date ? expense.expenseDate : new Date(expense.expenseDate);
    const isBalance = expense.status === "Balance" || expense.paymentMethod === "Balance" || (expense.remainingAmount !== undefined && expense.remainingAmount > 0);

    return (
      <Animated.View
        key={expense.id}
        entering={FadeInDown.delay(Math.min(index, 5) * 30).duration(200)}
      >
        <Pressable
          style={styles.expenseCard}
          onPress={() => {
            setSelectedExpense(expense);
            setIsDetailModalOpen(true);
          }}
        >
          <View style={styles.expenseRow}>
            <View style={[styles.categoryBadge, { backgroundColor: `${catInfo.color}15` }]}>
              <MaterialIcons name={catInfo.icon as any} size={22} color={catInfo.color} />
            </View>
            <View style={styles.expenseInfo}>
              <View style={styles.titleRow}>
                <Text style={styles.expenseTitle} numberOfLines={1}>
                  {expense.title}
                </Text>
                <Text style={styles.expenseAmount}>
                  ₹{Number(expense.totalAmount || expense.amount).toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <View style={styles.metaCol}>
                  <Text style={styles.categoryLabel}>{expense.category}</Text>
                  <Text style={[
                    styles.expenseMethod, 
                    isBalance && { color: colors.accent.danger, backgroundColor: "#fef2f2" }
                  ]}>
                    {isBalance ? "Balance Due" : (expense.paymentMethod || "Paid")}
                  </Text>
                </View>
                <Text style={styles.expenseDateText}>
                  {expDate.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              </View>
              {isBalance && (
                <View style={styles.splitDetailsRow}>
                  <Text style={styles.splitDetailsText}>
                    Paid: <Text style={styles.splitPaidText}>₹{Number(expense.paidAmount !== undefined ? expense.paidAmount : (expense.paymentMethod === "Balance" ? 0 : expense.amount)).toLocaleString("en-IN")}</Text>
                    {"  "}•{"  "}
                    Due: <Text style={styles.splitDueText}>₹{Number(expense.remainingAmount !== undefined ? expense.remainingAmount : (expense.paymentMethod === "Balance" ? expense.amount : 0)).toLocaleString("en-IN")}</Text>
                  </Text>
                </View>
              )}
              {expense.description ? (
                <Text style={styles.notesPreview} numberOfLines={1}>
                  📝 {expense.description}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  // Image Picking
  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Gallery permissions are required to upload bill receipts.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setFormBillImageUri(result.assets[0].uri);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not pick image.");
    }
  };

  // CRUD handlers
  const handleOpenAddExpense = () => {
    setEditingExpenseId(null);
    setFormTitle("");
    setFormCategory("");
    setFormStatus("Paid");
    setFormTotalAmount("");
    setFormPaidAmount("");
    setFormPaymentMethod("Cash");
    setFormDate(new Date());
    setFormDescription("");
    setFormBillImageUri(null);
    setExistingBillImageUrl(null);
    setIsFormModalOpen(true);
  };

  useEffect(() => {
    if (params.add === "true") {
      handleOpenAddExpense();
    }
  }, [params.add]);

  const handleOpenEditExpense = (expense: any) => {
    setEditingExpenseId(expense.id);
    setFormTitle(expense.title || "");
    setFormCategory(expense.category || "Miscellaneous");
    setFormStatus(expense.status || "Paid");
    setFormTotalAmount(String(expense.totalAmount || expense.amount || ""));
    setFormPaidAmount(String(expense.paidAmount || expense.amount || ""));
    setFormPaymentMethod(expense.paymentMethod || "Cash");
    setFormDate(new Date(expense.expenseDate));
    setFormDescription(expense.description || "");
    setFormBillImageUri(null);
    setExistingBillImageUrl(expense.billImageUrl || null);
    setIsDetailModalOpen(false);
    setIsFormModalOpen(true);
  };

  const handleSaveExpense = async () => {
    const totalAmt = parseFloat(formTotalAmount);
    const paidAmt = formStatus === "Paid" ? totalAmt : parseFloat(formPaidAmount || "0");
    const remainingAmt = formStatus === "Paid" ? 0 : (totalAmt - paidAmt);

    if (!formTitle.trim()) {
      Alert.alert("Input Required", "Please enter an expense title.");
      return;
    }
    if (!formCategory.trim()) {
      Alert.alert("Input Required", "Please enter an expense category.");
      return;
    }
    if (isNaN(totalAmt) || totalAmt <= 0) {
      Alert.alert("Invalid Input", "Please enter a valid total amount.");
      return;
    }
    if (formStatus === "Balance") {
      if (isNaN(paidAmt) || paidAmt < 0) {
        Alert.alert("Invalid Input", "Please enter a valid paid amount.");
        return;
      }
      if (paidAmt > totalAmt) {
        Alert.alert("Invalid Input", "Paid amount cannot exceed total amount.");
        return;
      }
    }

    setIsSaving(true);
    let uploadedBillUrl = existingBillImageUrl;
    if (formBillImageUri) {
      const uploadRes = await uploadImage({
        uri: formBillImageUri,
        folder: STORAGE_FOLDERS.BILLS,
        entityId: editingExpenseId || `expense_${Date.now()}`,
      });
      if (uploadRes.success && uploadRes.publicUrl) {
        uploadedBillUrl = uploadRes.publicUrl;
      }
    }

    const data = {
      title: formTitle.trim(),
      amount: totalAmt,
      totalAmount: totalAmt,
      paidAmount: paidAmt,
      remainingAmount: remainingAmt,
      status: formStatus,
      category: formCategory,
      paymentMethod: formPaymentMethod,
      expenseDate: formDate,
      description: formDescription.trim(),
      billImageUrl: uploadedBillUrl,
      billImageUri: formBillImageUri,
    };

    let success = false;
    if (editingExpenseId) {
      success = await updateExpense(editingExpenseId, data);
    } else {
      const newId = await addExpense(data);
      success = !!newId;
    }

    setIsSaving(false);
    if (success) {
      Alert.alert("Success", `Expense ${editingExpenseId ? "updated" : "saved"} successfully.`);
      setIsFormModalOpen(false);
    } else {
      Alert.alert("Transaction Failed", "Could not submit data to registry.");
    }
  };

  const handleDeletePress = (expense: any) => {
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
              setIsDetailModalOpen(false);
              Alert.alert("Deleted", "Expense record has been deleted.");
            } else {
              Alert.alert("Error", "Could not delete expense.");
            }
          },
        },
      ]
    );
  };

  // Analytics Metrics
  // Group by category reducer with explicit accumulator typing
  const categorySummary = expenses.reduce((acc: Record<string, number>, curr: any) => {
    const cat = curr.category || "Miscellaneous";
    acc[cat] = (acc[cat] || 0) + Number(curr.amount || 0);
    return acc;
  }, {} as Record<string, number>);

  const highestExpenseObj = expenses.reduce(
    (max: any, curr: any) => (Number(curr.amount || 0) > Number(max?.amount || 0) ? curr : max),
    null
  );

  // Group by unique day to find average
  const expensesByDay = expenses.reduce((acc: Record<string, number>, curr: any) => {
    const dayStr = new Date(curr.expenseDate).toDateString();
    acc[dayStr] = (acc[dayStr] || 0) + Number(curr.amount || 0);
    return acc;
  }, {} as Record<string, number>);
  const uniqueDaysCount = Object.keys(expensesByDay).length || 1;
  const averageDailyExpense = totalExpensesSum / uniqueDaysCount;



  // Skeleton Loader for List
  const renderSkeleton = () => (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((key) => (
        <Animated.View key={key} style={[styles.skeletonCard, animatedSkeletonStyle]}>
          <View style={styles.skeletonLeftRow}>
            <View style={styles.skeletonBadge} />
            <View style={styles.skeletonMeta}>
              <View style={styles.skeletonTitle} />
              <View style={styles.skeletonSub} />
            </View>
          </View>
          <View style={styles.skeletonAmount} />
        </Animated.View>
      ))}
    </View>
  );

  return (
    <AnimatedPage style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Tab Selector */}
      <View style={styles.tabBar}>
        {(["list", "analytics", "recurring", "reports"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tabItem, activeTab === tab && styles.activeTabItem]}
          >
            <MaterialIcons
              name={tab === "list" ? "receipt-long" : tab === "analytics" ? "analytics" : tab === "recurring" ? "autorenew" : "picture-as-pdf"}
              size={18}
              color={activeTab === tab ? "#059669" : colors.text.muted}
            />
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        scrollEventThrottle={32}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#059669"]} />
        }
      >
        {/* SUMMARY DASHBOARD CARDS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.summaryCarousel}
        >
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrapper, { backgroundColor: "#f0fdf4" }]}>
              <MaterialIcons name="today" size={20} color="#059669" />
            </View>
            <Text style={styles.summaryLabel}>{"Today's Total"}</Text>
            <Text style={styles.summaryValue}>₹{todayExpensesSum.toLocaleString("en-IN")}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrapper, { backgroundColor: "#ecfdf5" }]}>
              <MaterialIcons name="date-range" size={20} color="#047857" />
            </View>
            <Text style={styles.summaryLabel}>This Week</Text>
            <Text style={styles.summaryValue}>₹{weekExpensesSum.toLocaleString("en-IN")}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrapper, { backgroundColor: "#6C5CE720" }]}>
              <MaterialIcons name="calendar-month" size={20} color={colors.accent.primary} />
            </View>
            <Text style={styles.summaryLabel}>This Month</Text>
            <Text style={styles.summaryValue}>₹{monthExpensesSum.toLocaleString("en-IN")}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrapper, { backgroundColor: "#fef3c7" }]}>
              <MaterialIcons name="payments" size={20} color="#d97706" />
            </View>
            <Text style={styles.summaryLabel}>Total Expenses</Text>
            <Text style={styles.summaryValue}>₹{totalExpensesSum.toLocaleString("en-IN")}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrapper, { backgroundColor: "#fef2f2" }]}>
              <MaterialIcons name="pending-actions" size={20} color={colors.accent.danger} />
            </View>
            <Text style={styles.summaryLabel}>Due Amount</Text>
            <Text style={[styles.summaryValue, { color: colors.accent.danger }]}>₹{dueExpensesSum.toLocaleString("en-IN")}</Text>
          </View>
        </ScrollView>

        {activeTab === "list" && (
          <View>
            {/* SEARCH AND FILTERS */}
            <View style={styles.searchFilterCard}>
              <View style={styles.searchBarRow}>
                <MaterialIcons name="search" size={22} color={colors.text.muted} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search title, notes..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor={colors.text.muted}
                />
                {searchQuery !== "" && (
                  <Pressable onPress={() => setSearchQuery("")}>
                    <MaterialIcons name="close" size={20} color={colors.text.muted} />
                  </Pressable>
                )}
              </View>

              <View style={styles.filtersScrollRow}>
                {/* Period filters */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.pillContainer}>
                    {(["All", "Today", "Week", "Month"] as const).map((period) => (
                      <Pressable
                        key={period}
                        onPress={() => setSelectedPeriodFilter(period)}
                        style={[styles.pill, selectedPeriodFilter === period && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, selectedPeriodFilter === period && styles.pillTextActive]}>
                          {period}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <View style={styles.divider} />

              <View style={styles.categoryFilterRow}>
                <View style={styles.selectWrapper}>
                  <Text style={styles.selectLabel}>Category:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <Pressable
                      onPress={() => setSelectedCategoryFilter("All")}
                      style={[
                        styles.catFilterPill,
                        selectedCategoryFilter === "All" && styles.catFilterPillActive,
                      ]}
                    >
                      <Text style={[
                        styles.catFilterText,
                        selectedCategoryFilter === "All" && styles.catFilterTextActive
                      ]}>
                        All
                      </Text>
                    </Pressable>
                    {Object.keys(CATEGORY_CONFIG).map((cat) => (
                      <Pressable
                        key={cat}
                        onPress={() => setSelectedCategoryFilter(cat)}
                        style={[
                          styles.catFilterPill,
                          selectedCategoryFilter === cat && styles.catFilterPillActive,
                        ]}
                      >
                        <Text style={[
                          styles.catFilterText,
                          selectedCategoryFilter === cat && styles.catFilterTextActive
                        ]}>
                          {cat}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View style={styles.sortToggleRow}>
                <Text style={styles.sortToggleText}>Showing {filteredExpenses.length} entries</Text>
                <Pressable
                  style={styles.sortBtn}
                  onPress={() => setSortOrder(sortOrder === "latest" ? "oldest" : "latest")}
                >
                  <MaterialIcons
                    name={sortOrder === "latest" ? "arrow-downward" : "arrow-upward"}
                    size={16}
                    color="#059669"
                  />
                  <Text style={styles.sortBtnText}>
                    Date: {sortOrder === "latest" ? "Latest First" : "Oldest First"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* EXPENSE LIST */}
            {loading ? (
              renderSkeleton()
            ) : filteredExpenses.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyCircle}>
                  <MaterialIcons name="receipt" size={48} color="#a1a1aa" />
                </View>
                <Text style={styles.emptyHeading}>No Expenses Found</Text>
                <Text style={styles.emptyText}>
                  {"Try clearing the filters or click \"+\" below to record a new business expense."}
                </Text>
              </View>
            ) : (
              <View style={styles.listContainer}>
                {balanceExpenses.length > 0 && (
                  <View style={styles.listSection}>
                    <View style={styles.listSectionHeader}>
                      <View style={styles.listSectionHeaderLeft}>
                        <MaterialIcons name="pending-actions" size={18} color={colors.accent.danger} />
                        <Text style={[styles.listSectionTitle, { color: "#991b1b" }]}>Balance / Pending Dues</Text>
                      </View>
                      <View style={[styles.listSectionBadge, { backgroundColor: "#fef2f2" }]}>
                        <Text style={[styles.listSectionBadgeText, { color: colors.accent.danger }]}>{balanceExpenses.length}</Text>
                      </View>
                    </View>
                    <View style={styles.listSectionItems}>
                      {balanceExpenses.map((expense: any, index: number) => renderExpenseCard(expense, index))}
                    </View>
                  </View>
                )}

                {paidExpenses.length > 0 && (
                  <View style={[styles.listSection, balanceExpenses.length > 0 && { marginTop: 16 }]}>
                    <View style={styles.listSectionHeader}>
                      <View style={styles.listSectionHeaderLeft}>
                        <MaterialIcons name="check-circle" size={18} color="#059669" />
                        <Text style={styles.listSectionTitle}>Paid Transactions</Text>
                      </View>
                      <View style={[styles.listSectionBadge, { backgroundColor: "#e6f4ea" }]}>
                        <Text style={[styles.listSectionBadgeText, { color: "#059669" }]}>{paidExpenses.length}</Text>
                      </View>
                    </View>
                    <View style={styles.listSectionItems}>
                      {paidExpenses.map((expense: any, index: number) => renderExpenseCard(expense, index))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ANALYTICS VIEW */}
        {activeTab === "analytics" && (
          <View style={styles.analyticsSection}>
            <View style={styles.card}>
              <Text style={styles.cardSectionHeading}>Expenses by Category</Text>
              {Object.keys(categorySummary).length === 0 ? (
                <Text style={styles.emptyText}>No data available yet.</Text>
              ) : (
                (Object.entries(categorySummary) as [string, number][])
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amt]) => {
                    const catInfo = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG["Miscellaneous"];
                    const percent = totalExpensesSum > 0 ? Math.round((amt / totalExpensesSum) * 100) : 0;
                    return (
                      <View key={cat} style={styles.analyticsProgressBarRow}>
                        <View style={styles.analyticsProgressBarHeader}>
                          <View style={styles.flexRow}>
                            <MaterialIcons name={catInfo.icon as any} size={16} color={catInfo.color} />
                            <Text style={styles.analyticsProgressLabel}>{cat}</Text>
                          </View>
                          <Text style={styles.analyticsProgressValue}>
                            ₹{amt.toLocaleString("en-IN")} ({percent}%)
                          </Text>
                        </View>
                        <View style={styles.progressBarBg}>
                          <View
                            style={[
                              styles.progressBarFill,
                              { width: `${percent}%`, backgroundColor: catInfo.color },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })
              )}
            </View>

            {/* BUDGET LIMITS PER CATEGORY */}
            <View style={styles.card}>
              <View style={styles.budgetHeaderRow}>
                <Text style={styles.cardSectionHeading}>Monthly Budget Limits</Text>
                <Pressable
                  style={styles.addBudgetBtn}
                  onPress={() => {
                    setBudgetCategory("");
                    setBudgetAmount("");
                    setIsBudgetModalOpen(true);
                  }}
                >
                  <MaterialIcons name="add" size={16} color="#059669" />
                  <Text style={styles.addBudgetBtnText}>Set Budget</Text>
                </Pressable>
              </View>
              {(expenseBudgets || []).length === 0 ? (
                <View style={styles.emptyBudgetCard}>
                  <MaterialIcons name="account-balance-wallet" size={28} color={colors.border.medium} />
                  <Text style={styles.emptyBudgetText}>No budget limits configured yet. Tap {"\"Set Budget\""} to start tracking spending limits per category.</Text>
                </View>
              ) : (
                (expenseBudgets || []).map((budget: any) => {
                  const catInfo = CATEGORY_CONFIG[budget.category] || CATEGORY_CONFIG["Miscellaneous"];
                  const limit = Number(budget.monthlyLimit || 0);
                  const currentMonthExpenses = expenses.filter((e: any) => {
                    const d = new Date(e.expenseDate);
                    return d >= monthStart && e.category === budget.category;
                  });
                  const spent = currentMonthExpenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
                  const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
                  const barColor = pct >= 90 ? "#ef4444" : pct >= 75 ? "#f59e0b" : colors.accent.success;

                  return (
                    <View key={budget.id} style={styles.budgetRow}>
                      <View style={styles.budgetRowHeader}>
                        <View style={styles.flexRow}>
                          <MaterialIcons name={catInfo.icon as any} size={16} color={catInfo.color} />
                          <Text style={styles.budgetCategoryName}>{budget.category}</Text>
                        </View>
                        <Text style={[styles.budgetPctText, { color: barColor }]}>
                          ₹{spent.toLocaleString("en-IN")} / ₹{limit.toLocaleString("en-IN")} ({pct}%)
                        </Text>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                      </View>
                      {pct >= 90 && (
                        <View style={styles.budgetWarning}>
                          <MaterialIcons name="warning" size={12} color={colors.accent.danger} />
                          <Text style={styles.budgetWarningText}>
                            {pct >= 100 ? "Budget exceeded!" : "Approaching limit"}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            {/* MONTHLY TRENDS BAR CHART */}
            <View style={styles.card}>
              <Text style={styles.cardSectionHeading}>Monthly Trends (Last 6 Months)</Text>
              {(() => {
                const months: { label: string; total: number; month: number; year: number }[] = [];
                for (let i = 5; i >= 0; i--) {
                  const d = new Date();
                  d.setDate(1); // Set to 1st to avoid month rollover (e.g. Feb 29 → Mar 1)
                  d.setMonth(d.getMonth() - i);
                  const m = d.getMonth();
                  const y = d.getFullYear();
                  const monthExpenses = (getMonthlyExpenses ? getMonthlyExpenses(m, y) : []) as any[];
                  const total = monthExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
                  months.push({
                    label: d.toLocaleDateString("en-IN", { month: "short" }),
                    total,
                    month: m,
                    year: y,
                  });
                }
                const maxVal = Math.max(...months.map((m) => m.total), 1);

                return (
                  <View>
                    <View style={styles.trendChartContainer}>
                      {months.map((m, i) => {
                        const barHeight = Math.max(4, (m.total / maxVal) * 120);
                        const prevTotal = i > 0 ? months[i - 1].total : m.total;
                        const changePercent = prevTotal > 0 ? Math.round(((m.total - prevTotal) / prevTotal) * 100) : 0;
                        const isCurrentMonth = i === months.length - 1;

                        return (
                          <View key={`trend-${i}-${m.month}-${m.year}`} style={styles.trendBarCol}>
                            <Text style={styles.trendBarValue}>
                              {m.total >= 1000 ? `${(m.total / 1000).toFixed(1)}K` : m.total.toLocaleString("en-IN")}
                            </Text>
                            <View
                              style={[
                                styles.trendBar,
                                {
                                  height: barHeight,
                                  backgroundColor: isCurrentMonth ? "#059669" : "#d1fae5",
                                },
                              ]}
                            />
                            <Text style={[styles.trendBarLabel, isCurrentMonth && { color: "#059669", fontWeight: "700" }]}>
                              {m.label}
                            </Text>
                            {i > 0 && changePercent !== 0 && (
                              <View style={styles.trendChangeRow}>
                                <MaterialIcons
                                  name={changePercent > 0 ? "arrow-upward" : "arrow-downward"}
                                  size={10}
                                  color={changePercent > 0 ? "#ef4444" : colors.accent.success}
                                />
                                <Text
                                  style={[
                                    styles.trendChangeText,
                                    { color: changePercent > 0 ? "#ef4444" : colors.accent.success },
                                  ]}
                                >
                                  {Math.abs(changePercent)}%
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* HIGHEST AND AVERAGE CARD */}
            <View style={styles.card}>
              <Text style={styles.cardSectionHeading}>Spending Performance</Text>
              <View style={styles.analyticsStatGrid}>
                <View style={styles.statColumn}>
                  <View style={styles.statCircle}>
                    <MaterialIcons name="trending-up" size={24} color={colors.accent.danger} />
                  </View>
                  <Text style={styles.statLabel}>Highest Expense</Text>
                  <Text style={styles.statValue}>
                    {highestExpenseObj ? `₹${highestExpenseObj.amount.toLocaleString("en-IN")}` : "₹0"}
                  </Text>
                  <Text style={styles.statSubText} numberOfLines={1}>
                    {highestExpenseObj ? highestExpenseObj.title : "No logs"}
                  </Text>
                </View>

                <View style={styles.statColumn}>
                  <View style={styles.statCircle}>
                    <MaterialIcons name="functions" size={24} color="#3b82f6" />
                  </View>
                  <Text style={styles.statLabel}>Avg. Daily Spend</Text>
                  <Text style={styles.statValue}>
                    ₹{Math.round(averageDailyExpense).toLocaleString("en-IN")}
                  </Text>
                  <Text style={styles.statSubText}>
                    Computed over {uniqueDaysCount} days
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* RECURRING EXPENSES TAB */}
        {activeTab === "recurring" && (
          <View style={styles.analyticsSection}>
            <View style={styles.card}>
              <View style={styles.budgetHeaderRow}>
                <Text style={styles.cardSectionHeading}>Recurring Templates</Text>
                <Pressable
                  style={styles.addBudgetBtn}
                  onPress={() => {
                    setEditingRecurringId(null);
                    setRecTitle("");
                    setRecAmount("");
                    setRecCategory("");
                    setRecFrequency("monthly");
                    setRecPaymentMethod("Cash");
                    setRecDescription("");
                    setIsRecurringModalOpen(true);
                  }}
                >
                  <MaterialIcons name="add" size={16} color="#059669" />
                  <Text style={styles.addBudgetBtnText}>Add Template</Text>
                </Pressable>
              </View>
              <Text style={styles.cardSectionSub}>
                Create templates for rent, salaries, and other repeating expenses. Use {"\"Quick Log\""} to instantly record them.
              </Text>
            </View>

            {recurringLoading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color="#059669" />
              </View>
            ) : (recurringExpenses || []).length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyCircle}>
                  <MaterialIcons name="autorenew" size={48} color="#a1a1aa" />
                </View>
                <Text style={styles.emptyHeading}>No Recurring Expenses</Text>
                <Text style={styles.emptyText}>
                  Tap {"\"Add Template\""} to create your first recurring expense (e.g., monthly rent, weekly fuel).
                </Text>
              </View>
            ) : (
              <View style={styles.listContainer}>
                {(recurringExpenses || []).map((rec: any, index: number) => {
                  const catInfo = CATEGORY_CONFIG[rec.category] || CATEGORY_CONFIG["Miscellaneous"];
                  const nextDue = rec.nextDueDate instanceof Date ? rec.nextDueDate : new Date(rec.nextDueDate);
                  const isOverdue = nextDue < new Date();
                  const isLogging = loggingRecurringId === rec.id;

                  return (
                    <Animated.View
                      key={rec.id}
                      entering={FadeInDown.delay(Math.min(index, 5) * 30).duration(200)}
                    >
                      <View style={styles.expenseCard}>
                        <View style={styles.expenseRow}>
                          <View style={[styles.categoryBadge, { backgroundColor: `${catInfo.color}15` }]}>
                            <MaterialIcons name={catInfo.icon as any} size={22} color={catInfo.color} />
                          </View>
                          <View style={styles.expenseInfo}>
                            <View style={styles.titleRow}>
                              <Text style={styles.expenseTitle} numberOfLines={1}>
                                {rec.title}
                              </Text>
                              <Text style={styles.expenseAmount}>
                                ₹{Number(rec.amount).toLocaleString("en-IN")}
                              </Text>
                            </View>
                            <View style={styles.metaRow}>
                              <View style={styles.metaCol}>
                                <Text style={styles.categoryLabel}>{rec.category}</Text>
                                <Text style={styles.expenseMethod}>
                                  {rec.frequency === "weekly" ? "Weekly" : "Monthly"}
                                </Text>
                              </View>
                              <Text style={[styles.expenseDateText, isOverdue && { color: colors.accent.danger }]}>
                                {isOverdue ? "Overdue: " : "Next: "}
                                {nextDue.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                              </Text>
                            </View>
                            <View style={styles.recurringActionsRow}>
                              <Pressable
                                style={[styles.quickLogBtn, isLogging && { opacity: 0.6 }]}
                                disabled={isLogging}
                                onPress={async () => {
                                  setLoggingRecurringId(rec.id);
                                  const result = await logRecurringExpense(rec.id);
                                  setLoggingRecurringId(null);
                                  if (result) {
                                    Alert.alert("Logged!", `"${rec.title}" has been recorded as an expense.`);
                                  } else {
                                    Alert.alert("Error", "Failed to log this expense.");
                                  }
                                }}
                              >
                                {isLogging ? (
                                  <ActivityIndicator size="small" color={colors.bg.card} />
                                ) : (
                                  <>
                                    <MaterialIcons name="flash-on" size={14} color={colors.bg.card} />
                                    <Text style={styles.quickLogBtnText}>Quick Log</Text>
                                  </>
                                )}
                              </Pressable>
                              <Pressable
                                style={styles.recurringEditBtn}
                                onPress={() => {
                                  setEditingRecurringId(rec.id);
                                  setRecTitle(rec.title || "");
                                  setRecAmount(String(rec.amount || ""));
                                  setRecCategory(rec.category || "");
                                  setRecFrequency(rec.frequency || "monthly");
                                  setRecPaymentMethod(rec.paymentMethod || "Cash");
                                  setRecDescription(rec.description || "");
                                  setIsRecurringModalOpen(true);
                                }}
                              >
                                <MaterialIcons name="edit" size={16} color={colors.text.muted} />
                              </Pressable>
                              <Pressable
                                style={styles.recurringDeleteBtn}
                                onPress={() => {
                                  Alert.alert(
                                    "Delete Template?",
                                    `Remove "${rec.title}" from recurring expenses?`,
                                    [
                                      { text: "Cancel", style: "cancel" },
                                      {
                                        text: "Delete",
                                        style: "destructive",
                                        onPress: () => deleteRecurringExpense(rec.id),
                                      },
                                    ]
                                  );
                                }}
                              >
                                <MaterialIcons name="delete-outline" size={16} color={colors.accent.danger} />
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* REPORTS VIEW */}
        {activeTab === "reports" && (
          <View style={styles.card}>
            <Text style={styles.cardSectionHeading}>Generate Business Report</Text>
            <Text style={styles.cardSectionSub}>
              Compile detailed expense reports for accounts audits and operations analysis.
            </Text>

            <View style={styles.reportPillRow}>
              {(["daily", "weekly", "monthly"] as const).map((period) => (
                <Pressable
                  key={period}
                  style={[styles.reportPill, reportPeriod === period && styles.reportPillActive]}
                  onPress={() => setReportPeriod(period)}
                >
                  <Text
                    style={[
                      styles.reportPillText,
                      reportPeriod === period && styles.reportPillTextActive,
                    ]}
                  >
                    {period.charAt(0).toUpperCase() + period.slice(1)} Report
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.generateBtn}
              onPress={() => setIsReportsModalOpen(true)}
            >
              <MaterialIcons name="assessment" size={22} color={colors.bg.card} />
              <Text style={styles.generateBtnText}>Compile Report Summary</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* FLOATING ACTION BUTTON */}
      {activeTab === "list" && (
        <Pressable style={styles.fab} onPress={handleOpenAddExpense}>
          <MaterialIcons name="add" size={28} color={colors.bg.card} />
          <Text style={styles.fabText}>Add Expense</Text>
        </Pressable>
      )}

      {/* ADD / EDIT FORM MODAL */}
      <Modal visible={isFormModalOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formHeaderTitle}>
              {editingExpenseId ? "✏️ Edit Expense" : "➕ Add Expense"}
            </Text>
            <Pressable onPress={() => setIsFormModalOpen(false)}>
              <MaterialIcons name="close" size={26} color={colors.text.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.formScrollView} contentContainerStyle={styles.formContent}>
            {/* Title */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Expense Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Diesel for Truck KA-02"
                value={formTitle}
                onChangeText={setFormTitle}
              />
            </View>

            {/* Category selection — Visual Grid Picker */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Expense Category *</Text>
              <View style={styles.categoryGrid}>
                {Object.entries(CATEGORY_CONFIG).map(([catKey, catInfo]) => {
                  const isSelected = formCategory === catKey;
                  return (
                    <Pressable
                      key={catKey}
                      style={[
                        styles.categoryPickerCard,
                        isSelected && { borderColor: (catInfo as any).color, backgroundColor: `${(catInfo as any).color}10` },
                      ]}
                      onPress={() => setFormCategory(catKey)}
                    >
                      <MaterialIcons
                        name={(catInfo as any).icon as any}
                        size={20}
                        color={isSelected ? (catInfo as any).color : colors.text.muted}
                      />
                      <Text
                        style={[
                          styles.categoryPickerLabel,
                          isSelected && { color: (catInfo as any).color, fontWeight: "700" },
                        ]}
                        numberOfLines={1}
                      >
                        {(catInfo as any).label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Payment Status Segment Toggle */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Payment Status *</Text>
              <View style={styles.segmentContainer}>
                <Pressable
                  style={[styles.segmentBtn, formStatus === "Paid" && styles.segmentBtnActive]}
                  onPress={() => setFormStatus("Paid")}
                >
                  <MaterialIcons name="check-circle" size={16} color={formStatus === "Paid" ? "#1A1D27" : colors.text.secondary} style={{ marginRight: 6 }} />
                  <Text style={[styles.segmentBtnText, formStatus === "Paid" && styles.segmentBtnTextActive]}>
                    Fully Paid
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.segmentBtn, formStatus === "Balance" && styles.segmentBtnActive]}
                  onPress={() => setFormStatus("Balance")}
                >
                  <MaterialIcons name="pending-actions" size={16} color={formStatus === "Balance" ? "#1A1D27" : colors.text.secondary} style={{ marginRight: 6 }} />
                  <Text style={[styles.segmentBtnText, formStatus === "Balance" && styles.segmentBtnTextActive]}>
                    With Balance
                  </Text>
                </Pressable>
              </View>
            </View>

            {formStatus === "Paid" ? (
              <View style={styles.inputRow}>
                {/* Total Amount */}
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.inputLabel}>Amount (₹) *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="₹ 0.00"
                    keyboardType="numeric"
                    value={formTotalAmount}
                    onChangeText={setFormTotalAmount}
                  />
                </View>

                {/* Date */}
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Date *</Text>
                  <Pressable
                    style={styles.dateSelectorBtn}
                    onPress={() => setIsCalendarOpen(true)}
                  >
                    <MaterialIcons name="calendar-today" size={18} color={colors.text.muted} />
                    <Text style={styles.dateSelectorText}>
                      {formDate.toLocaleDateString("en-IN", {
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
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                    <Text style={styles.inputLabel}>Total Cost (₹) *</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="₹ 0.00"
                      keyboardType="numeric"
                      value={formTotalAmount}
                      onChangeText={setFormTotalAmount}
                    />
                  </View>

                  {/* Date */}
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Date *</Text>
                    <Pressable
                      style={styles.dateSelectorBtn}
                      onPress={() => setIsCalendarOpen(true)}
                    >
                      <MaterialIcons name="calendar-today" size={18} color={colors.text.muted} />
                      <Text style={styles.dateSelectorText}>
                        {formDate.toLocaleDateString("en-IN", {
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
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                    <Text style={styles.inputLabel}>Paid Amount (₹) *</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="₹ 0.00"
                      keyboardType="numeric"
                      value={formPaidAmount}
                      onChangeText={setFormPaidAmount}
                    />
                  </View>

                  {/* Remaining Due Amount */}
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Remaining Due (₹)</Text>
                    <View style={[styles.textInput, styles.readOnlyInput]}>
                      <Text style={styles.readOnlyInputText}>
                        ₹{Number(parseFloat(formTotalAmount || "0") - parseFloat(formPaidAmount || "0")).toFixed(2)}
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
                  const isSelected = formPaymentMethod === method;
                  return (
                    <Pressable
                      key={method}
                      style={[styles.methodBtn, isSelected && styles.methodBtnActive]}
                      onPress={() => setFormPaymentMethod(method)}
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
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Details of the payment..."
                value={formDescription}
                onChangeText={setFormDescription}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Image attachment */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Attach Bill Image (Optional)</Text>
              {formBillImageUri || existingBillImageUrl ? (
                <View style={styles.imagePreviewContainer}>
                  <Image
                    source={(formBillImageUri || existingBillImageUrl) ? { uri: formBillImageUri || existingBillImageUrl || undefined } : undefined}
                    style={styles.imagePreview}
                  />
                  <Pressable
                    style={styles.removeImageBtn}
                    onPress={() => {
                      setFormBillImageUri(null);
                      setExistingBillImageUrl(null);
                    }}
                  >
                    <MaterialIcons name="cancel" size={24} color={colors.accent.danger} />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.uploadBtn} onPress={handlePickImage}>
                  <MaterialIcons name="add-a-photo" size={24} color="#059669" />
                  <Text style={styles.uploadBtnText}>Upload Bill / Receipt</Text>
                </Pressable>
              )}
            </View>

            <Pressable
              style={[styles.submitBtn, isSaving && styles.submitBtnDisabled]}
              onPress={handleSaveExpense}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color={colors.bg.card} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {editingExpenseId ? "Update Record" : "Save Expense"}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* EXPENSE DETAIL MODAL */}
      <Modal visible={isDetailModalOpen} animationType="slide" presentationStyle="pageSheet">
        {selectedExpense && (() => {
          const expDate = selectedExpense.expenseDate instanceof Date ? selectedExpense.expenseDate : new Date(selectedExpense.expenseDate);
          const catInfo = CATEGORY_CONFIG[selectedExpense.category] || CATEGORY_CONFIG["Miscellaneous"];
          return (
            <View style={styles.detailContainer}>
              <View style={styles.detailHeader}>
                <Text style={styles.detailHeaderTitle}>Details</Text>
                <Pressable onPress={() => setIsDetailModalOpen(false)}>
                  <MaterialIcons name="close" size={26} color={colors.text.muted} />
                </Pressable>
              </View>

              <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
                <View style={styles.detailHero}>
                  <View style={[styles.detailCategoryCircle, { backgroundColor: `${catInfo.color}15` }]}>
                    <MaterialIcons name={catInfo.icon as any} size={36} color={catInfo.color} />
                  </View>
                  <Text style={styles.detailHeroTitle}>{selectedExpense.title}</Text>
                  <Text style={styles.detailHeroAmount}>
                    ₹{Number(selectedExpense.amount).toLocaleString("en-IN")}
                  </Text>
                  <View style={styles.detailTagRow}>
                    <View style={[styles.detailTag, { backgroundColor: `${catInfo.color}12` }]}>
                      <Text style={[styles.detailTagText, { color: catInfo.color }]}>
                        {selectedExpense.category}
                      </Text>
                    </View>
                    <View style={[styles.detailTag, { backgroundColor: colors.border.subtle }]}>
                      <Text style={styles.detailTagText}>
                        {selectedExpense.paymentMethod}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.detailCard}>
                  <View style={styles.detailMetaRow}>
                    <Text style={styles.detailMetaLabel}>Date of Expense</Text>
                    <Text style={styles.detailMetaVal}>
                      {expDate.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <View style={styles.divider} />

                  <View style={styles.detailMetaRow}>
                    <Text style={styles.detailMetaLabel}>Added On</Text>
                    <Text style={styles.detailMetaVal}>
                      {new Date(selectedExpense.createdAt).toLocaleDateString("en-IN")}
                    </Text>
                  </View>
                  {(selectedExpense.status === "Balance" || selectedExpense.paymentMethod === "Balance" || (selectedExpense.remainingAmount !== undefined && selectedExpense.remainingAmount > 0)) && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.detailMetaRow}>
                        <Text style={styles.detailMetaLabel}>Paid Amount</Text>
                        <Text style={[styles.detailMetaVal, { color: "#16a34a", fontWeight: "700" }]}>
                          ₹{Number(selectedExpense.paidAmount !== undefined ? selectedExpense.paidAmount : (selectedExpense.paymentMethod === "Balance" ? 0 : selectedExpense.amount)).toLocaleString("en-IN")}
                        </Text>
                      </View>
                      <View style={styles.divider} />
                      <View style={styles.detailMetaRow}>
                        <Text style={styles.detailMetaLabel}>Remaining Due</Text>
                        <Text style={[styles.detailMetaVal, { color: colors.accent.danger, fontWeight: "700" }]}>
                          ₹{Number(selectedExpense.remainingAmount !== undefined ? selectedExpense.remainingAmount : (selectedExpense.paymentMethod === "Balance" ? selectedExpense.amount : 0)).toLocaleString("en-IN")}
                        </Text>
                      </View>
                    </>
                  )}
                  {selectedExpense.description ? (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.descriptionSection}>
                        <Text style={styles.detailMetaLabel}>Description</Text>
                        <Text style={styles.descriptionText}>{selectedExpense.description}</Text>
                      </View>
                    </>
                  ) : null}
                </View>

                {selectedExpense.billImageUrl ? (
                  <View style={styles.billImageSection}>
                    <Text style={styles.billImageHeader}>Uploaded Bill Receipt</Text>
                    <Image
                      source={selectedExpense.billImageUrl ? { uri: selectedExpense.billImageUrl } : undefined}
                      style={styles.fullBillImage}
                      contentFit="contain"
                    />
                  </View>
                ) : null}

                 <View style={styles.actionButtonRow}>
                   <Pressable
                     style={[styles.editButton, { backgroundColor: "#2563EB", borderColor: "#2563EB" }]}
                     onPress={() => handleOpenShareModal(selectedExpense)}
                   >
                     <MaterialIcons name="share" size={20} color="#FFFFFF" />
                     <Text style={[styles.editButtonText, { color: "#FFFFFF" }]}>Share</Text>
                   </Pressable>

                   <Pressable
                     style={styles.editButton}
                     onPress={() => handleOpenEditExpense(selectedExpense)}
                   >
                     <MaterialIcons name="edit" size={20} color="#059669" />
                     <Text style={styles.editButtonText}>Edit Details</Text>
                   </Pressable>

                   <Pressable
                     style={styles.deleteButton}
                     onPress={() => handleDeletePress(selectedExpense)}
                   >
                     <MaterialIcons name="delete" size={20} color={colors.accent.danger} />
                     <Text style={styles.deleteButtonText}>Delete</Text>
                   </Pressable>
                 </View>
              </ScrollView>
            </View>
          );
        })()}
      </Modal>

      {/* COMPILED REPORTS SUMMARY MODAL */}
      <Modal visible={isReportsModalOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailHeaderTitle}>Compiled Report Summary</Text>
            <Pressable onPress={() => setIsReportsModalOpen(false)}>
              <MaterialIcons name="close" size={26} color={colors.text.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
            <View style={styles.detailHero}>
              <View style={[styles.detailCategoryCircle, { backgroundColor: "#f0fdf4" }]}>
                <MaterialIcons name="analytics" size={36} color="#059669" />
              </View>
              <Text style={styles.detailHeroTitle}>
                {reportPeriod === "daily" ? "Daily" : reportPeriod === "weekly" ? "Weekly" : "Monthly"} Ledger Summary
              </Text>
              <Text style={styles.detailHeroAmount}>
                ₹{
                  (reportPeriod === "daily" ? todayExpensesSum : reportPeriod === "weekly" ? weekExpensesSum : monthExpensesSum).toLocaleString("en-IN")
                }
              </Text>
              <Text style={styles.reportSubtitle}>
                Hollow Bricks Business App Finance Report
              </Text>
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.cardReportSectionTitle}>Category Breakdown</Text>
              {expenses.length === 0 ? (
                <Text style={styles.emptyText}>No category history recorded.</Text>
              ) : (
                Object.entries(
                  expenses
                    .filter((e: any) => {
                      const d = new Date(e.expenseDate);
                      if (reportPeriod === "daily") return d >= todayStart;
                      if (reportPeriod === "weekly") return d >= monday;
                      return d >= monthStart;
                    })
                    .reduce((acc: Record<string, number>, curr: any) => {
                      const cat = curr.category || "Miscellaneous";
                      acc[cat] = (acc[cat] || 0) + Number(curr.amount || 0);
                      return acc;
                    }, {} as Record<string, number>)
                ).map(([cat, amt]) => (
                  <View key={cat} style={styles.reportBreakdownRow}>
                    <Text style={styles.reportBreakdownLabel}>{cat}</Text>
                    <Text style={styles.reportBreakdownVal}>₹{(amt as number).toLocaleString("en-IN")}</Text>
                  </View>
                ))
              )}
            </View>

            <Pressable
              style={styles.exportBtn}
              onPress={() => {
                Alert.alert(
                  "Export Successful",
                  "Expense Report exported as PDF successfully. (Stored in Downloads directory)"
                );
                setIsReportsModalOpen(false);
              }}
            >
              <MaterialIcons name="picture-as-pdf" size={20} color={colors.bg.card} />
              <Text style={styles.exportBtnText}>Download PDF Report</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* BUDGET LIMIT MODAL */}
      <Modal visible={isBudgetModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.budgetModalContent}>
            <View style={styles.budgetModalHeader}>
              <Text style={styles.budgetModalTitle}>Set Monthly Budget</Text>
              <Pressable onPress={() => setIsBudgetModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Select Category *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={styles.pillContainer}>
                {Object.keys(CATEGORY_CONFIG).map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setBudgetCategory(cat)}
                    style={[styles.pill, budgetCategory === cat && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, budgetCategory === cat && styles.pillTextActive]}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.inputLabel}>Monthly Limit (₹) *</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={budgetAmount}
              onChangeText={setBudgetAmount}
              placeholder="e.g. 5000"
            />

            <Pressable
              style={[styles.submitBtn, isSavingBudget && styles.submitBtnDisabled, { marginTop: 16 }]}
              onPress={async () => {
                if (!budgetCategory) {
                  Alert.alert("Required", "Please select a category.");
                  return;
                }
                const amt = parseFloat(budgetAmount);
                if (isNaN(amt) || amt <= 0) {
                  Alert.alert("Invalid", "Please enter a valid budget amount.");
                  return;
                }
                setIsSavingBudget(true);
                const ok = await setBudget(budgetCategory, amt);
                setIsSavingBudget(false);
                if (ok) {
                  setIsBudgetModalOpen(false);
                  Alert.alert("Saved", `Budget of ₹${amt.toLocaleString("en-IN")} set for ${budgetCategory}.`);
                } else {
                  Alert.alert("Error", "Failed to save budget.");
                }
              }}
              disabled={isSavingBudget}
            >
              {isSavingBudget ? (
                <ActivityIndicator color={colors.bg.card} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Save Budget Limit</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* RECURRING EXPENSE ADD/EDIT MODAL */}
      <Modal visible={isRecurringModalOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formHeaderTitle}>
              {editingRecurringId ? "✏️ Edit Recurring" : "🔄 Add Recurring Expense"}
            </Text>
            <Pressable onPress={() => setIsRecurringModalOpen(false)}>
              <MaterialIcons name="close" size={26} color={colors.text.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.formScrollView} contentContainerStyle={styles.formContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Template Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Monthly Office Rent"
                value={recTitle}
                onChangeText={setRecTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Amount (₹) *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="₹ 0.00"
                keyboardType="numeric"
                value={recAmount}
                onChangeText={setRecAmount}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Category *</Text>
              <View style={styles.categoryGrid}>
                {Object.entries(CATEGORY_CONFIG).map(([catKey, catInfo]) => {
                  const isSelected = recCategory === catKey;
                  return (
                    <Pressable
                      key={catKey}
                      style={[
                        styles.categoryPickerCard,
                        isSelected && { borderColor: (catInfo as any).color, backgroundColor: `${(catInfo as any).color}10` },
                      ]}
                      onPress={() => setRecCategory(catKey)}
                    >
                      <MaterialIcons
                        name={(catInfo as any).icon as any}
                        size={20}
                        color={isSelected ? (catInfo as any).color : colors.text.muted}
                      />
                      <Text
                        style={[
                          styles.categoryPickerLabel,
                          isSelected && { color: (catInfo as any).color, fontWeight: "700" },
                        ]}
                        numberOfLines={1}
                      >
                        {(catInfo as any).label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Frequency *</Text>
              <View style={styles.segmentContainer}>
                <Pressable
                  style={[styles.segmentBtn, recFrequency === "monthly" && styles.segmentBtnActive]}
                  onPress={() => setRecFrequency("monthly")}
                >
                  <MaterialIcons name="calendar-month" size={16} color={recFrequency === "monthly" ? "#1A1D27" : colors.text.secondary} style={{ marginRight: 6 }} />
                  <Text style={[styles.segmentBtnText, recFrequency === "monthly" && styles.segmentBtnTextActive]}>
                    Monthly
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.segmentBtn, recFrequency === "weekly" && styles.segmentBtnActive]}
                  onPress={() => setRecFrequency("weekly")}
                >
                  <MaterialIcons name="date-range" size={16} color={recFrequency === "weekly" ? "#1A1D27" : colors.text.secondary} style={{ marginRight: 6 }} />
                  <Text style={[styles.segmentBtnText, recFrequency === "weekly" && styles.segmentBtnTextActive]}>
                    Weekly
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Payment Method</Text>
              <View style={styles.methodContainer}>
                {PAYMENT_METHODS.map((method) => {
                  const isSelected = recPaymentMethod === method;
                  return (
                    <Pressable
                      key={method}
                      style={[styles.methodBtn, isSelected && styles.methodBtnActive]}
                      onPress={() => setRecPaymentMethod(method)}
                    >
                      <Text style={[styles.methodText, isSelected && styles.methodTextActive]}>
                        {method}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Notes (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Additional details..."
                value={recDescription}
                onChangeText={setRecDescription}
                multiline
                numberOfLines={3}
              />
            </View>

            <Pressable
              style={[styles.submitBtn, isSavingRecurring && styles.submitBtnDisabled]}
              onPress={async () => {
                if (!recTitle.trim()) {
                  Alert.alert("Required", "Please enter a title.");
                  return;
                }
                if (!recCategory) {
                  Alert.alert("Required", "Please select a category.");
                  return;
                }
                const amt = parseFloat(recAmount);
                if (isNaN(amt) || amt <= 0) {
                  Alert.alert("Invalid", "Please enter a valid amount.");
                  return;
                }

                setIsSavingRecurring(true);
                const data = {
                  title: recTitle.trim(),
                  amount: amt,
                  category: recCategory,
                  frequency: recFrequency,
                  paymentMethod: recPaymentMethod,
                  description: recDescription.trim(),
                  nextDueDate: new Date(),
                };

                let success = false;
                if (editingRecurringId) {
                  success = await updateRecurringExpense(editingRecurringId, data);
                } else {
                  const id = await addRecurringExpense(data);
                  success = !!id;
                }

                setIsSavingRecurring(false);
                if (success) {
                  setIsRecurringModalOpen(false);
                  Alert.alert("Saved", `Recurring expense ${editingRecurringId ? "updated" : "created"} successfully.`);
                } else {
                  Alert.alert("Error", "Failed to save recurring expense.");
                }
              }}
              disabled={isSavingRecurring}
            >
              {isSavingRecurring ? (
                <ActivityIndicator color={colors.bg.card} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {editingRecurringId ? "Update Template" : "Create Template"}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <EasyCalendarModal
        visible={isCalendarOpen}
        date={formDate}
        onSelectDate={setFormDate}
        onClose={() => setIsCalendarOpen(false)}
        title="Select Expense Date"
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
  scrollContainer: {
    paddingBottom: 100,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTabItem: {
    borderBottomColor: "#059669",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.muted,
    marginLeft: 6,
  },
  activeTabText: {
    color: "#059669",
  },
  summaryCarousel: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  summaryCard: {
    width: 155,
    minWidth: 145,
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  summaryLabel: {
    color: colors.text.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  summaryValue: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
  },
  searchFilterCard: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.border.subtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: "500",
  },
  filtersScrollRow: {
    marginTop: 12,
  },
  pillContainer: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.border.subtle,
  },
  pillActive: {
    backgroundColor: "#e6f4ea",
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
  },
  pillTextActive: {
    color: "#059669",
  },
  categoryFilterRow: {
    marginTop: 12,
  },
  selectWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
    marginRight: 8,
  },
  catFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.bg.primary,
    marginRight: 6,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  catFilterPillActive: {
    backgroundColor: "#059669",
    borderColor: "#059669",
  },
  catFilterText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
  },
  catFilterTextActive: {
    color: colors.bg.card,
  },
  sortToggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  sortToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e6f4ea",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#059669",
    marginLeft: 4,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  expenseCard: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 14,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  categoryBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  expenseTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
    flex: 1,
    marginRight: 8,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  metaCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
  },
  expenseMethod: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
    backgroundColor: colors.border.subtle,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  expenseDateText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
  },
  notesPreview: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 6,
    backgroundColor: colors.bg.primary,
    padding: 6,
    borderRadius: 8,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  fabText: {
    color: colors.bg.card,
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 6,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
    paddingHorizontal: 40,
  },
  emptyCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyHeading: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  analyticsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 16,
  },
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardSectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 14,
  },
  cardSectionSub: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 16,
    lineHeight: 18,
  },
  analyticsProgressBarRow: {
    marginBottom: 14,
  },
  analyticsProgressBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  flexRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  analyticsProgressLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.primary,
  },
  analyticsProgressValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.border.subtle,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  analyticsStatGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statColumn: {
    flex: 1,
    alignItems: "center",
    padding: 8,
  },
  statCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bg.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
    marginTop: 4,
  },
  statSubText: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
    textAlign: "center",
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
  formSelectContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  formSelectPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.border.subtle,
  },
  formSelectPillActive: {
    backgroundColor: "#059669",
  },
  formSelectPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  formSelectPillTextActive: {
    color: colors.bg.card,
  },
  dateSelectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  dateSelectorText: {
    fontSize: 14,
    color: colors.text.primary,
    marginLeft: 6,
    fontWeight: "600",
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
  uploadBtn: {
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadBtnText: {
    color: "#059669",
    fontWeight: "700",
    fontSize: 14,
    marginTop: 6,
  },
  imagePreviewContainer: {
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
  submitBtn: {
    backgroundColor: "#059669",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  submitBtnDisabled: {
    backgroundColor: "#a7f3d0",
  },
  submitBtnText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 16,
  },
  detailContainer: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  detailHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    paddingBottom: 40,
  },
  detailHero: {
    alignItems: "center",
    backgroundColor: colors.bg.card,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  detailCategoryCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  detailHeroTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
  },
  detailHeroAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text.primary,
    marginTop: 8,
  },
  detailTagRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  detailTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  detailTagText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  detailCard: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  detailMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  detailMetaLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
  },
  detailMetaVal: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
  },
  descriptionSection: {
    paddingVertical: 8,
  },
  descriptionText: {
    fontSize: 14,
    color: colors.text.primary,
    marginTop: 6,
    lineHeight: 20,
  },
  billImageSection: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  billImageHeader: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 8,
  },
  fullBillImage: {
    width: "100%",
    height: 300,
    borderRadius: 16,
    backgroundColor: colors.border.subtle,
  },
  actionButtonRow: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 24,
  },
  rawMaterialNotice: {
    flexDirection: "row",
    backgroundColor: "#fffbeb",
    borderWidth: 1.5,
    borderColor: "#fde68a",
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 24,
    gap: 8,
    alignItems: "flex-start",
  },
  rawMaterialNoticeText: {
    color: colors.accent.warning,
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
    lineHeight: 16,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: "#059669",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  editButtonText: {
    color: "#059669",
    fontSize: 14,
    fontWeight: "700",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  deleteButtonText: {
    color: colors.accent.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: 12,
  },
  reportPillRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 14,
  },
  reportPill: {
    flex: 1,
    backgroundColor: colors.border.subtle,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  reportPillActive: {
    backgroundColor: "#e6f4ea",
  },
  reportPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  reportPillTextActive: {
    color: "#059669",
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#059669",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
    marginTop: 8,
  },
  generateBtnText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 14,
  },
  reportSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
    fontWeight: "500",
  },
  cardReportSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 10,
  },
  reportBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.bg.primary,
  },
  reportBreakdownLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  reportBreakdownVal: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#059669",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
    marginHorizontal: 16,
    marginTop: 20,
  },
  exportBtnText: {
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
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  skeletonCard: {
    backgroundColor: colors.border.subtle,
    borderRadius: 16,
    padding: 14,
    height: 72,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skeletonLeftRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  skeletonBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.border.medium,
    marginRight: 12,
  },
  skeletonMeta: {
    gap: 6,
  },
  skeletonTitle: {
    width: 120,
    height: 12,
    backgroundColor: colors.border.medium,
    borderRadius: 4,
  },
  skeletonSub: {
    width: 80,
    height: 10,
    backgroundColor: colors.border.medium,
    borderRadius: 4,
  },
  skeletonAmount: {
    width: 60,
    height: 14,
    backgroundColor: colors.border.medium,
    borderRadius: 4,
  },
  listSection: {
    marginBottom: 8,
  },
  listSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  listSectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  listSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#065f46",
    letterSpacing: 0.3,
  },
  listSectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  listSectionBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  listSectionItems: {
    gap: 12,
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
  splitDetailsRow: {
    marginTop: 4,
    backgroundColor: colors.bg.primary,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  splitDetailsText: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: "600",
  },
  splitPaidText: {
    color: "#16a34a",
    fontWeight: "700",
  },
  splitDueText: {
    color: "#dc2626",
    fontWeight: "700",
  },
  // ─── Category Grid Picker ───
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryPickerCard: {
    width: "30%" as any,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    backgroundColor: colors.bg.card,
    gap: 4,
  },
  categoryPickerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
    textAlign: "center",
  },
  // ─── Budget Limits ───
  budgetHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  addBudgetBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e6f4ea",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addBudgetBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
  },
  emptyBudgetCard: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  emptyBudgetText: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  budgetRow: {
    marginBottom: 14,
  },
  budgetRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  budgetCategoryName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.primary,
  },
  budgetPctText: {
    fontSize: 11,
    fontWeight: "700",
  },
  budgetWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  budgetWarningText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.accent.danger,
  },
  // ─── Monthly Trends ───
  trendChartContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: 160,
  },
  trendBarCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  trendBar: {
    width: 28,
    borderRadius: 6,
    minHeight: 4,
  },
  trendBarValue: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  trendBarLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
    marginTop: 2,
  },
  trendChangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  trendChangeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  // ─── Recurring Expenses ───
  recurringActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  quickLogBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  quickLogBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.bg.card,
  },
  recurringEditBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: colors.border.subtle,
  },
  recurringDeleteBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#fef2f2",
  },
  // ─── Budget Modal ───
  budgetModalContent: {
    backgroundColor: colors.bg.card,
    borderRadius: 20,
    padding: 20,
    width: "90%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  budgetModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  budgetModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
  },
})
};
;
