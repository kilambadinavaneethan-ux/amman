import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useContext, useEffect, useMemo, useState } from "react";
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
} from "react-native";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";
import { WorkerContext } from "../../context/WorkerContext";
import { db, normalizeDateValue } from "../../../src/config/firebase";
import { useScrollRestoration } from "../../context/ScrollContext";

const STATUS_FILTERS = [
  { label: "All Workers", value: "All" },
  { label: "Active", value: "Active" },
  { label: "Inactive", value: "Inactive" },
];

const ROLE_ICONS = {
  Labour: "construction",
  Operator: "engineering",
  Helper: "handyman",
  Driver: "local-shipping",
  Supervisor: "supervisor-account",
  Other: "person",
};

function UnifiedWorkerManagement() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/settings/workers");
  const router = useRouter();

  // Retrieve regular workers context
  const {
    workers,
    loading: loadingWorkers,
    logPayment,
  } = useContext(WorkerContext);

  // Tab: "regular" | "balances" | "history"
  const [activeTab, setActiveTab] = useState("regular");

  // Search & Status filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [refreshing, setRefreshing] = useState(false);

  // Real-time payments history lists
  const [regularPayments, setRegularPayments] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Record Payout Modal State
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("Cash");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [savingPayout, setSavingPayout] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  // Load regular worker payments
  useEffect(() => {
    const q = query(
      collection(db, "workerPayments"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            workerId: data.workerId,
            amount: Number(data.amount || 0),
            notes: data.notes || "",
            paymentMethod: data.paymentMethod || "Cash",
            date: normalizeDateValue(data.createdAt),
            type: "regular",
          };
        });
        setRegularPayments(list);
        setLoadingHistory(false);
      },
      (error) => {
        setLoadingHistory(false);
      },
    );
    return () => unsubscribe();
  }, []);

  // Combined mapped lists (Only Regular Workers)
  const mappedWorkers = useMemo(() => {
    return (workers || []).map((w) => ({
      id: w.id,
      name: w.name || "Unnamed Regular",
      mobile: w.mobile || "N/A",
      type: "regular",
      role: w.role || "Labour",
      billingSystem: w.billingSystem || "Time-Based",
      pieceRate: Number(w.pieceRate || 0),
      dailyWage: Number(w.dailyWage || 0),
      totalEarned: Number(w.totalWages || 0),
      totalPaid: Number(w.totalPaid || 0),
      totalPending: Number(w.totalPending || 0),
      status: w.status || "Active",
      hasShifting: !!w.hasShifting,
      loadingCost: Number(w.loadingCost || 0),
      unloadingCost: Number(w.unloadingCost || 0),
    }));
  }, [workers]);

  const combinedHistory = useMemo(() => {
    const workerMap = new Map(mappedWorkers.map((w) => [w.id, w]));

    const mapped = regularPayments.map((p) => {
      const w = workerMap.get(p.workerId);
      return {
        ...p,
        workerName: w ? w.name : "Unknown Worker",
        workerRole: w ? w.role : "Worker",
      };
    });

    return mapped.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [regularPayments, mappedWorkers]);

  // Filters for workers list
  const filteredRegularWorkers = useMemo(() => {
    return (workers || []).filter((w) => {
      const matchesSearch =
        (w.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.mobile || "").includes(searchQuery) ||
        (w.role || "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        selectedStatus === "All" || w.status === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [workers, searchQuery, selectedStatus]);

  // Balances filter
  const filteredBalances = useMemo(() => {
    return mappedWorkers.filter((w) => {
      const matchesSearch = w.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      return matchesSearch && w.status === "Active";
    });
  }, [mappedWorkers, searchQuery]);

  // History logs filter
  const filteredHistory = useMemo(() => {
    return combinedHistory.filter((p) => {
      return p.workerName.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [combinedHistory, searchQuery]);

  // Compute stats liability counts
  const liabilityStats = useMemo(() => {
    let regularLiability = 0;
    let activeCount = 0;

    mappedWorkers.forEach((w) => {
      if (w.status === "Active") {
        regularLiability += w.totalPending;
        activeCount++;
      }
    });

    return {
      regularLiability,
      activeCount,
    };
  }, [mappedWorkers]);

  // Record payout actions
  const handleOpenPaymentModal = (worker) => {
    if (worker.totalPending <= 0) {
      Alert.alert(
        "No Balance Due",
        `${worker.name} does not have any pending balance.`,
      );
      return;
    }
    setSelectedWorker(worker);
    setPayoutAmount(String(worker.totalPending));
    setPayoutMethod("Cash");
    setPayoutNotes("");
  };

  const handleClosePaymentModal = () => {
    setSelectedWorker(null);
    setPayoutAmount("");
    setPayoutNotes("");
  };

  const handleSavePayment = async () => {
    if (!selectedWorker) return;
    const amountNum = parseFloat(payoutAmount);

    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert(
        "Invalid Amount",
        "Please enter a valid amount greater than zero.",
      );
      return;
    }

    if (amountNum > selectedWorker.totalPending) {
      Alert.alert(
        "Excessive Amount",
        `Payment amount cannot exceed the pending balance of ₹${selectedWorker.totalPending.toLocaleString("en-IN")}.`,
      );
      return;
    }

    setSavingPayout(true);
    const result = await logPayment(selectedWorker.id, {
      amount: amountNum,
      paymentMethod: payoutMethod,
      notes: payoutNotes.trim(),
    });
    const success = !!result;

    setSavingPayout(true);
    setTimeout(() => {
      setSavingPayout(false);
      if (success) {
        Alert.alert(
          "Payment Logged",
          `Successfully logged payment of ₹${amountNum.toLocaleString("en-IN")} for ${selectedWorker.name}.`,
        );
        handleClosePaymentModal();
      } else {
        Alert.alert(
          "Payment Failed",
          "Failed to save payment transaction. Please try again.",
        );
      }
    }, 800);
  };

  const isLoading =
    loadingWorkers || (activeTab === "history" && loadingHistory);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <BackButton label="Settings" onPress={() => router.push("/settings")} />
          {activeTab === "regular" && (
            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => router.push("/settings/workers/add")}
            >
              <MaterialIcons name="add" size={20} color={colors.bg.card} />
              <Text style={styles.addButtonText}>Add Worker</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.title}>Worker Management</Text>
        <Text style={styles.subtitle}>
          Track worker directory, balances, and payout history.
        </Text>
      </View>

      {/* Stats Summary Cards (only visible in Balances tab) */}
      {activeTab === "balances" && (
        <View style={styles.statsRow}>
          <View
            style={[styles.statCard, { borderLeftColor: colors.accent.danger }]}
          >
            <Text style={styles.statLabel}>Total Liability</Text>
            <Text style={[styles.statValue, { color: colors.accent.danger }]}>
              ₹{liabilityStats.regularLiability.toLocaleString("en-IN")}
            </Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#3b82f6" }]}>
            <Text style={styles.statLabel}>Active Workers</Text>
            <Text style={[styles.statValue, { color: "#3b82f6" }]}>
              {liabilityStats.activeCount}
            </Text>
          </View>
        </View>
      )}

      {/* 3 Tabs Selector */}
      <View style={styles.tabContainer}>
        {[
          { key: "regular", label: "Workers", icon: "groups" },
          {
            key: "balances",
            label: "Balances",
            icon: "account-balance-wallet",
          },
          { key: "history", label: "Payout Log", icon: "receipt" },
        ].map((t) => {
          const active = activeTab === t.key;
          return (
            <Pressable
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => {
                setActiveTab(t.key);
                setSelectedStatus("All");
              }}
            >
              <MaterialIcons
                name={t.icon}
                size={18}
                color={active ? "#8B5CF6" : colors.text.muted}
              />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchBarWrapper}>
        <View style={styles.searchContainer}>
          <MaterialIcons
            name="search"
            size={20}
            color={colors.text.muted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={
              activeTab === "regular"
                ? "Search by name, phone, role..."
                : "Search by worker name..."
            }
            placeholderTextColor={colors.text.muted}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialIcons name="close" size={20} color={colors.text.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Status filters for Workers tab */}
        {activeTab === "regular" && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
          >
            <View style={styles.filterRow}>
              {STATUS_FILTERS.map((filter) => {
                const isSelected = selectedStatus === filter.value;
                return (
                  <Pressable
                    key={filter.value}
                    style={[
                      styles.filterPill,
                      isSelected && styles.filterPillSelected,
                    ]}
                    onPress={() => setSelectedStatus(filter.value)}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        isSelected && styles.filterTextSelected,
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.loadingText}>Fetching database contents...</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.listScrollContent}
          scrollEventThrottle={32}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.accent.primary]}
            />
          }
        >
          {/* TAB 1: WORKERS DIRECTORY */}
          {activeTab === "regular" && (
            <View style={styles.listContainer}>
              {filteredRegularWorkers.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons
                    name="groups"
                    size={48}
                    color={colors.border.medium}
                  />
                  <Text style={styles.emptyTitle}>No Workers Found</Text>
                  <Text style={styles.emptyDesc}>
                    No workers match search terms or status filters.
                  </Text>
                </View>
              ) : (
                filteredRegularWorkers.map((worker) => {
                  const isActive = worker.status === "Active";
                  const roleIconName = ROLE_ICONS[worker.role] || "person";
                  return (
                    <Pressable
                      key={worker.id}
                      style={styles.workerCard}
                      onPress={() =>
                        router.push({
                          pathname: "/settings/workers/details",
                          params: { id: worker.id },
                        })
                      }
                    >
                      <View
                        style={[
                          styles.iconWrapper,
                          isActive ? styles.iconActive : styles.iconInactive,
                        ]}
                      >
                        <MaterialIcons
                          name={roleIconName}
                          size={24}
                          color={isActive ? "#8B5CF6" : colors.text.muted}
                        />
                      </View>
                      <View style={styles.workerDetails}>
                        <View style={styles.workerHeader}>
                          <Text selectable={true} style={styles.workerName}>{worker.name}</Text>
                          <View
                            style={[
                              styles.statusBadge,
                              isActive
                                ? styles.statusActive
                                : styles.statusInactive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                isActive
                                  ? styles.statusActiveText
                                  : styles.statusInactiveText,
                              ]}
                            >
                              {worker.status}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.workerSub}>
                          {worker.role} •{" "}
                          {worker.billingSystem === "Piece-Rate"
                            ? `Piece-rate (₹${worker.pieceRate || 0}/pc)`
                            : `${worker.wageType || "Daily"} wage (₹${worker.dailyWage || 0})`}
                          {worker.hasShifting ? ` • Shifting (₹${(worker.loadingCost || 0) + (worker.unloadingCost || 0)})` : ""}
                        </Text>
                        {worker.totalPending > 0 && (
                          <Text style={styles.pendingHint}>
                            ₹{worker.totalPending.toLocaleString("en-IN")}{" "}
                            pending
                          </Text>
                        )}
                      </View>
                      <MaterialIcons
                        name="chevron-right"
                        size={24}
                        color={colors.border.medium}
                      />
                    </Pressable>
                  );
                })
              )}
            </View>
          )}

          {/* TAB 2: WORKER BALANCES */}
          {activeTab === "balances" && (
            <View style={styles.listContainer}>
              {filteredBalances.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons
                    name="person-search"
                    size={48}
                    color={colors.border.medium}
                  />
                  <Text style={styles.emptyStateText}>
                    No active worker balances matching search query.
                  </Text>
                </View>
              ) : (
                filteredBalances.map((worker) => (
                  <View key={worker.id} style={styles.balanceCard}>
                    <View style={styles.workerMainInfo}>
                      <View style={[styles.avatarBox, styles.avatarRegular]}>
                        <Text
                          style={[
                            styles.avatarBoxText,
                            styles.avatarTextRegular,
                          ]}
                        >
                          {worker.name.substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Text style={styles.workerNameText}>
                            {worker.name}
                          </Text>
                        </View>
                        <Text style={styles.workerSubText}>{worker.role}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.pendingAmountText}>
                          ₹{worker.totalPending.toLocaleString("en-IN")}
                        </Text>
                        <Text style={styles.pendingLabelText}>Pending Due</Text>
                      </View>
                    </View>

                    <View style={styles.cardDivider} />

                    <View style={styles.workerMetrics}>
                      <View>
                        <Text style={styles.metricLabelText}>Total Earned</Text>
                        <Text style={styles.metricValueText}>
                          ₹{worker.totalEarned.toLocaleString("en-IN")}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.metricLabelText}>Total Paid</Text>
                        <Text
                          style={[
                            styles.metricValueText,
                            { color: colors.accent.success },
                          ]}
                        >
                          ₹{worker.totalPaid.toLocaleString("en-IN")}
                        </Text>
                      </View>
                      <Pressable
                        style={[
                          styles.payBtn,
                          worker.totalPending <= 0 && styles.payBtnDisabled,
                        ]}
                        onPress={() => handleOpenPaymentModal(worker)}
                        disabled={worker.totalPending <= 0}
                      >
                        <MaterialIcons
                          name="payment"
                          size={16}
                          color={colors.bg.card}
                        />
                        <Text style={styles.payBtnText}>Pay</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 3: PAYOUT HISTORY LOG */}
          {activeTab === "history" && (
            <View style={styles.listContainer}>
              {filteredHistory.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons
                    name="history"
                    size={48}
                    color={colors.border.medium}
                  />
                  <Text style={styles.emptyStateText}>
                    No payment history records found.
                  </Text>
                </View>
              ) : (
                filteredHistory.map((payment) => (
                  <View key={payment.id} style={styles.historyCard}>
                    <View style={styles.historyTop}>
                      <View>
                        <Text style={styles.historyNameText}>
                          {payment.workerName}
                        </Text>
                        <Text style={styles.historyRoleText}>
                          {payment.workerRole}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.historyAmountText}>
                          -₹{payment.amount.toLocaleString("en-IN")}
                        </Text>
                        <Text style={styles.historyDateText}>
                          {payment.date.toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.cardDivider} />
                    <View style={styles.historyDetails}>
                      <View style={styles.detailItem}>
                        <MaterialIcons
                          name="credit-card"
                          size={14}
                          color={colors.text.muted}
                        />
                        <Text style={styles.detailItemText}>
                          Method: {payment.paymentMethod}
                        </Text>
                      </View>
                      {payment.notes ? (
                        <View style={[styles.detailItem, { flex: 1 }]}>
                          <MaterialIcons
                            name="notes"
                            size={14}
                            color={colors.text.muted}
                          />
                          <Text style={styles.detailItemText} numberOfLines={1}>
                            {payment.notes}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Floating Action Button (Only visible in Workers directory tab) */}
      {activeTab === "regular" && (
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={() => router.push("/settings/workers/add")}
        >
          <MaterialIcons name="person-add" size={26} color={colors.bg.card} />
        </Pressable>
      )}

      {/* Record Payment Modal */}
      <Modal
        visible={selectedWorker !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={handleClosePaymentModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalFlexSpacer}
            onPress={handleClosePaymentModal}
          />

          <View style={styles.modalContent}>
            <View style={styles.modalContentHeader}>
              <Text style={styles.modalTitleText}>💸 Record Payout</Text>
              <Pressable onPress={handleClosePaymentModal}>
                <MaterialIcons
                  name="close"
                  size={24}
                  color={colors.text.muted}
                />
              </Pressable>
            </View>

            {selectedWorker && (
              <ScrollView keyboardShouldPersistTaps="handled">
                {/* Selected Worker Info */}
                <View style={styles.selectedWorkerCard}>
                  <Text style={styles.selectedWorkerName}>
                    {selectedWorker.name}
                  </Text>
                  <Text style={styles.selectedWorkerSub}>
                    {selectedWorker.role}
                  </Text>
                  <View style={styles.selectedPendingRow}>
                    <Text style={styles.selectedPendingLabel}>
                      Pending Due:
                    </Text>
                    <Text style={styles.selectedPendingValue}>
                      ₹{selectedWorker.totalPending.toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>

                {/* Input Payout Amount */}
                <Text style={styles.fieldLabel}>Payout Amount (₹) *</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  value={payoutAmount}
                  onChangeText={setPayoutAmount}
                  placeholder="Enter amount to pay"
                  placeholderTextColor={colors.text.muted}
                />

                {/* Quick Shortcuts */}
                <View style={styles.shortcutRow}>
                  <Pressable
                    style={styles.shortcutBtn}
                    onPress={() =>
                      setPayoutAmount(String(selectedWorker.totalPending))
                    }
                  >
                    <Text style={styles.shortcutText}>Full Pay</Text>
                  </Pressable>
                  <Pressable
                    style={styles.shortcutBtn}
                    onPress={() => setPayoutAmount("1000")}
                  >
                    <Text style={styles.shortcutText}>₹1,000</Text>
                  </Pressable>
                  <Pressable
                    style={styles.shortcutBtn}
                    onPress={() => setPayoutAmount("5000")}
                  >
                    <Text style={styles.shortcutText}>₹5,000</Text>
                  </Pressable>
                </View>

                {/* Payment Method Selector */}
                <Text style={styles.fieldLabel}>Payment Method *</Text>
                <View style={styles.methodRow}>
                  {["Cash", "UPI", "Bank Transfer", "Cheque", "Other"].map((m) => {
                    const isSelected = payoutMethod === m;
                    return (
                      <Pressable
                        key={m}
                        style={[
                          styles.methodChip,
                          isSelected && styles.methodChipSelected,
                        ]}
                        onPress={() => setPayoutMethod(m)}
                      >
                        <Text
                          style={[
                            styles.methodText,
                            isSelected && styles.methodTextSelected,
                          ]}
                        >
                          {m}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Notes Input */}
                <Text style={styles.fieldLabel}>
                  Notes / Reference (Optional)
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      height: 60,
                      textAlignVertical: "top",
                      paddingVertical: 10,
                    },
                  ]}
                  multiline={true}
                  value={payoutNotes}
                  onChangeText={setPayoutNotes}
                  placeholder="Reference ID, payment receipts notes..."
                  placeholderTextColor={colors.text.muted}
                />

                {/* Submit Button */}
                <Pressable
                  style={styles.submitBtn}
                  onPress={handleSavePayment}
                  disabled={savingPayout}
                >
                  {savingPayout ? (
                    <ActivityIndicator size="small" color={colors.bg.card} />
                  ) : (
                    <Text style={styles.submitBtnText}>Confirm Payout</Text>
                  )}
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.card },
    header: {
      padding: 16,
      backgroundColor: colors.bg.card,
    },
    headerTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    backButton: { flexDirection: "row", alignItems: "center", gap: 4 },
    backText: { fontSize: 15, fontWeight: "600", color: colors.text.secondary },
    title: { fontSize: 24, fontWeight: "800", color: colors.text.primary },
    subtitle: { fontSize: 12, color: colors.text.muted, marginTop: 2 },
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.accent.primary,
      height: 38,
      paddingHorizontal: 14,
      borderRadius: 10,
    },
    buttonPressed: { opacity: 0.85 },
    addButtonText: { color: colors.bg.card, fontSize: 13, fontWeight: "700" },
    statsRow: {
      flexDirection: "row",
      paddingHorizontal: 16,
      gap: 8,
      marginBottom: 16,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.bg.primary,
      padding: 10,
      borderRadius: 12,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    statLabel: {
      fontSize: 9,
      fontWeight: "600",
      color: colors.text.muted,
    },
    statValue: {
      fontSize: 14,
      fontWeight: "800",
      marginTop: 4,
    },
    tabContainer: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      paddingHorizontal: 8,
    },
    tab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 12,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabActive: { borderBottomColor: colors.accent.primary },
    tabText: { fontSize: 11, fontWeight: "700", color: colors.text.muted },
    tabTextActive: { color: colors.accent.primary },
    searchBarWrapper: {
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 8,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
      backgroundColor: colors.bg.primary,
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, fontSize: 13, color: colors.text.primary },
    filterScroll: { marginBottom: 4 },
    filterRow: { flexDirection: "row", gap: 8 },
    filterPill: {
      paddingHorizontal: 14,
      height: 32,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.border.subtle,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
    },
    filterPillSelected: {
      backgroundColor: "#ede9fe",
      borderColor: colors.accent.primary,
    },
    filterText: { fontSize: 12, fontWeight: "600", color: colors.text.muted },
    filterTextSelected: { color: "#7c3aed" },
    listScrollContent: {
      padding: 16,
      paddingBottom: 100,
    },
    listContainer: { gap: 12 },
    emptyState: { alignItems: "center", paddingVertical: 40 },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 4,
    },
    emptyDesc: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: "center",
      lineHeight: 18,
      paddingHorizontal: 20,
    },
    workerCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 16,
      padding: 12,
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.02,
      shadowRadius: 6,
      elevation: 1,
    },
    iconWrapper: {
      width: 44,
      height: 44,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    iconActive: { backgroundColor: "#ede9fe" },
    iconInactive: { backgroundColor: colors.border.subtle },
    workerDetails: { flex: 1 },
    workerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 2,
    },
    workerName: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
      flex: 1,
      marginRight: 8,
    },
    workerSub: { fontSize: 11, color: colors.text.muted },
    statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
    statusActive: { backgroundColor: "#ecfdf5" },
    statusInactive: { backgroundColor: colors.border.subtle },
    statusBadgeText: { fontSize: 10, fontWeight: "700" },
    statusActiveText: { color: "#059669" },
    statusInactiveText: { color: colors.text.muted },
    pendingHint: {
      fontSize: 10,
      fontWeight: "700",
      color: "#ea580c",
      marginTop: 2,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingTop: 60,
    },
    loadingText: { marginTop: 10, color: colors.text.muted, fontSize: 13 },
    balanceCard: {
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.02,
      shadowRadius: 6,
      elevation: 1,
    },
    workerMainInfo: {
      flexDirection: "row",
      alignItems: "center",
    },
    avatarBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarRegular: { backgroundColor: "#6C5CE720" },
    avatarBoxText: { fontSize: 13, fontWeight: "700" },
    avatarTextRegular: { color: colors.accent.primary },
    workerNameText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    workerSubText: { fontSize: 11, color: colors.text.muted, marginTop: 1 },
    pendingAmountText: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.accent.danger,
    },
    pendingLabelText: {
      fontSize: 9,
      fontWeight: "600",
      color: colors.text.muted,
      marginTop: 1,
    },
    cardDivider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      marginVertical: 10,
    },
    workerMetrics: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    metricLabelText: {
      fontSize: 9,
      color: colors.text.muted,
      fontWeight: "600",
    },
    metricValueText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
      marginTop: 2,
    },
    payBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accent.success,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      gap: 4,
    },
    payBtnDisabled: { backgroundColor: colors.border.medium },
    payBtnText: { color: colors.bg.card, fontSize: 11, fontWeight: "700" },
    emptyStateText: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: "center",
    },
    historyCard: {
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 12,
    },
    historyTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    historyNameText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    historyRoleText: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
    historyAmountText: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.accent.success,
    },
    historyDateText: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 2,
      fontWeight: "600",
    },
    historyDetails: { flexDirection: "row", gap: 12, alignItems: "center" },
    detailItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    detailItemText: {
      fontSize: 10,
      color: colors.text.muted,
      fontWeight: "600",
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
    },
    modalFlexSpacer: { flex: 1 },
    modalContent: {
      backgroundColor: colors.bg.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: "85%",
      padding: 20,
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: -10 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
      elevation: 10,
    },
    modalContentHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    modalTitleText: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
    },
    selectedWorkerCard: {
      backgroundColor: colors.bg.primary,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 14,
      marginBottom: 16,
    },
    selectedWorkerName: {
      fontSize: 15,
      fontWeight: "750",
      color: colors.text.primary,
    },
    selectedWorkerSub: { fontSize: 12, color: colors.text.muted, marginTop: 1 },
    selectedPendingRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      paddingTop: 8,
    },
    selectedPendingLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.muted,
    },
    selectedPendingValue: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.accent.danger,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
      marginBottom: 8,
      marginTop: 8,
    },
    textInput: {
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 48,
      fontSize: 15,
      color: colors.text.primary,
      backgroundColor: colors.bg.primary,
      marginBottom: 12,
      fontWeight: "600",
    },
    shortcutRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
    shortcutBtn: {
      flex: 1,
      backgroundColor: colors.border.subtle,
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 10,
      height: 36,
      justifyContent: "center",
      alignItems: "center",
    },
    shortcutText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    methodRow: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 14,
    },
    methodChip: {
      flex: 1,
      minWidth: 70,
      backgroundColor: colors.border.subtle,
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 10,
      height: 36,
      justifyContent: "center",
      alignItems: "center",
    },
    methodChipSelected: { backgroundColor: "#3b82f6", borderColor: "#3b82f6" },
    methodText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    methodTextSelected: { color: colors.bg.card },
    submitBtn: {
      backgroundColor: colors.accent.success,
      borderRadius: 14,
      height: 50,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 14,
      marginBottom: 20,
    },
    submitBtnText: { color: colors.bg.card, fontSize: 14, fontWeight: "700" },
    fab: {
      position: "absolute",
      bottom: 24,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: colors.accent.primary,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#7c3aed",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 8,
    },
    fabPressed: { backgroundColor: "#7c3aed" },
  });
};
export default function WorkerListRoute() {
  return (
    <ProtectedRoute>
      <UnifiedWorkerManagement />
    </ProtectedRoute>
  );
}