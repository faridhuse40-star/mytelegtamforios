import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  type PressableProps,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { palette, radius } from "../../constants/theme";

interface Props extends Omit<PressableProps, "style"> {
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({ label, variant = "primary", size = "md", loading, onPress, style, disabled, ...rest }: Props) {
  const height = size === "lg" ? 52 : 46;
  const bg =
    variant === "primary"
      ? palette.white
      : variant === "secondary"
        ? palette.glassStrong
        : "transparent";
  const fg = variant === "primary" ? palette.black : palette.white;

  return (
    <Pressable
      onPress={(e) => {
        if (disabled || loading) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}
      android_ripple={{ color: palette.androidRipple }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: bg,
          borderRadius: radius.sm + 2, // 14
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          borderWidth: variant === "ghost" ? StyleSheet.hairlineWidth : 0,
          borderColor: palette.glassBorder,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flexDirection: "row", alignItems: "center" },
  label: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
});
