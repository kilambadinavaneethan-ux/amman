import React, { useContext, useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Switch } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ItemContext } from "../../context/ItemContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";
import { createOrUpdateWastageProduct } from "../../../src/services/wastageService";

const UNITS = [
  { label: "Bag", value: "bag" },
  { label: "Ton", value: "ton" },
  { label: "CFT", value: "cft" },
  { label: "Kg", value: "kg" },
  { label: "Liter", value: "liter" },
  { label: "Piece", value: "piece" },
];

function EditRawMaterialScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { items, updateItem } = useContext(ItemContext);

  const item = items.find((itm) => itm.id === id);

  const [itemName, setItemName] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("bag");
  const [costPrice, setCostPrice] = useState("");
  const [reorderLevel, setReorderLevel] = useState("5");
  const [openingStock, setOpeningStock] = useState("");
  const [description, setDescription] = useState("");

  // Wastage Tracking State
  const [isWastageEnabled, setIsWastageEnabled] = useState(false);
  const [wastageName, setWastageName] = useState("");
  const [wastageSellingRate, setWastageSellingRate] = useState("0");
  const [wastageItemId, setWastageItemId] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Initialize fields
  useEffect(() => {
    if (item) {
      setItemName(item.itemName || "");
      setSelectedUnit(item.rateType || "bag");
      setCostPrice(String(item.costPrice !== undefined ? item.costPrice : "0"));
      setReorderLevel(String(item.reorderLevel !== undefined ? item.reorderLevel : "5"));
      setOpeningStock(String(item.openingStock !== undefined ? item.openingStock : (item.stock || "0")));
      setDescription(item.description || "");

      setIsWastageEnabled(Boolean(item.trackWastage));
      setWastageName(item.wastageName || (item.itemName ? `${item.itemName} Wastage` : ""));
      setWastageSellingRate(String(item.wastageSellingRate !== undefined ? item.wastageSellingRate : "0"));
      setWastageItemId(item.wastageItemId || "");
    }
  }, [item]);

  if (!item) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={colors.accent.danger} />
        <Text style={styles.errorTitle}>Material Not Found</Text>
        <Text style={styles.errorDesc}>The raw material you are trying to edit does not exist or has been deleted.</Text>
        <Pressable style={styles.backLink} onPress={() => router.push("/settings/raw-materials")}>
          <Text style={styles.backLinkText}>Return to Dashboard</Text>
        </Pressable>
      </View>
    );
  }

  const handleWastageToggle = (enabled) => {
    setIsWastageEnabled(enabled);
    if (enabled && !wastageName) {
      if (itemName.toLowerCase().includes("cement")) {
        setWastageName("Cement Bag Wastage");
      } else {
        setWastageName(itemName.trim() ? `${itemName.trim()} Wastage` : "Cement Bag Wastage");
      }
    }
  };

  const handleSave = async () => {
    setError("");

    if (!itemName.trim()) {
      setError("Material Name is required.");
      return;
    }

    const costVal = costPrice.trim() ? parseFloat(costPrice) : 0;
    if (isNaN(costVal) || costVal < 0) {
      setError("Cost Price must be a valid non-negative number.");
      return;
    }

    const reorderVal = reorderLevel.trim() ? parseInt(reorderLevel, 10) : 0;
    if (isNaN(reorderVal) || reorderVal < 0) {
      setError("Reorder Threshold must be a valid non-negative integer.");
      return;
    }

    const openStockVal = openingStock.trim() ? parseInt(openingStock, 10) : 0;
    if (isNaN(openStockVal) || openStockVal < 0) {
      setError("Available Stock Quantity must be a valid non-negative integer.");
      return;
    }

    if (isWastageEnabled && !wastageName.trim()) {
      setError("Wastage Name is required when Wastage Tracking is ON.");
      return;
    }

    setSaving(true);

    try {
      const finalWastageName = isWastageEnabled ? wastageName.trim() : "";
      const finalWastageRate = isWastageEnabled ? parseFloat(wastageSellingRate) || 0 : 0;

      let currentWastageItemId = wastageItemId;
      if (isWastageEnabled) {
        currentWastageItemId = await createOrUpdateWastageProduct(
          item.id,
          itemName.trim(),
          finalWastageName,
          true,
          finalWastageRate,
          wastageItemId,
          selectedUnit
        );
      } else if (item.trackWastage && !isWastageEnabled) {
        await createOrUpdateWastageProduct(
          item.id,
          itemName.trim(),
          finalWastageName,
          false,
          0,
          wastageItemId,
          selectedUnit
        );
      }

      const updatePayload = {
        itemName: itemName.trim(),
        rateType: selectedUnit,
        costPrice: costVal,
        openingStock: openStockVal,
        reorderLevel: reorderVal,
        description: description.trim(),
        trackWastage: isWastageEnabled,
        wastageName: finalWastageName,
        wastageSellingRate: finalWastageRate,
        ...(currentWastageItemId ? { wastageItemId: currentWastageItemId } : {}),
      };

      const ok = await updateItem(item.id, updatePayload);

      if (ok) {
        router.push({ pathname: "/settings/raw-materials/details", params: { id: item.id } });
      } else {
        setError("Failed to update raw material details in Firestore.");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Header Navigation */}
      <View style={styles.header}>
        <BackButton
          label="Cancel"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push({ pathname: "/settings/raw-materials/details", params: { id: item.id } });
            }
          }}
        />
        <Text style={styles.title}>Edit Material</Text>
      </View>

      <View style={styles.formCard}>
        {error ? (
          <View style={styles.errorAlert}>
            <MaterialIcons name="error-outline" size={18} color={colors.accent.danger} />
            <Text style={styles.errorAlertText}>{error}</Text>
          </View>
        ) : null}

        {/* Name */}
        <Text style={styles.label}>Material Name *</Text>
        <TextInput
          style={styles.input}
          value={itemName}
          onChangeText={setItemName}
          placeholder="e.g. Cement (Ultratech)"
          placeholderTextColor={colors.text.muted}
          editable={!saving}
        />

        {/* Unit Selector */}
        <Text style={styles.label}>Unit of Measurement *</Text>
        <View style={styles.unitsGrid}>
          {UNITS.map((u) => {
            const isSelected = selectedUnit === u.value;
            return (
              <Pressable
                key={u.value}
                style={[styles.unitPill, isSelected && styles.unitPillActive]}
                onPress={() => setSelectedUnit(u.value)}
                disabled={saving}
              >
                <Text style={[styles.unitPillText, isSelected && styles.unitPillTextActive]}>
                  {u.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Cost Price */}
        <Text style={styles.label}>Cost Price per Unit</Text>
        <View style={styles.inputWrapper}>
          <View style={styles.inputPrefix}>
            <Text style={styles.inputPrefixText}>$</Text>
          </View>
          <TextInput
            style={[styles.input, { paddingLeft: 36 }]}
            value={costPrice}
            onChangeText={setCostPrice}
            placeholder="0.00"
            placeholderTextColor={colors.text.muted}
            keyboardType="numeric"
            editable={!saving}
          />
        </View>

        {/* Available Stock */}
        <Text style={styles.label}>Available Stock Quantity</Text>
        <TextInput
          style={styles.input}
          value={openingStock}
          onChangeText={setOpeningStock}
          placeholder="0"
          placeholderTextColor={colors.text.muted}
          keyboardType="numeric"
          editable={!saving}
        />

        {/* Reorder Threshold */}
        <Text style={styles.label}>Reorder Alert Threshold</Text>
        <TextInput
          style={styles.input}
          value={reorderLevel}
          onChangeText={setReorderLevel}
          placeholder="Alert when stock falls below this quantity"
          placeholderTextColor={colors.text.muted}
          keyboardType="numeric"
          editable={!saving}
        />

        {/* Description */}
        <Text style={styles.label}>Description & Notes (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Enter storage details, batch notes, or supplier references..."
          placeholderTextColor={colors.text.muted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          editable={!saving}
        />

        {/* Wastage Tracking Card */}
        <View style={styles.wastageCard}>
          <View style={styles.wastageHeader}>
            <View style={[styles.wastageIconWrap, isWastageEnabled && styles.wastageIconWrapActive]}>
              <MaterialIcons
                name="recycling"
                size={22}
                color={isWastageEnabled ? colors.accent.warning : colors.text.muted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.wastageTitle}>Wastage Tracking</Text>
              <Text style={styles.wastageDesc}>
                Auto-generate sellable waste (e.g. empty bags) when this raw material is used.
              </Text>
            </View>
            <Switch
              value={isWastageEnabled}
              onValueChange={handleWastageToggle}
              trackColor={{ false: colors.border.medium, true: colors.accent.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {isWastageEnabled && (
            <View style={styles.wastageExpanded}>
              <Text style={styles.label}>Wastage Item Name (Shown in + Bill) *</Text>
              <TextInput
                style={styles.input}
                value={wastageName}
                onChangeText={setWastageName}
                placeholder="e.g. Cement Bag Wastage, Empty Cement Bags"
                placeholderTextColor={colors.text.muted}
                editable={!saving}
              />
              <Text style={styles.helperText}>
                This name will show under &quot;2. Product details&quot; in + Bill / Invoice with live accumulated stock.
              </Text>

              <Text style={[styles.label, { marginTop: 12 }]}>Wastage Selling Rate (₹ / Unit)</Text>
              <TextInput
                style={styles.input}
                value={wastageSellingRate}
                onChangeText={setWastageSellingRate}
                placeholder="0.00"
                placeholderTextColor={colors.text.muted}
                keyboardType="numeric"
                editable={!saving}
              />
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.buttonPressed, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.bg.card} />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color={colors.bg.card} />
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default function EditRoute() {
  return (
    <ProtectedRoute>
      <EditRawMaterialScreen />
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
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.muted,
    marginLeft: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text.primary,
  },
  formCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 30,
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  errorAlertText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 15,
    color: colors.text.primary,
  },
  inputWrapper: {
    position: "relative",
    justifyContent: "center",
  },
  inputPrefix: {
    position: "absolute",
    left: 14,
    zIndex: 10,
  },
  inputPrefixText: {
    color: colors.text.muted,
    fontSize: 15,
    fontWeight: "600",
  },
  unitsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  unitPill: {
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.bg.primary,
  },
  unitPillActive: {
    borderColor: colors.accent.primary,
    backgroundColor: "#6C5CE720",
  },
  unitPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
  },
  unitPillTextActive: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
  textArea: {
    height: 100,
    paddingVertical: 10,
  },
  saveBtn: {
    backgroundColor: colors.accent.primary,
    height: 48,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  saveBtnDisabled: {
    backgroundColor: "#93c5fd",
  },
  saveBtnText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 15,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  wastageCard: {
    backgroundColor: colors.bg.primary,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  wastageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  wastageIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg.card,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  wastageIconWrapActive: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  wastageTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  wastageDesc: {
    fontSize: 11.5,
    color: colors.text.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  wastageExpanded: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    gap: 8,
  },
  helperText: {
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 15,
  },
})
};
;
