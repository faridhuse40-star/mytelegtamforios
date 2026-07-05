import { MMKV } from "react-native-mmkv";

// Encrypted storage for auth tokens and small user cache.
export const secureStorage = new MMKV({
  id: "messenger-secure",
  encryptionKey: "messenger-local-encryption-key",
});

export const recentStorage = new MMKV({ id: "messenger-recent" });

const KEY_ACCESS = "auth.access";
const KEY_REFRESH = "auth.refresh";
const KEY_USER = "auth.user";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export function saveTokens(t: StoredTokens) {
  secureStorage.set(KEY_ACCESS, t.accessToken);
  secureStorage.set(KEY_REFRESH, t.refreshToken);
  secureStorage.set(`${KEY_ACCESS}.exp`, t.accessExpiresAt);
  secureStorage.set(`${KEY_REFRESH}.exp`, t.refreshExpiresAt);
}

export function loadTokens(): StoredTokens | null {
  const a = secureStorage.getString(KEY_ACCESS);
  const r = secureStorage.getString(KEY_REFRESH);
  const ae = secureStorage.getString(`${KEY_ACCESS}.exp`);
  const re = secureStorage.getString(`${KEY_REFRESH}.exp`);
  if (!a || !r || !ae || !re) return null;
  return { accessToken: a, refreshToken: r, accessExpiresAt: ae, refreshExpiresAt: re };
}

export function clearTokens() {
  secureStorage.delete(KEY_ACCESS);
  secureStorage.delete(KEY_REFRESH);
  secureStorage.delete(`${KEY_ACCESS}.exp`);
  secureStorage.delete(`${KEY_REFRESH}.exp`);
  secureStorage.delete(KEY_USER);
}

export function saveUser<T>(user: T) {
  secureStorage.set(KEY_USER, JSON.stringify(user));
}

export function loadUser<T>(): T | null {
  const raw = secureStorage.getString(KEY_USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Recent searches (local only, no backend round-trip).
// Stored in MMKV under "recent_searches"; max 10 entries, most recent first.
const KEY_RECENT_SEARCH = "recent_searches";
const MAX_RECENT_SEARCHES = 10;
const MIN_QUERY_LENGTH = 2;
const KEY_MUTED_CHATS = "muted_chats";
const KEY_HIDDEN_CHATS = "hidden_chats";
const KEY_BLOCKED_USERS = "blocked_users";

function loadStringSet(key: string): Set<string> {
  const raw = recentStorage.getString(key);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveStringSet(key: string, values: Set<string>) {
  recentStorage.set(key, JSON.stringify([...values]));
}

export function isChatMuted(chatId: string) {
  return loadStringSet(KEY_MUTED_CHATS).has(chatId);
}

export function muteChat(chatId: string, muted: boolean) {
  const values = loadStringSet(KEY_MUTED_CHATS);
  if (muted) values.add(chatId);
  else values.delete(chatId);
  saveStringSet(KEY_MUTED_CHATS, values);
}

export function isChatHidden(chatId: string) {
  return loadStringSet(KEY_HIDDEN_CHATS).has(chatId);
}

export function hideChatForSelf(chatId: string) {
  const values = loadStringSet(KEY_HIDDEN_CHATS);
  values.add(chatId);
  saveStringSet(KEY_HIDDEN_CHATS, values);
}

export function isUserBlocked(userId: string) {
  return loadStringSet(KEY_BLOCKED_USERS).has(userId);
}

export function blockUser(userId: string, blocked: boolean) {
  const values = loadStringSet(KEY_BLOCKED_USERS);
  if (blocked) values.add(userId);
  else values.delete(userId);
  saveStringSet(KEY_BLOCKED_USERS, values);
}

/**
 * Persist a search query for later suggestion. Queries whose trimmed length is
 * less than MIN_QUERY_LENGTH are ignored. Duplicates of the trimmed value are
 * removed before the query is inserted at the head; the list is capped at
 * MAX_RECENT_SEARCHES entries.
 */
export function addRecentSearch(q: string) {
  const cleaned = q.trim();
  if (cleaned.length < MIN_QUERY_LENGTH) return;
  const current = loadRecentSearches();
  const next = [cleaned, ...current.filter((s) => s !== cleaned)].slice(0, MAX_RECENT_SEARCHES);
  recentStorage.set(KEY_RECENT_SEARCH, JSON.stringify(next));
}

/**
 * Returns stored recent searches in most-recent-first order.
 * Returns an empty array when nothing is stored or the stored payload is invalid.
 */
export function loadRecentSearches(): string[] {
  const raw = recentStorage.getString(KEY_RECENT_SEARCH);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Remove a single entry from recent searches. */
export function removeRecentSearch(q: string) {
  const next = loadRecentSearches().filter((s) => s !== q);
  if (next.length === 0) recentStorage.delete(KEY_RECENT_SEARCH);
  else recentStorage.set(KEY_RECENT_SEARCH, JSON.stringify(next));
}

/** Remove all persisted recent searches. */
export function clearRecentSearches() {
  recentStorage.delete(KEY_RECENT_SEARCH);
}
