import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import type { CallKind, CallRecord } from "@messenger/shared";
import { CallAPI } from "../../services/api";
import { Surface } from "../../components/ui/Surface";
import { Avatar } from "../../components/ui/Avatar";
import { Icon } from "../../components/ui/Icon";
import { getSocket } from "../../services/socket";
import { palette, spacing, typography, isIOS } from "../../constants/theme";

function formatDuration(s: number): string {
  if (s <= 0) return "—";
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function statusLabel(item: CallRecord): string {
  if (item.status === "missed") return "пропущен";
  if (item.status === "declined") return "отклонён";
  return formatDuration(item.durationSec);
}

export default function CallsScreen() {
  const router = useRouter();
  const { data, refetch, isRefetching } = useQuery({ queryKey: ["calls"], queryFn: CallAPI.history });
  const [callingId, setCallingId] = useState<string | null>(null);
  const calls = data ?? [];

  function callBack(item: CallRecord, kind: CallKind) {
    const socket = getSocket();
    if (!socket) {
      Alert.alert("Нет подключения", "Проверьте интернет и попробуйте снова");
      return;
    }
    if (callingId) return;
    setCallingId(item.id);
    socket.emit("call:invite", { toUserId: item.peer.id, kind }, (res) => {
      setCallingId(null);
      if (res.ok) {
        router.push({ pathname: "/call/[id]", params: { id: res.callId, kind, peerId: item.peer.id, role: "caller" } });
      } else {
        Alert.alert("Не удалось начать звонок");
      }
    });
  }

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Звонки</Text>
      </View>

      {calls.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>История звонков пуста</Text>
          <Text style={styles.emptySub}>Откройте чат и позвоните собеседнику</Text>
        </View>
      ) : (
        <FlashList
          data={calls}
          keyExtractor={(c) => c.id}
          estimatedItemSize={72}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 120, paddingTop: spacing.sm }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={palette.white} />
          }
          renderItem={({ item }: { item: CallRecord }) => (
            <Pressable
              onPress={() => router.push({ pathname: "/user/[username]", params: { username: item.peer.username } })}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Surface variant="card" rounded="xl" style={styles.row}>
                <Avatar uri={item.peer.avatarUrl} name={`${item.peer.firstName} ${item.peer.lastName}`} size={44} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {`${item.peer.firstName} ${item.peer.lastName}`.trim() || `@${item.peer.username}`}
                  </Text>
                  <Text style={[styles.meta, item.status === "missed" && styles.metaMissed]} numberOfLines={1}>
                    {item.direction === "outgoing" ? "↗" : "↙"} {item.kind === "video" ? "Видео" : "Аудио"} · {statusLabel(item)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => callBack(item, item.kind)}
                  disabled={callingId !== null}
                  style={({ pressed }) => [styles.callBtn, (pressed || callingId === item.id) && styles.pressed]}
                  hitSlop={10}
                >
                  <Icon name={item.kind === "video" ? "video" : "phone"} size={18} color={palette.black} strokeWidth={2} />
                </Pressable>
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
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: {
    color: palette.white,
    fontSize: isIOS ? 28 : 22,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { color: palette.white, fontSize: 18, fontWeight: "600" },
  emptySub: { color: palette.textSecondary, fontSize: 14, marginTop: 6 },
  pressed: { opacity: 0.75 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  name: {
    color: palette.textPrimary,
    fontSize: typography.titleSize,
    fontWeight: typography.titleWeight,
  },
  meta: { color: palette.textSecondary, fontSize: 13, marginTop: 2 },
  metaMissed: { color: palette.white },
  callBtn: {
    alignItems: "center",
    backgroundColor: palette.white,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
});
