import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import type { PublicUser } from "@messenger/shared";
import { UserAPI, ChatAPI } from "../../services/api";
import { Avatar } from "../../components/ui/Avatar";
import { Surface } from "../../components/ui/Surface";
import { addRecentSearch, loadRecentSearches, clearRecentSearches, removeRecentSearch } from "../../services/storage";
import { palette, spacing, radius, isIOS } from "../../constants/theme";
import { SEARCH_DEBOUNCE_MS } from "../../constants/config";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function SearchTabScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, SEARCH_DEBOUNCE_MS);
  const [recent, setRecent] = useState<string[]>(() => loadRecentSearches());
  const [focused, setFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;

  const { data, isFetching } = useQuery({
    queryKey: ["search", dq],
    queryFn: () => UserAPI.search(dq),
    enabled: dq.trim().length > 0,
  });

  const results = useMemo(() => data ?? [], [data]);

  // Persist history only when the user actually opens a result — storing every
  // debounced keystroke ("al", "ale", "alex") pollutes the list.
  function rememberSearch(username: string) {
    addRecentSearch(username);
    setRecent(loadRecentSearches());
  }

  useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: focused || q.length > 0 ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [focused, focusAnim, q.length]);

  async function openChatWith(user: PublicUser) {
    rememberSearch(user.username);
    const res = await ChatAPI.open({ userId: user.id });
    router.push({ pathname: "/chat/[id]", params: { id: res.chatId } });
  }

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Поиск</Text>
      </View>
      <Animated.View
        style={[
          styles.inputWrap,
          {
            transform: [
              {
                scale: focusAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.02],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="@username"
          placeholderTextColor={palette.inputPlaceholder}
          selectionColor={palette.white}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.textInput}
        />
      </Animated.View>

      {dq.trim().length === 0 ? (
        <View style={styles.section}>
          <View style={styles.recentHeader}>
            <Text style={styles.sectionTitle}>Недавние</Text>
            {recent.length > 0 && (
              <Pressable
                onPress={() => {
                  clearRecentSearches();
                  setRecent([]);
                }}
                hitSlop={10}
              >
                <Text style={styles.clear}>Очистить</Text>
              </Pressable>
            )}
          </View>
          {recent.length === 0 ? (
            <Text style={styles.emptyText}>Начните поиск по @username</Text>
          ) : (
            recent.map((r) => (
              <Pressable key={r} onPress={() => setQ(r)} style={styles.recentItem}>
                <Avatar uri={null} name={r} size={42} />
                <Text style={styles.recentText}>@{r}</Text>
                <Pressable
                  onPress={() => {
                    removeRecentSearch(r);
                    setRecent(loadRecentSearches());
                  }}
                  hitSlop={10}
                >
                  <Text style={styles.remove}>×</Text>
                </Pressable>
              </Pressable>
            ))
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
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }: { item: PublicUser }) => (
            <Pressable
              onPress={() => {
                rememberSearch(item.username);
                router.push({ pathname: "/user/[username]", params: { username: item.username } });
              }}
            >
              <Surface variant="card" rounded="xl" style={styles.row}>
                <Avatar uri={item.avatarUrl} name={`${item.firstName} ${item.lastName}`} size={44} showOnline online={item.isOnline} />
                <View style={styles.userText}>
                  <Text style={styles.name} numberOfLines={1}>{item.firstName} {item.lastName}</Text>
                  <Text style={styles.sub} numberOfLines={1}>@{item.username}</Text>
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
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { color: palette.white, fontSize: isIOS ? 28 : 22, fontWeight: "700", letterSpacing: -0.5 },
  inputWrap: {
    alignItems: "center",
    backgroundColor: isIOS ? palette.glass : palette.androidSurface,
    borderColor: palette.glassBorder,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: 46,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.md,
  },
  searchGlyph: { color: palette.textSecondary, fontSize: 21, marginRight: 8 },
  textInput: { color: palette.white, flex: 1, fontSize: 16 },
  section: { padding: spacing.md },
  sectionTitle: { color: palette.textSecondary, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  recentHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  clear: { color: palette.textSecondary, fontSize: 13 },
  recentItem: {
    alignItems: "center",
    borderBottomColor: palette.androidDivider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    paddingVertical: 10,
  },
  recentText: { color: palette.white, flex: 1, fontSize: 16, fontWeight: "600", marginLeft: spacing.md },
  remove: { color: palette.textSecondary, fontSize: 24, paddingHorizontal: spacing.sm },
  empty: { alignItems: "center", flex: 1, justifyContent: "center" },
  emptyText: { color: palette.textSecondary, fontSize: 15 },
  row: { alignItems: "center", flexDirection: "row", padding: spacing.md },
  userText: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  name: { color: palette.white, fontSize: 15, fontWeight: "700" },
  sub: { color: palette.textSecondary, fontSize: 13, marginTop: 2 },
  writeBtn: {
    backgroundColor: palette.white,
    borderRadius: 13,
    minWidth: 86,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  writeBtnText: { color: palette.black, fontSize: 13, fontWeight: "700", textAlign: "center" },
});
