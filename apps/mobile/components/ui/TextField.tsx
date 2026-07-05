import React, { forwardRef } from "react";
import { View, TextInput, Text, StyleSheet, type TextInputProps, type ViewStyle } from "react-native";
import { isIOS, palette, radius, spacing } from "../../constants/theme";

interface Props extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  containerStyle?: ViewStyle;
  rightSlot?: React.ReactNode;
  leftSlot?: React.ReactNode;
}

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, hint, error, containerStyle, rightSlot, leftSlot, style, ...rest },
  ref,
) {
  return (
    <View style={[{ width: "100%" }, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.wrap,
          {
            backgroundColor: isIOS ? palette.glass : palette.androidSurface,
            borderRadius: isIOS ? radius.md : radius.sm,
            borderColor: error ? palette.white : palette.glassBorder,
          },
        ]}
      >
        {leftSlot ? <View style={styles.slot}>{leftSlot}</View> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={palette.inputPlaceholder}
          selectionColor={palette.white}
          style={[styles.input, style]}
          {...rest}
        />
        {rightSlot ? <View style={styles.slot}>{rightSlot}</View> : null}
      </View>
      {(hint || error) && <Text style={[styles.hint, error && { color: palette.white }]}>{error ?? hint}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    color: palette.textSecondary,
    fontSize: 13,
    marginBottom: spacing.xs,
    letterSpacing: -0.1,
  },
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  slot: {
    paddingHorizontal: 4,
  },
  input: {
    flex: 1,
    color: palette.textPrimary,
    fontSize: 16,
    paddingVertical: 12,
  },
  hint: {
    color: palette.textSecondary,
    fontSize: 12,
    marginTop: spacing.xs,
  },
});
