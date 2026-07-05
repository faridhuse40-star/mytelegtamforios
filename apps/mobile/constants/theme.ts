import { Platform } from "react-native";

// Strictly monochrome palette — no color accents anywhere.
// Same tokens are used on both platforms; platform-specific components
// pick their own surface treatments (iOS: blur / Android: solid).

export const palette = {
  black: "#000000",
  white: "#FFFFFF",

  // iOS glass backgrounds (sit on top of BlurView).
  glass: "rgba(255,255,255,0.07)",
  glassStrong: "rgba(255,255,255,0.12)",
  glassBorder: "rgba(255,255,255,0.15)",
  messageIn: "rgba(255,255,255,0.08)",
  messageOut: "rgba(255,255,255,0.18)",

  // Android Material You (monochrome) surfaces.
  androidBackground: "#0D0D0D",
  androidSurface: "#1C1C1C",
  androidCard: "#2A2A2A",
  androidDivider: "rgba(255,255,255,0.07)",
  androidRipple: "rgba(255,255,255,0.12)",

  // Text.
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.45)",
  textMuted: "rgba(255,255,255,0.3)",
  inputPlaceholder: "rgba(255,255,255,0.35)",

  // Status.
  online: "#FFFFFF",
  destructive: "rgba(255,255,255,0.7)", // still monochrome, just lighter
};

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const typography = Platform.select({
  ios: {
    fontFamily: "System", // SF Pro Display on iOS
    titleSize: 17,
    titleWeight: "600" as const,
    titleLetterSpacing: -0.3,
    bodySize: 15,
    bodyWeight: "400" as const,
    captionSize: 12,
  },
  default: {
    fontFamily: "Roboto",
    titleSize: 16,
    titleWeight: "500" as const,
    titleLetterSpacing: 0,
    bodySize: 14,
    bodyWeight: "400" as const,
    captionSize: 12,
  },
})!;

export const iosBlur = {
  intensity: 80 as const,
  tint: "dark" as const,
};

export const isIOS = Platform.OS === "ios";
export const isAndroid = Platform.OS === "android";
