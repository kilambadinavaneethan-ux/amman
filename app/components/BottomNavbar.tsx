import React, { useEffect, useMemo } from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TABS = [
  { name: "Home", route: "/" as const, icon: "home" as const },
  { name: "Orders", route: "/orders" as const, icon: "receipt-long" as const },
  { name: "Customers", route: "/customers" as const, icon: "people" as const },
  { name: "Balances", route: "/expense-balances" as const, icon: "account-balance-wallet" as const },
  { name: "More", route: "/settings" as const, icon: "grid-view" as const },
];

const INDICATOR_WIDTH = 28;

const BottomNavbar = React.memo(function BottomNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const tabWidth = windowWidth / TABS.length;
  const styles = useMemo(() => getStyles(theme, insets), [theme, insets]);

  // Find active tab index based on the route path
  const getActiveIndex = () => {
    if (pathname === "/") return 0;
    if (pathname.startsWith("/orders") || pathname.startsWith("/create-invoice")) return 1;
    if (pathname.startsWith("/customers") || pathname.startsWith("/customer-profile")) return 2;
    if (pathname.startsWith("/expenses") || pathname.startsWith("/expense-balances")) return 3;
    if (pathname.startsWith("/settings")) return 4;
    return 0;
  };

  const activeIndex = getActiveIndex();
  const translateX = useSharedValue(0);

  // Animate indicator translation when tab index changes or window width updates
  useEffect(() => {
    const targetX = activeIndex * tabWidth + (tabWidth - INDICATOR_WIDTH) / 2;
    translateX.value = withSpring(targetX, {
      damping: 18,
      stiffness: 150,
    });
  }, [activeIndex, tabWidth, translateX]);

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  return (
    <View style={styles.container}>
      {/* Sliding Indicator Pill at the top */}
      <Animated.View style={[styles.indicator, indicatorStyle, { backgroundColor: theme.colors.accent.primary }]} />

      <View style={styles.tabRow}>
        {TABS.map((tab, index) => {
          const isActive = activeIndex === index;

          return (
            <TabButton
              key={tab.name}
              tab={tab}
              isActive={isActive}
              onPress={() => router.replace(tab.route)}
            />
          );
        })}
      </View>
    </View>
  );
});

// Inner component for individual animated tab button
interface TabButtonProps {
  tab: typeof TABS[number];
  isActive: boolean;
  onPress: () => void;
}

function TabButton({ tab, isActive, onPress }: TabButtonProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  // Shared value for animation progression (0 = inactive, 1 = active)
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(isActive ? 1 : 0, {
      damping: 15,
      stiffness: 120,
    });
  }, [isActive, progress]);

  // Scale active icon slightly
  const iconStyle = useAnimatedStyle(() => {
    const scale = 1 + progress.value * 0.15; // scales up from 1 to 1.15
    return {
      transform: [{ scale }],
    };
  });

  // Smooth color interpolation for icon and text
  const labelStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      progress.value,
      [0, 1],
      [theme.colors.text.muted, theme.colors.accent.primary] // muted gray to active theme accent
    );
    return { color };
  });

  return (
    <Pressable style={styles.tabButton} onPress={onPress}>
      <Animated.View style={iconStyle}>
        <AnimatedMaterialIcon
          name={tab.icon}
          size={24}
          style={labelStyle}
        />
      </Animated.View>
      <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1} ellipsizeMode="tail">
        {tab.name}
      </Animated.Text>
    </Pressable>
  );
}

const AnimatedMaterialIcon = Animated.createAnimatedComponent(MaterialIcons);

const getStyles = (theme: any, insets?: any) => StyleSheet.create({
  container: {
    height: 64 + (insets?.bottom || 0),
    paddingBottom: insets?.bottom || 0,
    backgroundColor: theme.colors.bg.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: theme.colors.bg.primary === "#F3F4F6" ? 0.08 : 0.2,
    shadowRadius: 12,
    elevation: 10,
    position: "relative",
  },
  tabRow: {
    flexDirection: "row",
    height: "100%",
  },
  tabButton: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: theme.spacing.sm,
    paddingBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
  indicator: {
    position: "absolute",
    top: 0,
    width: INDICATOR_WIDTH,
    height: 3,
    borderRadius: 1.5,
  },
});

export default BottomNavbar;

