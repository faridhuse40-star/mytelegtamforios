import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { API_URL } from "../constants/config";
import { loadTokens, saveTokens, clearTokens, type StoredTokens } from "./storage";
import type {
  AuthResponse,
  ChatMessage,
  ChatPreview,
  MessageAttachment,
  PublicUser,
  SelfUser,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  VerifyEmailRequest,
  CallRecord,
  GiftCatalogItem,
  GiftInstance,
  SendGiftRequest,
  SendGiftResponse,
} from "@messenger/shared";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// --- Auth interceptor: attaches access token and transparently refreshes on 401. ---

let refreshPromise: Promise<StoredTokens | null> | null = null;

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const tokens = loadTokens();
  if (tokens?.accessToken && !config.headers?.["X-Skip-Auth"]) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (!original || error.response?.status !== 401 || original._retry) throw error;

    const tokens = loadTokens();
    if (!tokens?.refreshToken) {
      clearTokens();
      throw error;
    }

    try {
      if (!refreshPromise) {
        refreshPromise = axios
          .post<{ tokens: StoredTokens }>(`${API_URL}/auth/refresh`, { refreshToken: tokens.refreshToken })
          .then((res) => {
            saveTokens(res.data.tokens);
            return res.data.tokens;
          })
          .catch((err: AxiosError) => {
            // Only drop the session when the server explicitly rejected the
            // refresh token. A network failure must not log the user out.
            if (err.response) clearTokens();
            return null;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }
      const fresh = await refreshPromise;
      if (!fresh) throw error;
      original._retry = true;
      original.headers = original.headers ?? {};
      (original.headers as any).Authorization = `Bearer ${fresh.accessToken}`;
      return api(original);
    } catch {
      throw error;
    }
  },
);

// --- Typed endpoints ---

export const AuthAPI = {
  register: (body: RegisterRequest) =>
    api.post<RegisterResponse>("/auth/register", body, { headers: { "X-Skip-Auth": "1" } }).then((r) => r.data),
  verifyEmail: (body: VerifyEmailRequest) =>
    api.post<AuthResponse>("/auth/verify-email", body, { headers: { "X-Skip-Auth": "1" } }).then((r) => r.data),
  resendVerification: (email: string) =>
    api.post<{ ok: true }>("/auth/resend-verification", { email }, { headers: { "X-Skip-Auth": "1" } }).then((r) => r.data),
  login: (body: LoginRequest) =>
    api.post<AuthResponse>("/auth/login", body, { headers: { "X-Skip-Auth": "1" } }).then((r) => r.data),
  me: () => api.get<{ user: SelfUser }>("/auth/me").then((r) => r.data.user),
  logout: (refreshToken: string) => api.post("/auth/logout", { refreshToken }).then((r) => r.data),
};

export const UserAPI = {
  byUsername: (username: string) =>
    api.get<{ user: PublicUser }>(`/users/${encodeURIComponent(username)}`).then((r) => r.data.user),
  byId: (id: string) =>
    api.get<{ user: PublicUser }>(`/users/by-id/${encodeURIComponent(id)}`).then((r) => r.data.user),
  updateMe: (patch: Partial<Pick<SelfUser, "firstName" | "lastName" | "username" | "bio" | "avatarUrl">>) =>
    api.patch<{ user: SelfUser }>("/users/me", patch).then((r) => r.data.user),
  checkUsername: (username: string) =>
    api.get<{ available: boolean; reason?: string }>("/users/check-username", { params: { username } }).then((r) => r.data),
  search: (q: string) =>
    api.get<{ results: PublicUser[] }>("/users/search", { params: { q } }).then((r) => r.data.results),
};

export const ChatAPI = {
  list: () => api.get<{ chats: ChatPreview[] }>("/chats").then((r) => r.data.chats),
  open: (params: { username?: string; userId?: string }) =>
    api.post<{ chatId: string; peer: PublicUser }>("/chats/open", params).then((r) => r.data),
  messages: (chatId: string, params?: { cursor?: string; search?: string }) =>
    api
      .get<{ messages: ChatMessage[]; nextCursor: string | null; peer: PublicUser | null }>(
        `/chats/${chatId}/messages`,
        { params },
      )
      .then((r) => r.data),
  markRead: (chatId: string, upToMessageId: string) =>
    api.post(`/chats/${chatId}/read`, { upToMessageId }).then((r) => r.data),
  pin: (chatId: string, pinned: boolean) => api.post(`/chats/${chatId}/pin`, { pinned }).then((r) => r.data),
  delete: (chatId: string) => api.delete(`/chats/${chatId}`).then((r) => r.data),
};

export const UploadAPI = {
  file: (file: { uri: string; name: string; mimeType: string }) => {
    const form = new FormData();
    form.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as any);
    return api
      .post<{ attachment: MessageAttachment }>("/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60_000,
      })
      .then((r) => r.data.attachment);
  },
};

export const CallAPI = {
  iceConfig: () =>
    api
      .get<{ iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> }>(
        "/calls/ice-config",
        { headers: { "X-Skip-Auth": "1" } },
      )
      .then((r) => r.data.iceServers),
  history: () => api.get<{ calls: CallRecord[] }>("/calls").then((r) => r.data.calls),
};

export const GiftAPI = {
  catalog: () => api.get<{ gifts: GiftCatalogItem[] }>("/gifts/catalog").then((r) => r.data.gifts),
  myBalance: () => api.get<{ balance: number }>("/gifts/my-balance").then((r) => r.data.balance),
  forUser: (username: string) =>
    api
      .get<{ gifts: GiftInstance[] }>(`/users/${encodeURIComponent(username)}/gifts`)
      .then((r) => r.data.gifts),
  send: (body: SendGiftRequest) =>
    api.post<SendGiftResponse>("/gifts/send", body).then((r) => r.data),
  setHidden: (id: string, hidden: boolean) =>
    api
      .post<{ instance: GiftInstance }>(`/gifts/instances/${id}/hide`, { hidden })
      .then((r) => r.data.instance),
  convert: (id: string) =>
    api
      .post<{ newBalance: number; refunded: number }>(`/gifts/instances/${id}/convert`)
      .then((r) => r.data),
};
