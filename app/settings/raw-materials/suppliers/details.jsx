import React, { useContext, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { RawMaterialSupplierContext } from "../../../context/RawMaterialSupplierContext";
import { RawMaterialContext } from "../../../context/RawMaterialContext";
import { UserContext } from "../../../context/UserContext";
import { ItemContext } from "../../../context/ItemContext";
import { OrderContext } from "../../../context/OrderContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import BackButton from "../../../components/BackButton";
import { useTheme } from "../../../context/ThemeContext";

function SupplierDetailsScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const { suppliers, deleteSupplier, updateSupplier } = useContext(RawMaterialSupplierContext);
  const { logs, addTransaction, deleteTransaction, updateTransaction } = useContext(RawMaterialContext);
  const { profile } = useContext(UserContext);
  const { items } = useContext(ItemContext);
  const { orders } = useContext(OrderContext) || { orders: [] };

  const currencySymbol = profile?.currency || "$";

  // Modals visibility state
  const [deleteSupplierModal, setDeleteSupplierModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [deleteLogModal, setDeleteLogModal] = useState(false);
  const [editBalanceModal, setEditBalanceModal] = useState(false);

  // Direct payment form states
  const [paymentAmt, setPaymentAmt] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  
  // Purchase form states (for editing purchases)
  const [txQty, setTxQty] = useState("");
  const [txCost, setTxCost] = useState("");
  const [txAmountPaid, setTxAmountPaid] = useState("");
  const [txNotes, setTxNotes] = useState("");

  // Edit Balance form states
  const [newBalanceAmt, setNewBalanceAmt] = useState("");
  const [balanceType, setBalanceType] = useState("owed"); // "owed" or "advance"
  const [adjustNotes, setAdjustNotes] = useState("");

  const [activeLogId, setActiveLogId] = useState(null);
  const [editingLog, setEditingLog] = useState(null);

  // Operations loading states
  const [deletingSupplier, setDeletingSupplier] = useState(false);
  const [loggingPayment, setLoggingPayment] = useState(false);
  const [loggingTx, setLoggingTx] = useState(false);
  const [deletingLog, setDeletingLog] = useState(false);
  const [savingBalance, setSavingBalance] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Find supplier details
  const supplier = suppliers.find((s) => s.id === id);

  if (!supplier) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={colors.accent.danger} />
        <Text style={styles.errorTitle}>Supplier Not Found</Text>
        <Text style={styles.errorDesc}>The supplier you are looking for does not exist or has been deleted.</Text>
        <Pressable style={styles.backLink} onPress={() => router.push("/settings/raw-materials/suppliers")}>
          <Text style={styles.backLinkText}>Return to List</Text>
        </Pressable>
      </View>
    );
  }

  const suppliedMaterialsList = items.filter(item => 
    supplier.suppliedMaterials && supplier.suppliedMaterials.includes(item.id)
  );

  // Filter transaction ledger logs for this supplier (linked purchases or payments)
  const ledgerLogs = logs
    .filter((log) => log.supplierId === supplier.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Unified Stock Movement & Order Logs stream
  const combinedLogs = useMemo(() => {
    const stockLogs = (ledgerLogs || []).map((l) => ({
      ...l,
      logKind: "ledger",
      timestamp: new Date(l.date || l.createdAt).getTime(),
    }));

    const orderLogs = (orders || [])
      .filter((o) => o.customerId === supplier.id || o.customerId === `sup_${supplier.id}` || o.customerId === `supplier_${supplier.id}`)
      .map((o) => {
        const dt = o.createdAt instanceof Date ? o.createdAt : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt));
        return {
          id: `order-${o.id}`,
          logKind: "order",
          orderId: o.id,
          itemName: o.itemName || "Brick Order",
          quantity: o.quantity,
          total: Number(o.total || 0),
          paidAmount: Number(o.paidAmount || 0),
          balanceDue: Number(o.balanceDue || 0),
          date: dt,
          timestamp: dt.getTime(),
        };
      });

    return [...stockLogs, ...orderLogs].sort((a, b) => b.timestamp - a.timestamp);
  }, [ledgerLogs, orders, supplier.id]);

  const supplierOrders = useMemo(() => {
    return (orders || []).filter(
      (o) => o.customerId === supplier.id || o.customerId === `sup_${supplier.id}` || o.customerId === `supplier_${supplier.id}`
    );
  }, [orders, supplier.id]);

  const orderSummary = useMemo(() => {
    let totalOrderValue = 0;
    let totalOrderPaid = 0;
    let totalOrderDue = 0;

    supplierOrders.forEach((o) => {
      totalOrderValue += Number(o.total || 0);
      totalOrderPaid += Number(o.paidAmount || 0);
      totalOrderDue += Number(o.balanceDue || 0);
    });

    return {
      count: supplierOrders.length,
      totalValue: totalOrderValue,
      totalPaid: totalOrderPaid,
      totalDue: totalOrderDue,
    };
  }, [supplierOrders]);

  const balance = Number(supplier.balance || 0);

  // Calculate accumulated purchase costs and payments
  const purchases = ledgerLogs.filter((l) => l.type === "purchase");
  const payments = ledgerLogs.filter((l) => l.type === "payment");
  const totalPurchases = purchases.reduce((sum, l) => sum + Number(l.totalCost || 0), 0);
  const totalPaid = purchases.reduce((sum, l) => sum + Number(l.amountPaid || 0), 0) + payments.reduce((sum, l) => sum + Number(l.amount || 0), 0);

  const handleDeleteSupplier = async () => {
    setDeletingSupplier(true);
    try {
      const ok = await deleteSupplier(supplier.id);
      setDeleteSupplierModal(false);
      if (ok) {
        router.push("/settings/raw-materials/suppliers");
      } else {
        alert("Failed to delete supplier from database.");
      }
    } catch (e) {
      alert("An error occurred during deletion.");
    } finally {
      setDeletingSupplier(false);
    }
  };

  const handleOpenPayment = () => {
    setEditingLog(null);
    setPaymentAmt("");
    setPaymentNotes("");
    setErrorMsg("");
    setPaymentModal(true);
  };

  const handleOpenAdvancePayment = () => {
    setEditingLog(null);
    setPaymentAmt("");
    setPaymentNotes("Advance Payment to Supplier");
    setErrorMsg("");
    setPaymentModal(true);
  };

  const handleClosePayment = () => {
    setPaymentModal(false);
    setEditingLog(null);
  };

  const handleClosePurchase = () => {
    setPurchaseModal(false);
    setEditingLog(null);
  };

  const handleOpenEditLog = (log) => {
    setEditingLog(log);
    setErrorMsg("");
    if (log.type === "payment") {
      setPaymentAmt(String(log.amount || ""));
      setPaymentNotes(log.notes || "");
      setPaymentModal(true);
    } else if (log.type === "purchase") {
      setTxQty(String(log.quantity || ""));
      setTxCost(String(log.costPerUnit || ""));
      setTxAmountPaid(String(log.amountPaid !== undefined ? log.amountPaid : ""));
      setTxNotes(log.notes || "");
      setPurchaseModal(true);
    }
  };

  const handleSavePayment = async () => {
    setErrorMsg("");
    const amount = parseFloat(paymentAmt);

    if (isNaN(amount) || amount <= 0) {
      setErrorMsg("Payment amount must be a valid positive number.");
      return;
    }

    const isAdvance = amount > Math.max(0, balance);
    const defaultNotes = isAdvance ? `Advance Payment to ${supplier.name}` : `Paid to ${supplier.name}`;
    const finalNotes = paymentNotes.trim() || defaultNotes;

    setLoggingPayment(true);
    try {
      let success = false;
      if (editingLog) {
        success = await updateTransaction(editingLog.id, {
          amount: amount,
          notes: finalNotes,
        });
      } else {
        success = await addTransaction({
          materialId: null,
          materialName: "Supplier Payment",
          type: "payment",
          quantity: 0,
          amount: amount,
          supplierId: supplier.id,
          supplierName: supplier.name,
          notes: finalNotes,
          date: new Date(),
        });
      }

      if (success) {
        setPaymentModal(false);
        setEditingLog(null);
      } else {
        setErrorMsg("Failed to record payment in database.");
      }
    } catch (e) {
      setErrorMsg(e.message || "An unexpected error occurred.");
    } finally {
      setLoggingPayment(false);
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
          notes: txNotes.trim(),
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

  const handleOpenDeleteLog = (logId) => {
    setActiveLogId(logId);
    setDeleteLogModal(true);
  };

  const handleOpenEditBalance = () => {
    setErrorMsg("");
    setNewBalanceAmt(Math.abs(balance).toString());
    setBalanceType(balance < 0 ? "advance" : "owed");
    setAdjustNotes("Balance adjustment");
    setEditBalanceModal(true);
  };

  const handleSaveBalance = async () => {
    setErrorMsg("");
    const amt = parseFloat(newBalanceAmt);
    if (isNaN(amt) || amt < 0) {
      setErrorMsg("Balance amount must be a valid non-negative number.");
      return;
    }

    const finalVal = balanceType === "advance" ? -amt : amt;

    setSavingBalance(true);
    try {
      const ok = await updateSupplier(supplier.id, {
        balance: finalVal,
      });

      if (ok) {
        if (adjustNotes.trim()) {
          await addTransaction({
            materialId: null,
            materialName: "Balance Adjustment",
            type: "adjustment",
            quantity: 0,
            amount: finalVal,
            supplierId: supplier.id,
            supplierName: supplier.name,
            notes: adjustNotes.trim(),
            date: new Date(),
          });
        }
        setEditBalanceModal(false);
      } else {
        setErrorMsg("Failed to update supplier balance.");
      }
    } catch (e) {
      setErrorMsg(e.message || "An unexpected error occurred.");
    } finally {
      setSavingBalance(false);
    }
  };

  const handleDeleteLog = async () => {
    setDeletingLog(true);
    try {
      const success = await deleteTransaction(activeLogId);
      setDeleteLogModal(false);
      if (!success) {
        alert("Failed to rollback/delete the ledger record.");
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
      {/* Header Navigation */}
      <View style={styles.header}>
        <BackButton label="Suppliers" onPress={() => router.push("/settings/raw-materials/suppliers")} />
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.actionButton, styles.editAction, pressed && styles.buttonPressed]}
            onPress={() => router.push({ pathname: "/settings/raw-materials/suppliers/edit", params: { id: supplier.id } })}
          >
            <MaterialIcons name="edit" size={18} color={colors.accent.primary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionButton, styles.deleteAction, pressed && styles.buttonPressed]}
            onPress={() => setDeleteSupplierModal(true)}
          >
            <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
          </Pressable>
        </View>
      </View>

      {/* Supplier Profile Info */}
      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {supplier.name ? supplier.name.substring(0, 2).toUpperCase() : "S"}
            </Text>
          </View>
          <View style={styles.profileDetails}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={styles.companyTitle}>{supplier.name}</Text>
              <View style={[styles.statusBadge, supplier.status === "inactive" ? styles.statusBadgeInactive : styles.statusBadgeActive]}>
                <Text style={[styles.statusBadgeText, supplier.status === "inactive" ? styles.statusBadgeTextInactive : styles.statusBadgeTextActive]}>
                  {supplier.status === "inactive" ? "Inactive" : "Active"}
                </Text>
              </View>
            </View>
            <Text style={styles.agentSubText}>Contact Person: {supplier.contactPerson || "None listed"}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsRow}>
          {supplier.phone ? (
            <View style={styles.detailItem}>
              <MaterialIcons name="phone" size={16} color={colors.text.muted} />
              <Text style={styles.detailItemText}>{supplier.phone}</Text>
            </View>
          ) : null}

          {supplier.email ? (
            <View style={styles.detailItem}>
              <MaterialIcons name="email" size={16} color={colors.text.muted} />
              <Text style={styles.detailItemText}>{supplier.email}</Text>
            </View>
          ) : null}

          {supplier.address ? (
            <View style={styles.detailItem}>
              <MaterialIcons name="location-on" size={16} color={colors.text.muted} />
              <Text style={styles.detailItemText}>{supplier.address}</Text>
            </View>
          ) : null}
        </View>

        {suppliedMaterialsList.length > 0 ? (
          <View style={styles.suppliedSection}>
            <Text style={styles.notesTitle}>Supplied Materials</Text>
            <View style={styles.suppliedTagsGrid}>
              {suppliedMaterialsList.map((item) => (
                <View key={item.id} style={styles.suppliedBadge}>
                  <MaterialIcons name="layers" size={12} color={colors.accent.warning} />
                  <Text style={styles.suppliedBadgeText}>{item.itemName}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {supplier.notes ? (
          <View style={styles.notesWrapper}>
            <Text style={styles.notesTitle}>Vendor Notes</Text>
            <Text style={styles.notesText}>{supplier.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Balance Metrics Grid */}
      <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Raw Material Purchases</Text>
      <View style={styles.metricsGrid}>
        <View style={styles.metricCardItem}>
          <Text style={styles.metricCardLabel}>Total Purchased</Text>
          <Text style={styles.metricCardVal}>{currencySymbol}{totalPurchases.toFixed(2)}</Text>
        </View>
        <View style={styles.metricCardItem}>
          <Text style={styles.metricCardLabel}>Total Paid</Text>
          <Text style={styles.metricCardVal}>{currencySymbol}{totalPaid.toFixed(2)}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.metricCardItem, pressed && styles.buttonPressed]}
          onPress={handleOpenEditBalance}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.metricCardLabel}>{balance < 0 ? "Advance Credit" : "Outstanding Owed"}</Text>
            <MaterialIcons name="edit" size={14} color={colors.accent.primary} />
          </View>
          <Text style={[styles.metricCardVal, balance > 0 ? styles.debtText : styles.clearText]}>
            {currencySymbol}{Math.abs(balance).toFixed(2)}
          </Text>
        </Pressable>
      </View>

      {/* Product Orders Summary Card */}
      <View style={{ marginBottom: spacing.lg }}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>
          Product Orders Summary
        </Text>
        <View style={styles.metricsGrid}>
          <View style={[styles.metricCardItem, { flex: 1, backgroundColor: `${colors.accent.primary}0D`, borderColor: `${colors.accent.primary}30` }]}>
            <Text style={styles.metricCardLabel}>Total Orders Count</Text>
            <Text style={[styles.metricCardVal, { color: colors.accent.primary }]}>
              {orderSummary.count} order(s)
            </Text>
          </View>
          <View style={[styles.metricCardItem, { flex: 1, backgroundColor: `${colors.accent.primary}0D`, borderColor: `${colors.accent.primary}30` }]}>
            <Text style={styles.metricCardLabel}>Total Order Value</Text>
            <Text style={[styles.metricCardVal, { color: colors.accent.primary }]}>
              {currencySymbol}{orderSummary.totalValue.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Payment & Advance Action Row */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: spacing.lg }}>
        {balance > 0 ? (
          <Pressable
            style={({ pressed }) => [styles.recordPaymentBtnFull, { flex: 1, marginBottom: 0 }, pressed && styles.buttonPressed]}
            onPress={handleOpenPayment}
          >
            <MaterialIcons name="payment" size={18} color={colors.bg.card} style={{ marginRight: 6 }} />
            <Text style={styles.recordPaymentBtnTextFull}>Pay Balance</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.recordPaymentBtnFull, 
            { flex: 1, marginBottom: 0, backgroundColor: colors.accent.success, borderColor: colors.accent.success }, 
            pressed && styles.buttonPressed
          ]}
          onPress={handleOpenAdvancePayment}
        >
          <MaterialIcons name="add-circle-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
          <Text style={[styles.recordPaymentBtnTextFull, { color: "#ffffff" }]}>Pay Advance</Text>
        </Pressable>
      </View>



      {/* Stock Movement, Orders & Payout History */}
      <Text style={styles.sectionTitle}>Stock Movement & Order History ({combinedLogs.length})</Text>
      <View style={styles.logsContainer}>
        {combinedLogs.length === 0 ? (
          <View style={styles.emptyLogsCard}>
            <MaterialIcons name="history" size={32} color={colors.border.medium} />
            <Text style={styles.emptyLogsTitle}>No Actions Logged</Text>
            <Text style={styles.emptyLogsDesc}>
              Purchases, orders, and payouts for this vendor will be listed here.
            </Text>
          </View>
        ) : (
          combinedLogs.map((log) => {
            if (log.logKind === "order") {
              const isUnpaid = Number(log.balanceDue || 0) > 0;
              const logDateStr = log.date ? log.date.toLocaleDateString() : "N/A";
              const logTimeStr = log.date ? log.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
              return (
                <View key={log.id} style={styles.logItem}>
                  <View style={styles.logItemLeft}>
                    <View style={[styles.logIndicatorCircle, { backgroundColor: `${colors.accent.primary}20` }]}>
                      <MaterialIcons name="shopping-bag" size={16} color={colors.accent.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={styles.logItemTitle}>
                          Order #{log.orderId.slice(-6).toUpperCase()} • {log.itemName} {log.quantity ? `(${log.quantity} pcs)` : ""}
                        </Text>
                        <Text style={[styles.logQtyText, { color: colors.accent.primary }]}>
                          {currencySymbol}{log.total.toFixed(2)}
                        </Text>
                      </View>
                      <Text style={styles.logItemDate}>{logDateStr} • {logTimeStr}</Text>
                      <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: "#059669" }}>
                          Paid: {currencySymbol}{log.paidAmount.toFixed(2)}
                        </Text>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: isUnpaid ? "#dc2626" : "#059669" }}>
                          Due: {currencySymbol}{log.balanceDue.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            }

            const isPurchase = log.type === "purchase";
            const isPayment = log.type === "payment";
            const isAdjustment = log.type === "adjustment";
            const logDateStr = log.date ? log.date.toLocaleDateString() : "N/A";
            const logTimeStr = log.date ? log.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
            
            if (isAdjustment) {
              return (
                <View key={log.id} style={styles.logItem}>
                  <View style={styles.logItemLeft}>
                    <View style={[styles.logIndicatorCircle, { backgroundColor: "#fef3c7" }]}>
                      <MaterialIcons
                        name="tune"
                        size={16}
                        color="#d97706"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={styles.logItemTitle}>
                          Balance Adjustment
                        </Text>
                        <Text style={[styles.logQtyText, { color: log.amount >= 0 ? colors.accent.danger : "#16a34a" }]}>
                          {log.amount >= 0 ? "+" : "-"}{currencySymbol}{Math.abs(Number(log.amount || 0)).toFixed(2)}
                        </Text>
                      </View>
                      <Text style={styles.logItemDate}>{logDateStr} • {logTimeStr}</Text>
                      {log.notes ? (
                        <Text style={styles.logItemNotes}>{log.notes}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Pressable
                      style={({ pressed }) => [styles.deleteLogBtn, pressed && styles.buttonPressed]}
                      onPress={() => handleOpenDeleteLog(log.id)}
                    >
                      <MaterialIcons name="delete" size={18} color={colors.border.medium} />
                    </Pressable>
                  </View>
                </View>
              );
            }

            if (isPayment) {
              return (
                <View key={log.id} style={styles.logItem}>
                  <View style={styles.logItemLeft}>
                    <View style={[styles.logIndicatorCircle, { backgroundColor: "#6C5CE720" }]}>
                      <MaterialIcons
                        name="payment"
                        size={16}
                        color={colors.accent.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={styles.logItemTitle}>
                          Payout Payment
                        </Text>
                        <Text style={[styles.logQtyText, { color: colors.accent.primary }]}>
                          -{currencySymbol}{Number(log.amount || 0).toFixed(2)}
                        </Text>
                      </View>
                      <Text style={styles.logItemDate}>{logDateStr} • {logTimeStr}</Text>
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
                      <MaterialIcons name="edit" size={18} color={colors.border.medium} />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.deleteLogBtn, pressed && styles.buttonPressed]}
                      onPress={() => handleOpenDeleteLog(log.id)}
                    >
                      <MaterialIcons name="delete" size={18} color={colors.border.medium} />
                    </Pressable>
                  </View>
                </View>
              );
            }

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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={styles.logItemTitle}>
                        {isPurchase ? `Purchase: ${log.materialName || "Material"}` : "Stock Movement"}
                      </Text>
                      <Text style={[styles.logQtyText, { color: isPurchase ? "#059669" : "#dc2626" }]}>
                        {isPurchase ? "+" : "-"}{log.quantity} {log.unit || ""}
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
                    <MaterialIcons name="edit" size={18} color={colors.border.medium} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.deleteLogBtn, pressed && styles.buttonPressed]}
                    onPress={() => handleOpenDeleteLog(log.id)}
                  >
                    <MaterialIcons name="delete" size={18} color={colors.border.medium} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Modal 1: Delete Supplier Confirmation */}
      <Modal visible={deleteSupplierModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <MaterialIcons name="warning" size={40} color={colors.accent.danger} style={{ marginBottom: 12 }} />
            <Text style={styles.modalTitle}>Delete Supplier?</Text>
            <Text style={styles.modalDesc}>
              This will permanently delete this supplier account. This does not delete linked material stock logs.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => !deletingSupplier && setDeleteSupplierModal(false)}
                disabled={deletingSupplier}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalDeleteBtn]}
                onPress={handleDeleteSupplier}
                disabled={deletingSupplier}
              >
                {deletingSupplier ? (
                  <ActivityIndicator size="small" color={colors.bg.card} />
                ) : (
                  <Text style={styles.modalDeleteText}>Yes, Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Record Payment */}
      <Modal visible={paymentModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, styles.logModalContent]}>
            <View style={styles.logModalHeader}>
              <Text style={styles.logModalTitle}>{editingLog ? "Edit Payout Payment" : "Record Supplier Payout"}</Text>
              <Pressable onPress={() => !loggingPayment && handleClosePayment()}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            {errorMsg ? (
              <View style={styles.modalError}>
                <MaterialIcons name="error-outline" size={16} color={colors.accent.danger} />
                <Text style={styles.modalErrorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <Text style={styles.modalInputLabel}>Amount to Pay ({currencySymbol}) *</Text>
            <TextInput
              style={styles.modalTextInput}
              value={paymentAmt}
              onChangeText={setPaymentAmt}
              placeholder={editingLog ? `Original: ${currencySymbol}${editingLog.amount}` : `Max available: ${currencySymbol}${balance.toFixed(2)}`}
              placeholderTextColor={colors.text.muted}
              keyboardType="numeric"
              editable={!loggingPayment}
            />

            <Text style={styles.modalInputLabel}>Transaction Notes / Ref ID</Text>
            <TextInput
              style={[styles.modalTextInput, styles.modalTextArea]}
              value={paymentNotes}
              onChangeText={setPaymentNotes}
              placeholder="e.g. Paid in Cash, Check #402, GPay transfer"
              placeholderTextColor={colors.text.muted}
              multiline
              numberOfLines={2}
              editable={!loggingPayment}
            />

            <Pressable
              style={({ pressed }) => [styles.submitLogBtn, pressed && styles.buttonPressed, loggingPayment && styles.disabledBtn]}
              onPress={handleSavePayment}
              disabled={loggingPayment}
            >
              {loggingPayment ? (
                <ActivityIndicator size="small" color={colors.bg.card} />
              ) : (
                <Text style={styles.submitLogBtnText}>{editingLog ? "Save Changes" : "Log Payout Payment"}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal 2.5: Edit Purchase */}
      <Modal visible={purchaseModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, styles.logModalContent]}>
            <View style={styles.logModalHeader}>
              <Text style={styles.logModalTitle}>Edit Purchase (Stock In)</Text>
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
              <Text style={styles.modalInputLabel}>Quantity to Intake *</Text>
              <TextInput
                style={styles.modalTextInput}
                value={txQty}
                onChangeText={setTxQty}
                placeholder="e.g. 50"
                placeholderTextColor={colors.text.muted}
                keyboardType="numeric"
                editable={!loggingTx}
              />

              <Text style={styles.modalInputLabel}>Cost price per unit ({currencySymbol}) *</Text>
              <TextInput
                style={styles.modalTextInput}
                value={txCost}
                onChangeText={setTxCost}
                placeholder="e.g. 10.00"
                placeholderTextColor={colors.text.muted}
                keyboardType="numeric"
                editable={!loggingTx}
              />

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
                  <Text style={styles.submitLogBtnText}>Save Changes</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* Modal 3: Delete Log/Rollback Confirmation */}
      <Modal visible={deleteLogModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <MaterialIcons name="warning" size={40} color="#e11d48" style={{ marginBottom: 12 }} />
            <Text style={styles.modalTitle}>Delete Ledger Record?</Text>
            <Text style={styles.modalDesc}>
              This will remove this record and automatically recalculate/rollback the supplier balance. Stock will be restored if applicable.
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

      {/* Modal 4: Edit Outstanding Owed Balance */}
      <Modal visible={editBalanceModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, styles.logModalContent]}>
            <View style={styles.logModalHeader}>
              <Text style={styles.logModalTitle}>Edit Outstanding Balance</Text>
              <Pressable onPress={() => !savingBalance && setEditBalanceModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </Pressable>
            </View>

            {errorMsg ? (
              <View style={styles.modalError}>
                <MaterialIcons name="error-outline" size={16} color={colors.accent.danger} />
                <Text style={styles.modalErrorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <Text style={styles.modalInputLabel}>Balance Type</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              <Pressable
                style={[
                  { flex: 1, height: 42, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border.medium, justifyContent: "center", alignItems: "center" },
                  balanceType === "owed" && { borderColor: colors.accent.danger, backgroundColor: "#fef2f2" },
                ]}
                onPress={() => setBalanceType("owed")}
                disabled={savingBalance}
              >
                <Text style={{ fontWeight: "700", color: balanceType === "owed" ? colors.accent.danger : colors.text.muted, fontSize: 13 }}>
                  Debt Owed (Due)
                </Text>
              </Pressable>

              <Pressable
                style={[
                  { flex: 1, height: 42, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border.medium, justifyContent: "center", alignItems: "center" },
                  balanceType === "advance" && { borderColor: colors.accent.success, backgroundColor: "#f0fdf4" },
                ]}
                onPress={() => setBalanceType("advance")}
                disabled={savingBalance}
              >
                <Text style={{ fontWeight: "700", color: balanceType === "advance" ? colors.accent.success : colors.text.muted, fontSize: 13 }}>
                  Advance Credit
                </Text>
              </Pressable>
            </View>

            <Text style={styles.modalInputLabel}>Outstanding Amount ({currencySymbol}) *</Text>
            <TextInput
              style={styles.modalTextInput}
              value={newBalanceAmt}
              onChangeText={setNewBalanceAmt}
              placeholder="0.00"
              placeholderTextColor={colors.text.muted}
              keyboardType="numeric"
              editable={!savingBalance}
            />

            <Text style={styles.modalInputLabel}>Reason / Adjustment Note</Text>
            <TextInput
              style={[styles.modalTextInput, styles.modalTextArea]}
              value={adjustNotes}
              onChangeText={setAdjustNotes}
              placeholder="e.g. Initial balance correction, discount applied"
              placeholderTextColor={colors.text.muted}
              multiline
              numberOfLines={2}
              editable={!savingBalance}
            />

            <Pressable
              style={({ pressed }) => [styles.submitLogBtn, pressed && styles.buttonPressed, savingBalance && styles.disabledBtn]}
              onPress={handleSaveBalance}
              disabled={savingBalance}
            >
              {savingBalance ? (
                <ActivityIndicator size="small" color={colors.bg.card} />
              ) : (
                <Text style={styles.submitLogBtnText}>Save Balance Changes</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export default function DetailsRoute() {
  return (
    <ProtectedRoute>
      <SupplierDetailsScreen />
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
  profileCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#6C5CE720",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#0284c7",
    fontSize: 20,
    fontWeight: "700",
  },
  profileDetails: {
    marginLeft: 14,
    flex: 1,
  },
  companyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: 4,
  },
  agentSubText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginBottom: 14,
  },
  detailsRow: {
    gap: 10,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailItemText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: "500",
    flex: 1,
  },
  notesWrapper: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: 12,
  },
  notesTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.text.muted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  notesText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  balanceSection: {
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  balanceInfo: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 4,
  },
  debtText: {
    color: colors.accent.danger,
  },
  clearText: {
    color: "#16a34a",
  },
  balanceSub: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: "500",
  },
  recordPaymentBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent.success,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  recordPaymentBtnText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
    marginLeft: 4,
  },
  ledgerContainer: {
    gap: 12,
    paddingBottom: 30,
  },
  emptyLedgerCard: {
    padding: 24,
    alignItems: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border.medium,
    borderRadius: 12,
    backgroundColor: "#fafafa",
  },
  emptyLedgerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.muted,
    marginTop: 8,
    marginBottom: 2,
  },
  emptyLedgerDesc: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: "center",
  },
  ledgerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.bg.card,
  },
  ledgerItemLeft: {
    flexDirection: "row",
    gap: 10,
    flex: 1,
  },
  ledgerIndicatorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  ledgerItemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
  },
  ledgerItemDate: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 2,
    marginBottom: 6,
  },
  ledgerValues: {
    backgroundColor: colors.bg.primary,
    padding: 8,
    borderRadius: 6,
    gap: 2,
  },
  ledgerValText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: "500",
  },
  ledgerNotes: {
    fontSize: 11,
    color: colors.text.muted,
    backgroundColor: colors.bg.primary,
    padding: 6,
    borderRadius: 6,
    marginTop: 6,
    lineHeight: 14,
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
    maxWidth: 360,
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
  submitLogBtnText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeActive: {
    backgroundColor: "#ecfdf5",
  },
  statusBadgeInactive: {
    backgroundColor: colors.border.subtle,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusBadgeTextActive: {
    color: "#059669",
  },
  statusBadgeTextInactive: {
    color: colors.text.muted,
  },
  suppliedSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: 12,
  },
  suppliedTagsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  suppliedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  suppliedBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.accent.warning,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  metricCardItem: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    padding: 12,
  },
  metricCardLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.text.muted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  metricCardVal: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text.primary,
  },
  recordPaymentBtnFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent.success,
    height: 44,
    borderRadius: 10,
    marginBottom: 24,
  },
  recordPaymentBtnTextFull: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 14,
  },
  logsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  emptyLogsCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyLogsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.secondary,
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
    borderWidth: 1.5,
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
})
};
;