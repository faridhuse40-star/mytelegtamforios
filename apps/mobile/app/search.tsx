import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import type { PublicUser } from "@messenger/shared";
import { UserAPI, ChatAPI } from "../services/api";
import { Avatar } from "../components/ui/Avatar";
import { Surface } from "../components/ui/Surface";
import { addRecentSearch, loadRecentSearches, clearRecentSearches } from "../services/storage";
import { palette, spacing, radius, isIOS } from "../constants/theme";
import { SEARCH_DEBOUNCE_MS } from "../constants/config";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function SearchScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, SEARCH_DEBOUNCE_MS);
  const [recent, setRecent] = useState<string[]>(() => loadRecentSearches());

  const { data, isFetching } = useQuery({
    queryKey: ["search", dq],
    queryFn: () => UserAPI.search(dq),
    enabled: dq.trim().length > 0,
  });

  const results = useMemo(() => data ?? [], [data]);

  function rememberSearch(username: string) {
    addRecentSearch(username);
    setRecent(loadRecentSearches());
  }

  async function openChatWith(user: PublicUser) {
    rememberSearch(user.username);
    const res = await ChatAPI.open({ userId: user.id });
    router.replace({ pathname: "/chat/[id]", params: { id: res.chatId } });
  }

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.cancel}>Отмена</Text>
        </Pressable>
        <View style={styles.input}>
          <Text style={styles.at}>@</Text>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Поиск по @username или имени"
            placeholderTextColor={palette.inputPlaceholder}
            selectionColor={palette.white}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.textInput}
          />
        </View>
      </View>

      {dq.trim().length === 0 ? (
        <View style={{ padding: spacing.lg, flex: 1 }}>
          {recent.length > 0 && (
            <>
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>Недавние</Text>
                <Pressable
                  onPress={() => {
                    clearRecentSearches();
                    setRecent([]);
                  }}
                  hitSlop={10}
                >
                  <Text style={styles.clear}>Очистить</Text>
                </Pressable>
              </View>
              {recent.map((r) => (
                <Pressable key={r} onPress={() => setQ(r)} style={styles.recentItem}>
                  <Text style={styles.recentText}>@{r}</Text>
                </Pressable>
              ))}
            </>
          )}
        </View>
      ) : results.length === 0 && !isFetching ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Пользователь не найден</Text>
        </View>
      ) : (
        <FlashList
          data={results}
          keyExtractor={(u) => u.id}
          estimatedItemSize={70}
          contentContainerStyle={{ padding: spacing.md }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }: { item: PublicUser }) => (
            <Pressable
              onPress={() => {
                rememberSearch(item.username);
                router.push({ pathname: "/user/[username]", params: { username: item.username } });
              }}
            >
              <Surface variant="card" rounded="xl" style={styles.row}>
                <Avatar uri={item.avatarUrl} name={`${item.firstName} ${item.lastName}`} size={44} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.name}>@{item.username}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {item.firstName} {item.lastName}
                  </Text>
                </View>
                <Pressable onPress={() => void openChatWith(item)} style={styles.writeBtn} hitSlop={8}>
                  <Text style={styles.writeBtnText}>Написать</Text>
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
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.sm },
  cancel: { color: palette.white, fontSize: 15 },
  input: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: isIOS ? palette.glass : palette.androidSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassBorder,
  },
  at: { color: palette.textSecondary, fontSize: 16, marginRight: 6 },
  textInput: { flex: 1, color: palette.white, fontSize: 16 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: palette.textSecondary, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  name: { color: palette.white, fontSize: 15, fontWeight: "600" },
  sub: { color: palette.textSecondary, fontSize: 13, marginTop: 2 },
  writeBtn: {
    backgroundColor: palette.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  writeBtnText: { color: palette.black, fontWeight: "600", fontSize: 13 },
  recentHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  recentTitle: { color: palette.textSecondary, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 },
  clear: { color: palette.textSecondary, fontSize: 13 },
  recentItem: { paddingVertical: 10 },
  recentText: { color: palette.white, fontSize: 16 },
});
