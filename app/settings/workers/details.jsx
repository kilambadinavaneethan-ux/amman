import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useContext, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import EasyCalendarModal from "../../components/EasyCalendarModal";
import { ItemContext } from "../../context/ItemContext";
import { useTheme } from "../../context/ThemeContext";
import { WorkerContext } from "../../context/WorkerContext";
import { OrderContext } from "../../context/OrderContext";
import { db, normalizeDateValue } from "../../../src/config/firebase";

function WorkerDetails() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const {
    workers,
    deleteWorker,
    logAttendance,
    logPayment,
    logBonus,
    editAttendance,
    deleteAttendance,
    editWorkerPayment,
    deleteWorkerPayment,
    editWorkerBonus,
    deleteWorkerBonus,
  } = useContext(WorkerContext);
  const { items } = useContext(ItemContext);
  const { orders } = useContext(OrderContext);
  const worker = workers.find((w) => w.id === id);

  const [attendanceLog, setAttendanceLog] = useState([]);
  const [paymentLog, setPaymentLog] = useState([]);
  const [bonusLog, setBonusLog] = useState([]);
  const [orderPaymentsLog, setOrderPaymentsLog] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(collection(db, "payments"), (snapshot) => {
      const docs = snapshot.docs
        .filter((d) => {
          const data = d.data();
          return data.customerId === id || data.customerId === `worker_${id}`;
        })
        .map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }));
      docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setOrderPaymentsLog(docs);
    });
    return () => unsub();
  }, [id]);

  // Bonus modal states
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusReason, setBonusReason] = useState("Festival Bonus");
  const [bonusCustomReason, setBonusCustomReason] = useState("");
  const [bonusNotes, setBonusNotes] = useState("");
  const [bonusSaving, setBonusSaving] = useState(false);

  // Date Filter states: "today" | "week" | "month" | "year" | "all" | "custom"
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState(new Date());
  const [customEnd, setCustomEnd] = useState(new Date());
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState("start");

  const isDateInSelectedFilter = (itemDate) => {
    if (!itemDate) return false;
    if (dateFilter === "all") return true;

    const d = itemDate instanceof Date ? itemDate : new Date(itemDate);
    if (isNaN(d.getTime())) return false;

    const now = new Date();
    const startOfDay = (dateObj) => new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 0, 0, 0, 0);
    const endOfDay = (dateObj) => new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59, 999);

    if (dateFilter === "today") {
      return d >= startOfDay(now) && d <= endOfDay(now);
    }

    if (dateFilter === "week") {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      return d >= startOfDay(monday) && d <= endOfDay(now);
    }

    if (dateFilter === "month") {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return d >= startOfDay(firstOfMonth) && d <= endOfDay(now);
    }

    if (dateFilter === "year") {
      const firstOfYear = new Date(now.getFullYear(), 0, 1);
      return d >= startOfDay(firstOfYear) && d <= endOfDay(now);
    }

    if (dateFilter === "custom") {
      const s = customStart ? startOfDay(customStart) : null;
      const e = customEnd ? endOfDay(customEnd) : null;
      if (s && e) return d >= s && d <= e;
      if (s) return d >= s;
      if (e) return d <= e;
      return true;
    }

    return true;
  };

  // Filtered Logs for all sections
  const filteredAttendanceLog = useMemo(() => {
    return attendanceLog.filter((att) => {
      const dt = att.createdAt ? (att.createdAt instanceof Date ? att.createdAt : new Date(att.createdAt)) : (att.date ? new Date(att.date) : null);
      return isDateInSelectedFilter(dt);
    });
  }, [attendanceLog, dateFilter, customStart, customEnd]);

  const filteredPaymentLog = useMemo(() => {
    return paymentLog.filter((p) => isDateInSelectedFilter(p.createdAt));
  }, [paymentLog, dateFilter, customStart, customEnd]);

  const filteredBonusLog = useMemo(() => {
    return bonusLog.filter((b) => isDateInSelectedFilter(b.createdAt));
  }, [bonusLog, dateFilter, customStart, customEnd]);

  const workerLoadingOrders = useMemo(() => {
    return (orders || []).filter((o) => o.loadingWorkerId === id);
  }, [orders, id]);

  const workerUnloadingOrders = useMemo(() => {
    return (orders || []).filter((o) => o.unloadingWorkerId === id);
  }, [orders, id]);

  const filteredWorkerLoadingOrders = useMemo(() => {
    return workerLoadingOrders.filter((o) => {
      const dt = o.createdAt instanceof Date ? o.createdAt : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt));
      return isDateInSelectedFilter(dt);
    });
  }, [workerLoadingOrders, dateFilter, customStart, customEnd]);

  const filteredWorkerUnloadingOrders = useMemo(() => {
    return workerUnloadingOrders.filter((o) => {
      const dt = o.createdAt instanceof Date ? o.createdAt : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt));
      return isDateInSelectedFilter(dt);
    });
  }, [workerUnloadingOrders, dateFilter, customStart, customEnd]);

  const workerCustomerOrders = useMemo(() => {
    return (orders || []).filter((o) => o.customerId === id || o.customerId === `worker_${id}` || o.customerId === `w_${id}`);
  }, [orders, id]);

  const filteredWorkerCustomerOrders = useMemo(() => {
    return workerCustomerOrders.filter((o) => {
      const dt = o.createdAt instanceof Date ? o.createdAt : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt));
      return isDateInSelectedFilter(dt);
    });
  }, [workerCustomerOrders, dateFilter, customStart, customEnd]);

  const workerOrderSummary = useMemo(() => {
    let totalOrderValue = 0;
    let totalOrderPaid = 0;
    let totalOrderDue = 0;

    filteredWorkerCustomerOrders.forEach((o) => {
      totalOrderValue += Number(o.total || 0);
      totalOrderPaid += Number(o.paidAmount || 0);
      totalOrderDue += Number(o.balanceDue || 0);
    });

    return {
      count: filteredWorkerCustomerOrders.length,
      totalValue: totalOrderValue,
      totalPaid: totalOrderPaid,
      totalDue: totalOrderDue,
    };
  }, [filteredWorkerCustomerOrders]);

  const filteredOrderPaymentsLog = useMemo(() => {
    return orderPaymentsLog.filter((p) => isDateInSelectedFilter(p.createdAt));
  }, [orderPaymentsLog, dateFilter, customStart, customEnd]);

  // Active products (all brick types) and raw material items mapping
  const allBrickProducts = useMemo(() => {
    const products = (items || []).filter(
      (itm) => itm.itemType !== "raw_material" && (itm.status || "Active") === "Active"
    );
    if (products.length > 0) return products;

    return [
      {
        id: "default_solid_4",
        itemName: "4-Inch Solid Concrete Block",
        unitsPerBag: 50,
        sellingPrice: 32,
        openingStock: 0,
        category: "Solid Blocks",
      },
      {
        id: "default_solid_6",
        itemName: "6-Inch Solid Concrete Block",
        unitsPerBag: 40,
        sellingPrice: 42,
        openingStock: 0,
        category: "Solid Blocks",
      },
      {
        id: "default_hollow_8",
        itemName: "8-Inch Hollow Concrete Block",
        unitsPerBag: 30,
        sellingPrice: 55,
        openingStock: 0,
        category: "Hollow Blocks",
      },
      {
        id: "default_paver",
        itemName: "Interlocking Paver Block",
        unitsPerBag: 65,
        sellingPrice: 18,
        openingStock: 0,
        category: "Pavers",
      },
    ];
  }, [items]);

  const rawMaterialBag = useMemo(() => {
    return (items || []).find(
      (itm) => itm.itemType === "raw_material" && itm.rateType === "bag"
    );
  }, [items]);

  const totalBagsProduced = useMemo(() => {
    return filteredAttendanceLog.reduce((sum, att) => sum + Number(att.piecesProduced || 0), 0);
  }, [filteredAttendanceLog]);

  // Production calculation for all brick types
  const brickProductionList = useMemo(() => {
    return allBrickProducts.map((brick) => {
      const uPerBag = Number(brick.unitsPerBag !== undefined && brick.unitsPerBag > 0 ? brick.unitsPerBag : 50);
      const unitsProduced = totalBagsProduced * uPerBag;
      const rate = Number(brick.sellingPrice !== undefined ? brick.sellingPrice : (brick.rate || 0));
      const estTotalValue = unitsProduced * rate;
      const currentStock = Number(brick.openingStock !== undefined ? brick.openingStock : (brick.stock || 0));

      return {
        ...brick,
        unitsPerBag: uPerBag,
        unitsProduced,
        rate,
        estTotalValue,
        currentStock,
      };
    });
  }, [allBrickProducts, totalBagsProduced]);

  const totalUnitsProduced = useMemo(() => {
    return brickProductionList.reduce((sum, b) => sum + b.unitsProduced, 0);
  }, [brickProductionList]);

  const totalAttendanceWages = useMemo(() => {
    if (!worker) return 0;
    return filteredAttendanceLog.reduce((sum, att) => {
      if (att.status === "absent") return sum;
      let wage = 0;
      if (worker.billingSystem === "Piece-Rate") {
        wage = Number(att.piecesProduced || 0) * Number(worker.pieceRate || 0);
      } else {
        const dailyWage = Number(worker.dailyWage || 0);
        const otHours = Number(att.overtimeHours || 0);
        const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);
        
        if (att.status === "present") {
          wage = dailyWage;
        } else if (att.status === "half-day") {
          wage = dailyWage / 2;
        }
        wage += otHours * overtimeRate;
      }
      return sum + wage;
    }, 0);
  }, [filteredAttendanceLog, worker]);

  const totalLoadingWages = useMemo(() => {
    return filteredWorkerLoadingOrders.reduce((sum, o) => sum + Number(o.loadingCharge || 0), 0);
  }, [filteredWorkerLoadingOrders]);

  const totalUnloadingWages = useMemo(() => {
    return filteredWorkerUnloadingOrders.reduce((sum, o) => sum + Number(o.unloadingCharge || 0), 0);
  }, [filteredWorkerUnloadingOrders]);

  const totalBonusWages = useMemo(() => {
    return filteredBonusLog.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  }, [filteredBonusLog]);

  const liveTotalWages = useMemo(() => {
    return totalAttendanceWages + totalLoadingWages + totalUnloadingWages;
  }, [totalAttendanceWages, totalLoadingWages, totalUnloadingWages]);

  const liveTotalPaid = useMemo(() => {
    return filteredPaymentLog.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [filteredPaymentLog]);

  const liveNetPending = useMemo(() => {
    return liveTotalWages - liveTotalPaid;
  }, [liveTotalWages, liveTotalPaid]);

  const isAdvancePaid = liveNetPending < 0;
  const advanceAmount = Math.abs(liveNetPending);

  const earningHistory = useMemo(() => {
    const list = [];
    if (!worker) return list;
    
    // 1. Add attendance earnings
    filteredAttendanceLog.forEach((att) => {
      if (att.status === "absent") return;
      
      let amount = 0;
      let description = "";
      if (worker.billingSystem === "Piece-Rate") {
        amount = Number(att.piecesProduced || 0) * Number(worker.pieceRate || 0);
        description = `Production: ${att.piecesProduced} units @ ₹${worker.pieceRate || 0}/pc`;
      } else {
        const dailyWage = Number(worker.dailyWage || 0);
        const otHours = Number(att.overtimeHours || 0);
        const overtimeRate = Number(worker.overtimeRate || dailyWage / 8);
        
        if (att.status === "present") {
          amount = dailyWage;
          description = "Attendance: Present";
        } else if (att.status === "half-day") {
          amount = dailyWage / 2;
          description = "Attendance: Half-Day";
        }
        
        if (otHours > 0) {
          amount += otHours * overtimeRate;
          description += ` + ${otHours}h OT`;
        }
      }
      
      const dateObj = att.createdAt instanceof Date ? att.createdAt : new Date(att.createdAt);
      list.push({
        id: att.id,
        type: "attendance",
        title: description,
        amount,
        date: dateObj,
        rawDate: att.date || dateObj.toLocaleDateString("en-IN"),
      });
    });

    // 2. Add loading earnings
    filteredWorkerLoadingOrders.forEach((o) => {
      const charge = Number(o.loadingCharge || 0);
      if (charge <= 0) return;
      
      const dateObj = o.createdAt instanceof Date ? o.createdAt : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt));
      list.push({
        id: `load-${o.id}`,
        type: "loading",
        title: `Loading: Invoice #${o.id.slice(-6).toUpperCase()} (${o.customerName})`,
        amount: charge,
        date: dateObj,
        rawDate: dateObj.toLocaleDateString("en-IN"),
      });
    });

    // 3. Add unloading earnings
    filteredWorkerUnloadingOrders.forEach((o) => {
      const charge = Number(o.unloadingCharge || 0);
      if (charge <= 0) return;
      
      const dateObj = o.createdAt instanceof Date ? o.createdAt : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt));
      list.push({
        id: `unload-${o.id}`,
        type: "unloading",
        title: `Unloading: Invoice #${o.id.slice(-6).toUpperCase()} (${o.customerName})`,
        amount: charge,
        date: dateObj,
        rawDate: dateObj.toLocaleDateString("en-IN"),
      });
    });

    // 4. Add bonus earnings
    filteredBonusLog.forEach((b) => {
      const amt = Number(b.amount || 0);
      if (amt <= 0) return;
      const dateObj = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      list.push({
        id: b.id,
        type: "bonus",
        title: `⭐ Bonus: ${b.reason || "Performance Bonus"}`,
        amount: amt,
        notes: b.notes || "",
        date: dateObj,
        rawDate: dateObj.toLocaleDateString("en-IN"),
      });
    });

    // Sort chronologically (newest first)
    return list.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filteredAttendanceLog, filteredWorkerLoadingOrders, filteredWorkerUnloadingOrders, filteredBonusLog, worker]);

  // Attendance modal
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attStatus, setAttStatus] = useState("present");
  const [attHours, setAttHours] = useState("8");
  const [attOvertime, setAttOvertime] = useState("0");
  const [attPieces, setAttPieces] = useState("");
  const [attNotes, setAttNotes] = useState("");
  const [attSaving, setAttSaving] = useState(false);

  // Financial Summary Details modals
  const [showEarnedDetailsModal, setShowEarnedDetailsModal] = useState(false);
  const [showPaidDetailsModal, setShowPaidDetailsModal] = useState(false);

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payNotes, setPayNotes] = useState("");
  const [paySaving, setPaySaving] = useState(false);

  // Edit log modal states
  const [selectedLog, setSelectedLog] = useState(null);
  const [showEditLogModal, setShowEditLogModal] = useState(false);
  const [editLogDate, setEditLogDate] = useState(new Date());
  const [isLogCalendarOpen, setIsLogCalendarOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Edit attendance values
  const [editAttStatus, setEditAttStatus] = useState("present");
  const [editAttHours, setEditAttHours] = useState("8");
  const [editAttOvertime, setEditAttOvertime] = useState("0");
  const [editAttPieces, setEditAttPieces] = useState("");
  const [editAttNotes, setEditAttNotes] = useState("");
  // Edit bonus values
  const [editBonusReason, setEditBonusReason] = useState("");

  // Edit payment values
  const [editPayAmount, setEditPayAmount] = useState("");
  const [editPayMethod, setEditPayMethod] = useState("Cash");
  const [editPayNotes, setEditPayNotes] = useState("");

  const handleOpenEditLog = (logItem, type) => {
    setSelectedLog({ ...logItem, type });
    setEditLogDate(logItem.createdAt instanceof Date ? logItem.createdAt : new Date(logItem.createdAt));
    
    if (type === "attendance") {
      setEditAttStatus(logItem.status || "present");
      setEditAttHours(String(logItem.hoursWorked || 0));
      setEditAttOvertime(String(logItem.overtimeHours || 0));
      setEditAttPieces(String(logItem.piecesProduced || 0));
      setEditAttNotes(logItem.notes || "");
    } else if (type === "bonus") {
      setEditPayAmount(String(logItem.amount || 0));
      setEditBonusReason(logItem.reason || "Performance Bonus");
      setEditPayNotes(logItem.notes || "");
    } else {
      setEditPayAmount(String(logItem.amount || 0));
      setEditPayMethod(logItem.method || "Cash");
      setEditPayNotes(logItem.notes || "");
    }
    setShowEditLogModal(true);
  };

  const handleSaveEditLog = async () => {
    if (!selectedLog) return;
    setEditSaving(true);
    
    try {
      if (selectedLog.type === "attendance") {
        const updatedData = {
          status: editAttStatus,
          hoursWorked: parseFloat(editAttHours) || 0,
          overtimeHours: parseFloat(editAttOvertime) || 0,
          piecesProduced: worker.billingSystem === "Piece-Rate" ? parseFloat(editAttPieces) || 0 : 0,
          notes: editAttNotes.trim(),
          date: editLogDate.toISOString().split("T")[0],
        };
        const success = await editAttendance(selectedLog.id, updatedData, selectedLog);
        if (success) {
          Alert.alert("Success", "Attendance log updated successfully.");
          setShowEditLogModal(false);
        } else {
          Alert.alert("Error", "Failed to update attendance.");
        }
      } else if (selectedLog.type === "bonus") {
        const amt = parseFloat(editPayAmount);
        if (isNaN(amt) || amt <= 0) {
          Alert.alert("Invalid Amount", "Please enter a valid bonus amount.");
          setEditSaving(false);
          return;
        }
        const updatedData = {
          amount: amt,
          reason: editBonusReason.trim() || "Performance Bonus",
          notes: editPayNotes.trim(),
          createdAt: editLogDate,
        };
        const success = await editWorkerBonus(selectedLog.id, updatedData, selectedLog);
        if (success) {
          Alert.alert("Success", "Bonus record updated successfully.");
          setShowEditLogModal(false);
        } else {
          Alert.alert("Error", "Failed to update bonus.");
        }
      } else {
        const amt = parseFloat(editPayAmount);
        if (isNaN(amt) || amt <= 0) {
          Alert.alert("Invalid Amount", "Please enter a valid amount.");
          setEditSaving(false);
          return;
        }
        const updatedData = {
          amount: amt,
          method: editPayMethod,
          notes: editPayNotes.trim(),
          createdAt: editLogDate,
        };
        const success = await editWorkerPayment(selectedLog.id, updatedData, selectedLog);
        if (success) {
          Alert.alert("Success", "Payment log updated successfully.");
          setShowEditLogModal(false);
        } else {
          Alert.alert("Error", "Failed to update payment.");
        }
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "An error occurred while updating.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteLog = () => {
    if (!selectedLog) return;
    const typeLabel = selectedLog.type === "attendance" ? "Attendance" : selectedLog.type === "bonus" ? "Bonus" : "Payment";
    
    Alert.alert(
      `Delete ${typeLabel} Record`,
      `Are you sure you want to permanently delete this ${typeLabel.toLowerCase()} record? This will automatically update the worker's pending/paid wage balance.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setEditSaving(true);
            try {
              let success = false;
              if (selectedLog.type === "attendance") {
                success = await deleteAttendance(selectedLog.id, selectedLog);
              } else if (selectedLog.type === "bonus") {
                success = await deleteWorkerBonus(selectedLog.id, selectedLog);
              } else {
                success = await deleteWorkerPayment(selectedLog.id, selectedLog);
              }
              
              if (success) {
                Alert.alert("Deleted", `${typeLabel} record has been deleted.`);
                setShowEditLogModal(false);
              } else {
                Alert.alert("Error", "Failed to delete record.");
              }
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "An error occurred while deleting.");
            } finally {
              setEditSaving(false);
            }
          }
        }
      ]
    );
  };

  const renderEditLogModal = () => {
    if (!selectedLog) return null;

    return (
      <Modal visible={showEditLogModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Edit {selectedLog.type === "attendance" ? "Attendance" : selectedLog.type === "bonus" ? "Bonus" : "Payment"} Log
            </Text>

            <Text style={styles.label}>Transaction Date *</Text>
            <Pressable
              style={styles.dateSelector}
              onPress={() => setIsLogCalendarOpen(true)}
            >
              <MaterialIcons name="calendar-today" size={18} color={colors.accent.primary} style={{ marginRight: 8 }} />
              <Text style={styles.dateSelectorText}>
                {editLogDate.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              <MaterialIcons name="edit" size={16} color={colors.text.muted} style={{ marginLeft: "auto" }} />
            </Pressable>

            {selectedLog.type === "attendance" ? (
              <>
                <Text style={styles.label}>Status</Text>
                <View style={styles.segmentRow}>
                  {["present", "half-day", "absent"].map((s) => {
                    const active = editAttStatus === s;
                    return (
                      <Pressable
                        key={s}
                        style={[
                          styles.segmentBtn,
                          active && {
                            backgroundColor: attStatusColor[s],
                            borderColor: attStatusColor[s],
                          },
                        ]}
                        onPress={() => setEditAttStatus(s)}
                      >
                        <Text
                          style={[
                            styles.segmentBtnText,
                            active && { color: colors.bg.card },
                          ]}
                        >
                          {s === "half-day"
                            ? "Half Day"
                            : s.charAt(0).toUpperCase() + s.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {editAttStatus !== "absent" &&
                  (worker.billingSystem === "Piece-Rate" ? (
                    <>
                      <Text style={styles.label}>Pieces Produced *</Text>
                      <TextInput
                        value={editAttPieces}
                        onChangeText={setEditAttPieces}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.text.muted}
                        style={styles.input}
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.label}>Hours Worked</Text>
                      <TextInput
                        value={editAttHours}
                        onChangeText={setEditAttHours}
                        keyboardType="numeric"
                        style={styles.input}
                      />

                      <Text style={styles.label}>Overtime Hours</Text>
                      <TextInput
                        value={editAttOvertime}
                        onChangeText={setEditAttOvertime}
                        keyboardType="numeric"
                        style={styles.input}
                      />
                    </>
                  ))}

                <Text style={styles.label}>Notes</Text>
                <TextInput
                  value={editAttNotes}
                  onChangeText={setEditAttNotes}
                  placeholder="Optional notes"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />
              </>
            ) : selectedLog.type === "bonus" ? (
              <>
                <Text style={styles.label}>Bonus Amount (₹) *</Text>
                <TextInput
                  value={editPayAmount}
                  onChangeText={setEditPayAmount}
                  keyboardType="numeric"
                  placeholder="e.g. 1000"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                <Text style={styles.label}>Bonus Category / Reason</Text>
                <TextInput
                  value={editBonusReason}
                  onChangeText={setEditBonusReason}
                  placeholder="e.g. Festival Bonus"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                <Text style={styles.label}>Notes</Text>
                <TextInput
                  value={editPayNotes}
                  onChangeText={setEditPayNotes}
                  placeholder="Optional notes"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>Amount (₹) *</Text>
                <TextInput
                  value={editPayAmount}
                  onChangeText={setEditPayAmount}
                  keyboardType="numeric"
                  placeholder="e.g. 5000"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                <Text style={styles.label}>Payment Method</Text>
                <View style={styles.segmentRow}>
                  {["Cash", "UPI", "Bank", "Other"].map((m) => {
                    const active = editPayMethod === m;
                    return (
                      <Pressable
                        key={m}
                        style={[
                          styles.segmentBtn,
                          active && styles.segmentBtnActive,
                        ]}
                        onPress={() => setEditPayMethod(m)}
                      >
                        <Text
                          style={[
                            styles.segmentBtnText,
                            active && { color: colors.bg.card },
                          ]}
                        >
                          {m}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.label}>Notes</Text>
                <TextInput
                  value={editPayNotes}
                  onChangeText={setEditPayNotes}
                  placeholder="Optional notes"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />
              </>
            )}

            <View style={styles.ledgerActionsRow}>
              <Pressable
                disabled={editSaving}
                style={styles.ledgerDeleteBtn}
                onPress={handleDeleteLog}
              >
                <MaterialIcons name="delete" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.ledgerDeleteBtnText}>Delete</Text>
              </Pressable>

              <Pressable
                disabled={editSaving}
                style={styles.ledgerSaveBtn}
                onPress={handleSaveEditLog}
              >
                {editSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="save" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.ledgerSaveBtnText}>Save</Text>
                  </>
                )}
              </Pressable>
            </View>

            <Pressable
              style={{ marginTop: 12, alignItems: "center", paddingVertical: 4 }}
              onPress={() => setShowEditLogModal(false)}
            >
              <Text style={{ color: colors.text.muted, fontWeight: "700" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  };

  useEffect(() => {
    if (!id) return;

    const attQuery = query(
      collection(db, "workerAttendance"),
      where("workerId", "==", id),
    );

    const payQuery = query(
      collection(db, "workerPayments"),
      where("workerId", "==", id),
    );

    const bonusQuery = query(
      collection(db, "workerBonuses"),
      where("workerId", "==", id),
    );

    const unsub1 = onSnapshot(
      attQuery,
      (snap) => {
        const logs = snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
            createdAt: normalizeDateValue(d.data().createdAt),
          }))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setAttendanceLog(logs);
        setLoadingLogs(false);
      },
      () => setLoadingLogs(false),
    );

    const unsub2 = onSnapshot(payQuery, (snap) => {
      const logs = snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setPaymentLog(logs);
    });

    const unsub3 = onSnapshot(bonusQuery, (snap) => {
      const logs = snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setBonusLog(logs);
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [id]);

  const handleLogBonus = async () => {
    const amount = parseFloat(bonusAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Error", "Please enter a valid bonus amount.");
      return;
    }
    const finalReason = bonusReason === "Custom" ? (bonusCustomReason.trim() || "Special Bonus") : bonusReason;
    setBonusSaving(true);
    const result = await logBonus(id, {
      amount,
      reason: finalReason,
      notes: bonusNotes.trim(),
    });
    setBonusSaving(false);
    if (result) {
      setShowBonusModal(false);
      setBonusAmount("");
      setBonusReason("Festival Bonus");
      setBonusCustomReason("");
      setBonusNotes("");
      Alert.alert("Success", "Bonus awarded successfully.");
    } else {
      Alert.alert("Error", "Failed to award bonus.");
    }
  };

  useEffect(() => {
    if (showAttendanceModal && worker) {
      const defaultPieces = worker.billingSystem === "Piece-Rate"
        ? String(worker.lastPiecesProduced !== undefined ? worker.lastPiecesProduced : (worker.perDayBagsCount || "0"))
        : "";
      setAttPieces(defaultPieces);
    }
  }, [showAttendanceModal, worker]);

  const handleDelete = () => {
    Alert.alert(
      "Delete Worker",
      `Are you sure you want to permanently remove "${worker?.name}" from the system?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const success = await deleteWorker(id);
            if (success) {
              router.push("/settings/workers");
            } else {
              Alert.alert("Error", "Could not delete worker.");
            }
          },
        },
      ],
    );
  };

  const handleLogAttendance = async () => {
    setAttSaving(true);
    const result = await logAttendance(id, {
      status: attStatus,
      hoursWorked: parseFloat(attHours) || 0,
      overtimeHours: parseFloat(attOvertime) || 0,
      piecesProduced:
        worker.billingSystem === "Piece-Rate" ? parseFloat(attPieces) || 0 : 0,
      notes: attNotes.trim(),
      date: new Date().toISOString().split("T")[0],
    });
    setAttSaving(false);
    if (result) {
      setShowAttendanceModal(false);
      setAttStatus("present");
      setAttHours("8");
      setAttOvertime("0");
      setAttPieces("");
      setAttNotes("");
      Alert.alert("Success", "Attendance logged successfully.");
    } else {
      Alert.alert("Error", "Failed to log attendance.");
    }
  };

  const handleLogPayment = async () => {
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Error", "Please enter a valid payment amount.");
      return;
    }
    setPaySaving(true);
    const result = await logPayment(id, {
      amount,
      method: payMethod,
      notes: payNotes.trim(),
    });
    setPaySaving(false);
    if (result) {
      setShowPaymentModal(false);
      setPayAmount("");
      setPayNotes("");
      Alert.alert("Success", "Payment logged successfully.");
    } else {
      Alert.alert("Error", "Failed to log payment.");
    }
  };

  if (!worker) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading worker details...</Text>
      </View>
    );
  }

  const attStatusColor = {
    present: colors.accent.success,
    "half-day": colors.accent.warning,
    absent: colors.accent.danger,
  };

  return (
    <>
      {/* Attendance Modal */}
      <Modal visible={showAttendanceModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Attendance</Text>

            <Text style={styles.label}>Status</Text>
            <View style={styles.segmentRow}>
              {["present", "half-day", "absent"].map((s) => {
                const active = attStatus === s;
                return (
                  <Pressable
                    key={s}
                    style={[
                      styles.segmentBtn,
                      active && {
                        backgroundColor: attStatusColor[s],
                        borderColor: attStatusColor[s],
                      },
                    ]}
                    onPress={() => setAttStatus(s)}
                  >
                    <Text
                      style={[
                        styles.segmentBtnText,
                        active && { color: colors.bg.card },
                      ]}
                    >
                      {s === "half-day"
                        ? "Half Day"
                        : s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {attStatus !== "absent" &&
              (worker.billingSystem === "Piece-Rate" ? (
                <>
                  <Text style={styles.label}>Pieces Produced *</Text>
                  <TextInput
                    value={attPieces === "0" ? "" : attPieces}
                    onChangeText={setAttPieces}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.text.muted}
                    style={styles.input}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Hours Worked</Text>
                  <TextInput
                    value={attHours}
                    onChangeText={setAttHours}
                    keyboardType="numeric"
                    style={styles.input}
                  />

                  <Text style={styles.label}>Overtime Hours</Text>
                  <TextInput
                    value={attOvertime}
                    onChangeText={setAttOvertime}
                    keyboardType="numeric"
                    style={styles.input}
                  />
                </>
              ))}

            <Text style={styles.label}>Notes</Text>
            <TextInput
              value={attNotes}
              onChangeText={setAttNotes}
              placeholder="Optional notes"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setShowAttendanceModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalSaveBtn}
                onPress={handleLogAttendance}
                disabled={attSaving}
              >
                {attSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Modal */}
      <Modal visible={showPaymentModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Payment</Text>

            <Text style={styles.label}>Amount (₹)</Text>
            <TextInput
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="numeric"
              placeholder="e.g. 5000"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
            />

            <Text style={styles.label}>Payment Method</Text>
            <View style={styles.segmentRow}>
              {["Cash", "UPI", "Bank", "Other"].map((m) => {
                const active = payMethod === m;
                return (
                  <Pressable
                    key={m}
                    style={[
                      styles.segmentBtn,
                      active && styles.segmentBtnActive,
                    ]}
                    onPress={() => setPayMethod(m)}
                  >
                    <Text
                      style={[
                        styles.segmentBtnText,
                        active && { color: colors.bg.card },
                      ]}
                    >
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Notes</Text>
            <TextInput
              value={payNotes}
              onChangeText={setPayNotes}
              placeholder="Optional notes"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setShowPaymentModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalSaveBtn}
                onPress={handleLogPayment}
                disabled={paySaving}
              >
                {paySaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Log Bonus Modal */}
      <Modal visible={showBonusModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Award Worker Bonus</Text>

            <Text style={styles.label}>Bonus Amount (₹) *</Text>
            <TextInput
              value={bonusAmount}
              onChangeText={setBonusAmount}
              keyboardType="numeric"
              placeholder="e.g. 1000"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
            />

            <Text style={styles.label}>Bonus Category / Reason *</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {["Festival Bonus", "Diwali Gift", "High Performance", "Target Achieved", "Custom"].map((r) => {
                const active = bonusReason === r;
                return (
                  <Pressable
                    key={r}
                    style={[
                      styles.segmentBtn,
                      { paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4 },
                      active && { backgroundColor: "#f59e0b", borderColor: "#f59e0b" },
                    ]}
                    onPress={() => setBonusReason(r)}
                  >
                    <Text style={[styles.segmentBtnText, active && { color: "#ffffff", fontWeight: "700" }]}>{r}</Text>
                  </Pressable>
                );
              })}
            </View>

            {bonusReason === "Custom" && (
              <>
                <Text style={styles.label}>Custom Reason *</Text>
                <TextInput
                  value={bonusCustomReason}
                  onChangeText={setBonusCustomReason}
                  placeholder="e.g. Overtime Reward"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />
              </>
            )}

            <Text style={styles.label}>Notes (Optional)</Text>
            <TextInput
              value={bonusNotes}
              onChangeText={setBonusNotes}
              placeholder="Remarks or special note"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setShowBonusModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, { backgroundColor: "#f59e0b" }]}
                onPress={handleLogBonus}
                disabled={bonusSaving}
              >
                {bonusSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Award Bonus</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {renderEditLogModal()}
      <EasyCalendarModal
        visible={isLogCalendarOpen}
        date={editLogDate}
        onSelectDate={setEditLogDate}
        onClose={() => setIsLogCalendarOpen(false)}
        title="Select Attendance Date"
      />

      <EasyCalendarModal
        visible={showCustomPicker}
        date={pickerTarget === "start" ? customStart : customEnd}
        onSelectDate={(d) => {
          if (pickerTarget === "start") {
            setCustomStart(d);
          } else {
            setCustomEnd(d);
          }
          setShowCustomPicker(false);
        }}
        onClose={() => setShowCustomPicker(false)}
        title={pickerTarget === "start" ? "Select Filter Start Date" : "Select Filter End Date"}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <BackButton
            label="Workers"
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.push("/settings/workers");
              }
            }}
          />
        </View>

        {/* Worker Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {worker.name ? worker.name.substring(0, 2).toUpperCase() : "W"}
            </Text>
          </View>
          <Text selectable={true} style={styles.profileName}>{worker.name}</Text>
          <View
            style={[
              styles.statusBadge,
              worker.status === "Active"
                ? styles.statusActive
                : styles.statusInactive,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color:
                    worker.status === "Active" ? "#059669" : colors.text.muted,
                },
              ]}
            >
              {worker.status}
            </Text>
          </View>
          <Text style={styles.profileRole}>
            {worker.role || "Worker"} •{" "}
            {worker.billingSystem === "Piece-Rate"
              ? "Piece-rate"
              : `${worker.wageType || "Daily"} wage`}
          </Text>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.editAction,
                pressed && styles.buttonPressed,
              ]}
              onPress={() =>
                router.push({
                  pathname: "/settings/workers/edit",
                  params: { id: worker.id },
                })
              }
            >
              <MaterialIcons
                name="edit"
                size={18}
                color={colors.accent.primary}
              />
              <Text
                style={[styles.actionText, { color: colors.accent.primary }]}
              >
                Edit
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                { borderColor: "#f59e0b50", backgroundColor: "#f59e0b15" },
                pressed && styles.buttonPressed,
              ]}
              onPress={() => setShowBonusModal(true)}
            >
              <MaterialIcons
                name="stars"
                size={18}
                color="#f59e0b"
              />
              <Text
                style={[styles.actionText, { color: "#d97706" }]}
              >
                Bonus
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.deleteAction,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleDelete}
            >
              <MaterialIcons
                name="delete"
                size={18}
                color={colors.accent.danger}
              />
              <Text
                style={[styles.actionText, { color: colors.accent.danger }]}
              >
                Delete
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Date Filter Bar */}
        <View style={{ marginBottom: 16, backgroundColor: colors.bg.card, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border.subtle }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MaterialIcons name="filter-list" size={18} color={colors.accent.primary} />
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text.primary }}>
                Filter Period
              </Text>
            </View>
            {dateFilter !== "all" && (
              <Pressable
                style={{ backgroundColor: colors.accent.primary + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
                onPress={() => setDateFilter("all")}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary }}>Show All Time</Text>
              </Pressable>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[
              { label: "All Time", value: "all" },
              { label: "Today", value: "today" },
              { label: "This Week", value: "week" },
              { label: "This Month", value: "month" },
              { label: "This Year", value: "year" },
              { label: "Custom Range", value: "custom" },
            ].map((f) => {
              const active = dateFilter === f.value;
              return (
                <Pressable
                  key={f.value}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: active ? colors.accent.primary : colors.bg.primary,
                    borderWidth: 1,
                    borderColor: active ? colors.accent.primary : colors.border.subtle,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                  onPress={() => {
                    setDateFilter(f.value);
                    if (f.value === "custom") {
                      setShowCustomPicker(true);
                    }
                  }}
                >
                  {f.value === "custom" && <MaterialIcons name="date-range" size={14} color={active ? "#fff" : colors.text.muted} />}
                  <Text style={{ fontSize: 12, fontWeight: active ? "700" : "600", color: active ? "#ffffff" : colors.text.primary }}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Custom Date Range Controls */}
          {dateFilter === "custom" && (
            <View style={{ marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.subtle, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.bg.card, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                onPress={() => {
                  setPickerTarget("start");
                  setShowCustomPicker(true);
                }}
              >
                <MaterialIcons name="event" size={16} color={colors.accent.primary} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.primary }}>
                  From: {customStart.toLocaleDateString("en-IN")}
                </Text>
              </Pressable>

              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text.muted }}>to</Text>

              <Pressable
                style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.bg.card, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                onPress={() => {
                  setPickerTarget("end");
                  setShowCustomPicker(true);
                }}
              >
                <MaterialIcons name="event" size={16} color={colors.accent.primary} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.primary }}>
                  To: {customEnd.toLocaleDateString("en-IN")}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Active Filter Badge Banner */}
          {dateFilter !== "all" && (
            <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accent.primary + "12", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
              <MaterialIcons name="info" size={14} color={colors.accent.primary} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent.primary }}>
                Filtering stats for: {dateFilter === "today" ? "Today" : dateFilter === "week" ? "This Week" : dateFilter === "month" ? "This Month" : dateFilter === "year" ? "This Year" : `${customStart.toLocaleDateString("en-IN")} – ${customEnd.toLocaleDateString("en-IN")}`}
              </Text>
            </View>
          )}
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Worker Information</Text>
          {[
            { icon: "phone", label: "Mobile", value: worker.mobile },
            ...(worker.billingSystem === "Piece-Rate"
              ? [
                  {
                    icon: "tag",
                    label: "Rate per Piece/Unit",
                    value: `₹${(worker.pieceRate || 0).toLocaleString("en-IN")}`,
                  },
                  {
                    icon: "layers",
                    label: "Per Day Bags Count",
                    value: worker.perDayBagsCount
                      ? `${worker.perDayBagsCount} bags`
                      : "—",
                  },
                ]
              : [
                  {
                    icon: "account-balance-wallet",
                    label: `${worker.wageType || "Daily"} Wage`,
                    value: `₹${(worker.dailyWage || 0).toLocaleString("en-IN")}`,
                  },
                  {
                    icon: "schedule",
                    label: "OT Rate / Hour",
                    value: `₹${(worker.overtimeRate || 0).toLocaleString("en-IN")}`,
                  },
                ]),
            ...(worker.hasShifting
              ? [
                  {
                    icon: "local-shipping",
                    label: "Loading Cost",
                    value: `₹${(worker.loadingCost || 0).toLocaleString("en-IN")}`,
                  },
                  {
                    icon: "local-shipping",
                    label: "Unloading Cost",
                    value: `₹${(worker.unloadingCost || 0).toLocaleString("en-IN")}`,
                  },
                ]
              : []),
            {
              icon: "badge",
              label: "ID / Aadhaar",
              value: worker.idNumber || "—",
            },
            {
              icon: "emergency",
              label: "Emergency Contact",
              value: worker.emergencyContact || "—",
            },
            { icon: "home", label: "Address", value: worker.address || "—" },
            {
              icon: "event",
              label: "Join Date",
              value: worker.joinDate
                ? worker.joinDate.toLocaleDateString("en-IN")
                : "—",
            },
          ].map((item, idx) => (
            <View key={idx} style={styles.infoRow}>
              <MaterialIcons
                name={item.icon}
                size={18}
                color={colors.accent.primary}
              />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>{item.label}</Text>
                <Text style={styles.infoValue}>{item.value}</Text>
              </View>
            </View>
          ))}
          {worker.notes ? (
            <View style={styles.infoRow}>
              <MaterialIcons
                name="notes"
                size={18}
                color={colors.accent.primary}
              />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Notes</Text>
                <Text style={styles.infoValue}>{worker.notes}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Financial Summary */}
        <View style={styles.financeCard}>
          <Text style={styles.sectionTitle}>Financial Summary</Text>
          <View style={styles.financeRow}>
            <Pressable
              onPress={() => setShowEarnedDetailsModal(true)}
              style={({ pressed }) => [
                styles.financeBlock,
                { backgroundColor: "#f5f3ff", borderWidth: 1.5, borderColor: "#7c3aed40" },
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Text style={[styles.financeNum, { color: "#7c3aed" }]}>
                  ₹{liveTotalWages.toLocaleString("en-IN")}
                </Text>
                <MaterialIcons name="info-outline" size={14} color="#7c3aed" />
              </View>
              <Text style={styles.financeLabel}>Total Earned (Tap for details)</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowPaidDetailsModal(true)}
              style={({ pressed }) => [
                styles.financeBlock,
                { backgroundColor: "#ecfdf5", borderWidth: 1.5, borderColor: "#05966940" },
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Text style={[styles.financeNum, { color: "#059669" }]}>
                  ₹{liveTotalPaid.toLocaleString("en-IN")}
                </Text>
                <MaterialIcons name="info-outline" size={14} color="#059669" />
              </View>
              <Text style={styles.financeLabel}>Total Paid (Tap for details)</Text>
            </Pressable>
          </View>

          <View style={styles.financeDivider} />
          
          <Text style={styles.financeSubTitle}>Earnings Breakdown</Text>
          
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownLabelContainer}>
              <MaterialIcons name="how-to-reg" size={16} color={colors.accent.primary} style={{ marginRight: 6 }} />
              <Text style={styles.breakdownLabel}>Attendance & Shift Wages</Text>
            </View>
            <Text style={styles.breakdownValue}>₹{totalAttendanceWages.toLocaleString("en-IN")}</Text>
          </View>
          
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownLabelContainer}>
              <MaterialIcons name="arrow-upward" size={16} color={colors.accent.success} style={{ marginRight: 6 }} />
              <Text style={styles.breakdownLabel}>Loading Charges (Orders)</Text>
            </View>
            <Text style={styles.breakdownValue}>₹{totalLoadingWages.toLocaleString("en-IN")}</Text>
          </View>
          
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownLabelContainer}>
              <MaterialIcons name="arrow-downward" size={16} color={colors.accent.warning} style={{ marginRight: 6 }} />
              <Text style={styles.breakdownLabel}>Unloading Charges (Orders)</Text>
            </View>
            <Text style={styles.breakdownValue}>₹{totalUnloadingWages.toLocaleString("en-IN")}</Text>
          </View>

          <View style={styles.breakdownRowTotal}>
            <Text style={styles.breakdownLabelTotal}>Calculated Net Earned Wages</Text>
            <Text style={styles.breakdownValueTotal}>
              ₹{liveTotalWages.toLocaleString("en-IN")}
            </Text>
          </View>

          {totalBonusWages > 0 && (
            <View style={[styles.breakdownRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border.subtle }]}>
              <View style={styles.breakdownLabelContainer}>
                <MaterialIcons name="stars" size={16} color="#f59e0b" style={{ marginRight: 6 }} />
                <Text style={[styles.breakdownLabel, { color: "#d97706", fontWeight: "600" }]}>Total Bonus Rewards (Separate)</Text>
              </View>
              <Text style={[styles.breakdownValue, { color: "#d97706", fontWeight: "700" }]}>
                ₹{totalBonusWages.toLocaleString("en-IN")}
              </Text>
            </View>
          )}
        </View>

        {/* Material Consumption Card */}
        <View style={styles.infoCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Material Consumption</Text>
            <View style={{ backgroundColor: `${colors.accent.warning}18`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.warning }}>Raw Material</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="inventory" size={22} color={colors.accent.warning} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Used Raw Material</Text>
              <Text style={styles.infoValue}>
                {rawMaterialBag ? rawMaterialBag.itemName : "Cement / Raw Material (Bags)"}
              </Text>
              <Text style={[styles.totalCountText, { color: colors.accent.warning, marginTop: 4, fontWeight: "800", fontSize: 13 }]}>
                Total Used: {totalBagsProduced.toLocaleString("en-IN")} bag(s)
              </Text>
            </View>
          </View>
        </View>

        {/* Bricks Production Section - Shows All Types of Bricks */}
        <View style={styles.infoCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MaterialIcons name="construction" size={20} color={colors.accent.success} />
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Bricks Production</Text>
            </View>
            <View style={{ backgroundColor: `${colors.accent.success}18`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: colors.accent.success }}>
                {brickProductionList.length} Brick Types
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: 10 }}>
            Production capacity & output for all brick/block varieties based on {totalBagsProduced.toLocaleString("en-IN")} bag(s) consumed:
          </Text>

          {/* List of all brick types */}
          <View style={{ gap: 10 }}>
            {brickProductionList.map((brick, idx) => (
              <View
                key={brick.id || idx}
                style={{
                  backgroundColor: colors.bg.primary,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border.subtle,
                  padding: 12,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text.primary }}>
                      {brick.itemName}
                    </Text>
                    {brick.category ? (
                      <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 1 }}>
                        {brick.category}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ backgroundColor: `${colors.accent.primary}12`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary }}>
                      ⚡ {brick.unitsPerBag} pcs / bag
                    </Text>
                  </View>
                </View>

                {/* Metrics Row for this Brick Type */}
                <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                  <View style={{ flex: 1, backgroundColor: `${colors.accent.success}0F`, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: `${colors.accent.success}25` }}>
                    <Text style={{ fontSize: 9, fontWeight: "700", color: colors.text.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Total Produced
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: colors.accent.success, marginTop: 2 }}>
                      {brick.unitsProduced.toLocaleString("en-IN")} pcs
                    </Text>
                  </View>

                  {brick.rate > 0 ? (
                    <View style={{ flex: 1, backgroundColor: `${colors.accent.primary}0D`, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: `${colors.accent.primary}20` }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: colors.text.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Est. Value (@ ₹{brick.rate})
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: "800", color: colors.accent.primary, marginTop: 2 }}>
                        ₹{brick.estTotalValue.toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ) : null}

                  <View style={{ flex: 1, backgroundColor: `${colors.text.muted}0D`, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle }}>
                    <Text style={{ fontSize: 9, fontWeight: "700", color: colors.text.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Current Stock
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary, marginTop: 2 }}>
                      {brick.currentStock.toLocaleString("en-IN")} pcs
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Product Orders Summary Card */}
        <View style={{ marginBottom: 16 }}>
          <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>
            Product Orders Summary
          </Text>
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCardItem, { flex: 1, backgroundColor: `${colors.accent.primary}0D`, borderColor: `${colors.accent.primary}30` }]}>
              <Text style={styles.metricCardLabel}>Total Orders Count</Text>
              <Text style={[styles.metricCardVal, { color: colors.accent.primary }]}>
                {workerOrderSummary.count} order(s)
              </Text>
            </View>
            <View style={[styles.metricCardItem, { flex: 1, backgroundColor: `${colors.accent.primary}0D`, borderColor: `${colors.accent.primary}30` }]}>
              <Text style={styles.metricCardLabel}>Total Order Value</Text>
              <Text style={[styles.metricCardVal, { color: colors.accent.primary }]}>
                ₹{workerOrderSummary.totalValue.toLocaleString("en-IN")}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <Pressable
            style={[
              styles.bigActionBtn,
              { backgroundColor: colors.accent.primary, flex: 1 },
            ]}
            onPress={() => setShowAttendanceModal(true)}
          >
            <MaterialIcons name="how-to-reg" size={20} color={colors.bg.card} />
            <Text style={styles.bigActionBtnText}>Log Shift</Text>
          </Pressable>

          <Pressable
            style={[
              styles.bigActionBtn,
              { backgroundColor: "#f59e0b", flex: 1 },
            ]}
            onPress={() => setShowBonusModal(true)}
          >
            <MaterialIcons name="stars" size={20} color={colors.bg.card} />
            <Text style={styles.bigActionBtnText}>Add Bonus</Text>
          </Pressable>

          <Pressable
            style={[
              styles.bigActionBtn,
              { backgroundColor: "#10b981", flex: 1 },
            ]}
            onPress={() => setShowPaymentModal(true)}
          >
            <MaterialIcons name="add-circle-outline" size={20} color={colors.bg.card} />
            <Text style={styles.bigActionBtnText}>Pay Advance</Text>
          </Pressable>
        </View>

        {/* Bonus History */}
        <View style={styles.logSection}>
          <Text style={styles.sectionTitle}>Worker Bonus History</Text>
          {filteredBonusLog.length === 0 ? (
            <Text style={styles.emptyLogText}>No bonus records found for selected period.</Text>
          ) : (
            filteredBonusLog.map((b) => (
              <Pressable
                key={b.id}
                style={({ pressed }) => [styles.logItem, pressed && { opacity: 0.7 }]}
                onPress={() => handleOpenEditLog(b, "bonus")}
              >
                <View
                  style={[
                    styles.logDot,
                    { backgroundColor: "#f59e0b" },
                  ]}
                />
                <View style={styles.logContent}>
                  <Text style={styles.logTitle}>
                    ₹{(b.amount || 0).toLocaleString("en-IN")} — {b.reason || "Bonus"}
                  </Text>
                  <Text style={styles.logDate}>
                    {b.createdAt?.toLocaleDateString("en-IN")}
                    {b.notes ? ` — ${b.notes}` : ""}
                  </Text>
                </View>
                <MaterialIcons name="edit" size={16} color={colors.text.muted} style={{ marginLeft: "auto" }} />
              </Pressable>
            ))
          )}
        </View>

        {/* Attendance History */}
        <View style={styles.logSection}>
          <Text style={styles.sectionTitle}>Recent Attendance</Text>
          {loadingLogs ? (
            <ActivityIndicator size="small" color={colors.accent.primary} />
          ) : filteredAttendanceLog.length === 0 ? (
            <Text style={styles.emptyLogText}>No attendance records found for selected period.</Text>
          ) : (
            filteredAttendanceLog.slice(0, 20).map((att) => (
              <Pressable
                key={att.id}
                style={({ pressed }) => [styles.logItem, pressed && { opacity: 0.7 }]}
                onPress={() => handleOpenEditLog(att, "attendance")}
              >
                <View
                  style={[
                    styles.logDot,
                    {
                      backgroundColor: attStatusColor[att.status] || "#5A5F72",
                    },
                  ]}
                />
                <View style={styles.logContent}>
                  <Text style={styles.logTitle}>
                    {att.status === "half-day"
                      ? "Half Day"
                      : att.status?.charAt(0).toUpperCase() +
                        att.status?.slice(1)}
                    {att.piecesProduced !== undefined && att.piecesProduced > 0
                      ? ` • ${att.piecesProduced} bag(s) of ${rawMaterialBag?.itemName || "Raw Material"} used`
                      : att.hoursWorked
                        ? ` • ${att.hoursWorked}h`
                        : ""}
                    {att.overtimeHours > 0
                      ? ` (+${att.overtimeHours}h OT)`
                      : ""}
                  </Text>
                  <Text style={styles.logDate}>
                    {att.date || att.createdAt?.toLocaleDateString("en-IN")}
                    {att.notes ? ` — ${att.notes}` : ""}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>

        {/* Earning History */}
        <View style={styles.logSection}>
          <Text style={styles.sectionTitle}>Earning History</Text>
          {earningHistory.length === 0 ? (
            <Text style={styles.emptyLogText}>No earning records found for selected period.</Text>
          ) : (
            earningHistory.slice(0, 20).map((earn) => {
              const dotColor = {
                attendance: colors.accent.primary,
                bonus: "#f59e0b",
                loading: colors.accent.success,
                unloading: colors.accent.warning,
              }[earn.type] || colors.text.muted;
              
              return (
                <View key={earn.id} style={styles.logItem}>
                  <View style={[styles.logDot, { backgroundColor: dotColor }]} />
                  <View style={styles.logContent}>
                    <Text style={styles.logTitle}>
                      ₹{(earn.amount || 0).toLocaleString("en-IN")} — {earn.title}
                    </Text>
                    <Text style={styles.logDate}>{earn.rawDate}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Wage Payment History */}
        <View style={styles.logSection}>
          <Text style={styles.sectionTitle}>Wage Payment History</Text>
          {filteredPaymentLog.length === 0 ? (
            <Text style={styles.emptyLogText}>No wage payment records found for selected period.</Text>
          ) : (
            filteredPaymentLog.slice(0, 20).map((pay) => (
              <Pressable
                key={pay.id}
                style={({ pressed }) => [styles.logItem, pressed && { opacity: 0.7 }]}
                onPress={() => handleOpenEditLog(pay, "payment")}
              >
                <View
                  style={[
                    styles.logDot,
                    { backgroundColor: colors.accent.success },
                  ]}
                />
                <View style={styles.logContent}>
                  <Text style={styles.logTitle}>
                    ₹{(pay.amount || 0).toLocaleString("en-IN")} via{" "}
                    {pay.method}
                  </Text>
                  <Text style={styles.logDate}>
                    {pay.createdAt?.toLocaleDateString("en-IN")}
                    {pay.notes ? ` — ${pay.notes}` : ""}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>

        {/* Worker Product Orders Log Section */}
        <View style={styles.logSection}>
          <Text style={styles.sectionTitle}>Worker Orders ({filteredWorkerCustomerOrders.length})</Text>
          {filteredWorkerCustomerOrders.length === 0 ? (
            <Text style={styles.emptyLogText}>No product/material orders recorded for this worker.</Text>
          ) : (
            filteredWorkerCustomerOrders.map((ord) => {
              const orderDate = ord.createdAt instanceof Date ? ord.createdAt : new Date(ord.createdAt);
              const isUnpaid = Number(ord.balanceDue || 0) > 0;
              return (
                <View key={ord.id} style={[styles.logItem, { flexDirection: "column", alignItems: "stretch", gap: 6, paddingVertical: 10 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={[styles.logDot, { backgroundColor: colors.accent.primary }]} />
                      <Text style={styles.logTitle}>
                        Order #{ord.id.slice(-6).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: colors.accent.primary }}>
                      ₹{Number(ord.total || 0).toLocaleString("en-IN")}
                    </Text>
                  </View>

                  <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 16 }}>
                    {ord.itemName || "Brick Order"} {ord.quantity ? `• ${ord.quantity} pcs` : ""}
                  </Text>

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginLeft: 16, marginTop: 2 }}>
                    <Text style={styles.logDate}>{orderDate.toLocaleDateString("en-IN")}</Text>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.accent.success }}>
                        Paid: ₹{Number(ord.paidAmount || 0).toLocaleString("en-IN")}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: isUnpaid ? colors.accent.danger : colors.accent.success }}>
                        Due: ₹{Number(ord.balanceDue || 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Worker Order Payment Logs Section */}
        <View style={[styles.logSection, { marginBottom: 40 }]}>
          <Text style={styles.sectionTitle}>Order Payment Logs ({filteredOrderPaymentsLog.length})</Text>
          {filteredOrderPaymentsLog.length === 0 ? (
            <Text style={styles.emptyLogText}>No order payment records found for this worker.</Text>
          ) : (
            filteredOrderPaymentsLog.map((pay) => {
              const payDate = pay.createdAt instanceof Date ? pay.createdAt : new Date(pay.createdAt);
              return (
                <View key={pay.id} style={styles.logItem}>
                  <View
                    style={[
                      styles.logDot,
                      { backgroundColor: "#3B82F6" },
                    ]}
                  />
                  <View style={styles.logContent}>
                    <Text style={styles.logTitle}>
                      ₹{(pay.amount || 0).toLocaleString("en-IN")} via {pay.paymentMethod || pay.method || "Cash"}
                    </Text>
                    <Text style={styles.logDate}>
                      {payDate.toLocaleDateString("en-IN")}
                      {pay.notes ? ` — ${pay.notes}` : ""}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Total Earned Details Modal */}
      <Modal
        visible={showEarnedDetailsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEarnedDetailsModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxWidth: 460, maxHeight: "85%", gap: 12 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: colors.border.subtle, paddingBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#7c3aed" }}>
                  Total Earned Details
                </Text>
                <Text style={{ fontSize: 12, color: colors.text.muted, marginTop: 2 }}>
                  Full breakdown of earnings & wages (₹{liveTotalWages.toLocaleString("en-IN")})
                </Text>
              </View>
              <Pressable onPress={() => setShowEarnedDetailsModal(false)} style={{ padding: 4 }}>
                <MaterialIcons name="close" size={24} color={colors.text.primary} />
              </Pressable>
            </View>

            {/* Category breakdown chips */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 4 }}>
              <View style={{ flex: 1, minWidth: 130, backgroundColor: "#f5f3ff", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#7c3aed30" }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#7c3aed", textTransform: "uppercase" }}>Attendance/Shifts</Text>
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text.primary, marginTop: 2 }}>₹{totalAttendanceWages.toLocaleString("en-IN")}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 130, backgroundColor: "#ecfdf5", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#05966930" }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#059669", textTransform: "uppercase" }}>Loading Wages</Text>
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text.primary, marginTop: 2 }}>₹{totalLoadingWages.toLocaleString("en-IN")}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 130, backgroundColor: "#fff7ed", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#ea580c30" }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#ea580c", textTransform: "uppercase" }}>Unloading Wages</Text>
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text.primary, marginTop: 2 }}>₹{totalUnloadingWages.toLocaleString("en-IN")}</Text>
              </View>
              {totalBonusWages > 0 && (
                <View style={{ flex: 1, minWidth: 130, backgroundColor: "#fef3c7", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#f59e0b30" }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#d97706", textTransform: "uppercase" }}>Bonus Rewards</Text>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text.primary, marginTop: 2 }}>₹{totalBonusWages.toLocaleString("en-IN")}</Text>
                </View>
              )}
            </View>

            {/* List of all earning items */}
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.muted, textTransform: "uppercase", marginTop: 4 }}>
              All Earning Entries ({earningHistory.length})
            </Text>

            <ScrollView showsVerticalScrollIndicator style={{ flexGrow: 1, maxHeight: 300 }}>
              {earningHistory.length === 0 ? (
                <Text style={styles.emptyLogText}>No earning entries found.</Text>
              ) : (
                earningHistory.map((earn) => {
                  const dotColor = {
                    attendance: colors.accent.primary,
                    bonus: "#f59e0b",
                    loading: colors.accent.success,
                    unloading: colors.accent.warning,
                  }[earn.type] || colors.text.muted;

                  return (
                    <View
                      key={earn.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 10,
                        paddingHorizontal: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border.subtle,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <View style={[styles.logDot, { backgroundColor: dotColor, marginTop: 0 }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text.primary }}>{earn.title}</Text>
                          <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{earn.rawDate}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text.primary, marginLeft: 8 }}>
                        ₹{(earn.amount || 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <Pressable
              onPress={() => setShowEarnedDetailsModal(false)}
              style={[styles.modalCancelBtn, { marginTop: 4, backgroundColor: "#7c3aed", borderColor: "#7c3aed" }]}
            >
              <Text style={[styles.modalCancelText, { color: "#FFF" }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Total Paid Details Modal */}
      <Modal
        visible={showPaidDetailsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPaidDetailsModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxWidth: 460, maxHeight: "85%", gap: 12 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: colors.border.subtle, paddingBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#059669" }}>
                  Total Paid Details
                </Text>
                <Text style={{ fontSize: 12, color: colors.text.muted, marginTop: 2 }}>
                  Full breakdown of payments made to worker (₹{liveTotalPaid.toLocaleString("en-IN")})
                </Text>
              </View>
              <Pressable onPress={() => setShowPaidDetailsModal(false)} style={{ padding: 4 }}>
                <MaterialIcons name="close" size={24} color={colors.text.primary} />
              </Pressable>
            </View>

            {/* Total summary badge */}
            <View style={{ backgroundColor: "#ecfdf5", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#05966930", marginVertical: 4, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#059669" }}>Total Wage & Advance Payments</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: "#059669" }}>₹{liveTotalPaid.toLocaleString("en-IN")}</Text>
            </View>

            {/* List of all payment items */}
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.muted, textTransform: "uppercase", marginTop: 4 }}>
              Payment Records ({filteredPaymentLog.length})
            </Text>

            <ScrollView showsVerticalScrollIndicator style={{ flexGrow: 1, maxHeight: 300 }}>
              {filteredPaymentLog.length === 0 ? (
                <Text style={styles.emptyLogText}>No payment records found.</Text>
              ) : (
                filteredPaymentLog.map((pay) => {
                  const payDate = pay.createdAt instanceof Date ? pay.createdAt : new Date(pay.createdAt);
                  return (
                    <Pressable
                      key={pay.id}
                      style={({ pressed }) => [{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 10,
                        paddingHorizontal: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border.subtle,
                      }, pressed && { opacity: 0.7 }]}
                      onPress={() => {
                        setShowPaidDetailsModal(false);
                        handleOpenEditLog(pay, "payment");
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <View style={[styles.logDot, { backgroundColor: "#059669", marginTop: 0 }]} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text.primary }}>
                              ₹{(pay.amount || 0).toLocaleString("en-IN")}
                            </Text>
                            <View style={{ backgroundColor: "#05966915", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#059669" }}>{pay.method || "Cash"}</Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                            {payDate.toLocaleDateString("en-IN")}
                            {pay.notes ? ` — ${pay.notes}` : ""}
                          </Text>
                        </View>
                      </View>
                      <MaterialIcons name="edit" size={16} color={colors.text.muted} style={{ marginLeft: 8 }} />
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <Pressable
              onPress={() => setShowPaidDetailsModal(false)}
              style={[styles.modalCancelBtn, { marginTop: 4, backgroundColor: "#059669", borderColor: "#059669" }]}
            >
              <Text style={[styles.modalCancelText, { color: "#FFF" }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    container: { padding: 16, backgroundColor: colors.bg.card, flexGrow: 1 },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg.card,
    },
    loadingText: { marginTop: 12, color: colors.text.muted, fontSize: 14 },
    header: { marginBottom: 12 },
    backButton: { flexDirection: "row", alignItems: "center", gap: 4 },
    backText: { fontSize: 15, fontWeight: "600", color: colors.text.secondary },
    profileCard: {
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 20,
      padding: 20,
      marginBottom: 16,
    },
    profileAvatar: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: "#ede9fe",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 12,
    },
    profileAvatarText: { fontSize: 22, fontWeight: "800", color: "#7c3aed" },
    profileName: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 6,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 8,
      marginBottom: 4,
    },
    statusActive: { backgroundColor: "#ecfdf5" },
    statusInactive: { backgroundColor: colors.border.subtle },
    statusText: { fontSize: 12, fontWeight: "700" },
    profileRole: { fontSize: 13, color: colors.text.muted, fontWeight: "600" },
    quickActions: { flexDirection: "row", gap: 10, marginTop: 16 },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      height: 38,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1.5,
    },
    editAction: { borderColor: "#6C5CE740", backgroundColor: "#6C5CE720" },
    deleteAction: { borderColor: "#fecaca", backgroundColor: "#fef2f2" },
    buttonPressed: { opacity: 0.8 },
    actionText: { fontSize: 13, fontWeight: "700" },
    infoCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      gap: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 8,
    },
    infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    infoContent: { flex: 1 },
    infoLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    infoValue: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
      marginTop: 1,
    },
    financeCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
    },
    financeRow: { flexDirection: "row", gap: 8 },
    financeBlock: {
      flex: 1,
      borderRadius: 12,
      padding: 12,
      alignItems: "center",
    },
    financeNum: { fontSize: 16, fontWeight: "800" },
    financeLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.text.muted,
      marginTop: 2,
    },
    actionRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    bigActionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 48,
      borderRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    bigActionBtnText: {
      color: colors.bg.card,
      fontSize: 14,
      fontWeight: "700",
    },
    logSection: {
      backgroundColor: colors.bg.card,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
    },
    emptyLogText: {
      fontSize: 13,
      color: colors.text.muted,
      fontStyle: "italic",
    },
    logItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: 12,
    },
    logDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    logContent: { flex: 1 },
    logTitle: { fontSize: 14, fontWeight: "600", color: colors.text.primary },
    logDate: { fontSize: 12, color: colors.text.muted, marginTop: 1 },
    modalBg: {
      flex: 1,
      backgroundColor: "rgba(15,23,42,0.4)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modalContent: {
      backgroundColor: colors.bg.card,
      borderRadius: 20,
      padding: 20,
      width: "100%",
      maxWidth: 400,
      gap: 10,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 4,
    },
    label: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 4,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      height: 46,
      paddingHorizontal: 14,
      fontSize: 15,
      color: colors.text.primary,
      backgroundColor: colors.bg.primary,
    },
    segmentRow: { flexDirection: "row", gap: 8 },
    segmentBtn: {
      flex: 1,
      height: 38,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.border.subtle,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
    },
    segmentBtnActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    segmentBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.muted,
    },
    modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
    modalCancelBtn: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
    },
    modalCancelText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.muted,
    },
    modalSaveBtn: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.accent.primary,
    },
    modalSaveText: { fontSize: 14, fontWeight: "700", color: colors.bg.card },
    totalCountText: {
      fontSize: 15,
      fontWeight: "800",
      marginTop: 6,
    },
    dateSelector: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      height: 46,
      paddingHorizontal: 14,
      backgroundColor: colors.bg.card,
      marginBottom: 12,
      marginTop: 6,
    },
    dateSelectorText: {
      fontSize: 15,
      color: colors.text.primary,
      fontWeight: "500",
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
      marginTop: 8,
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
    financeDivider: {
      height: 1.5,
      backgroundColor: colors.border.subtle,
      marginVertical: 14,
    },
    financeSubTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 10,
    },
    breakdownRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
      alignItems: "center",
    },
    breakdownLabelContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    breakdownLabel: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: "500",
    },
    breakdownValue: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    breakdownRowTotal: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      marginTop: 6,
      borderTopWidth: 1.5,
      borderTopColor: colors.border.subtle,
      alignItems: "center",
    },
    breakdownLabelTotal: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    breakdownValueTotal: {
      fontSize: 14,
      fontWeight: "800",
      color: "#7c3aed",
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
  });
};
export default function WorkerDetailsRoute() {
  return (
    <ProtectedRoute>
      <WorkerDetails />
    </ProtectedRoute>
  );
}
