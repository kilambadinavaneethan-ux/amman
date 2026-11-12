import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Font from "expo-font";
import { StyleSheet, useWindowDimensions } from "react-native";
import * as RN from "react-native";

import theme from "../../src/theme/theme";
import { fontStyles } from "../../src/theme/fonts";
import { fontScaleMap } from "../../src/theme/fontScale";
import { getScaledTypography } from "../../src/theme/typography";
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  getResponsiveMetrics,
  getTamilSafeLineHeight,
  hasTamilScript,
  ms,
  syncViewportDimensions,
  type ResponsiveMetrics,
} from "../../utils/responsive";

// ═══════════════════════════════════════════════════════════════════
// MODULE-LEVEL MUTABLE FONT CONFIG
// Updated synchronously by ThemeProvider during render.
// Read synchronously by patched Text/TextInput — always current.
// ═══════════════════════════════════════════════════════════════════
let _fontScale = 1.0;
let _boldEnabled = false;
let _fontStyleId = "Default";
let _letterSpacingMode = "normal";
let _lineHeightMode = "normal";

const letterSpacingOffsetMap: Record<string, number> = {
  tight: -0.5,
  normal: 0,
  spacious: 0.5,
  wide: 1.0,
};

const lineHeightMultiplierMap: Record<string, number> = {
  compact: 0.9,
  normal: 1.0,
  relaxed: 1.2,
};

// ═══════════════════════════════════════════════════════════════════
// DEFAULT TYPOGRAPHY (includes all required fields for initial render)
// ═══════════════════════════════════════════════════════════════════
const defaultTypographyConfig = {
  ...getScaledTypography("Default", false),
  fontScale: 1.0,
  fontFamily: undefined as string | undefined,
  boldEnabled: false,
  fontSizeKey: "default",
  fontStyleId: "Default",
  letterSpacingMode: "normal",
  lineHeightMode: "normal",
};

export type AppTheme = Omit<typeof theme, "typography"> & {
  typography: typeof defaultTypographyConfig & Record<string, any>;
  responsive: ResponsiveMetrics;
  isDark: boolean;
  name: string;
};

export interface ThemeContextType {
  themeName: string;
  theme: AppTheme;
  fontSize: string;
  fontStyle: string;
  boldEnabled: boolean;
  letterSpacing: string;
  lineHeight: string;
  fontsLoaded: boolean;
  setFontSize: (size: string) => void;
  setFontStyle: (style: string) => void;
  setBoldEnabled: (enabled: boolean) => void;
  setLetterSpacing: (spacing: string) => void;
  setLineHeight: (height: string) => void;
  saveFontSettings: () => Promise<boolean>;
  revertFontSettings: () => Promise<void>;
  resetFontSettings: () => Promise<boolean>;
  setThemeName: (name: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════
export const UnscaledTextContext = createContext<boolean>(false);

const defaultResponsiveMetrics = getResponsiveMetrics(BASE_WIDTH, BASE_HEIGHT);

export const ThemeContext = createContext<ThemeContextType>({
  themeName: "nordic",
  theme: {
    ...theme,
    typography: defaultTypographyConfig,
    responsive: defaultResponsiveMetrics,
    isDark: false,
    name: "Nordic Frost (Light)",
  },
  fontSize: "default",
  fontStyle: "Default",
  boldEnabled: false,
  letterSpacing: "normal",
  lineHeight: "normal",
  fontsLoaded: true,
  setFontSize: () => {},
  setFontStyle: () => {},
  setBoldEnabled: () => {},
  setLetterSpacing: () => {},
  setLineHeight: () => {},
  saveFontSettings: async () => false,
  revertFontSettings: async () => {},
  resetFontSettings: async () => false,
  setThemeName: async () => {},
});

const styleCache = new Map<unknown, Record<string, any>>();
const tamilStyleCache = new Map<unknown, Record<string, any>>();

function clearFontStyleCache() {
  styleCache.clear();
  tamilStyleCache.clear();
}

// ═══════════════════════════════════════════════════════════════════
// GLOBAL TEXT / TEXTINPUT PATCH
// ═══════════════════════════════════════════════════════════════════
let isPatched = false;

function patchGlobalTextComponents() {
  if (isPatched) return;
  isPatched = true;

  // Capture originals BEFORE overriding
  const OriginalText = RN.Text as any;
  const OriginalTextInput = RN.TextInput as any;

  // Cap runaway OS font magnification on unconfigured system texts while letting explicit
  // allowFontScaling / maxFontSizeMultiplier props (e.g. 1.15 on compact badges/headers) apply.
  if (OriginalText.defaultProps == null) OriginalText.defaultProps = {};
  OriginalText.defaultProps.allowFontScaling = true;
  OriginalText.defaultProps.maxFontSizeMultiplier = 1.25;

  if (OriginalTextInput.defaultProps == null) OriginalTextInput.defaultProps = {};
  OriginalTextInput.defaultProps.allowFontScaling = true;
  OriginalTextInput.defaultProps.maxFontSizeMultiplier = 1.25;

  // Pure function — reads module-level vars, no hooks, no closures
  function computeFontStyle(inputStyle: any, containsTamil = false) {
    const scale = _fontScale;
    const bold = _boldEnabled;
    const sid = _fontStyleId;
    const spacingMode = _letterSpacingMode;
    const heightMode = _lineHeightMode;

    const isDefaultConfig =
      scale === 1.0 &&
      !bold &&
      sid === "Default" &&
      spacingMode === "normal" &&
      heightMode === "normal";

    // Ultra-fast path: If defaults are active and no Tamil vertical rhythm guard is needed
    if (isDefaultConfig && !containsTamil) {
      return inputStyle;
    }

    if (!inputStyle) {
      const res: Record<string, any> = {};
      if (sid && sid !== "Default") {
        res.fontFamily = bold ? `${sid}-Bold` : `${sid}-Regular`;
      }
      if (bold) res.fontWeight = "700";
      if (spacingMode !== "normal") {
        res.letterSpacing = letterSpacingOffsetMap[spacingMode] || 0;
      }
      if (scale !== 1.0) {
        res.fontSize = Math.round(14 * scale);
      }
      if (containsTamil) {
        const effSize = res.fontSize ?? 14;
        res.lineHeight = getTamilSafeLineHeight(effSize, 1.4);
      }
      return res;
    }

    const activeCache = containsTamil ? tamilStyleCache : styleCache;
    // Fast-path lookup for previously computed styles
    if (activeCache.has(inputStyle)) {
      return activeCache.get(inputStyle);
    }

    const flat = (StyleSheet.flatten(inputStyle) || {}) as Record<string, any>;

    const rawSize = flat.fontSize;
    const hasExplicitSize = typeof rawSize === "number" && !isNaN(rawSize);
    const baseSize = hasExplicitSize ? rawSize : 14;
    const finalSize =
      hasExplicitSize || scale !== 1.0 ? Math.round(baseSize * scale) : undefined;

    let finalLineHeight = flat.lineHeight;
    const lhMultiplier = lineHeightMultiplierMap[heightMode] || 1.0;
    if (typeof flat.lineHeight === "number") {
      finalLineHeight = Math.round(flat.lineHeight * scale * lhMultiplier);
    } else if (heightMode !== "normal" && finalSize !== undefined) {
      finalLineHeight = Math.round(finalSize * 1.35 * lhMultiplier);
    }

    if (containsTamil) {
      const effSize = finalSize ?? baseSize;
      const minTamilLh = getTamilSafeLineHeight(effSize, 1.4);
      if (typeof finalLineHeight !== "number" || finalLineHeight < minTamilLh) {
        finalLineHeight = minTamilLh;
      }
    }

    let finalLetterSpacing = flat.letterSpacing;
    const spacingOffset = letterSpacingOffsetMap[spacingMode] || 0;
    if (spacingOffset !== 0) {
      finalLetterSpacing = (flat.letterSpacing || 0) + spacingOffset;
    }

    let weight = flat.fontWeight;
    if (bold) {
      if (!weight || weight === "normal" || weight === "400") {
        weight = "700";
      } else if (weight === "500" || weight === "600") {
        weight = "800";
      }
    }

    let family = flat.fontFamily;
    if (sid && sid !== "Default") {
      const isBoldWeight =
        weight === "700" || weight === "800" || weight === "900" || weight === "bold";
      family = isBoldWeight ? `${sid}-Bold` : `${sid}-Regular`;
    }

    const result: Record<string, any> = { ...flat };
    if (finalSize !== undefined) result.fontSize = finalSize;
    if (finalLineHeight !== undefined) result.lineHeight = finalLineHeight;
    if (finalLetterSpacing !== undefined) result.letterSpacing = finalLetterSpacing;
    if (weight !== undefined) result.fontWeight = weight;
    if (family !== undefined) result.fontFamily = family;

    if (activeCache.size > 1500) {
      activeCache.clear();
    }
    activeCache.set(inputStyle, result);

    return result;
  }

  // Patched Text — useContext only for re-render trigger
  const PatchedText = React.forwardRef(function PatchedText(props: any, ref: any) {
    const {
      style,
      children,
      unscaled,
      allowFontScaling: propAllowFontScaling,
      maxFontSizeMultiplier: propMaxFontSizeMultiplier,
      ...rest
    } = props;
    useContext(ThemeContext);
    const isUnscaledContext = useContext(UnscaledTextContext);
    const lockScaling = Boolean(isUnscaledContext || unscaled);
    const containsTamil = !lockScaling && hasTamilScript(children);
    const finalStyle = lockScaling ? style : computeFontStyle(style, containsTamil);

    return (
      <OriginalText
        ref={ref}
        style={finalStyle}
        {...rest}
        allowFontScaling={lockScaling ? false : (propAllowFontScaling ?? true)}
        maxFontSizeMultiplier={lockScaling ? 1 : (propMaxFontSizeMultiplier ?? 1.25)}
      >
        {children}
      </OriginalText>
    );
  });

  // Patched TextInput — useContext only for re-render trigger
  const PatchedTextInput = React.forwardRef(function PatchedTextInput(props: any, ref: any) {
    const {
      style,
      unscaled,
      allowFontScaling: propAllowFontScaling,
      maxFontSizeMultiplier: propMaxFontSizeMultiplier,
      ...rest
    } = props;
    useContext(ThemeContext);
    const isUnscaledContext = useContext(UnscaledTextContext);
    const lockScaling = Boolean(isUnscaledContext || unscaled);
    const finalStyle = lockScaling ? style : computeFontStyle(style, false);
    return (
      <OriginalTextInput
        ref={ref}
        style={finalStyle}
        {...rest}
        allowFontScaling={lockScaling ? false : (propAllowFontScaling ?? true)}
        maxFontSizeMultiplier={lockScaling ? 1 : (propMaxFontSizeMultiplier ?? 1.25)}
      />
    );
  });

  // Override RN exports — all import { Text } will get PatchedText
  try {
    Object.defineProperty(RN, "Text", {
      get() {
        return PatchedText;
      },
      configurable: true,
    });
  } catch {
    try {
      (RN as any).Text = PatchedText;
    } catch {
      // Ignore readonly module export error
    }
  }

  try {
    Object.defineProperty(RN, "TextInput", {
      get() {
        return PatchedTextInput;
      },
      configurable: true,
    });
  } catch {
    try {
      (RN as any).TextInput = PatchedTextInput;
    } catch {
      // Ignore readonly module export error
    }
  }
}

// Execute immediately when this module loads (before any screen renders)
patchGlobalTextComponents();

// ═══════════════════════════════════════════════════════════════════
// THEME PROVIDER
// ═══════════════════════════════════════════════════════════════════
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  syncViewportDimensions(windowWidth, windowHeight);

  const responsiveMetrics = useMemo(
    () => getResponsiveMetrics(windowWidth, windowHeight),
    [windowWidth, windowHeight],
  );

  useEffect(() => {
    syncViewportDimensions(windowWidth, windowHeight);
  }, [windowWidth, windowHeight]);

  const [fontSize, setFontSizeState] = useState<string>("default");
  const [fontStyle, setFontStyleState] = useState<string>("Default");
  const [boldEnabled, setBoldEnabledState] = useState<boolean>(false);
  const [letterSpacing, setLetterSpacingState] = useState<string>("normal");
  const [lineHeight, setLineHeightState] = useState<string>("normal");
  const [loadedFonts, setLoadedFonts] = useState<Record<string, boolean>>({});
  const [loadingFont, setLoadingFont] = useState<boolean>(false);

  const settingsRef = useRef({
    fontSize,
    fontStyle,
    boldEnabled,
    letterSpacing,
    lineHeight,
  });

  useEffect(() => {
    settingsRef.current = {
      fontSize,
      fontStyle,
      boldEnabled,
      letterSpacing,
      lineHeight,
    };
  }, [fontSize, fontStyle, boldEnabled, letterSpacing, lineHeight]);

  // Load saved preferences on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [savedSize, savedStyle, savedBold, savedSpacing, savedHeight] =
          await Promise.all([
            AsyncStorage.getItem("font_size"),
            AsyncStorage.getItem("font_style"),
            AsyncStorage.getItem("font_bold"),
            AsyncStorage.getItem("font_letter_spacing"),
            AsyncStorage.getItem("font_line_height"),
          ]);
        if (!isMounted) return;
        if (savedSize) setFontSizeState(savedSize);
        if (savedStyle) setFontStyleState(savedStyle);
        if (savedBold) setBoldEnabledState(savedBold === "true");
        if (savedSpacing) setLetterSpacingState(savedSpacing);
        if (savedHeight) setLineHeightState(savedHeight);
      } catch (e) {
        console.error("Font settings load error:", e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-persisting setters so changes apply instantly & stick across screens
  const setFontSize = useCallback((s: string) => {
    setFontSizeState(s);
    AsyncStorage.setItem("font_size", s).catch(console.error);
  }, []);

  const setFontStyle = useCallback((s: string) => {
    setFontStyleState(s);
    AsyncStorage.setItem("font_style", s).catch(console.error);
  }, []);

  const setBoldEnabled = useCallback((b: boolean) => {
    setBoldEnabledState(b);
    AsyncStorage.setItem("font_bold", String(b)).catch(console.error);
  }, []);

  const setLetterSpacing = useCallback((ls: string) => {
    setLetterSpacingState(ls);
    AsyncStorage.setItem("font_letter_spacing", ls).catch(console.error);
  }, []);

  const setLineHeight = useCallback((lh: string) => {
    setLineHeightState(lh);
    AsyncStorage.setItem("font_line_height", lh).catch(console.error);
  }, []);

  const saveFontSettings = useCallback(async (): Promise<boolean> => {
    const current = settingsRef.current;
    try {
      await Promise.all([
        AsyncStorage.setItem("font_size", current.fontSize),
        AsyncStorage.setItem("font_style", current.fontStyle),
        AsyncStorage.setItem("font_bold", String(current.boldEnabled)),
        AsyncStorage.setItem("font_letter_spacing", current.letterSpacing),
        AsyncStorage.setItem("font_line_height", current.lineHeight),
      ]);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, []);

  const revertFontSettings = useCallback(async (): Promise<void> => {
    try {
      const [savedSize, savedStyle, savedBold, savedSpacing, savedHeight] =
        await Promise.all([
          AsyncStorage.getItem("font_size"),
          AsyncStorage.getItem("font_style"),
          AsyncStorage.getItem("font_bold"),
          AsyncStorage.getItem("font_letter_spacing"),
          AsyncStorage.getItem("font_line_height"),
        ]);
      setFontSizeState(savedSize || "default");
      setFontStyleState(savedStyle || "Default");
      setBoldEnabledState(savedBold === "true");
      setLetterSpacingState(savedSpacing || "normal");
      setLineHeightState(savedHeight || "normal");
    } catch (e) {
      console.error(e);
    }
  }, []);

  const resetFontSettings = useCallback(async (): Promise<boolean> => {
    try {
      await AsyncStorage.multiRemove([
        "font_size",
        "font_style",
        "font_bold",
        "font_letter_spacing",
        "font_line_height",
      ]);
      setFontSizeState("default");
      setFontStyleState("Default");
      setBoldEnabledState(false);
      setLetterSpacingState("normal");
      setLineHeightState("normal");
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, []);

  const setThemeName = useCallback(async (_name: string): Promise<void> => {}, []);

  // Load custom fonts on demand when fontStyle changes
  useEffect(() => {
    if (fontStyle === "Default") return;
    const opt = (fontStyles as any[]).find((f) => f.id === fontStyle);
    if (!opt || !opt.regularUrl || !opt.boldUrl) return;
    const rKey = `${fontStyle}-Regular`;
    const bKey = `${fontStyle}-Bold`;
    if (loadedFonts[rKey] && loadedFonts[bKey]) return;

    let isMounted = true;
    (async () => {
      setLoadingFont(true);
      try {
        await Font.loadAsync({ [rKey]: opt.regularUrl, [bKey]: opt.boldUrl });
        if (isMounted) {
          setLoadedFonts((p) => ({ ...p, [rKey]: true, [bKey]: true }));
        }
      } catch (e) {
        console.warn(`Font load error (${fontStyle}):`, e);
      } finally {
        if (isMounted) {
          setLoadingFont(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [fontStyle, loadedFonts]);

  // Compute typography config + update module-level variables
  const typographyConfig = useMemo(() => {
    const isFontReady =
      fontStyle === "Default" ||
      (loadedFonts[`${fontStyle}-Regular`] && loadedFonts[`${fontStyle}-Bold`]);
    const activeStyle = isFontReady ? fontStyle : "Default";

    const scaled = getScaledTypography(activeStyle, boldEnabled, fontSize as any);
    const responsiveScaled = Object.fromEntries(
      Object.entries(scaled).map(([k, def]) => [
        k,
        {
          ...def,
          fontSize: ms(def.fontSize, 0.35, responsiveMetrics.width),
        },
      ]),
    ) as typeof scaled;

    const fontScale = (fontScaleMap as Record<string, number>)[fontSize] || 1.0;
    const fontSuffix = boldEnabled ? "Bold" : "Regular";
    const fontFamily =
      activeStyle === "Default" ? undefined : `${activeStyle}-${fontSuffix}`;

    // Update module-level variables synchronously during render
    // so patched Text/TextInput always read the latest values
    _fontScale = fontScale;
    _boldEnabled = boldEnabled;
    _fontStyleId = activeStyle;
    _letterSpacingMode = letterSpacing;
    _lineHeightMode = lineHeight;
    clearFontStyleCache();

    return {
      ...responsiveScaled,
      fontScale,
      fontFamily,
      boldEnabled,
      fontSizeKey: fontSize,
      fontStyleId: fontStyle,
      letterSpacingMode: letterSpacing,
      lineHeightMode: lineHeight,
    };
  }, [fontSize, fontStyle, boldEnabled, letterSpacing, lineHeight, loadedFonts, responsiveMetrics.width]);

  // Build context value
  const ctxValue = useMemo<ThemeContextType>(
    () => ({
      themeName: "nordic",
      theme: {
        ...theme,
        typography: typographyConfig,
        responsive: responsiveMetrics,
        isDark: false,
        name: "Nordic Frost (Light)",
      },
      fontSize,
      fontStyle,
      boldEnabled,
      letterSpacing,
      lineHeight,
      fontsLoaded: !loadingFont,
      setFontSize,
      setFontStyle,
      setBoldEnabled,
      setLetterSpacing,
      setLineHeight,
      saveFontSettings,
      revertFontSettings,
      resetFontSettings,
      setThemeName,
    }),
    [
      typographyConfig,
      responsiveMetrics,
      fontSize,
      fontStyle,
      boldEnabled,
      letterSpacing,
      lineHeight,
      loadingFont,
      setFontSize,
      setFontStyle,
      setBoldEnabled,
      setLetterSpacing,
      setLineHeight,
      saveFontSettings,
      revertFontSettings,
      resetFontSettings,
      setThemeName,
    ],
  );

  return (
    <ThemeContext.Provider value={ctxValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

export default function ThemeRoutePlaceholder() {
  return null;
}
