import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuthStore } from "../store/auth";
import { palette } from "../constants/theme";

export default function Index() {
  const status = useAuthStore((s) => s.status);
  if (status === "unknown") {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={palette.white} />
      </View>
    );
  }
  if (status === "authenticated") return <Redirect href="/(tabs)" />;
  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: palette.black, alignItems: "center", justifyContent: "center" },
});
