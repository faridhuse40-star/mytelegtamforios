import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@messenger/shared";
import { SOCKET_URL } from "../constants/config";
import { loadTokens } from "./storage";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket | null {
  return socket;
}

export function connectSocket(): AppSocket {
  if (socket) {
    // Reuse the singleton so listeners registered elsewhere stay attached.
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(SOCKET_URL, {
    transports: ["websocket"],
    // Function form: the token is re-read on every (re)connection attempt,
    // so a refreshed access token is picked up automatically.
    auth: (cb) => cb({ token: loadTokens()?.accessToken }),
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
  }) as AppSocket;
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
