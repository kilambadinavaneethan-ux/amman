import React, { useEffect, useRef } from "react";
import { Text, StyleSheet, Animated } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetwork } from "../context/NetworkContext";

export default function OfflineBanner() {
  const { isOnline, wasOffline, isSyncing } = useNetwork();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const showBanner = !isOnline || wasOffline;

  useEffect(() => {
    if (showBanner) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          speed: 14,
          bounciness: 4,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -120,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showBanner, slideAnim, opacityAnim]);

  if (!showBanner) return null;

  const isBackOnline = isOnline && wasOffline;

  let bgColor, message, iconName;

  if (isBackOnline && isSyncing) {
    bgColor = "#f59e0b";
    message = "Back online — syncing changes...";
    iconName = "cloud-upload";
  } else if (isBackOnline) {
    bgColor = "#10b981";
    message = "Back online — all changes synced ✓";
    iconName = "cloud-done";
  } else {
    bgColor = "#ef4444";
    message = "You're offline — changes saved locally";
    iconName = "cloud-off";
  }

  const topInset = Math.max(insets.top, 12);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: topInset + 6,
          backgroundColor: bgColor,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <MaterialIcons name={iconName} size={15} color="#fff" />
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 8,
    paddingHorizontal: 16,
    gap: 8,
    zIndex: 9999,
  },
  text: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
