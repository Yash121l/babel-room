import type { Participant, WSMessageType } from "@babel-room/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_WEBSOCKET_RECONNECTS,
} from "../constants";
import { logger } from "../lib/logger";

export interface UseRoomOptions {
  onMessage?: (msg: WSMessageType) => void;
}

function parseWsMessage(raw: string): WSMessageType | null {
  try {
    return JSON.parse(raw) as WSMessageType;
  } catch {
    return null;
  }
}

export function useRoom(
  wsUrl: string | null,
  options: UseRoomOptions = {},
): {
  participants: Record<string, Participant>;
  roomActive: boolean;
  lastError: string | null;
  sendPing: () => void;
} {
  const { onMessage } = options;
  const [participants, setParticipants] = useState<Record<string, Participant>>(
    {},
  );
  const [roomActive, setRoomActive] = useState<boolean>(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const applyMessage = useCallback((msg: WSMessageType) => {
    onMessageRef.current?.(msg);
    if (msg.type === "room_state") {
      setParticipants(msg.state.participants);
      setRoomActive(msg.state.isActive);
    } else if (msg.type === "participant_joined") {
      setParticipants((p) => ({
        ...p,
        [msg.participant.id]: msg.participant,
      }));
    } else if (msg.type === "participant_left") {
      setParticipants((p) => {
        const next = { ...p };
        delete next[msg.participantId];
        return next;
      });
    } else if (msg.type === "error") {
      setLastError(msg.message);
    }
  }, []);

  useEffect(() => {
    if (!wsUrl) return undefined;

    let cancelled = false;

    const clearTimer = (): void => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const closeWs = (): void => {
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };

    const scheduleOpen = (delayMs: number): void => {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        openSocket();
      }, delayMs);
    };

    const openSocket = (): void => {
      if (cancelled || !wsUrl) return;
      closeWs();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        reconnectsRef.current = 0;
        setLastError(null);
        logger.info("ws_open", {});
      };
      ws.onmessage = (ev) => {
        const msg = parseWsMessage(String(ev.data));
        if (!msg) return;
        applyMessage(msg);
      };
      ws.onerror = () => {
        setLastError("WebSocket error");
        logger.error("ws_error", {});
      };
      ws.onclose = () => {
        if (cancelled) return;
        logger.info("ws_close", { reconnects: reconnectsRef.current });
        if (reconnectsRef.current >= MAX_WEBSOCKET_RECONNECTS) {
          setLastError("WebSocket reconnect limit reached");
          return;
        }
        reconnectsRef.current += 1;
        const delay = Math.min(
          MAX_BACKOFF_MS,
          INITIAL_BACKOFF_MS * 2 ** (reconnectsRef.current - 1),
        );
        scheduleOpen(delay);
      };
    };

    reconnectsRef.current = 0;
    openSocket();

    return () => {
      cancelled = true;
      clearTimer();
      closeWs();
    };
  }, [wsUrl, applyMessage]);

  const sendPing = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" } satisfies WSMessageType));
    }
  }, []);

  return { participants, roomActive, lastError, sendPing };
}
