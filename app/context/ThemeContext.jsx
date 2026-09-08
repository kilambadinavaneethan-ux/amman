import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Font from "expo-font";
import { StyleSheet } from "react-native";
import * as RN from "react-native";

import theme from "../../src/theme/theme";
import { fontStyles } from "../../src/theme/fonts";
import { fontScaleMap } from "../../src/theme/fontScale";
import { getScaledTypography } from "../../src/theme/typography";

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

const letterSpacingOffsetMap = {
  tight: -0.5,
  normal: 0,
  spacious: 0.5,
  wide: 1.0,
};

const lineHeightMultiplierMap = {
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
  fontFamily: undefined,
  boldEnabled: false,
  fontSizeKey: "default",
  fontStyleId: "Default",
  letterSpacingMode: "normal",
  lineHeightMode: "normal",
};

// ═══════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════
export const ThemeContext = createContext({
  themeName: "nordic",
  theme: {
    ...theme,
    typography: defaultTypographyConfig,
    isDark: false,
    name: "Nordic Frost (Light)",
  },
  fontSize: "default",
  fontStyle: "Default",
  boldEnabled: false,
  letterSpacing: "normal",
  lineHeight: "normal",
  fontsLoaded: true,
  setFontSize: (_size) => {},
  setFontStyle: (_style) => {},
  setBoldEnabled: (_enabled) => {},
  setLetterSpacing: (_spacing) => {},
  setLineHeight: (_height) => {},
  saveFontSettings: async () => false,
  revertFontSettings: async () => {},
  resetFontSettings: async () => {},
  setThemeName: async () => {},
});

// ═══════════════════════════════════════════════════════════════════
// GLOBAL TEXT / TEXTINPUT PATCH
// ═══════════════════════════════════════════════════════════════════
let isPatched = false;

function patchGlobalTextComponents() {
  if (isPatched) return;
  isPatched = true;

  // Capture originals BEFORE overriding
  const OriginalText = RN.Text;
  const OriginalTextInput = RN.TextInput;

  // Enforce allowFontScaling = false and maxFontSizeMultiplier = 1 globally
  if (OriginalText.defaultProps == null) OriginalText.defaultProps = {};
  OriginalText.defaultProps.allowFontScaling = false;
  OriginalText.defaultProps.maxFontSizeMultiplier = 1;

  if (OriginalTextInput.defaultProps == null) OriginalTextInput.defaultProps = {};
  OriginalTextInput.defaultProps.allowFontScaling = false;
  OriginalTextInput.defaultProps.maxFontSizeMultiplier = 1;

  // Pure function — reads module-level vars, no hooks, no closures
  function computeFontStyle(inputStyle) {
    const scale = _fontScale;
    const bold = _boldEnabled;
    const sid = _fontStyleId;
    const spacingMode = _letterSpacingMode;
    const heightMode = _lineHeightMode;

    if (!inputStyle) {
      // No style prop — apply custom font family + bold + spacing + scaled size if active
      const res = {};
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
      return res;
    }

    const flat = StyleSheet.flatten(inputStyle) || {};

    // Scale font size: if explicitly set, scale it. Otherwise default base 14px scales if scale != 1.0
    const rawSize = flat.fontSize;
    const hasExplicitSize = typeof rawSize === "number" && !isNaN(rawSize);
    const baseSize = hasExplicitSize ? rawSize : 14;
    const finalSize = (hasExplicitSize || scale !== 1.0) ? Math.round(baseSize * scale) : undefined;

    // Scale or adjust line height
    let finalLineHeight = flat.lineHeight;
    const lhMultiplier = lineHeightMultiplierMap[heightMode] || 1.0;
    if (typeof flat.lineHeight === "number") {
      finalLineHeight = Math.round(flat.lineHeight * scale * lhMultiplier);
    } else if (heightMode !== "normal" && finalSize !== undefined) {
      finalLineHeight = Math.round(finalSize * 1.35 * lhMultiplier);
    }

    // Adjust letter spacing
    let finalLetterSpacing = flat.letterSpacing;
    const spacingOffset = letterSpacingOffsetMap[spacingMode] || 0;
    if (spacingOffset !== 0) {
      finalLetterSpacing = (flat.letterSpacing || 0) + spacingOffset;
    }

    // Bold weight adjustment
    let weight = flat.fontWeight;
    if (bold) {
      if (!weight || weight === "normal" || weight === "400") {
        weight = "700";
      } else if (weight === "500" || weight === "600") {
        weight = "800";
      }
    }

    // Font family based on final resolved weight
    let family = flat.fontFamily;
    if (sid && sid !== "Default") {
      const isBoldWeight = weight === "700" || weight === "800" || weight === "900" || weight === "bold";
      family = isBoldWeight ? `${sid}-Bold` : `${sid}-Regular`;
    }

    const result = { ...flat };
    if (finalSize !== undefined) result.fontSize = finalSize;
    if (finalLineHeight !== undefined) result.lineHeight = finalLineHeight;
    if (finalLetterSpacing !== undefined) result.letterSpacing = finalLetterSpacing;
    if (weight !== undefined) result.fontWeight = weight;
    if (family !== undefined) result.fontFamily = family;
    return result;
  }

  // Patched Text — useContext only for re-render trigger
  const PatchedText = React.forwardRef(function PatchedText(props, ref) {
    const { style, children, ...rest } = props;
    useContext(ThemeContext); // triggers re-render when settings change
    const finalStyle = computeFontStyle(style);
    return (
      <OriginalText
        ref={ref}
        style={finalStyle}
        {...rest}
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
      >
        {children}
      </OriginalText>
    );
  });

  // Patched TextInput — useContext only for re-render trigger
  const PatchedTextInput = React.forwardRef(function PatchedTextInput(props, ref) {
    const { style, ...rest } = props;
    useContext(ThemeContext); // triggers re-render when settings change
    const finalStyle = computeFontStyle(style);
    return (
      <OriginalTextInput
        ref={ref}
        style={finalStyle}
        {...rest}
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
      />
    );
  });

  // Override RN exports — all import { Text } will get PatchedText
  try {
    Object.defineProperty(RN, "Text", {
      get() { return PatchedText; },
      configurable: true,
    });
  } catch (e) {
    try {
      RN.Text = PatchedText;
    } catch (_) {}
  }

  try {
    Object.defineProperty(RN, "TextInput", {
      get() { return PatchedTextInput; },
      configurable: true,
    });
  } catch (e) {
    try {
      RN.TextInput = PatchedTextInput;
    } catch (_) {}
  }
}

// Execute immediately when this module loads (before any screen renders)
patchGlobalTextComponents();

// ═══════════════════════════════════════════════════════════════════
// THEME PROVIDER
// ═══════════════════════════════════════════════════════════════════
export function ThemeProvider({ children }) {
  const [fontSize, setFontSizeState] = useState("default");
  const [fontStyle, setFontStyleState] = useState("Default");
  const [boldEnabled, setBoldEnabledState] = useState(false);
  const [letterSpacing, setLetterSpacingState] = useState("normal");
  const [lineHeight, setLineHeightState] = useState("normal");
  const [loadedFonts, setLoadedFonts] = useState({});
  const [loadingFont, setLoadingFont] = useState(false);

  // Load saved preferences on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedSize, savedStyle, savedBold, savedSpacing, savedHeight] = await Promise.all([
          AsyncStorage.getItem("font_size"),
          AsyncStorage.getItem("font_style"),
          AsyncStorage.getItem("font_bold"),
          AsyncStorage.getItem("font_letter_spacing"),
          AsyncStorage.getItem("font_line_height"),
        ]);
        if (savedSize) setFontSizeState(savedSize);
        if (savedStyle) setFontStyleState(savedStyle);
        if (savedBold) setBoldEnabledState(savedBold === "true");
        if (savedSpacing) setLetterSpacingState(savedSpacing);
        if (savedHeight) setLineHeightState(savedHeight);
      } catch (e) {
        console.error("Font settings load error:", e);
      }
    })();
  }, []);

  // Auto-persisting setters so changes apply instantly & stick across screens
  const setFontSize = (s) => {
    setFontSizeState(s);
    AsyncStorage.setItem("font_size", s).catch(console.error);
  };
  const setFontStyle = (s) => {
    setFontStyleState(s);
    AsyncStorage.setItem("font_style", s).catch(console.error);
  };
  const setBoldEnabled = (b) => {
    setBoldEnabledState(b);
    AsyncStorage.setItem("font_bold", String(b)).catch(console.error);
  };
  const setLetterSpacing = (ls) => {
    setLetterSpacingState(ls);
    AsyncStorage.setItem("font_letter_spacing", ls).catch(console.error);
  };
  const setLineHeight = (lh) => {
    setLineHeightState(lh);
    AsyncStorage.setItem("font_line_height", lh).catch(console.error);
  };

  const saveFontSettings = async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem("font_size", fontSize),
        AsyncStorage.setItem("font_style", fontStyle),
        AsyncStorage.setItem("font_bold", String(boldEnabled)),
        AsyncStorage.setItem("font_letter_spacing", letterSpacing),
        AsyncStorage.setItem("font_line_height", lineHeight),
      ]);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const revertFontSettings = async () => {
    try {
      const [savedSize, savedStyle, savedBold, savedSpacing, savedHeight] = await Promise.all([
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
  };

  const resetFontSettings = async () => {
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
  };

  // Load custom fonts on demand when fontStyle changes
  useEffect(() => {
    if (fontStyle === "Default") return;
    const opt = fontStyles.find((f) => f.id === fontStyle);
    if (!opt || !opt.regularUrl || !opt.boldUrl) return;
    const rKey = `${fontStyle}-Regular`;
    const bKey = `${fontStyle}-Bold`;
    if (loadedFonts[rKey] && loadedFonts[bKey]) return;

    (async () => {
      setLoadingFont(true);
      try {
        await Font.loadAsync({ [rKey]: opt.regularUrl, [bKey]: opt.boldUrl });
        setLoadedFonts((p) => ({ ...p, [rKey]: true, [bKey]: true }));
      } catch (e) {
        console.warn(`Font load error (${fontStyle}):`, e);
      } finally {
        setLoadingFont(false);
      }
    })();
  }, [fontStyle]);

  // Compute typography config + update module-level variables
  const typographyConfig = useMemo(() => {
    const isFontReady = fontStyle === "Default" ||
      (loadedFonts[`${fontStyle}-Regular`] && loadedFonts[`${fontStyle}-Bold`]);
    const activeStyle = isFontReady ? fontStyle : "Default";

    const scaled = getScaledTypography(activeStyle, boldEnabled, fontSize);
    const fontScale = fontScaleMap[fontSize] || 1.0;
    const fontSuffix = boldEnabled ? "Bold" : "Regular";
    const fontFamily = activeStyle === "Default" ? undefined : `${activeStyle}-${fontSuffix}`;

    // ★ CRITICAL: Update module-level variables synchronously during render
    // so patched Text/TextInput always read the latest values
    _fontScale = fontScale;
    _boldEnabled = boldEnabled;
    _fontStyleId = activeStyle;
    _letterSpacingMode = letterSpacing;
    _lineHeightMode = lineHeight;

    return {
      ...scaled,
      fontScale,
      fontFamily,
      boldEnabled,
      fontSizeKey: fontSize,
      fontStyleId: fontStyle,
      letterSpacingMode: letterSpacing,
      lineHeightMode: lineHeight,
    };
  }, [fontSize, fontStyle, boldEnabled, letterSpacing, lineHeight, loadedFonts]);

  // Build context value
  const ctxValue = useMemo(() => ({
    themeName: "nordic",
    theme: {
      ...theme,
      typography: typographyConfig,
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
    setThemeName: async () => {},
  }), [typographyConfig, fontSize, fontStyle, boldEnabled, letterSpacing, lineHeight, loadingFont]);

  return (
    <ThemeContext.Provider value={ctxValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeRoutePlaceholder() {
  return null;
}
