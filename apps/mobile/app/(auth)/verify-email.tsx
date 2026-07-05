import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { AuthAPI } from "../../services/api";
import { useAuthStore } from "../../store/auth";
import { palette, spacing } from "../../constants/theme";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();
    if (!/.+@.+\..+/.test(cleanEmail)) {
      setError("Укажите email");
      return;
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Введите 6 цифр из письма");
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await AuthAPI.verifyEmail({ email: cleanEmail, code: cleanCode });
      setAuth(res.user, res.tokens);
      router.replace("/(tabs)");
    } catch (e: any) {
      const err = e?.response?.data?.error;
      if (err === "invalid_code") setError("Неверный код");
      else if (err === "code_expired") setError("Код истёк, запросите новый");
      else setError("Не удалось подтвердить email");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    const cleanEmail = email.trim().toLowerCase();
    if (!/.+@.+\..+/.test(cleanEmail)) {
      setError("Укажите email");
      return;
    }
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      await AuthAPI.resendVerification(cleanEmail);
      setNotice("Новый код отправлен на почту");
    } catch (e: any) {
      const err = e?.response?.data?.error;
      if (err === "email_not_configured") setError("Отправка почты не настроена на сервере");
      else setError("Не удалось отправить код");
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Подтвердите email</Text>
          <Text style={styles.subtitle}>Мы отправили 6-значный код на вашу почту</Text>

          <View style={{ gap: spacing.md, marginTop: spacing.xxl, width: "100%" }}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <TextField
              label="Код"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="123456"
              error={error}
            />
            {!!notice && <Text style={styles.notice}>{notice}</Text>}
            <Button label="Подтвердить" loading={loading} onPress={submit} size="lg" />
            <Button label="Отправить код ещё раз" loading={resending} onPress={resend} variant="secondary" />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Уже подтвердили?</Text>
            <Link href="/(auth)/login" style={styles.link}>Войти</Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: palette.black },
  content: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  title: { color: palette.white, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { color: palette.textSecondary, fontSize: 15, marginTop: 6 },
  notice: { color: palette.white, fontSize: 13, textAlign: "center" },
  footer: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.xxl },
  footerText: { color: palette.textSecondary, fontSize: 14 },
  link: { color: palette.white, fontSize: 14, fontWeight: "600" },
});
