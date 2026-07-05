import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import Svg, { Path } from "react-native-svg";
import { Avatar } from "../../components/ui/Avatar";
import { CallAPI, UserAPI } from "../../services/api";
import { getSocket } from "../../services/socket";
import { palette, spacing } from "../../constants/theme";

type CallRole = "caller" | "callee";
type CallKind = "audio" | "video";
type ControlIconName = "speaker" | "mic" | "video" | "end";

function ControlIcon({ name, off = false }: { name: ControlIconName; off?: boolean }) {
  const stroke = name === "end" ? palette.white : palette.black;
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      {name === "speaker" && (
        <>
          <Path d="M4 9v6h4l5 4V5L8 9H4Z" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M16 9.5a4 4 0 0 1 0 5" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
          <Path d="M18.5 7a7.5 7.5 0 0 1 0 10" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        </>
      )}
      {name === "mic" && (
        <>
          <Path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" stroke={stroke} strokeWidth={2} />
          <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        </>
      )}
      {name === "video" && (
        <>
          <Path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h7A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 16.5v-9Z" stroke={stroke} strokeWidth={2} />
          <Path d="m16 10 4-2.5v9L16 14" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {name === "end" && (
        <Path d="M6.2 15.2c3.8-2.7 7.8-2.7 11.6 0 .8.6 2 .2 2.3-.8l.5-1.7c.2-.8-.1-1.6-.8-2C14.7 7.8 9.3 7.8 4.2 10.7c-.7.4-1 1.2-.8 2l.5 1.7c.3 1 1.5 1.4 2.3.8Z" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      )}
      {off && <Path d="M4 20 20 4" stroke="#FF3B30" strokeWidth={2.6} strokeLinecap="round" />}
    </Svg>
  );
}

// WebRTC requires a native build (expo prebuild + react-native-webrtc).
// We import lazily so Expo Go doesn't crash; actual call logic only runs on a
// prebuilt dev-client. Signaling + UI work either way.
let WebRTC: typeof import("react-native-webrtc") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WebRTC = require("react-native-webrtc");
} catch {
  WebRTC = null;
}

export default function CallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; kind?: CallKind; peerId?: string; role?: CallRole }>();
  const callId = params.id as string;
  const kind = (params.kind ?? "audio") as CallKind;
  const role = (params.role ?? "caller") as CallRole;
  const RTCView = WebRTC?.RTCView;

  const [currentKind, setCurrentKind] = useState<CallKind>(kind);
  const [peerName, setPeerName] = useState<string>("");
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);
  const [status, setStatus] = useState<"calling" | "ringing" | "active" | "ended">(
    role === "caller" ? "calling" : "ringing",
  );
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [videoUpgradePending, setVideoUpgradePending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);

  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  // Set when call:accepted arrives before the local RTCPeerConnection is ready.
  const offerWhenReadyRef = useRef(false);
  // ICE candidates that arrived before the remote description was set.
  const pendingIceRef = useRef<any[]>([]);

  // Start elapsed timer when call becomes active.
  useEffect(() => {
    if (status !== "active") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [status]);

  useEffect(() => {
    if (role !== "caller" || status !== "calling") return;
    const t = setTimeout(() => {
      Alert.alert("Нет ответа", "Собеседник не ответил на вызов");
      end("ended");
    }, 45_000);
    return () => clearTimeout(t);
  }, [role, status]);

  // Resolve peer identity from the API.
  useEffect(() => {
    if (!params.peerId) return;
    let cancelled = false;
    UserAPI.byId(params.peerId)
      .then((u) => {
        if (cancelled) return;
        setPeerName(`${u.firstName} ${u.lastName}`.trim() || `@${u.username}`);
        setPeerAvatar(u.avatarUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setPeerName("Собеседник");
      });
    return () => {
      cancelled = true;
    };
  }, [params.peerId]);

  // Initialize WebRTC + signaling.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const activeSocket = socket;

    let cleanup = () => {};

    async function makeOffer() {
      const pc = pcRef.current;
      if (!pc) return;
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      activeSocket.emit("call:signal", { callId, data: { type: "offer", sdp: offer.sdp! } });
    }

    async function setup() {
      if (!WebRTC) return; // Running in Expo Go — show UI only, no media.
      const { RTCPeerConnection, mediaDevices } = WebRTC;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
      const ice = await CallAPI.iceConfig().catch(() => []);
      const pc = new RTCPeerConnection({ iceServers: ice });
      const pcAny = pc as any;
      pcRef.current = pc;

      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: kind === "video",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));

      pcAny.ontrack = (e: any) => {
        const incoming = e.streams?.[0];
        if (incoming) setRemoteStream(incoming);
      };

      pcAny.onconnectionstatechange = () => {
        if (pcAny.connectionState === "connected") setStatus("active");
      };

      pcAny.onicecandidate = (e: any) => {
        if (e.candidate) activeSocket.emit("call:signal", { callId, data: { type: "ice", candidate: e.candidate } });
      };

      // The caller does NOT send the offer here: the callee may not have
      // mounted this screen yet and would miss it. The offer is sent when
      // call:accepted arrives (see onAccepted below).
      if (offerWhenReadyRef.current && role === "caller") {
        offerWhenReadyRef.current = false;
        await makeOffer();
      }
    }

    const flushPendingIce = async (pc: any) => {
      if (!WebRTC) return;
      const { RTCIceCandidate } = WebRTC;
      const queued = pendingIceRef.current.splice(0);
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {}
      }
    };

    const onSignal = async (p: { callId: string; from: string; data: any }) => {
      if (p.callId !== callId || !WebRTC) return;
      const pc = pcRef.current;
      if (!pc) return;
      const { RTCSessionDescription, RTCIceCandidate } = WebRTC;
      if (p.data.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: p.data.sdp }));
        await flushPendingIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        activeSocket.emit("call:signal", { callId, data: { type: "answer", sdp: answer.sdp! } });
      } else if (p.data.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: p.data.sdp }));
        await flushPendingIce(pc);
      } else if (p.data.type === "ice") {
        // Buffer candidates until the remote description exists, otherwise
        // addIceCandidate throws and the candidate is silently lost.
        if (!pc.remoteDescription) {
          pendingIceRef.current.push(p.data.candidate);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(p.data.candidate));
        } catch {}
      }
    };

    const onAccepted = (p: { callId: string }) => {
      if (p.callId !== callId) return;
      setStatus("active");
      // Callee is now on the call screen and listening — start SDP exchange.
      if (role === "caller") {
        if (pcRef.current) void makeOffer();
        else offerWhenReadyRef.current = true;
      }
    };
    const onDeclined = (p: { callId: string }) => {
      if (p.callId !== callId) return;
      end("ended");
    };
    const onEnded = (p: { callId: string }) => {
      if (p.callId !== callId) return;
      end("ended");
    };
    const onUpgradeVideo = (p: { callId: string; from: string; accept?: boolean }) => {
      if (p.callId !== callId) return;
      if (p.accept === true) {
        setVideoUpgradePending(false);
        setCurrentKind("video");
        void enableVideo(true);
        return;
      }
      if (p.accept === false) {
        setVideoUpgradePending(false);
        Alert.alert("Собеседник отклонил видео");
        return;
      }
      Alert.alert("Видеозвонок", "Собеседник просит включить видео", [
        {
          text: "Отклонить",
          style: "cancel",
          onPress: () => activeSocket.emit("call:upgrade-video", { callId, accept: false }),
        },
        {
          text: "Принять",
          onPress: () => {
            setCurrentKind("video");
            void enableVideo(false);
            activeSocket.emit("call:upgrade-video", { callId, accept: true });
          },
        },
      ]);
    };

    activeSocket.on("call:signal", onSignal);
    activeSocket.on("call:accepted", onAccepted);
    activeSocket.on("call:declined", onDeclined);
    activeSocket.on("call:ended", onEnded);
    activeSocket.on("call:upgrade-video", onUpgradeVideo);
    void setup();

    cleanup = () => {
      activeSocket.off("call:signal", onSignal);
      activeSocket.off("call:accepted", onAccepted);
      activeSocket.off("call:declined", onDeclined);
      activeSocket.off("call:ended", onEnded);
      activeSocket.off("call:upgrade-video", onUpgradeVideo);
      // Release camera/mic even if the screen unmounts without an explicit hangup.
      try {
        localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
      } catch {}
      try {
        pcRef.current?.close();
      } catch {}
    };
    return cleanup;
  }, [callId, role, kind]);

  function end(to: "ended" | "declined" = "ended") {
    const socket = getSocket();
    socket?.emit(to === "declined" ? "call:decline" : "call:end", { callId });
    setStatus("ended");
    setLocalStream(null);
    setRemoteStream(null);
    try {
      localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
    setTimeout(() => router.back(), 600);
  }

  function accept() {
    const socket = getSocket();
    socket?.emit("call:accept", { callId });
    setStatus("active");
  }

  function toggleMuted() {
    const next = !muted;
    setMuted(next);
    localStreamRef.current?.getAudioTracks?.().forEach((t: any) => {
      t.enabled = !next;
    });
  }

  async function toggleSpeaker() {
    const next = !speakerOn;
    setSpeakerOn(next);
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: !next,
    }).catch(() => {});
  }

  async function enableVideo(negotiate: boolean) {
    if (!WebRTC || !pcRef.current) return;
    const { mediaDevices } = WebRTC;
    const socket = getSocket();
    const stream = await mediaDevices.getUserMedia({ audio: false, video: true });
    stream.getVideoTracks().forEach((track: any) => {
      pcRef.current.addTrack(track, stream);
      try {
        localStreamRef.current?.addTrack?.(track);
      } catch {}
    });
    setLocalStream(localStreamRef.current ?? stream);
    setCameraOff(false);
    if (!negotiate) return;
    const offer = await pcRef.current.createOffer({});
    await pcRef.current.setLocalDescription(offer);
    socket?.emit("call:signal", { callId, data: { type: "offer", sdp: offer.sdp! } });
  }

  function toggleCamera() {
    const next = !cameraOff;
    setCameraOff(next);
    localStreamRef.current?.getVideoTracks?.().forEach((t: any) => {
      t.enabled = !next;
    });
  }

  function requestVideoUpgrade() {
    const socket = getSocket();
    if (!socket || videoUpgradePending) return;
    setVideoUpgradePending(true);
    socket.emit("call:upgrade-video", { callId });
  }

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      {currentKind === "video" && RTCView && remoteStream && (
        <RTCView streamURL={remoteStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" />
      )}
      {currentKind === "video" && RTCView && localStream && (
        <View style={styles.localPreview}>
          <RTCView streamURL={localStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror />
        </View>
      )}
      <View style={styles.centered}>
        <Avatar uri={peerAvatar} name={peerName || "Собеседник"} size={144} />
        <Text style={styles.name}>{peerName || "Собеседник"}</Text>
        <Text style={styles.status}>
          {status === "calling"
            ? "Соединение…"
            : status === "ringing"
              ? "Входящий"
              : status === "active"
                ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
                : "Завершён"}
        </Text>
        <Text style={styles.kind}>{currentKind === "video" ? "видеозвонок" : "аудиозвонок"}</Text>
      </View>

      <View style={styles.actions}>
        {status === "ringing" ? (
          <>
            <Pressable style={[styles.btn, styles.btnDecline]} onPress={() => end("declined")}>
              <Text style={styles.btnText}>Отклонить</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnAccept]} onPress={accept}>
              <Text style={[styles.btnText, { color: palette.black }]}>Принять</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.activeRow}>
            <View style={styles.controlWrap}>
              <Pressable
                style={[styles.circleBtn, !speakerOn && styles.circleBtnOff]}
                onPress={toggleSpeaker}
              >
                <ControlIcon name="speaker" off={!speakerOn} />
              </Pressable>
              <Text style={styles.controlLabel}>динамик</Text>
            </View>
            {currentKind === "audio" && status === "calling" && (
              <View style={styles.controlWrap}>
                <Pressable
                  style={[styles.circleBtn, styles.circleBtnDisabled]}
                  disabled
                >
                  <ControlIcon name="video" off />
                </Pressable>
                <Text style={styles.controlLabel}>видео</Text>
              </View>
            )}
            <Pressable
              style={[styles.circleBtn, muted && styles.circleBtnOff]}
              onPress={toggleMuted}
            >
              <ControlIcon name="mic" off={muted} />
            </Pressable>
            {currentKind === "video" && (
              <Pressable
                style={[styles.circleBtn, cameraOff && styles.circleBtnOff]}
                onPress={toggleCamera}
              >
                <ControlIcon name="video" off={cameraOff} />
              </Pressable>
            )}
            {currentKind === "audio" && status === "active" && (
              <Pressable
                style={[styles.circleBtn, videoUpgradePending && styles.circleBtnDisabled]}
                onPress={requestVideoUpgrade}
              >
                {videoUpgradePending ? <Text style={styles.pendingText}>…</Text> : <ControlIcon name="video" />}
              </Pressable>
            )}
            <Pressable style={[styles.circleBtn, styles.endBtn]} onPress={() => end("ended")}>
              <ControlIcon name="end" />
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: palette.black, justifyContent: "space-between" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", zIndex: 2 },
  localPreview: {
    backgroundColor: palette.androidSurface,
    borderColor: palette.glassBorder,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    height: 168,
    overflow: "hidden",
    position: "absolute",
    right: spacing.lg,
    top: 72,
    width: 112,
    zIndex: 3,
  },
  name: { color: palette.white, fontSize: 24, fontWeight: "700", marginTop: spacing.xl },
  status: { color: palette.textSecondary, fontSize: 16, marginTop: 8 },
  kind: { color: palette.textMuted, fontSize: 13, marginTop: 4 },
  actions: { padding: spacing.xl, gap: spacing.md, zIndex: 4 },
  btn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnAccept: { backgroundColor: palette.white },
  btnDecline: { backgroundColor: palette.glassStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.glassBorder },
  btnText: { color: palette.white, fontSize: 16, fontWeight: "700" },
  activeRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "center" },
  controlWrap: { alignItems: "center", gap: 7 },
  controlLabel: { color: palette.white, fontSize: 12, fontWeight: "600" },
  circleBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassBorder,
  },
  circleBtnOff: { backgroundColor: "rgba(255,255,255,0.82)" },
  circleBtnDisabled: { opacity: 0.5 },
  pendingText: { color: palette.black, fontSize: 28, fontWeight: "800", marginTop: -8 },
  endBtn: { backgroundColor: "#FF3B30" },
});
