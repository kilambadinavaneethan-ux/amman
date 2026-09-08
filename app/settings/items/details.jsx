import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import { useContext, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import AnimatedPage from "../../components/AnimatedPage";
import BackButton from "../../components/BackButton";
import EasyCalendarModal from "../../components/EasyCalendarModal";
import ProtectedRoute from "../../components/ProtectedRoute";
import { ItemContext } from "../../context/ItemContext";
import { CustomerContext } from "../../context/CustomerContext";
import { WorkerContext } from "../../context/WorkerContext";
import { RawMaterialSupplierContext } from "../../context/RawMaterialSupplierContext";
import { DeliveryPartnerContext } from "../../context/DeliveryPartnerContext";
import { useTheme } from "../../context/ThemeContext";
import { UserContext } from "../../context/UserContext";
import { db } from "../../../src/config/firebase";

const RATE_TYPE_LABELS = {
  piece: "Piece Rate",
  unit: "Unit Rate",
  bag: "Bag Rate",
};

const RATE_TYPE_SUFFIX = {
  piece: "piece",
  unit: "unit",
  bag: "bag",
};

const LOG_TYPE_CONFIG = {
  initial: { label: "Initial Stock", icon: "add-box", color: "#4f46e5", bg: "#e0e7ff" },
  production: { label: "Production", icon: "build", color: "#059669", bg: "#d1fae5" },
  production_adjustment: { label: "Prod. Edit", icon: "build", color: "#059669", bg: "#d1fae5" },
  production_rollback: { label: "Prod. Rollback", icon: "history", color: "#d97706", bg: "#fef3c7" },
  sale: { label: "Billed Sale", icon: "shopping-cart", color: "#2563eb", bg: "#dbeafe" },
  purchase: { label: "Purchase Intake", icon: "add-shopping-cart", color: "#0d9488", bg: "#ccfbf1" },
  consumption: { label: "Consumption", icon: "trending-down", color: "#e11d48", bg: "#ffe4e6" },
  adjustment: { label: "Manual Audit", icon: "edit", color: "#7c3aed", bg: "#ede9fe" },
  rollback: { label: "Order Rollback", icon: "history", color: "#d97706", bg: "#fef3c7" },
};

function ItemDetailsScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { items, deleteItem, updateItem } = useContext(ItemContext);
  const { profile } = useContext(UserContext);
  const { customers } = useContext(CustomerContext) || {};
  const { workers } = useContext(WorkerContext) || {};
  const { suppliers } = useContext(RawMaterialSupplierContext) || {};
  const { partners } = useContext(DeliveryPartnerContext) || {};

  const item = items.find((itm) => itm.id === id);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditingUnits, setIsEditingUnits] = useState(false);
  const [unitsInput, setUnitsInput] = useState("50");

  // Inline Opening Stock Quick Edit State
  const [isEditingOpeningStock, setIsEditingOpeningStock] = useState(false);
  const [openingStockInput, setOpeningStockInput] = useState("0");
  const [savingInlineStock, setSavingInlineStock] = useState(false);

  // Stock Logs CRUD & Audit Log State
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [logModalMode, setLogModalMode] = useState("add"); // "add" | "edit"
  const [logBeingEdited, setLogBeingEdited] = useState(null);
  
  const [logType, setLogType] = useState("adjustment");
  const [logDirectionMode, setLogDirectionMode] = useState("add"); // "add" | "deduct"
  const [logQuantity, setLogQuantity] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [savingLog, setSavingLog] = useState(false);

  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState("All");
  const [logDirectionFilter, setLogDirectionFilter] = useState("All"); // "All" | "inflow" | "outflow"
  const [logSortOrder, setLogSortOrder] = useState("newest"); // "newest" | "oldest"

  // Date Period / Customize Filter State for Audit Log
  const [logDatePreset, setLogDatePreset] = useState("all"); // "all" | "today" | "week" | "month" | "year" | "custom"
  const [logStartDate, setLogStartDate] = useState(null);
  const [logEndDate, setLogEndDate] = useState(null);
  const [isLogCalendarOpen, setIsLogCalendarOpen] = useState(false);
  const [logCalendarMode, setLogCalendarMode] = useState("start"); // "start" | "end"

  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportContent, setExportContent] = useState("");
  const [copiedExport, setCopiedExport] = useState(false);

  const [deleteLogModalVisible, setDeleteLogModalVisible] = useState(false);
  const [logBeingDeleted, setLogBeingDeleted] = useState(null);
  const [deletingLog, setDeletingLog] = useState(false);

  // Slot-wise Stock CRUD Modal State
  const [slotModalVisible, setSlotModalVisible] = useState(false);
  const [editingSlots, setEditingSlots] = useState([]);
  const [savingSlots, setSavingSlots] = useState(false);
  const [modalOpeningStock, setModalOpeningStock] = useState("0");
  const [modalStockNotes, setModalStockNotes] = useState("");

  const handleSaveInlineOpeningStock = async () => {
    setIsEditingOpeningStock(false);
    const parsed = parseInt(openingStockInput, 10);
    if (isNaN(parsed) || parsed < 0) {
      alert("Please enter a valid non-negative integer for opening stock.");
      setOpeningStockInput(
        String(item?.openingStock !== undefined ? item.openingStock : item?.stock || "0")
      );
      return;
    }

    const currentStockVal = Number(item?.openingStock !== undefined ? item.openingStock : item?.stock || 0);
    if (parsed === currentStockVal) return;

    setSavingInlineStock(true);
    try {
      let updatedSlots = Array.isArray(item?.openingStockSlots) && item.openingStockSlots.length > 0
        ? [...item.openingStockSlots]
        : [{ id: "1", slotName: "Main Stock", quantity: parsed, slotType: "o" }];

      if (updatedSlots.length === 1) {
        updatedSlots[0] = { ...updatedSlots[0], quantity: parsed };
      } else {
        const otherSlotsSum = updatedSlots.slice(1).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0);
        if (parsed >= otherSlotsSum) {
          updatedSlots[0] = { ...updatedSlots[0], quantity: parsed - otherSlotsSum };
        } else {
          updatedSlots = updatedSlots.map((s, idx) => ({
            ...s,
            quantity: idx === 0 ? parsed : 0,
          }));
        }
      }

      await updateItem(item.id, {
        openingStock: parsed,
        openingStockSlots: updatedSlots,
      });
    } catch (e) {
      alert("Failed to update opening stock.");
    } finally {
      setSavingInlineStock(false);
    }
  };

  const handleOpenSlotModal = () => {
    const currentStockVal = Number(item?.openingStock !== undefined ? item.openingStock : item?.stock || 0);
    setModalOpeningStock(String(currentStockVal));
    setModalStockNotes("");

    let currentSlots = Array.isArray(item?.openingStockSlots) && item.openingStockSlots.length > 0
      ? item.openingStockSlots
      : [{ id: "1", slotName: "Slot 1", quantity: String(currentStockVal) }];

    setEditingSlots(
      currentSlots.map((s, idx) => ({
        id: s.id || String(idx + 1),
        slotName: s.slotName || `Slot ${idx + 1}`,
        quantity: String(s.quantity !== undefined ? s.quantity : (idx === 0 ? currentStockVal : 0)),
      }))
    );
    setSlotModalVisible(true);
  };

  const handleModalOpeningStockChange = (text) => {
    setModalOpeningStock(text);
  };

  const handleAutoBalanceSlots = () => {
    const targetStock = parseInt(modalOpeningStock, 10) || 0;
    if (editingSlots.length === 0) {
      setEditingSlots([{ id: "1", slotName: "Slot 1", quantity: String(targetStock) }]);
      return;
    }
    setEditingSlots((prev) => {
      const updated = [...prev];
      const otherSum = updated.slice(1).reduce((acc, cur) => acc + (parseInt(cur.quantity, 10) || 0), 0);
      updated[0] = {
        ...updated[0],
        quantity: String(Math.max(0, targetStock - otherSum)),
      };
      return updated;
    });
  };

  const handleDistributeEvenly = () => {
    const targetStock = parseInt(modalOpeningStock, 10) || 0;
    if (editingSlots.length === 0) return;
    const count = editingSlots.length;
    const base = Math.floor(targetStock / count);
    const remainder = targetStock % count;

    setEditingSlots((prev) =>
      prev.map((s, idx) => ({
        ...s,
        quantity: String(base + (idx === 0 ? remainder : 0)),
      }))
    );
  };

  const handleResetToSingleSlot = () => {
    const targetStock = parseInt(modalOpeningStock, 10) || 0;
    setEditingSlots([
      { id: "1", slotName: "Main Stock", quantity: String(targetStock) },
    ]);
  };

  const handleAddSlotInModal = () => {
    const targetStock = parseInt(modalOpeningStock, 10) || 0;
    const nextNum = editingSlots.length + 1;
    setEditingSlots((prev) => {
      const updated = [
        ...prev,
        { id: Date.now().toString(), slotName: `Slot ${nextNum}`, quantity: "0" },
      ];
      const otherSum = updated.slice(1).reduce((acc, cur) => acc + (parseInt(cur.quantity, 10) || 0), 0);
      updated[0].quantity = String(Math.max(0, targetStock - otherSum));
      return updated;
    });
  };

  const handleRemoveSlotInModal = (id) => {
    if (editingSlots.length <= 1) return;
    const targetStock = parseInt(modalOpeningStock, 10) || 0;
    setEditingSlots((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      const otherSum = updated.slice(1).reduce((acc, cur) => acc + (parseInt(cur.quantity, 10) || 0), 0);
      updated[0].quantity = String(Math.max(0, targetStock - otherSum));
      return updated;
    });
  };

  const handleSlotNameChangeInModal = (id, text) => {
    setEditingSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, slotName: text } : s))
    );
  };

  const handleSlotQtyChangeInModal = (id, text) => {
    const targetStock = parseInt(modalOpeningStock, 10) || 0;
    setEditingSlots((prev) => {
      const targetIndex = prev.findIndex((s) => s.id === id);
      if (targetIndex === -1) return prev;

      const updated = prev.map((s) => (s.id === id ? { ...s, quantity: text } : s));
      const parsedVal = parseInt(text, 10) || 0;

      if (targetIndex !== 0) {
        const otherSum = updated.slice(1).reduce((acc, cur) => acc + (parseInt(cur.quantity, 10) || 0), 0);
        updated[0].quantity = String(Math.max(0, targetStock - otherSum));
      } else if (targetIndex === 0 && updated.length > 1) {
        const otherSumExcept1 = updated.slice(2).reduce((acc, cur) => acc + (parseInt(cur.quantity, 10) || 0), 0);
        updated[1].quantity = String(Math.max(0, targetStock - parsedVal - otherSumExcept1));
      }

      return updated;
    });
  };

  const handleSaveSlotModal = async () => {
    const targetStock = parseInt(modalOpeningStock, 10);
    if (isNaN(targetStock) || targetStock < 0) {
      alert("Please enter a valid non-negative integer for total Opening Stock.");
      return;
    }

    setSavingSlots(true);
    try {
      const formatted = [];
      const totalSlots = editingSlots.length;
      for (let idx = 0; idx < totalSlots; idx++) {
        const slot = editingSlots[idx];
        if (!slot.slotName.trim()) {
          alert("Slot name cannot be empty.");
          setSavingSlots(false);
          return;
        }
        const q = parseInt(slot.quantity, 10);
        if (isNaN(q) || q < 0) {
          alert(`Invalid quantity for ${slot.slotName}`);
          setSavingSlots(false);
          return;
        }
        let computedRole = "o";
        if (idx === 0) computedRole = "-";
        else if (idx === totalSlots - 1 && totalSlots > 1) computedRole = "+";
        else computedRole = "o";

        formatted.push({
          id: slot.id,
          slotName: slot.slotName.trim(),
          quantity: q,
          slotType: computedRole,
        });
      }

      const totalFromSlots = formatted.reduce((acc, s) => acc + s.quantity, 0);
      if (totalFromSlots !== targetStock) {
        alert(`Sum of slot quantities (${totalFromSlots}) must equal total Opening Stock (${targetStock}). Use "Auto-Balance" or adjust slot quantities.`);
        setSavingSlots(false);
        return;
      }

      const previousStockVal = Number(item?.openingStock !== undefined ? item.openingStock : item?.stock || 0);

      await updateItem(item.id, {
        openingStock: targetStock,
        openingStockSlots: formatted,
      });

      if (modalStockNotes.trim() && targetStock !== previousStockVal) {
        const createdByName = profile?.name || profile?.businessName || profile?.email || "Admin";
        await addDoc(collection(db, "item_stock_logs"), {
          itemId: item.id,
          itemName: item.itemName,
          itemType: item.itemType || "product",
          type: "adjustment",
          quantity: targetStock - previousStockVal,
          previousStock: previousStockVal,
          newStock: targetStock,
          notes: modalStockNotes.trim(),
          createdBy: createdByName,
          date: new Date(),
          createdAt: new Date(),
        });
      }

      setSlotModalVisible(false);
    } catch (e) {
      alert("Failed to save slot stock split.");
    } finally {
      setSavingSlots(false);
    }
  };

  const handleOpenAddLog = () => {
    setLogModalMode("add");
    setLogBeingEdited(null);
    setLogType("adjustment");
    setLogDirectionMode("add");
    setLogQuantity("");
    setLogNotes("");
    setLogModalVisible(true);
  };

  const handleOpenEditLog = (log) => {
    setLogModalMode("edit");
    setLogBeingEdited(log);
    setLogType(log.type || "adjustment");
    const qNum = Number(log.quantity || 0);
    if (qNum < 0) {
      setLogDirectionMode("deduct");
      setLogQuantity(String(Math.abs(qNum)));
    } else {
      setLogDirectionMode("add");
      setLogQuantity(String(qNum));
    }
    setLogNotes(log.notes || "");
    setLogModalVisible(true);
  };

  const handleConfirmDeleteLog = (log) => {
    setLogBeingDeleted(log);
    setDeleteLogModalVisible(true);
  };

  const adjustSlotsHelper = (slots, changeQty, isProduction = false) => {
    if (!Array.isArray(slots) || slots.length === 0) return slots;
    let updatedSlots = slots.map((s) => ({ ...s }));
    const totalSlots = updatedSlots.length;

    if (isProduction) {
      // Production entry or production rollback targets Last Slot (+ Mfg)
      const lastIdx = totalSlots - 1;
      const currentQty = Number(updatedSlots[lastIdx].quantity || 0);
      const newQty = currentQty + changeQty;

      if (newQty >= 0) {
        updatedSlots[lastIdx].quantity = newQty;
      } else {
        // If + Mfg slot goes negative during rollback, zero out + Mfg slot and drain deficit backwards
        updatedSlots[lastIdx].quantity = 0;
        let deficit = Math.abs(newQty);
        for (let i = totalSlots - 2; i >= 0 && deficit > 0; i--) {
          const q = Number(updatedSlots[i].quantity || 0);
          if (q <= deficit) {
            deficit -= q;
            updatedSlots[i].quantity = 0;
          } else {
            updatedSlots[i].quantity = q - deficit;
            deficit = 0;
          }
        }
      }
    } else {
      if (changeQty < 0) {
        // Sales/Billed Deduction: FIFO drain starting from Slot 1 (- Bill)
        let deductRemaining = Math.abs(changeQty);
        const initialCount = updatedSlots.length;

        while (deductRemaining > 0 && updatedSlots.length > 0) {
          const firstQty = Number(updatedSlots[0].quantity || 0);
          if (firstQty <= deductRemaining) {
            deductRemaining -= firstQty;
            updatedSlots.shift();
          } else {
            updatedSlots[0].quantity = firstQty - deductRemaining;
            deductRemaining = 0;
          }
        }

        const deletedCount = initialCount - updatedSlots.length;
        if (deletedCount > 0) {
          for (let k = 0; k < deletedCount; k++) {
            updatedSlots.push({
              id: (Date.now() + k).toString(),
              slotName: `Slot ${updatedSlots.length + 1}`,
              quantity: 0,
            });
          }
        }
      } else if (changeQty > 0) {
        // Sales order cancellation/refund: Add back to Slot 1 (- Bill)
        const currentQty = Number(updatedSlots[0].quantity || 0);
        updatedSlots[0].quantity = currentQty + changeQty;
      }
    }

    const total = updatedSlots.length;
    return updatedSlots.map((s, idx) => ({
      ...s,
      slotName: s.slotName && !s.slotName.startsWith("Slot ") ? s.slotName : `Slot ${idx + 1}`,
      slotType: idx === 0 ? "-" : (idx === total - 1 && total > 1 ? "+" : "o"),
    }));
  };

  const handleSaveLog = async () => {
    const absVal = Math.abs(Number(logQuantity));
    if (isNaN(absVal) || absVal === 0) {
      alert("Please enter a valid non-zero quantity.");
      return;
    }
    const signedQty = logDirectionMode === "deduct" ? -absVal : absVal;

    setSavingLog(true);
    try {
      const currentStock = Number(item.openingStock !== undefined ? item.openingStock : item.stock || 0);
      const currentSlots = Array.isArray(item.openingStockSlots) ? item.openingStockSlots : [];
      const isProd = logType === "production" || logType === "production_adjustment";
      const createdByName = profile?.name || profile?.businessName || profile?.email || "Admin";

      if (logModalMode === "add") {
        const newStock = currentStock + signedQty;
        const newSlots = adjustSlotsHelper(currentSlots, signedQty, isProd);

        // 1. Add Log Entry
        await addDoc(collection(db, "item_stock_logs"), {
          itemId: item.id,
          itemName: item.itemName,
          itemType: item.itemType || "product",
          type: logType,
          quantity: signedQty,
          previousStock: currentStock,
          newStock: newStock,
          notes: logNotes.trim(),
          createdBy: createdByName,
          date: new Date(),
          createdAt: new Date(),
        });

        // 2. Update Item Current Stock directly in Firestore
        await updateDoc(doc(db, "items", item.id), {
          openingStock: newStock,
          openingStockSlots: newSlots,
          updatedAt: new Date(),
        });

      } else if (logModalMode === "edit" && logBeingEdited) {
        const oldQty = Number(logBeingEdited.quantity);
        const difference = signedQty - oldQty;
        const newItemStock = currentStock + difference;
        const isPrevProd = logBeingEdited.type === "production" || logBeingEdited.type === "production_adjustment";
        const newSlots = adjustSlotsHelper(currentSlots, difference, isPrevProd || isProd);

        // 1. Update Log Entry
        await updateDoc(doc(db, "item_stock_logs", logBeingEdited.id), {
          type: logType,
          quantity: signedQty,
          newStock: logBeingEdited.previousStock + signedQty,
          notes: logNotes.trim(),
          updatedAt: new Date(),
        });

        // 2. Update Item Current Stock directly in Firestore
        await updateDoc(doc(db, "items", item.id), {
          openingStock: newItemStock,
          openingStockSlots: newSlots,
          updatedAt: new Date(),
        });
      }

      setLogModalVisible(false);
    } catch (e) {
      alert("Failed to save stock movement log.");
    } finally {
      setSavingLog(false);
    }
  };

  const handleDeleteLog = async () => {
    if (!logBeingDeleted) return;
    setDeletingLog(true);
    try {
      const currentStock = Number(item.openingStock !== undefined ? item.openingStock : item.stock || 0);
      const qty = Number(logBeingDeleted.quantity);
      const newItemStock = currentStock - qty;
      const currentSlots = Array.isArray(item.openingStockSlots) ? item.openingStockSlots : [];
      const isProd = logBeingDeleted.type === "production" || logBeingDeleted.type === "production_adjustment";
      const newSlots = adjustSlotsHelper(currentSlots, -qty, isProd);

      // 1. Delete Log Entry
      await deleteDoc(doc(db, "item_stock_logs", logBeingDeleted.id));

      // 2. Adjust Item Stock directly in Firestore
      await updateDoc(doc(db, "items", item.id), {
        openingStock: newItemStock,
        openingStockSlots: newSlots,
        updatedAt: new Date(),
      });

      setDeleteLogModalVisible(false);
      setLogBeingDeleted(null);
    } catch (e) {
      alert("Failed to delete stock movement log.");
    } finally {
      setDeletingLog(false);
    }
  };

  useEffect(() => {
    if (item) {
      setUnitsInput(
        String(item.unitsPerBag !== undefined ? item.unitsPerBag : "50"),
      );
      setOpeningStockInput(
        String(item.openingStock !== undefined ? item.openingStock : item.stock || "0"),
      );
    }
  }, [item]);

  const handleSaveUnits = async () => {
    setIsEditingUnits(false);
    const parsed = parseInt(unitsInput, 10);
    if (isNaN(parsed) || parsed <= 0) {
      alert("Please enter a valid positive integer for units per bag.");
      setUnitsInput(
        String(item.unitsPerBag !== undefined ? item.unitsPerBag : "50"),
      );
      return;
    }
    try {
      await updateItem(item.id, {
        unitsPerBag: parsed,
      });
    } catch (e) {
      alert("Failed to update units per bag.");
    }
  };

  const currencySymbol = profile?.currency || "$";

  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [editingRateInput, setEditingRateInput] = useState("");

  const [stockLogs, setStockLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    if (!item?.id) return;
    setLoadingLogs(true);
    const logsCollection = collection(db, "item_stock_logs");
    const q = query(
      logsCollection,
      where("itemId", "==", item.id),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbLogs = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            date: data.date
              ? data.date.toDate
                ? data.date.toDate()
                : new Date(data.date)
              : new Date(),
          };
        });

        // Sort in memory by date descending to avoid Firebase index error
        dbLogs.sort((a, b) => b.date.getTime() - a.date.getTime());

        setStockLogs(dbLogs);
        setLoadingLogs(false);
      },
      (error) => {
        setLoadingLogs(false);
      },
    );

    return () => unsubscribe();
  }, [item?.id]);

  const filteredStockLogs = useMemo(() => {
    return stockLogs
      .filter((log) => {
        // 1. Date / Period Filter
        if (logDatePreset !== "all") {
          const logDate = log.date ? new Date(log.date) : null;
          if (!logDate || isNaN(logDate.getTime())) return false;

          const now = new Date();
          const logTime = logDate.getTime();

          if (logDatePreset === "today" || logDatePreset === "day") {
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
            if (logTime < todayStart || logTime > todayEnd) return false;
          } else if (logDatePreset === "week") {
            const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
            const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
            if (logTime < weekStart || logTime > weekEnd) return false;
          } else if (logDatePreset === "month") {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
            if (logTime < monthStart || logTime > monthEnd) return false;
          } else if (logDatePreset === "year" || logDatePreset === "years") {
            const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
            const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999).getTime();
            if (logTime < yearStart || logTime > yearEnd) return false;
          } else if (logDatePreset === "custom") {
            if (logStartDate) {
              const s = new Date(logStartDate.getFullYear(), logStartDate.getMonth(), logStartDate.getDate()).getTime();
              if (logTime < s) return false;
            }
            if (logEndDate) {
              const e = new Date(logEndDate.getFullYear(), logEndDate.getMonth(), logEndDate.getDate(), 23, 59, 59, 999).getTime();
              if (logTime > e) return false;
            }
          }
        }

        // 2. Search Query
        if (logSearchQuery.trim()) {
          const q = logSearchQuery.toLowerCase().trim();
          const notesMatch = (log.notes || "").toLowerCase().includes(q);
          const typeMatch = (log.type || "").toLowerCase().includes(q);
          const qtyMatch = String(log.quantity || "").includes(q);
          const userMatch = (log.createdBy || "").toLowerCase().includes(q);
          if (!notesMatch && !typeMatch && !qtyMatch && !userMatch) return false;
        }

        // 3. Movement Type Filter
        if (logTypeFilter !== "All") {
          if (logTypeFilter === "production") {
            if (log.type !== "production" && log.type !== "production_adjustment" && log.type !== "production_rollback") {
              return false;
            }
          } else if (logTypeFilter === "rollback") {
            if (log.type !== "rollback" && log.type !== "production_rollback") {
              return false;
            }
          } else if (log.type !== logTypeFilter) {
            return false;
          }
        }

        // 4. Direction Filter
        if (logDirectionFilter === "inflow" && Number(log.quantity) <= 0) return false;
        if (logDirectionFilter === "outflow" && Number(log.quantity) >= 0) return false;

        return true;
      })
      .sort((a, b) => {
        const timeA = a.date ? a.date.getTime() : 0;
        const timeB = b.date ? b.date.getTime() : 0;
        return logSortOrder === "newest" ? timeB - timeA : timeA - timeB;
      });
  }, [stockLogs, logDatePreset, logStartDate, logEndDate, logSearchQuery, logTypeFilter, logDirectionFilter, logSortOrder]);

  const logStats = useMemo(() => {
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalProduction = 0;
    let totalSales = 0;

    filteredStockLogs.forEach((log) => {
      const q = Number(log.quantity || 0);
      const type = log.type || "";
      if (q > 0) totalInflow += q;
      else if (q < 0) totalOutflow += Math.abs(q);

      if (type === "production" || type === "production_adjustment") {
        if (q > 0) totalProduction += q;
      } else if (type === "sale") {
        if (q < 0) totalSales += Math.abs(q);
      }
    });

    return {
      totalLogs: filteredStockLogs.length,
      totalInflow,
      totalOutflow,
      totalProduction,
      totalSales,
      netChange: totalInflow - totalOutflow,
    };
  }, [filteredStockLogs]);

  const handleExportLogs = () => {
    if (stockLogs.length === 0) {
      alert("No stock movement logs available to export.");
      return;
    }
    const unitSuffix = RATE_TYPE_SUFFIX[item?.rateType] || "units";
    const currentStockVal = item?.openingStock !== undefined ? item?.openingStock : item?.stock || 0;
    
    let report = `==================================================\n`;
    report += `       STOCK MOVEMENT AUDIT LOG REPORT            \n`;
    report += `==================================================\n`;
    report += `Item Name: ${item?.itemName || "N/A"}\n`;
    report += `Rate Type: ${RATE_TYPE_LABELS[item?.rateType] || item?.rateType || "Piece Rate"}\n`;
    report += `Current Stock: ${currentStockVal} ${unitSuffix}\n`;
    report += `Total Logs: ${logStats.totalLogs} | Total Inflow: +${logStats.totalInflow} | Total Outflow: -${logStats.totalOutflow} | Net: ${logStats.netChange >= 0 ? "+" : ""}${logStats.netChange} ${unitSuffix}\n`;
    report += `Report Date: ${new Date().toLocaleString()}\n`;
    report += `--------------------------------------------------\n\n`;

    stockLogs.forEach((log, idx) => {
      const dStr = log.date ? log.date.toLocaleString() : "N/A";
      const qStr = log.quantity > 0 ? `+${log.quantity}` : `${log.quantity}`;
      const userStr = log.createdBy ? ` (Recorded by: ${log.createdBy})` : "";
      report += `#${idx + 1} [${(log.type || "LOG").toUpperCase()}] - ${dStr}${userStr}\n`;
      report += `   Movement: ${qStr} ${unitSuffix}\n`;
      report += `   Stock Reconciliation: Previous ${log.previousStock} -> New ${log.newStock}\n`;
      if (log.notes) report += `   Notes: ${log.notes}\n`;
      report += `--------------------------------------------------\n`;
    });

    setExportContent(report);
    setCopiedExport(false);
    setExportModalVisible(true);
  };

  const specialCustomers = useMemo(() => {
    const list = [];
    (customers || []).forEach((c) => {
      if (c.isSpecial) {
        list.push({
          id: c.id,
          name: c.name || "Unnamed Customer",
          badgeText: null,
          badgeColor: colors.accent.primary,
          entityType: "customer",
        });
      }
    });
    (workers || []).forEach((w) => {
      if (w.isSpecial) {
        list.push({
          id: w.id,
          name: w.name || "Unnamed Worker",
          badgeText: "Worker",
          badgeColor: colors.accent.info,
          entityType: "worker",
        });
      }
    });
    (suppliers || []).forEach((s) => {
      if (s.isSpecial) {
        list.push({
          id: s.id,
          name: s.name || s.supplierName || "Unnamed Supplier",
          badgeText: "Supplier",
          badgeColor: colors.accent.warning,
          entityType: "supplier",
        });
      }
    });
    (partners || []).forEach((p) => {
      if (p.isSpecial) {
        list.push({
          id: p.id,
          name: p.name || "Unnamed Partner",
          badgeText: "Delivery Partner",
          badgeColor: "#9B51E0",
          entityType: "delivery_partner",
        });
      }
    });
    return list;
  }, [customers, workers, suppliers, partners, colors]);

  if (!item) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons
          name="error-outline"
          size={48}
          color={colors.accent.danger}
        />
        <Text style={styles.errorTitle}>Item Not Found</Text>
        <Text style={styles.errorDesc}>
          The item you are trying to view does not exist or has been deleted.
        </Text>
        <Pressable
          style={styles.backLink}
          onPress={() => router.push("/settings/items")}
        >
          <Text style={styles.backLinkText}>Return to Catalog</Text>
        </Pressable>
      </View>
    );
  }

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const ok = await deleteItem(item.id);
      setDeleteModalVisible(false);
      if (ok) {
        router.push("/settings/items");
      } else {
        alert("Failed to delete the item from database.");
      }
    } catch (e) {
      alert("An error occurred during deletion.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveSpecialRate = async (customerId) => {
    const rateValue = parseFloat(editingRateInput);
    if (isNaN(rateValue) || rateValue < 0) {
      alert("Please enter a valid rate.");
      return;
    }

    const currentSpecialRates = item.specialRates || {};
    const updatedRates = {
      ...currentSpecialRates,
      [customerId]: rateValue,
    };

    try {
      await updateItem(item.id, {
        specialRates: updatedRates,
      });
      setEditingCustomerId(null);
    } catch (e) {
      alert("Failed to save special rate.");
    }
  };

  const handleRemoveSpecialRate = async (customerId) => {
    const currentSpecialRates = { ...(item.specialRates || {}) };
    delete currentSpecialRates[customerId];

    try {
      await updateItem(item.id, {
        specialRates: currentSpecialRates,
      });
    } catch (e) {
      alert("Failed to remove special rate.");
    }
  };

  // Pricing calculations
  const sRate = Number(item.sellingRate || item.sellingPrice || 0);
  const cPrice = Number(item.costPrice || 0);
  const unitProfit = sRate - cPrice;
  const marginPercent = sRate > 0 ? (unitProfit / sRate) * 100 : 0;
  const markupPercent = cPrice > 0 ? (unitProfit / cPrice) * 100 : 0;

  const currentStock =
    item.openingStock !== undefined ? item.openingStock : item.stock || 0;
  const isLowStock = Number(currentStock) <= 5;
  const typeLabel = RATE_TYPE_LABELS[item.rateType] || "Piece Rate";
  const suffix = RATE_TYPE_SUFFIX[item.rateType] || "piece";

  let profitColor = "#5A5F72";
  if (unitProfit > 0)
    profitColor = "#10b981"; // green
  else if (unitProfit < 0) profitColor = "#ef4444"; // red

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header Navigation */}
      <View style={styles.header}>
        <BackButton
          label="Catalog"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/settings/items");
            }
          }}
        />
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.editAction,
              pressed && styles.buttonPressed,
            ]}
            onPress={() =>
              router.push({
                pathname: "/settings/items/edit",
                params: { itemId: item.id },
              })
            }
          >
            <MaterialIcons
              name="edit"
              size={18}
              color={colors.accent.primary}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.deleteAction,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => setDeleteModalVisible(true)}
          >
            <MaterialIcons
              name="delete"
              size={18}
              color={colors.accent.danger}
            />
          </Pressable>
        </View>
      </View>

      {/* Details Card */}
      <View style={styles.detailsCard}>
        <View style={styles.contentBody}>
          {/* Rate Type Tag */}
          <View style={styles.categoryRow}>
            <View
              style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
            >
              <Text style={styles.categoryTag}>{typeLabel}</Text>
              <Text
                style={[
                  styles.categoryTag,
                  item.itemType === "raw_material"
                    ? {
                        color: colors.accent.warning,
                        backgroundColor: "#fef3c7",
                      }
                    : {
                        color: colors.accent.primary,
                        backgroundColor: "#6C5CE720",
                      },
                ]}
              >
                {item.itemType === "raw_material"
                  ? "Raw Material"
                  : "Finished Product"}
              </Text>
              <View
                style={[
                  styles.categoryTag,
                  item.status === "Inactive"
                    ? {
                        color: colors.accent.danger,
                        backgroundColor: "#fef2f2",
                      }
                    : {
                        color: colors.accent.success,
                        backgroundColor: "#ecfdf5",
                      },
                  { flexDirection: "row", alignItems: "center", gap: 4 },
                ]}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      item.status === "Inactive"
                        ? "#ef4444"
                        : colors.accent.success,
                  }}
                />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color:
                      item.status === "Inactive"
                        ? "#ef4444"
                        : colors.accent.success,
                  }}
                >
                  {item.status || "Active"}
                </Text>
              </View>
            </View>
            {isLowStock ? (
              <View
                style={[styles.stockAlertBadge, { backgroundColor: "#fffbeb" }]}
              >
                <MaterialIcons name="warning" size={12} color="#ea580c" />
                <Text style={[styles.stockAlertText, { color: "#ea580c" }]}>
                  Low Stock Warn
                </Text>
              </View>
            ) : (
              <View
                style={[styles.stockAlertBadge, { backgroundColor: "#ecfdf5" }]}
              >
                <MaterialIcons name="check" size={12} color="#059669" />
                <Text style={[styles.stockAlertText, { color: "#059669" }]}>
                  Healthy Stock
                </Text>
              </View>
            )}
          </View>

          {/* Item Name */}
          <Text style={styles.itemName}>{item.itemName}</Text>

          {/* Key Metric Blocks */}
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Selling Rate</Text>
              <Text style={styles.metricValue}>
                {currencySymbol}
                {sRate.toFixed(2)}
                <Text style={styles.suffixText}> / {suffix}</Text>
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Opening Stock</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 4,
                  height: 24,
                }}
              >
                {isEditingOpeningStock ? (
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 4 }}>
                    <TextInput
                      style={{
                        flex: 1,
                        fontSize: 15,
                        fontWeight: "700",
                        color: colors.text.primary,
                        padding: 0,
                        borderBottomWidth: 1.5,
                        borderBottomColor: colors.accent.primary,
                      }}
                      value={openingStockInput}
                      onChangeText={setOpeningStockInput}
                      keyboardType="numeric"
                      autoFocus
                      onBlur={handleSaveInlineOpeningStock}
                      onSubmitEditing={handleSaveInlineOpeningStock}
                    />
                    {savingInlineStock ? (
                      <ActivityIndicator size="small" color={colors.accent.primary} />
                    ) : (
                      <>
                        <Pressable onPress={handleSaveInlineOpeningStock} style={{ padding: 2 }}>
                          <MaterialIcons name="check" size={16} color={colors.accent.success} />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setOpeningStockInput(String(currentStock));
                            setIsEditingOpeningStock(false);
                          }}
                          style={{ padding: 2 }}
                        >
                          <MaterialIcons name="close" size={16} color={colors.text.muted} />
                        </Pressable>
                      </>
                    )}
                  </View>
                ) : (
                  <Pressable
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      flex: 1,
                      height: "100%",
                    }}
                    onPress={() => setIsEditingOpeningStock(true)}
                  >
                    <Text
                      style={[
                        styles.metricValue,
                        { fontSize: 16, marginTop: 0 },
                        isLowStock && styles.lowStockText,
                      ]}
                    >
                      {currentStock} units
                    </Text>
                    <MaterialIcons
                      name="edit"
                      size={14}
                      color={colors.text.muted}
                    />
                  </Pressable>
                )}
              </View>
            </View>
            {item.itemType !== "raw_material" && (
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Units per Bag</Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 4,
                    height: 24,
                  }}
                >
                  {isEditingUnits ? (
                    <TextInput
                      style={{
                        flex: 1,
                        fontSize: 16,
                        fontWeight: "700",
                        color: colors.text.primary,
                        padding: 0,
                        borderBottomWidth: 1.5,
                        borderBottomColor: colors.accent.primary,
                      }}
                      value={unitsInput}
                      onChangeText={setUnitsInput}
                      keyboardType="numeric"
                      autoFocus
                      onBlur={handleSaveUnits}
                      onSubmitEditing={handleSaveUnits}
                    />
                  ) : (
                    <Pressable
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        flex: 1,
                        height: "100%",
                      }}
                      onPress={() => setIsEditingUnits(true)}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: colors.text.primary,
                        }}
                      >
                        {item.unitsPerBag !== undefined ? item.unitsPerBag : 50}
                      </Text>
                      <MaterialIcons
                        name="edit"
                        size={14}
                        color={colors.text.muted}
                      />
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Opening Stock Slot-Wise Breakdown */}
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Opening Stock & Slots</Text>
            <Pressable
              style={({ pressed }) => [styles.addLogBtn, pressed && { opacity: 0.6 }]}
              onPress={handleOpenSlotModal}
            >
              <MaterialIcons name="tune" size={14} color={colors.accent.primary} />
              <Text style={styles.addLogBtnText}>Manage Stock & Slots</Text>
            </Pressable>
          </View>

          {Array.isArray(item.openingStockSlots) && item.openingStockSlots.length > 0 ? (
            <View style={styles.slotsCardContainer}>
              {item.openingStockSlots.map((s, idx) => {
                const totalOpen = Number(currentStock) || 1;
                const slotQty = Number(s.quantity) || 0;
                const pct = totalOpen > 0 ? Math.min(100, Math.round((slotQty / totalOpen) * 100)) : 0;
                const totalSlots = item.openingStockSlots.length;
                const isFirst = idx === 0;
                const isLast = idx === totalSlots - 1 && totalSlots > 1;

                let badgeBg = "#f8fafc";
                let badgeBorder = "#cbd5e1";
                let badgeText = "#64748b";
                let badgeLabel = "o Neutral";

                if (isFirst) {
                  badgeBg = "#fef2f2";
                  badgeBorder = "#fecaca";
                  badgeText = "#dc2626";
                  badgeLabel = "- Bill (Dec)";
                } else if (isLast) {
                  badgeBg = "#ecfdf5";
                  badgeBorder = "#a7f3d0";
                  badgeText = "#059669";
                  badgeLabel = "+ Mfg (Inc)";
                }

                return (
                  <View key={s.id || idx} style={styles.slotCardRow}>
                    <View style={styles.slotCardHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <MaterialIcons name="dns" size={16} color={colors.accent.primary} />
                        <Text style={styles.slotCardTitle}>{s.slotName || `Slot ${idx + 1}`}</Text>
                        <View
                          style={{
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 6,
                            backgroundColor: badgeBg,
                            borderWidth: 1,
                            borderColor: badgeBorder,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "700", color: badgeText }}>
                            {badgeLabel}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.slotCardQty}>
                        {slotQty} units <Text style={styles.slotCardPct}>({pct}%)</Text>
                      </Text>
                    </View>
                    <View style={styles.slotProgressBarTrack}>
                      <View style={[styles.slotProgressBarFill, { width: `${pct}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptySlotCard}>
              <MaterialIcons name="inventory-2" size={24} color={colors.accent.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.emptySlotText, { fontWeight: "600", color: colors.text.primary }]}>
                  {Number(currentStock) === 0 ? "Opening Stock: 0 units" : `Single Slot (${currentStock} units)`}
                </Text>
                <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                  {Number(currentStock) === 0 
                    ? "Set initial opening stock or configure slot allocation." 
                    : "Stock is recorded as a single total. Split across slots to track specific racks or roles."}
                </Text>
              </View>
              <Pressable style={styles.splitSlotBtn} onPress={handleOpenSlotModal}>
                <MaterialIcons name={Number(currentStock) === 0 ? "add-box" : "call-split"} size={14} color={colors.accent.primary} />
                <Text style={styles.splitSlotBtnText}>
                  {Number(currentStock) === 0 ? "Set Stock" : "Manage Slots"}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Pricing Margin Analytics */}
          <Text style={styles.sectionTitle}>Markup & Profit Analytics</Text>
          <View style={styles.profitDashboard}>
            <View style={styles.dashRow}>
              <Text style={styles.dashLabel}>Unit Cost Price</Text>
              <Text style={styles.dashVal}>
                {currencySymbol}
                {cPrice.toFixed(2)}
              </Text>
            </View>
            <View style={styles.dashRow}>
              <Text style={styles.dashLabel}>Gross Profit (per {suffix})</Text>
              <Text
                style={[
                  styles.dashVal,
                  { color: profitColor, fontWeight: "700" },
                ]}
              >
                {unitProfit >= 0 ? "+" : ""}
                {currencySymbol}
                {unitProfit.toFixed(2)}
              </Text>
            </View>
            <View style={styles.dashRow}>
              <Text style={styles.dashLabel}>Profit Margin</Text>
              <Text
                style={[
                  styles.dashVal,
                  { color: profitColor, fontWeight: "700" },
                ]}
              >
                {marginPercent.toFixed(1)}%
              </Text>
            </View>
            <View style={styles.dashRow}>
              <Text style={styles.dashLabel}>Cost Markup Percentage</Text>
              <Text
                style={[
                  styles.dashVal,
                  { color: profitColor, fontWeight: "700" },
                ]}
              >
                {markupPercent.toFixed(1)}%
              </Text>
            </View>
          </View>

          {/* Description */}
          <Text style={styles.sectionTitle}>Description & Notes</Text>
          <Text style={styles.description}>
            {item.description ||
              "No description or notes recorded for this product."}
          </Text>

          {/* Special Customer Rates System */}
          <Text style={styles.sectionTitle}>Special Customer Rates</Text>
          {specialCustomers.length === 0 ? (
            <View style={styles.emptySpecialCard}>
              <MaterialIcons name="stars" size={24} color={colors.text.muted} />
              <Text style={styles.emptySpecialText}>
                No special customers registered. Mark customers as Special Customer in their profile to set custom rates.
              </Text>
            </View>
          ) : (
            <View style={styles.specialRatesContainer}>
              {specialCustomers.map((cust) => {
                const specialRate = item.specialRates?.[cust.id];
                const isEditing = editingCustomerId === cust.id;

                return (
                  <View key={cust.id} style={styles.specialRateRow}>
                    <View style={styles.specialCustomerInfo}>
                      <MaterialIcons name="stars" size={16} color="#D97706" style={{ flexShrink: 0 }} />
                      <Text style={styles.specialCustomerName} numberOfLines={1}>{cust.name}</Text>
                      {cust.badgeText && (
                        <View style={{
                          backgroundColor: `${cust.badgeColor || colors.accent.primary}18`,
                          borderColor: `${cust.badgeColor || colors.accent.primary}40`,
                          borderWidth: 1,
                          borderRadius: 6,
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                          marginLeft: 4,
                          flexShrink: 0,
                        }}>
                          <Text style={{ fontSize: 9.5, fontWeight: "800", color: cust.badgeColor || colors.accent.primary }}>
                            {cust.badgeText}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.specialRateActions}>
                      {isEditing ? (
                        <View style={styles.specialRateInputRow}>
                          <Text style={styles.rateCurrencySymbol}>{currencySymbol}</Text>
                          <TextInput
                            style={styles.specialRateInput}
                            value={editingRateInput}
                            onChangeText={setEditingRateInput}
                            keyboardType="numeric"
                            placeholder="0.00"
                            placeholderTextColor={colors.text.muted}
                            autoFocus
                          />
                          <Pressable
                            style={styles.specialRateSaveBtn}
                            onPress={() => handleSaveSpecialRate(cust.id)}
                          >
                            <MaterialIcons name="check" size={16} color={colors.accent.success} />
                          </Pressable>
                          <Pressable
                            style={styles.specialRateCancelBtn}
                            onPress={() => setEditingCustomerId(null)}
                          >
                            <MaterialIcons name="close" size={16} color={colors.accent.danger} />
                          </Pressable>
                        </View>
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Text style={styles.specialRateText}>
                            {specialRate !== undefined 
                              ? `${currencySymbol}${Number(specialRate).toFixed(2)}`
                              : "Default Rate"}
                          </Text>
                          <Pressable
                            style={styles.specialRateEditBtn}
                            onPress={() => {
                              setEditingCustomerId(cust.id);
                              setEditingRateInput(specialRate !== undefined ? String(specialRate) : "");
                            }}
                          >
                            <MaterialIcons name="edit" size={16} color={colors.accent.primary} />
                          </Pressable>
                          {specialRate !== undefined && (
                            <Pressable
                              style={styles.specialRateDeleteBtn}
                              onPress={() => handleRemoveSpecialRate(cust.id)}
                            >
                              <MaterialIcons name="delete-outline" size={16} color={colors.accent.danger} />
                            </Pressable>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Status Selection (Option Button) */}
          <Text style={styles.sectionTitle}>Product Status</Text>
          <View style={styles.statusSegmentRow}>
            {["Active", "Inactive"].map((s) => {
              const isActive = (item.status || "Active") === s;
              const activeBg = s === "Active" ? "#ecfdf5" : "#fef2f2";
              const activeBorder =
                s === "Active" ? "#10b981" : colors.accent.danger;
              const activeText =
                s === "Active" ? "#059669" : colors.accent.danger;

              return (
                <Pressable
                  key={s}
                  style={[
                    styles.mediumStatusBtn,
                    isActive && {
                      backgroundColor: activeBg,
                      borderColor: activeBorder,
                    },
                  ]}
                  onPress={async () => {
                    if ((item.status || "Active") !== s) {
                      try {
                        if (item.itemType !== "raw_material") {
                          if (s === "Active") {
                            // Deactivate all other active finished products first
                            const activeProducts = items.filter(
                              (i) =>
                                i.itemType !== "raw_material" &&
                                (i.status || "Active") === "Active" &&
                                i.id !== item.id,
                            );
                            for (const actProd of activeProducts) {
                              await updateItem(actProd.id, {
                                status: "Inactive",
                              });
                            }
                          } else {
                            // User is trying to deactivate this product.
                            // Check if there are other active finished products.
                            const otherActiveProducts = items.filter(
                              (i) =>
                                i.itemType !== "raw_material" &&
                                (i.status || "Active") === "Active" &&
                                i.id !== item.id,
                            );
                            if (otherActiveProducts.length === 0) {
                              alert(
                                "At least one finished product must remain active.",
                              );
                              return;
                            }
                          }
                        }
                        await updateItem(item.id, { status: s });
                      } catch (e) {
                        alert("Failed to update status.");
                      }
                    }
                  }}
                >
                  <MaterialIcons
                    name={s === "Active" ? "check-circle" : "cancel"}
                    size={16}
                    color={isActive ? activeText : colors.text.muted}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.mediumStatusBtnText,
                      isActive && { color: activeText, fontWeight: "700" },
                    ]}
                  >
                    {s}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Stock History Section */}
          <View style={styles.sectionTitleRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.sectionTitle}>Stock Movement Audit Log</Text>
              <View style={{ backgroundColor: colors.accent.primary + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary }}>
                  {logStats.totalLogs}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Pressable
                style={({ pressed }) => [styles.exportLogBtn, pressed && { opacity: 0.6 }]}
                onPress={handleExportLogs}
              >
                <MaterialIcons name="file-download" size={14} color={colors.text.secondary} />
                <Text style={styles.exportLogBtnText}>Export</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.addLogBtn, pressed && { opacity: 0.6 }]}
                onPress={handleOpenAddLog}
              >
                <MaterialIcons name="add" size={14} color={colors.accent.primary} />
                <Text style={styles.addLogBtnText}>Add Log</Text>
              </Pressable>
            </View>
          </View>

          {/* Audit Metrics Banner with Total Production & Sales */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={[styles.auditMetricCard, { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", minWidth: 100 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons name="precision-manufacturing" size={14} color="#059669" />
                  <Text style={[styles.metricCardLabel, { color: "#047857" }]}>Production</Text>
                </View>
                <Text style={[styles.metricCardValue, { color: "#059669" }]}>+{logStats.totalProduction}</Text>
              </View>

              <View style={[styles.auditMetricCard, { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", minWidth: 100 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons name="shopping-cart" size={14} color="#2563eb" />
                  <Text style={[styles.metricCardLabel, { color: "#1d4ed8" }]}>Sales</Text>
                </View>
                <Text style={[styles.metricCardValue, { color: "#2563eb" }]}>{logStats.totalSales}</Text>
              </View>

              <View style={[styles.auditMetricCard, { minWidth: 100 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons name="arrow-upward" size={14} color="#059669" />
                  <Text style={styles.metricCardLabel}>Inflow</Text>
                </View>
                <Text style={[styles.metricCardValue, { color: "#059669" }]}>+{logStats.totalInflow}</Text>
              </View>

              <View style={[styles.auditMetricCard, { minWidth: 100 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons name="arrow-downward" size={14} color="#dc2626" />
                  <Text style={styles.metricCardLabel}>Outflow</Text>
                </View>
                <Text style={[styles.metricCardValue, { color: "#dc2626" }]}>-{logStats.totalOutflow}</Text>
              </View>

              <View style={[styles.auditMetricCard, { minWidth: 100 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons name="swap-vert" size={14} color={logStats.netChange >= 0 ? "#059669" : "#dc2626"} />
                  <Text style={styles.metricCardLabel}>Net Change</Text>
                </View>
                <Text style={[styles.metricCardValue, { color: logStats.netChange >= 0 ? "#059669" : "#dc2626" }]}>
                  {logStats.netChange >= 0 ? `+${logStats.netChange}` : logStats.netChange}
                </Text>
              </View>

              <View style={[styles.auditMetricCard, { minWidth: 100 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons name="history" size={14} color={colors.text.muted} />
                  <Text style={styles.metricCardLabel}>Logs</Text>
                </View>
                <Text style={styles.metricCardValue}>{logStats.totalLogs}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Audit Search and Filter Controls */}
          <View style={styles.auditFilterContainer}>
            {/* Date Period Filter Pills Row */}
            <View style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.muted, marginBottom: 4, textTransform: "uppercase" }}>
                Time Period Filter
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {[
                  { key: "all", label: "All Time" },
                  { key: "today", label: "Day (Today)" },
                  { key: "week", label: "This Week" },
                  { key: "month", label: "This Month" },
                  { key: "year", label: "This Year" },
                  { key: "custom", label: "Custom Range" },
                ].map((preset) => {
                  const isSel = logDatePreset === preset.key;
                  return (
                    <Pressable
                      key={preset.key}
                      style={[
                        styles.filterChip,
                        isSel && { backgroundColor: "#059669", borderColor: "#059669" },
                      ]}
                      onPress={() => {
                        setLogDatePreset(preset.key);
                        if (preset.key === "custom" && !logStartDate) {
                          setLogStartDate(new Date());
                        }
                      }}
                    >
                      <Text style={[styles.filterChipText, isSel && { color: "#ffffff", fontWeight: "700" }]}>
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Custom Date Pickers Bar */}
              {logDatePreset === "custom" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, backgroundColor: colors.bg.primary, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border.subtle }}>
                  <Pressable
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bg.card, paddingHorizontal: 10, height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.border.medium }}
                    onPress={() => {
                      setLogCalendarMode("start");
                      setIsLogCalendarOpen(true);
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text.primary }}>
                      {logStartDate ? logStartDate.toLocaleDateString("en-IN") : "Start Date"}
                    </Text>
                    <MaterialIcons name="event" size={16} color={colors.text.muted} />
                  </Pressable>

                  <Text style={{ fontSize: 12, color: colors.text.muted, fontWeight: "600" }}>to</Text>

                  <Pressable
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bg.card, paddingHorizontal: 10, height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.border.medium }}
                    onPress={() => {
                      setLogCalendarMode("end");
                      setIsLogCalendarOpen(true);
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text.primary }}>
                      {logEndDate ? logEndDate.toLocaleDateString("en-IN") : "End Date"}
                    </Text>
                    <MaterialIcons name="event" size={16} color={colors.text.muted} />
                  </Pressable>

                  {(logStartDate || logEndDate) && (
                    <Pressable
                      onPress={() => {
                        setLogStartDate(null);
                        setLogEndDate(null);
                      }}
                      style={{ padding: 6 }}
                    >
                      <MaterialIcons name="cancel" size={18} color={colors.accent.danger} />
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* Search Input Bar */}
            <View style={styles.auditSearchBox}>
              <MaterialIcons name="search" size={16} color={colors.text.muted} />
              <TextInput
                style={styles.auditSearchInput}
                value={logSearchQuery}
                onChangeText={setLogSearchQuery}
                placeholder="Search notes, type, author..."
                placeholderTextColor={colors.text.muted}
              />
              {logSearchQuery.length > 0 && (
                <Pressable onPress={() => setLogSearchQuery("")} style={{ padding: 2 }}>
                  <MaterialIcons name="cancel" size={16} color={colors.text.muted} />
                </Pressable>
              )}
            </View>

            {/* Filter Pills Row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {["All", "adjustment", "sale", "production", "purchase", "consumption", "rollback"].map((typeKey) => {
                const isSelected = logTypeFilter === typeKey;
                const labelText = typeKey === "All" ? "All Types" : (LOG_TYPE_CONFIG[typeKey]?.label || typeKey);
                return (
                  <Pressable
                    key={typeKey}
                    style={[
                      styles.filterChip,
                      isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary }
                    ]}
                    onPress={() => setLogTypeFilter(typeKey)}
                  >
                    <Text style={[styles.filterChipText, isSelected && { color: "#ffffff", fontWeight: "700" }]}>
                      {labelText}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Sub-Filters: Direction & Sorting */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                {[
                  { value: "All", label: "All Direction" },
                  { value: "inflow", label: "+ Inflow" },
                  { value: "outflow", label: "- Outflow" },
                ].map((d) => {
                  const isSel = logDirectionFilter === d.value;
                  return (
                    <Pressable
                      key={d.value}
                      style={[
                        styles.dirChip,
                        isSel && d.value === "inflow" && { backgroundColor: "#ecfdf5", borderColor: "#059669" },
                        isSel && d.value === "outflow" && { backgroundColor: "#fef2f2", borderColor: "#dc2626" },
                        isSel && d.value === "All" && { backgroundColor: colors.accent.primary + "15", borderColor: colors.accent.primary },
                      ]}
                      onPress={() => setLogDirectionFilter(d.value)}
                    >
                      <Text
                        style={[
                          styles.dirChipText,
                          isSel && d.value === "inflow" && { color: "#059669", fontWeight: "700" },
                          isSel && d.value === "outflow" && { color: "#dc2626", fontWeight: "700" },
                          isSel && d.value === "All" && { color: colors.accent.primary, fontWeight: "700" },
                        ]}
                      >
                        {d.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Sort Toggle Button */}
              <Pressable
                style={({ pressed }) => [styles.sortOrderBtn, pressed && { opacity: 0.6 }]}
                onPress={() => setLogSortOrder((prev) => (prev === "newest" ? "oldest" : "newest"))}
              >
                <MaterialIcons name="swap-vert" size={14} color={colors.text.secondary} />
                <Text style={styles.sortOrderBtnText}>
                  {logSortOrder === "newest" ? "Newest First" : "Oldest First"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Audit Logs List */}
          {loadingLogs ? (
            <View style={{ paddingVertical: 30, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.accent.primary} />
            </View>
          ) : filteredStockLogs.length === 0 ? (
            <View style={styles.emptyAuditState}>
              <MaterialIcons name="history-toggle-off" size={32} color={colors.text.muted} />
              <Text style={styles.emptyAuditTitle}>No Audit Logs Found</Text>
              <Text style={styles.emptyAuditDesc}>
                {stockLogs.length === 0
                  ? "No stock movement logs recorded for this item yet."
                  : "No stock logs match your active filters or search parameters."}
              </Text>
              {(logSearchQuery !== "" || logTypeFilter !== "All" || logDirectionFilter !== "All" || logDatePreset !== "all") && (
                <Pressable
                  style={styles.resetFiltersBtn}
                  onPress={() => {
                    setLogSearchQuery("");
                    setLogTypeFilter("All");
                    setLogDirectionFilter("All");
                    setLogDatePreset("all");
                    setLogStartDate(null);
                    setLogEndDate(null);
                  }}
                >
                  <Text style={styles.resetFiltersBtnText}>Reset All Filters</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.logsList}>
              {filteredStockLogs.map((log) => {
                const dateStr = log.date ? log.date.toLocaleDateString() : "N/A";
                const timeStr = log.date ? log.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                const isPositive = log.quantity > 0;
                const qtyText = isPositive ? `+${log.quantity}` : `${log.quantity}`;
                const qtyColor = isPositive ? "#059669" : "#dc2626";
                const rateSuffix = RATE_TYPE_SUFFIX[item?.rateType] || "units";

                const config = LOG_TYPE_CONFIG[log.type] || {
                  label: (log.type || "MOVEMENT").toUpperCase(),
                  icon: "swap-vert",
                  color: colors.text.secondary,
                  bg: colors.bg.primary,
                };

                return (
                  <View key={log.id} style={styles.logItemCard}>
                    <View style={styles.logItemHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        <View style={[styles.logTypeBadge, { backgroundColor: config.bg }]}>
                          <MaterialIcons name={config.icon} size={14} color={config.color} />
                          <Text style={[styles.logTypeBadgeText, { color: config.color }]}>
                            {config.label}
                          </Text>
                        </View>
                        <Text style={styles.logTimeText}>
                          {dateStr} • {timeStr}
                        </Text>
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Text style={[styles.logQtyText, { color: qtyColor }]}>
                          {qtyText} {rateSuffix}
                        </Text>
                        {log.type !== "initial" && (
                          <View style={styles.logActions}>
                            <Pressable
                              style={({ pressed }) => [styles.logActionBtn, pressed && { opacity: 0.6 }]}
                              onPress={() => handleOpenEditLog(log)}
                            >
                              <MaterialIcons name="edit" size={14} color={colors.text.secondary} />
                            </Pressable>
                            <Pressable
                              style={({ pressed }) => [styles.logActionBtn, pressed && { opacity: 0.6 }]}
                              onPress={() => handleConfirmDeleteLog(log)}
                            >
                              <MaterialIcons name="delete" size={14} color={colors.accent.danger} />
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Stock Flow Reconciliation Pill */}
                    <View style={styles.logFlowRow}>
                      <View style={styles.flowPill}>
                        <Text style={styles.flowPillText}>
                          Prev: <Text style={{ fontWeight: "700" }}>{log.previousStock}</Text> ➔ New: <Text style={{ fontWeight: "700", color: colors.accent.primary }}>{log.newStock}</Text>
                        </Text>
                      </View>
                      {log.createdBy && (
                        <View style={styles.userTag}>
                          <MaterialIcons name="person-outline" size={12} color={colors.text.muted} />
                          <Text style={styles.userTagText}>{log.createdBy}</Text>
                        </View>
                      )}
                    </View>

                    {log.notes ? (
                      <View style={styles.logNotesBox}>
                        <Text style={styles.logNotesText}>{log.notes}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          {/* Metadata info */}
          <View style={styles.divider} />
          <View style={styles.metaInfo}>
            <Text style={styles.metaText}>
              Catalog Created:{" "}
              {item.createdAt
                ? new Date(item.createdAt).toLocaleDateString()
                : "N/A"}
            </Text>
            <Text style={styles.metaText}>
              Last Updated:{" "}
              {item.updatedAt
                ? new Date(item.updatedAt).toLocaleDateString()
                : "N/A"}
            </Text>
          </View>
        </View>
      </View>

      {/* Delete confirmation modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconWrapper}>
              <MaterialIcons
                name="warning"
                size={32}
                color={colors.accent.danger}
              />
            </View>
            <Text style={styles.modalTitle}>Delete Product?</Text>
            <Text style={styles.modalDesc}>
              This will permanently delete &quot;{item.itemName}&quot; from your
              database inventory catalog. This action is irreversible.
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => !deleting && setDeleteModalVisible(false)}
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
                  <Text style={styles.modalDeleteBtnText}>Yes, Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Upgraded Add/Edit Log Modal */}
      <Modal visible={logModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxWidth: 420, alignItems: "stretch" }]}>
            <Text style={[styles.modalTitle, { alignSelf: "center", marginBottom: 12 }]}>
              {logModalMode === "add" ? "Add Stock Movement Log" : "Edit Stock Movement Log"}
            </Text>

            {/* Direction Switch Tabs */}
            <Text style={styles.inputLabel}>Direction</Text>
            <View style={styles.directionTabs}>
              <Pressable
                style={[
                  styles.directionTabBtn,
                  logDirectionMode === "add" && { backgroundColor: "#ecfdf5", borderColor: "#059669" }
                ]}
                onPress={() => setLogDirectionMode("add")}
              >
                <MaterialIcons name="arrow-upward" size={16} color={logDirectionMode === "add" ? "#059669" : colors.text.muted} />
                <Text style={[styles.directionTabBtnText, logDirectionMode === "add" && { color: "#059669", fontWeight: "700" }]}>
                  + Add Stock (Inflow)
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.directionTabBtn,
                  logDirectionMode === "deduct" && { backgroundColor: "#fef2f2", borderColor: "#dc2626" }
                ]}
                onPress={() => setLogDirectionMode("deduct")}
              >
                <MaterialIcons name="arrow-downward" size={16} color={logDirectionMode === "deduct" ? "#dc2626" : colors.text.muted} />
                <Text style={[styles.directionTabBtnText, logDirectionMode === "deduct" && { color: "#dc2626", fontWeight: "700" }]}>
                  - Deduct Stock (Outflow)
                </Text>
              </Pressable>
            </View>
            
            {/* Movement Type Selection */}
            <Text style={styles.inputLabel}>Movement Reason / Type</Text>
            <View style={styles.typeGrid}>
              {[
                { value: "adjustment", label: "Adjustment", icon: "edit", defaultDir: "add" },
                { value: "sale", label: "Sale", icon: "shopping-cart", defaultDir: "deduct" },
                { value: "production", label: "Production", icon: "build", defaultDir: "add" },
                { value: "purchase", label: "Purchase", icon: "add-shopping-cart", defaultDir: "add" },
                { value: "consumption", label: "Consumption", icon: "trending-down", defaultDir: "deduct" },
                { value: "rollback", label: "Rollback", icon: "history", defaultDir: "add" },
              ].map((t) => {
                const isSelected = logType === t.value;
                return (
                  <Pressable
                    key={t.value}
                    style={[
                      styles.typeGridBtn,
                      isSelected && {
                        backgroundColor: colors.accent.primary + "15",
                        borderColor: colors.accent.primary,
                      },
                    ]}
                    onPress={() => {
                      setLogType(t.value);
                      setLogDirectionMode(t.defaultDir);
                    }}
                  >
                    <MaterialIcons
                      name={t.icon}
                      size={14}
                      color={isSelected ? colors.accent.primary : colors.text.secondary}
                    />
                    <Text
                      style={[
                        styles.typeGridBtnText,
                        isSelected && { color: colors.accent.primary, fontWeight: "700" },
                      ]}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Quantity Input */}
            <Text style={styles.inputLabel}>
              Quantity ({logDirectionMode === "add" ? "+" : "-"}) [{RATE_TYPE_SUFFIX[item?.rateType] || "units"}]
            </Text>
            <TextInput
              style={styles.modalTextInput}
              value={logQuantity}
              onChangeText={(val) => setLogQuantity(val.replace(/[^0-9.]/g, ""))}
              placeholder="Enter quantity value..."
              keyboardType="numeric"
              placeholderTextColor={colors.text.muted}
            />

            {/* Quick Quantity Presets */}
            <View style={styles.presetRow}>
              {[5, 10, 50, 100, 250, 500].map((presetVal) => (
                <Pressable
                  key={presetVal}
                  style={styles.presetChip}
                  onPress={() => setLogQuantity(String(presetVal))}
                >
                  <Text style={styles.presetChipText}>
                    {logDirectionMode === "add" ? `+${presetVal}` : `-${presetVal}`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Live Stock Calculation Reconciliation Box */}
            {(() => {
              const curStk = Number(item?.openingStock !== undefined ? item?.openingStock : item?.stock || 0);
              const qVal = Math.abs(Number(logQuantity) || 0);
              const changeSigned = logDirectionMode === "deduct" ? -qVal : qVal;
              const resultStk = curStk + changeSigned;
              const isZeroChange = qVal === 0;

              return (
                <View style={styles.reconcileBox}>
                  <View style={styles.reconcileRow}>
                    <Text style={styles.reconcileLabel}>Current Stock:</Text>
                    <Text style={styles.reconcileVal}>{curStk}</Text>
                  </View>
                  <View style={styles.reconcileRow}>
                    <Text style={styles.reconcileLabel}>Adjustment:</Text>
                    <Text style={[styles.reconcileVal, { color: isZeroChange ? colors.text.muted : changeSigned >= 0 ? "#059669" : "#dc2626" }]}>
                      {changeSigned > 0 ? `+${changeSigned}` : changeSigned}
                    </Text>
                  </View>
                  <View style={[styles.reconcileRow, { borderTopWidth: 1, borderTopColor: colors.border.subtle, paddingTop: 4, marginTop: 4 }]}>
                    <Text style={[styles.reconcileLabel, { fontWeight: "700" }]}>Resulting Stock:</Text>
                    <Text style={[styles.reconcileVal, { fontWeight: "700", color: colors.accent.primary }]}>
                      {resultStk}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Quick Reason Chips */}
            <Text style={styles.inputLabel}>Quick Description Shortcut</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 8 }}>
              {[
                "Physical Inventory Audit",
                "Damaged / Waste",
                "Supplier Shipment Intake",
                "Customer Order Return",
                "Internal Usage",
                "Manual Production Entry"
              ].map((reasonText) => (
                <Pressable
                  key={reasonText}
                  style={styles.reasonChip}
                  onPress={() => setLogNotes(reasonText)}
                >
                  <Text style={styles.reasonChipText}>{reasonText}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Notes Input */}
            <Text style={styles.inputLabel}>Additional Notes / Reason</Text>
            <TextInput
              style={[styles.modalTextInput, { height: 60, textAlignVertical: "top" }]}
              value={logNotes}
              onChangeText={setLogNotes}
              placeholder="Enter optional description or audit reference..."
              multiline
              placeholderTextColor={colors.text.muted}
            />

            <View style={[styles.modalActions, { marginTop: 12 }]}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => !savingLog && setLogModalVisible(false)}
                disabled={savingLog}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.accent.primary }]}
                onPress={handleSaveLog}
                disabled={savingLog}
              >
                {savingLog ? (
                  <ActivityIndicator size="small" color={colors.bg.card} />
                ) : (
                  <Text style={{ color: colors.bg.card, fontWeight: "700" }}>Save Log</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Export Report Modal */}
      <Modal visible={exportModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxWidth: 480, maxHeight: "80%", alignItems: "stretch" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="file-download" size={22} color={colors.accent.primary} />
                <Text style={[styles.modalTitle, { marginBottom: 0 }]}>Stock Audit Report</Text>
              </View>
              <Pressable onPress={() => setExportModalVisible(false)}>
                <MaterialIcons name="close" size={20} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView style={{ backgroundColor: colors.bg.primary, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: colors.border.subtle }}>
              <Text style={{ fontFamily: "monospace", fontSize: 11, color: colors.text.primary, lineHeight: 16 }}>
                {exportContent}
              </Text>
            </ScrollView>

            <View style={[styles.modalActions, { marginTop: 16 }]}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setExportModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Close</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: copiedExport ? "#059669" : colors.accent.primary, flexDirection: "row", gap: 6, alignItems: "center" }]}
                onPress={() => {
                  setCopiedExport(true);
                  alert("Audit log report contents ready! You can select and copy the text report.");
                }}
              >
                <MaterialIcons name={copiedExport ? "check" : "content-copy"} size={16} color="#ffffff" />
                <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                  {copiedExport ? "Copied Report" : "Copy Report"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Log Confirmation Modal */}
      <Modal visible={deleteLogModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconWrapper}>
              <MaterialIcons
                name="warning"
                size={32}
                color={colors.accent.danger}
              />
            </View>
            <Text style={styles.modalTitle}>Delete Stock Log?</Text>
            <Text style={styles.modalDesc}>
              This will permanently delete this stock movement log. The item&apos;s stock will be adjusted back to reconcile the change.
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => !deletingLog && setDeleteLogModalVisible(false)}
                disabled={deletingLog}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalDeleteBtn]}
                onPress={handleDeleteLog}
                disabled={deletingLog}
              >
                {deletingLog ? (
                  <ActivityIndicator size="small" color={colors.bg.card} />
                ) : (
                  <Text style={styles.modalDeleteBtnText}>Yes, Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manage Opening Stock & Slots Modal */}
      <Modal visible={slotModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxWidth: 440, alignItems: "stretch" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>
                Opening Stock & Slots
              </Text>
              <Pressable onPress={() => !savingSlots && setSlotModalVisible(false)} style={{ padding: 4 }}>
                <MaterialIcons name="close" size={20} color={colors.text.muted} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
              Set opening stock and slot allocation for {item?.itemName}
            </Text>

            {/* Total Opening Stock Input Card */}
            <View
              style={{
                backgroundColor: colors.bg.primary,
                borderWidth: 1,
                borderColor: colors.border.subtle,
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.secondary, textTransform: "uppercase", marginBottom: 6 }}>
                Total Opening Stock (Units)
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  style={[
                    styles.modalTextInput,
                    {
                      flex: 1,
                      fontSize: 16,
                      fontWeight: "700",
                      color: colors.text.primary,
                      backgroundColor: colors.bg.card,
                      borderColor: colors.accent.primary,
                    },
                  ]}
                  value={modalOpeningStock}
                  onChangeText={handleModalOpeningStockChange}
                  placeholder="0"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  editable={!savingSlots}
                />
                <Pressable
                  style={{
                    backgroundColor: colors.accent.primary + "15",
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.accent.primary + "30",
                  }}
                  onPress={handleAutoBalanceSlots}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary }}>
                    Auto-Balance
                  </Text>
                </Pressable>
              </View>

              {/* Quick Helper Tools */}
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                <Pressable
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    paddingVertical: 5,
                    borderRadius: 6,
                    backgroundColor: colors.bg.card,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                  }}
                  onPress={handleDistributeEvenly}
                >
                  <MaterialIcons name="view-column" size={13} color={colors.text.secondary} />
                  <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.secondary }}>
                    Split Evenly
                  </Text>
                </Pressable>
                <Pressable
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    paddingVertical: 5,
                    borderRadius: 6,
                    backgroundColor: colors.bg.card,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                  }}
                  onPress={handleResetToSingleSlot}
                >
                  <MaterialIcons name="crop-square" size={13} color={colors.text.secondary} />
                  <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.secondary }}>
                    Single Slot
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Allocation Status Indicator */}
            {(() => {
              const targetStock = parseInt(modalOpeningStock, 10) || 0;
              const allocatedSum = editingSlots.reduce((acc, cur) => acc + (parseInt(cur.quantity, 10) || 0), 0);
              const diff = targetStock - allocatedSum;

              let badgeBg = "#ecfdf5";
              let badgeBorder = "#10b981";
              let badgeText = "#059669";
              let statusLabel = "Balanced";
              let iconName = "check-circle";

              if (diff > 0) {
                badgeBg = "#fffbeb";
                badgeBorder = "#f59e0b";
                badgeText = "#d97706";
                statusLabel = `${diff} units unallocated`;
                iconName = "info";
              } else if (diff < 0) {
                badgeBg = "#fef2f2";
                badgeBorder = "#ef4444";
                badgeText = "#dc2626";
                statusLabel = `${Math.abs(diff)} units over allocated`;
                iconName = "warning";
              }

              return (
                <View
                  style={{
                    backgroundColor: badgeBg,
                    borderWidth: 1,
                    borderColor: badgeBorder,
                    borderRadius: 10,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    marginBottom: 10,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <MaterialIcons name={iconName} size={15} color={badgeText} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: badgeText }}>
                      {statusLabel}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.primary }}>
                    Slots: {allocatedSum} / {targetStock}
                  </Text>
                </View>
              );
            })()}

            {/* Slot List */}
            <ScrollView style={{ maxHeight: 220 }}>
              {editingSlots.map((slot, index) => {
                const total = editingSlots.length;
                const isFirst = index === 0;
                const isLast = index === total - 1 && total > 1;

                let btnBg = "#f8fafc";
                let btnBorder = "#cbd5e1";
                let btnText = "#64748b";
                let btnLabel = "o Neutral";

                if (isFirst) {
                  btnBg = "#fef2f2";
                  btnBorder = "#ef4444";
                  btnText = "#dc2626";
                  btnLabel = "- Bill";
                } else if (isLast) {
                  btnBg = "#ecfdf5";
                  btnBorder = "#10b981";
                  btnText = "#059669";
                  btnLabel = "+ Mfg";
                }

                return (
                  <View key={slot.id} style={styles.slotRow}>
                    <View style={{ flex: 1.8 }}>
                      <Text style={styles.slotLabel}>Slot Name #{index + 1}</Text>
                      <TextInput
                        style={styles.modalTextInput}
                        value={slot.slotName}
                        onChangeText={(txt) => handleSlotNameChangeInModal(slot.id, txt)}
                        placeholder="e.g. Slot 1, Rack A"
                        placeholderTextColor={colors.text.muted}
                        editable={!savingSlots}
                      />
                    </View>
                    <View style={{ flex: 1.2, marginLeft: 6 }}>
                      <Text style={styles.slotLabel}>Quantity</Text>
                      <TextInput
                        style={styles.modalTextInput}
                        value={slot.quantity}
                        onChangeText={(txt) => handleSlotQtyChangeInModal(slot.id, txt)}
                        placeholder="Qty"
                        placeholderTextColor={colors.text.muted}
                        keyboardType="numeric"
                        editable={!savingSlots}
                      />
                    </View>
                    <View style={{ marginLeft: 6, justifyContent: "flex-end" }}>
                      <Text style={styles.slotLabel}>Role</Text>
                      <View
                        style={[
                          styles.slotRoleBtn,
                          { backgroundColor: btnBg, borderColor: btnBorder },
                        ]}
                      >
                        <Text style={[styles.slotRoleBtnText, { color: btnText }]}>
                          {btnLabel}
                        </Text>
                      </View>
                    </View>
                    {editingSlots.length > 1 && (
                      <Pressable
                        style={styles.removeSlotBtn}
                        onPress={() => handleRemoveSlotInModal(slot.id)}
                      >
                        <MaterialIcons name="remove-circle-outline" size={22} color={colors.accent.danger} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <Pressable style={styles.addSlotBtn} onPress={handleAddSlotInModal}>
              <MaterialIcons name="add" size={16} color={colors.accent.primary} />
              <Text style={styles.addSlotBtnText}>Add Another Slot</Text>
            </Pressable>

            {/* Optional Change / Audit Note */}
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.slotLabel, { marginBottom: 3 }]}>Change / Audit Note (Optional)</Text>
              <TextInput
                style={[styles.modalTextInput, { fontSize: 12, height: 36 }]}
                value={modalStockNotes}
                onChangeText={setModalStockNotes}
                placeholder="e.g. Physical inventory count, Initial stock setup"
                placeholderTextColor={colors.text.muted}
                editable={!savingSlots}
              />
            </View>

            <View style={[styles.modalActions, { marginTop: 14 }]}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => !savingSlots && setSlotModalVisible(false)}
                disabled={savingSlots}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.accent.primary }]}
                onPress={handleSaveSlotModal}
                disabled={savingSlots}
              >
                {savingSlots ? (
                  <ActivityIndicator size="small" color={colors.bg.card} />
                ) : (
                  <Text style={{ color: colors.bg.card, fontWeight: "700" }}>Save Opening Stock</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Calendar Modal for Stock Movement Audit Log Date Filter */}
      <EasyCalendarModal
        visible={isLogCalendarOpen}
        date={logCalendarMode === "start" ? (logStartDate || new Date()) : (logEndDate || new Date())}
        onSelectDate={(selectedDate) => {
          if (logCalendarMode === "start") {
            setLogStartDate(selectedDate);
          } else {
            setLogEndDate(selectedDate);
          }
          setIsLogCalendarOpen(false);
        }}
        onClose={() => setIsLogCalendarOpen(false)}
        title={logCalendarMode === "start" ? "Select Start Date" : "Select End Date"}
      />
    </ScrollView>
  );
}

export default function ItemDetailsRoute() {
  return (
    <ProtectedRoute>
      <ItemDetailsScreen />
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
      backgroundColor: colors.bg.card,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
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
      marginBottom: 16,
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
      overflow: "hidden",
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 10,
      elevation: 2,
      marginBottom: 24,
    },
    contentBody: {
      padding: 20,
    },
    categoryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    categoryTag: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      color: "#7c3aed",
      backgroundColor: "#f5f3ff",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    stockAlertBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    stockAlertText: {
      fontSize: 10,
      fontWeight: "700",
      marginLeft: 4,
    },
    itemName: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 16,
    },
    metricsRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 20,
    },
    metricCard: {
      flex: 1,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 12,
    },
    metricLabel: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "600",
      marginBottom: 4,
    },
    metricValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
    },
    suffixText: {
      fontSize: 12,
      fontWeight: "500",
      color: colors.text.muted,
    },
    lowStockText: {
      color: "#ea580c",
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      color: colors.text.muted,
      letterSpacing: 0.8,
      marginTop: 16,
      marginBottom: 8,
    },
    profitDashboard: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 6,
      marginBottom: 12,
    },
    dashRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    dashLabel: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: "500",
    },
    dashVal: {
      fontSize: 13,
      color: colors.text.primary,
      fontWeight: "600",
    },
    description: {
      fontSize: 14,
      color: colors.text.secondary,
      lineHeight: 22,
      marginBottom: 8,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      marginVertical: 16,
    },
    metaInfo: {
      gap: 4,
    },
    metaText: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "500",
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
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 15,
      elevation: 5,
    },
    modalIconWrapper: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: "#fff5f5",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
      borderWidth: 1,
      borderColor: "#fee2e2",
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 8,
    },
    modalDesc: {
      fontSize: 13,
      color: colors.text.muted,
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
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
    },
    modalCancelBtn: {
      backgroundColor: colors.border.subtle,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
    },
    modalCancelBtnText: {
      color: colors.text.secondary,
      fontWeight: "600",
      fontSize: 14,
    },
    modalDeleteBtn: {
      backgroundColor: colors.accent.danger,
    },
    modalDeleteBtnText: {
      color: colors.bg.card,
      fontWeight: "700",
      fontSize: 14,
    },
    statusSegmentRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 8,
      marginBottom: 16,
    },
    mediumStatusBtn: {
      flex: 1,
      height: 40,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    mediumStatusBtnText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.muted,
    },
    emptyLogsText: {
      fontSize: 13,
      color: colors.text.muted,
      fontStyle: "italic",
      paddingVertical: 10,
    },
    logsList: {
      marginTop: 8,
      gap: 10,
    },
    logItem: {
      backgroundColor: colors.bg.primary,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    logItemHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    logIconBg: {
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: colors.border.subtle,
      justifyContent: "center",
      alignItems: "center",
    },
    logTypeText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    logTimeText: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 2,
    },
    logQtyText: {
      fontSize: 14,
      fontWeight: "800",
    },
    logNotesText: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 6,
      paddingLeft: 4,
    },
    logBalancesRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 6,
      paddingLeft: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      paddingTop: 6,
    },
    logBalanceText: {
      fontSize: 10,
      color: colors.text.muted,
    },
    sectionTitleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 16,
      marginBottom: 8,
    },
    addLogBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.accent.primary + "12",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.accent.primary + "30",
    },
    addLogBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    logActions: {
      flexDirection: "row",
      gap: 6,
    },
    logActionBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
      marginTop: 10,
      marginBottom: 6,
    },
    modalTextInput: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: colors.text.primary,
      marginBottom: 10,
    },
    typeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 10,
    },
    typeGridBtn: {
      flexBasis: "30%",
      flexGrow: 1,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border.medium,
      alignItems: "center",
      backgroundColor: colors.bg.primary,
    },
    typeGridBtnText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    emptySpecialCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 14,
      marginTop: 6,
      marginBottom: 16,
    },
    emptySpecialText: {
      flex: 1,
      fontSize: 12,
      color: colors.text.muted,
      lineHeight: 16,
    },
    specialRatesContainer: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 12,
      marginTop: 6,
      marginBottom: 16,
      gap: 8,
    },
    specialRateRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    specialCustomerInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flex: 1,
      marginRight: 8,
    },
    specialCustomerName: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
      flexShrink: 1,
    },
    specialRateActions: {
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
    },
    specialRateText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#D97706",
    },
    specialRateEditBtn: {
      padding: 6,
      backgroundColor: colors.accent.primary + "12",
      borderRadius: 6,
      marginLeft: 8,
    },
    specialRateDeleteBtn: {
      padding: 6,
      backgroundColor: colors.accent.danger + "12",
      borderRadius: 6,
      marginLeft: 4,
    },
    specialRateInputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    rateCurrencySymbol: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    specialRateInput: {
      width: 70,
      borderWidth: 1,
      borderColor: colors.border.medium,
      backgroundColor: colors.bg.card,
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 8,
      fontSize: 13,
      color: colors.text.primary,
      textAlign: "right",
    },
    specialRateSaveBtn: {
      padding: 6,
      backgroundColor: colors.accent.success + "12",
      borderRadius: 6,
      marginLeft: 4,
    },
    specialRateCancelBtn: {
      padding: 6,
      backgroundColor: colors.accent.danger + "12",
      borderRadius: 6,
      marginLeft: 4,
    },
    slotsCardContainer: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      gap: 12,
    },
    slotCardRow: {
      gap: 6,
    },
    slotCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    slotCardTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    slotCardQty: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    slotCardPct: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
    },
    slotProgressBarTrack: {
      height: 6,
      backgroundColor: colors.border.subtle,
      borderRadius: 3,
      overflow: "hidden",
    },
    slotProgressBarFill: {
      height: "100%",
      backgroundColor: colors.accent.primary,
      borderRadius: 3,
    },
    emptySlotCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      gap: 8,
    },
    emptySlotText: {
      fontSize: 12,
      color: colors.text.secondary,
      flex: 1,
    },
    splitSlotBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.accent.primary + "15",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    splitSlotBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    slotRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
    },
    slotLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
      marginBottom: 4,
    },
    slotRoleBtn: {
      borderWidth: 1.5,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 7,
      alignItems: "center",
      justifyContent: "center",
    },
    slotRoleBtnText: {
      fontSize: 11,
      fontWeight: "700",
    },
    removeSlotBtn: {
      marginLeft: 8,
      marginTop: 14,
      padding: 4,
    },
    addSlotBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.accent.primary,
      marginTop: 4,
    },
    addSlotBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.accent.primary,
      marginLeft: 4,
    },
    exportLogBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    exportLogBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    auditMetricsRow: {
      flexDirection: "row",
      gap: 8,
      marginVertical: 10,
    },
    auditMetricCard: {
      flex: 1,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      padding: 8,
      gap: 2,
    },
    metricCardLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.text.muted,
    },
    metricCardValue: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    auditFilterContainer: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 10,
      marginBottom: 12,
      gap: 6,
    },
    auditSearchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 34,
      gap: 6,
    },
    auditSearchInput: {
      flex: 1,
      fontSize: 12,
      color: colors.text.primary,
      paddingVertical: 0,
    },
    filterChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    filterChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    dirChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    dirChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
    },
    sortOrderBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    sortOrderBtnText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    emptyAuditState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 28,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      marginBottom: 16,
    },
    emptyAuditTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 8,
    },
    emptyAuditDesc: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: 4,
      paddingHorizontal: 20,
    },
    resetFiltersBtn: {
      marginTop: 12,
      backgroundColor: colors.accent.primary + "15",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    resetFiltersBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    logItemCard: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    logTypeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    logTypeBadgeText: {
      fontSize: 11,
      fontWeight: "700",
    },
    logFlowRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 8,
    },
    flowPill: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    flowPillText: {
      fontSize: 11,
      color: colors.text.secondary,
    },
    userTag: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    userTagText: {
      fontSize: 11,
      color: colors.text.muted,
    },
    logNotesBox: {
      marginTop: 8,
      backgroundColor: colors.bg.primary,
      padding: 8,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    directionTabs: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 10,
    },
    directionTabBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 8,
      backgroundColor: colors.bg.primary,
    },
    directionTabBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    presetRow: {
      flexDirection: "row",
      gap: 6,
      flexWrap: "wrap",
      marginVertical: 6,
    },
    presetChip: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
    },
    presetChipText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    reconcileBox: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      padding: 10,
      marginVertical: 8,
      gap: 4,
    },
    reconcileRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    reconcileLabel: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    reconcileVal: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.primary,
    },
    reasonChip: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
    },
    reasonChipText: {
      fontSize: 11,
      color: colors.text.secondary,
    },
  });
};