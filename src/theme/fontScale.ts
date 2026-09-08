export const fontSizes = {
  xs: "Extra Small",
  sm: "Small",
  default: "Default",
  md: "Medium",
  lg: "Large",
  xl: "Extra Large",
  huge: "Huge",
} as const;

export type FontSizeKey = keyof typeof fontSizes;

export const fontScaleMap: Record<FontSizeKey, number> = {
  xs: 0.8,
  sm: 0.9,
  default: 1.0,
  md: 1.15,
  lg: 1.3,
  xl: 1.45,
  huge: 1.6,
};
