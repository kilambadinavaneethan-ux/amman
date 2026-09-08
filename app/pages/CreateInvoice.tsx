import React, { useContext, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { OrderContext } from "../context/OrderContext";
import { CustomerContext } from "../context/CustomerContext";
import { ItemContext } from "../context/ItemContext";
import { DeliveryPartnerContext } from "../context/DeliveryPartnerContext";
import { CollectorContext } from "../context/CollectorContext";
import { WorkerContext } from "../context/WorkerContext";
import { RawMaterialSupplierContext } from "../context/RawMaterialSupplierContext";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../../src/config/firebase";
import AnimatedPage from "../components/AnimatedPage";
import ContactsModal from "../components/ContactsModal";
import EasyCalendarModal from "../components/EasyCalendarModal";
import BackButton from "../components/BackButton";
import { useTheme } from "../context/ThemeContext";
import { UserContext } from "../context/UserContext";
import { TransactionShareBottomSheet } from "../../src/components/sharing/TransactionShareBottomSheet";
import { adaptToTransactionData } from "../../src/utils/transactionAdapter";
import { TransactionData } from "../../src/types/sharing";

export default function CreateInvoice() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const [orderDate, setOrderDate] = useState<Date>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const getYestDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  };

  const getTomDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  };



  const { addOrder } = useContext(OrderContext) as any;
  const { customers } = useContext(CustomerContext) as any;
  const { items } = useContext(ItemContext) as any;
  const { partners } = useContext(DeliveryPartnerContext) as any;
  const { collectors } = useContext(CollectorContext) as any;
  const { workers } = useContext(WorkerContext) as any;
  const { suppliers } = useContext(RawMaterialSupplierContext) as any;
  const { profile: userProfile } = useContext(UserContext) as any;

  const [shareBottomSheetVisible, setShareBottomSheetVisible] = useState(false);
  const [sharingTransactionData, setSharingTransactionData] = useState<TransactionData | null>(null);

  // Sorted delivery partners: Star (preferred) partners second right after No Delivery
  const sortedDeliveryPartners = useMemo(() => {
    return [...(partners || [])].sort((a: any, b: any) => {
      const aFav = !!a.isFavorite;
      const bFav = !!b.isFavorite;
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [partners]);

  // Selected customer states
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [collectorId, setCollectorId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Selected shifting worker states
  const [loadingWorkerId, setLoadingWorkerId] = useState("");
  const [unloadingWorkerId, setUnloadingWorkerId] = useState("");

  // New customer states (when adding a customer manually or via contacts)
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerNotes, setNewCustomerNotes] = useState("");

  // Contacts modal state
  const [contactsVisible, setContactsVisible] = useState(false);

  // Selected item states
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedItemName, setSelectedItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("0");
  const [paidAmount, setPaidAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [deliveryPartnerId, setDeliveryPartnerId] = useState("");
  const [shipmentDistance, setShipmentDistance] = useState("0");
  const [shipmentChargeInput, setShipmentChargeInput] = useState("0");
  const [extraAmount, setExtraAmount] = useState("0");
  const [extraAmountDescription, setExtraAmountDescription] = useState("");
  const [showExtraDesc, setShowExtraDesc] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [discountType, setDiscountType] = useState<"amount" | "percent" | "per_brick">("amount");

  // List of items added to the current bill/invoice
  const [addedItems, setAddedItems] = useState<any[]>([]);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);

  // Helper: calculated current total quantity across all items
  const currentTotalQuantity = addedItems.length > 0
    ? addedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    : (selectedItemId ? (Number(quantity) || 0) : 0);

  // State variables for custom shipment rate configurations
  const [customRateType, setCustomRateType] = useState<string>("fixed amount");
  const [customRate, setCustomRate] = useState<string>("0");
  const [customMinRate, setCustomMinRate] = useState<string>("0");

  // Sync custom rate states with the selected partner's default settings
  React.useEffect(() => {
    const partner = partners.find((p: any) => p.id === deliveryPartnerId);
    if (partner) {
      setCustomRateType(partner.deliveryRateType || "fixed amount");
      setCustomRate(String(partner.deliveryRate || 0));
      setCustomMinRate(String(partner.minimumRate || 0));
    } else {
      setCustomRateType("fixed amount");
      setCustomRate("0");
      setCustomMinRate("0");
    }
  }, [deliveryPartnerId, partners]);

  // Auto-calculate shipment charge based on (potentially customized) rate rules
  React.useEffect(() => {
    if (!deliveryPartnerId) {
      setShipmentChargeInput("0");
      return;
    }
    const rateType = customRateType;
    const rateVal = parseFloat(customRate) || 0;
    const minRateVal = parseFloat(customMinRate) || 0;

    let calculatedCharge = 0;
    if (rateType === "kilometre") {
      const dist = parseFloat(shipmentDistance) || 0;
      calculatedCharge = Math.max(dist * rateVal, minRateVal);
    } else if (rateType === "per brick") {
      calculatedCharge = Math.max(currentTotalQuantity * rateVal, minRateVal);
    } else {
      // fixed amount
      calculatedCharge = Math.max(rateVal, minRateVal);
    }

    setShipmentChargeInput(String(calculatedCharge));
  }, [deliveryPartnerId, customRateType, customRate, customMinRate, shipmentDistance, currentTotalQuantity]);

  // Combine Customers, Workers, Suppliers, and Delivery Partners into a unified selection list
  const allUnifiedCustomers = useMemo(() => {
    const result: any[] = [];
    const claimedKeys = new Set<string>();

    const getEntityKeys = (item: any) => {
      const keys: string[] = [];
      if (item.id) keys.push(`id:${item.id}`);
      const rawPhone = item.phone || item.contactNumber || item.mobile || item.phoneNumber || "";
      const cleanPhone = rawPhone.replace(/[^\d]/g, "");
      if (cleanPhone.length >= 10) keys.push(`phone:${cleanPhone.slice(-10)}`);
      const rawName = item.name || item.supplierName || "";
      const cleanName = rawName.trim().toLowerCase();
      if (cleanName) keys.push(`name:${cleanName}`);
      return keys;
    };

    const isClaimed = (item: any) => {
      const keys = getEntityKeys(item);
      return keys.some((k) => claimedKeys.has(k));
    };

    const claimItem = (item: any) => {
      const keys = getEntityKeys(item);
      keys.forEach((k) => claimedKeys.add(k));
    };

    // 1. Process Workers
    (workers || []).forEach((w: any) => {
      if (isClaimed(w)) return;
      claimItem(w);
      const phone = w.phone || w.mobile || w.contactNumber || w.phoneNumber || w.mobileNumber || "";
      const pending = w.totalPending !== undefined
        ? Number(w.totalPending)
        : (Number(w.totalWages || 0) - Number(w.totalPaid || 0));
      result.push({
        id: w.id,
        name: `${w.name} (Worker)`,
        phone,
        address: w.address || w.role || "Worker",
        customerType: "worker",
        displayName: `${w.name} (Worker)`,
        subText: `Worker • ${phone || w.role || "Staff"}${pending !== 0 ? ` • Due: ₹${pending}` : ""}`,
        totalPending: pending,
        balance: pending,
      });
    });

    // 2. Process Suppliers
    (suppliers || []).forEach((s: any) => {
      if (isClaimed(s)) return;
      claimItem(s);
      const phone = s.phone || s.contactNumber || s.mobile || s.phoneNumber || s.supplierPhone || "";
      const bal = Number(s.balance || 0);
      result.push({
        id: s.id,
        name: `${s.name || s.supplierName} (Supplier)`,
        phone,
        address: s.address || "Supplier",
        customerType: "supplier",
        displayName: `${s.name || s.supplierName} (Supplier)`,
        subText: `Supplier • ${phone || s.materialType || "Raw Material"}${bal !== 0 ? ` • Due: ₹${bal}` : ""}`,
        totalPending: bal,
        balance: bal,
      });
    });

    // 3. Process Delivery Partners
    (partners || []).forEach((p: any) => {
      if (isClaimed(p)) return;
      claimItem(p);
      const phone = p.phone || p.mobile || p.contactNumber || p.phoneNumber || p.driverPhone || "";
      const pending = Number(p.totalPending || 0);
      result.push({
        id: p.id,
        name: `${p.name} (Delivery Partner)`,
        phone,
        address: p.vehicleNumber || "Delivery Partner",
        customerType: "delivery_partner",
        displayName: `${p.name} (Delivery Partner)`,
        subText: `Delivery Partner • ${phone || p.vehicleType || "Partner"}${pending !== 0 ? ` • Due: ₹${pending}` : ""}`,
        totalPending: pending,
        balance: pending,
      });
    });

    // 4. Process Customers (skipping duplicates)
    (customers || []).forEach((c: any) => {
      if (isClaimed(c)) return;
      claimItem(c);
      const pending = c.totalPending !== undefined
        ? Number(c.totalPending)
        : (c.balance !== undefined ? Number(c.balance) : Number(c.pendingAmount || 0));
      result.push({
        ...c,
        customerType: "customer",
        displayName: c.name,
        subText: c.phone || "Customer",
        totalPending: pending,
        balance: pending,
      });
    });

    return result;
  }, [customers, workers, suppliers, partners]);

  // Filter customers based on search query
  const filteredCustomers = allUnifiedCustomers.filter((c: any) =>
    (c.displayName || c.name || "").toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone || "").toLowerCase().includes(customerSearch.toLowerCase())
  );

  // Sort items to show Finished Products first (itemType !== "raw_material"), sorted alphabetically within categories
  const sortedItems = [...(items || [])]
    .sort((a: any, b: any) => {
      const aIsProduct = a.itemType !== "raw_material";
      const bIsProduct = b.itemType !== "raw_material";
      if (aIsProduct && !bIsProduct) return -1;
      if (!aIsProduct && bIsProduct) return 1;
      return (a.itemName || "").localeCompare(b.itemName || "");
    });

  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomerId(customer.id);
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
    setIsNewCustomer(false);
    if (customer.collectorId) {
      setCollectorId(customer.collectorId);
    } else {
      setCollectorId("");
    }

    // Auto-fill special customer rates if an item is already selected
    if (selectedItemId) {
      const item = items.find((i: any) => i.id === selectedItemId);
      if (item) {
        let selectedRate = item.sellingRate || item.sellingPrice || 0;
        if (item.specialRates && item.specialRates[customer.id] !== undefined) {
          selectedRate = item.specialRates[customer.id];
        }
        setRate(String(selectedRate));
      }
    }
  };

  const handleImportContact = (contact: { name: string; phone: string }) => {
    setIsNewCustomer(true);
    setSelectedCustomerId("");
    setCustomerSearch(""); // Clear search to avoid confusion
    setNewCustomerName(contact.name);
    setNewCustomerPhone(contact.phone);
  };

  const handleSelectItem = (itemId: string) => {
    const item = items.find((i: any) => i.id === itemId);
    if (item) {
      setSelectedItemId(itemId);
      setSelectedItemName(item.itemName);
      
      let selectedRate = item.sellingRate || item.sellingPrice || 0;
      if (selectedCustomerId && item.specialRates && item.specialRates[selectedCustomerId] !== undefined) {
        selectedRate = item.specialRates[selectedCustomerId];
      }
      setRate(String(selectedRate));
    }
  };

  const handleAddItem = () => {
    if (!selectedItemId) {
      Alert.alert("Error", "Please select a product first.");
      return;
    }
    const qtyNum = Number(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      Alert.alert("Error", "Quantity must be a positive number.");
      return;
    }
    const rateNum = Number(rate);
    if (isNaN(rateNum) || rateNum < 0) {
      Alert.alert("Error", "Selling rate must be a valid number.");
      return;
    }

    const selectedItem = items.find((i: any) => i.id === selectedItemId);
    if (!selectedItem) return;

    // Check available stock
    const availableStock = selectedItem.openingStock !== undefined ? selectedItem.openingStock : (selectedItem.stock || 0);

    if (editingItemIndex !== null) {
      // Updating an existing item in addedItems list
      const existingOtherQty = addedItems
        .filter((_, i) => i !== editingItemIndex && addedItems[i].itemId === selectedItemId)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

      if (existingOtherQty + qtyNum > Number(availableStock)) {
        Alert.alert("Low Stock", `Only ${availableStock} units available in inventory.`);
        return;
      }

      const updated = [...addedItems];
      updated[editingItemIndex] = {
        ...updated[editingItemIndex],
        itemId: selectedItemId,
        itemName: selectedItemName,
        quantity: qtyNum,
        rate: rateNum,
        rateType: selectedItem.rateType || "piece",
        grossTotal: qtyNum * rateNum,
      };
      setAddedItems(updated);
      setEditingItemIndex(null);
    } else {
      // Total quantity of this item already added
      const existingQty = addedItems
        .filter((item) => item.itemId === selectedItemId)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

      if (existingQty + qtyNum > Number(availableStock)) {
        Alert.alert("Low Stock", `Only ${availableStock} units available in inventory. You already added ${existingQty} to this bill.`);
        return;
      }

      // Check if item already exists in the list to merge, or add as a separate row
      const existingItemIndex = addedItems.findIndex(
        (item) => item.itemId === selectedItemId && item.rate === rateNum
      );

      if (existingItemIndex > -1) {
        const updatedItems = [...addedItems];
        updatedItems[existingItemIndex].quantity += qtyNum;
        updatedItems[existingItemIndex].grossTotal = updatedItems[existingItemIndex].quantity * rateNum;
        setAddedItems(updatedItems);
      } else {
        const newItem = {
          itemId: selectedItemId,
          itemName: selectedItemName,
          quantity: qtyNum,
          rate: rateNum,
          rateType: selectedItem.rateType || "piece",
          grossTotal: qtyNum * rateNum,
        };
        setAddedItems([...addedItems, newItem]);
      }
    }

    // Reset item selection inputs
    setSelectedItemId("");
    setSelectedItemName("");
    setQuantity("");
    setRate("0");
  };

  const handleEditItemInForm = (index: number) => {
    const item = addedItems[index];
    if (!item) return;
    setSelectedItemId(item.itemId);
    setSelectedItemName(item.itemName);
    setQuantity(String(item.quantity));
    setRate(String(item.rate));
    setEditingItemIndex(index);
  };

  const handleCancelEditItem = () => {
    setEditingItemIndex(null);
    setSelectedItemId("");
    setSelectedItemName("");
    setQuantity("");
    setRate("0");
  };

  const handleUpdateItemQuantity = (index: number, newQtyStr: string) => {
    const updatedItems = [...addedItems];
    const targetItem = updatedItems[index];
    if (!targetItem) return;

    if (newQtyStr === "") {
      updatedItems[index] = {
        ...targetItem,
        quantity: "",
        grossTotal: 0,
      };
      setAddedItems(updatedItems);
      return;
    }

    const qtyNum = parseInt(newQtyStr);
    if (isNaN(qtyNum)) return;

    const selectedItem = items.find((i: any) => i.id === targetItem.itemId);
    const availableStock = selectedItem ? (selectedItem.openingStock !== undefined ? selectedItem.openingStock : (selectedItem.stock || 0)) : 999999;

    const existingOtherQty = addedItems
      .filter((_, i) => i !== index && addedItems[i].itemId === targetItem.itemId)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    if (qtyNum > 0 && existingOtherQty + qtyNum > Number(availableStock)) {
      Alert.alert("Low Stock", `Only ${availableStock} units available in inventory for ${targetItem.itemName}.`);
      return;
    }

    const finalQty = Math.max(0, qtyNum);
    const currentRate = Number(targetItem.rate) || 0;
    updatedItems[index] = {
      ...targetItem,
      quantity: finalQty,
      grossTotal: finalQty * currentRate,
    };
    setAddedItems(updatedItems);
  };

  const handleUpdateItemRate = (index: number, newRateStr: string) => {
    const updatedItems = [...addedItems];
    const targetItem = updatedItems[index];
    if (!targetItem) return;

    if (newRateStr === "") {
      updatedItems[index] = {
        ...targetItem,
        rate: "",
        grossTotal: 0,
      };
      setAddedItems(updatedItems);
      return;
    }

    const rateNum = parseFloat(newRateStr);
    if (isNaN(rateNum)) return;

    const currentQty = Number(targetItem.quantity) || 0;
    updatedItems[index] = {
      ...targetItem,
      rate: Math.max(0, rateNum),
      grossTotal: currentQty * Math.max(0, rateNum),
    };
    setAddedItems(updatedItems);
  };

  const handleRemoveItem = (index: number) => {
    if (editingItemIndex === index) {
      handleCancelEditItem();
    } else if (editingItemIndex !== null && editingItemIndex > index) {
      setEditingItemIndex(editingItemIndex - 1);
    }
    const updatedItems = addedItems.filter((_, i) => i !== index);
    setAddedItems(updatedItems);
  };

  // Calculations
  const grossProductTotal = addedItems.length > 0
    ? addedItems.reduce((sum, item) => sum + (item.grossTotal || 0), 0)
    : (selectedItemId ? (Number(quantity) * Number(rate)) : 0);

  const loadingWorker = (workers || []).find((w: any) => w.id === loadingWorkerId);
  const loadingWorkerName = loadingWorker ? loadingWorker.name : "";
  const loadingCharge = loadingWorker ? currentTotalQuantity * Number(loadingWorker.loadingCost || 0) : 0;

  const unloadingWorker = (workers || []).find((w: any) => w.id === unloadingWorkerId);
  const unloadingWorkerName = unloadingWorker ? unloadingWorker.name : "";
  const unloadingCharge = unloadingWorker ? currentTotalQuantity * Number(unloadingWorker.unloadingCost || 0) : 0;

  const shipmentCharge = Number(shipmentChargeInput) || 0;
  const extraAmountVal = Number(extraAmount) || 0;
  const subtotalBeforeDiscount = grossProductTotal + shipmentCharge + extraAmountVal + loadingCharge + unloadingCharge;
  const discountVal = parseFloat(discount) || 0;
  const calculatedDiscountAmount = discountType === "percent"
    ? (subtotalBeforeDiscount * discountVal) / 100
    : discountType === "per_brick"
    ? discountVal * currentTotalQuantity
    : discountVal;
  const calculatedTotal = Math.max(0, subtotalBeforeDiscount - calculatedDiscountAmount);
  const calculatedBalanceDue = Math.max(0, calculatedTotal - Number(paidAmount));

  const handleSaveInvoice = async (shouldShare = false) => {
    let finalItems = [...addedItems];

    // Auto-add the currently selected item if addedItems list is empty and user selected an item
    if (finalItems.length === 0 && selectedItemId) {
      const qtyNum = Number(quantity);
      const rateNum = Number(rate);
      const selectedItem = items.find((i: any) => i.id === selectedItemId);

      if (selectedItem && qtyNum > 0 && rateNum >= 0) {
        const availableStock = selectedItem.openingStock !== undefined ? selectedItem.openingStock : (selectedItem.stock || 0);
        if (qtyNum <= Number(availableStock)) {
          finalItems.push({
            itemId: selectedItemId,
            itemName: selectedItemName,
            quantity: qtyNum,
            rate: rateNum,
            rateType: selectedItem.rateType || "piece",
            grossTotal: qtyNum * rateNum,
          });
        } else {
          Alert.alert("Low Stock", `Only ${availableStock} units available in inventory for ${selectedItem.itemName}.`);
          return;
        }
      }
    }

    // 1. Validation
    if (finalItems.length === 0) {
      Alert.alert("Error", "Please add at least one product to the bill.");
      return;
    }

    if (!selectedCustomerId && !isNewCustomer) {
      Alert.alert("Error", "Please select an existing customer or enter a new customer.");
      return;
    }

    if (isNewCustomer) {
      if (!newCustomerName.trim()) {
        Alert.alert("Error", "New customer name is required.");
        return;
      }
      const trimmedPhone = newCustomerPhone.trim();
      if (trimmedPhone) {
        const p1 = trimmedPhone.replace(/[^\d]/g, "");
        const duplicate = customers.find((c: any) => {
          const p2 = (c.phone || "").replace(/[^\d]/g, "");
          if (!p1 || !p2) return false;
          if (p1 === p2) return true;
          if (p1.length >= 10 && p2.length >= 10) {
            return p1.slice(-10) === p2.slice(-10);
          }
          return false;
        });

        if (duplicate) {
          Alert.alert(
            "Customer Exists",
            `A customer with this phone number is already registered under the name "${duplicate.name}". Please select them from the search dropdown instead.`
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      let finalCustomerId = selectedCustomerId;
      let finalCustomerName = "";

      // 2. Add customer to database if new
      if (isNewCustomer) {
        const customerPayload = {
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim(),
          address: newCustomerAddress.trim(),
          notes: newCustomerNotes.trim(),
          balance: 0,
          totalPending: 0,
          createdAt: orderDate.toLocaleString(),
        };

        const customerDoc = await addDoc(collection(db, "customers"), customerPayload);
        finalCustomerId = customerDoc.id;
        finalCustomerName = customerPayload.name;
      } else {
        const targetEntity = allUnifiedCustomers.find((c: any) => c.id === selectedCustomerId);
        finalCustomerName = targetEntity ? targetEntity.displayName : "";
      }

      let previousBalanceVal = 0;
      if (!isNewCustomer) {
        const selectedEntity = allUnifiedCustomers.find((c: any) =>
          (selectedCustomerId && c.id === selectedCustomerId) ||
          (c.displayName && finalCustomerName && c.displayName.trim().toLowerCase() === finalCustomerName.trim().toLowerCase()) ||
          (c.name && finalCustomerName && c.name.trim().toLowerCase() === finalCustomerName.trim().toLowerCase()) ||
          (c.phone && customerSearch && c.phone.trim() === customerSearch.trim())
        );
        if (selectedEntity) {
          const rawBal = selectedEntity.totalPending !== undefined
            ? Number(selectedEntity.totalPending)
            : (selectedEntity.balance !== undefined ? Number(selectedEntity.balance) : Number(selectedEntity.pendingAmount || 0));
          const isNonCustomer = selectedEntity.customerType && selectedEntity.customerType !== "customer";
          previousBalanceVal = isNonCustomer ? -rawBal : rawBal;
        }
      }

      const targetEntity = allUnifiedCustomers.find((c: any) => c.id === finalCustomerId);
      const finalCustomerType = targetEntity ? targetEntity.customerType : "customer";

      const resolvedCustomerPhone = isNewCustomer
        ? newCustomerPhone.trim()
        : (targetEntity?.phone || targetEntity?.mobile || "");
      const resolvedCustomerPhoneNumbers = isNewCustomer
        ? (newCustomerPhone.trim() ? [newCustomerPhone.trim()] : [])
        : (targetEntity?.phoneNumbers && targetEntity.phoneNumbers.length > 0
            ? targetEntity.phoneNumbers
            : (resolvedCustomerPhone ? [resolvedCustomerPhone] : []));
      const resolvedCustomerAddress = isNewCustomer
        ? newCustomerAddress.trim()
        : (targetEntity?.address || "");
      const resolvedCustomerGst = targetEntity?.gstNo || targetEntity?.gstin || "";

      // 3. Create the order
      const orderPayload = {
        customerId: finalCustomerId,
        customerName: finalCustomerName,
        customerType: finalCustomerType,
        customerPhone: resolvedCustomerPhone,
        customerPhoneNumbers: resolvedCustomerPhoneNumbers,
        customerAddress: resolvedCustomerAddress,
        customerGst: resolvedCustomerGst,
        items: finalItems,
        grossTotal: grossProductTotal,
        shipmentCharge: shipmentCharge,
        extraAmount: extraAmountVal,
        extraAmountDescription: extraAmountDescription.trim(),
        discount: discountVal,
        discountType: discountType,
        discountAmount: calculatedDiscountAmount,
        total: calculatedTotal,
        paidAmount: Number(paidAmount),
        paymentMethod: paymentMethod || "Cash",
        paymentMode: paymentMethod || "Cash",
        paymentType: paymentMethod || "Cash",
        balanceDue: calculatedBalanceDue,
        previousBalance: previousBalanceVal,
        deliveryPartnerId: deliveryPartnerId || null,
        collectorId: collectorId || null,
        collectorName: collectors.find((c: any) => c.id === collectorId)?.name || null,
        createdAt: orderDate,
        loadingWorkerId: loadingWorkerId || null,
        loadingWorkerName: loadingWorkerName || null,
        loadingCharge: loadingCharge,
        unloadingWorkerId: unloadingWorkerId || null,
        unloadingWorkerName: unloadingWorkerName || null,
        unloadingCharge: unloadingCharge,
      };

      const orderId = await addOrder(orderPayload);
      if (orderId) {
        const createdInvoice = { id: orderId, ...orderPayload };
        if (shouldShare) {
          const transaction = adaptToTransactionData(createdInvoice, "invoice", userProfile);
          setSharingTransactionData(transaction);
          setShareBottomSheetVisible(true);
        } else {
          Alert.alert("Success", "Invoice recorded and stock updated.");
          router.push("/orders" as any);
        }
      } else {
        throw new Error("Failed to save order.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not complete the invoice transaction.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatedPage>
      <ContactsModal
        visible={contactsVisible}
        onClose={() => setContactsVisible(false)}
        onSelectContact={handleImportContact}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <BackButton label="Dashboard" onPress={() => router.push("/")} style={{ marginBottom: 12 }} />
            <Text style={styles.title}>New Bill / Invoice</Text>
            <Text style={styles.subtitle}>Log customer purchase, issue billing, and deduct stock.</Text>
          </View>

          {/* Section 1: Customer Selection */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="person" size={20} color={colors.accent.success} />
              <Text style={styles.sectionTitle}>1. Customer Details</Text>
            </View>

            {/* Customer Type Toggle */}
            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.toggleBtn, !isNewCustomer && styles.toggleBtnActive]}
                onPress={() => setIsNewCustomer(false)}
              >
                <Text style={[styles.toggleBtnText, !isNewCustomer && styles.toggleBtnTextActive]}>
                  Search Registry
                </Text>
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, isNewCustomer && styles.toggleBtnActive]}
                onPress={() => {
                  setIsNewCustomer(true);
                  setSelectedCustomerId("");
                  setCustomerSearch("");
                }}
              >
                <Text style={[styles.toggleBtnText, isNewCustomer && styles.toggleBtnTextActive]}>
                  Add New Client
                </Text>
              </Pressable>
            </View>

            {!isNewCustomer ? (
              <View style={{ zIndex: 10 }}>
                <Text style={styles.label}>Select Customer</Text>
                <View style={styles.dropdownInputRow}>
                  <TextInput
                    value={customerSearch}
                    onChangeText={(val) => {
                      setCustomerSearch(val);
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    placeholder="Search by name or customer number..."
                    placeholderTextColor={colors.text.muted}
                    style={styles.input}
                  />
                  {customerSearch ? (
                    <Pressable
                      style={styles.clearBtn}
                      onPress={() => {
                        setCustomerSearch("");
                        setSelectedCustomerId("");
                        setCollectorId("");
                      }}
                    >
                      <MaterialIcons name="close" size={18} color={colors.text.muted} />
                    </Pressable>
                  ) : null}
                </View>

                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <View style={styles.dropdown}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                      {filteredCustomers.map((c: any) => (
                        <Pressable
                          key={c.id}
                          style={styles.dropdownItem}
                          onPress={() => handleSelectCustomer(c)}
                        >
                          <Text style={styles.dropdownItemText}>{c.displayName || c.name}</Text>
                          <Text style={styles.dropdownItemSub}>{c.subText || c.phone || "No phone"}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.formContainer}>
                <Pressable
                  style={styles.importContactsBtn}
                  onPress={() => setContactsVisible(true)}
                >
                  <MaterialIcons name="import-contacts" size={18} color={colors.bg.card} />
                  <Text style={styles.importContactsText}>Import From Contacts</Text>
                </Pressable>

                <Text style={styles.label}>Customer Name *</Text>
                <TextInput
                  value={newCustomerName}
                  onChangeText={setNewCustomerName}
                  placeholder="Enter client's full name"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                <Text style={styles.label}>Mobile Number</Text>
                <TextInput
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                  placeholder="e.g. +91 9876543210"
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                <Text style={styles.label}>Billing Address (Optional)</Text>
                <TextInput
                  value={newCustomerAddress}
                  onChangeText={setNewCustomerAddress}
                  placeholder="Enter delivery/billing address"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                <Text style={styles.label}>Internal Notes (Optional)</Text>
                <TextInput
                  value={newCustomerNotes}
                  onChangeText={setNewCustomerNotes}
                  placeholder="Add special client terms or requests"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />
              </View>
            )}

            <View style={styles.divider} />

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={styles.label}>Bill Date *</Text>
              {isSameDay(orderDate, new Date()) && (
                <View style={{ backgroundColor: colors.accent.primary + "18", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary }}>Today</Text>
                </View>
              )}
            </View>

            {/* Quick Date Stepper & Picker Box */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Pressable
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border.medium,
                  backgroundColor: colors.bg.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={() => {
                  const prev = new Date(orderDate);
                  prev.setDate(prev.getDate() - 1);
                  setOrderDate(prev);
                }}
              >
                <MaterialIcons name="chevron-left" size={24} color={colors.accent.primary} />
              </Pressable>

              <Pressable
                style={[styles.dateSelector, { flex: 1, marginBottom: 0 }]}
                onPress={() => setIsCalendarOpen(true)}
              >
                <MaterialIcons name="calendar-today" size={18} color={colors.accent.primary} style={{ marginRight: 8 }} />
                <Text style={styles.dateSelectorText}>
                  {orderDate.toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
                <MaterialIcons name="edit" size={16} color={colors.text.muted} style={{ marginLeft: "auto" }} />
              </Pressable>

              <Pressable
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border.medium,
                  backgroundColor: colors.bg.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={() => {
                  const next = new Date(orderDate);
                  next.setDate(next.getDate() + 1);
                  setOrderDate(next);
                }}
              >
                <MaterialIcons name="chevron-right" size={24} color={colors.accent.primary} />
              </Pressable>
            </View>

            {/* Quick Date Pills */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
              <Pressable
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: isSameDay(orderDate, getYestDate()) ? colors.accent.primary : colors.border.medium,
                    backgroundColor: isSameDay(orderDate, getYestDate()) ? `${colors.accent.primary}18` : colors.bg.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => setOrderDate(getYestDate())}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: isSameDay(orderDate, getYestDate()) ? "700" : "500",
                    color: isSameDay(orderDate, getYestDate()) ? colors.accent.primary : colors.text.secondary,
                  }}
                >
                  Yesterday
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: isSameDay(orderDate, new Date()) ? colors.accent.primary : colors.border.medium,
                    backgroundColor: isSameDay(orderDate, new Date()) ? `${colors.accent.primary}18` : colors.bg.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => setOrderDate(new Date())}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: isSameDay(orderDate, new Date()) ? "700" : "500",
                    color: isSameDay(orderDate, new Date()) ? colors.accent.primary : colors.text.secondary,
                  }}
                >
                  Today
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: isSameDay(orderDate, getTomDate()) ? colors.accent.primary : colors.border.medium,
                    backgroundColor: isSameDay(orderDate, getTomDate()) ? `${colors.accent.primary}18` : colors.bg.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => setOrderDate(getTomDate())}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: isSameDay(orderDate, getTomDate()) ? "700" : "500",
                    color: isSameDay(orderDate, getTomDate()) ? colors.accent.primary : colors.text.secondary,
                  }}
                >
                  Tomorrow
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Section 2: Item Selection */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="local-mall" size={20} color="#3B82F6" />
              <Text style={styles.sectionTitle}>2. Product details</Text>
            </View>

          <Text style={styles.label}>Select Product</Text>
          <View style={styles.pickerWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.itemsScroll}>
              <View style={styles.itemsRow}>
                {sortedItems.map((item: any) => {
                  const active = selectedItemId === item.id;
                  const stock = item.openingStock !== undefined ? item.openingStock : (item.stock || 0);

                  return (
                    <Pressable
                      key={item.id}
                      style={[
                        styles.itemCard,
                        active && styles.itemCardActive,
                      ]}
                      onPress={() => handleSelectItem(item.id)}
                    >
                      <Text style={[styles.itemCardName, active && styles.itemCardNameActive]}>
                        {item.itemName}
                      </Text>
                      {item.status !== "Inactive" && item.itemType !== "raw_material" ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginVertical: 2 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" }} />
                          <Text style={{ fontSize: 9, fontWeight: "700", color: "#10B981", textTransform: "uppercase" }}>Active</Text>
                        </View>
                      ) : null}
                      <Text style={styles.itemCardStock}>
                        Stock: <Text style={{ fontWeight: "800", color: colors.text.primary }}>{stock}</Text> units
                      </Text>
                      <Text style={styles.itemCardPrice}>₹{item.sellingRate || item.sellingPrice || 0}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          <View style={styles.flexRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Quantity</Text>
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                placeholder="e.g. 1"
                placeholderTextColor={colors.text.muted}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Selling Rate (₹)</Text>
              <TextInput
                value={rate}
                onChangeText={setRate}
                keyboardType="numeric"
                style={styles.input}
              />
            </View>
          </View>

          {/* Add / Update Product to Bill Button */}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              style={[styles.addButton, { flex: 1 }]}
              onPress={handleAddItem}
            >
              <MaterialIcons
                name={editingItemIndex !== null ? "check" : "add-shopping-cart"}
                size={18}
                color={colors.bg.card}
              />
              <Text style={styles.addButtonText}>
                {editingItemIndex !== null ? "Update Item in Bill" : "Add Product to Bill"}
              </Text>
            </Pressable>

            {editingItemIndex !== null && (
              <Pressable
                style={[
                  styles.addButton,
                  { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.medium },
                ]}
                onPress={handleCancelEditItem}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text.primary }}>
                  Cancel
                </Text>
              </Pressable>
            )}
          </View>

          {/* List of Added Items */}
          {addedItems.length > 0 && (
            <View style={styles.addedItemsContainer}>
              <Text style={styles.addedItemsTitle}>Added Items ({addedItems.length})</Text>
              {addedItems.map((item, idx) => {
                const isEditingThis = editingItemIndex === idx;

                return (
                  <View
                    key={idx}
                    style={[
                      styles.addedItemRow,
                      isEditingThis && styles.addedItemRowEditing,
                    ]}
                  >
                    <View style={styles.addedItemInfo}>
                      <Text style={styles.addedItemName}>{item.itemName}</Text>
                      <Text style={styles.addedItemSub}>
                        {item.quantity} {item.rateType || "piece"}(s) @ ₹{item.rate}
                      </Text>
                    </View>
                    <View style={styles.addedItemRight}>
                      <Text style={styles.addedItemTotal}>
                        ₹{(Number(item.grossTotal) || (Number(item.quantity) * Number(item.rate))).toLocaleString("en-IN")}
                      </Text>
                      <Pressable
                        style={styles.editItemBtn}
                        onPress={() => handleEditItemInForm(idx)}
                      >
                        <MaterialIcons
                          name="edit"
                          size={18}
                          color={isEditingThis ? colors.accent.primary : colors.text.muted}
                        />
                      </Pressable>
                      <Pressable
                        style={styles.removeItemBtn}
                        onPress={() => handleRemoveItem(idx)}
                      >
                        <MaterialIcons name="delete-outline" size={20} color={colors.accent.danger} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Section 3: Delivery Partner */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="local-shipping" size={20} color={colors.accent.primary} />
            <Text style={styles.sectionTitle}>3. Shipments (Optional)</Text>
          </View>

          <Text style={styles.label}>Assign Delivery Partner</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.partnersScroll}>
            <View style={styles.partnersRow}>
              <Pressable
                style={[styles.partnerCard, !deliveryPartnerId && styles.partnerCardActive]}
                onPress={() => setDeliveryPartnerId("")}
              >
                <Text style={[styles.partnerName, !deliveryPartnerId && styles.partnerNameActive]}>
                  No Delivery (Self Pickup)
                </Text>
              </Pressable>

              {sortedDeliveryPartners.map((p: any) => {
                const active = deliveryPartnerId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    style={[
                      styles.partnerCard,
                      active && styles.partnerCardActive,
                      p.isFavorite && !active && { backgroundColor: "#fef3c7", borderColor: "#fde047" },
                    ]}
                    onPress={() => setDeliveryPartnerId(p.id)}
                  >
                    <Text style={[styles.partnerName, active && styles.partnerNameActive, p.isFavorite && !active && { color: "#d97706" }]}>
                      {p.isFavorite ? "⭐ " : ""}{p.name} ({p.vehicleType || "Driver"})
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Selected partner details and distance input */}
          {(() => {
            const partner = partners.find((p: any) => p.id === deliveryPartnerId);
            if (!partner) return null;

            return (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.label, { color: colors.accent.primary, marginBottom: 8 }]}>
                  Delivery Rate Type
                </Text>
                <View style={styles.toggleRow}>
                  {[
                    { label: "Per KM", value: "kilometre" },
                    { label: "Per Brick", value: "per brick" },
                    { label: "Fixed Amount", value: "fixed amount" },
                  ].map((opt) => {
                    const active = customRateType === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        style={[styles.toggleBtn, active && styles.toggleBtnActive]}
                        onPress={() => setCustomRateType(opt.value)}
                      >
                        <Text style={[styles.toggleBtnText, active && styles.toggleBtnTextActive]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Rate (₹)</Text>
                    <TextInput
                      value={customRate}
                      onChangeText={setCustomRate}
                      keyboardType="numeric"
                      placeholder="e.g. 15"
                      placeholderTextColor={colors.text.muted}
                      style={styles.input}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Minimum Floor (₹)</Text>
                    <TextInput
                      value={customMinRate}
                      onChangeText={setCustomMinRate}
                      keyboardType="numeric"
                      placeholder="e.g. 500"
                      placeholderTextColor={colors.text.muted}
                      style={styles.input}
                    />
                  </View>
                </View>

                {customRateType === "kilometre" && (
                  <View>
                    <Text style={styles.label}>Delivery Distance (KM)</Text>
                    <TextInput
                      value={shipmentDistance}
                      onChangeText={setShipmentDistance}
                      keyboardType="numeric"
                      placeholder="e.g. 10"
                      placeholderTextColor={colors.text.muted}
                      style={styles.input}
                    />
                  </View>
                )}
              </View>
            );
          })()}
        </View>

        {/* Section 4: Shifting & Loading */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="local-shipping" size={20} color={colors.accent.primary} />
            <Text style={styles.sectionTitle}>4. Shifting & Loading (Optional)</Text>
          </View>

          {/* Loading Worker */}
          <Text style={styles.label}>Assign Loading Worker</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.partnersScroll}>
            <View style={styles.partnersRow}>
              <Pressable
                style={[styles.partnerCard, !loadingWorkerId && styles.partnerCardActive]}
                onPress={() => setLoadingWorkerId("")}
              >
                <Text style={[styles.partnerName, !loadingWorkerId && styles.partnerNameActive]}>
                  No Loading Worker
                </Text>
              </Pressable>

              {workers.filter((w: any) => w.status === "Active").map((w: any) => {
                const active = loadingWorkerId === w.id;
                return (
                  <Pressable
                    key={`load-${w.id}`}
                    style={[styles.partnerCard, active && styles.partnerCardActive]}
                    onPress={() => setLoadingWorkerId(w.id)}
                  >
                    <Text style={[styles.partnerName, active && styles.partnerNameActive]}>
                      {w.name} (₹{w.loadingCost || 0}/pc)
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Unloading Worker */}
          <Text style={[styles.label, { marginTop: 14 }]}>Assign Unloading Worker</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.partnersScroll}>
            <View style={styles.partnersRow}>
              <Pressable
                style={[styles.partnerCard, !unloadingWorkerId && styles.partnerCardActive]}
                onPress={() => setUnloadingWorkerId("")}
              >
                <Text style={[styles.partnerName, !unloadingWorkerId && styles.partnerNameActive]}>
                  No Unloading Worker
                </Text>
              </Pressable>

              {workers.filter((w: any) => w.status === "Active").map((w: any) => {
                const active = unloadingWorkerId === w.id;
                return (
                  <Pressable
                    key={`unload-${w.id}`}
                    style={[styles.partnerCard, active && styles.partnerCardActive]}
                    onPress={() => setUnloadingWorkerId(w.id)}
                  >
                    <Text style={[styles.partnerName, active && styles.partnerNameActive]}>
                      {w.name} (₹{w.unloadingCost || 0}/pc)
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Section 5: Balance Money Collector */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="payments" size={20} color={colors.accent.primary} />
            <Text style={styles.sectionTitle}>5. Balance Money Collector (Optional)</Text>
          </View>

          <Text style={styles.label}>Assign Money Collector</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.partnersScroll}>
            <View style={styles.partnersRow}>
              <Pressable
                style={[styles.partnerCard, !collectorId && styles.collectorCardActive]}
                onPress={() => setCollectorId("")}
              >
                <Text style={[styles.partnerName, !collectorId && styles.collectorNameActive]}>
                  No Collector Assigned
                </Text>
              </Pressable>

              {collectors.map((c: any) => {
                const active = collectorId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.partnerCard, active && styles.collectorCardActive]}
                    onPress={() => setCollectorId(c.id)}
                  >
                    <Text style={[styles.partnerName, active && styles.collectorNameActive]}>
                      {c.name} {c.area ? `(${c.area})` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Section 6: Billing Calculations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="receipt" size={20} color={colors.accent.warning} />
            <Text style={styles.sectionTitle}>6. Billing & Payments</Text>
          </View>

          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Gross Product Total:</Text>
            <Text style={styles.calcValue}>₹{grossProductTotal.toLocaleString("en-IN")}</Text>
          </View>

          {loadingCharge > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Loading Charge ({loadingWorkerName}):</Text>
              <Text style={styles.calcValue}>₹{loadingCharge.toLocaleString("en-IN")}</Text>
            </View>
          )}

          {unloadingCharge > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Unloading Charge ({unloadingWorkerName}):</Text>
              <Text style={styles.calcValue}>₹{unloadingCharge.toLocaleString("en-IN")}</Text>
            </View>
          )}

          <Text style={styles.label}>Shipment Charge (₹)</Text>
          <TextInput
            value={shipmentChargeInput}
            onChangeText={setShipmentChargeInput}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
          />

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.label}>Extra Amount / Charge (₹)</Text>
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 6 }}
              onPress={() => setShowExtraDesc(!showExtraDesc)}
            >
              <MaterialIcons name={showExtraDesc ? "remove" : "add"} size={16} color={colors.accent.primary} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.accent.primary }}>Description</Text>
            </Pressable>
          </View>
          <TextInput
            value={extraAmount}
            onChangeText={setExtraAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
          />

          {showExtraDesc && (
            <View>
              <Text style={styles.label}>Extra Charge Description</Text>
              <TextInput
                value={extraAmountDescription}
                onChangeText={setExtraAmountDescription}
                placeholder="e.g. Loading charge, packaging fee"
                placeholderTextColor={colors.text.muted}
                style={styles.input}
              />
            </View>
          )}

          {extraAmountVal > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Extra Amount:</Text>
              <Text style={styles.calcValue}>₹{extraAmountVal.toLocaleString("en-IN")}</Text>
            </View>
          )}

          {/* Discount Section */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
            <Text style={styles.label}>Discount (Optional)</Text>
            <View style={{ flexDirection: "row", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.border.subtle, marginBottom: 6 }}>
              <Pressable
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: discountType === "amount" ? colors.accent.primary : colors.bg.card,
                }}
                onPress={() => setDiscountType("amount")}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: discountType === "amount" ? "#FFF" : colors.text.primary }}>
                  ₹ Flat
                </Text>
              </Pressable>
              <Pressable
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: discountType === "percent" ? colors.accent.primary : colors.bg.card,
                }}
                onPress={() => setDiscountType("percent")}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: discountType === "percent" ? "#FFF" : colors.text.primary }}>
                  % Percent
                </Text>
              </Pressable>
              <Pressable
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: discountType === "per_brick" ? colors.accent.primary : colors.bg.card,
                }}
                onPress={() => setDiscountType("per_brick")}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: discountType === "per_brick" ? "#FFF" : colors.text.primary }}>
                  ₹/Brick
                </Text>
              </Pressable>
            </View>
          </View>
          <TextInput
            value={discount}
            onChangeText={setDiscount}
            keyboardType="numeric"
            placeholder={
              discountType === "percent"
                ? "Discount % (e.g. 10)"
                : discountType === "per_brick"
                ? "Discount rate per brick (e.g. 0.50)"
                : "Discount Amount ₹ (e.g. 100)"
            }
            placeholderTextColor={colors.text.muted}
            style={styles.input}
          />

          {(() => {
            const selectedCustomerObj = !isNewCustomer
              ? allUnifiedCustomers.find((c: any) => c.id === selectedCustomerId)
              : null;
            let rawBal = 0;
            let isNonCustomer = false;

            if (selectedCustomerObj) {
              rawBal = selectedCustomerObj.totalPending !== undefined
                ? Number(selectedCustomerObj.totalPending)
                : Number(selectedCustomerObj.balance || 0);
              isNonCustomer = selectedCustomerObj.customerType && selectedCustomerObj.customerType !== "customer";
            }

            // Effective due owed BY client to business: positive = pending due, negative = advance credit
            const effectiveDueOwedByClient = isNonCustomer ? -rawBal : rawBal;
            const hasPendingDue = effectiveDueOwedByClient > 0;
            const hasAdvanceCredit = effectiveDueOwedByClient < 0;
            const pendingDueVal = Math.abs(effectiveDueOwedByClient);
            const advanceVal = Math.abs(effectiveDueOwedByClient);

            const totalWithOldDues = Math.max(0, calculatedTotal + effectiveDueOwedByClient);
            const totalNetUnpaid = Math.max(0, effectiveDueOwedByClient + calculatedBalanceDue);

            return (
              <>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Subtotal (before Discount):</Text>
                  <Text style={styles.calcValue}>₹{subtotalBeforeDiscount.toLocaleString("en-IN")}</Text>
                </View>

                {calculatedDiscountAmount > 0 && (
                  <View style={styles.calcRow}>
                    <Text style={[styles.calcLabel, { color: colors.accent.success, fontWeight: "700" }]}>
                      Discount ({discountType === "percent" ? `${discount}%` : discountType === "per_brick" ? `₹${discount}/brick × ${currentTotalQuantity}` : "Flat"}):
                    </Text>
                    <Text style={[styles.calcValue, { color: colors.accent.success, fontWeight: "700" }]}>
                      -₹{calculatedDiscountAmount.toLocaleString("en-IN")}
                    </Text>
                  </View>
                )}

                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Current Order Total:</Text>
                  <Text style={styles.calcValue}>₹{calculatedTotal.toLocaleString("en-IN")}</Text>
                </View>

                {hasPendingDue && (
                  <View style={styles.calcRow}>
                    <Text style={[styles.calcLabel, { color: colors.accent.danger, fontWeight: "700" }]}>
                      Old Balance Due (Previous):
                    </Text>
                    <Text style={[styles.calcValue, { color: colors.accent.danger, fontWeight: "700" }]}>
                      +₹{pendingDueVal.toLocaleString("en-IN")}
                    </Text>
                  </View>
                )}

                {hasAdvanceCredit && (
                  <View style={styles.calcRow}>
                    <Text style={[styles.calcLabel, { color: colors.accent.success, fontWeight: "700" }]}>
                      Advance Balance (Plus Credit):
                    </Text>
                    <Text style={[styles.calcValue, { color: colors.accent.success, fontWeight: "700" }]}>
                      -₹{advanceVal.toLocaleString("en-IN")}
                    </Text>
                  </View>
                )}

                <View style={[styles.divider, { marginVertical: 6 }]} />

                <View style={styles.calcRow}>
                  <Text style={styles.calcLabelBold}>
                    {hasAdvanceCredit ? "Total Order Amount (after Advance):" : "Total Order Amount (incl. Old Dues):"}
                  </Text>
                  <Text style={[styles.calcValueBold, { color: colors.accent.primary }]}>
                    ₹{totalWithOldDues.toLocaleString("en-IN")}
                  </Text>
                </View>

                <View style={{ marginTop: 10, marginBottom: 6 }}>
                  <Text style={[styles.label, { marginBottom: 6 }]}>Amount Paid Today (₹)</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <Pressable
                      style={({ pressed }) => [
                        {
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                          backgroundColor: colors.accent.primary + "18",
                          borderColor: colors.accent.primary,
                          borderWidth: 1,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 6,
                          flexShrink: 1,
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={() => setPaidAmount(String(calculatedTotal))}
                    >
                      <MaterialIcons name="check-circle" size={14} color={colors.accent.primary} />
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.primary }} numberOfLines={1}>
                        Full Bill (₹{calculatedTotal.toLocaleString("en-IN")})
                      </Text>
                    </Pressable>

                    {hasPendingDue && (
                      <Pressable
                        style={({ pressed }) => [
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            backgroundColor: colors.accent.danger + "18",
                            borderColor: colors.accent.danger,
                            borderWidth: 1,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 6,
                            flexShrink: 1,
                          },
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => setPaidAmount(String(totalWithOldDues))}
                      >
                        <MaterialIcons name="account-balance-wallet" size={14} color={colors.accent.danger} />
                        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent.danger }} numberOfLines={1}>
                          Incl. Old Dues (₹{totalWithOldDues.toLocaleString("en-IN")})
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
                <TextInput
                  value={paidAmount}
                  onChangeText={setPaidAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                {/* Payment Method Selector */}
                <View style={{ marginTop: 10, marginBottom: 8 }}>
                  <Text style={[styles.label, { marginBottom: 8 }]}>Payment Method</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {[
                      { key: "Cash", icon: "payments", color: colors.accent.success },
                      { key: "UPI", icon: "phone-android", color: colors.accent.info },
                      { key: "Bank Transfer", icon: "account-balance", color: colors.accent.primary },
                      { key: "Cheque", icon: "offline-pin", color: colors.accent.warning },
                      { key: "Other", icon: "more-horiz", color: colors.text.muted },
                    ].map((method) => {
                      const isSelected = paymentMethod === method.key;
                      return (
                        <Pressable
                          key={method.key}
                          style={({ pressed }) => [
                            {
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              paddingVertical: 7,
                              paddingHorizontal: 12,
                              borderRadius: 8,
                              borderWidth: 1.5,
                              borderColor: isSelected ? method.color : colors.border.subtle,
                              backgroundColor: isSelected ? `${method.color}15` : colors.bg.primary,
                            },
                            pressed && { opacity: 0.75 },
                          ]}
                          onPress={() => setPaymentMethod(method.key)}
                        >
                          <MaterialIcons
                            name={method.icon as any}
                            size={16}
                            color={isSelected ? method.color : colors.text.muted}
                          />
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: isSelected ? "700" : "600",
                              color: isSelected ? method.color : colors.text.secondary,
                            }}
                          >
                            {method.key}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.calcRow}>
                  <Text style={styles.calcLabelBold}>Total Balance Unpaid:</Text>
                  <Text style={[styles.calcValueBold, totalNetUnpaid > 0 && { color: colors.accent.danger }]}>
                    ₹{totalNetUnpaid.toLocaleString("en-IN")}
                  </Text>
                </View>
              </>
            );
          })()}
        </View>

        {/* Save Actions */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Pressable
            disabled={saving}
            style={[styles.saveBtn, { flex: 1 }, saving && styles.saveBtnDisabled]}
            onPress={() => handleSaveInvoice(false)}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.bg.card} />
            ) : (
              <>
                <MaterialIcons name="save" size={20} color={colors.bg.card} />
                <Text style={styles.saveBtnText}>Save Bill</Text>
              </>
            )}
          </Pressable>

          <Pressable
            disabled={saving}
            style={[styles.saveBtn, { flex: 1.3, backgroundColor: "#2563EB" }, saving && styles.saveBtnDisabled]}
            onPress={() => handleSaveInvoice(true)}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name="share" size={20} color="#FFFFFF" />
                <Text style={[styles.saveBtnText, { color: "#FFFFFF" }]}>Save & Share</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      <EasyCalendarModal
        visible={isCalendarOpen}
        date={orderDate}
        onSelectDate={setOrderDate}
        onClose={() => setIsCalendarOpen(false)}
        title="Select Bill Date"
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
  container: {
    padding: 16,
    backgroundColor: colors.bg.primary,
    flexGrow: 1,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.secondary,
    marginLeft: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 2,
  },
  section: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: colors.border.subtle,
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  toggleBtn: {
    flex: 1,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: colors.bg.card,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
  },
  toggleBtnTextActive: {
    color: colors.text.primary,
    fontWeight: "700",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
    color: colors.text.primary,
    fontSize: 14,
    backgroundColor: colors.bg.primary,
    marginBottom: 14,
  },
  dropdownInputRow: {
    position: "relative",
    justifyContent: "center",
  },
  clearBtn: {
    position: "absolute",
    right: 12,
    top: 12,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 10,
    backgroundColor: colors.bg.card,
    marginTop: -8,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
    maxHeight: 150,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  dropdownItemSub: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  formContainer: {
    gap: 2,
  },
  importContactsBtn: {
    flexDirection: "row",
    backgroundColor: "#10B981",
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 14,
  },
  importContactsText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 13,
  },
  pickerWrapper: {
    marginBottom: 14,
  },
  itemsScroll: {
    flexDirection: "row",
  },
  itemsRow: {
    flexDirection: "row",
    gap: 10,
  },
  itemCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    padding: 12,
    width: 120,
  },
  itemCardActive: {
    borderColor: "#3B82F6",
    backgroundColor: "#6C5CE720",
  },
  itemCardName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 4,
  },
  itemCardNameActive: {
    color: "#1e40af",
  },
  itemCardStock: {
    fontSize: 10,
    color: colors.text.muted,
  },
  itemCardPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text.primary,
    marginTop: 6,
  },
  flexRow: {
    flexDirection: "row",
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 4,
  },
  calcLabel: {
    fontSize: 14,
    color: colors.text.muted,
  },
  calcValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  calcLabelBold: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text.primary,
  },
  calcValueBold: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: 12,
  },
  partnersScroll: {
    flexDirection: "row",
  },
  partnersRow: {
    flexDirection: "row",
    gap: 8,
  },
  partnerCard: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.medium,
    backgroundColor: colors.bg.card,
  },
  partnerCardActive: {
    backgroundColor: "#f5f3ff",
    borderColor: colors.accent.primary,
  },
  collectorCardActive: {
    backgroundColor: "#6C5CE720",
    borderColor: colors.accent.primary,
  },
  partnerName: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  partnerNameActive: {
    color: "#6d28d9",
    fontWeight: "700",
  },
  collectorNameActive: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
  saveBtn: {
    backgroundColor: colors.accent.success,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    shadowColor: colors.accent.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: {
    backgroundColor: "#86efac",
    elevation: 0,
  },
  saveBtnText: {
    color: colors.bg.card,
    fontSize: 15,
    fontWeight: "700",
  },
  addButton: {
    backgroundColor: "#3B82F6",
    height: 40,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    marginBottom: 14,
  },
  addButtonText: {
    color: colors.bg.card,
    fontSize: 13,
    fontWeight: "700",
  },
  addedItemsContainer: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: 14,
  },
  addedItemsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 10,
  },
  addedItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.bg.primary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  addedItemRowEditing: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.bg.card,
  },
  addedItemInfo: {
    flex: 1,
  },
  addedItemName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
  },
  addedItemSub: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  addedItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addedItemTotal: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
  },
  editItemBtn: {
    padding: 4,
  },
  removeItemBtn: {
    padding: 4,
  },
  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
    backgroundColor: colors.bg.primary,
    marginBottom: 14,
  },
  dateSelectorText: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: "500",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
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
})
};
