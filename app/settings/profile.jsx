import React, { useContext, useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { UserContext } from "../context/UserContext";
import { useTheme } from "../context/ThemeContext";
import ProtectedRoute from "../components/ProtectedRoute";
import BackButton from "../components/BackButton";
import { saveImageToLocalFolder } from "../../src/services/localImageStorageService";

function ProfileSettings() {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { profile, loading, updateProfile, uploadProfileImage } = useContext(UserContext);

  // Form State
  const [fullName, setFullName] = useState(profile?.fullName || "");
  const [designation, setDesignation] = useState(profile?.designation || "Business Owner");
  const [businessName, setBusinessName] = useState(profile?.businessName || "");
  const [tagline, setTagline] = useState(profile?.tagline || "");
  const [email, setEmail] = useState(profile?.email || "");
  const [mobile, setMobile] = useState(profile?.mobile || profile?.phone || "");
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp || "");
  const [address, setAddress] = useState(profile?.address || "");
  const [gstin, setGstin] = useState(profile?.gstin || profile?.gstNo || "");
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || profile?.logoUrl || "");

  const [newImageUri, setNewImageUri] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);

  // Prevent background Firestore snapshot updates from wiping user typed inputs
  const isInitializedRef = React.useRef(false);

  useEffect(() => {
    if (profile && !isInitializedRef.current) {
      isInitializedRef.current = true;
      setFullName(profile.fullName || "");
      setDesignation(profile.designation || "Business Owner");
      setBusinessName(profile.businessName || "");
      setTagline(profile.tagline || "");
      setEmail(profile.email || "");
      setMobile(profile.mobile || profile.phone || "");
      setWhatsapp(profile.whatsapp || "");
      setAddress(profile.address || "");
      setGstin(profile.gstin || profile.gstNo || "");
      setPhotoURL(profile.photoURL || profile.logoUrl || "");
    }
  }, [profile]);

  // Profile Completion Percentage
  const completionPercentage = useMemo(() => {
    const fields = [fullName, businessName, email, mobile, address, photoURL, gstin, tagline];
    const filled = fields.filter((f) => f && f.toString().trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [fullName, businessName, email, mobile, address, photoURL, gstin, tagline]);

  const handlePickFromGallery = async () => {
    setShowImagePickerModal(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Permission to access photo gallery is required.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const pickedUri = result.assets[0].uri;
        setNewImageUri(pickedUri);
        // Also cache copy in phone local storage folder
        await saveImageToLocalFolder(pickedUri, "avatars", "profile_avatar");
      }
    } catch (e) {
      Alert.alert("Error", "Failed to pick image from gallery.");
    }
  };

  const handleCaptureFromCamera = async () => {
    setShowImagePickerModal(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Permission to access camera is required.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const capturedUri = result.assets[0].uri;
        setNewImageUri(capturedUri);
        // Cache in phone local storage folder
        await saveImageToLocalFolder(capturedUri, "avatars", "profile_avatar");
      }
    } catch (e) {
      Alert.alert("Error", "Failed to capture photo from camera.");
    }
  };

  const handleRemovePhoto = () => {
    setShowImagePickerModal(false);
    setNewImageUri(null);
    setPhotoURL("");
  };

  const handleSave = async () => {
    setError("");
    setSuccess(false);

    // Validations
    if (!fullName.trim()) {
      setError("Full Name is required.");
      return;
    }

    if (!businessName.trim()) {
      setError("Business Name is required.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email.trim() && !emailRegex.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    if (mobile.trim() && mobile.trim().length < 7) {
      setError("Mobile number must be at least 7 digits.");
      return;
    }

    setSaving(true);

    try {
      let finalImageUrl = photoURL;
      if (newImageUri) {
        const uploadUrl = await uploadProfileImage(newImageUri, false);
        if (uploadUrl) {
          finalImageUrl = uploadUrl;
          setPhotoURL(uploadUrl);
          setNewImageUri(null);
        }
      }

      const ok = await updateProfile({
        fullName: fullName.trim(),
        designation: designation.trim(),
        businessName: businessName.trim(),
        tagline: tagline.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        phone: mobile.trim(),
        whatsapp: whatsapp.trim(),
        address: address.trim(),
        gstin: gstin.trim(),
        gstNo: gstin.trim(),
        taxId: gstin.trim(),
        photoURL: finalImageUrl,
        logoUrl: finalImageUrl,
      });

      if (ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3500);
      } else {
        setError("Failed to update profile settings.");
      }
    } catch (err) {
      setError(err?.message || "An unexpected error occurred while saving profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading profile details...</Text>
      </View>
    );
  }

  const currentAvatarUri = newImageUri || photoURL;

  return (
    <View style={styles.outerContainer}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Navigation Header */}
        <View style={styles.header}>
          <BackButton label="Settings" onPress={() => router.push("/settings")} />
          <Text style={styles.title}>Edit Profile Details</Text>
          <Text style={styles.subtitle}>Update owner & business details for your account</Text>
        </View>

        {/* Profile Completion Bar */}
        <View style={styles.completionCard}>
          <View style={styles.completionHeader}>
            <Text style={styles.completionTitle}>Profile Strength</Text>
            <Text style={styles.completionPercent}>{completionPercentage}%</Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${completionPercentage}%` }]} />
          </View>
          <Text style={styles.completionHint}>
            {completionPercentage >= 90
              ? "All essential details completed! Outstanding."
              : "Complete all details for seamless invoices and receipts."}
          </Text>
        </View>

        {/* Profile Avatar Card */}
        <View style={styles.avatarCard}>
          <Pressable
            style={({ pressed }) => [styles.avatarWrapper, pressed && styles.pressed]}
            onPress={() => setShowImagePickerModal(true)}
          >
            {currentAvatarUri ? (
              <Image source={{ uri: currentAvatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>
                  {fullName ? fullName.substring(0, 2).toUpperCase() : "BO"}
                </Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <MaterialIcons name="camera-alt" size={14} color="#FFFFFF" />
            </View>
          </Pressable>
          <Text style={styles.avatarTitle}>{fullName || "Business Owner"}</Text>
          <Text style={styles.avatarRole}>{designation} • {businessName || "My Business"}</Text>
          <Pressable
            style={({ pressed }) => [styles.changePhotoBtn, pressed && styles.pressed]}
            onPress={() => setShowImagePickerModal(true)}
          >
            <MaterialIcons name="edit" size={14} color={colors.accent.primary} />
            <Text style={styles.changePhotoText}>Change Profile Photo / Logo</Text>
          </Pressable>
        </View>

        {/* Section 1: Owner Information */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="person" size={20} color={colors.accent.primary} />
            <Text style={styles.sectionTitle}>Owner Information</Text>
          </View>

          <Text style={styles.label}>Full Name *</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="badge" size={18} color={colors.text.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Rajesh Kumar"
              placeholderTextColor={colors.text.muted}
              editable={!saving}
            />
          </View>

          <Text style={styles.label}>Designation / Role</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="work" size={18} color={colors.text.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={designation}
              onChangeText={setDesignation}
              placeholder="e.g. Founder, General Manager, Owner"
              placeholderTextColor={colors.text.muted}
              editable={!saving}
            />
          </View>
        </View>

        {/* Section 2: Business Info */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="store" size={20} color={colors.accent.info} />
            <Text style={styles.sectionTitle}>Business Details</Text>
          </View>

          <Text style={styles.label}>Business / Company Name *</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="business" size={18} color={colors.text.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="e.g. Acme Enterprises"
              placeholderTextColor={colors.text.muted}
              editable={!saving}
            />
          </View>

          <Text style={styles.label}>Tagline / Slogan</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="subtitles" size={18} color={colors.text.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={tagline}
              onChangeText={setTagline}
              placeholder="e.g. Quality Blocks & Building Supplies"
              placeholderTextColor={colors.text.muted}
              editable={!saving}
            />
          </View>

          <Text style={styles.label}>GSTIN / Tax ID</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="receipt-long" size={18} color={colors.text.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={gstin}
              onChangeText={setGstin}
              placeholder="e.g. 22AAAAA0000A1Z5"
              placeholderTextColor={colors.text.muted}
              autoCapitalize="characters"
              editable={!saving}
            />
          </View>
        </View>

        {/* Section 3: Contact & Address */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="contact-phone" size={20} color={colors.accent.success} />
            <Text style={styles.sectionTitle}>Contact & Location</Text>
          </View>

          <Text style={styles.label}>Primary Mobile Number</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="phone" size={18} color={colors.text.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={mobile}
              onChangeText={setMobile}
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.text.muted}
              keyboardType="phone-pad"
              editable={!saving}
            />
          </View>

          <Text style={styles.label}>WhatsApp Number</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="chat" size={18} color={colors.text.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.text.muted}
              keyboardType="phone-pad"
              editable={!saving}
            />
          </View>

          <Text style={styles.label}>Email Address</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="email" size={18} color={colors.text.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="owner@business.com"
              placeholderTextColor={colors.text.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!saving}
            />
          </View>

          <Text style={styles.label}>Business Address</Text>
          <View style={[styles.inputWrapper, styles.textAreaWrapper]}>
            <MaterialIcons
              name="location-on"
              size={18}
              color={colors.text.muted}
              style={[styles.inputIcon, { marginTop: 12 }]}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              value={address}
              onChangeText={setAddress}
              placeholder="123 Industrial Area, Sector 4, City, State - 500001"
              placeholderTextColor={colors.text.muted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!saving}
            />
          </View>
        </View>

        {/* Toast Alerts */}
        {error ? (
          <View style={styles.errorAlert}>
            <MaterialIcons name="error" size={18} color={colors.accent.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={styles.successAlert}>
            <MaterialIcons name="check-circle" size={18} color={colors.accent.success} />
            <Text style={styles.successText}>Profile & business details updated successfully!</Text>
          </View>
        ) : null}

        {/* Save Button */}
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            saving && styles.saveButtonDisabled,
            pressed && !saving && styles.pressed,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Save Profile Updates</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      {/* Image Picker Modal */}
      <Modal visible={showImagePickerModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowImagePickerModal(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose Profile Image</Text>
            <Text style={styles.modalSub}>Select or take a photo for your account profile & logo</Text>

            <Pressable
              style={({ pressed }) => [styles.modalOption, pressed && styles.pressed]}
              onPress={handlePickFromGallery}
            >
              <MaterialIcons name="photo-library" size={22} color={colors.accent.primary} />
              <Text style={styles.modalOptionText}>Choose from Gallery</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.modalOption, pressed && styles.pressed]}
              onPress={handleCaptureFromCamera}
            >
              <MaterialIcons name="camera-alt" size={22} color={colors.accent.info} />
              <Text style={styles.modalOptionText}>Take Photo with Camera</Text>
            </Pressable>

            {currentAvatarUri ? (
              <Pressable
                style={({ pressed }) => [styles.modalOption, styles.modalOptionDanger, pressed && styles.pressed]}
                onPress={handleRemovePhoto}
              >
                <MaterialIcons name="delete-outline" size={22} color={colors.accent.danger} />
                <Text style={styles.modalOptionDangerText}>Remove Current Photo</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.modalCancelBtn, pressed && styles.pressed]}
              onPress={() => setShowImagePickerModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export default function ProfileRoute() {
  return (
    <ProtectedRoute>
      <ProfileSettings />
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    outerContainer: {
      flex: 1,
      backgroundColor: colors.bg.primary,
    },
    container: {
      padding: spacing.lg,
      paddingBottom: 40,
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: colors.bg.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: {
      marginTop: 12,
      color: colors.text.secondary,
      fontSize: 15,
      fontWeight: "500",
    },
    header: {
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.text.primary,
      marginTop: 8,
    },
    subtitle: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 2,
    },
    pressed: {
      opacity: 0.8,
    },
    // Completion Card
    completionCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.md,
      marginBottom: spacing.lg,
      ...shadows.subtle,
    },
    completionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    completionTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    completionPercent: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.accent.primary,
    },
    progressBarTrack: {
      height: 6,
      backgroundColor: colors.bg.elevated,
      borderRadius: 3,
      overflow: "hidden",
      marginBottom: 6,
    },
    progressBarFill: {
      height: "100%",
      backgroundColor: colors.accent.primary,
      borderRadius: 3,
    },
    completionHint: {
      fontSize: 11,
      color: colors.text.muted,
    },
    // Avatar Card
    avatarCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.lg,
      alignItems: "center",
      marginBottom: spacing.lg,
      ...shadows.card,
    },
    avatarWrapper: {
      position: "relative",
      marginBottom: 12,
    },
    avatarImage: {
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 2,
      borderColor: colors.accent.primary,
    },
    avatarPlaceholder: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.accent.primaryMuted,
      borderWidth: 2,
      borderColor: colors.border.accent,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarInitials: {
      fontSize: 32,
      fontWeight: "800",
      color: colors.accent.primary,
    },
    cameraBadge: {
      position: "absolute",
      bottom: 0,
      right: 0,
      backgroundColor: colors.accent.primary,
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.bg.card,
    },
    avatarTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
    },
    avatarRole: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 2,
      marginBottom: 12,
    },
    changePhotoBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: colors.accent.primaryMuted,
    },
    changePhotoText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    // Section Card
    sectionCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      ...shadows.subtle,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: spacing.lg,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
      marginBottom: 6,
    },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: radius.md,
      backgroundColor: colors.bg.primary,
      marginBottom: 14,
      paddingHorizontal: 10,
    },
    inputIcon: {
      marginRight: 8,
    },
    input: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 14,
      color: colors.text.primary,
    },
    textAreaWrapper: {
      alignItems: "flex-start",
    },
    textArea: {
      height: 72,
      paddingTop: 10,
    },
    // Alerts
    errorAlert: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accent.dangerMuted,
      borderWidth: 1,
      borderColor: colors.accent.danger,
      padding: 12,
      borderRadius: radius.md,
      marginBottom: 16,
      gap: 8,
    },
    errorText: {
      color: colors.accent.danger,
      fontSize: 13,
      fontWeight: "600",
      flex: 1,
    },
    successAlert: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: `${colors.accent.success}18`,
      borderWidth: 1,
      borderColor: colors.accent.success,
      padding: 12,
      borderRadius: radius.md,
      marginBottom: 16,
      gap: 8,
    },
    successText: {
      color: colors.accent.success,
      fontSize: 13,
      fontWeight: "700",
      flex: 1,
    },
    // Save Button
    saveButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent.primary,
      borderRadius: radius.lg,
      paddingVertical: 14,
      gap: 8,
      marginTop: 8,
      ...shadows.subtle,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 15,
    },
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.bg.overlay,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
    },
    modalCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.xl,
      width: "100%",
      maxWidth: 360,
      ...shadows.elevated,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 4,
    },
    modalSub: {
      fontSize: 12,
      color: colors.text.muted,
      marginBottom: 18,
    },
    modalOption: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.elevated,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 10,
      gap: 10,
    },
    modalOptionText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
    },
    modalOptionDanger: {
      backgroundColor: `${colors.accent.danger}12`,
    },
    modalOptionDangerText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.accent.danger,
    },
    modalCancelBtn: {
      paddingVertical: 10,
      alignItems: "center",
      marginTop: 4,
    },
    modalCancelText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.muted,
    },
  });
};