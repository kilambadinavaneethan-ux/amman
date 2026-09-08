import React, { useContext, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, Modal, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { UserContext } from "../context/UserContext";
import { changeUserPassword, deleteCurrentUserAccount, logout, normalizeDateValue } from "../../src/config/firebase";
import { useTheme } from "../context/ThemeContext";
import ProtectedRoute from "../components/ProtectedRoute";
import BackButton from "../components/BackButton";

function AccountScreen() {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();

  const { profile, loading: profileLoading } = useContext(UserContext);

  // Modals state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Change password inputs
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Delete account confirmation inputs
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const isGoogleUser = profile?.provider === "google";

  const handleLogout = async () => {
    setShowLogoutModal(false);
    try {
      await logout();
      router.replace("/login");
    } catch (e) {
      alert("Failed to logout: " + e.message);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");
    setPasswordSuccess(false);

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      setPasswordError("All fields are required.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      await changeUserPassword(oldPassword, newPassword);
      setPasswordSuccess(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (err) {
      console.error("[ChangePassword] Error:", err);
      let errMsg = err.message || "Failed to update password.";
      if (errMsg.includes("auth/wrong-password")) {
        errMsg = "Current password entered is incorrect.";
      }
      setPasswordError(errMsg);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");

    if (deleteConfirmText.toLowerCase() !== "delete") {
      setDeleteError('Please type "delete" to confirm.');
      return;
    }

    if (!isGoogleUser && !deletePassword) {
      setDeleteError("Password is required to delete your account.");
      return;
    }

    setDeleteLoading(true);
    try {
      if (!isGoogleUser) {
        // Re-authenticate user first using their password
        await changeUserPassword(deletePassword, deletePassword); // Triggers re-authentication internally
      }
      await deleteCurrentUserAccount();
      setShowDeleteModal(false);
      router.replace("/login");
    } catch (err) {
      console.error("[DeleteAccount] Error:", err);
      setDeleteError(err.message || "Failed to delete account. Please re-authenticate first.");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (profileLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading account info...</Text>
      </View>
    );
  }

  const createdDate = profile?.createdAt ? normalizeDateValue(profile.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }) : "N/A";

  const lastLoginDate = profile?.lastLogin ? normalizeDateValue(profile.lastLogin).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) : "N/A";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <BackButton label="Settings" onPress={() => router.push("/settings")} />
        <Text style={styles.title}>Owner Account</Text>
      </View>

      {/* Profile Overview Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatarContainer}>
          {profile?.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>
                {profile?.fullName ? profile.fullName.substring(0, 2).toUpperCase() : "OW"}
              </Text>
            </View>
          )}
          <View style={styles.providerBadgeContainer}>
            <View style={[styles.providerBadge, isGoogleUser ? styles.googleBadge : styles.emailBadge]}>
              <MaterialIcons name={isGoogleUser ? "cloud-done" : "email"} size={12} color="#ffffff" />
              <Text style={styles.providerBadgeText}>{isGoogleUser ? "Google" : "Email"}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.profileName}>{profile?.fullName || "Business Owner"}</Text>
        <Text style={styles.profileBusiness}>{profile?.businessName || "My Business"}</Text>
        <Text style={styles.profileRole}>Role: Owner</Text>
      </View>

      {/* Account Info Details */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Profile Details</Text>
        
        <View style={styles.detailRow}>
          <View style={styles.detailLabelWrap}>
            <MaterialIcons name="business-center" size={18} color={colors.text.muted} />
            <Text style={styles.detailLabel}>Business Name</Text>
          </View>
          <Text style={styles.detailValue}>{profile?.businessName || "N/A"}</Text>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailLabelWrap}>
            <MaterialIcons name="mail-outline" size={18} color={colors.text.muted} />
            <Text style={styles.detailLabel}>Email Address</Text>
          </View>
          <Text style={styles.detailValue}>{profile?.email || "N/A"}</Text>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailLabelWrap}>
            <MaterialIcons name="phone-android" size={18} color={colors.text.muted} />
            <Text style={styles.detailLabel}>Mobile Number</Text>
          </View>
          <Text style={styles.detailValue}>{profile?.mobile || profile?.phone || "Not Added"}</Text>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailLabelWrap}>
            <MaterialIcons name="calendar-today" size={18} color={colors.text.muted} />
            <Text style={styles.detailLabel}>Account Created</Text>
          </View>
          <Text style={styles.detailValue}>{createdDate}</Text>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailLabelWrap}>
            <MaterialIcons name="login" size={18} color={colors.text.muted} />
            <Text style={styles.detailLabel}>Last Login</Text>
          </View>
          <Text style={styles.detailValue}>{lastLoginDate}</Text>
        </View>
      </View>

      {/* Management Actions */}
      <View style={styles.actionsCard}>
        <Text style={styles.sectionTitle}>Account Actions</Text>

        <Pressable style={styles.actionItem} onPress={() => router.push("/settings/profile")}>
          <View style={styles.actionLeft}>
            <View style={[styles.actionIconBg, { backgroundColor: `${colors.accent.primary}12` }]}>
              <MaterialIcons name="edit" size={20} color={colors.accent.primary} />
            </View>
            <Text style={styles.actionText}>Edit Profile Info</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
        </Pressable>

        {!isGoogleUser && (
          <Pressable style={styles.actionItem} onPress={() => setShowPasswordModal(true)}>
            <View style={styles.actionLeft}>
              <View style={[styles.actionIconBg, { backgroundColor: `${colors.accent.warning}12` }]}>
                <MaterialIcons name="vpn-key" size={20} color={colors.accent.warning} />
              </View>
              <Text style={styles.actionText}>Change Password</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
          </Pressable>
        )}

        <Pressable style={styles.actionItem} onPress={() => setShowLogoutModal(true)}>
          <View style={styles.actionLeft}>
            <View style={[styles.actionIconBg, { backgroundColor: `${colors.accent.info}12` }]}>
              <MaterialIcons name="exit-to-app" size={20} color={colors.accent.info} />
            </View>
            <Text style={styles.actionText}>Logout Account</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
        </Pressable>

        <Pressable style={[styles.actionItem, styles.lastActionItem]} onPress={() => setShowDeleteModal(true)}>
          <View style={styles.actionLeft}>
            <View style={[styles.actionIconBg, { backgroundColor: `${colors.accent.danger}12` }]}>
              <MaterialIcons name="delete-forever" size={20} color={colors.accent.danger} />
            </View>
            <Text style={[styles.actionText, { color: colors.accent.danger }]}>Delete Business Account</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
        </Pressable>
      </View>

      {/* Modal Change Password */}
      <Modal visible={showPasswordModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Text style={styles.modalSubtitle}>Please enter password details below</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Current Password"
              placeholderTextColor={colors.text.muted}
              secureTextEntry
              value={oldPassword}
              onChangeText={setOldPassword}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="New Password (min 8 characters)"
              placeholderTextColor={colors.text.muted}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Confirm New Password"
              placeholderTextColor={colors.text.muted}
              secureTextEntry
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
            />

            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            {passwordSuccess ? <Text style={styles.successText}>Password updated successfully!</Text> : null}

            <View style={styles.modalRow}>
              <Pressable 
                style={[styles.modalButton, styles.modalCancelBtn]} 
                onPress={() => {
                  setShowPasswordModal(false);
                  setPasswordError("");
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              
              <Pressable 
                style={[styles.modalButton, styles.modalSubmitBtn]} 
                onPress={handleChangePassword}
                disabled={passwordLoading}
              >
                {passwordLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Update</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Delete Account */}
      <Modal visible={showDeleteModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, { color: colors.accent.danger }]}>Delete Account?</Text>
            <Text style={styles.modalSubtitle}>
              Warning: This will permanently wipe your business records from our cloud database. This action is irreversible.
            </Text>

            {!isGoogleUser && (
              <TextInput
                style={styles.modalInput}
                placeholder="Confirm your Password"
                placeholderTextColor={colors.text.muted}
                secureTextEntry
                value={deletePassword}
                onChangeText={setDeletePassword}
              />
            )}

            <TextInput
              style={styles.modalInput}
              placeholder='Type "delete" to confirm'
              placeholderTextColor={colors.text.muted}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="none"
            />

            {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}

            <View style={styles.modalRow}>
              <Pressable 
                style={[styles.modalButton, styles.modalCancelBtn]} 
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteError("");
                  setDeleteConfirmText("");
                  setDeletePassword("");
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              
              <Pressable 
                style={[styles.modalButton, styles.modalDeleteBtn]} 
                onPress={handleDeleteAccount}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Wipe Profile</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Logout Confirmation */}
      <Modal visible={showLogoutModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Logout</Text>
            <Text style={styles.dialogDesc}>Are you sure you want to log out?</Text>
            <View style={styles.dialogBtnRow}>
              <Pressable style={styles.dialogCancelBtn} onPress={() => setShowLogoutModal(false)}>
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.dialogConfirmBtn} onPress={handleLogout}>
                <Text style={styles.dialogConfirmText}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

function AccountRoute() {
  return (
    <ProtectedRoute>
      <AccountScreen />
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    container: {
      padding: spacing.lg,
      backgroundColor: colors.bg.primary,
      flexGrow: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
    },
    loadingText: {
      marginTop: spacing.md,
      color: colors.text.secondary,
      fontWeight: "600",
    },
    header: {
      marginBottom: spacing.lg,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    backText: {
      color: colors.text.secondary,
      fontSize: 15,
      fontWeight: "600",
      marginLeft: 4,
    },
    title: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.text.primary,
    },
    profileCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.xl,
      alignItems: "center",
      marginBottom: spacing.lg,
      ...shadows.card,
    },
    avatarContainer: {
      position: "relative",
      marginBottom: spacing.md,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.bg.primary,
      borderWidth: 2,
      borderColor: colors.accent.primary,
    },
    avatarPlaceholder: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.accent.primaryMuted,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.accent.primary,
    },
    avatarPlaceholderText: {
      color: colors.accent.primary,
      fontSize: 24,
      fontWeight: "800",
    },
    providerBadgeContainer: {
      position: "absolute",
      bottom: -6,
      width: "100%",
      alignItems: "center",
    },
    providerBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    googleBadge: {
      backgroundColor: colors.accent.info,
    },
    emailBadge: {
      backgroundColor: colors.accent.primary,
    },
    providerBadgeText: {
      color: "#ffffff",
      fontSize: 10,
      fontWeight: "700",
      marginLeft: 3,
    },
    profileName: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
    },
    profileBusiness: {
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: "600",
      marginTop: 2,
    },
    profileRole: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: "700",
      textTransform: "uppercase",
      marginTop: 6,
    },
    sectionCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      ...shadows.subtle,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: spacing.md,
      letterSpacing: 0.3,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    detailLabelWrap: {
      flexDirection: "row",
      alignItems: "center",
    },
    detailLabel: {
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: "600",
      marginLeft: 8,
    },
    detailValue: {
      fontSize: 14,
      color: colors.text.primary,
      fontWeight: "700",
    },
    actionsCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.lg,
      marginBottom: spacing.xl,
      ...shadows.subtle,
    },
    actionItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    lastActionItem: {
      borderBottomWidth: 0,
    },
    actionLeft: {
      flexDirection: "row",
      alignItems: "center",
    },
    actionIconBg: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    actionText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    // Modals
    modalBg: {
      flex: 1,
      backgroundColor: colors.bg.overlay,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xl,
    },
    modalContent: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.xl,
      padding: spacing.xl,
      width: "100%",
      maxWidth: 400,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.elevated,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
    },
    modalSubtitle: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 2,
      marginBottom: spacing.lg,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: radius.md,
      padding: 12,
      backgroundColor: colors.bg.primary,
      color: colors.text.primary,
      fontSize: 14,
      marginBottom: spacing.md,
    },
    modalRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    modalButton: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: radius.md,
      justifyContent: "center",
      alignItems: "center",
      minWidth: 100,
    },
    modalCancelBtn: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.medium,
    },
    modalCancelText: {
      color: colors.text.secondary,
      fontWeight: "700",
    },
    modalSubmitBtn: {
      backgroundColor: colors.accent.primary,
    },
    modalSubmitText: {
      color: "#ffffff",
      fontWeight: "800",
    },
    modalDeleteBtn: {
      backgroundColor: colors.accent.danger,
    },
    errorText: {
      color: colors.accent.danger,
      fontSize: 12,
      fontWeight: "600",
      marginBottom: spacing.md,
      marginLeft: 2,
    },
    successText: {
      color: colors.accent.success,
      fontSize: 12,
      fontWeight: "600",
      marginBottom: spacing.md,
      marginLeft: 2,
    },
    // Dialogs
    dialogCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      padding: spacing.xl,
      width: "85%",
      maxWidth: 320,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.elevated,
    },
    dialogTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 8,
    },
    dialogDesc: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: "center",
      marginBottom: 20,
    },
    dialogBtnRow: {
      flexDirection: "row",
      width: "100%",
      gap: spacing.sm,
    },
    dialogCancelBtn: {
      flex: 1,
      height: 40,
      borderRadius: radius.md,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border.medium,
      backgroundColor: colors.bg.primary,
    },
    dialogCancelText: {
      color: colors.text.secondary,
      fontWeight: "700",
      fontSize: 14,
    },
    dialogConfirmBtn: {
      flex: 1,
      height: 40,
      borderRadius: radius.md,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.accent.danger,
    },
    dialogConfirmText: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 14,
    },
  });
};

export default AccountRoute;
