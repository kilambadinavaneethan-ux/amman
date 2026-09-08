import React, { useContext, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Linking } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { CollectorContext } from "../../context/CollectorContext";
import { CustomerContext } from "../../context/CustomerContext";
import { PaymentContext } from "../../context/PaymentContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";

function CollectorDetailsScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams(); // Collector ID
  const { collectors, deleteCollector } = useContext(CollectorContext);
  const { customers, batchUpdateCustomerCollector, updateCustomerCollector } = useContext(CustomerContext);
  const { payments } = useContext(PaymentContext);

  const [activeTab, setActiveTab] = useState("customers"); // "customers" | "collections"
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Manage Assignments Modal states
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignSearchQuery, setAssignSearchQuery] = useState("");
  // Temporary state for checks within modal
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [savingAssignments, setSavingAssignments] = useState(false);

  const collector = collectors.find((c) => c.id === id);

  if (!collector) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={colors.accent.danger} />
        <Text style={styles.errorTitle}>Collector Not Found</Text>
        <Text style={styles.errorDesc}>The money collector you are trying to view does not exist.</Text>
        <Pressable style={styles.backLink} onPress={() => router.push("/settings/collectors")}>
          <Text style={styles.backLinkText}>Return to List</Text>
        </Pressable>
      </View>
    );
  }

  // Calculate stats - sort pending balance customers first, 0-balance customers last
  const assignedCustomers = useMemo(() => {
    const list = customers.filter((c) => c.collectorId === collector.id);
    return list.sort((a, b) => {
      const balA = Number(a.balance || 0);
      const balB = Number(b.balance || 0);

      // Pending balances (> 0) come first
      if (balA > 0 && balB <= 0) return -1;
      if (balA <= 0 && balB > 0) return 1;

      // Both > 0: higher balance first
      if (balA > 0 && balB > 0) return balB - balA;

      // Both <= 0 (zero balance / cleared): sort alphabetically by name
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [customers, collector.id]);

  const outstandingBalance = assignedCustomers.reduce((sum, c) => sum + (c.balance || 0), 0);
  
  const collectorPayments = payments.filter((p) => p.collectorId === collector.id);
  const totalCollected = collectorPayments.reduce((sum, p) => sum + (p.amountReceived || p.amount || 0), 0);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // 1. Remove collector info from all assigned customers first
      const assignedIds = assignedCustomers.map((c) => c.id);
      if (assignedIds.length > 0) {
        await batchUpdateCustomerCollector(assignedIds, null, null);
      }

      // 2. Delete collector document
      const ok = await deleteCollector(collector.id);
      setDeleteModalVisible(false);
      if (ok) {
        router.push("/settings/collectors");
      } else {
        alert("Failed to delete collector from database.");
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred during deletion.");
    } finally {
      setDeleting(false);
    }
  };

  const handleCall = () => {
    if (collector.mobile) {
      Linking.openURL(`tel:${collector.mobile}`);
    }
  };

  // Open Assign Modal and initialize selections
  const openAssignModal = () => {
    const currentIds = assignedCustomers.map((c) => c.id);
    setSelectedCustomerIds(currentIds);
    setAssignSearchQuery("");
    setAssignModalVisible(true);
  };

  const toggleCustomerSelection = (custId) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(custId) ? prev.filter((id) => id !== custId) : [...prev, custId]
    );
  };

  const handleSaveAssignments = async () => {
    setSavingAssignments(true);
    try {
      // Find what customer ids need to be assigned to this collector
      const toAssign = selectedCustomerIds;
      // Find what customer ids are currently assigned but should be unassigned
      const currentIds = assignedCustomers.map((c) => c.id);
      const toUnassign = currentIds.filter((id) => !toAssign.includes(id));

      // Execute batch updates
      if (toAssign.length > 0) {
        await batchUpdateCustomerCollector(toAssign, collector.id, collector.name);
      }
      if (toUnassign.length > 0) {
        await batchUpdateCustomerCollector(toUnassign, null, null);
      }

      setAssignModalVisible(false);
    } catch (e) {
      console.error("Failed to update assignments", e);
      alert("An error occurred while saving assignments.");
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleUnassignSingle = async (customerId) => {
    await updateCustomerCollector(customerId, null, null);
  };

  // Filter list of customers for assignments
  const filteredCustomersForAssign = customers.filter((cust) => {
    const nameMatch = (cust.name || "").toLowerCase().includes(assignSearchQuery.toLowerCase());
    const phoneMatch = (cust.phone || "").toLowerCase().includes(assignSearchQuery.toLowerCase());
    return nameMatch || phoneMatch;
  });

  const isActive = collector.status === "Active";

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <BackButton label="Collectors" onPress={() => router.push("/settings/collectors")} />
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, styles.editAction, pressed && styles.buttonPressed]}
              onPress={() => router.push({ pathname: "/settings/collectors/edit", params: { id: collector.id } })}
            >
              <MaterialIcons name="edit" size={18} color={colors.accent.primary} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionButton, styles.deleteAction, pressed && styles.buttonPressed]}
              onPress={() => setDeleteModalVisible(true)}
            >
              <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
            </Pressable>
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.detailsCard}>
          <View style={styles.categoryRow}>
            <Text style={styles.categoryTag}>Collector Profile</Text>
            <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
              <Text style={[styles.statusBadgeText, isActive ? styles.statusActiveText : styles.statusInactiveText]}>
                {collector.status}
              </Text>
            </View>
          </View>

          <Text style={styles.collectorNameText}>{collector.name}</Text>

          <View style={styles.divider} />

          <Pressable style={styles.infoRow} onPress={handleCall}>
            <MaterialIcons name="phone" size={20} color={colors.text.muted} />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Mobile Number (Tap to Call)</Text>
              <Text style={[styles.infoVal, { color: colors.accent.primary, fontWeight: "700" }]}>{collector.mobile}</Text>
            </View>
          </Pressable>

          {collector.area && (
            <View style={styles.infoRow}>
              <MaterialIcons name="place" size={20} color={colors.text.muted} />
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Assigned Area</Text>
                <Text style={styles.infoVal}>{collector.area}</Text>
              </View>
            </View>
          )}

          {collector.notes && (
            <View style={styles.infoRow}>
              <MaterialIcons name="notes" size={20} color={colors.text.muted} />
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Remarks</Text>
                <Text style={styles.infoVal}>{collector.notes}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Metrics Row */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricValText}>{assignedCustomers.length}</Text>
            <Text style={styles.metricLabelText}>Assigned Customers</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricValText, outstandingBalance > 0 && { color: colors.accent.danger }]}>
              ₹{outstandingBalance.toLocaleString("en-IN")}
            </Text>
            <Text style={styles.metricLabelText}>Outstanding assigned</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricValText, { color: "#16a34a" }]}>
              ₹{totalCollected.toLocaleString("en-IN")}
            </Text>
            <Text style={styles.metricLabelText}>Collected Amount</Text>
          </View>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tabButton, activeTab === "customers" && styles.tabButtonActive]}
            onPress={() => setActiveTab("customers")}
          >
            <Text style={[styles.tabText, activeTab === "customers" && styles.tabTextActive]}>
              Assigned ({assignedCustomers.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, activeTab === "collections" && styles.tabButtonActive]}
            onPress={() => setActiveTab("collections")}
          >
            <Text style={[styles.tabText, activeTab === "collections" && styles.tabTextActive]}>
              Collections ({collectorPayments.length})
            </Text>
          </Pressable>
        </View>

        {/* Tab Contents */}
        {activeTab === "customers" ? (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Assigned Customers</Text>
              <Pressable style={styles.manageBtn} onPress={openAssignModal}>
                <MaterialIcons name="people" size={18} color={colors.accent.primary} />
                <Text style={styles.manageBtnText}>Manage</Text>
              </Pressable>
            </View>

            {assignedCustomers.length === 0 ? (
              <View style={styles.emptyContent}>
                <MaterialIcons name="people-outline" size={40} color={colors.border.medium} />
                <Text style={styles.emptyText}>No Customers Assigned</Text>
                <Text style={styles.emptyDesc}>
                  Assign customer accounts to {collector.name} to track balance collections.
                </Text>
                <Pressable style={styles.assignCta} onPress={openAssignModal}>
                  <Text style={styles.assignCtaText}>Assign Customers Now</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.customerList}>
                {assignedCustomers.map((cust) => (
                  <Pressable
                    key={cust.id}
                    style={({ pressed }) => [
                      styles.customerRow,
                      pressed && styles.customerRowPressed,
                    ]}
                    onPress={() => router.push({ pathname: "/customer-profile", params: { id: cust.id } })}
                  >
                    <View style={styles.customerInfo}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={styles.customerName}>{cust.name}</Text>
                        <MaterialIcons name="chevron-right" size={16} color={colors.text.muted} />
                      </View>
                      <Text style={styles.customerPhone}>📞 {cust.phone || "No phone number"}</Text>
                    </View>
                    <View style={styles.customerRight}>
                      <Text
                        style={[
                          styles.customerBalance,
                          Number(cust.balance) > 0
                            ? { color: colors.accent.danger }
                            : { color: colors.accent.success },
                        ]}
                      >
                        {Number(cust.balance) <= 0
                          ? "✓ ₹0 Cleared"
                          : `₹${Number(cust.balance || 0).toLocaleString("en-IN")}`}
                      </Text>
                      <Pressable 
                        style={({ pressed }) => [
                          styles.unassignBtn,
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleUnassignSingle(cust.id);
                        }}
                      >
                        <Text style={styles.unassignBtnText}>Unassign</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Recent Collections ledger</Text>
            {collectorPayments.length === 0 ? (
              <View style={styles.emptyContent}>
                <MaterialIcons name="receipt-long" size={40} color={colors.border.medium} />
                <Text style={styles.emptyText}>No Payments Collected</Text>
                <Text style={styles.emptyDesc}>
                  Any payments received from {collector.name}&apos;s assigned customers will automatically show here.
                </Text>
              </View>
            ) : (
              <View style={styles.paymentsList}>
                {collectorPayments.map((pay) => {
                  const pDate = pay.createdAt instanceof Date ? pay.createdAt : new Date(pay.createdAt);
                  return (
                    <Pressable
                      key={pay.id}
                      style={({ pressed }) => [
                        styles.paymentRow,
                        pressed && pay.customerId && styles.customerRowPressed,
                      ]}
                      onPress={() => {
                        if (pay.customerId) {
                          router.push({ pathname: "/customer-profile", params: { id: pay.customerId } });
                        }
                      }}
                    >
                      <View style={styles.paymentInfo}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Text style={styles.paymentCustName}>{pay.customerName}</Text>
                          {pay.customerId && <MaterialIcons name="chevron-right" size={14} color={colors.text.muted} />}
                        </View>
                        <Text style={styles.paymentMeta}>
                          {pDate.toLocaleDateString()} • {pay.paymentMethod || "Cash"}
                        </Text>
                        {pay.notes ? <Text style={styles.paymentNotes}>{pay.notes}</Text> : null}
                      </View>
                      <Text style={styles.paymentAmount}>
                        +₹{Number(pay.amountReceived || pay.amount || 0).toLocaleString("en-IN")}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <MaterialIcons name="warning" size={48} color={colors.accent.danger} />
            <Text style={styles.modalTitle}>Delete Collector?</Text>
            <Text style={styles.modalDesc}>
              Are you sure you want to remove &quot;{collector.name}&quot;? All assigned customers will be unassigned automatically.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setDeleteModalVisible(false)}
                disabled={deleting}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalDeleteBtn]}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={colors.bg.card} />
                ) : (
                  <Text style={styles.modalDeleteBtnText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manage Customer Assignments Modal */}
      <Modal visible={assignModalVisible} animationType="slide">
        <View style={styles.assignModalRoot}>
          {/* Header */}
          <View style={styles.assignModalHeader}>
            <Pressable onPress={() => setAssignModalVisible(false)}>
              <MaterialIcons name="close" size={24} color={colors.text.primary} />
            </Pressable>
            <Text style={styles.assignModalTitle}>Assign Customers</Text>
            <Pressable onPress={handleSaveAssignments} disabled={savingAssignments}>
              {savingAssignments ? (
                <ActivityIndicator size="small" color={colors.accent.primary} />
              ) : (
                <Text style={styles.assignModalSaveText}>Save</Text>
              )}
            </Pressable>
          </View>

          {/* Search bar inside Modal */}
          <View style={styles.assignSearchBox}>
            <MaterialIcons name="search" size={20} color={colors.text.muted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.assignSearchInput}
              placeholder="Search customers by name or customer number..."
              placeholderTextColor={colors.text.muted}
              value={assignSearchQuery}
              onChangeText={setAssignSearchQuery}
            />
            {assignSearchQuery ? (
              <Pressable onPress={() => setAssignSearchQuery("")}>
                <MaterialIcons name="close" size={18} color={colors.text.muted} />
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.modalSelectedCountText}>
            {selectedCustomerIds.length} Customers Selected
          </Text>

          {/* Customer Checklist */}
          <ScrollView contentContainerStyle={styles.assignScrollContent} keyboardShouldPersistTaps="handled">
            {filteredCustomersForAssign.length === 0 ? (
              <View style={styles.modalEmptyState}>
                <Text style={styles.modalEmptyText}>No Customers Found</Text>
              </View>
            ) : (
              filteredCustomersForAssign.map((cust) => {
                const isSelected = selectedCustomerIds.includes(cust.id);
                // Check if already assigned to someone else
                const isAssignedElsewhere = cust.collectorId && cust.collectorId !== collector.id;
                
                return (
                  <Pressable
                    key={cust.id}
                    style={[styles.checklistRow, isSelected && styles.checklistRowSelected]}
                    onPress={() => toggleCustomerSelection(cust.id)}
                  >
                    <View style={styles.checkboxWrapper}>
                      <MaterialIcons
                        name={isSelected ? "check-box" : "check-box-outline-blank"}
                        size={24}
                        color={isSelected ? "#6C5CE7" : colors.text.muted}
                      />
                    </View>
                    <View style={styles.checklistDetails}>
                      <Text style={styles.checkListName}>{cust.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Text style={styles.checkListPhone}>{cust.phone || "No phone"}</Text>
                        {isAssignedElsewhere && (
                          <Text style={styles.assignedElsewhereLabel}>
                            • Assigned to: {cust.collectorName}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Text style={[styles.checklistBalance, Number(cust.balance) > 0 && { color: colors.accent.danger }]}>
                      ₹{Number(cust.balance || 0).toLocaleString("en-IN")}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

export default function CollectorDetailsRoute() {
  return (
    <ProtectedRoute>
      <CollectorDetailsScreen />
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.card,
  },
  container: {
    padding: 16,
    flexGrow: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: colors.bg.card,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    marginTop: 12,
    marginBottom: 6,
  },
  errorDesc: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: "center",
    marginBottom: 16,
  },
  backLink: {
    backgroundColor: colors.accent.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  backLinkText: {
    color: colors.bg.card,
    fontWeight: "700",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
    marginLeft: 6,
  },
  headerActions: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
  },
  editAction: {
    borderColor: "#6C5CE740",
    backgroundColor: "#6C5CE720",
  },
  deleteAction: {
    borderColor: "#fca5a5",
    backgroundColor: "#fef2f2",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  detailsCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  categoryTag: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accent.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: "#dcfce7",
  },
  statusInactive: {
    backgroundColor: colors.border.subtle,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusActiveText: {
    color: "#15803d",
  },
  statusInactiveText: {
    color: colors.text.secondary,
  },
  collectorNameText: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 12,
  },
  infoCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  infoVal: {
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  metricItem: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: "center",
  },
  metricValText: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: 4,
  },
  metricLabelText: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: "600",
    textAlign: "center",
    textTransform: "uppercase",
  },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border.subtle,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: {
    borderBottomColor: colors.accent.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.muted,
  },
  tabTextActive: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
  tabContent: {
    marginBottom: 40,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 10,
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#6C5CE720",
  },
  manageBtnText: {
    color: colors.accent.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  customerList: {
    gap: 12,
  },
  customerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 14,
    backgroundColor: colors.bg.card,
  },
  customerRowPressed: {
    backgroundColor: colors.bg.elevated,
    opacity: 0.85,
  },
  customerInfo: {
    flex: 1,
    marginRight: 12,
  },
  customerName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 2,
  },
  customerPhone: {
    fontSize: 12,
    color: colors.text.muted,
  },
  customerRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  customerBalance: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  unassignBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fca5a5",
    backgroundColor: "#fef2f2",
  },
  unassignBtnText: {
    color: colors.accent.danger,
    fontSize: 11,
    fontWeight: "600",
  },
  emptyContent: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 16,
    backgroundColor: colors.bg.primary,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderStyle: "dashed",
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.secondary,
    marginTop: 8,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 14,
    paddingHorizontal: 12,
  },
  assignCta: {
    backgroundColor: colors.accent.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  assignCtaText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 13,
  },
  paymentsList: {
    gap: 12,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 14,
    backgroundColor: colors.bg.card,
  },
  paymentInfo: {
    flex: 1,
    marginRight: 12,
  },
  paymentCustName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 2,
  },
  paymentMeta: {
    fontSize: 12,
    color: colors.text.muted,
  },
  paymentNotes: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 4,
    fontStyle: "italic",
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#16a34a",
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.bg.card,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
    marginTop: 12,
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCancelBtn: {
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    backgroundColor: colors.bg.card,
  },
  modalCancelBtnText: {
    color: colors.text.secondary,
    fontWeight: "600",
  },
  modalDeleteBtn: {
    backgroundColor: colors.accent.danger,
  },
  modalDeleteBtnText: {
    color: colors.bg.card,
    fontWeight: "700",
  },
  assignModalRoot: {
    flex: 1,
    backgroundColor: colors.bg.card,
  },
  assignModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  assignModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
  },
  assignModalSaveText: {
    fontSize: 16,
    color: colors.accent.primary,
    fontWeight: "700",
  },
  assignSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    margin: 16,
    marginBottom: 8,
  },
  assignSearchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  modalSelectedCountText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
    marginHorizontal: 18,
    marginBottom: 8,
  },
  assignScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  modalEmptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },
  modalEmptyText: {
    color: colors.text.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  checklistRowSelected: {
    backgroundColor: colors.bg.primary,
  },
  checkboxWrapper: {
    marginRight: 12,
  },
  checklistDetails: {
    flex: 1,
  },
  checkListName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.primary,
  },
  checkListPhone: {
    fontSize: 12,
    color: colors.text.muted,
  },
  assignedElsewhereLabel: {
    fontSize: 11,
    color: colors.accent.warning,
    fontWeight: "600",
    marginLeft: 4,
  },
  checklistBalance: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
})
};
;
