import React from "react";
import { View, StyleSheet, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";
import { iosBlur, isIOS, palette, radius } from "../../constants/theme";

interface SurfaceProps extends ViewProps {
  variant?: "card" | "nav" | "bubbleIn" | "bubbleOut";
  rounded?: keyof typeof radius;
}

// Surface: iOS renders a BlurView + translucent overlay (glassmorphism).
// Android renders a solid Material surface.
export function Surface({ style, variant = "card", rounded = "xl", children, ...rest }: SurfaceProps) {
  const r = radius[rounded];
  if (isIOS) {
    return (
      <View style={[styles.wrapIos, { borderRadius: r }, style]} {...rest}>
        <BlurView intensity={iosBlur.intensity} tint={iosBlur.tint} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: r,
              backgroundColor:
                variant === "bubbleOut"
                  ? palette.messageOut
                  : variant === "bubbleIn"
                    ? palette.messageIn
                    : variant === "nav"
                      ? palette.glassStrong
                      : palette.glass,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: palette.glassBorder,
            },
          ]}
        />
        <View style={{ position: "relative" }}>{children}</View>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.wrapAnd,
        {
          borderRadius: r,
          backgroundColor:
            variant === "bubbleOut" ? palette.white : variant === "bubbleIn" || variant === "nav" ? palette.androidSurface : palette.androidCard,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapIos: {
    overflow: "hidden",
  },
  wrapAnd: {
    overflow: "hidden",
  },
});
