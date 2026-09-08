import React, { useContext, useState, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { UserContext } from "../context/UserContext";
import ProtectedRoute from "../components/ProtectedRoute";
import BackButton from "../components/BackButton";

const CURRENCIES = [
  { symbol: "$", name: "USD (Dollar)" },
  { symbol: "€", name: "EUR (Euro)" },
  { symbol: "£", name: "GBP (Pound)" },
  { symbol: "¥", name: "JPY (Yen)" },
  { symbol: "₹", name: "INR (Rupee)" },
];

const CATEGORIES = [
  "Retail Store",
  "Wholesale Distributor",
  "Manufacturing",
  "Service Provider",
  "E-commerce",
  "Food & Beverage",
  "Other Industry",
];

function BusinessSettings() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { profile, loading, updateProfile } = useContext(UserContext);

  const [businessName, setBusinessName] = useState(profile?.businessName || "");
  const [businessPhone, setBusinessPhone] = useState(profile?.mobile || profile?.phone || "");
  const [taxRate, setTaxRate] = useState(profile?.taxRate !== undefined ? String(profile.taxRate) : "0");
  const [address, setAddress] = useState(profile?.address || "");
  const [businessCategory, setBusinessCategory] = useState(profile?.businessCategory || "Retail Store");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const isInitializedRef = React.useRef(false);

  React.useEffect(() => {
    if (profile && !isInitializedRef.current) {
      isInitializedRef.current = true;
      setBusinessName(profile.businessName || "");
      setBusinessPhone(profile.mobile || profile.phone || "");
      setTaxRate(profile.taxRate !== undefined ? String(profile.taxRate) : "0");
      setAddress(profile.address || "");
      setBusinessCategory(profile.businessCategory || "Retail Store");
    }
  }, [profile]);

  const handleSave = async () => {
    setError("");
    setSuccess(false);

    if (!businessName.trim()) {
      setError("Business Name cannot be empty.");
      return;
    }

    const numericTax = Number(taxRate);
    if (isNaN(numericTax) || numericTax < 0 || numericTax > 100) {
      setError("Tax Rate must be a valid number between 0% and 100%.");
      return;
    }

    setSaving(true);
    try {
      const ok = await updateProfile({
        businessName: businessName.trim(),
        mobile: businessPhone.trim(),
        phone: businessPhone.trim(),
        taxRate: numericTax,
        currency: "₹",
        address: address.trim(),
        businessCategory,
      });

      if (ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError("Failed to save business configurations.");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        <BackButton label="Settings" onPress={() => router.push("/settings")} />
        <Text style={styles.title}>Business Settings</Text>
      </View>

      <View style={styles.formCard}>
        {/* Currency badge (Read-Only) */}
        <View style={styles.currencyBadgeWrapper}>
          <MaterialIcons name="monetization-on" size={20} color="#3b82f6" />
          <Text style={styles.currencyBadgeText}>Default Currency: INR (Rupee — ₹)</Text>
        </View>

        {/* Business Name */}
        <Text style={styles.label}>Business Name</Text>
        <TextInput
          style={styles.input}
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="e.g. Acme Corp"
          placeholderTextColor={colors.text.muted}
          editable={!saving}
        />

        {/* Business Phone */}
        <Text style={styles.label}>Business Contact Number</Text>
        <TextInput
          style={styles.input}
          value={businessPhone}
          onChangeText={setBusinessPhone}
          placeholder="e.g. +91 98765 43210"
          placeholderTextColor={colors.text.muted}
          keyboardType="phone-pad"
          editable={!saving}
        />

        {/* Tax Rate */}
        <Text style={styles.label}>Sales Tax Rate (%)</Text>
        <View style={styles.taxInputWrapper}>
          <TextInput
            style={styles.taxInput}
            value={taxRate}
            onChangeText={setTaxRate}
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            keyboardType="numeric"
            editable={!saving}
          />
          <View style={styles.taxPercentageBadge}>
            <Text style={styles.taxPercentageText}>%</Text>
          </View>
        </View>
        <Text style={styles.helperText}>Applied automatically for pricing sheets and margins.</Text>

        {/* Business Category */}
        <Text style={styles.label}>Business Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => {
              const isSelected = businessCategory === cat;
              return (
                <Pressable
                  key={cat}
                  style={[styles.categoryPill, isSelected && styles.categoryPillSelected]}
                  onPress={() => setBusinessCategory(cat)}
                >
                  <Text style={[styles.categoryText, isSelected && styles.categoryTextSelected]}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Address */}
        <Text style={styles.label}>Business Address</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={address}
          onChangeText={setAddress}
          placeholder="123 Commerce St, Suite 400&#10;New York, NY 10001"
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

        {success ? (
          <View style={styles.successAlert}>
            <MaterialIcons name="check-circle" size={18} color={colors.accent.success} />
            <Text style={styles.successText}>Business configurations updated successfully!</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            saving && styles.saveButtonDisabled,
            pressed && !saving && styles.buttonPressed,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.text.inverse} />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color={colors.text.inverse} />
              <Text style={styles.saveButtonText}>Save Configurations</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default function BusinessRoute() {
  return (
    <ProtectedRoute>
      <BusinessSettings />
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
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg.card,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.secondary,
    fontSize: 16,
    fontWeight: "500",
  },
  header: {
    marginBottom: 20,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.secondary,
    marginBottom: 8,
    marginLeft: 2,
  },
  currencyBadgeWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  currencyBadgeText: {
    color: "#1e3a8a",
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 8,
  },
  taxInputWrapper: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 4,
  },
  taxInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    padding: 12,
    fontSize: 15,
    backgroundColor: colors.bg.primary,
    color: colors.text.primary,
  },
  taxPercentageBadge: {
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: colors.border.medium,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  taxPercentageText: {
    fontWeight: "700",
    color: colors.text.secondary,
    fontSize: 16,
  },
  helperText: {
    fontSize: 12,
    color: colors.text.muted,
    marginBottom: 20,
    marginLeft: 2,
  },
  categoryScroll: {
    marginBottom: 20,
    flexDirection: "row",
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
  },
  categoryPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.bg.primary,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
  },
  categoryPillSelected: {
    backgroundColor: "#f5f3ff",
    borderColor: "#8b5cf6",
  },
  categoryText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  categoryTextSelected: {
    color: "#7c3aed",
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
    height: 90,
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent.dangerMuted,
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
  successAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#6ee7b7",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  successText: {
    color: colors.accent.success,
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
    flex: 1,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: "#93c5fd",
  },
  saveButtonText: {
    color: colors.text.inverse,
    fontWeight: "700",
    fontSize: 15,
    marginLeft: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
};