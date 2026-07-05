import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { UserAPI, ChatAPI } from "../../services/api";
import { Avatar } from "../../components/ui/Avatar";
import { Surface } from "../../components/ui/Surface";
import { Icon } from "../../components/ui/Icon";
import { palette, spacing } from "../../constants/theme";
import { getSocket } from "../../services/socket";
import { blockUser, isChatMuted, isUserBlocked, muteChat } from "../../services/storage";

export default function UserProfileScreen() {
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const [blocked, setBlocked] = useState(false);
  const [profileMuted, setProfileMuted] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ["user", username],
    queryFn: () => UserAPI.byUsername(username),
    enabled: !!username,
  });

  useEffect(() => {
    if (!user) return;
    setBlocked(isUserBlocked(user.id));
  }, [user]);

  async function openChat() {
    if (!user) return;
    try {
      const res = await ChatAPI.open({ userId: user.id });
      router.replace({ pathname: "/chat/[id]", params: { id: res.chatId } });
    } catch {
      Alert.alert("Не удалось открыть чат");
    }
  }

  function startCall(kind: "audio" | "video") {
    if (!user) return;
    const socket = getSocket();
    if (!socket) {
      Alert.alert("Нет подключения", "Проверьте интернет и попробуйте снова");
      return;
    }
    socket.emit("call:invite", { toUserId: user.id, kind }, (res) => {
      if (res.ok) {
        router.replace({ pathname: "/call/[id]", params: { id: res.callId, kind, peerId: user.id, role: "caller" } });
      } else {
        Alert.alert("Не удалось начать звонок");
      }
    });
  }

  function toggleBlocked() {
    if (!user) return;
    const next = !blocked;
    blockUser(user.id, next);
    setBlocked(next);
  }

  async function toggleSound() {
    if (!user) return;
    const res = await ChatAPI.open({ userId: user.id });
    const next = !isChatMuted(res.chatId);
    muteChat(res.chatId, next);
    setProfileMuted(next);
  }

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      </View>

      {isLoading || !user ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.white} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Avatar uri={user.avatarUrl} name={`${user.firstName} ${user.lastName}`} size={128} />
          <Text style={styles.name}>
            {user.firstName} {user.lastName}
          </Text>
          {user.isOnline ? (
            <Text style={styles.presence}>онлайн</Text>
          ) : user.lastSeenAt ? (
            <Text style={styles.presence}>был(а) {new Date(user.lastSeenAt).toLocaleString()}</Text>
          ) : null}

          <View style={styles.quickActions}>
            <Pressable style={styles.quickBtn} onPress={openChat}>
              <View style={styles.quickIconBox}>
                <Icon name="chat" size={20} />
              </View>
              <Text style={styles.quickText}>написать</Text>
            </Pressable>
            <Pressable style={styles.quickBtn} onPress={() => startCall("audio")}>
              <View style={styles.quickIconBox}>
                <Icon name="phone" size={20} />
              </View>
              <Text style={styles.quickText}>звонок</Text>
            </Pressable>
            <Pressable style={styles.quickBtn} onPress={() => startCall("video")}>
              <View style={styles.quickIconBox}>
                <Icon name="video" size={20} />
              </View>
              <Text style={styles.quickText}>видео</Text>
            </Pressable>
            <Pressable style={styles.quickBtn} onPress={toggleSound}>
              <View style={styles.quickIconBox}>
                <Icon name={profileMuted ? "speakerOff" : "speaker"} size={20} />
              </View>
              <Text style={styles.quickText}>{profileMuted ? "без звука" : "звук"}</Text>
            </Pressable>
          </View>

          <Surface variant="card" rounded="xl" style={styles.infoCard}>
            <Text style={styles.cardLabel}>имя пользователя</Text>
            <Text style={styles.username}>@{user.username}</Text>
            {!!user.bio && <Text style={styles.bioText}>{user.bio}</Text>}
            <Pressable onPress={openChat} style={styles.primaryRow}>
              <Text style={styles.primaryRowText}>Написать сообщение</Text>
            </Pressable>
            <Pressable onPress={toggleBlocked} style={styles.dangerRow}>
              <Text style={styles.dangerText}>{blocked ? "Разблокировать" : "Заблокировать"}</Text>
            </Pressable>
          </Surface>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: palette.black },
  header: { padding: spacing.md, alignItems: "flex-start" },
  backBtn: {
    alignItems: "center",
    backgroundColor: palette.glassStrong,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  backText: { color: palette.white, fontSize: 32, marginTop: -3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, alignItems: "center" },
  name: { color: palette.white, fontSize: 28, fontWeight: "800", marginTop: spacing.lg },
  username: { color: palette.textSecondary, fontSize: 15, marginTop: 4 },
  presence: { color: palette.textSecondary, fontSize: 12, marginTop: 6 },
  quickActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl, width: "100%" },
  quickBtn: {
    alignItems: "center",
    backgroundColor: palette.androidCard,
    borderRadius: 18,
    flex: 1,
    paddingVertical: 12,
  },
  quickIconBox: { alignItems: "center", height: 22, justifyContent: "center" },
  quickText: { color: palette.white, fontSize: 11, fontWeight: "700", marginTop: 4 },
  infoCard: { marginTop: spacing.xl, padding: spacing.lg, width: "100%" },
  cardLabel: { color: palette.white, fontSize: 15, fontWeight: "700" },
  bioText: { color: palette.textSecondary, fontSize: 14, marginTop: spacing.md },
  primaryRow: {
    borderTopColor: palette.androidDivider,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  primaryRowText: { color: palette.white, fontSize: 18, fontWeight: "800" },
  dangerRow: {
    borderTopColor: palette.androidDivider,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  dangerText: { color: palette.destructive, fontSize: 18, fontWeight: "800" },
});
