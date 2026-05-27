import { io, type Socket } from "socket.io-client";
import { ACCESS_TOKEN_KEY, apiBaseUrl } from "./api";

let cached: Socket | null = null;

export function getSocket(): Socket {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (cached && cached.connected) return cached;
  if (cached) cached.disconnect();
  cached = io(apiBaseUrl, {
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
  return cached;
}

export function disconnectSocket(): void {
  cached?.disconnect();
  cached = null;
}
