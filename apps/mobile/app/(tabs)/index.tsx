import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatPreview, ChatMessage } from "@messenger/shared";
import { ChatAPI } from "../../services/api";
import { Surface } from "../../components/ui/Surface";
import { Avatar } from "../../components/ui/Avatar";
import { UnreadBadge } from "../../components/ui/misc";
import { palette, spacing, typography, isIOS } from "../../constants/theme";
import { getSocket } from "../../services/socket";
import { useAuthStore } from "../../store/auth";
import { isChatHidden } from "../../services/storage";

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  if (same) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

function previewText(m: ChatMessage | null): string {
  if (!m) return "Нет сообщений";
  if (m.deletedAt) return "Сообщение удалено";
  if (m.kind === "image") return "🖼 Фото";
  if (m.kind === "file") return "📎 Файл";
  if (m.kind === "voice") return "🎙 Голосовое сообщение";
  return m.text ?? "";
}

export default function ChatsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [typingChats, setTypingChats] = useState<Record<string, boolean>>({});
  const { data, refetch, isRefetching } = useQuery({
    queryKey: ["chats"],
    queryFn: ChatAPI.list,
  });

  // Refresh the list on any new/updated message event.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => qc.invalidateQueries({ queryKey: ["chats"] });
    const onTyping = (p: { chatId: string; userId: string; typing: boolean }) => {
      setTypingChats((prev) => ({ ...prev, [p.chatId]: p.typing }));
    };
    socket.on("message:new", refresh);
    socket.on("message:updated", refresh);
    socket.on("message:deleted", refresh);
    socket.on("presence:update", refresh);
    socket.on("chat:typing", onTyping);
    return () => {
      socket.off("message:new", refresh);
      socket.off("message:updated", refresh);
      socket.off("message:deleted", refresh);
      socket.off("presence:update", refresh);
      socket.off("chat:typing", onTyping);
    };
  }, [qc]);

  const chats = (data ?? []).filter((chat) => !isChatHidden(chat.id));

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Сообщения</Text>
        </View>
        <Pressable onPress={() => router.push("/(tabs)/profile")} hitSlop={10} style={({ pressed }) => pressed && styles.pressed}>
          <Avatar uri={user?.avatarUrl ?? null} name={user ? `${user.firstName} ${user.lastName}` : "Профиль"} size={40} />
        </Pressable>
      </View>

      {chats.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Пока нет чатов</Text>
          <Text style={styles.emptySub}>Найдите человека по @username и напишите первым</Text>
          <Pressable onPress={() => router.push("/(tabs)/search-tab")} style={styles.cta}>
            <Text style={styles.ctaText}>Начать переписку</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={chats}
          keyExtractor={(item) => item.id}
          extraData={typingChats}
          estimatedItemSize={76}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 120, paddingTop: spacing.sm }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={palette.white} />
          }
          renderItem={({ item }: { item: ChatPreview }) => (
            <Pressable onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })} style={({ pressed }) => [styles.pressableRow, pressed && styles.pressed]}>
              <Surface variant="card" rounded="xl" style={styles.row}>
                <Avatar
                  uri={item.peer.avatarUrl}
                  name={`${item.peer.firstName} ${item.peer.lastName}`}
                  size={48}
                  showOnline
                  online={item.peer.isOnline}
                />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {`${item.peer.firstName} ${item.peer.lastName}`.trim() || `@${item.peer.username}`}
                    </Text>
                    <Text style={styles.rowTime}>{formatTime(item.lastMessage?.createdAt)}</Text>
                  </View>
                  <View style={styles.rowBottom}>
                    {typingChats[item.id] ? (
                      <Text style={[styles.rowPreview, styles.rowTyping]} numberOfLines={1}>
                        печатает…
                      </Text>
                    ) : (
                      <Text style={styles.rowPreview} numberOfLines={1}>
                        {(item.lastMessage && item.lastMessage.senderId === user?.id ? "Вы: " : "") +
                          previewText(item.lastMessage)}
                      </Text>
                    )}
                    <UnreadBadge count={item.unreadCount} />
                  </View>
                </View>
              </Surface>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: palette.black },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: palette.white,
    fontSize: isIOS ? 28 : 22,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
  pressed: { opacity: 0.78 },
  pressableRow: { borderRadius: 20 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { color: palette.white, fontSize: 18, fontWeight: "600" },
  emptySub: { color: palette.textSecondary, fontSize: 14, marginTop: 6, textAlign: "center" },
  cta: {
    marginTop: spacing.xl,
    backgroundColor: palette.white,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  ctaText: { color: palette.black, fontWeight: "700", fontSize: 15 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowName: {
    color: palette.textPrimary,
    fontSize: typography.titleSize,
    fontWeight: typography.titleWeight,
    letterSpacing: typography.titleLetterSpacing,
    flex: 1,
    marginRight: 8,
  },
  rowTime: { color: palette.textSecondary, fontSize: 12 },
  rowBottom: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8 },
  rowPreview: { color: palette.textSecondary, fontSize: typography.bodySize, flex: 1 },
  rowTyping: { color: palette.white, fontStyle: "italic" },
});
