import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiUrl?: string;
  socketUrl?: string;
};

// In Expo Go on a physical device localhost won't resolve to the host's machine.
// Override via EXPO_PUBLIC_API_URL / EXPO_PUBLIC_SOCKET_URL env vars for device testing.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? "https://messenger-api-far.fly.dev";
export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ?? extra.socketUrl ?? "https://messenger-api-far.fly.dev";

export const SEARCH_DEBOUNCE_MS = 300;
export const TYPING_BROADCAST_MS = 1500;
export const MESSAGE_PAGE_SIZE = 40;
