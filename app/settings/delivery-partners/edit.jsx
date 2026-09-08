import React, { useContext, useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { DeliveryPartnerContext } from "../../context/DeliveryPartnerContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import ContactsModal from "../../components/ContactsModal";
import { useTheme } from "../../context/ThemeContext";

const VEHICLE_TYPES = ["Mini Truck", "Pickup", "Tractor", "Lorry", "Other"];

function EditDeliveryPartner() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { partnerId } = useLocalSearchParams();
  const { partners, updatePartner, loading } = useContext(DeliveryPartnerContext);

  const [contactsModalVisible, setContactsModalVisible] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [vehicleType, setVehicleType] = useState("Mini Truck");
  const [showDropdown, setShowDropdown] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("Active"); // "Active" | "Inactive"

  const [deliveryRateType, setDeliveryRateType] = useState("fixed amount");
  const [deliveryRate, setDeliveryRate] = useState("");
  const [minimumRate, setMinimumRate] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const partner = partners.find((p) => p.id === partnerId);

  // Initialize fields once partner data is loaded
  useEffect(() => {
    if (partner) {
      setName(partner.name || "");
      setMobile(partner.mobile || "");
      setVehicleType(partner.vehicleType || "Mini Truck");
      setVehicleNumber(partner.vehicleNumber || "");
      setAddress(partner.address || "");
      setStatus(partner.status || "Active");
      setDeliveryRateType(partner.deliveryRateType || "fixed amount");
      setDeliveryRate(partner.deliveryRate !== undefined && partner.deliveryRate !== null ? partner.deliveryRate.toString() : "");
      setMinimumRate(partner.minimumRate !== undefined && partner.minimumRate !== null ? partner.minimumRate.toString() : "");
    }
  }, [partner]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.loadingText}>Loading delivery partner details...</Text>
      </View>
    );
  }

  if (!partner) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={colors.accent.danger} />
        <Text style={styles.errorTitle}>Partner Not Found</Text>
        <Text style={styles.errorDesc}>The delivery partner you are trying to edit does not exist.</Text>
        <Pressable style={styles.backLink} onPress={() => router.push("/settings/delivery-partners")}>
          <Text style={styles.backLinkText}>Return to List</Text>
        </Pressable>
      </View>
    );
  }

  const handleSave = async () => {
    setError("");

    // Validations
    if (!name.trim()) {
      setError("Partner Name is required.");
      return;
    }

    if (!mobile.trim()) {
      setError("Mobile Number is required.");
      return;
    }

    // Phone digits validator
    const mobileRegex = /^[0-9+\-\s()]{7,15}$/;
    if (!mobileRegex.test(mobile.trim())) {
      setError("Please enter a valid mobile phone number.");
      return;
    }

    let rateNum = 0;
    if (deliveryRate.trim()) {
      rateNum = parseFloat(deliveryRate);
      if (isNaN(rateNum) || rateNum < 0) {
        setError("Delivery Rate must be a valid positive number.");
        return;
      }
    }

    let minRateNum = 0;
    if (minimumRate.trim()) {
      minRateNum = parseFloat(minimumRate);
      if (isNaN(minRateNum) || minRateNum < 0) {
        setError("Minimum Rate must be a valid positive number.");
        return;
      }
    }

    setSaving(true);
    try {
      const ok = await updatePartner(partner.id, {
        name: name.trim(),
        mobile: mobile.trim(),
        vehicleType,
        vehicleNumber: vehicleNumber.trim(),
        address: address.trim(),
        status,
        deliveryRateType,
        deliveryRate: rateNum,
        minimumRate: minRateNum,
      });

      if (ok) {
        // Go back to the details page, which expects parameter "id"
        router.push({ pathname: "/settings/delivery-partners/details", params: { id: partner.id } });
      } else {
        setError("Failed to update delivery partner in Firestore database.");
      }
    } catch (e) {
      setError(e.message || "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectContact = (contact) => {
    if (contact.name) setName(contact.name);
    if (contact.phone) setMobile(contact.phone);
  };

  return (
    <>
      <ContactsModal
        visible={contactsModalVisible}
        onClose={() => setContactsModalVisible(false)}
        onSelectContact={handleSelectContact}
      />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <BackButton label="Cancel" onPress={() => router.push({ pathname: "/settings/delivery-partners/details", params: { id: partner.id } })} />
          <Text style={styles.title}>Edit Delivery Partner</Text>
        </View>

        <View style={styles.formCard}>
          {/* Import from Contacts Button */}
          <Pressable
            style={styles.importContactsBtn}
            onPress={() => setContactsModalVisible(true)}
            disabled={saving}
          >
            <MaterialIcons name="import-contacts" size={20} color="#16a34a" />
            <Text style={styles.importContactsBtnText}>Import From Contacts</Text>
          </Pressable>

          {/* Partner Name */}
          <Text style={styles.label}>Partner Name *</Text>
          <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Ramesh Kumar"
          placeholderTextColor={colors.text.muted}
          editable={!saving}
        />

        {/* Mobile Number */}
        <Text style={styles.label}>Mobile Number *</Text>
        <TextInput
          style={styles.input}
          value={mobile}
          onChangeText={setMobile}
          placeholder="e.g. 9876543210"
          placeholderTextColor={colors.text.muted}
          keyboardType="phone-pad"
          editable={!saving}
        />

        {/* Vehicle Type Dropdown */}
        <Text style={styles.label}>Vehicle Type</Text>
        <View style={styles.dropdownContainer}>
          <Pressable 
            style={[styles.dropdownButton, showDropdown && styles.dropdownActive]} 
            onPress={() => !saving && setShowDropdown(!showDropdown)}
          >
            <Text style={styles.dropdownButtonText}>{vehicleType}</Text>
            <MaterialIcons 
              name={showDropdown ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
              size={24} 
              color={colors.text.secondary} 
            />
          </Pressable>
          
          {showDropdown && (
            <View style={styles.dropdownOptions}>
              {VEHICLE_TYPES.map((type) => {
                const isSelected = vehicleType === type;
                return (
                  <Pressable
                    key={type}
                    style={[styles.dropdownOption, isSelected && styles.dropdownOptionSelected]}
                    onPress={() => {
                      setVehicleType(type);
                      setShowDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownOptionText, isSelected && styles.dropdownOptionTextSelected]}>
                      {type}
                    </Text>
                    {isSelected && (
                      <MaterialIcons name="check" size={18} color="#16a34a" />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Vehicle Number */}
        <Text style={styles.label}>Vehicle Number</Text>
        <TextInput
          style={styles.input}
          value={vehicleNumber}
          onChangeText={setVehicleNumber}
          placeholder="e.g. KA-01-ME-1234"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="characters"
          editable={!saving}
        />

        {/* Address */}
        <Text style={styles.label}>Address</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={address}
          onChangeText={setAddress}
          placeholder="Enter driver's physical address..."
          placeholderTextColor={colors.text.muted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          editable={!saving}
        />

        {/* Delivery Rate Type */}
        <Text style={styles.label}>Delivery Rate Type</Text>
        <View style={styles.statusRow}>
          {[
            { label: "Kilometre", value: "kilometre" },
            { label: "Per Brick", value: "per brick" },
            { label: "Fixed Amount", value: "fixed amount" },
          ].map((type) => {
            const isSelected = deliveryRateType === type.value;
            return (
              <Pressable
                key={type.value}
                style={[
                  styles.statusPill,
                  isSelected && styles.statusActive,
                ]}
                onPress={() => setDeliveryRateType(type.value)}
                disabled={saving}
              >
                <Text style={[styles.statusText, isSelected && styles.statusTextSelected]}>
                  {type.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Delivery Rate Input */}
        <Text style={styles.label}>
          {deliveryRateType === "kilometre"
            ? "Delivery Rate (₹ per KM)"
            : deliveryRateType === "per brick"
            ? "Delivery Rate (₹ per Brick)"
            : "Delivery Rate (Fixed ₹)"}
        </Text>
        <TextInput
          style={styles.input}
          value={deliveryRate}
          onChangeText={setDeliveryRate}
          placeholder="e.g. 15.00"
          placeholderTextColor={colors.text.muted}
          keyboardType="numeric"
          editable={!saving}
        />

        {/* Minimum Rate Input */}
        <Text style={styles.label}>Minimum Rate (₹)</Text>
        <TextInput
          style={styles.input}
          value={minimumRate}
          onChangeText={setMinimumRate}
          placeholder="e.g. 100.00"
          placeholderTextColor={colors.text.muted}
          keyboardType="numeric"
          editable={!saving}
        />

        {/* Status Toggle */}
        <Text style={styles.label}>Status</Text>
        <View style={styles.statusRow}>
          {["Active", "Inactive"].map((state) => {
            const isSelected = status === state;
            return (
              <Pressable
                key={state}
                style={[
                  styles.statusPill,
                  isSelected && (state === "Active" ? styles.statusActive : styles.statusInactive),
                ]}
                onPress={() => setStatus(state)}
                disabled={saving}
              >
                <Text style={[styles.statusText, isSelected && styles.statusTextSelected]}>
                  {state}
                </Text>
              </Pressable>
            );
          })}
        </View>

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
              <MaterialIcons name="check-circle" size={20} color={colors.bg.card} />
              <Text style={styles.submitButtonText}>Save Changes</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
    </>
  );
}

export default function EditDeliveryPartnerRoute() {
  return (
    <ProtectedRoute>
      <EditDeliveryPartner />
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
    backgroundColor: "#16a34a",
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
  importContactsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#16a34a",
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 20,
  },
  importContactsBtnText: {
    color: "#16a34a",
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 8,
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
    borderColor: "#16a34a",
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
    backgroundColor: "#f0fdf4",
  },
  dropdownOptionText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  dropdownOptionTextSelected: {
    color: "#16a34a",
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  statusPill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
  },
  statusActive: {
    backgroundColor: "#dcfce7",
    borderColor: "#16a34a",
  },
  statusInactive: {
    backgroundColor: colors.border.subtle,
    borderColor: colors.text.muted,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.muted,
  },
  statusTextSelected: {
    color: colors.text.primary,
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
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: "#86efac",
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
})
};
;
