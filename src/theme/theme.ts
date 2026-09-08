/**
 * Centralized Design System — Premium Nordic Frost Theme
 * All colors, spacing, typography, and shadows in one place.
 */

export const colors = {
  // Backgrounds
  bg: {
    primary: "#F3F4F6",    // Light grey background
    card: "#FFFFFF",       // White card
    elevated: "#E5E7EB",   // Slightly darker grey for overlays/modals
    input: "#F9FAFB",      // Off-white input
    overlay: "rgba(0,0,0,0.3)", // Modal backdrop
  },

  // Accent Colors
  accent: {
    primary: "#3B82F6",    // Premium royal blue
    primaryMuted: "#3B82F61C",
    success: "#10B981",    // Green — positive/success
    successMuted: "#10B9811C",
    warning: "#F59E0B",    // Amber — warnings
    warningMuted: "#F59E0B1C",
    danger: "#EF4444",     // Red — errors/negative
    dangerMuted: "#EF44441C",
    info: "#06B6D4",       // Blue — informational
    infoMuted: "#06B6D41C",
  },

  // Text
  text: {
    primary: "#111827",    // Dark charcoal text
    secondary: "#4B5563",  // Medium grey text
    muted: "#9CA3AF",      // Light grey text
    inverse: "#FFFFFF",    // White text on dark/colored surfaces
  },

  // Borders
  border: {
    subtle: "#E5E7EB",     // Subtle card borders
    medium: "#D1D5DB",     // More visible borders
    accent: "#3B82F633",   // Blue-tinted borders
  },

  // Gradients (as array pairs for LinearGradient or manual use)
  gradients: {
    purpleCard: ["#3B82F6", "#60A5FA"],
    greenCard: ["#10B981", "#34D399"],
    surface: ["#FFFFFF", "#F9FAFB"],
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const shadows = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 6,
  },
  elevated: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
  },
  subtle: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 3,
  },
};

export const typography = {
  h1: {
    fontSize: 28,
    fontWeight: "800" as const,
    letterSpacing: -0.5,
    color: colors.text.primary,
  },
  h2: {
    fontSize: 22,
    fontWeight: "700" as const,
    letterSpacing: -0.3,
    color: colors.text.primary,
  },
  h3: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: colors.text.primary,
  },
  body: {
    fontSize: 15,
    fontWeight: "500" as const,
    color: colors.text.secondary,
  },
  caption: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: colors.text.muted,
  },
  label: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.text.secondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  stat: {
    fontSize: 26,
    fontWeight: "800" as const,
    color: colors.text.primary,
  },
};

const theme = { colors, spacing, radius, typography, shadows };
export default theme;
