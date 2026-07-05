import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { AuthAPI } from "../../services/api";
import { useAuthStore } from "../../store/auth";
import { palette, spacing } from "../../constants/theme";

export default function LoginScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [emailOrUsername, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await AuthAPI.login({ emailOrUsername: emailOrUsername.trim(), password });
      setAuth(res.user, res.tokens);
      router.replace("/(tabs)");
    } catch (e: any) {
      const err = e?.response?.data?.error;
      const email = e?.response?.data?.email;
      if (err === "email_not_verified" && email) {
        router.replace({ pathname: "/(auth)/verify-email", params: { email } });
        return;
      }
      setError("Неверный логин или пароль");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Messenger</Text>
          <Text style={styles.subtitle}>Приватные чаты без номера телефона</Text>

          <View style={{ gap: spacing.md, marginTop: spacing.xxl, width: "100%" }}>
            <TextField
              label="Email или @username"
              value={emailOrUsername}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <TextField
              label="Пароль"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="********"
              error={error}
            />
            <Button label="Войти" loading={loading} onPress={submit} size="lg" />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Нет аккаунта?</Text>
            <Link href="/(auth)/register" style={styles.link}>
              Зарегистрироваться
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: palette.black },
  content: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  title: {
    color: palette.white,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: { color: palette.textSecondary, fontSize: 15, marginTop: 6 },
  footer: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.xxl },
  footerText: { color: palette.textSecondary, fontSize: 14 },
  link: { color: palette.white, fontSize: 14, fontWeight: "600" },
});
