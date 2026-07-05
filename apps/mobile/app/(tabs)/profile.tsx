import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { BIO_MAX_LENGTH, USERNAME_REGEX } from "@messenger/shared";
import { useAuthStore } from "../../store/auth";
import { UserAPI, UploadAPI } from "../../services/api";
import { Surface } from "../../components/ui/Surface";
import { TextField } from "../../components/ui/TextField";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/ui/Avatar";
import { palette, spacing, isIOS } from "../../constants/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);
  const [editing, setEditing] = useState(false);
  const [firstName, setFirst] = useState(user?.firstName ?? "");
  const [lastName, setLast] = useState(user?.lastName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "free" | "taken" | "invalid">("idle");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Live availability check while editing the username.
  useEffect(() => {
    if (!editing) return;
    const clean = username.trim().toLowerCase().replace(/^@/, "");
    if (clean === user?.username) {
      setUsernameStatus("idle");
      return;
    }
    if (!USERNAME_REGEX.test(clean)) {
      setUsernameStatus(clean.length === 0 ? "idle" : "invalid");
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
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [editing, username, user?.username]);

  if (!user) return null;

  function startEditing() {
    // Re-seed from the current profile so a previous cancelled edit doesn't leak in.
    setFirst(user!.firstName);
    setLast(user!.lastName);
    setUsername(user!.username);
    setBio(user!.bio ?? "");
    setUsernameStatus("idle");
    setEditing(true);
  }

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Нет доступа к фото", "Разрешите доступ к галерее в настройках");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets[0]) return;
    setUploadingAvatar(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      // Upload to the API so the avatar is visible from every device.
      const attachment = await UploadAPI.file({
        uri: manipulated.uri,
        name: `avatar-${Date.now()}.jpg`,
        mimeType: "image/jpeg",
      });
      const fresh = await UserAPI.updateMe({ avatarUrl: attachment.url });
      updateUser(fresh);
    } catch {
      Alert.alert("Не удалось обновить аватар");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function save() {
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");
    if (!firstName.trim()) {
      Alert.alert("Укажите имя");
      return;
    }
    if (cleanUsername !== user!.username && !USERNAME_REGEX.test(cleanUsername)) {
      Alert.alert("Некорректный @username", "Латиница, цифры, _ — от 4 до 32 символов");
      return;
    }
    if (usernameStatus === "taken") {
      Alert.alert("Этот @username уже занят");
      return;
    }
    setSaving(true);
    try {
      const fresh = await UserAPI.updateMe({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(cleanUsername !== user!.username ? { username: cleanUsername } : {}),
        bio: bio.trim().slice(0, BIO_MAX_LENGTH) || null,
      });
      updateUser(fresh);
      setEditing(false);
    } catch (e: any) {
      if (e?.response?.data?.error === "username_taken") Alert.alert("Этот @username уже занят");
      else Alert.alert("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  const usernameHint =
    usernameStatus === "checking"
      ? "Проверяем…"
      : usernameStatus === "free"
        ? "Свободен"
        : usernameStatus === "invalid"
          ? "Латиница, цифры, _ — от 4 символов"
          : undefined;

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Профиль</Text>
          <Pressable onPress={() => (editing ? setEditing(false) : startEditing())} hitSlop={12}>
            <Text style={styles.headerAction}>{editing ? "Отмена" : "Редактировать"}</Text>
          </Pressable>
        </View>

        <Surface variant="card" rounded="xxl" style={styles.card}>
          <Pressable onPress={pickAvatar} disabled={uploadingAvatar} style={{ alignItems: "center" }}>
            <View>
              <Avatar uri={user.avatarUrl} name={`${user.firstName} ${user.lastName}`} size={96} />
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={palette.white} />
                </View>
              )}
            </View>
            <Text style={styles.changeAvatar}>{editing || uploadingAvatar ? "Сменить фото" : "@" + user.username}</Text>
            {!user.emailVerified && <Text style={styles.verifyBadge}>Email не подтверждён</Text>}
          </Pressable>

          {editing ? (
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <TextField label="Имя" value={firstName} onChangeText={setFirst} />
              <TextField label="Фамилия" value={lastName} onChangeText={setLast} />
              <TextField
                label="@username"
                value={username}
                onChangeText={(t) => setUsername(t.replace(/^@/, ""))}
                autoCapitalize="none"
                autoCorrect={false}
                hint={usernameHint}
                error={usernameStatus === "taken" ? "Этот @username уже занят" : null}
              />
              <TextField
                label="Статус / bio"
                value={bio}
                onChangeText={(t) => setBio(t.slice(0, BIO_MAX_LENGTH))}
                hint={`${bio.length}/${BIO_MAX_LENGTH}`}
                multiline
              />
              <Button label="Сохранить" loading={saving} onPress={save} />
            </View>
          ) : (
            <View style={{ marginTop: spacing.lg, alignItems: "center" }}>
              <Text style={styles.name}>
                {user.firstName} {user.lastName}
              </Text>
              {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}
              <Text style={styles.email}>{user.email}</Text>
              <View style={styles.starsRow}>
                <Text style={styles.starsValue}>★ {user.starsBalance}</Text>
                <Text style={styles.starsLabel}>звёзд на балансе</Text>
              </View>
            </View>
          )}
        </Surface>

        <Surface variant="card" rounded="xxl" style={[styles.card, { marginTop: spacing.md, padding: 0 }]}>
          <Pressable
            onPress={() =>
              Alert.alert("Выйти из аккаунта?", "", [
                { text: "Отмена", style: "cancel" },
                {
                  text: "Выйти",
                  style: "destructive",
                  onPress: () => {
                    void logout().finally(() => router.replace("/(auth)/login"));
                  },
                },
              ])
            }
            style={styles.menuItem}
          >
            <Text style={[styles.menuLabel, { color: palette.white }]}>Выйти</Text>
          </Pressable>
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: palette.black },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  title: { color: palette.white, fontSize: isIOS ? 28 : 22, fontWeight: "700", letterSpacing: -0.5 },
  headerAction: { color: palette.white, fontSize: 15, fontWeight: "500" },
  card: { padding: spacing.lg },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 48,
    justifyContent: "center",
  },
  changeAvatar: { color: palette.textSecondary, fontSize: 14, marginTop: spacing.md },
  verifyBadge: {
    borderColor: palette.glassBorder,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    color: palette.textSecondary,
    fontSize: 12,
    marginTop: spacing.sm,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  name: { color: palette.white, fontSize: 22, fontWeight: "700" },
  bio: { color: palette.textSecondary, fontSize: 14, marginTop: 6, textAlign: "center" },
  email: { color: palette.textMuted, fontSize: 13, marginTop: 8 },
  starsRow: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: spacing.md },
  starsValue: { color: palette.white, fontSize: 15, fontWeight: "700" },
  starsLabel: { color: palette.textSecondary, fontSize: 13 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
  },
  menuLabel: { color: palette.textPrimary, fontSize: 16 },
});
