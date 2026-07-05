import React from "react";
import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { palette, radius } from "../../constants/theme";

interface Props {
  uri?: string | null;
  name: string;
  size?: number;
  style?: ViewStyle;
  showOnline?: boolean;
  online?: boolean;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function Avatar({ uri, name, size = 44, style, showOnline, online }: Props) {
  const dotSize = Math.max(8, Math.round(size * 0.22));
  return (
    <View style={[{ width: size, height: size }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          contentFit="cover"
          // Desaturate for monochrome look.
          tintColor={undefined}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize: size * 0.38 }]} numberOfLines={1}>
            {initialsOf(name)}
          </Text>
        </View>
      )}
      {showOnline && online && (
        <View
          style={[
            styles.onlineDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              right: 0,
              bottom: 0,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: palette.androidCard,
  },
  fallback: {
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: palette.black,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  onlineDot: {
    position: "absolute",
    backgroundColor: palette.online,
    borderWidth: 1.5,
    borderColor: palette.black,
  },
});
