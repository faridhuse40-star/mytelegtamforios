import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "../store/auth";
import { getSocket } from "../services/socket";
import { isChatMuted, isUserBlocked } from "../services/storage";
import { palette } from "../constants/theme";
import type { ChatMessage } from "@messenger/shared";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function NotificationPermissionBridge() {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== "authenticated") return;
    Notifications.getPermissionsAsync()
      .then((perm) => {
        if (!perm.granted) return Notifications.requestPermissionsAsync();
        return perm;
      })
      .catch(() => {});
  }, [status]);

  return null;
}

// Global handler: when an incoming call:invite arrives anywhere in the app,
// navigate to the call screen as the callee.
function IncomingCallBridge() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== "authenticated") return;
    const socket = getSocket();
    if (!socket) return;
    const onIncoming = (p: { callId: string; from: { id: string; firstName?: string; lastName?: string; username?: string }; kind: "audio" | "video" }) => {
      const fromName = `${p.from.firstName ?? ""} ${p.from.lastName ?? ""}`.trim() || `@${p.from.username ?? "user"}`;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Входящий звонок",
          body: `${fromName} · ${p.kind === "video" ? "видео" : "аудио"}`,
          sound: true,
        },
        trigger: null,
      }).catch(() => {});
      router.push({
        pathname: "/call/[id]",
        params: { id: p.callId, kind: p.kind, peerId: p.from.id, role: "callee" },
      });
    };
    socket.on("call:incoming", onIncoming);
    return () => {
      socket.off("call:incoming", onIncoming);
    };
  }, [status, router]);

  return null;
}

function MessageNotificationBridge() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?.id);
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "authenticated") return;
    const socket = getSocket();
    if (!socket) return;
    const onMessage = (msg: ChatMessage) => {
      if (msg.senderId === userId) return;
      if (isUserBlocked(msg.senderId)) return;
      if (isChatMuted(msg.chatId)) return;
      if (pathname === `/chat/${msg.chatId}`) return;
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Новое сообщение",
          body: msg.text ?? (msg.kind === "image" ? "Фото" : msg.kind === "voice" ? "Голосовое сообщение" : "Документ"),
          sound: true,
        },
        trigger: null,
      }).catch(() => {});
    };
    socket.on("message:new", onMessage);
    return () => {
      socket.off("message:new", onMessage);
    };
  }, [pathname, status, userId]);

  return null;
}

function AuthRedirectBridge() {
  const router = useRouter();
  const segments = useSegments();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    const root = segments[0];
    const protectedRoute = root === "(tabs)" || root === "chat" || root === "user" || root === "call";
    if (status === "guest" && protectedRoute) router.replace("/(auth)/login");
  }, [router, segments, status]);

  return null;
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <AuthRedirectBridge />
          <NotificationPermissionBridge />
          <MessageNotificationBridge />
          <IncomingCallBridge />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.black },
              animation: "fade",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat/[id]" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="user/[username]" options={{ presentation: "modal" }} />
            <Stack.Screen name="search" options={{ animation: "fade_from_bottom" }} />
            <Stack.Screen name="call/[id]" options={{ animation: "fade", presentation: "fullScreenModal" }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.black },
});
