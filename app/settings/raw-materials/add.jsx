import React, { useContext, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ItemContext } from "../../context/ItemContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";

const UNITS = [
  { label: "Bag", value: "bag" },
  { label: "Ton", value: "ton" },
  { label: "CFT", value: "cft" },
  { label: "Kg", value: "kg" },
  { label: "Liter", value: "liter" },
  { label: "Piece", value: "piece" },
];

function AddRawMaterialScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { addItem } = useContext(ItemContext);

  const [itemName, setItemName] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("bag");
  const [costPrice, setCostPrice] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [reorderLevel, setReorderLevel] = useState("5");
  const [description, setDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

    const openStockVal = openingStock.trim() ? parseInt(openingStock, 10) : 0;
    if (isNaN(openStockVal) || openStockVal < 0) {
      setError("Opening Stock must be a valid non-negative integer.");
      return;
    }

    const reorderVal = reorderLevel.trim() ? parseInt(reorderLevel, 10) : 0;
    if (isNaN(reorderVal) || reorderVal < 0) {
      setError("Reorder Threshold must be a valid non-negative integer.");
      return;
    }

    setSaving(true);

    try {
      const itemId = await addItem({
        itemName: itemName.trim(),
        itemType: "raw_material",
        rateType: selectedUnit,
        sellingRate: 0,
        costPrice: costVal,
        openingStock: openStockVal,
        reorderLevel: reorderVal,
        description: description.trim(),
      });

      if (itemId) {
        router.push("/settings/raw-materials");
      } else {
        setError("Failed to register raw material in the database.");
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
              router.push("/settings/raw-materials");
            }
          }}
        />
        <Text style={styles.title}>Register Material</Text>
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
          placeholder="e.g. Cement (Birla), River Sand, Gravel 10mm"
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

        {/* Opening Stock */}
        <Text style={styles.label}>Initial Stock Balance</Text>
        <TextInput
          style={styles.input}
          value={openingStock}
          onChangeText={setOpeningStock}
          placeholder="Defaults to 0"
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
              <Text style={styles.saveBtnText}>Save Material</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default function AddRoute() {
  return (
    <ProtectedRoute>
      <AddRawMaterialScreen />
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
})
};
;
