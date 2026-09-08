import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useContext, useState, useMemo } from "react";
import {
    ActivityIndicator,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    Alert,
} from "react-native";
import ProtectedRoute from "../components/ProtectedRoute";
import { UserContext } from "../context/UserContext";
import { useTheme } from "../context/ThemeContext";
import { useScrollRestoration } from "../context/ScrollContext";

function SettingsHome() {
  const router = useRouter();
  const { profile, loading } = useContext(UserContext);
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/settings");
  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = async () => {
    setShowLogoutModal(false);
    try {
      const { logout } = require("../../src/config/firebase");
      await logout();
      router.replace("/login");
    } catch (e) {
      Alert.alert("Error", "Failed to logout: " + e.message);
    }
  };

  const categories = useMemo(() => [
    {
      title: "Catalog & Inventory",
      icon: "inventory-2",
      color: theme.colors.accent.primary,
      items: [
        { label: "Item Management", icon: "shopping-bag", route: "/settings/items" },
        { label: "Raw Materials", icon: "layers", route: "/settings/raw-materials" },
        { label: "Supplier Management", icon: "perm-contact-calendar", route: "/settings/raw-materials/suppliers" },
      ],
    },
    {
      title: "People & Directory",
      icon: "groups",
      color: theme.colors.accent.info,
      items: [
        { label: "Worker Management", icon: "groups", route: "/settings/workers" },
        { label: "Visiting Cards Storage", icon: "badge", route: "/settings/visiting-cards" },
        { label: "Delivery Partners", icon: "local-shipping", route: "/settings/delivery-partners" },
        { label: "Balance Collectors", icon: "payments", route: "/settings/collectors" },
      ],
    },
    {
      title: "Finance",
      icon: "account-balance-wallet",
      color: theme.colors.accent.success,
      items: [
        { label: "Sales Report Management", icon: "assessment", route: "/settings/sales-reports" },
        { label: "Received Payments", icon: "account-balance-wallet", route: "/received-payments" },
        { label: "Expense Payment Management", icon: "payments", route: "/settings/expense-payments" },
        { label: "Expenses Tracker", icon: "receipt-long", route: "/expense-balances" },
        { label: "Expense History", icon: "history", route: "/expenses" },
        { label: "Raw Material Stock", icon: "layers", route: "/raw-material-stock" },
        { label: "GST Due Date Alerts", icon: "gavel", route: "/settings/gst-management" },
      ],
    },
    {
      title: "App Settings",
      icon: "settings",
      color: theme.colors.accent.warning,
      items: [
        { label: "Business Settings", icon: "business", route: "/settings/business" },
        { label: "Share Transaction Management", icon: "share", route: "/settings/share-transaction" },
        { label: "Invoice Management", icon: "receipt", route: "/settings/invoice-management" },
        { label: "Font Size & Style", icon: "text-format", route: "/settings/font-settings" },
        { label: "Display & Zoom Scale", icon: "zoom-in", route: "/settings/zoom-settings" },
        { label: "Notifications", icon: "notifications", route: "/settings/notifications" },
        { label: "Alarm Manager", icon: "alarm", route: "/settings/alarms" },
        { label: "Profit Management", icon: "trending-up", route: "/settings/profit-management" },
        { label: "Automations", icon: "settings-suggest", route: "/settings/automations" },
        { label: "Data Management", icon: "storage", route: "/settings/data-management" },
        { label: "Local Image Storage", icon: "photo-library", route: "/settings/local-image-storage" },
        { label: "Firebase Management", icon: "cloud", route: "/settings/firebase-management" },
      ],
    },
  ], [theme]);


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  const userProfile = profile || {
    fullName: "Business Owner",
    businessName: "My Business",
    email: "no-email@example.com",
    mobile: "",
    phone: "",
    photoURL: "",
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={32}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
    >
      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          {userProfile.photoURL ? (
            <Image
              source={{ uri: userProfile.photoURL }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>
                {userProfile.fullName
                  ? userProfile.fullName.substring(0, 2).toUpperCase()
                  : "OW"}
              </Text>
            </View>
          )}
          <View style={styles.profileDetails}>
            <Text style={styles.businessName}>{userProfile.businessName || "My Business"}</Text>
            <View style={styles.metaRow}>
              <MaterialIcons name="person" size={14} color={colors.text.muted} />
              <Text style={styles.metaText}>{userProfile.fullName || "Business Owner"}</Text>
            </View>
            <View style={styles.metaRow}>
              <MaterialIcons name="email" size={14} color={colors.text.muted} />
              <Text style={styles.metaText}>{userProfile.email || "No email"}</Text>
            </View>
            {(userProfile.mobile || userProfile.phone) ? (
              <View style={styles.metaRow}>
                <MaterialIcons name="phone" size={14} color={colors.text.muted} />
                <Text style={styles.metaText}>{userProfile.mobile || userProfile.phone}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.editProfileButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => router.push("/settings/profile")}
        >
          <MaterialIcons name="edit" size={16} color={colors.accent.primary} />
          <Text style={styles.editProfileText}>Edit Profile Details</Text>
        </Pressable>
      </View>

      {/* Categorized Settings */}
      {categories.map((category) => (
        <View key={category.title} style={styles.categorySection}>
          <View style={styles.categoryHeader}>
            <View style={[styles.categoryIconWrap, { backgroundColor: `${category.color}18` }]}>
              <MaterialIcons name={category.icon} size={18} color={category.color} />
            </View>
            <Text style={styles.categoryTitle}>{category.title}</Text>
          </View>
          <View style={styles.menuCard}>
            {category.items.map((item, index) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [
                  styles.menuItem,
                  index === category.items.length - 1 && styles.lastMenuItem,
                  pressed && styles.menuItemPressed,
                ]}
                onPress={() => router.push(item.route)}
              >
                <View style={styles.menuLeft}>
                  <MaterialIcons name={item.icon} size={20} color={colors.text.secondary} />
                  <Text style={styles.menuText}>{item.label}</Text>
                </View>
                <View style={styles.menuRightGroup}>
                  {item.hasAddBtn && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.quickAddBtn,
                        pressed && styles.quickAddBtnPressed,
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        if (item.onAddPress) {
                          item.onAddPress();
                        } else {
                          router.push({ pathname: "/expenses", params: { add: "true" } });
                        }
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="add" size={16} color="#ffffff" />
                      <Text style={styles.quickAddText}>Add</Text>
                    </Pressable>
                  )}
                  <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {/* System Section */}
      <View style={styles.categorySection}>
        <View style={styles.categoryHeader}>
          <View style={[styles.categoryIconWrap, { backgroundColor: colors.accent.infoMuted }]}>
            <MaterialIcons name="sync" size={18} color={colors.accent.info} />
          </View>
          <Text style={styles.categoryTitle}>System</Text>
        </View>
        <View style={styles.menuCard}>
          {/* Backup & Restore */}
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed,
            ]}
            onPress={() => router.push("/settings/backup-restore")}
          >
            <View style={styles.menuLeft}>
              <MaterialIcons name="cloud-download" size={20} color={colors.text.secondary} />
              <Text style={styles.menuText}>Backup & Restore</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
          </Pressable>

          {/* Privacy Policy */}
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed,
            ]}
            onPress={() => setShowPrivacy(true)}
          >
            <View style={styles.menuLeft}>
              <MaterialIcons name="lock" size={20} color={colors.text.secondary} />
              <Text style={styles.menuText}>Privacy Policy</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
          </Pressable>

          {/* Help & Support */}
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed,
            ]}
            onPress={() => router.push("/settings/help")}
          >
            <View style={styles.menuLeft}>
              <MaterialIcons name="help-center" size={20} color={colors.text.secondary} />
              <Text style={styles.menuText}>Help & Support</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.text.muted} />
          </Pressable>

          {/* About App */}
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              styles.lastMenuItem,
              pressed && styles.menuItemPressed,
            ]}
            onPress={() => setShowAbout(true)}
          >
            <View style={styles.menuLeft}>
              <MaterialIcons name="info" size={20} color={colors.text.secondary} />
              <Text style={styles.menuText}>About App</Text>
            </View>
            <Text style={styles.menuRightText}>v1.0.0</Text>
          </Pressable>
        </View>
      </View>

      {/* Logout Card Button */}
      <Pressable
        style={({ pressed }) => [
          styles.logoutCard,
          pressed && styles.logoutCardPressed,
        ]}
        onPress={() => setShowLogoutModal(true)}
      >
        <MaterialIcons name="logout" size={22} color={colors.accent.danger} />
        <Text style={styles.logoutText}>Logout Account</Text>
      </Pressable>

      <Text style={styles.footer}>
        Business Suite • Secure Connection
      </Text>

      {/* About Modal */}
      <Modal visible={showAbout} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>About Business Suite</Text>
            <Text style={styles.modalDesc}>
              A premium business suite designed for local businesses. Easily
              organize customer data, log expenses, manage item catalog, track
              inventory stock levels, and upload product assets securely via
              Google Cloud Firestore and Firebase Storage.
            </Text>
            <Text style={styles.modalVersion}>Version: 1.0.0 (Build 12)</Text>
            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => setShowAbout(false)}
            >
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Privacy Modal */}
      <Modal visible={showPrivacy} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Privacy Policy</Text>
            <Text style={styles.modalDesc}>
              Your business records, items list, pricing schemas, and uploaded
              images are private and linked exclusively to your account UID in
              Google Firebase. We do not sell or collect data for advertising
              purposes. Your connection is fully encrypted using SSL.
            </Text>
            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => setShowPrivacy(false)}
            >
              <Text style={styles.modalCloseBtnText}>I Understand</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal visible={showLogoutModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Logout</Text>
            <Text style={styles.dialogDesc}>
              Are you sure you want to logout?
            </Text>
            <View style={styles.dialogBtnRow}>
              <Pressable
                style={styles.dialogCancelBtn}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.dialogConfirmBtn}
                onPress={handleLogout}
              >
                <Text style={styles.dialogConfirmText}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

export default function SettingsRoute() {
  return (
    <ProtectedRoute>
      <SettingsHome />
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    themeSelectorCard: {
      backgroundColor: theme.colors.bg.card,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.sm,
      ...theme.shadows.card,
    },
    themeScroll: {
      paddingHorizontal: theme.spacing.xs,
      gap: theme.spacing.sm,
      flexDirection: "row",
    },
    themeOption: {
      width: 130,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1.5,
      borderColor: theme.colors.border.subtle,
      alignItems: "center",
      position: "relative",
    },
    themeOptionSelected: {
      borderWidth: 1.5,
    },
    themeColorIndicator: {
      width: 48,
      height: 32,
      borderRadius: theme.radius.sm,
      marginBottom: theme.spacing.sm,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.bg.primary === "#F3F4F6" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)",
    },
    themeAccentDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    themeOptionText: {
      fontSize: 12,
      fontWeight: "700",
      textAlign: "center",
    },
    selectedCheckWrap: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 16,
      height: 16,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
    },
  container: {
    padding: spacing.lg,
    backgroundColor: colors.bg.primary,
    flexGrow: 1,
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
    fontSize: 16,
    fontWeight: "500",
  },

  // Profile Card
  profileCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadows.card,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.bg.elevated,
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.accent.primaryMuted,
    borderWidth: 1.5,
    borderColor: colors.border.accent,
  },
  avatarText: {
    color: colors.accent.primary,
    fontSize: 22,
    fontWeight: "700",
  },
  profileDetails: {
    marginLeft: spacing.lg,
    flex: 1,
  },
  businessName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  metaText: {
    color: colors.text.muted,
    fontSize: 13,
    marginLeft: 6,
  },
  editProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: colors.border.accent,
    borderRadius: radius.md,
    backgroundColor: colors.accent.primaryMuted,
  },
  editProfileText: {
    color: colors.accent.primary,
    fontWeight: "600",
    fontSize: 14,
    marginLeft: 6,
  },
  buttonPressed: {
    opacity: 0.75,
  },

  // Category Sections
  categorySection: {
    marginBottom: spacing.xl,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  categoryIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // Menu Card
  menuCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.subtle,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  menuItemPressed: {
    backgroundColor: colors.bg.elevated,
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.primary,
    marginLeft: 12,
  },
  menuRightText: {
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: "500",
  },
  menuRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  quickAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent.success,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    gap: 3,
    ...shadows.subtle,
  },
  quickAddBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  quickAddText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  // Footer
  footer: {
    textAlign: "center",
    color: colors.text.muted,
    fontSize: 12,
    marginBottom: 24,
    marginTop: 8,
  },

  // Modals
  modalBg: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.xl,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...shadows.elevated,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 12,
  },
  modalDesc: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  modalVersion: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "600",
    marginBottom: 20,
  },
  modalCloseBtn: {
    backgroundColor: colors.accent.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.md,
    width: "100%",
    alignItems: "center",
  },
  modalCloseBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  logoutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.accent.dangerMuted,
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginVertical: spacing.lg,
    gap: spacing.sm,
    ...shadows.subtle,
  },
  logoutCardPressed: {
    backgroundColor: colors.bg.elevated,
    opacity: 0.85,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.accent.danger,
  },
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
