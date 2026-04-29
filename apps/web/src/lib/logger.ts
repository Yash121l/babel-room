type LogLevel = "debug" | "info" | "warn" | "error";

declare global {
  interface Window {
    __BABEL_ROOM_LOGS__?: string[];
  }
}

function emit(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  const line = JSON.stringify({ level, event, ...data });
  const buf = window.__BABEL_ROOM_LOGS__ ?? [];
  buf.push(line);
  window.__BABEL_ROOM_LOGS__ = buf.slice(-200);
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>): void =>
    emit("debug", event, data),
  info: (event: string, data?: Record<string, unknown>): void =>
    emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>): void =>
    emit("warn", event, data),
  error: (event: string, data?: Record<string, unknown>): void =>
    emit("error", event, data),
};
