import React, { useContext, useMemo } from "react";
import { View, Text, StyleSheet, Image, Pressable } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { UserContext } from "../context/UserContext";
import { useTheme } from "../context/ThemeContext";
import { useZoom } from "../context/ZoomContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetwork } from "../context/NetworkContext";

function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useContext(UserContext);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isOnline, wasOffline } = useNetwork();
  const { zoomPercent, resetZoom } = useZoom();
  
  const showBanner = !isOnline || wasOffline;
  const styles = useMemo(() => getStyles(theme, insets, showBanner), [theme, insets, showBanner]);

  const businessName = profile?.businessName || "Hollow Block";
  const initials = businessName.substring(0, 2).toUpperCase();

  // Helper to get screen title based on route
  const getScreenTitle = () => {
    if (pathname === "/") return "Dashboard";
    if (pathname.startsWith("/customers")) return "Customers Pro";
    if (pathname.startsWith("/orders")) return "Order Registry";
    if (pathname.startsWith("/expense-balances") || pathname.startsWith("/expenses")) return "Expense Balances";
    if (pathname.startsWith("/workers")) return "Staff Management";
    if (pathname.startsWith("/settings")) return "System Settings";
    return "Business Suite";
  };

  return (
    <View style={styles.header}>
      <View style={styles.leftCol}>
        <View style={styles.brandRow}>
          <Pressable onPress={() => router.replace("/")} style={styles.brandPressable}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {businessName}
            </Text>
          </Pressable>

          {/* Quick Zoom Reset Button Nearby Business Name */}
          <Pressable
            style={({ pressed }) => [
              styles.zoomResetBtn,
              zoomPercent !== 100 && styles.zoomResetBtnActive,
              pressed && { opacity: 0.75 },
            ]}
            onPress={resetZoom}
            hitSlop={6}
          >
            <MaterialIcons
              name={zoomPercent === 100 ? "zoom-in" : "restart-alt"}
              size={13}
              color={zoomPercent === 100 ? theme.colors.text.muted : theme.colors.accent.primary}
            />
            <Text
              style={[
                styles.zoomResetText,
                zoomPercent !== 100 && styles.zoomResetTextActive,
              ]}
              numberOfLines={1}
            >
              {zoomPercent}%
            </Text>
          </Pressable>
        </View>

        <View style={styles.subtitleRow}>
          <View style={styles.syncDot} />
          <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
            {getScreenTitle()}
          </Text>
        </View>
      </View>

      <View style={styles.rightCol}>
        <Pressable 
          style={styles.settingsBtn} 
          onPress={() => router.replace("/settings")}
        >
          {profile?.imageUrl ? (
            <Image source={{ uri: profile.imageUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const getStyles = (theme, insets, showBanner) => StyleSheet.create({
  header: {
    paddingTop: showBanner ? 10 : Math.max(insets.top, 10),
    paddingBottom: 10,
    paddingHorizontal: Math.min(theme.spacing.xl, 16),
    backgroundColor: theme.colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftCol: {
    flex: 1,
    marginRight: 8,
  },
  brandPressable: {
    flexShrink: 1,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  zoomResetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: theme.colors.bg.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    flexShrink: 0,
  },
  zoomResetBtnActive: {
    backgroundColor: theme.colors.accent.primary + "18",
    borderColor: theme.colors.accent.primary,
  },
  zoomResetText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.text.muted,
  },
  zoomResetTextActive: {
    color: theme.colors.accent.primary,
    fontWeight: "800",
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.accent.success,
    marginRight: 6,
  },
  subtitle: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: "600",
  },
  rightCol: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingsBtn: {
    padding: 2,
    borderRadius: theme.radius.full,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: theme.colors.border.medium,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.accent.primaryMuted,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: theme.colors.border.accent,
  },
  avatarText: {
    color: theme.colors.accent.primary,
    fontSize: 13,
    fontWeight: "700",
  },
});

export default React.memo(Navbar);

