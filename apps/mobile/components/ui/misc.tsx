import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { palette, radius } from "../../constants/theme";

// Small white badge with black count — visible on any dark surface.
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

export function OnlineDot({ size = 8 }: { size?: number }) {
  return (
    <View
      style={[
        styles.onlineDot,
        { width: size, height: size, borderRadius: size / 2, borderWidth: 1.5 },
      ]}
    />
  );
}

// "typing…" animated dots with opacity/pulse.
export function TypingDots() {
  const a = useSharedValue(0.3);
  const b = useSharedValue(0.3);
  const c = useSharedValue(0.3);
  useEffect(() => {
    const loop = (v: SharedValue<number>, delay: number) => {
      v.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 350 }),
          withTiming(0.3, { duration: 350 }),
          withTiming(0.3, { duration: 600 - delay }),
        ),
        -1,
      );
    };
    loop(a, 0);
    setTimeout(() => loop(b, 100), 120);
    setTimeout(() => loop(c, 200), 240);
  }, []);
  const sA = useAnimatedStyle(() => ({ opacity: a.value }));
  const sB = useAnimatedStyle(() => ({ opacity: b.value }));
  const sC = useAnimatedStyle(() => ({ opacity: c.value }));
  return (
    <View style={styles.typing}>
      <Animated.View style={[styles.dot, sA]} />
      <Animated.View style={[styles.dot, sB]} />
      <Animated.View style={[styles.dot, sC]} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: palette.black,
    fontSize: 11,
    fontWeight: "700",
  },
  onlineDot: {
    backgroundColor: palette.online,
    borderColor: palette.black,
  },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.textSecondary,
  },
});
