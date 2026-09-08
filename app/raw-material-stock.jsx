import React, { useContext, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "./context/ThemeContext";
import { ItemContext } from "./context/ItemContext";
import { RawMaterialContext } from "./context/RawMaterialContext";
import { RawMaterialSupplierContext } from "./context/RawMaterialSupplierContext";
import { UserContext } from "./context/UserContext";
import ProtectedRoute from "./components/ProtectedRoute";
import BackButton from "./components/BackButton";
import { useScrollRestoration } from "./context/ScrollContext";

function RawMaterialStockManager() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/raw-material-stock");
  const { items, loading: itemsLoading } = useContext(ItemContext);
  const { addTransaction } = useContext(RawMaterialContext);
  const { suppliers, loading: suppliersLoading } = useContext(RawMaterialSupplierContext);
  const { profile } = useContext(UserContext);

  const currencySymbol = profile?.currency || "$";

  const [searchQuery, setSearchQuery] = useState("");
  const [activeMaterial, setActiveMaterial] = useState(null);
  const [logType, setLogType] = useState(null); // "in" | "out"
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form Fields
  const [qty, setQty] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("balance"); // "fully" | "balance"
  const [amountPaid, setAmountPaid] = useState("0");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Get raw materials
  const rawMaterials = items.filter((item) => item.itemType === "raw_material");

  // Search filtered raw materials
  const filteredMaterials = rawMaterials.filter((item) => {
    const nameMatch = item.itemName.toLowerCase().includes(searchQuery.toLowerCase());
    const descMatch = (item.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch || descMatch;
  });

  const handleOpenLogModal = (material, type) => {
    setActiveMaterial(material);
    setLogType(type);
    setQty("");
    setNotes("");
    setErrorMsg("");

    if (type === "in") {
      setCostPrice(String(material.costPrice || ""));
      
      // Default to first supplier supplying this material if any
      const defaultSupplier = suppliers.find(
        (s) =>
          s.status !== "inactive" &&
          s.suppliedMaterials &&
          s.suppliedMaterials.includes(material.id)
      );
      setSelectedSupplierId(defaultSupplier ? defaultSupplier.id : "");
      setAmountPaid("0");
      setPaymentStatus("balance");
    }
    
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setActiveMaterial(null);
    setLogType(null);
    setShowSupplierDropdown(false);
  };

  // Helper to dynamically calculate total cost for Stock In
  const calculatedTotal = parseFloat(qty) * (parseFloat(costPrice) || 0);

  const handleSaveTransaction = async () => {
    setErrorMsg("");
    const parsedQty = parseFloat(qty);

    if (isNaN(parsedQty) || parsedQty <= 0) {
      setErrorMsg("Quantity must be a valid positive number.");
      return;
    }

    const unitSuffix = activeMaterial.rateType || "unit";
    const currentStock = Number(
      activeMaterial.openingStock !== undefined
        ? activeMaterial.openingStock
        : activeMaterial.stock || 0
    );

    if (logType === "out") {
      if (parsedQty > currentStock) {
        setErrorMsg(`Not enough stock. Available: ${currentStock} ${unitSuffix}`);
        return;
      }

      setSaving(true);
      try {
        const success = await addTransaction({
          materialId: activeMaterial.id,
          materialName: activeMaterial.itemName,
          type: "consumption",
          quantity: parsedQty,
          unit: unitSuffix,
          notes: notes.trim(),
          date: new Date(),
        });

        if (success) {
          handleCloseModal();
        } else {
          setErrorMsg("Failed to save transaction log. Please try again.");
        }
      } catch (err) {
        setErrorMsg(err.message || "An unexpected error occurred.");
      } finally {
        setSaving(false);
      }
    } else if (logType === "in") {
      const unitCost = parseFloat(costPrice) || 0;
      if (unitCost < 0) {
        setErrorMsg("Cost price cannot be negative.");
        return;
      }

      const totalVal = parsedQty * unitCost;
      let paidVal = totalVal;
      let remainingVal = 0;

      if (paymentStatus === "balance") {
        paidVal = amountPaid.trim() ? parseFloat(amountPaid) : 0;

        if (isNaN(paidVal) || paidVal < 0 || paidVal > totalVal) {
          setErrorMsg(
            `Amount Paid must be between 0 and total cost (${currencySymbol}${totalVal.toFixed(2)}).`
          );
          return;
        }
        remainingVal = totalVal - paidVal;

        if (remainingVal > 0 && !selectedSupplierId) {
          setErrorMsg("Please select a supplier to log a purchase with an outstanding balance.");
          return;
        }
      }
      const supplierObj = suppliers.find((s) => s.id === selectedSupplierId);

      setSaving(true);
      try {
        const success = await addTransaction({
          materialId: activeMaterial.id,
          materialName: activeMaterial.itemName,
          type: "purchase",
          quantity: parsedQty,
          costPerUnit: unitCost,
          totalCost: totalVal,
          amountPaid: paidVal,
          remainingBalance: remainingVal,
          supplierId: selectedSupplierId || null,
          supplierName: supplierObj ? supplierObj.name : null,
          unit: unitSuffix,
          notes: notes.trim(),
          date: new Date(),
        });

        if (success) {
          handleCloseModal();
        } else {
          setErrorMsg("Failed to save transaction log. Please try again.");
        }
      } catch (err) {
        setErrorMsg(err.message || "An unexpected error occurred.");
      } finally {
        setSaving(false);
      }
    }
  };

  const getStatusBadge = (material) => {
    const stock = Number(
      material.openingStock !== undefined ? material.openingStock : material.stock || 0
    );
    const threshold = Number(
      material.reorderLevel !== undefined ? material.reorderLevel : 5
    );

    if (stock === 0) {
      return { text: "Out of Stock", color: "#EF4444", bg: "#FEF2F2" };
    }
    if (stock <= threshold) {
      return { text: "Low Stock", color: colors.accent.warning, bg: "#FFFBEB" };
    }
    return { text: "Healthy", color: "#10B981", bg: "#ECFDF5" };
  };

  const loadingState = itemsLoading || suppliersLoading;

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton label="Home" onPress={() => router.push("/")} />
        <Text style={styles.headerTitle}>Material Quick Log</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={colors.text.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search materials..."
          placeholderTextColor={colors.text.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <MaterialIcons name="close" size={20} color={colors.text.muted} />
          </Pressable>
        ) : null}
      </View>

      {loadingState ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.loadingText}>Syncing materials data...</Text>
        </View>
      ) : filteredMaterials.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialIcons name="layers-clear" size={48} color={colors.border.medium} />
          <Text style={styles.noDataTitle}>No Materials Found</Text>
          <Text style={styles.noDataDesc}>
            Try searching for another name or add new raw materials in Settings.
          </Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.listContent}
          scrollEventThrottle={32}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
        >
          {filteredMaterials.map((material) => {
            const stock = Number(
              material.openingStock !== undefined ? material.openingStock : material.stock || 0
            );
            const badge = getStatusBadge(material);

            return (
              <View key={material.id} style={styles.materialCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.materialName}>{material.itemName}</Text>
                    <Text style={styles.unitSuffix}>Unit: {material.rateType || "unit"}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
                  </View>
                </View>

                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Current Stock</Text>
                    <Text style={styles.metricValue}>
                      {stock} <Text style={styles.metricUnit}>{material.rateType || "units"}</Text>
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Unit Cost</Text>
                    <Text style={styles.metricValue}>
                      {currencySymbol}{Number(material.costPrice || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Log buttons */}
                <View style={styles.cardActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      styles.stockInBtn,
                      pressed && styles.actionBtnPressed,
                    ]}
                    onPress={() => handleOpenLogModal(material, "in")}
                  >
                    <MaterialIcons name="add-circle-outline" size={18} color={colors.accent.success} />
                    <Text style={[styles.actionBtnText, { color: "#065f46" }]}>Log Stock In</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      styles.stockOutBtn,
                      pressed && styles.actionBtnPressed,
                    ]}
                    onPress={() => handleOpenLogModal(material, "out")}
                  >
                    <MaterialIcons name="remove-circle-outline" size={18} color={colors.accent.danger} />
                    <Text style={[styles.actionBtnText, { color: "#991b1b" }]}>Log Stock Out</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Log Transaction Modal */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalDismiss} onPress={handleCloseModal} />
          
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {logType === "in" ? "📥 Log Stock In (Purchase)" : "📤 Log Stock Out (Consumption)"}
              </Text>
              <Pressable onPress={handleCloseModal} disabled={saving}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            {errorMsg ? (
              <View style={styles.errorAlert}>
                <MaterialIcons name="error-outline" size={16} color={colors.accent.danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {activeMaterial && (
              <ScrollView style={styles.modalForm} keyboardShouldPersistTaps="handled">
                <Text style={styles.materialMetaLabel}>
                  Material: <Text style={styles.materialMetaVal}>{activeMaterial.itemName}</Text>
                </Text>

                {logType === "out" ? (
                  <View style={styles.formGroup}>
                    <Text style={styles.inputLabel}>
                      Quantity to Remove ({activeMaterial.rateType || "unit"})
                    </Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      placeholder={`Available: ${Number(
                        activeMaterial.openingStock !== undefined
                          ? activeMaterial.openingStock
                          : activeMaterial.stock || 0
                      )}`}
                      value={qty}
                      onChangeText={setQty}
                      editable={!saving}
                    />
                  </View>
                ) : (
                  <>
                    <View style={styles.formGroup}>
                      <Text style={styles.inputLabel}>
                        Quantity to Add ({activeMaterial.rateType || "unit"})
                      </Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        placeholder="e.g., 50"
                        value={qty}
                        onChangeText={setQty}
                        editable={!saving}
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.inputLabel}>Cost per Unit ({currencySymbol})</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={costPrice}
                        onChangeText={setCostPrice}
                        editable={!saving}
                      />
                    </View>

                    {/* Total summary info */}
                    {!isNaN(calculatedTotal) && calculatedTotal > 0 ? (
                      <View style={styles.totalSummary}>
                        <Text style={styles.totalSummaryLabel}>Total Cost Price:</Text>
                        <Text style={styles.totalSummaryVal}>
                          {currencySymbol}
                          {calculatedTotal.toFixed(2)}
                        </Text>
                      </View>
                    ) : null}

                    {/* Supplier Selector */}
                    <View style={styles.formGroup}>
                      <Text style={styles.inputLabel}>Select Supplier</Text>
                      <Pressable
                        style={styles.dropdownToggle}
                        onPress={() => !saving && setShowSupplierDropdown(!showSupplierDropdown)}
                      >
                        <Text style={styles.dropdownToggleText}>
                          {selectedSupplierId
                            ? suppliers.find((s) => s.id === selectedSupplierId)?.name || "Select Supplier"
                            : "No Supplier / Spot Purchase"}
                        </Text>
                        <MaterialIcons
                          name={showSupplierDropdown ? "arrow-drop-up" : "arrow-drop-down"}
                          size={24}
                          color={colors.text.muted}
                        />
                      </Pressable>

                      {showSupplierDropdown && (
                        <View style={styles.dropdownList}>
                          <Pressable
                            style={styles.dropdownItem}
                            onPress={() => {
                              setSelectedSupplierId("");
                              setShowSupplierDropdown(false);
                            }}
                          >
                            <Text style={styles.dropdownItemText}>No Supplier / Spot Purchase</Text>
                          </Pressable>
                          {suppliers
                            .filter((s) => s.status !== "inactive")
                            .map((supp) => (
                              <Pressable
                                key={supp.id}
                                style={styles.dropdownItem}
                                onPress={() => {
                                  setSelectedSupplierId(supp.id);
                                  setShowSupplierDropdown(false);
                                }}
                              >
                                <Text style={styles.dropdownItemText}>{supp.name}</Text>
                              </Pressable>
                            ))}
                        </View>
                      )}
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.inputLabel}>Payment Status</Text>
                      <View style={styles.statusGroup}>
                        <Pressable
                          style={[
                            styles.statusBtn,
                            paymentStatus === "fully" && styles.statusBtnActiveFully,
                          ]}
                          onPress={() => {
                            setPaymentStatus("fully");
                            setAmountPaid("");
                          }}
                          disabled={saving}
                        >
                          <MaterialIcons
                            name="check-circle"
                            size={16}
                            color={paymentStatus === "fully" ? "#1A1D27" : colors.text.muted}
                          />
                          <Text
                            style={[
                              styles.statusBtnText,
                              paymentStatus === "fully" && styles.statusBtnTextActive,
                            ]}
                          >
                            Fully Paid
                          </Text>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.statusBtn,
                            paymentStatus === "balance" && styles.statusBtnActiveBalance,
                          ]}
                          onPress={() => {
                            setPaymentStatus("balance");
                            setAmountPaid("0");
                          }}
                          disabled={saving}
                        >
                          <MaterialIcons
                            name="account-balance"
                            size={16}
                            color={paymentStatus === "balance" ? "#1A1D27" : colors.text.muted}
                          />
                          <Text
                            style={[
                              styles.statusBtnText,
                              paymentStatus === "balance" && styles.statusBtnTextActive,
                            ]}
                          >
                            With Balance
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    {paymentStatus === "balance" && (
                      <View style={styles.formGroup}>
                        <Text style={styles.inputLabel}>
                          Amount Paid ({currencySymbol})
                        </Text>
                        <TextInput
                          style={styles.input}
                          keyboardType="numeric"
                          placeholder="e.g. 0 for full credit"
                          value={amountPaid}
                          onChangeText={setAmountPaid}
                          editable={!saving}
                        />
                      </View>
                    )}
                  </>
                )}

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Notes / Reference</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Reference logs, purchase bill numbers, etc."
                    placeholderTextColor={colors.text.muted}
                    multiline
                    numberOfLines={3}
                    value={notes}
                    onChangeText={setNotes}
                    editable={!saving}
                  />
                </View>

                {/* Submit button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.submitBtn,
                    logType === "in" ? styles.submitBtnIn : styles.submitBtnOut,
                    pressed && styles.submitBtnPressed,
                    saving && styles.submitBtnDisabled,
                  ]}
                  onPress={handleSaveTransaction}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.bg.card} />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      {logType === "in" ? "Log Stock In" : "Log Stock Out"}
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.primary,
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg.card,
    borderRadius: 12,
    margin: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 14,
    color: colors.text.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.muted,
    fontSize: 14,
  },
  noDataTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.secondary,
    marginTop: 16,
    marginBottom: 4,
  },
  noDataDesc: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  materialCard: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardInfo: {
    flex: 1,
  },
  materialName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 2,
  },
  unitSuffix: {
    fontSize: 12,
    color: colors.text.muted,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: 12,
    marginBottom: 16,
    gap: 16,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: "600",
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: "normal",
    color: colors.text.muted,
  },
  cardActions: {
    flexDirection: "row",
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  stockInBtn: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  stockOutBtn: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  actionBtnPressed: {
    opacity: 0.7,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  modalDismiss: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: colors.bg.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: colors.accent.danger,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  modalForm: {
    flexGrow: 0,
  },
  materialMetaLabel: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 16,
  },
  materialMetaVal: {
    fontWeight: "700",
    color: colors.text.primary,
  },
  formGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.secondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.bg.primary,
    color: colors.text.primary,
    fontSize: 14,
  },
  textArea: {
    height: 72,
    textAlignVertical: "top",
  },
  totalSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.bg.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  totalSummaryLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
  },
  totalSummaryVal: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  dropdownToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.bg.primary,
  },
  dropdownToggleText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  dropdownList: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 10,
    marginTop: 4,
    maxHeight: 150,
    overflow: "scroll",
    zIndex: 999,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  dropdownItemText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  submitBtn: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    marginTop: 8,
  },
  submitBtnIn: {
    backgroundColor: colors.accent.success,
  },
  submitBtnOut: {
    backgroundColor: colors.accent.danger,
  },
  submitBtnPressed: {
    opacity: 0.85,
  },
  submitBtnDisabled: {
    backgroundColor: colors.text.muted,
  },
  submitBtnText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 15,
  },
  statusGroup: {
    flexDirection: "row",
    gap: 12,
  },
  statusBtn: {
    flex: 1,
    flexDirection: "row",
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    backgroundColor: colors.bg.card,
    gap: 6,
  },
  statusBtnActiveFully: {
    backgroundColor: colors.accent.success,
    borderColor: colors.accent.success,
  },
  statusBtnActiveBalance: {
    backgroundColor: colors.accent.warning,
    borderColor: colors.accent.warning,
  },
  statusBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.muted,
  },
  statusBtnTextActive: {
    color: colors.bg.card,
  },
});
};

export default function RawMaterialStockRoute() {
  return (
    <ProtectedRoute>
      <RawMaterialStockManager />
    </ProtectedRoute>
  );
}
