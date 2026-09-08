import React, { useContext, useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { WorkerContext } from "../../context/WorkerContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";

const WORKER_ROLES = ["Labour", "Operator", "Helper", "Driver", "Supervisor", "Other"];
const WAGE_TYPES = ["Daily", "Weekly", "Monthly"];

function EditWorker() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { workers, updateWorker } = useContext(WorkerContext);

  const worker = workers.find((w) => w.id === id);

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState("Labour");
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [billingSystem, setBillingSystem] = useState("Time-Based");
  const [wageType, setWageType] = useState("Daily");
  const [dailyWage, setDailyWage] = useState("");
  const [pieceRate, setPieceRate] = useState("");
  const [perDayBagsCount, setPerDayBagsCount] = useState("");
  const [overtimeRate, setOvertimeRate] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Active");
  const [hasShifting, setHasShifting] = useState(false);
  const [loadingCost, setLoadingCost] = useState("");
  const [unloadingCost, setUnloadingCost] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (worker) {
      setName(worker.name || "");
      setMobile(worker.mobile || "");
      setRole(worker.role || "Labour");
      setBillingSystem(worker.billingSystem || "Time-Based");
      setWageType(worker.wageType || "Daily");
      setDailyWage(String(worker.dailyWage || ""));
      setPieceRate(String(worker.pieceRate || ""));
      setPerDayBagsCount(String(worker.perDayBagsCount || ""));
      setOvertimeRate(String(worker.overtimeRate || ""));
      setAddress(worker.address || "");
      setIdNumber(worker.idNumber || "");
      setEmergencyContact(worker.emergencyContact || "");
      setNotes(worker.notes || "");
      setStatus(worker.status || "Active");
      setHasShifting(!!worker.hasShifting);
      setLoadingCost(worker.loadingCost ? String(worker.loadingCost) : "");
      setUnloadingCost(worker.unloadingCost ? String(worker.unloadingCost) : "");
    }
  }, [worker]);

  const handleSave = async () => {
    setError("");

    if (!name.trim()) { setError("Worker Name is required."); return; }
    if (!mobile.trim()) { setError("Mobile Number is required."); return; }

    const mobileRegex = /^[0-9+\-\s()]{7,15}$/;
    if (!mobileRegex.test(mobile.trim())) { setError("Please enter a valid mobile phone number."); return; }

    let wageNum = 0;
    if (billingSystem === "Time-Based") {
      if (dailyWage.trim()) {
        wageNum = parseFloat(dailyWage);
        if (isNaN(wageNum) || wageNum < 0) { setError("Wage must be a valid positive number."); return; }
      }
    }

    let pieceRateNum = 0;
    let bagsCountNum = 0;
    if (billingSystem === "Piece-Rate") {
      if (!pieceRate.trim()) {
        setError("Rate per piece is required for Piece-Rate billing.");
        return;
      }
      pieceRateNum = parseFloat(pieceRate);
      if (isNaN(pieceRateNum) || pieceRateNum < 0) {
        setError("Rate per piece must be a valid positive number.");
        return;
      }

      if (perDayBagsCount.trim()) {
        bagsCountNum = parseInt(perDayBagsCount, 10);
        if (isNaN(bagsCountNum) || bagsCountNum < 0) {
          setError("Per Day Bags Count must be a valid positive integer.");
          return;
        }
      }
    }

    let overtimeNum = 0;
    if (billingSystem === "Time-Based" && overtimeRate.trim()) {
      overtimeNum = parseFloat(overtimeRate);
      if (isNaN(overtimeNum) || overtimeNum < 0) { setError("Overtime Rate must be a valid positive number."); return; }
    }

    let loadingCostNum = 0;
    let unloadingCostNum = 0;
    if (hasShifting) {
      if (loadingCost.trim()) {
        loadingCostNum = parseFloat(loadingCost);
        if (isNaN(loadingCostNum) || loadingCostNum < 0) { setError("Loading Cost must be a valid positive number."); return; }
      }
      if (unloadingCost.trim()) {
        unloadingCostNum = parseFloat(unloadingCost);
        if (isNaN(unloadingCostNum) || unloadingCostNum < 0) { setError("Unloading Cost must be a valid positive number."); return; }
      }
    }

    setSaving(true);
    try {
      const success = await updateWorker(id, {
        name: name.trim(),
        mobile: mobile.trim(),
        role,
        billingSystem,
        wageType: billingSystem === "Time-Based" ? wageType : "Daily",
        dailyWage: billingSystem === "Time-Based" ? wageNum : 0,
        pieceRate: billingSystem === "Piece-Rate" ? pieceRateNum : 0,
        perDayBagsCount: billingSystem === "Piece-Rate" ? bagsCountNum : 0,
        overtimeRate: billingSystem === "Time-Based" ? (overtimeNum || wageNum / 8) : 0,
        address: address.trim(),
        idNumber: idNumber.trim(),
        emergencyContact: emergencyContact.trim(),
        notes: notes.trim(),
        status,
        hasShifting,
        loadingCost: hasShifting ? loadingCostNum : 0,
        unloadingCost: hasShifting ? unloadingCostNum : 0,
      });

      if (success) {
        router.push({ pathname: "/settings/workers/details", params: { id } });
      } else {
        setError("Failed to update worker in database.");
      }
    } catch (e) {
      setError(e.message || "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  if (!worker) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading worker...</Text>
      </View>
    );
  }

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
              router.push({ pathname: "/settings/workers/details", params: { id } });
            }
          }}
        />
        <Text style={styles.title}>Edit Worker</Text>
      </View>

      <View style={styles.formCard}>
        {/* Name */}
        <Text style={styles.label}>Worker Name *</Text>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Raju Kumar" placeholderTextColor={colors.text.muted} style={styles.input} />

        {/* Phone */}
        <Text style={styles.label}>Mobile Number *</Text>
        <TextInput value={mobile} onChangeText={setMobile} placeholder="e.g. +91 98765 43210" placeholderTextColor={colors.text.muted} keyboardType="phone-pad" style={styles.input} />

        {/* Role Dropdown */}
        <Text style={styles.label}>Role / Designation</Text>
        <Pressable style={styles.dropdownToggle} onPress={() => setShowRoleDropdown(!showRoleDropdown)}>
          <Text style={styles.dropdownToggleText}>{role}</Text>
          <MaterialIcons name={showRoleDropdown ? "arrow-drop-up" : "arrow-drop-down"} size={24} color={colors.text.muted} />
        </Pressable>
        {showRoleDropdown && (
          <View style={styles.dropdownList}>
            {WORKER_ROLES.map((r) => (
              <Pressable key={r} style={styles.dropdownItem} onPress={() => { setRole(r); setShowRoleDropdown(false); }}>
                <Text style={[styles.dropdownItemText, r === role && { color: colors.accent.primary, fontWeight: "700" }]}>{r}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Billing System */}
        <Text style={styles.label}>Billing System *</Text>
        <View style={styles.segmentRow}>
          {["Time-Based", "Piece-Rate"].map((system) => {
            const active = billingSystem === system;
            return (
              <Pressable
                key={system}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setBillingSystem(system)}
              >
                <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>{system}</Text>
              </Pressable>
            );
          })}
        </View>

        {billingSystem === "Time-Based" ? (
          <>
            {/* Wage Type */}
            <Text style={styles.label}>Wage Type</Text>
            <View style={styles.segmentRow}>
              {WAGE_TYPES.map((wt) => {
                const active = wageType === wt;
                return (
                  <Pressable key={wt} style={[styles.segmentBtn, active && styles.segmentBtnActive]} onPress={() => setWageType(wt)}>
                    <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>{wt}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Wage Amount */}
            <Text style={styles.label}>{wageType} Wage (₹)</Text>
            <TextInput value={dailyWage} onChangeText={setDailyWage} placeholder="e.g. 500" placeholderTextColor={colors.text.muted} keyboardType="numeric" style={styles.input} />

            {/* Overtime Rate */}
            <Text style={styles.label}>Overtime Rate per Hour (₹)</Text>
            <TextInput value={overtimeRate} onChangeText={setOvertimeRate} placeholder="Auto-calculated if empty" placeholderTextColor={colors.text.muted} keyboardType="numeric" style={styles.input} />
          </>
        ) : (
          <>
            {/* Piece Rate */}
            <Text style={styles.label}>Rate per Piece/Unit (₹) *</Text>
            <TextInput value={pieceRate} onChangeText={setPieceRate} placeholder="e.g. 5" placeholderTextColor={colors.text.muted} keyboardType="numeric" style={styles.input} />

            {/* Per Day Bags Count */}
            <Text style={styles.label}>Per Day Bags Count</Text>
            <TextInput value={perDayBagsCount} onChangeText={setPerDayBagsCount} placeholder="e.g. 50" placeholderTextColor={colors.text.muted} keyboardType="numeric" style={styles.input} />
          </>
        )}

        {/* Shifting Cost Toggle */}
        <Text style={styles.label}>Shifting Cost</Text>
        <View style={styles.segmentRow}>
          {[
            { label: "No Shifting", value: false },
            { label: "Add Shifting Cost", value: true },
          ].map((option) => {
            const active = hasShifting === option.value;
            return (
              <Pressable
                key={option.label}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setHasShifting(option.value)}
              >
                <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {hasShifting && (
          <>
            {/* Loading Cost */}
            <Text style={styles.label}>Loading Cost per Piece/Unit (₹)</Text>
            <TextInput
              value={loadingCost}
              onChangeText={setLoadingCost}
              placeholder="e.g. 0.50"
              placeholderTextColor={colors.text.muted}
              keyboardType="numeric"
              style={styles.input}
            />

            {/* Unloading Cost */}
            <Text style={styles.label}>Unloading Cost per Piece/Unit (₹)</Text>
            <TextInput
              value={unloadingCost}
              onChangeText={setUnloadingCost}
              placeholder="e.g. 0.30"
              placeholderTextColor={colors.text.muted}
              keyboardType="numeric"
              style={styles.input}
            />
          </>
        )}

        {/* ID */}
        <Text style={styles.label}>ID / Aadhaar Number</Text>
        <TextInput value={idNumber} onChangeText={setIdNumber} placeholder="e.g. 1234 5678 9012" placeholderTextColor={colors.text.muted} style={styles.input} />

        {/* Emergency Contact */}
        <Text style={styles.label}>Emergency Contact</Text>
        <TextInput value={emergencyContact} onChangeText={setEmergencyContact} placeholder="Emergency phone" placeholderTextColor={colors.text.muted} keyboardType="phone-pad" style={styles.input} />

        {/* Address */}
        <Text style={styles.label}>Address</Text>
        <TextInput value={address} onChangeText={setAddress} placeholder="Worker address" placeholderTextColor={colors.text.muted} multiline numberOfLines={2} style={[styles.input, { height: 60, paddingVertical: 10 }]} />

        {/* Notes */}
        <Text style={styles.label}>Notes</Text>
        <TextInput value={notes} onChangeText={setNotes} placeholder="Additional notes..." placeholderTextColor={colors.text.muted} multiline numberOfLines={2} style={[styles.input, { height: 60, paddingVertical: 10 }]} />

        {/* Status */}
        <Text style={styles.label}>Status</Text>
        <View style={styles.segmentRow}>
          {["Active", "Inactive"].map((s) => {
            const active = status === s;
            return (
              <Pressable key={s} style={[styles.segmentBtn, active && (s === "Active" ? styles.segmentBtnActiveGreen : styles.segmentBtnActiveRed)]} onPress={() => setStatus(s)}>
                <Text style={[styles.segmentBtnText, active && { color: colors.bg.card }]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <MaterialIcons name="error" size={16} color={colors.accent.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Save */}
        <Pressable style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.bg.card} />
          ) : (
            <>
              <MaterialIcons name="check" size={20} color={colors.bg.card} />
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
  container: { padding: 16, backgroundColor: colors.bg.card, flexGrow: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg.card },
  loadingText: { marginTop: 12, color: colors.text.muted, fontSize: 14 },
  header: { marginBottom: 16 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  backText: { fontSize: 15, fontWeight: "600", color: colors.text.secondary },
  title: { fontSize: 24, fontWeight: "800", color: colors.text.primary },
  formCard: {
    backgroundColor: colors.bg.card, borderWidth: 1.5, borderColor: colors.border.subtle,
    borderRadius: 18, padding: 16, gap: 10,
  },
  label: { fontSize: 13, fontWeight: "700", color: colors.text.primary, marginTop: 4 },
  input: {
    borderWidth: 1.5, borderColor: colors.border.subtle, borderRadius: 10, height: 46,
    paddingHorizontal: 14, fontSize: 15, color: colors.text.primary, backgroundColor: colors.bg.primary,
  },
  dropdownToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1.5, borderColor: colors.border.subtle, borderRadius: 10, paddingHorizontal: 14,
    height: 46, backgroundColor: colors.bg.primary,
  },
  dropdownToggleText: { fontSize: 15, color: colors.text.primary },
  dropdownList: {
    backgroundColor: colors.bg.card, borderWidth: 1.5, borderColor: colors.border.subtle,
    borderRadius: 10, marginTop: -4, overflow: "hidden",
  },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  dropdownItemText: { fontSize: 14, color: colors.text.primary },
  segmentRow: { flexDirection: "row", gap: 8 },
  segmentBtn: {
    flex: 1, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center",
    backgroundColor: colors.border.subtle, borderWidth: 1.5, borderColor: colors.border.subtle,
  },
  segmentBtnActive: { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
  segmentBtnActiveGreen: { backgroundColor: colors.accent.success, borderColor: colors.accent.success },
  segmentBtnActiveRed: { backgroundColor: colors.accent.danger, borderColor: colors.accent.danger },
  segmentBtnText: { fontSize: 13, fontWeight: "700", color: colors.text.muted },
  segmentBtnTextActive: { color: colors.bg.card },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca",
    borderRadius: 10, padding: 10, marginTop: 4,
  },
  errorText: { color: colors.accent.danger, fontSize: 12, fontWeight: "600", flex: 1 },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.accent.primary, height: 48, borderRadius: 12, marginTop: 8,
    shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25,
    shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: colors.bg.card, fontSize: 15, fontWeight: "700" },
})
};
;

export default function EditWorkerRoute() {
  return (
    <ProtectedRoute>
      <EditWorker />
    </ProtectedRoute>
  );
}
