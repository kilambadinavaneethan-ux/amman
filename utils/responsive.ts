import { useMemo } from "react";
import { Platform, useWindowDimensions, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";

/**
 * Standard reference viewport (iPhone X / baseline Android compact portrait: 375 x 812).
 */
export const BASE_WIDTH = 375;
export const BASE_HEIGHT = 812;

export const MIN_SCALE_RATIO = 0.85;
export const MAX_SCALE_RATIO = 1.18;

const TAMIL_UNICODE_REGEX = /[\u0B80-\u0BFF]/;

let _liveWidth = BASE_WIDTH;
let _liveHeight = BASE_HEIGHT;

/**
 * Updates module-level live viewport bounds from ThemeProvider's useWindowDimensions().
 * Ensures non-hook style helpers reflect active window / split-screen changes without Dimensions.get.
 */
export function syncViewportDimensions(width: number, height: number): void {
  if (Number.isFinite(width) && width > 0) {
    _liveWidth = width;
  }
  if (Number.isFinite(height) && height > 0) {
    _liveHeight = height;
  }
}

export function getLiveViewportDimensions(): { width: number; height: number } {
  return { width: _liveWidth, height: _liveHeight };
}

/**
 * Clamp a numeric value strictly between [min, max].
 */
export function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Detect whether a text string or nested string array contains Tamil script characters.
 */
export function hasTamilScript(value: unknown): boolean {
  if (typeof value === "string") {
    return TAMIL_UNICODE_REGEX.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasTamilScript(item));
  }
  return false;
}

/**
 * Computes a vertical line-height that prevents clipping of Tamil top/bottom vowel markers.
 */
export function getTamilSafeLineHeight(fontSize: number, multiplier = 1.4): number {
  const safeSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 14;
  return Math.ceil(safeSize * multiplier);
}

/**
 * Returns true if the width corresponds to a narrow phone (< 360dp).
 */
export function getIsSmallDevice(width = _liveWidth): boolean {
  return width < 360;
}

/**
 * Returns true if the width corresponds to a medium phone (360dp - 409dp).
 */
export function getIsMediumDevice(width = _liveWidth): boolean {
  return width >= 360 && width < 410;
}

/**
 * Returns true if the width corresponds to a large phone or tablet (>= 410dp).
 */
export function getIsLargeDevice(width = _liveWidth): boolean {
  return width >= 410;
}

/**
 * Percentage of current screen width.
 */
export function wp(percentage: number, width = _liveWidth): number {
  const safeW = Number.isFinite(width) && width > 0 ? width : BASE_WIDTH;
  return Math.round((safeW * percentage) / 100);
}

/**
 * Percentage of current screen height.
 */
export function hp(percentage: number, height = _liveHeight): number {
  const safeH = Number.isFinite(height) && height > 0 ? height : BASE_HEIGHT;
  return Math.round((safeH * percentage) / 100);
}

/**
 * Moderate scale relative to baseline width (375), clamped between
 * [minScale, maxScale] so narrow (<= 360dp) and wide (>= 420dp) devices remain balanced.
 */
export function ms(size: number, factor = 0.5, width = _liveWidth): number {
  if (!Number.isFinite(size) || size <= 0) return size;
  const safeW = Number.isFinite(width) && width > 0 ? width : BASE_WIDTH;
  const rawScale = safeW / BASE_WIDTH;
  const clampedRatio = clampValue(rawScale, MIN_SCALE_RATIO, MAX_SCALE_RATIO);
  const scaled = size + (size * clampedRatio - size) * factor;
  const minVal = size >= 4 ? Math.max(1, size * MIN_SCALE_RATIO) : size * MIN_SCALE_RATIO;
  const maxVal = size * MAX_SCALE_RATIO;
  return Math.round(clampValue(scaled, minVal, maxVal) * 10) / 10;
}

/**
 * Computes responsive grid item flexBasis/width percentage that wraps gracefully on narrow devices.
 */
export function getFluidColumnPercent(columns: number, gap = 12, width = _liveWidth): `${number}%` {
  if (columns <= 1) return "100%";
  const effectiveCols = width < 340 && columns >= 3 ? 2 : columns;
  const totalGapPct = ((effectiveCols - 1) * gap * 100) / Math.max(width, 300);
  const pct = Math.max(22, Math.floor((100 - totalGapPct) / effectiveCols));
  return `${pct}%`;
}

export interface ResponsiveMetrics {
  width: number;
  height: number;
  isSmallDevice: boolean;
  isMediumDevice: boolean;
  isLargeDevice: boolean;
  clampedScaleRatio: number;
  wp: (percentage: number) => number;
  hp: (percentage: number) => number;
  ms: (size: number, factor?: number) => number;
  modalMaxWidth: number;
  modalMaxHeight: `${number}%`;
  sheetMaxHeight: number;
}

export function getResponsiveMetrics(width: number, height: number): ResponsiveMetrics {
  const safeW = Number.isFinite(width) && width > 0 ? width : BASE_WIDTH;
  const safeH = Number.isFinite(height) && height > 0 ? height : BASE_HEIGHT;
  const clampedScaleRatio = clampValue(safeW / BASE_WIDTH, MIN_SCALE_RATIO, MAX_SCALE_RATIO);

  return {
    width: safeW,
    height: safeH,
    isSmallDevice: safeW < 360,
    isMediumDevice: safeW >= 360 && safeW < 410,
    isLargeDevice: safeW >= 410,
    clampedScaleRatio,
    wp: (percentage: number) => wp(percentage, safeW),
    hp: (percentage: number) => hp(percentage, safeH),
    ms: (size: number, factor = 0.5) => ms(size, factor, safeW),
    modalMaxWidth: Math.min(480, Math.round(safeW * 0.94)),
    modalMaxHeight: "88%",
    sheetMaxHeight: Math.round(safeH * 0.9),
  };
}

export interface ResponsiveState extends ResponsiveMetrics {
  insets: EdgeInsets;
  kavBehavior: "padding" | "height";
  modalCardStyle: ViewStyle;
  sheetCardStyle: ViewStyle;
  bottomFabOffset: number;
  scrollBottomPadding: number;
  compactBadgeTextProps: {
    maxFontSizeMultiplier: number;
  };
  currencyKpiTextProps: {
    adjustsFontSizeToFit: boolean;
    numberOfLines: number;
    minimumFontScale: number;
  };
}

/**
 * Reactive hook backed by useWindowDimensions() and useSafeAreaInsets() that
 * automatically updates across screen sizes, split-screen, foldables, and system insets.
 */
export function useResponsive(): ResponsiveState {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const metrics = getResponsiveMetrics(width, height);
    const kavBehavior: "padding" | "height" = Platform.OS === "ios" ? "padding" : "height";

    const modalCardStyle: ViewStyle = {
      width: "92%",
      maxWidth: 480,
      maxHeight: "88%",
      alignSelf: "center",
    };

    const sheetCardStyle: ViewStyle = {
      width: "100%",
      maxWidth: 540,
      maxHeight: "90%",
      alignSelf: "center",
      paddingBottom: Math.max(insets.bottom, metrics.ms(16)),
    };

    const bottomFabOffset = insets.bottom + metrics.ms(12);
    const scrollBottomPadding = insets.bottom + metrics.ms(88);

    return {
      ...metrics,
      insets,
      kavBehavior,
      modalCardStyle,
      sheetCardStyle,
      bottomFabOffset,
      scrollBottomPadding,
      compactBadgeTextProps: {
        maxFontSizeMultiplier: 1.15,
      },
      currencyKpiTextProps: {
        adjustsFontSizeToFit: true,
        numberOfLines: 1,
        minimumFontScale: 0.75,
      },
    };
  }, [width, height, insets]);
}

/**
 * Helper to ensure numeric badge/KPI text styles include safe vertical rhythm.
 */
export function getResponsiveTextStyle(
  fontSize: number,
  options?: { isTamil?: boolean; scaleFactor?: number }
): TextStyle {
  const scaledSize = ms(fontSize, options?.scaleFactor ?? 0.35);
  return {
    fontSize: scaledSize,
    lineHeight: options?.isTamil
      ? getTamilSafeLineHeight(scaledSize, 1.42)
      : Math.ceil(scaledSize * 1.3),
  };
}
