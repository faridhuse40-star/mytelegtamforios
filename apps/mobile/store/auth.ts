import { create } from "zustand";
import type { SelfUser } from "@messenger/shared";
import { AuthAPI } from "../services/api";
import {
  clearTokens,
  loadTokens,
  loadUser,
  saveTokens,
  saveUser,
  type StoredTokens,
} from "../services/storage";
import { connectSocket, disconnectSocket } from "../services/socket";

type AuthStatus = "unknown" | "guest" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: SelfUser | null;
  tokens: StoredTokens | null;
  hydrate: () => Promise<void>;
  setAuth: (user: SelfUser, tokens: StoredTokens) => void;
  updateUser: (patch: Partial<SelfUser>) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "unknown",
  user: null,
  tokens: null,

  hydrate: async () => {
    const tokens = loadTokens();
    const cached = loadUser<SelfUser>();
    if (!tokens) {
      set({ status: "guest", user: null, tokens: null });
      return;
    }
    // Set optimistically from cache and connect the socket right away, so
    // global listeners (incoming calls, notifications) attach to a live socket.
    if (cached) {
      set({ status: "authenticated", user: cached, tokens });
      connectSocket();
    }
    try {
      const fresh = await AuthAPI.me();
      saveUser(fresh);
      set({ status: "authenticated", user: fresh, tokens });
      connectSocket();
    } catch (e: any) {
      // Log out only when the server rejected us; on a network failure keep
      // the cached session so the app still opens offline.
      const status = e?.response?.status;
      if (status === 401 || status === 403 || !cached) {
        clearTokens();
        disconnectSocket();
        set({ status: "guest", user: null, tokens: null });
      }
    }
  },

  setAuth: (user, tokens) => {
    saveTokens(tokens);
    saveUser(user);
    set({ status: "authenticated", user, tokens });
    connectSocket();
  },

  updateUser: (patch) => {
    const u = get().user;
    if (!u) return;
    const next = { ...u, ...patch } as SelfUser;
    saveUser(next);
    set({ user: next });
  },

  logout: async () => {
    const tokens = get().tokens;
    try {
      if (tokens?.refreshToken) await AuthAPI.logout(tokens.refreshToken);
    } catch {}
    clearTokens();
    disconnectSocket();
    set({ status: "guest", user: null, tokens: null });
  },
}));
