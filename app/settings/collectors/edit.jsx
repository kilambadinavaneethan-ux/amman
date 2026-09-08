import React, { useContext, useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { CollectorContext } from "../../context/CollectorContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import ContactsModal from "../../components/ContactsModal";
import { useTheme } from "../../context/ThemeContext";

function EditCollectorScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams(); // Route parameter 'id' for the collector
  const { collectors, updateCollector, loading } = useContext(CollectorContext);

  const [contactsModalVisible, setContactsModalVisible] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("Active"); // "Active" | "Inactive"
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const collector = collectors.find((c) => c.id === id);

  // Initialize fields once collector data is loaded
  useEffect(() => {
    if (collector) {
      setName(collector.name || "");
      setMobile(collector.mobile || "");
      setArea(collector.area || "");
      setStatus(collector.status || "Active");
      setNotes(collector.notes || "");
    }
  }, [collector]);

  if (loading && !collector) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading collector profile...</Text>
      </View>
    );
  }

  if (!collector) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={colors.accent.danger} />
        <Text style={styles.errorTitle}>Collector Not Found</Text>
        <Text style={styles.errorDesc}>The money collector you are trying to edit does not exist.</Text>
        <Pressable style={styles.backLink} onPress={() => router.push("/settings/collectors")}>
          <Text style={styles.backLinkText}>Return to List</Text>
        </Pressable>
      </View>
    );
  }

  const handleSave = async () => {
    setError("");

    // Validations
    if (!name.trim()) {
      setError("Collector Name is required.");
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

    setSaving(true);
    try {
      const ok = await updateCollector(collector.id, {
        name: name.trim(),
        mobile: mobile.trim(),
        area: area.trim(),
        status,
        notes: notes.trim(),
      });

      if (ok) {
        // Go back to details view
        router.push({ pathname: "/settings/collectors/details", params: { id: collector.id } });
      } else {
        setError("Failed to update collector in Firestore database.");
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
          <BackButton label="Cancel" onPress={() => router.push({ pathname: "/settings/collectors/details", params: { id: collector.id } })} />
          <Text style={styles.title}>Edit Collector</Text>
        </View>

        <View style={styles.formCard}>
          {/* Import from Contacts Button */}
          <Pressable
            style={styles.importContactsBtn}
            onPress={() => setContactsModalVisible(true)}
            disabled={saving}
          >
            <MaterialIcons name="import-contacts" size={20} color={colors.accent.primary} />
            <Text style={styles.importContactsBtnText}>Import From Contacts</Text>
          </Pressable>

          {/* Collector Name */}
          <Text style={styles.label}>Collector Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Anand Sharma"
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

          {/* Area / Region */}
          <Text style={styles.label}>Assigned Area / Region</Text>
          <TextInput
            style={styles.input}
            value={area}
            onChangeText={setArea}
            placeholder="e.g. Sector-15, Rohini"
            placeholderTextColor={colors.text.muted}
            editable={!saving}
          />

          {/* Status Picker (Active / Inactive) */}
          <Text style={styles.label}>Status</Text>
          <View style={styles.statusContainer}>
            <Pressable
              style={[
                styles.statusBtn,
                status === "Active" && styles.statusBtnActive,
              ]}
              onPress={() => !saving && setStatus("Active")}
            >
              <MaterialIcons
                name="check-circle"
                size={18}
                color={status === "Active" ? "#1A1D27" : colors.text.muted}
              />
              <Text
                style={[
                  styles.statusBtnText,
                  status === "Active" && styles.statusBtnTextActive,
                ]}
              >
                Active
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.statusBtn,
                status === "Inactive" && styles.statusBtnInactive,
              ]}
              onPress={() => !saving && setStatus("Inactive")}
            >
              <MaterialIcons
                name="cancel"
                size={18}
                color={status === "Inactive" ? "#1A1D27" : colors.text.muted}
              />
              <Text
                style={[
                  styles.statusBtnText,
                  status === "Inactive" && styles.statusBtnTextInactive,
                ]}
              >
                Inactive
              </Text>
            </Pressable>
          </View>

          {/* Notes */}
          <Text style={styles.label}>Notes / Remarks</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional information, notes about availability..."
            placeholderTextColor={colors.text.muted}
            multiline={true}
            numberOfLines={4}
            editable={!saving}
          />

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error" size={16} color={colors.accent.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Save Button */}
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.buttonPressed,
              saving && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.bg.card} />
            ) : (
              <>
                <MaterialIcons name="save" size={20} color={colors.bg.card} />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

export default function EditCollectorRoute() {
  return (
    <ProtectedRoute>
      <EditCollectorScreen />
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
    marginBottom: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.muted,
    marginLeft: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text.primary,
  },
  formCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    padding: 16,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  importContactsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: "#6C5CE740",
    borderRadius: 12,
    backgroundColor: "#6C5CE720",
    marginBottom: 20,
  },
  importContactsBtnText: {
    color: colors.accent.primary,
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 6,
    marginLeft: 2,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: colors.text.primary,
    backgroundColor: colors.bg.primary,
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
    paddingVertical: 12,
  },
  statusContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statusBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.card,
    gap: 6,
  },
  statusBtnActive: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  statusBtnInactive: {
    backgroundColor: colors.text.muted,
    borderColor: colors.text.muted,
  },
  statusBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.muted,
  },
  statusBtnTextActive: {
    color: colors.bg.card,
    fontWeight: "700",
  },
  statusBtnTextInactive: {
    color: colors.bg.card,
    fontWeight: "700",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    padding: 10,
    borderRadius: 12,
    marginBottom: 16,
    gap: 6,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "600",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
    marginTop: 12,
    marginBottom: 6,
  },
  errorDesc: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: "center",
    marginBottom: 16,
  },
  backLink: {
    backgroundColor: colors.accent.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  backLinkText: {
    color: colors.bg.card,
    fontWeight: "700",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent.primary,
    height: 52,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  saveButtonText: {
    color: colors.bg.card,
    fontSize: 16,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
};
;
