import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Audio } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CallKind, ChatMessage, MessageAttachment, MessageKind, PublicUser } from "@messenger/shared";
import { ChatAPI, UploadAPI } from "../../services/api";
import { Avatar } from "../../components/ui/Avatar";
import { Surface } from "../../components/ui/Surface";
import { Icon } from "../../components/ui/Icon";
import { TypingDots } from "../../components/ui/misc";
import { palette, spacing, radius, isIOS } from "../../constants/theme";
import { TYPING_BROADCAST_MS } from "../../constants/config";
import { getSocket } from "../../services/socket";
import { useAuthStore } from "../../store/auth";
import { blockUser, hideChatForSelf, isChatMuted, isUserBlocked, muteChat } from "../../services/storage";

// Platform-optimised recording options: explicit AAC on Android for consistent
// format and MIME type; HIGH_QUALITY preset on iOS (produces .m4a / AAC).
const VOICE_RECORDING_OPTIONS: Audio.RecordingOptions = Platform.OS === "android"
  ? {
      android: {
        extension: ".aac",
        outputFormat: Audio.AndroidOutputFormat.AAC_ADTS,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      ios: Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
      web: {},
    }
  : Audio.RecordingOptionsPresets.HIGH_QUALITY;

// Simple client-side nonce for optimistic message IDs.
function nonce() {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fmtMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Pulsing dot shown while a voice message is being recorded.
function RecordingPulse() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.25, { duration: 550 }), withTiming(1, { duration: 550 })),
      -1,
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.pulseDot, style]} />;
}

// Outgoing bubbles: white surface on Android (black text), translucent glass on
// iOS (white text). All meta colors derive from that.
const outText = isIOS ? palette.white : palette.black;
const outMeta = isIOS ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";
const outMetaStrong = isIOS ? palette.white : palette.black;

function statusGlyph(status: ChatMessage["status"]) {
  return status === "sent" ? "✓" : "✓✓";
}

export default function ChatDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const selfId = useAuthStore((s) => s.user?.id);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peer, setPeer] = useState<PublicUser | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [callingKind, setCallingKind] = useState<CallKind | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordMs, setRecordMs] = useState(0);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [searching, setSearching] = useState(false);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  // Playback state of the currently loaded voice message.
  const [voiceState, setVoiceState] = useState<{ id: string; playing: boolean; positionMs: number; durationMs: number } | null>(null);
  // Fullscreen photo viewer.
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(56);
  const typingTimeoutRef = useRef<any>(null);
  const peerTypingTimeoutRef = useRef<any>(null);
  const lastTypingSentRef = useRef(0);
  const voiceSoundRef = useRef<Audio.Sound | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const chatId = id as string;

  // Initial load.
  const { isLoading } = useQuery({
    queryKey: ["chat", chatId],
    queryFn: async () => {
      const res = await ChatAPI.messages(chatId);
      setMessages(res.messages);
      setPeer(res.peer);
      setNextCursor(res.nextCursor);
      const lastPeerMessage = [...res.messages].reverse().find((m) => m.senderId !== selfId);
      if (lastPeerMessage) getSocket()?.emit("chat:read", { chatId, upToMessageId: lastPeerMessage.id });
      return res;
    },
    enabled: !!chatId,
  });

  useEffect(() => {
    setMuted(isChatMuted(chatId));
  }, [chatId]);

  useEffect(() => {
    if (!peer) return;
    setBlocked(isUserBlocked(peer.id));
  }, [peer]);

  useEffect(() => {
    if (!searchOpen) {
      setSearchText("");
      setSearchResults([]);
      return;
    }
    const q = searchText.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      ChatAPI.messages(chatId, { search: q })
        .then((res) => {
          if (!cancelled) setSearchResults(res.messages);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [chatId, searchOpen, searchText]);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    return () => {
      voiceSoundRef.current?.unloadAsync().catch(() => {});
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // Socket events specific to this chat.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !chatId) return;

    const onNew = (msg: ChatMessage) => {
      if (msg.chatId !== chatId) return;
      if (isUserBlocked(msg.senderId)) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Fire read receipt for messages from the peer.
      if (msg.senderId !== selfId) {
        socket.emit("chat:read", { chatId, upToMessageId: msg.id });
        setPeerTyping(false);
      }
      qc.invalidateQueries({ queryKey: ["chats"] });
    };

    const onUpdated = (msg: ChatMessage) => {
      if (msg.chatId !== chatId) return;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    };

    const onDeleted = (p: { chatId: string; messageId: string }) => {
      if (p.chatId !== chatId) return;
      setMessages((prev) => prev.map((m) => (m.id === p.messageId ? { ...m, deletedAt: new Date().toISOString(), text: null } : m)));
    };

    const onTyping = (p: { chatId: string; userId: string; typing: boolean }) => {
      if (p.chatId !== chatId || p.userId === selfId) return;
      setPeerTyping(p.typing);
      // Safety net: never leave the indicator stuck if typing:false is lost.
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
      if (p.typing) peerTypingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 5000);
    };

    const onPresence = (p: { userId: string; isOnline: boolean; lastSeenAt: string | null }) => {
      setPeer((prev) => (prev && prev.id === p.userId ? { ...prev, isOnline: p.isOnline, lastSeenAt: p.lastSeenAt } : prev));
    };

    socket.on("message:new", onNew);
    socket.on("message:updated", onUpdated);
    socket.on("message:deleted", onDeleted);
    socket.on("chat:typing", onTyping);
    socket.on("presence:update", onPresence);

    return () => {
      socket.off("message:new", onNew);
      socket.off("message:updated", onUpdated);
      socket.off("message:deleted", onDeleted);
      socket.off("chat:typing", onTyping);
      socket.off("presence:update", onPresence);
    };
  }, [chatId, selfId, qc]);

  const sendPayload = useCallback((payload: { text?: string | null; kind: MessageKind; attachments?: MessageAttachment[] }) => {
    const socket = getSocket();
    if (blocked) {
      Alert.alert("Пользователь заблокирован", "Разблокируйте пользователя, чтобы отправлять сообщения");
      return;
    }
    if (!socket) {
      Alert.alert("Нет подключения", "Проверьте интернет и попробуйте снова");
      return;
    }
    const tmpId = nonce();
    const now = new Date().toISOString();
    const optimistic: ChatMessage = {
      id: tmpId,
      chatId,
      senderId: selfId ?? "",
      kind: payload.kind,
      text: payload.text ?? null,
      attachments: payload.attachments ?? [],
      replyToId: null,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
      status: "sent",
    };
    setMessages((prev) => [...prev, optimistic]);
    socket.emit("message:send", { chatId, text: payload.text, kind: payload.kind, attachments: payload.attachments, clientNonce: tmpId }, (res) => {
      if ("ok" in res && res.ok) {
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? res.message : m)));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tmpId));
        Alert.alert("Не удалось отправить сообщение");
      }
    });
  }, [blocked, chatId, selfId]);

  const send = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    // Editing mode: apply the edit instead of sending a new message.
    if (editing) {
      const target = editing;
      setEditing(null);
      setInput("");
      if (trimmed !== (target.text ?? "")) {
        const socket = getSocket();
        socket?.emit("message:edit", { messageId: target.id, text: trimmed });
        setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, text: trimmed, editedAt: new Date().toISOString() } : m)));
      }
      return;
    }
    setInput("");
    sendPayload({ text: trimmed, kind: "text" });
  }, [editing, input, sendPayload]);

  // Optimistic attachment send: the bubble (with the local file) appears in the
  // chat immediately, the upload runs in the background, and the same tmp id is
  // used as clientNonce so the server-side message replaces the optimistic one.
  function sendWithUpload(kind: MessageKind, file: { uri: string; name: string; mimeType: string }, extra?: Partial<MessageAttachment>) {
    const socket = getSocket();
    if (blocked) {
      Alert.alert("Пользователь заблокирован", "Разблокируйте пользователя, чтобы отправлять сообщения");
      return;
    }
    if (!socket) {
      Alert.alert("Нет подключения", "Проверьте интернет и попробуйте снова");
      return;
    }
    const tmpId = nonce();
    const text = kind === "voice" ? "Голосовое сообщение" : null;
    const optimistic: ChatMessage = {
      id: tmpId,
      chatId,
      senderId: selfId ?? "",
      kind,
      text,
      attachments: [{ id: tmpId, url: file.uri, mimeType: file.mimeType, size: 0, name: file.name, ...extra }],
      replyToId: null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: "sent",
    };
    setMessages((prev) => [...prev, optimistic]);
    UploadAPI.file(file)
      .then((attachment) => {
        socket.emit(
          "message:send",
          { chatId, kind, text, attachments: [{ ...attachment, ...extra }], clientNonce: tmpId },
          (res) => {
            if ("ok" in res && res.ok) {
              setMessages((prev) => prev.map((m) => (m.id === tmpId ? res.message : m)));
            } else {
              setMessages((prev) => prev.filter((m) => m.id !== tmpId));
              Alert.alert("Не удалось отправить файл");
            }
          },
        );
      })
      .catch(() => {
        setMessages((prev) => prev.filter((m) => m.id !== tmpId));
        Alert.alert("Не удалось загрузить файл", "Проверьте соединение и попробуйте ещё раз");
      });
  }

  // Downscale to ≤1600px and re-encode as JPEG: uploads are much faster and
  // iOS HEIC photos become viewable on Android.
  async function prepareImage(asset: { uri: string; width?: number; height?: number; fileName?: string | null }) {
    const actions = asset.width && asset.width > 1600 ? [{ resize: { width: 1600 } }] : [];
    const out = await ImageManipulator.manipulateAsync(asset.uri, actions, {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const baseName = (asset.fileName ?? `photo-${Date.now()}`).replace(/\.\w+$/, "");
    return {
      file: { uri: out.uri, name: `${baseName}.jpg`, mimeType: "image/jpeg" },
      size: { width: out.width, height: out.height },
    };
  }

  async function pickPhoto() {
    setAttachOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Нет доступа к фото", "Разрешите доступ к галерее в настройках");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
    });
    if (res.canceled || res.assets.length === 0) return;
    for (const asset of res.assets) {
      try {
        const prepared = await prepareImage(asset);
        sendWithUpload("image", prepared.file, prepared.size);
      } catch {
        Alert.alert("Не удалось обработать фото");
      }
    }
  }

  async function takePhoto() {
    setAttachOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Нет доступа к камере", "Разрешите камеру в настройках");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    try {
      const prepared = await prepareImage(res.assets[0]);
      sendWithUpload("image", prepared.file, prepared.size);
    } catch {
      Alert.alert("Не удалось обработать фото");
    }
  }

  async function pickDocument() {
    setAttachOpen(false);
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    sendWithUpload("file", {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "application/octet-stream",
    });
  }

  async function startRecording() {
    setAttachOpen(false);
    if (recording) return;
    if (blocked) {
      Alert.alert("Пользователь заблокирован", "Разблокируйте пользователя, чтобы отправлять сообщения");
      return;
    }
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Нет доступа к микрофону", "Разрешите микрофон, чтобы отправлять голосовые");
      return;
    }
    try {
      // Stop any playing voice message before grabbing the mic.
      await voiceSoundRef.current?.unloadAsync().catch(() => {});
      voiceSoundRef.current = null;
      setVoiceState(null);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      setRecordMs(0);
      const created = await Audio.Recording.createAsync(
        VOICE_RECORDING_OPTIONS,
        (st) => setRecordMs(st.durationMillis ?? 0),
        500,
      );
      setRecording(created.recording);
    } catch {
      Alert.alert("Не удалось начать запись");
    }
  }

  async function stopRecording(sendIt: boolean) {
    const rec = recording;
    if (!rec) return;
    setRecording(null);
    try {
      const status = await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      if (sendIt && uri) {
        const durationSec = Math.max(1, Math.round((status.durationMillis ?? recordMs) / 1000));
        // Derive MIME type from the actual recorded file so it matches on both platforms.
        const ext = uri.split(".").pop()?.toLowerCase() ?? "m4a";
        const mimeMap: Record<string, string> = {
          m4a: "audio/m4a", aac: "audio/aac", mp4: "audio/mp4",
          "3gp": "audio/3gpp", amr: "audio/amr", caf: "audio/x-caf",
        };
        const mimeType = mimeMap[ext] ?? "audio/m4a";
        sendWithUpload("voice", { uri, name: `voice-${Date.now()}.${ext}`, mimeType }, { durationSec });
      }
    } catch {}
  }

  const onChangeInput = (t: string) => {
    setInput(t);
    const socket = getSocket();
    if (!socket) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1000) {
      lastTypingSentRef.current = now;
      socket.emit("chat:typing", { chatId, typing: true });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("chat:typing", { chatId, typing: false });
    }, TYPING_BROADCAST_MS);
  };

  function startCall(kind: CallKind) {
    if (!peer) return;
    const socket = getSocket();
    if (!socket) {
      Alert.alert("Нет подключения", "Проверьте интернет и попробуйте снова");
      return;
    }
    setCallingKind(kind);
    socket.emit("call:invite", { toUserId: peer.id, kind }, (res) => {
      setCallingKind(null);
      if (res.ok) {
        router.push({
          pathname: "/call/[id]",
          params: { id: res.callId, kind, peerId: peer.id, role: "caller" },
        });
      } else {
        Alert.alert("Не удалось начать звонок");
      }
    });
  }

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await ChatAPI.messages(chatId, { cursor: nextCursor });
      setMessages((prev) => [...res.messages, ...prev]);
      setNextCursor(res.nextCursor);
    } finally {
      setLoadingOlder(false);
    }
  }

  // Inverted list: newest message first in data = anchored to the bottom on
  // screen; reaching the list end (visual top) loads older history.
  const listData = useMemo(() => [...messages].reverse(), [messages]);

  async function playVoice(a: MessageAttachment) {
    try {
      const current = voiceSoundRef.current;
      // Same message: toggle pause/resume instead of restarting.
      if (voiceState?.id === a.id && current) {
        if (voiceState.playing) await current.pauseAsync();
        else await current.playAsync();
        return;
      }
      await current?.unloadAsync().catch(() => {});
      voiceSoundRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: a.url },
        { shouldPlay: true, progressUpdateIntervalMillis: 250 },
      );
      voiceSoundRef.current = sound;
      setVoiceState({ id: a.id, playing: true, positionMs: 0, durationMs: (a.durationSec ?? 0) * 1000 });
      sound.setOnPlaybackStatusUpdate((st: any) => {
        if (!st?.isLoaded) return;
        if (st.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (voiceSoundRef.current === sound) voiceSoundRef.current = null;
          setVoiceState(null);
          return;
        }
        setVoiceState({
          id: a.id,
          playing: st.isPlaying === true,
          positionMs: st.positionMillis ?? 0,
          durationMs: st.durationMillis ?? (a.durationSec ?? 0) * 1000,
        });
      });
    } catch {
      setVoiceState(null);
      Alert.alert("Не удалось воспроизвести голосовое");
    }
  }

  function toggleMutedChat() {
    const next = !muted;
    muteChat(chatId, next);
    setMuted(next);
    setMenuOpen(false);
  }

  function toggleBlockUser() {
    if (!peer) return;
    const next = !blocked;
    blockUser(peer.id, next);
    setBlocked(next);
    setMenuOpen(false);
  }

  function deleteForSelf() {
    Alert.alert("Удалить чат у себя?", "Чат пропадёт только на этом устройстве", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          hideChatForSelf(chatId);
          qc.invalidateQueries({ queryKey: ["chats"] });
          router.replace("/(tabs)");
        },
      },
    ]);
  }

  function deleteForEveryone() {
    Alert.alert("Удалить чат для обоих?", "История переписки будет удалена на сервере", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          ChatAPI.delete(chatId)
            .then(() => {
              qc.invalidateQueries({ queryKey: ["chats"] });
              router.replace("/(tabs)");
            })
            .catch(() => Alert.alert("Не удалось удалить чат"));
        },
      },
    ]);
  }

  function openMessageActions(item: ChatMessage) {
    if (item.senderId !== selfId || item.deletedAt || item.id.startsWith("tmp_")) return;
    const actions: Array<{ text: string; style?: "cancel" | "destructive"; onPress?: () => void }> = [];
    if (item.kind === "text" && item.text) {
      actions.push({
        text: "Изменить",
        onPress: () => {
          setEditing(item);
          setInput(item.text ?? "");
        },
      });
    }
    actions.push({
      text: "Удалить",
      style: "destructive",
      onPress: () => {
        getSocket()?.emit("message:delete", { messageId: item.id });
        setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, deletedAt: new Date().toISOString(), text: null } : m)));
        qc.invalidateQueries({ queryKey: ["chats"] });
      },
    });
    actions.push({ text: "Отмена", style: "cancel" });
    Alert.alert("Сообщение", undefined, actions);
  }

  function cancelEditing() {
    setEditing(null);
    setInput("");
  }

  function renderAttachment(item: ChatMessage, a: MessageAttachment, mine: boolean) {
    // Optimistic message that is still uploading its file.
    const pending = item.id.startsWith("tmp_");
    if (item.kind === "image") {
      // Preserve the photo's aspect ratio inside a 220pt-wide frame.
      const ratio = a.width && a.height ? a.height / a.width : 0.82;
      const height = Math.min(300, Math.max(120, Math.round(220 * ratio)));
      return (
        <Pressable key={a.id} onPress={() => setViewerUrl(a.url)} style={styles.imageFrame}>
          <Image source={{ uri: a.url }} style={[styles.attachmentImage, { height }]} contentFit="cover" />
          {pending && (
            <View style={styles.uploadOverlay}>
              <ActivityIndicator color={palette.white} />
            </View>
          )}
        </Pressable>
      );
    }
    if (item.kind === "voice") {
      const active = voiceState?.id === a.id;
      const durMs = active && voiceState!.durationMs > 0 ? voiceState!.durationMs : (a.durationSec ?? 0) * 1000;
      const progress = active && durMs > 0 ? Math.min(1, voiceState!.positionMs / durMs) : 0;
      const label = active ? `${fmtMs(voiceState!.positionMs)} / ${fmtMs(durMs)}` : fmtMs(durMs);
      const fg = mine ? outText : palette.white;
      return (
        <Pressable
          key={a.id}
          onPress={() => !pending && void playVoice(a)}
          style={[styles.voiceBubble, mine && styles.attachmentFileOut]}
        >
          <View style={styles.voicePlayBtn}>
            {pending ? (
              <ActivityIndicator size="small" color={fg} />
            ) : (
              <Icon name={active && voiceState!.playing ? "pause" : "play"} size={18} color={fg} strokeWidth={2} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={[styles.voiceTrack, mine && !isIOS && { backgroundColor: "rgba(0,0,0,0.15)" }]}>
              <View
                style={[
                  styles.voiceProgress,
                  { width: `${Math.round(progress * 100)}%` },
                  mine && !isIOS && { backgroundColor: palette.black },
                ]}
              />
            </View>
            <Text style={[styles.voiceTime, mine && { color: outMeta }]}>{pending ? "Отправка…" : label}</Text>
          </View>
        </Pressable>
      );
    }
    return (
      <View key={a.id} style={[styles.attachmentFile, mine && styles.attachmentFileOut]}>
        <Text style={[styles.attachmentTitle, mine && { color: outText }]} numberOfLines={1}>
          Документ
        </Text>
        <Text style={[styles.attachmentSub, mine && { color: outMeta }]} numberOfLines={1}>
          {pending ? "Загрузка…" : a.name}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.header} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Pressable
          onPress={() => peer && router.push({ pathname: "/user/[username]", params: { username: peer.username } })}
          style={styles.headerPeer}
        >
          <Avatar uri={peer?.avatarUrl ?? null} name={peer ? `${peer.firstName} ${peer.lastName}` : "Чат"} size={36} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.headerName} numberOfLines={1}>
              {peer ? `${peer.firstName} ${peer.lastName}`.trim() || `@${peer.username}` : "Чат"}
            </Text>
            <Text style={styles.headerStatus} numberOfLines={1}>
              {peer ? (peerTyping ? "печатает…" : `@${peer.username}${peer.isOnline ? " · онлайн" : ""}`) : "загрузка…"}
            </Text>
          </View>
        </Pressable>
        {peer && (
          <View style={styles.headerActions}>
            <Pressable
              disabled={callingKind !== null}
              onPress={() => startCall("audio")}
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.pressed, callingKind === "audio" && styles.calling]}
              hitSlop={8}
            >
              <Icon name="phone" size={18} strokeWidth={2} />
            </Pressable>
            <Pressable
              disabled={callingKind !== null}
              onPress={() => startCall("video")}
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.pressed, callingKind === "video" && styles.calling]}
              hitSlop={8}
            >
              <Icon name="video" size={18} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={() => setMenuOpen((v) => !v)}
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.pressed]}
              hitSlop={8}
            >
              <Text style={styles.moreText}>•••</Text>
            </Pressable>
          </View>
        )}
      </View>
      {menuOpen && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuSheet}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                setSearchOpen(true);
              }}
            >
              <Text style={styles.menuText}>Поиск в чате</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={toggleMutedChat}>
              <Text style={styles.menuText}>{muted ? "Включить звук" : "Отключить звук"}</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={toggleBlockUser}>
              <Text style={styles.menuText}>{blocked ? "Разблокировать" : "Заблокировать пользователя"}</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={deleteForSelf}>
              <Text style={styles.menuText}>Удалить только у себя</Text>
            </Pressable>
            <Pressable style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={deleteForEveryone}>
              <Text style={styles.menuDanger}>Удалить для обоих</Text>
            </Pressable>
          </View>
        </>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + headerHeight : 0}
        style={{ flex: 1 }}
      >
        {searchOpen && (
          <View style={styles.searchPanel}>
            <View style={styles.searchRow}>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Искать сообщения"
                placeholderTextColor={palette.inputPlaceholder}
                selectionColor={palette.white}
                style={styles.searchInput}
                autoFocus
              />
              <Pressable onPress={() => setSearchOpen(false)} hitSlop={10}>
                <Text style={styles.cancelText}>Отмена</Text>
              </Pressable>
            </View>
            {searching ? (
              <ActivityIndicator color={palette.white} style={{ marginVertical: spacing.sm }} />
            ) : searchText.trim() ? (
              <View style={styles.searchResults}>
                {searchResults.length === 0 ? (
                  <Text style={styles.searchEmpty}>Ничего не найдено</Text>
                ) : (
                  searchResults.map((m) => (
                    <Pressable key={m.id} onPress={() => setSearchOpen(false)} style={styles.searchResultItem}>
                      <Text style={styles.searchResultText} numberOfLines={2}>
                        {m.text ?? (m.kind === "image" ? "Фото" : m.kind === "voice" ? "Голосовое сообщение" : "Документ")}
                      </Text>
                      <Text style={styles.searchResultTime}>{new Date(m.createdAt).toLocaleString()}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}
          </View>
        )}
        {isLoading && listData.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={palette.white} />
          </View>
        ) : (
          <FlashList
            data={listData}
            keyExtractor={(m) => m.id}
            estimatedItemSize={68}
            contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md }}
            onEndReachedThreshold={0.3}
            onEndReached={loadOlder}
            inverted
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              loadingOlder ? <ActivityIndicator color={palette.textSecondary} style={{ marginVertical: spacing.md }} /> : null
            }
            renderItem={({ item }: { item: ChatMessage }) => {
              const mine = item.senderId === selfId;
              return (
                <View style={[styles.msgRow, mine && { justifyContent: "flex-end" }]}>
                  <Pressable onLongPress={() => openMessageActions(item)} delayLongPress={350} style={styles.bubbleWrap}>
                    <Surface
                      variant={mine ? "bubbleOut" : "bubbleIn"}
                      rounded="lg"
                      style={styles.bubble}
                    >
                      {item.deletedAt ? (
                        <Text style={[styles.msgText, { fontStyle: "italic", color: mine ? outMeta : palette.textSecondary }]}>
                          Сообщение удалено
                        </Text>
                      ) : (
                        <>
                          {item.attachments.map((a) => renderAttachment(item, a, mine))}
                          {!!item.text && item.kind !== "voice" && (
                            <Text style={[styles.msgText, mine && { color: outText }]}>{item.text}</Text>
                          )}
                        </>
                      )}
                      <View style={styles.msgMeta}>
                        {!!item.editedAt && !item.deletedAt && (
                          <Text style={[styles.msgTime, mine && { color: outMeta }]}>изм.</Text>
                        )}
                        <Text style={[styles.msgTime, mine && { color: outMeta }]}>
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                        {mine && !item.deletedAt && (
                          <Text style={[styles.msgTicks, { color: item.status === "read" ? outMetaStrong : outMeta }]}>
                            {statusGlyph(item.status)}
                          </Text>
                        )}
                      </View>
                    </Surface>
                  </Pressable>
                </View>
              );
            }}
          />
        )}

        {peerTyping && (
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: 6 }}>
            <TypingDots />
          </View>
        )}

        {attachOpen && (
          <View style={styles.attachSheet}>
            <Pressable style={styles.attachItem} onPress={takePhoto}>
              <Icon name="camera" size={22} />
              <Text style={styles.attachText}>Камера</Text>
            </Pressable>
            <Pressable style={styles.attachItem} onPress={pickPhoto}>
              <Icon name="image" size={22} />
              <Text style={styles.attachText}>Фото</Text>
            </Pressable>
            <Pressable style={styles.attachItem} onPress={pickDocument}>
              <Icon name="doc" size={22} />
              <Text style={styles.attachText}>Документ</Text>
            </Pressable>
            <Pressable style={styles.attachItem} onPress={startRecording}>
              <Icon name="mic" size={22} />
              <Text style={styles.attachText}>Голосовое</Text>
            </Pressable>
          </View>
        )}

        {editing && (
          <View style={styles.editBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.editTitle}>Редактирование</Text>
              <Text style={styles.editPreview} numberOfLines={1}>{editing.text}</Text>
            </View>
            <Pressable onPress={cancelEditing} hitSlop={10}>
              <Icon name="close" size={18} color={palette.textSecondary} />
            </Pressable>
          </View>
        )}

        {recording ? (
          <View style={styles.inputRow}>
            <Pressable onPress={() => void stopRecording(false)} style={styles.toolBtn} hitSlop={8}>
              <Icon name="close" size={18} />
            </Pressable>
            <View style={[styles.inputWrap, styles.recordingWrap]}>
              <RecordingPulse />
              <Text style={styles.recordTime}>{fmtMs(recordMs)}</Text>
              <Text style={styles.recordHint} numberOfLines={1}>Запись голосового…</Text>
            </View>
            <Pressable onPress={() => void stopRecording(true)} style={styles.send} hitSlop={8}>
              <Icon name="send" size={20} color={palette.black} strokeWidth={2.2} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <Pressable
              onPress={() => setAttachOpen((v) => !v)}
              style={[styles.toolBtn, attachOpen && styles.toolBtnActive]}
              hitSlop={8}
            >
              <Icon name="attach" size={19} color={attachOpen ? palette.black : palette.white} />
            </Pressable>
            <View style={styles.inputWrap}>
              <TextInput
                value={input}
                onChangeText={onChangeInput}
                placeholder={blocked ? "Пользователь заблокирован" : editing ? "Новый текст сообщения" : "Сообщение"}
                placeholderTextColor={palette.inputPlaceholder}
                selectionColor={palette.white}
                style={styles.input}
                multiline
                editable={!blocked}
              />
            </View>
            <Pressable
              onPress={input.trim() || editing ? send : startRecording}
              disabled={blocked}
              style={[styles.send, blocked && styles.disabled]}
              hitSlop={8}
            >
              <Icon
                name={input.trim() || editing ? "send" : "mic"}
                size={20}
                color={palette.black}
                strokeWidth={2.2}
              />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <View style={styles.viewerWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setViewerUrl(null)} />
          {viewerUrl && (
            <View pointerEvents="none" style={styles.viewerImage}>
              <Image source={{ uri: viewerUrl }} style={StyleSheet.absoluteFill} contentFit="contain" />
            </View>
          )}
          <Pressable onPress={() => setViewerUrl(null)} style={[styles.viewerClose, { top: insets.top + 12 }]} hitSlop={12}>
            <Icon name="close" size={20} />
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: palette.black },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.glassBorder,
  },
  back: { color: palette.white, fontSize: 28, paddingHorizontal: 6, paddingVertical: 4 },
  headerPeer: { flex: 1, flexDirection: "row", alignItems: "center", marginLeft: 4 },
  headerName: { color: palette.white, fontSize: 15, fontWeight: "600" },
  headerStatus: { color: palette.textSecondary, fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: "row", gap: spacing.sm, marginLeft: spacing.sm },
  headerIconBtn: {
    alignItems: "center",
    backgroundColor: palette.glassStrong,
    borderColor: palette.glassBorder,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  moreText: { color: palette.white, fontSize: 16, fontWeight: "800", letterSpacing: 1 },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 15,
  },
  menuSheet: {
    position: "absolute",
    right: spacing.md,
    top: 58,
    zIndex: 20,
    elevation: 8,
    backgroundColor: palette.androidCard,
    borderColor: palette.glassBorder,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    width: 230,
  },
  menuItem: {
    borderBottomColor: palette.androidDivider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  menuText: { color: palette.white, fontSize: 15, fontWeight: "600" },
  menuDanger: { color: palette.destructive, fontSize: 15, fontWeight: "700" },
  pressed: { opacity: 0.75 },
  calling: { opacity: 0.5 },
  searchPanel: {
    borderBottomColor: palette.glassBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  searchRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  searchInput: {
    backgroundColor: isIOS ? palette.glass : palette.androidSurface,
    borderColor: palette.glassBorder,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    color: palette.white,
    flex: 1,
    fontSize: 15,
    height: 42,
    paddingHorizontal: spacing.md,
  },
  cancelText: { color: palette.white, fontSize: 14, fontWeight: "600" },
  searchResults: { marginTop: spacing.sm, maxHeight: 180 },
  searchEmpty: { color: palette.textSecondary, fontSize: 14, paddingVertical: spacing.sm },
  searchResultItem: {
    borderBottomColor: palette.androidDivider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  searchResultText: { color: palette.white, fontSize: 14, fontWeight: "600" },
  searchResultTime: { color: palette.textSecondary, fontSize: 11, marginTop: 2 },
  loadingWrap: { alignItems: "center", flex: 1, justifyContent: "center" },
  msgRow: { flexDirection: "row", marginVertical: 3 },
  bubbleWrap: { maxWidth: "78%" },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  imageFrame: { borderRadius: 14, marginBottom: 6, overflow: "hidden" },
  attachmentImage: {
    backgroundColor: palette.androidSurface,
    borderRadius: 14,
    width: 220,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 14,
    justifyContent: "center",
  },
  attachmentFile: {
    backgroundColor: palette.glassStrong,
    borderColor: palette.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
    maxWidth: 220,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  attachmentFileOut: { backgroundColor: isIOS ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)", borderColor: isIOS ? palette.glassBorder : "rgba(0,0,0,0.12)" },
  attachmentTitle: { color: palette.white, fontSize: 14, fontWeight: "600" },
  attachmentSub: { color: palette.textSecondary, fontSize: 12, marginTop: 3 },
  voiceBubble: {
    alignItems: "center",
    backgroundColor: palette.glassStrong,
    borderColor: palette.glassBorder,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    width: 210,
  },
  voicePlayBtn: { alignItems: "center", height: 24, justifyContent: "center", width: 24 },
  voiceTrack: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    height: 3,
    overflow: "hidden",
  },
  voiceProgress: { backgroundColor: palette.white, borderRadius: 2, height: "100%" },
  voiceTime: { color: palette.textSecondary, fontSize: 11, marginTop: 5 },
  msgText: { color: palette.white, fontSize: 15, lineHeight: 20 },
  msgMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 2 },
  msgTime: { color: palette.textSecondary, fontSize: 10 },
  msgTicks: { fontSize: 11, fontWeight: "700" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.glassBorder,
  },
  attachSheet: {
    backgroundColor: palette.androidCard,
    borderColor: palette.glassBorder,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  attachItem: {
    alignItems: "center",
    backgroundColor: palette.glass,
    borderRadius: radius.lg,
    flex: 1,
    paddingVertical: spacing.md,
  },
  attachText: { color: palette.white, fontSize: 12, fontWeight: "600", marginTop: 6 },
  editBanner: {
    alignItems: "center",
    borderTopColor: palette.glassBorder,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  editTitle: { color: palette.white, fontSize: 12, fontWeight: "700" },
  editPreview: { color: palette.textSecondary, fontSize: 12, marginTop: 2 },
  recordingWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: 10,
  },
  pulseDot: { backgroundColor: palette.white, borderRadius: 5, height: 10, width: 10 },
  recordTime: { color: palette.white, fontSize: 14, fontVariant: ["tabular-nums"], fontWeight: "700" },
  recordHint: { color: palette.textSecondary, flex: 1, fontSize: 13 },
  viewerWrap: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.96)",
    flex: 1,
    justifyContent: "center",
  },
  viewerImage: { height: "82%", width: "100%" },
  viewerClose: {
    alignItems: "center",
    backgroundColor: palette.glassStrong,
    borderColor: palette.glassBorder,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: "center",
    position: "absolute",
    right: spacing.lg,
    width: 40,
  },
  toolBtn: {
    alignItems: "center",
    backgroundColor: palette.glassStrong,
    borderColor: palette.glassBorder,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: "center",
    marginBottom: 4,
    width: 36,
  },
  toolBtnActive: { backgroundColor: palette.white },
  inputWrap: {
    flex: 1,
    backgroundColor: isIOS ? palette.glass : palette.androidSurface,
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassBorder,
  },
  input: {
    color: palette.white,
    fontSize: 15,
    paddingVertical: 10,
    maxHeight: 120,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
});
