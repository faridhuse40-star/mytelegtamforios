import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { USERNAME_REGEX, PASSWORD_MIN_LENGTH } from "@messenger/shared";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { AuthAPI, UserAPI } from "../../services/api";
import { palette, spacing } from "../../constants/theme";

export default function RegisterScreen() {
  const router = useRouter();
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "free" | "taken">("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live availability check with a small debounce.
  useEffect(() => {
    const clean = username.trim().toLowerCase().replace(/^@/, "");
    if (!USERNAME_REGEX.test(clean)) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    let cancelled = false;
    const t = setTimeout(() => {
      UserAPI.checkUsername(clean)
        .then((res) => {
          if (!cancelled) setUsernameStatus(res.available ? "free" : "taken");
        })
        .catch(() => {
          if (!cancelled) setUsernameStatus("idle");
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username]);

  function validate(): string | null {
    const cleanUsername = username.trim().replace(/^@/, "").toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    if (!firstName.trim()) return "Укажите имя";
    if (!lastName.trim()) return "Укажите фамилию";
    if (!USERNAME_REGEX.test(cleanUsername)) return "Username: латиница, цифры, _ (мин. 4)";
    if (!/.+@.+\..+/.test(cleanEmail)) return "Некорректный email";
    if (password.length < PASSWORD_MIN_LENGTH) return `Пароль минимум ${PASSWORD_MIN_LENGTH} символов`;
    return null;
  }

  async function submit() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (usernameStatus === "taken") {
      setError("Этот @username уже занят");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const cleanUsername = username.trim().replace(/^@/, "").toLowerCase();
      const cleanEmail = email.trim().toLowerCase();
      const res = await AuthAPI.register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: cleanUsername,
        email: cleanEmail,
        password,
      });
      router.replace({ pathname: "/(auth)/verify-email", params: { email: res.email } });
    } catch (e: any) {
      const field = e?.response?.data?.field;
      const err = e?.response?.data?.error;
      if (field === "email") setError("Этот email уже занят");
      else if (field === "username") setError("Этот @username уже занят");
      else if (err === "email_not_configured") setError("Отправка почты не настроена на сервере");
      else if (err === "email_send_failed") setError("Не удалось отправить письмо подтверждения");
      else if (err === "invalid_input") setError("Проверьте поля: username только латиница/цифры/_ от 4 символов, email должен быть корректным");
      else {
        // Surface actual error so we can diagnose connectivity issues.
        const status = e?.response?.status;
        const code = e?.code;
        const msg = e?.message ?? "unknown";
        setError(`Ошибка: ${status ?? code ?? "net"} — ${msg}`);
      }
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
          <Text style={styles.title}>Создать аккаунт</Text>
          <Text style={styles.subtitle}>Без номера телефона — только email</Text>

          <View style={{ gap: spacing.md, marginTop: spacing.xl, width: "100%" }}>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <TextField containerStyle={{ flex: 1 }} label="Имя" value={firstName} onChangeText={setFirst} autoCapitalize="words" />
              <TextField containerStyle={{ flex: 1 }} label="Фамилия" value={lastName} onChangeText={setLast} autoCapitalize="words" />
            </View>
            <TextField
              label="@username"
              value={username}
              onChangeText={(t) => setUsername(t.replace(/^@/, ""))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="alex_k"
              hint={
                usernameStatus === "checking"
                  ? "Проверяем…"
                  : usernameStatus === "free"
                    ? "Свободен"
                    : undefined
              }
              error={usernameStatus === "taken" ? "Этот @username уже занят" : null}
            />
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
              label="Пароль"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="********"
              error={error}
            />
            <Button label="Создать аккаунт" loading={loading} onPress={submit} size="lg" />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Уже есть аккаунт?</Text>
            <Link href="/(auth)/login" style={styles.link}>
              Войти
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
  title: { color: palette.white, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { color: palette.textSecondary, fontSize: 15, marginTop: 6 },
  footer: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.xl },
  footerText: { color: palette.textSecondary, fontSize: 14 },
  link: { color: palette.white, fontSize: 14, fontWeight: "600" },
});
