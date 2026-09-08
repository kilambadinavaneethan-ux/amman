import React, { useContext, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ItemContext } from "../../context/ItemContext";
import { RawMaterialContext } from "../../context/RawMaterialContext";
import { UserContext } from "../../context/UserContext";
import { RawMaterialSupplierContext } from "../../context/RawMaterialSupplierContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";

function RawMaterialDetailsScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams();
  
  const { items, deleteItem } = useContext(ItemContext);
  const { logs, addTransaction, deleteTransaction, updateTransaction } = useContext(RawMaterialContext);
  const { profile } = useContext(UserContext);
  const { suppliers } = useContext(RawMaterialSupplierContext);

  const currencySymbol = profile?.currency || "$";

  // Modal visibility states
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [txAmountPaid, setTxAmountPaid] = useState("");
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [deleteMaterialModal, setDeleteMaterialModal] = useState(false);
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [consumptionModal, setConsumptionModal] = useState(false);
  const [deleteLogModal, setDeleteLogModal] = useState(false);

  // Form states for Logging Transactions
  const [txQty, setTxQty] = useState("");
  const [txCost, setTxCost] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [activeLogId, setActiveLogId] = useState(null);
  const [editingLog, setEditingLog] = useState(null);

  // Operation loading states
  const [deletingMaterial, setDeletingMaterial] = useState(false);
  const [loggingTx, setLoggingTx] = useState(false);
  const [deletingLog, setDeletingLog] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Find material details
  const material = items.find((itm) => itm.id === id);

  if (!material) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={colors.accent.danger} />
        <Text style={styles.errorTitle}>Material Not Found</Text>
        <Text style={styles.errorDesc}>The raw material you are trying to view does not exist or has been deleted.</Text>
        <Pressable style={styles.backLink} onPress={() => router.push("/settings/raw-materials")}>
          <Text style={styles.backLinkText}>Return to Hub</Text>
        </Pressable>
      </View>
    );
  }

  // Filter logs for this specific material
  const materialLogs = logs.filter((log) => log.materialId === material.id);

  const currentStock = Number(material.openingStock !== undefined ? material.openingStock : (material.stock || 0));
  const reorderThreshold = Number(material.reorderLevel !== undefined ? material.reorderLevel : 5);
  const unitSuffix = material.rateType || "unit";

  // Calculate total stock purchased/bought
  const totalStockBought = materialLogs
    .filter((log) => log.type === "purchase")
    .reduce((sum, log) => sum + Number(log.quantity || 0), 0);

  // Calculate total stock purchased/bought valuation
  const totalStockBoughtValuation = materialLogs
    .filter((log) => log.type === "purchase")
    .reduce((sum, log) => {
      const cost = log.totalCost !== undefined 
        ? Number(log.totalCost) 
        : (Number(log.quantity || 0) * Number(log.costPerUnit || material.costPrice || 0));
      return sum + cost;
    }, 0);

  // Calculate average purchase days (interval in days between consecutive purchases)
  const averagePurchaseDays = useMemo(() => {
    const purchaseLogs = materialLogs.filter((log) => log.type === "purchase");
    if (!purchaseLogs || purchaseLogs.length === 0) {
      return {
        formatted: "N/A",
        unit: "",
        subtext: "No purchases logged",
        daysNumber: null,
      };
    }

    const timestamps = purchaseLogs
      .map((log) => {
        const raw = log.date || log.createdAt;
        if (!raw) return null;
        if (raw instanceof Date) return raw.getTime();
        if (raw.toDate && typeof raw.toDate === "function") return raw.toDate().getTime();
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d.getTime();
      })
      .filter((ts) => ts !== null)
      .sort((a, b) => a - b);

    if (timestamps.length === 0) {
      return {
        formatted: "N/A",
        unit: "",
        subtext: "No purchase dates",
        daysNumber: null,
      };
    }

    if (timestamps.length === 1) {
      const daysSince = Math.max(0, Math.floor((Date.now() - timestamps[0]) / (1000 * 60 * 60 * 24)));
      return {
        formatted: "1",
        unit: "Purchase",
        subtext: daysSince === 0 ? "Bought today" : daysSince === 1 ? "Bought 1 day ago" : `Bought ${daysSince}d ago`,
        daysNumber: null,
      };
    }

    const firstPurchase = timestamps[0];
    const lastPurchase = timestamps[timestamps.length - 1];
    const totalSpanDays = (lastPurchase - firstPurchase) / (1000 * 60 * 60 * 24);
    const intervalsCount = timestamps.length - 1;

    const avgDays = totalSpanDays / intervalsCount;

    let displayVal = "";
    let unitVal = "Days";
    if (avgDays < 1) {
      const hours = Math.round(avgDays * 24);
      displayVal = hours <= 1 ? "< 1" : `${hours}`;
      unitVal = hours <= 1 ? "Day" : "Hours";
    } else if (avgDays < 10) {
      displayVal = avgDays.toFixed(1);
      unitVal = "Days";
    } else {
      displayVal = `${Math.round(avgDays)}`;
      unitVal = "Days";
    }

    return {
      formatted: displayVal,
      unit: unitVal,
      subtext: `Avg across ${timestamps.length} purchases`,
      daysNumber: avgDays,
    };
  }, [materialLogs]);

  let status = "Healthy";
  let statusColor = "#10b981";
  let statusBg = "#ecfdf5";
  
  if (currentStock === 0) {
    status = "Out of Stock";
    statusColor = "#ef4444";
    statusBg = "#fef2f2";
  } else if (currentStock <= reorderThreshold) {
    status = "Low Stock Warn";
    statusColor = "#f59e0b";
    statusBg = "#fffbeb";
  }

  const handleDeleteMaterial = async () => {
    setDeletingMaterial(true);
    try {
      const ok = await deleteItem(material.id);
      setDeleteMaterialModal(false);
      if (ok) {
        router.push("/settings/raw-materials");
      } else {
        alert("Failed to delete raw material from database.");
      }
    } catch (e) {
      alert("An error occurred while deleting.");
    } finally {
      setDeletingMaterial(false);
    }
  };

  const handleOpenPurchase = () => {
    setEditingLog(null);
    setTxQty("");
    setTxCost(String(material.costPrice || ""));
    setTxNotes("");
    
    // Find default supplier who supplies this raw material
    const defaultSupplier = suppliers.find(s => 
      s.status !== "inactive" && 
      s.suppliedMaterials && 
      s.suppliedMaterials.includes(material.id)
    );
    setSelectedSupplierId(defaultSupplier ? defaultSupplier.id : "");
    
    setTxAmountPaid("");
    setShowSupplierDropdown(false);
    setErrorMsg("");
    setPurchaseModal(true);
  };

  const handleClosePurchase = () => {
    setPurchaseModal(false);
    setEditingLog(null);
  };

  const handleOpenConsumption = () => {
    setEditingLog(null);
    setTxQty("");
    setTxNotes("");
    setErrorMsg("");
    setConsumptionModal(true);
  };

  const handleCloseConsumption = () => {
    setConsumptionModal(false);
    setEditingLog(null);
  };

  const handleOpenEditLog = (log) => {
    setEditingLog(log);
    setTxQty(String(log.quantity));
    setTxNotes(log.notes || "");
    setErrorMsg("");
    
    if (log.type === "purchase") {
      setTxCost(String(log.costPerUnit || ""));
      setSelectedSupplierId(log.supplierId || "");
      setTxAmountPaid(String(log.amountPaid !== undefined ? log.amountPaid : ""));
      setShowSupplierDropdown(false);
      setPurchaseModal(true);
    } else if (log.type === "consumption") {
      setConsumptionModal(true);
    }
  };

  const handleSavePurchase = async () => {
    setErrorMsg("");
    const qty = parseFloat(txQty);
    const unitCost = parseFloat(txCost) || 0;

    if (isNaN(qty) || qty <= 0) {
      setErrorMsg("Quantity must be a valid positive number.");
      return;
    }
    if (unitCost < 0) {
      setErrorMsg("Cost price cannot be negative.");
      return;
    }

    const totalVal = qty * unitCost;
    const paidVal = txAmountPaid.trim() ? parseFloat(txAmountPaid) : totalVal;
    if (isNaN(paidVal) || paidVal < 0 || paidVal > totalVal) {
      setErrorMsg(`Amount Paid must be between 0 and the total cost (${currencySymbol}${totalVal.toFixed(2)}).`);
      return;
    }

    const remainingVal = totalVal - paidVal;
    const supplierObj = suppliers.find(s => s.id === selectedSupplierId);

    setLoggingTx(true);
    try {
      let success = false;
      if (editingLog) {
        success = await updateTransaction(editingLog.id, {
          quantity: qty,
          costPerUnit: unitCost,
          totalCost: totalVal,
          amountPaid: paidVal,
          remainingBalance: remainingVal,
          supplierId: selectedSupplierId || null,
          supplierName: supplierObj ? supplierObj.name : null,
          notes: txNotes.trim(),
        });
      } else {
        success = await addTransaction({
          materialId: material.id,
          materialName: material.itemName,
          type: "purchase",
          quantity: qty,
          costPerUnit: unitCost,
          totalCost: totalVal,
          amountPaid: paidVal,
          remainingBalance: remainingVal,
          supplierId: selectedSupplierId || null,
          supplierName: supplierObj ? supplierObj.name : null,
          unit: unitSuffix,
          notes: txNotes.trim(),
          date: new Date(),
        });
      }

      if (success) {
        setPurchaseModal(false);
        setEditingLog(null);
      } else {
        setErrorMsg("Database transaction failed. Try again.");
      }
    } catch (e) {
      setErrorMsg(e.message || "An unexpected error occurred.");
    } finally {
      setLoggingTx(false);
    }
  };

  const handleSaveConsumption = async () => {
    setErrorMsg("");
    const qty = parseFloat(txQty);

    if (isNaN(qty) || qty <= 0) {
      setErrorMsg("Quantity must be a valid positive number.");
      return;
    }

    const oldQty = editingLog ? Number(editingLog.quantity) : 0;
    const maxAvailable = currentStock + oldQty;

    if (qty > maxAvailable) {
      setErrorMsg(`Not enough stock. Maximum available: ${maxAvailable} ${unitSuffix}`);
      return;
    }

    setLoggingTx(true);
    try {
      let success = false;
      if (editingLog) {
        success = await updateTransaction(editingLog.id, {
          quantity: qty,
          notes: txNotes.trim(),
        });
      } else {
        success = await addTransaction({
          materialId: material.id,
          materialName: material.itemName,
          type: "consumption",
          quantity: qty,
          unit: unitSuffix,
          notes: txNotes.trim(),
          date: new Date(),
        });
      }

      if (success) {
        setConsumptionModal(false);
        setEditingLog(null);
      } else {
        setErrorMsg("Database transaction failed. Try again.");
      }
    } catch (e) {
      setErrorMsg(e.message || "An unexpected error occurred.");
    } finally {
      setLoggingTx(false);
    }
  };

  const handleOpenDeleteLog = (logId) => {
    setActiveLogId(logId);
    setDeleteLogModal(true);
  };

  const handleDeleteLog = async () => {
    setDeletingLog(true);
    try {
      const success = await deleteTransaction(activeLogId);
      setDeleteLogModal(false);
      if (!success) {
        alert("Failed to rollback/delete the transaction log.");
      }
    } catch (e) {
      alert("Error occurred while deleting transaction.");
    } finally {
      setDeletingLog(false);
      setActiveLogId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Navigation Header */}
      <View style={styles.header}>
        <BackButton
          label="Materials"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/settings/raw-materials");
            }
          }}
        />
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.actionButton, styles.editAction, pressed && styles.buttonPressed]}
            onPress={() => router.push({ pathname: "/settings/raw-materials/edit", params: { id: material.id } })}
          >
            <MaterialIcons name="edit" size={18} color={colors.accent.primary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionButton, styles.deleteAction, pressed && styles.buttonPressed]}
            onPress={() => setDeleteMaterialModal(true)}
          >
            <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
          </Pressable>
        </View>
      </View>

      {/* Main Details Card */}
      <View style={styles.detailsCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.titleWrapper}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <View style={styles.unitBadge}>
                <Text style={styles.unitBadgeText}>{unitSuffix}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                <Text style={[styles.statusBadgeText, { color: statusColor }]}>{status}</Text>
              </View>
            </View>
            <Text style={styles.materialTitle}>{material.itemName}</Text>
          </View>
        </View>

        {/* Info Grid */}
        <View style={styles.gridContainer}>
          <View style={styles.gridCell}>
            <Text style={styles.gridLabel}>Available Stock</Text>
            <Text style={[styles.gridValue, status === "Low Stock Warn" && styles.warningText, status === "Out of Stock" && styles.dangerText]}>
              {currentStock} <Text style={styles.gridUnit}>{unitSuffix}</Text>
            </Text>
          </View>

          <View style={styles.gridCell}>
            <Text style={styles.gridLabel}>Material Unit Cost</Text>
            <Text style={styles.gridValue}>
              {currencySymbol}{Number(material.costPrice || 0).toFixed(2)}
            </Text>
          </View>

          <View style={styles.gridCell}>
            <Text style={styles.gridLabel}>Alert Threshold</Text>
            <Text style={styles.gridValue}>
              {reorderThreshold} <Text style={styles.gridUnit}>{unitSuffix}</Text>
            </Text>
          </View>

          <View style={styles.gridCell}>
            <Text style={styles.gridLabel}>Inventory Valuation</Text>
            <Text style={styles.gridValue}>
              {currencySymbol}{(currentStock * Number(material.costPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          <View style={styles.gridCell}>
            <Text style={styles.gridLabel}>Total Stock Buyed</Text>
            <Text style={styles.gridValue}>
              {totalStockBought} <Text style={styles.gridUnit}>{unitSuffix}</Text>
            </Text>
          </View>

          <View style={styles.gridCell}>
            <Text style={styles.gridLabel}>Total Stock Buyed Valuation</Text>
            <Text style={styles.gridValue}>
              {currencySymbol}{totalStockBoughtValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          <View style={styles.gridCell}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.gridLabel}>Average Purchase Days</Text>
              <MaterialIcons name="date-range" size={13} color={colors.accent.primary} />
            </View>
            <Text style={styles.gridValue}>
              {averagePurchaseDays.formatted}{" "}
              {averagePurchaseDays.unit ? (
                <Text style={styles.gridUnit}>{averagePurchaseDays.unit}</Text>
              ) : null}
            </Text>
            {averagePurchaseDays.subtext ? (
              <Text style={{ fontSize: 9.5, color: colors.text.muted, marginTop: 2 }} numberOfLines={1}>
                {averagePurchaseDays.subtext}
              </Text>
            ) : null}
          </View>
        </View>

        {material.description ? (
          <View style={styles.descWrapper}>
            <Text style={styles.descTitle}>Description & Storage Notes</Text>
            <Text style={styles.descText}>{material.description}</Text>
          </View>
        ) : null}
      </View>

      {/* Stock Transaction Actions */}
      <Text style={styles.sectionTitle}>Stock Actions</Text>
      <View style={styles.actionsContainer}>
        <Pressable
          style={({ pressed }) => [styles.stockActionButton, styles.stockInBtn, pressed && styles.buttonPressed]}
          onPress={handleOpenPurchase}
        >
          <MaterialIcons name="add-circle" size={24} color={colors.bg.card} />
          <View>
            <Text style={styles.stockActionBtnTitle}>Log Stock In</Text>
            <Text style={styles.stockActionBtnDesc}>Record raw material purchase</Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.stockActionButton, styles.stockOutBtn, pressed && styles.buttonPressed]}
          onPress={handleOpenConsumption}
        >
          <MaterialIcons name="remove-circle" size={24} color={colors.bg.card} />
          <View>
            <Text style={styles.stockActionBtnTitle}>Log Stock Out</Text>
            <Text style={styles.stockActionBtnDesc}>Record material consumption</Text>
          </View>
        </Pressable>
      </View>

      {/* Audit History Logs List */}
      <Text style={styles.sectionTitle}>Stock Movement Audit logs</Text>
      <View style={styles.logsContainer}>
        {materialLogs.length === 0 ? (
          <View style={styles.emptyLogsCard}>
            <MaterialIcons name="history" size={32} color={colors.text.muted} />
            <Text style={styles.emptyLogsTitle}>No Actions Logged</Text>
            <Text style={styles.emptyLogsDesc}>
              Purchases and consumptions will be listed here.
            </Text>
          </View>
        ) : (
          materialLogs.map((log) => {
            const isPurchase = log.type === "purchase";
            const logDateStr = log.date ? log.date.toLocaleDateString() : "N/A";
            const logTimeStr = log.date ? log.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
            
            return (
              <View key={log.id} style={styles.logItem}>
                <View style={styles.logItemLeft}>
                  <View style={[styles.logIndicatorCircle, { backgroundColor: isPurchase ? "#ecfdf5" : "#fee2e2" }]}>
                    <MaterialIcons
                      name={isPurchase ? "arrow-upward" : "arrow-downward"}
                      size={16}
                      color={isPurchase ? "#059669" : "#dc2626"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.logItemTitle}>
                        {isPurchase ? "Purchase Intake" : "Used in Production"}
                      </Text>
                      <Text style={[styles.logQtyText, { color: isPurchase ? "#059669" : "#dc2626" }]}>
                        {isPurchase ? "+" : "-"}{log.quantity} {unitSuffix}
                      </Text>
                    </View>
                    <Text style={styles.logItemDate}>{logDateStr} • {logTimeStr}</Text>
                    {isPurchase && log.costPerUnit ? (
                      <Text style={styles.logItemCostText}>
                        Rate: {currencySymbol}{Number(log.costPerUnit).toFixed(2)} • Total: {currencySymbol}{Number(log.totalCost || 0).toFixed(2)}
                      </Text>
                    ) : null}
                    {log.notes ? (
                      <Text style={styles.logItemNotes}>{log.notes}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Pressable
                    style={({ pressed }) => [styles.deleteLogBtn, pressed && styles.buttonPressed]}
                    onPress={() => handleOpenEditLog(log)}
                  >
                    <MaterialIcons name="edit" size={18} color={colors.text.muted} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.deleteLogBtn, pressed && styles.buttonPressed]}
                    onPress={() => handleOpenDeleteLog(log.id)}
                  >
                    <MaterialIcons name="delete" size={18} color={colors.text.muted} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Modal 1: Delete Material Confirmation */}
      <Modal visible={deleteMaterialModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <MaterialIcons name="warning" size={40} color={colors.accent.danger} style={{ marginBottom: 12 }} />
            <Text style={styles.modalTitle}>Delete Raw Material?</Text>
            <Text style={styles.modalDesc}>
              This will permanently delete &quot;{material.itemName}&quot; from the catalog. This action is irreversible.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => !deletingMaterial && setDeleteMaterialModal(false)}
                disabled={deletingMaterial}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalDeleteBtn]}
                onPress={handleDeleteMaterial}
                disabled={deletingMaterial}
              >
                {deletingMaterial ? (
                  <ActivityIndicator size="small" color={colors.bg.card} />
                ) : (
                  <Text style={styles.modalDeleteText}>Yes, Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Log Purchase (Stock In) */}
      <Modal visible={purchaseModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, styles.logModalContent]}>
            <View style={styles.logModalHeader}>
              <Text style={styles.logModalTitle}>{editingLog ? "Edit Purchase (Stock In)" : "Log Purchase (Stock In)"}</Text>
              <Pressable onPress={() => !loggingTx && handleClosePurchase()}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            {errorMsg ? (
              <View style={styles.modalError}>
                <MaterialIcons name="error-outline" size={16} color={colors.accent.danger} />
                <Text style={styles.modalErrorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <ScrollView contentContainerStyle={{ paddingBottom: 10 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalInputLabel}>Quantity to Intake ({unitSuffix}) *</Text>
              <TextInput
                style={styles.modalTextInput}
                value={txQty}
                onChangeText={setTxQty}
                placeholder="e.g. 50"
                placeholderTextColor={colors.text.muted}
                keyboardType="numeric"
                editable={!loggingTx}
              />

              <Text style={styles.modalInputLabel}>Cost price per {unitSuffix} ({currencySymbol}) *</Text>
              <TextInput
                style={styles.modalTextInput}
                value={txCost}
                onChangeText={setTxCost}
                placeholder="e.g. 10.00"
                placeholderTextColor={colors.text.muted}
                keyboardType="numeric"
                editable={!loggingTx}
              />

              {/* Supplier Dropdown Selector */}
              <Text style={styles.modalInputLabel}>Link Supplier</Text>
              <Pressable 
                style={styles.dropdownSelector} 
                onPress={() => !loggingTx && setShowSupplierDropdown(!showSupplierDropdown)}
              >
                <Text style={styles.dropdownSelectorText}>
                  {suppliers.find(s => s.id === selectedSupplierId)?.name || "Select Supplier (Optional)"}
                </Text>
                <MaterialIcons name={showSupplierDropdown ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={20} color={colors.text.muted} />
              </Pressable>

              {showSupplierDropdown && (
                <View style={styles.dropdownListContainer}>
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                    <Pressable 
                      style={styles.dropdownListItem} 
                      onPress={() => {
                        setSelectedSupplierId("");
                        setShowSupplierDropdown(false);
                      }}
                    >
                      <Text style={styles.dropdownListItemText}>None (No Supplier)</Text>
                    </Pressable>
                    {suppliers.filter(s => s.status !== "inactive").map((s) => (
                      <Pressable 
                        key={s.id}
                        style={styles.dropdownListItem} 
                        onPress={() => {
                          setSelectedSupplierId(s.id);
                          setShowSupplierDropdown(false);
                        }}
                      >
                        <Text style={styles.dropdownListItemText}>{s.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Cost Calculations */}
              {txQty && txCost ? (
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Total Cost: </Text>
                  <Text style={styles.calcVal}>{currencySymbol}{(Number(txQty) * Number(txCost)).toFixed(2)}</Text>
                </View>
              ) : null}

              {/* Amount Paid */}
              <Text style={styles.modalInputLabel}>Amount Paid ({currencySymbol})</Text>
              <TextInput
                style={styles.modalTextInput}
                value={txAmountPaid}
                onChangeText={setTxAmountPaid}
                placeholder={`Prefilled with full cost: ${currencySymbol}${(Number(txQty) * Number(txCost) || 0).toFixed(2)}`}
                placeholderTextColor={colors.text.muted}
                keyboardType="numeric"
                editable={!loggingTx}
              />

              {/* Credit Owed alert */}
              {selectedSupplierId && (Number(txQty) * Number(txCost) - (txAmountPaid.trim() ? parseFloat(txAmountPaid) : (Number(txQty) * Number(txCost)))) > 0 ? (
                <View style={styles.creditInfoAlert}>
                  <MaterialIcons name="info-outline" size={14} color="#d97706" />
                  <Text style={styles.creditInfoAlertText}>
                    {"Outstanding debt of "}<Text style={{ fontWeight: "700" }}>{currencySymbol}{(Number(txQty) * Number(txCost) - (txAmountPaid.trim() ? parseFloat(txAmountPaid) : (Number(txQty) * Number(txCost)))).toFixed(2)}</Text>{" will be added to this supplier's balance."}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.modalInputLabel}>Purchase Notes</Text>
              <TextInput
                style={[styles.modalTextInput, styles.modalTextArea]}
                value={txNotes}
                onChangeText={setTxNotes}
                placeholder="e.g. Invoice #2034, batch order"
                placeholderTextColor={colors.text.muted}
                multiline
                numberOfLines={2}
                editable={!loggingTx}
              />

              <Pressable
                style={({ pressed }) => [styles.submitLogBtn, pressed && styles.buttonPressed, loggingTx && styles.disabledBtn]}
                onPress={handleSavePurchase}
                disabled={loggingTx}
              >
                {loggingTx ? (
                  <ActivityIndicator size="small" color={colors.bg.card} />
                ) : (
                  <Text style={styles.submitLogBtnText}>{editingLog ? "Save Changes" : "Log Stock In"}</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal 3: Log Consumption (Stock Out) */}
      <Modal visible={consumptionModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, styles.logModalContent]}>
            <View style={styles.logModalHeader}>
              <Text style={styles.logModalTitle}>{editingLog ? "Edit Stock Out (Consumption)" : "Log Stock Out (Consumption)"}</Text>
              <Pressable onPress={() => !loggingTx && handleCloseConsumption()}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            {errorMsg ? (
              <View style={styles.modalError}>
                <MaterialIcons name="error-outline" size={16} color={colors.accent.danger} />
                <Text style={styles.modalErrorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <Text style={styles.modalInputLabel}>Quantity to Consume ({unitSuffix}) *</Text>
            <TextInput
              style={styles.modalTextInput}
              value={txQty}
              onChangeText={setTxQty}
              placeholder={`Available: ${currentStock + (editingLog ? Number(editingLog.quantity) : 0)}`}
              placeholderTextColor={colors.text.muted}
              keyboardType="numeric"
              editable={!loggingTx}
            />

            <Text style={styles.modalInputLabel}>Production Notes / Job ID</Text>
            <TextInput
              style={[styles.modalTextInput, styles.modalTextArea]}
              value={txNotes}
              onChangeText={setTxNotes}
              placeholder="e.g. Batch block production, Shift A"
              placeholderTextColor={colors.text.muted}
              multiline
              numberOfLines={2}
              editable={!loggingTx}
            />

            <Pressable
              style={({ pressed }) => [styles.submitLogBtn, styles.submitOutBtn, pressed && styles.buttonPressed, loggingTx && styles.disabledBtn]}
              onPress={handleSaveConsumption}
              disabled={loggingTx}
            >
              {loggingTx ? (
                <ActivityIndicator size="small" color={colors.bg.card} />
              ) : (
                <Text style={styles.submitLogBtnText}>{editingLog ? "Save Changes" : "Log Stock Out"}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal 4: Delete/Rollback Log Entry */}
      <Modal visible={deleteLogModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <MaterialIcons name="warning" size={40} color="#e11d48" style={{ marginBottom: 12 }} />
            <Text style={styles.modalTitle}>Delete Log Entry?</Text>
            <Text style={styles.modalDesc}>
              This will remove the transaction record and roll back the stock adjustment (reverse stock count effect).
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => !deletingLog && setDeleteLogModal(false)}
                disabled={deletingLog}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalDeleteBtn]}
                onPress={handleDeleteLog}
                disabled={deletingLog}
              >
                {deletingLog ? (
                  <ActivityIndicator size="small" color={colors.bg.card} />
                ) : (
                  <Text style={styles.modalDeleteText}>Yes, Rollback</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export default function DetailsRoute() {
  return (
    <ProtectedRoute>
      <RawMaterialDetailsScreen />
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: colors.bg.card,
    flexGrow: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    minHeight: 300,
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
    marginBottom: 20,
  },
  backLink: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.accent.primary,
    borderRadius: 10,
  },
  backLinkText: {
    color: colors.bg.card,
    fontWeight: "700",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.secondary,
    marginLeft: 6,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
  },
  editAction: {
    backgroundColor: "#6C5CE720",
    borderColor: "#6C5CE740",
  },
  deleteAction: {
    backgroundColor: "#fff5f5",
    borderColor: "#fecaca",
  },
  buttonPressed: {
    opacity: 0.75,
  },
  detailsCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  titleWrapper: {
    flex: 1,
  },
  unitBadge: {
    backgroundColor: colors.border.subtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  unitBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.text.muted,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  materialTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text.primary,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridCell: {
    width: "48%",
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    padding: 12,
  },
  gridLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: "600",
    marginBottom: 4,
  },
  gridValue: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text.primary,
  },
  gridUnit: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.text.muted,
  },
  warningText: {
    color: colors.accent.warning,
  },
  dangerText: {
    color: colors.accent.danger,
  },
  descWrapper: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: 14,
  },
  descTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.text.muted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  descText: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
    marginLeft: 4,
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  stockActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  stockInBtn: {
    backgroundColor: colors.accent.success,
  },
  stockOutBtn: {
    backgroundColor: "#3b82f6",
  },
  stockActionBtnTitle: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 14,
  },
  stockActionBtnDesc: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 9,
    fontWeight: "500",
  },
  logsContainer: {
    gap: 10,
    paddingBottom: 30,
  },
  emptyLogsCard: {
    padding: 24,
    alignItems: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border.subtle,
    borderRadius: 12,
    backgroundColor: "#fafafa",
  },
  emptyLogsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.muted,
    marginTop: 8,
    marginBottom: 2,
  },
  emptyLogsDesc: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: "center",
  },
  logItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.bg.card,
  },
  logItemLeft: {
    flexDirection: "row",
    gap: 10,
    flex: 1,
  },
  logIndicatorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  logItemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
  },
  logQtyText: {
    fontSize: 13,
    fontWeight: "800",
  },
  logItemDate: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 2,
  },
  logItemCostText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: "600",
    marginTop: 4,
  },
  logItemNotes: {
    fontSize: 11,
    color: colors.text.muted,
    backgroundColor: colors.bg.primary,
    padding: 6,
    borderRadius: 6,
    marginTop: 6,
    lineHeight: 15,
  },
  deleteLogBtn: {
    padding: 6,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  logModalContent: {
    maxWidth: 380,
    alignItems: "stretch",
  },
  logModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  logModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text.primary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  modalBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCancelBtn: {
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    backgroundColor: colors.bg.card,
  },
  modalDeleteBtn: {
    backgroundColor: colors.accent.danger,
  },
  modalCancelText: {
    color: colors.text.muted,
    fontWeight: "700",
  },
  modalDeleteText: {
    color: colors.bg.card,
    fontWeight: "700",
  },
  modalError: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 8,
    padding: 8,
    gap: 6,
    marginBottom: 12,
  },
  modalErrorText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  modalInputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text.secondary,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 8,
  },
  modalTextInput: {
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 14,
    color: colors.text.primary,
    marginBottom: 10,
  },
  modalTextArea: {
    height: 60,
    paddingVertical: 8,
  },
  submitLogBtn: {
    backgroundColor: colors.accent.success,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  submitOutBtn: {
    backgroundColor: "#3b82f6",
  },
  submitLogBtnText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  dropdownSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 10,
  },
  dropdownSelectorText: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: "500",
  },
  dropdownListContainer: {
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: colors.bg.primary,
    overflow: "hidden",
  },
  dropdownList: {
    padding: 2,
  },
  dropdownListItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  dropdownListItemText: {
    fontSize: 13,
    color: colors.text.primary,
  },
  calcRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    marginBottom: 10,
  },
  calcLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#166534",
  },
  calcVal: {
    fontSize: 13,
    fontWeight: "800",
    color: "#166534",
  },
  creditInfoAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: 8,
    borderRadius: 8,
    gap: 6,
    marginBottom: 10,
  },
  creditInfoAlertText: {
    color: "#92400e",
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },
})
};
;