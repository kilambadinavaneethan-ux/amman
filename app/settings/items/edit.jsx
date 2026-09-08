import React, { useContext, useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ItemContext } from "../../context/ItemContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";

const RATE_TYPES = [
  { label: "Piece Rate", value: "piece" },
  { label: "Unit Rate", value: "unit" },
  { label: "Bag Rate", value: "bag" },
];

function EditItemScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { itemId } = useLocalSearchParams();
  const { items, updateItem } = useContext(ItemContext);

  const item = items.find((itm) => itm.id === itemId);

  const [itemName, setItemName] = useState("");
  const [itemType, setItemType] = useState("product");
  const [rateType, setRateType] = useState("piece");
  const [showDropdown, setShowDropdown] = useState(false);
  const [status, setStatus] = useState("Active");
  const [unitsPerBag, setUnitsPerBag] = useState("50");

  const [sellingRate, setSellingRate] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [description, setDescription] = useState("");

  // Slot-wise stock state
  const [useSlotSplit, setUseSlotSplit] = useState(false);
  const [slots, setSlots] = useState([
    { id: "1", slotName: "Slot 1", quantity: "", slotType: "-" },
  ]);

  const handleAddSlot = () => {
    const targetStock = parseInt(openingStock, 10) || 0;
    const nextSlotNum = slots.length + 1;
    setSlots((prev) => {
      const updated = [
        ...prev,
        { id: Date.now().toString(), slotName: `Slot ${nextSlotNum}`, quantity: "" },
      ];
      const otherSum = updated.slice(1).reduce((acc, cur) => acc + (parseInt(cur.quantity, 10) || 0), 0);
      updated[0].quantity = String(Math.max(0, targetStock - otherSum));
      return updated;
    });
  };

  const handleRemoveSlot = (id) => {
    if (slots.length <= 1) return;
    const targetStock = parseInt(openingStock, 10) || 0;
    setSlots((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      const otherSum = updated.slice(1).reduce((acc, cur) => acc + (parseInt(cur.quantity, 10) || 0), 0);
      updated[0].quantity = String(Math.max(0, targetStock - otherSum));
      return updated;
    });
  };

  const handleSlotNameChange = (id, text) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, slotName: text } : s))
    );
  };

  const handleSlotQtyChange = (id, text) => {
    const targetStock = parseInt(openingStock, 10) || 0;
    setSlots((prev) => {
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

  const toggleSlotSplit = () => {
    const next = !useSlotSplit;
    setUseSlotSplit(next);
    if (next) {
      const targetStock = parseInt(openingStock, 10) || 0;
      setSlots((prev) => {
        const updated = [...prev];
        if (updated.length > 0) {
          const otherSum = updated.slice(1).reduce((acc, cur) => acc + (parseInt(cur.quantity, 10) || 0), 0);
          updated[0].quantity = String(Math.max(0, targetStock - otherSum));
        }
        return updated;
      });
    }
  };

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Initialize fields
  useEffect(() => {
    if (item) {
      setItemName(item.itemName || "");
      setItemType(item.itemType || "product");
      setRateType(item.rateType || "piece");
      setSellingRate(String(item.sellingRate || ""));
      setCostPrice(String(item.costPrice || "0"));
      setOpeningStock(String(item.openingStock !== undefined ? item.openingStock : (item.stock || "0")));
      setDescription(item.description || "");
      setStatus(item.status || "Active");
      setUnitsPerBag(String(item.unitsPerBag !== undefined ? item.unitsPerBag : "50"));

      if (Array.isArray(item.openingStockSlots) && item.openingStockSlots.length > 0) {
        setUseSlotSplit(true);
        setSlots(
          item.openingStockSlots.map((s, idx) => ({
            id: s.id || String(idx + 1),
            slotName: s.slotName || `Slot ${idx + 1}`,
            quantity: String(s.quantity !== undefined ? s.quantity : 0),
          }))
        );
      }
    }
  }, [item]);

  if (!item) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={colors.accent.danger} />
        <Text style={styles.errorTitle}>Item Not Found</Text>
        <Text style={styles.errorDesc}>The item you are trying to edit does not exist or has been deleted.</Text>
        <Pressable style={styles.backLink} onPress={() => router.push("/settings/items")}>
          <Text style={styles.backLinkText}>Return to Catalog</Text>
        </Pressable>
      </View>
    );
  }

  // Live profit margin calculation
  const sRate = parseFloat(sellingRate);
  const cPrice = parseFloat(costPrice);
  let margin = null;
  let marginColor = "#5A5F72";

  if (!isNaN(sRate) && !isNaN(cPrice) && sRate > 0) {
    const profit = sRate - cPrice;
    margin = (profit / sRate) * 100;
    if (margin > 30) {
      marginColor = "#10b981"; // Good margin
    } else if (margin > 0) {
      marginColor = "#d97706"; // Low margin
    } else {
      marginColor = "#ef4444"; // Negative margin!
    }
  }

  const handleSave = async () => {
    setError("");

    // Validations
    if (!itemName.trim()) {
      setError("Item Name is required.");
      return;
    }

    if (!rateType) {
      setError("Rate Type is required.");
      return;
    }

    const sRateVal = sellingRate.trim() ? parseFloat(sellingRate) : 0;
    if (isNaN(sRateVal) || sRateVal < 0) {
      setError("Selling Rate must be a valid non-negative number.");
      return;
    }

    const cPriceVal = costPrice.trim() ? parseFloat(costPrice) : 0;
    if (isNaN(cPriceVal) || cPriceVal < 0) {
      setError("Cost Price must be a valid non-negative number.");
      return;
    }

    let openStockVal = openingStock.trim() ? parseInt(openingStock, 10) : 0;
    if (isNaN(openStockVal) || openStockVal < 0) {
      setError("Opening Stock Quantity must be a valid non-negative integer.");
      return;
    }

    let formattedSlots = [];
    if (useSlotSplit) {
      const totalSlots = slots.length;
      for (let idx = 0; idx < totalSlots; idx++) {
        const slot = slots[idx];
        if (!slot.slotName.trim()) {
          setError("All slot names must be specified.");
          return;
        }
        const q = slot.quantity.trim() ? parseInt(slot.quantity, 10) : 0;
        if (isNaN(q) || q < 0) {
          setError(`Invalid quantity for ${slot.slotName}`);
          return;
        }
        let computedRole = "o";
        if (idx === 0) computedRole = "-";
        else if (idx === totalSlots - 1) computedRole = "+";
        else computedRole = "o";

        formattedSlots.push({
          id: slot.id,
          slotName: slot.slotName.trim(),
          quantity: q,
          slotType: computedRole,
        });
      }
      const slotSum = formattedSlots.reduce((acc, cur) => acc + cur.quantity, 0);
      if (slotSum !== openStockVal) {
        setError(`Sum of slot quantities (${slotSum}) must equal total Opening Stock (${openStockVal}).`);
        return;
      }
    }

    const unitsPerBagVal = itemType === "product" ? (unitsPerBag.trim() ? parseInt(unitsPerBag, 10) : 50) : 0;
    if (itemType === "product" && (isNaN(unitsPerBagVal) || unitsPerBagVal <= 0)) {
      setError("Stock units per worker bag must be a valid positive integer.");
      return;
    }

    setSaving(true);

    try {
      if (itemType === "product" && status === "Active") {
        // Deactivate all other active products
        const activeProducts = items.filter(
          (i) => i.itemType !== "raw_material" && (i.status || "Active") === "Active" && i.id !== item.id
        );
        for (const actProd of activeProducts) {
          await updateItem(actProd.id, { status: "Inactive" });
        }
      } else if (itemType === "product" && status === "Inactive") {
        // Check if we are deactivating the only active product
        const otherActiveProducts = items.filter(
          (i) => i.itemType !== "raw_material" && (i.status || "Active") === "Active" && i.id !== item.id
        );
        if (otherActiveProducts.length === 0) {
          setError("At least one finished product must remain active.");
          setSaving(false);
          return;
        }
      }

      const ok = await updateItem(item.id, {
        itemName: itemName.trim(),
        itemType,
        rateType,
        sellingRate: sRateVal,
        costPrice: cPriceVal,
        openingStock: openStockVal,
        openingStockSlots: useSlotSplit ? formattedSlots : [],
        description: description.trim(),
        status,
        unitsPerBag: unitsPerBagVal,
      });

      if (ok) {
        router.push({ pathname: "/settings/items/details", params: { id: item.id } });
      } else {
        setError("Failed to update product details in Firestore.");
      }
    } catch (e) {
      setError(e.message || "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  const activeRateTypeObj = RATE_TYPES.find((t) => t.value === rateType) || RATE_TYPES[0];

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        <BackButton
          label="Cancel"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push({ pathname: "/settings/items/details", params: { id: item.id } });
            }
          }}
        />
        <Text style={styles.title}>Edit Product Details</Text>
      </View>

      <View style={styles.formCard}>
        {/* Item Name */}
        <Text style={styles.label}>Item Name *</Text>
        <TextInput
          style={styles.input}
          value={itemName}
          onChangeText={setItemName}
          placeholder="e.g. Cement, Hollow Block, Sand"
          placeholderTextColor={colors.text.muted}
          editable={!saving}
        />

        {/* Item Type Segment Selector */}
        <Text style={styles.label}>Item Classification *</Text>
        <View style={styles.segmentContainer}>
          <Pressable 
            style={[styles.segmentButton, itemType === "product" && styles.segmentButtonActive]}
            onPress={() => setItemType("product")}
            disabled={saving}
          >
            <MaterialIcons name="grid-view" size={16} color={itemType === "product" ? "#1A1D27" : colors.text.secondary} style={{ marginRight: 6 }} />
            <Text style={[styles.segmentText, itemType === "product" && styles.segmentTextActive]}>Finished Product</Text>
          </Pressable>
          <Pressable 
            style={[styles.segmentButton, itemType === "raw_material" && styles.segmentButtonActive]}
            onPress={() => setItemType("raw_material")}
            disabled={saving}
          >
            <MaterialIcons name="layers" size={16} color={itemType === "raw_material" ? "#1A1D27" : colors.text.secondary} style={{ marginRight: 6 }} />
            <Text style={[styles.segmentText, itemType === "raw_material" && styles.segmentTextActive]}>Raw Material</Text>
          </Pressable>
        </View>

        {/* Rate Type Dropdown */}
        <Text style={styles.label}>Rate Type *</Text>
        <View style={styles.dropdownContainer}>
          <Pressable 
            style={[styles.dropdownButton, showDropdown && styles.dropdownActive]} 
            onPress={() => !saving && setShowDropdown(!showDropdown)}
          >
            <Text style={styles.dropdownButtonText}>{activeRateTypeObj.label}</Text>
            <MaterialIcons 
              name={showDropdown ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
              size={24} 
              color={colors.text.secondary} 
            />
          </Pressable>
          
          {showDropdown && (
            <View style={styles.dropdownOptions}>
              {RATE_TYPES.map((type) => {
                const isSelected = rateType === type.value;
                return (
                  <Pressable
                    key={type.value}
                    style={[styles.dropdownOption, isSelected && styles.dropdownOptionSelected]}
                    onPress={() => {
                      setRateType(type.value);
                      setShowDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownOptionText, isSelected && styles.dropdownOptionTextSelected]}>
                      {type.label}
                    </Text>
                    {isSelected && (
                      <MaterialIcons name="check" size={18} color={colors.accent.primary} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Selling Rate */}
        <Text style={styles.label}>Selling Rate (Optional)</Text>
        <TextInput
          style={styles.input}
          value={sellingRate}
          onChangeText={setSellingRate}
          placeholder="0.00"
          placeholderTextColor={colors.text.muted}
          keyboardType="numeric"
          editable={!saving}
        />

        {/* Cost Price */}
        <Text style={styles.label}>Cost Price (Optional)</Text>
        <TextInput
          style={styles.input}
          value={costPrice}
          onChangeText={setCostPrice}
          placeholder="0.00"
          placeholderTextColor={colors.text.muted}
          keyboardType="numeric"
          editable={!saving}
        />

        {/* Live profit margins */}
        {margin !== null && (
          <View style={[styles.marginIndicator, { borderColor: marginColor }]}>
            <MaterialIcons name="trending-up" size={18} color={marginColor} />
            <Text style={[styles.marginText, { color: marginColor }]}>
              Estimated Profit Margin: <Text style={styles.marginVal}>{margin.toFixed(1)}%</Text>
              {margin <= 0 ? " (Negative Margin!)" : margin < 20 ? " (Low Markup)" : " (Healthy Markup)"}
            </Text>
          </View>
        )}

        {/* Opening Stock Quantity & Slot-wise Split */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={[styles.label, { marginBottom: 0 }]}>Opening Stock Quantity</Text>
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              onPress={toggleSlotSplit}
            >
              <MaterialIcons
                name={useSlotSplit ? "check-box" : "check-box-outline-blank"}
                size={18}
                color={colors.accent.primary}
              />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.accent.primary }}>
                Split Slot-Wise
              </Text>
            </Pressable>
          </View>

          <TextInput
            style={[styles.input, useSlotSplit && { backgroundColor: colors.bg.card, color: colors.text.muted, fontWeight: "700" }]}
            value={openingStock}
            onChangeText={(txt) => {
              if (!useSlotSplit) setOpeningStock(txt);
            }}
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            keyboardType="numeric"
            editable={!saving && !useSlotSplit}
          />

          {useSlotSplit && (
            <View style={styles.slotsContainer}>
              <Text style={styles.slotsSubheader}>Slot-Wise Stock Breakdown</Text>
              {slots.map((slot, index) => {
                const total = slots.length;
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
                        style={styles.slotInput}
                        value={slot.slotName}
                        onChangeText={(txt) => handleSlotNameChange(slot.id, txt)}
                        placeholder="e.g. Slot 1, Rack A"
                        placeholderTextColor={colors.text.muted}
                        editable={!saving}
                      />
                    </View>
                    <View style={{ flex: 1.2, marginLeft: 6 }}>
                      <Text style={styles.slotLabel}>Quantity</Text>
                      <TextInput
                        style={styles.slotInput}
                        value={slot.quantity}
                        onChangeText={(txt) => handleSlotQtyChange(slot.id, txt)}
                        placeholder="Qty"
                        placeholderTextColor={colors.text.muted}
                        keyboardType="numeric"
                        editable={!saving}
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
                    {slots.length > 1 && (
                      <Pressable
                        style={styles.removeSlotBtn}
                        onPress={() => handleRemoveSlot(slot.id)}
                      >
                        <MaterialIcons name="remove-circle-outline" size={22} color={colors.accent.danger} />
                      </Pressable>
                    )}
                  </View>
                );
              })}

              <Pressable style={styles.addSlotBtn} onPress={handleAddSlot}>
                <MaterialIcons name="add" size={16} color={colors.accent.primary} />
                <Text style={styles.addSlotBtnText}>Add Another Slot</Text>
              </Pressable>
            </View>
          )}
        </View>

        {itemType === "product" && (
          <>
            <Text style={styles.label}>Stock Units per Worker Bag (Multiplier) *</Text>
            <TextInput
              style={styles.input}
              value={unitsPerBag}
              onChangeText={setUnitsPerBag}
              placeholder="e.g. 50"
              placeholderTextColor={colors.text.muted}
              keyboardType="numeric"
              editable={!saving}
            />
          </>
        )}

        {/* Item Status Segment Selector */}
        <Text style={styles.label}>Status *</Text>
        <View style={styles.segmentContainer}>
          <Pressable 
            style={[
              styles.segmentButton, 
              status === "Active" && { backgroundColor: colors.accent.success, borderColor: colors.accent.success }
            ]}
            onPress={() => setStatus("Active")}
            disabled={saving}
          >
            <MaterialIcons name="check-circle" size={16} color={status === "Active" ? "#1A1D27" : colors.text.secondary} style={{ marginRight: 6 }} />
            <Text style={[styles.segmentText, status === "Active" && { color: colors.bg.card, fontWeight: "700" }]}>Active</Text>
          </Pressable>
          <Pressable 
            style={[
              styles.segmentButton, 
              status === "Inactive" && { backgroundColor: colors.accent.danger, borderColor: colors.accent.danger }
            ]}
            onPress={() => setStatus("Inactive")}
            disabled={saving}
          >
            <MaterialIcons name="cancel" size={16} color={status === "Inactive" ? "#1A1D27" : colors.text.secondary} style={{ marginRight: 6 }} />
            <Text style={[styles.segmentText, status === "Inactive" && { color: colors.bg.card, fontWeight: "700" }]}>Inactive</Text>
          </Pressable>
        </View>

        {/* Description */}
        <Text style={styles.label}>Description (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Write technical specifications or notes here..."
          placeholderTextColor={colors.text.muted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          editable={!saving}
        />

        {error ? (
          <View style={styles.errorAlert}>
            <MaterialIcons name="error" size={18} color={colors.accent.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            saving && styles.submitButtonDisabled,
            pressed && !saving && styles.buttonPressed,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.bg.card} />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color={colors.bg.card} />
              <Text style={styles.submitButtonText}>Save Product Modifications</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default function EditItemRoute() {
  return (
    <ProtectedRoute>
      <EditItemScreen />
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
    marginBottom: 20,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
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
  formCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.secondary,
    marginBottom: 8,
    marginLeft: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    marginBottom: 16,
    backgroundColor: colors.bg.primary,
    color: colors.text.primary,
  },
  textArea: {
    height: 80,
  },
  dropdownContainer: {
    marginBottom: 16,
    position: "relative",
    zIndex: 10,
  },
  dropdownButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.bg.primary,
  },
  dropdownActive: {
    borderColor: colors.accent.primary,
  },
  dropdownButtonText: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: "500",
  },
  dropdownOptions: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  dropdownOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  dropdownOptionSelected: {
    backgroundColor: "#6C5CE720",
  },
  dropdownOptionText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  dropdownOptionTextSelected: {
    color: colors.accent.primary,
    fontWeight: "600",
  },
  marginIndicator: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.bg.card,
    marginBottom: 16,
  },
  marginText: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },
  marginVal: {
    fontWeight: "700",
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: colors.accent.danger,
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
    flex: 1,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: "#93c5fd",
  },
  submitButtonText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 15,
    marginLeft: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  segmentContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: colors.bg.card,
  },
  segmentButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  segmentTextActive: {
    color: colors.bg.card,
    fontWeight: "700",
  },
  slotsContainer: {
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  slotsSubheader: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  slotInput: {
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: colors.bg.card,
    color: colors.text.primary,
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
})
};
;
