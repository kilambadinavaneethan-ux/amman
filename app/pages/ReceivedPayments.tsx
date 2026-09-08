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
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PaymentContext } from "../context/PaymentContext";
import { CustomerContext } from "../context/CustomerContext";
import { CollectorContext } from "../context/CollectorContext";
import { OrderContext } from "../context/OrderContext";
import AnimatedPage from "../components/AnimatedPage";
import BackButton from "../components/BackButton";
import EasyCalendarModal from "../components/EasyCalendarModal";
import { useTheme } from "../context/ThemeContext";
import { useScrollRestoration } from "../context/ScrollContext";

const PAYMENT_METHODS = ["All", "Cash", "UPI", "Bank Transfer", "Card", "Other"];
const PAYMENT_SOURCES = [
  { id: "All", label: "All Sources" },
  { id: "Direct", label: "Direct Receipts" },
  { id: "Order", label: "Order Payments" },
];

export default function ReceivedPayments() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/received-payments");
  const router = useRouter();

  const { payments, loading: loadingPayments, deletePayment } = useContext(PaymentContext) as any || { payments: [], loading: false };
  const { customers } = useContext(CustomerContext) as any || { customers: [] };
  const { collectors } = useContext(CollectorContext) as any || { collectors: [] };
  const { orders, loading: loadingOrders } = useContext(OrderContext) as any || { orders: [], loading: false };

  const loading = loadingPayments || loadingOrders;

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("All");
  const [selectedSource, setSelectedSource] = useState<"All" | "Direct" | "Order">("All");
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

  // Refresh & Delete
  const [refreshing, setRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  // Combine Standalone Receipts (PaymentContext) & Order Payments (OrderContext)
  const allIncomingPayments = useMemo(() => {
    const list: any[] = [];

    // 1. Direct receipts from PaymentContext
    if (payments && Array.isArray(payments)) {
      payments.forEach((p: any) => {
        const amt = Number(p.amountReceived || p.amount || 0);
        if (amt <= 0) return;

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

        list.push({
          id: p.id,
          customerId: p.customerId || null,
          customerName: p.customerName || "Unknown Customer",
          amountReceived: amt,
          paymentMethod: p.paymentMethod || p.paymentMode || p.paymentType || "Cash",
          createdAt: date,
          collectorId: p.collectorId || null,
          collectorName: p.collectorName || null,
          notes: p.notes || "",
          orderId: p.orderId || null,
          pendingBefore: p.pendingBefore,
          pendingAfter: p.pendingAfter,
          sourceType: p.orderId ? "order_receipt" : "direct_receipt",
          sourceLabel: p.orderId ? "Order Payment" : "Direct Receipt",
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

          list.push({
            id: `order-pay-${ord.id}`,
            customerId: ord.customerId || null,
            customerName: ord.customerName || "Unknown Customer",
            amountReceived: unloggedAmt,
            paymentMethod: ord.paymentMethod || ord.paymentMode || ord.paymentType || "Cash",
            createdAt: orderDate,
            collectorId: ord.collectorId || null,
            collectorName: ord.collectorName || null,
            notes: notesText,
            orderId: ord.id,
            sourceType: "order_advance",
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
          String(p.amountReceived || "").includes(q)
      );
    }

    // Source filter (Direct vs Order)
    if (selectedSource !== "All") {
      if (selectedSource === "Direct") {
        list = list.filter((p: any) => p.sourceType === "direct_receipt");
      } else if (selectedSource === "Order") {
        list = list.filter((p: any) => p.sourceType === "order_receipt" || p.sourceType === "order_advance");
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
    selectedSource,
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
    if (selectedSource !== "All") count++;
    if (selectedPeriod !== "all") count++;
    if (selectedMethod !== "All") count++;
    if (selectedCollector !== "All") count++;
    if (selectedCustomer !== "All") count++;
    if (minAmount.trim() !== "") count++;
    if (maxAmount.trim() !== "") count++;
    if (sortBy !== "newest") count++;
    return count;
  }, [selectedSource, selectedPeriod, selectedMethod, selectedCollector, selectedCustomer, minAmount, maxAmount, sortBy]);

  const resetAllFilters = () => {
    setSearchQuery("");
    setSelectedSource("All");
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

  // Summary Stats
  const totalReceived = useMemo(
    () => filteredPayments.reduce((sum: number, p: any) => sum + Number(p.amountReceived || 0), 0),
    [filteredPayments]
  );

  const todayReceived = useMemo(() => {
    const todayStr = new Date().toDateString();
    return (allIncomingPayments || [])
      .filter((p: any) => {
        const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
        return d.toDateString() === todayStr;
      })
      .reduce((sum: number, p: any) => sum + Number(p.amountReceived || 0), 0);
  }, [allIncomingPayments]);

  const weekReceived = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return (allIncomingPayments || [])
      .filter((p: any) => {
        const d = p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt);
        return d >= weekAgo;
      })
      .reduce((sum: number, p: any) => sum + Number(p.amountReceived || 0), 0);
  }, [allIncomingPayments]);

  const methodBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredPayments.forEach((p: any) => {
      const method = p.paymentMethod || "Cash";
      map[method] = (map[method] || 0) + Number(p.amountReceived || 0);
    });
    return map;
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

  const handleDeletePayment = async (paymentId: string) => {
    Alert.alert(
      "Delete Payment",
      "This will permanently delete this payment record and reverse the customer's balance. Continue?",
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
                Alert.alert("Deleted", "Payment deleted and customer balance reversed.");
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
        {/* Header */}
        <View style={styles.header}>
          <BackButton label="Settings" onPress={() => router.push("/settings" as any)} />
          <Text style={styles.headerTitle}>💰 Received Payments</Text>
          <Text style={styles.headerSubtitle}>
            Track all incoming payments from customers
          </Text>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderLeftColor: colors.accent.success }]}>
            <MaterialIcons name="account-balance-wallet" size={22} color={colors.accent.success} />
            <Text style={styles.summaryLabel}>Total (Filtered)</Text>
            <Text style={[styles.summaryValue, { color: colors.accent.success }]}>
              ₹{totalReceived.toLocaleString("en-IN")}
            </Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: colors.accent.primary }]}>
            <MaterialIcons name="today" size={22} color={colors.accent.primary} />
            <Text style={styles.summaryLabel}>Today</Text>
            <Text style={[styles.summaryValue, { color: colors.accent.primary }]}>
              ₹{todayReceived.toLocaleString("en-IN")}
            </Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: colors.accent.info }]}>
            <MaterialIcons name="date-range" size={22} color={colors.accent.info} />
            <Text style={styles.summaryLabel}>This Week</Text>
            <Text style={[styles.summaryValue, { color: colors.accent.info }]}>
              ₹{weekReceived.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>

        {/* Method Breakdown */}
        {Object.keys(methodBreakdown).length > 0 && (
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>Payment Method Breakdown</Text>
            <View style={styles.breakdownRow}>
              {Object.entries(methodBreakdown).map(([method, amount]) => (
                <View key={method} style={styles.breakdownItem}>
                  <View style={[styles.breakdownIconWrap, { backgroundColor: `${getMethodColor(method)}15` }]}>
                    <MaterialIcons name={getMethodIcon(method)} size={18} color={getMethodColor(method)} />
                  </View>
                  <Text style={styles.breakdownMethodLabel}>{method}</Text>
                  <Text style={[styles.breakdownAmount, { color: getMethodColor(method) }]}>
                    ₹{Number(amount).toLocaleString("en-IN")}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Search Bar + Filter Button */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <View style={[styles.searchBox, { flex: 1, marginBottom: 0 }]}>
            <MaterialIcons name="search" size={20} color={colors.text.muted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search customer, collector, notes..."
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

        {/* Payment Source Filter Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={styles.filterRow}>
            {PAYMENT_SOURCES.map((src) => {
              const isActive = selectedSource === src.id;
              return (
                <Pressable
                  key={src.id}
                  onPress={() => setSelectedSource(src.id as any)}
                  style={[
                    styles.filterChip,
                    isActive && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                  ]}
                >
                  <MaterialIcons
                    name={src.id === "Order" ? "shopping-bag" : src.id === "Direct" ? "receipt" : "grid-view"}
                    size={14}
                    color={isActive ? "#fff" : colors.accent.primary}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.filterChipText, isActive && { color: "#fff" }]}>{src.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Period Filter Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
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

        {/* Collector Filter Row (If collectors exist) */}
        {collectors && collectors.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={styles.filterRow}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.muted, alignSelf: "center", marginRight: 4 }}>
                COLLECTOR:
              </Text>
              {[
                { id: "All", name: "All Collectors" },
                { id: "Direct", name: "Direct (No Collector)" },
                ...collectors,
              ].map((col: any) => {
                const isActive = selectedCollector === col.id;
                return (
                  <Pressable
                    key={col.id}
                    onPress={() => setSelectedCollector(col.id)}
                    style={[
                      styles.filterChip,
                      isActive && { backgroundColor: "#8b5cf6", borderColor: "#8b5cf6" },
                    ]}
                  >
                    <MaterialIcons name="person" size={13} color={isActive ? "#fff" : "#8b5cf6"} style={{ marginRight: 4 }} />
                    <Text style={[styles.filterChipText, isActive && { color: "#fff" }]}>{col.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Active Filter Pills Bar */}
        {activeFiltersCount > 0 && (
          <View style={styles.activePillsBar}>
            <Text style={styles.activePillsLabel}>Active Filters:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                {selectedSource !== "All" && (
                  <Pressable style={styles.activePill} onPress={() => setSelectedSource("All")}>
                    <Text style={styles.activePillText}>
                      Source: {selectedSource === "Direct" ? "Direct Receipts" : "Order Payments"}
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
                      Customer: {customers.find((c: any) => c.id === selectedCustomer)?.name || "Selected"}
                    </Text>
                    <MaterialIcons name="close" size={12} color={colors.accent.primary} />
                  </Pressable>
                )}
                {(minAmount || maxAmount) && (
                  <Pressable
                    style={styles.activePill}
                    onPress={() => {
                      setMinAmount("");
                      setMaxAmount("");
                    }}
                  >
                    <Text style={styles.activePillText}>
                      Amount: {minAmount ? `≥₹${minAmount}` : ""} {maxAmount ? `≤₹${maxAmount}` : ""}
                    </Text>
                    <MaterialIcons name="close" size={12} color={colors.accent.primary} />
                  </Pressable>
                )}
                {sortBy !== "newest" && (
                  <Pressable style={styles.activePill} onPress={() => setSortBy("newest")}>
                    <Text style={styles.activePillText}>Sort: {sortBy}</Text>
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
            {filteredPayments.length} payment{filteredPayments.length !== 1 ? "s" : ""} found
          </Text>
          <Text style={{ fontSize: 11, color: colors.text.muted, fontWeight: "600" }}>
            Sorted: {sortBy === "newest" ? "Newest First" : sortBy === "oldest" ? "Oldest First" : sortBy === "amount_desc" ? "Amount: High to Low" : "Amount: Low to High"}
          </Text>
        </View>

        {/* Payment List */}
        {filteredPayments.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="receipt-long" size={48} color={colors.border.medium} />
            <Text style={styles.emptyTitle}>No Payments Found</Text>
            <Text style={styles.emptyDesc}>
              {activeFiltersCount > 0 || searchQuery
                ? "No received payments match your applied filters or search query."
                : "When you receive payments from customers, they'll show up here."}
            </Text>
            {activeFiltersCount > 0 && (
              <Pressable style={styles.resetCtaBtn} onPress={resetAllFilters}>
                <Text style={styles.resetCtaBtnText}>Reset All Filters</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.paymentList}>
            {filteredPayments.map((payment: any) => {
              const date = payment.createdAt instanceof Date ? payment.createdAt : new Date(payment.createdAt);
              const method = payment.paymentMethod || "Cash";
              const methodColor = getMethodColor(method);
              const isOrderPay = payment.sourceType === "order_receipt" || payment.sourceType === "order_advance";

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
                    <View style={[styles.paymentMethodBadge, { backgroundColor: `${methodColor}15` }]}>
                      <MaterialIcons name={getMethodIcon(method)} size={22} color={methodColor} />
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
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {/* Source Tag */}
                      <View style={[styles.sourceBadge, { backgroundColor: isOrderPay ? `${colors.accent.info}18` : `${colors.accent.success}18` }]}>
                        <MaterialIcons
                          name={isOrderPay ? "shopping-bag" : "receipt"}
                          size={11}
                          color={isOrderPay ? colors.accent.info : colors.accent.success}
                        />
                        <Text style={[styles.sourceBadgeText, { color: isOrderPay ? colors.accent.info : colors.accent.success }]}>
                          {payment.sourceLabel || (isOrderPay ? "Order Payment" : "Direct Receipt")}
                        </Text>
                      </View>

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
                    <Text style={styles.paymentAmount}>
                      +₹{Number(payment.amountReceived || payment.amount || 0).toLocaleString("en-IN")}
                    </Text>
                    <View style={[styles.methodTag, { backgroundColor: `${methodColor}15` }]}>
                      <Text style={[styles.methodTagText, { color: methodColor }]}>{method}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

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
                <Text style={styles.modalTitle}>Filter & Sort Payments</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setIsFilterModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Payment Source */}
              <Text style={styles.filterSectionTitle}>Payment Source</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {PAYMENT_SOURCES.map((src) => {
                  const isSelected = selectedSource === src.id;
                  return (
                    <Pressable
                      key={src.id}
                      onPress={() => setSelectedSource(src.id as any)}
                      style={[
                        styles.filterChip,
                        isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                      ]}
                    >
                      <Text style={[styles.filterChipText, isSelected && { color: "#ffffff" }]}>{src.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Sort Order */}
              <Text style={styles.filterSectionTitle}>Sort Order</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {[
                  { id: "newest", label: "Newest First" },
                  { id: "oldest", label: "Oldest First" },
                  { id: "amount_desc", label: "Amount: High → Low" },
                  { id: "amount_asc", label: "Amount: Low → High" },
                ].map((s) => {
                  const isSelected = sortBy === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => setSortBy(s.id as any)}
                      style={[
                        styles.filterChip,
                        isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                      ]}
                    >
                      <Text style={[styles.filterChipText, isSelected && { color: "#ffffff" }]}>{s.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Time Period */}
              <Text style={styles.filterSectionTitle}>Time Period</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {[
                  { id: "all", label: "All Time" },
                  { id: "today", label: "Today" },
                  { id: "yesterday", label: "Yesterday" },
                  { id: "week", label: "This Week" },
                  { id: "month", label: "This Month" },
                  { id: "custom", label: "Custom Date Range" },
                ].map((p) => {
                  const isSelected = selectedPeriod === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setSelectedPeriod(p.id as any)}
                      style={[
                        styles.filterChip,
                        isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                      ]}
                    >
                      <Text style={[styles.filterChipText, isSelected && { color: "#ffffff" }]}>{p.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Custom Date Range Pickers if custom selected */}
              {selectedPeriod === "custom" && (
                <View style={{ backgroundColor: colors.bg.primary, padding: 12, borderRadius: 12, marginBottom: 16, gap: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.primary }}>Custom Date Range:</Text>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      style={{
                        flex: 1,
                        padding: 10,
                        backgroundColor: colors.bg.card,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border.subtle,
                      }}
                      onPress={() => setCalendarPickerTarget("start")}
                    >
                      <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: "700" }}>START DATE</Text>
                      <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: "600", marginTop: 2 }}>
                        {startDate ? formatDate(startDate) : "Select Start Date"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={{
                        flex: 1,
                        padding: 10,
                        backgroundColor: colors.bg.card,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border.subtle,
                      }}
                      onPress={() => setCalendarPickerTarget("end")}
                    >
                      <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: "700" }}>END DATE</Text>
                      <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: "600", marginTop: 2 }}>
                        {endDate ? formatDate(endDate) : "Select End Date"}
                      </Text>
                    </Pressable>
                  </View>

                  {(startDate || endDate) && (
                    <Pressable
                      onPress={() => {
                        setStartDate(null);
                        setEndDate(null);
                      }}
                      style={{ alignSelf: "flex-end" }}
                    >
                      <Text style={{ fontSize: 11, color: colors.accent.danger, fontWeight: "700" }}>Clear Custom Dates</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Payment Method */}
              <Text style={styles.filterSectionTitle}>Payment Method</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {PAYMENT_METHODS.map((m) => {
                  const isSelected = selectedMethod === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setSelectedMethod(m)}
                      style={[
                        styles.filterChip,
                        isSelected && { backgroundColor: getMethodColor(m), borderColor: getMethodColor(m) },
                      ]}
                    >
                      <Text style={[styles.filterChipText, isSelected && { color: "#ffffff" }]}>{m}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Collector Filter */}
              {collectors && collectors.length > 0 && (
                <>
                  <Text style={styles.filterSectionTitle}>Money Collector</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                    {[
                      { id: "All", name: "All Collectors" },
                      { id: "Direct", name: "Direct (No Collector)" },
                      ...collectors,
                    ].map((col: any) => {
                      const isSelected = selectedCollector === col.id;
                      return (
                        <Pressable
                          key={col.id}
                          onPress={() => setSelectedCollector(col.id)}
                          style={[
                            styles.filterChip,
                            isSelected && { backgroundColor: "#8b5cf6", borderColor: "#8b5cf6" },
                          ]}
                        >
                          <Text style={[styles.filterChipText, isSelected && { color: "#ffffff" }]}>{col.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Specific Customer Filter */}
              {customers && customers.length > 0 && (
                <>
                  <Text style={styles.filterSectionTitle}>Specific Customer</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        onPress={() => setSelectedCustomer("All")}
                        style={[
                          styles.filterChip,
                          selectedCustomer === "All" && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                        ]}
                      >
                        <Text style={[styles.filterChipText, selectedCustomer === "All" && { color: "#ffffff" }]}>
                          All Customers
                        </Text>
                      </Pressable>
                      {customers.map((cust: any) => {
                        const isSelected = selectedCustomer === cust.id;
                        return (
                          <Pressable
                            key={cust.id}
                            onPress={() => setSelectedCustomer(cust.id)}
                            style={[
                              styles.filterChip,
                              isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                            ]}
                          >
                            <Text style={[styles.filterChipText, isSelected && { color: "#ffffff" }]}>{cust.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              )}

              {/* Amount Range */}
              <Text style={styles.filterSectionTitle}>Amount Range (₹)</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                <TextInput
                  style={[styles.searchInput, { flex: 1, backgroundColor: colors.bg.primary }]}
                  value={minAmount}
                  onChangeText={setMinAmount}
                  placeholder="Min Amount ₹"
                  keyboardType="numeric"
                  placeholderTextColor={colors.text.muted}
                />
                <TextInput
                  style={[styles.searchInput, { flex: 1, backgroundColor: colors.bg.primary }]}
                  value={maxAmount}
                  onChangeText={setMaxAmount}
                  placeholder="Max Amount ₹"
                  keyboardType="numeric"
                  placeholderTextColor={colors.text.muted}
                />
              </View>

              {/* Modal Buttons */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                <Pressable
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                    alignItems: "center",
                  }}
                  onPress={resetAllFilters}
                >
                  <Text style={{ fontWeight: "700", color: colors.text.secondary }}>Reset All</Text>
                </Pressable>
                <Pressable
                  style={{
                    flex: 1.5,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: colors.accent.primary,
                    alignItems: "center",
                  }}
                  onPress={() => setIsFilterModalOpen(false)}
                >
                  <Text style={{ fontWeight: "700", color: "#ffffff" }}>Apply & Close</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========== EASY CALENDAR MODAL FOR CUSTOM DATES ========== */}
      <EasyCalendarModal
        visible={calendarPickerTarget !== null}
        date={
          calendarPickerTarget === "start"
            ? startDate || new Date()
            : endDate || new Date()
        }
        onSelectDate={(selectedDate) => {
          if (calendarPickerTarget === "start") {
            setStartDate(selectedDate);
          } else if (calendarPickerTarget === "end") {
            setEndDate(selectedDate);
          }
          setSelectedPeriod("custom");
          setCalendarPickerTarget(null);
        }}
        onClose={() => setCalendarPickerTarget(null)}
        title={calendarPickerTarget === "start" ? "Select Start Date" : "Select End Date"}
      />

      {/* ========== PAYMENT DETAIL MODAL ========== */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalFlexSpacer} onPress={() => setDetailModalVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="receipt" size={22} color={colors.accent.success} />
                <Text style={styles.modalTitle}>Payment Details</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setDetailModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            {selectedPayment && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Amount Display */}
                <View style={styles.detailAmountBox}>
                  <Text style={styles.detailAmountLabel}>Amount Received</Text>
                  <Text style={styles.detailAmountValue}>
                    ₹{Number(selectedPayment.amountReceived || selectedPayment.amount || 0).toLocaleString("en-IN")}
                  </Text>
                </View>

                {/* Info Rows */}
                <View style={styles.detailSection}>
                  <View style={styles.detailRow}>
                    <MaterialIcons
                      name={selectedPayment.sourceType?.includes("order") ? "shopping-bag" : "receipt"}
                      size={18}
                      color={colors.text.muted}
                    />
                    <View style={styles.detailRowContent}>
                      <Text style={styles.detailLabel}>Payment Source</Text>
                      <Text style={styles.detailValue}>
                        {selectedPayment.sourceLabel || (selectedPayment.sourceType?.includes("order") ? "Order Payment" : "Direct Receipt")}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name="person" size={18} color={colors.text.muted} />
                    <View style={styles.detailRowContent}>
                      <Text style={styles.detailLabel}>Customer</Text>
                      <Pressable
                        onPress={() => {
                          if (selectedPayment.customerId) {
                            setDetailModalVisible(false);
                            router.push({ pathname: "/customer-profile", params: { id: selectedPayment.customerId } } as any);
                          }
                        }}
                      >
                        <Text style={[styles.detailValue, selectedPayment.customerId && { color: colors.accent.primary }]}>
                          {selectedPayment.customerName || "Unknown"}
                          {selectedPayment.customerId ? "  ›" : ""}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name={getMethodIcon(selectedPayment.paymentMethod || "Cash")} size={18} color={colors.text.muted} />
                    <View style={styles.detailRowContent}>
                      <Text style={styles.detailLabel}>Payment Method</Text>
                      <Text style={styles.detailValue}>{selectedPayment.paymentMethod || "Cash"}</Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name="event" size={18} color={colors.text.muted} />
                    <View style={styles.detailRowContent}>
                      <Text style={styles.detailLabel}>Date & Time</Text>
                      <Text style={styles.detailValue}>
                        {formatDate(selectedPayment.createdAt)} at {formatTime(selectedPayment.createdAt)}
                      </Text>
                    </View>
                  </View>

                  {selectedPayment.collectorName && (
                    <View style={styles.detailRow}>
                      <MaterialIcons name="person-pin" size={18} color={colors.text.muted} />
                      <View style={styles.detailRowContent}>
                        <Text style={styles.detailLabel}>Collected By</Text>
                        <Text style={styles.detailValue}>{selectedPayment.collectorName}</Text>
                      </View>
                    </View>
                  )}

                  {selectedPayment.pendingBefore !== undefined && (
                    <View style={styles.detailRow}>
                      <MaterialIcons name="trending-down" size={18} color={colors.text.muted} />
                      <View style={styles.detailRowContent}>
                        <Text style={styles.detailLabel}>Balance Change</Text>
                        <Text style={styles.detailValue}>
                          ₹{Number(selectedPayment.pendingBefore || 0).toLocaleString("en-IN")}
                          {"  →  "}
                          ₹{Number(selectedPayment.pendingAfter || 0).toLocaleString("en-IN")}
                        </Text>
                      </View>
                    </View>
                  )}

                  {selectedPayment.notes ? (
                    <View style={styles.detailRow}>
                      <MaterialIcons name="notes" size={18} color={colors.text.muted} />
                      <View style={styles.detailRowContent}>
                        <Text style={styles.detailLabel}>Notes / Details</Text>
                        <Text style={styles.detailValue}>{selectedPayment.notes}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                {/* Actions */}
                <View style={styles.detailActions}>
                  {selectedPayment.customerId && (
                    <Pressable
                      style={[styles.detailActionBtn, { backgroundColor: `${colors.accent.primary}15` }]}
                      onPress={() => {
                        setDetailModalVisible(false);
                        router.push({ pathname: "/customer-profile", params: { id: selectedPayment.customerId } } as any);
                      }}
                    >
                      <MaterialIcons name="person" size={18} color={colors.accent.primary} />
                      <Text style={[styles.detailActionBtnText, { color: colors.accent.primary }]}>
                        View Customer
                      </Text>
                    </Pressable>
                  )}

                  {selectedPayment.isDirectPayment ? (
                    <Pressable
                      style={[styles.detailActionBtn, { backgroundColor: "#fef2f2" }]}
                      onPress={() => handleDeletePayment(selectedPayment.id)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={colors.accent.danger} />
                      ) : (
                        <>
                          <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                          <Text style={[styles.detailActionBtnText, { color: colors.accent.danger }]}>
                            Delete Payment
                          </Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}
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
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 40,
      backgroundColor: colors.bg.primary,
    },
    header: {
      marginBottom: 20,
    },
    headerTitle: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.text.primary,
      marginTop: 12,
    },
    headerSubtitle: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 4,
      fontWeight: "500",
    },

    // Summary Cards
    summaryRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 16,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderLeftWidth: 3,
      alignItems: "center",
      gap: 4,
    },
    summaryLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
      textAlign: "center",
    },
    summaryValue: {
      fontSize: 16,
      fontWeight: "800",
    },

    // Breakdown Card
    breakdownCard: {
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    breakdownTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 12,
    },
    breakdownRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    breakdownItem: {
      alignItems: "center",
      gap: 4,
      minWidth: 70,
    },
    breakdownIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    breakdownMethodLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.text.muted,
    },
    breakdownAmount: {
      fontSize: 13,
      fontWeight: "800",
    },

    // Search Box & Filter Toggle Button
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text.primary,
      fontWeight: "500",
    },
    filterToggleBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
    },
    filterBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      backgroundColor: colors.accent.danger,
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 4,
    },
    filterBadgeText: {
      color: "#ffffff",
      fontSize: 10,
      fontWeight: "800",
    },

    // Active Pills Bar
    activePillsBar: {
      backgroundColor: `${colors.accent.primary}10`,
      borderRadius: 12,
      padding: 10,
      marginBottom: 12,
      gap: 6,
    },
    activePillsLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.accent.primary,
      textTransform: "uppercase",
    },
    activePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.bg.card,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: `${colors.accent.primary}40`,
    },
    activePillText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    clearAllBtn: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 16,
      backgroundColor: `${colors.accent.danger}15`,
    },
    clearAllBtnText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.accent.danger,
    },

    // Filters
    filterRow: {
      flexDirection: "row",
      gap: 8,
      paddingVertical: 2,
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.card,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    filterSectionTitle: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    resultCount: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.muted,
    },

    // Empty State
    emptyState: {
      alignItems: "center",
      paddingVertical: 48,
      paddingHorizontal: 24,
      backgroundColor: colors.bg.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 12,
    },
    emptyDesc: {
      fontSize: 13,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: 6,
      lineHeight: 18,
    },
    resetCtaBtn: {
      marginTop: 16,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 20,
      backgroundColor: colors.accent.primary,
    },
    resetCtaBtnText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "700",
    },

    // Payment Cards
    paymentList: {
      gap: 10,
    },
    paymentCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      gap: 12,
    },
    paymentCardPressed: {
      backgroundColor: colors.bg.elevated,
      opacity: 0.9,
    },
    paymentCardLeft: {},
    paymentMethodBadge: {
      width: 44,
      height: 44,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    paymentCardCenter: {
      flex: 1,
    },
    paymentCustomerName: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 2,
    },
    paymentMeta: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "500",
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
      fontSize: 10,
      fontWeight: "700",
    },
    collectorBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: "#8b5cf615",
      alignSelf: "flex-start",
    },
    collectorBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: "#8b5cf6",
    },
    paymentNotes: {
      fontSize: 11,
      color: colors.text.muted,
      fontStyle: "italic",
      marginTop: 2,
    },
    paymentCardRight: {
      alignItems: "flex-end",
      gap: 4,
    },
    paymentAmount: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.accent.success,
    },
    methodTag: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    methodTagText: {
      fontSize: 10,
      fontWeight: "700",
    },

    // Modal
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
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
      maxHeight: "80%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
    },
    modalCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.bg.primary,
      justifyContent: "center",
      alignItems: "center",
    },

    // Detail Modal
    detailAmountBox: {
      alignItems: "center",
      paddingVertical: 20,
      backgroundColor: `${colors.accent.success}10`,
      borderRadius: 16,
      marginBottom: 16,
    },
    detailAmountLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.muted,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    detailAmountValue: {
      fontSize: 32,
      fontWeight: "900",
      color: colors.accent.success,
    },
    detailSection: {
      gap: 14,
      marginBottom: 20,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    detailRowContent: {
      flex: 1,
    },
    detailLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
      textTransform: "uppercase",
      marginBottom: 2,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
      lineHeight: 20,
    },
    detailActions: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 20,
    },
    detailActionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: 12,
    },
    detailActionBtnText: {
      fontSize: 13,
      fontWeight: "700",
    },
  });
};
