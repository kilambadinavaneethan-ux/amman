import React, { useContext, useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { RawMaterialSupplierContext } from "../../../context/RawMaterialSupplierContext";
import { ItemContext } from "../../../context/ItemContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import BackButton from "../../../components/BackButton";
import { useTheme } from "../../../context/ThemeContext";

function EditSupplierScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { suppliers, updateSupplier } = useContext(RawMaterialSupplierContext);
  const { items } = useContext(ItemContext);

  const rawMaterials = items.filter(i => i.itemType === "raw_material");

  const supplier = suppliers.find((s) => s.id === id);

  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("active");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleMaterial = (mId) => {
    if (selectedMaterials.includes(mId)) {
      setSelectedMaterials(selectedMaterials.filter(id => id !== mId));
    } else {
      setSelectedMaterials([...selectedMaterials, mId]);
    }
  };

  // Initialize fields
  useEffect(() => {
    if (supplier) {
      setName(supplier.name || "");
      setContactPerson(supplier.contactPerson || "");
      setPhone(supplier.phone || "");
      setEmail(supplier.email || "");
      setAddress(supplier.address || "");
      setBalance(supplier.balance !== undefined ? String(supplier.balance) : "0");
      setStatus(supplier.status || "active");
      setSelectedMaterials(supplier.suppliedMaterials || []);
      setNotes(supplier.notes || "");
    }
  }, [supplier]);

  if (!supplier) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={colors.accent.danger} />
        <Text style={styles.errorTitle}>Supplier Not Found</Text>
        <Text style={styles.errorDesc}>The supplier you are trying to edit does not exist or has been deleted.</Text>
        <Pressable style={styles.backLink} onPress={() => router.push("/settings/raw-materials/suppliers")}>
          <Text style={styles.backLinkText}>Return to List</Text>
        </Pressable>
      </View>
    );
  }

  const handleSave = async () => {
    setError("");

    if (!name.trim()) {
      setError("Supplier Company Name is required.");
      return;
    }

    const parsedBalance = parseFloat(balance);
    if (isNaN(parsedBalance)) {
      setError("Outstanding Balance must be a valid number.");
      return;
    }

    setSaving(true);

    try {
      const ok = await updateSupplier(supplier.id, {
        name: name.trim(),
        contactPerson: contactPerson.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        balance: parsedBalance,
        status,
        suppliedMaterials: selectedMaterials,
        notes: notes.trim(),
      });

      if (ok) {
        router.push({ pathname: "/settings/raw-materials/suppliers/details", params: { id: supplier.id } });
      } else {
        setError("Failed to update supplier details in Firestore.");
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
        <BackButton label="Cancel" onPress={() => router.push({ pathname: "/settings/raw-materials/suppliers/details", params: { id: supplier.id } })} />
        <Text style={styles.title}>Edit Supplier</Text>
      </View>

      <View style={styles.formCard}>
        {error ? (
          <View style={styles.errorAlert}>
            <MaterialIcons name="error-outline" size={18} color={colors.accent.danger} />
            <Text style={styles.errorAlertText}>{error}</Text>
          </View>
        ) : null}

        {/* Company Name */}
        <Text style={styles.label}>Company Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. ACC Cement Distributors"
          placeholderTextColor={colors.text.muted}
          editable={!saving}
        />

        {/* Contact Person */}
        <Text style={styles.label}>Contact Agent</Text>
        <TextInput
          style={styles.input}
          value={contactPerson}
          onChangeText={setContactPerson}
          placeholder="e.g. Mohit Sharma"
          placeholderTextColor={colors.text.muted}
          editable={!saving}
        />

        {/* Phone */}
        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. +91 98765 43210"
          placeholderTextColor={colors.text.muted}
          keyboardType="phone-pad"
          editable={!saving}
        />

        {/* Email */}
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="e.g. accounts@acccement.com"
          placeholderTextColor={colors.text.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!saving}
        />

        {/* Address */}
        <Text style={styles.label}>Office Address</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={address}
          onChangeText={setAddress}
          placeholder="e.g. Sector 5, Industrial Area, Jaipur"
          placeholderTextColor={colors.text.muted}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          editable={!saving}
        />

        {/* Outstanding Owed Balance */}
        <Text style={styles.label}>Outstanding Balance (Debt Owed)</Text>
        <TextInput
          style={styles.input}
          value={balance}
          onChangeText={setBalance}
          placeholder="e.g. 150.00 (Positive number = owed to supplier, Negative = advance)"
          placeholderTextColor={colors.text.muted}
          keyboardType="numeric"
          editable={!saving}
        />

        {/* Supplier Status Selector */}
        <Text style={styles.label}>Supplier Status *</Text>
        <View style={styles.segmentContainer}>
          <Pressable 
            style={[styles.segmentButton, status === "active" && styles.segmentButtonActive]}
            onPress={() => setStatus("active")}
            disabled={saving}
          >
            <MaterialIcons name="check-circle" size={16} color={status === "active" ? "#6C5CE7" : colors.text.secondary} style={{ marginRight: 6 }} />
            <Text style={[styles.segmentText, status === "active" && styles.segmentTextActive]}>Active</Text>
          </Pressable>
          <Pressable 
            style={[styles.segmentButton, status === "inactive" && styles.segmentButtonActive]}
            onPress={() => setStatus("inactive")}
            disabled={saving}
          >
            <MaterialIcons name="cancel" size={16} color={status === "inactive" ? "#ef4444" : colors.text.secondary} style={{ marginRight: 6 }} />
            <Text style={[styles.segmentText, status === "inactive" && styles.segmentTextActive]}>Inactive</Text>
          </Pressable>
        </View>

        {/* Supplied Materials Checklist */}
        <Text style={styles.label}>Supplied Raw Materials</Text>
        <View style={styles.materialsListGrid}>
          {rawMaterials.length === 0 ? (
            <Text style={styles.noMaterialsText}>No raw materials registered in the catalog yet.</Text>
          ) : (
            rawMaterials.map((rm) => {
              const isSelected = selectedMaterials.includes(rm.id);
              return (
                <Pressable
                  key={rm.id}
                  style={[styles.materialTag, isSelected && styles.materialTagActive]}
                  onPress={() => toggleMaterial(rm.id)}
                  disabled={saving}
                >
                  <MaterialIcons
                    name={isSelected ? "check-box" : "check-box-outline-blank"}
                    size={18}
                    color={isSelected ? "#6C5CE7" : colors.text.muted}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.materialTagText, isSelected && styles.materialTagTextActive]} numberOfLines={1}>
                    {rm.itemName}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>

        {/* Notes */}
        <Text style={styles.label}>Internal Notes (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. Offers 30-day credit period"
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
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default function EditSupplierRoute() {
  return (
    <ProtectedRoute>
      <EditSupplierScreen />
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
    justifyContainer: "center",
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
    color: colors.text.primary,
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
  textArea: {
    height: 80,
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
  segmentContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    backgroundColor: colors.bg.card,
  },
  segmentButtonActive: {
    borderColor: colors.accent.primary,
    backgroundColor: "#6C5CE720",
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.muted,
  },
  segmentTextActive: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
  materialsListGrid: {
    flexDirection: "column",
    gap: 8,
    backgroundColor: colors.bg.primary,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    marginBottom: 4,
  },
  noMaterialsText: {
    color: colors.text.muted,
    fontSize: 13,
    fontStyle: "italic",
  },
  materialTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg.card,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
  },
  materialTagActive: {
    borderColor: "#6C5CE740",
    backgroundColor: "#6C5CE720",
  },
  materialTagText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text.secondary,
    flex: 1,
  },
  materialTagTextActive: {
    color: colors.accent.primary,
    fontWeight: "700",
  },
})
};
;
