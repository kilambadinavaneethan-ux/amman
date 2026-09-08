import { fontScaleMap, FontSizeKey } from "./fontScale";

export interface TypographyDefinition {
  fontSize: number;
  fontWeight: "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
  fontFamily?: string;
  letterSpacing?: number;
}

export const baseTypography = {
  display: { fontSize: 34, fontWeight: "800", letterSpacing: -1 },
  h1: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: "700" },
  title: { fontSize: 17, fontWeight: "700" },
  subtitle: { fontSize: 15, fontWeight: "600" },
  bodyLarge: { fontSize: 16, fontWeight: "400" },
  bodyMedium: { fontSize: 14, fontWeight: "400" },
  bodySmall: { fontSize: 12, fontWeight: "400" },
  caption: { fontSize: 11, fontWeight: "500" },
  button: { fontSize: 15, fontWeight: "700" },
  label: { fontSize: 12, fontWeight: "700" },
  smallLabel: { fontSize: 10, fontWeight: "700" },
  body: { fontSize: 15, fontWeight: "500" },
  stat: { fontSize: 26, fontWeight: "800" },
} as const;

export type TypographyKey = keyof typeof baseTypography;

export const getScaledTypography = (
  fontStyleId: string,
  boldEnabled: boolean,
  fontSizeKey: FontSizeKey = "default"
): Record<TypographyKey, TypographyDefinition> => {
  const scaled = {} as Record<TypographyKey, TypographyDefinition>;

  const fontScale = fontScaleMap[fontSizeKey] || 1.0;
  const fontSuffix = boldEnabled ? "Bold" : "Regular";
  const fontFamily = fontStyleId === "Default" ? undefined : `${fontStyleId}-${fontSuffix}`;

  Object.entries(baseTypography).forEach(([k, value]) => {
    const key = k as TypographyKey;
    let weight = value.fontWeight;
    
    if (boldEnabled) {
      if (weight === "400" || weight === "500") {
        weight = "700";
      } else if (weight === "600" || weight === "700") {
        weight = "800";
      }
    }

    scaled[key] = {
      fontSize: Math.round(value.fontSize * fontScale),
      fontWeight: weight as any,
      fontFamily,
      ...("letterSpacing" in value ? { letterSpacing: value.letterSpacing } : {}),
    };
  });

  return scaled;
};
