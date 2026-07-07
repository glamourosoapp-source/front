"use client";

import { useEffect, useRef } from "react";
import { config } from "@/config";
import type { ConversationStreamEvent } from "@glamouroso/shared/entities";

const MIN_BACKOFF_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;

export type ConnectionState = "connecting" | "open" | "closed";

interface Options {
  onEvent: (event: ConversationStreamEvent) => void;
  onState?: (state: ConnectionState) => void;
}

function parseChunk(buffer: string): { events: ConversationStreamEvent[]; rest: string } {
  const events: ConversationStreamEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() || "";

  for (const part of parts) {
    for (const line of part.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const payload = JSON.parse(line.slice(6)) as { type?: string };
        if (
          payload.type === "message_created" ||
          payload.type === "agent_typing" ||
          payload.type === "conversation_updated"
        ) {
          events.push(payload as ConversationStreamEvent);
        }
      } catch {
        /* ignore malformed */
      }
    }
  }

  return { events, rest };
}

/**
 * Consume el stream SSE de `/notifications/stream` y entrega los eventos de
 * conversación (message_created / agent_typing) en tiempo real. Reconecta con
 * backoff exponencial. Espejo de useNotificationStream pero para mensajes.
 */
export function useConversationStream({ onEvent, onState }: Options) {
  const onEventRef = useRef(onEvent);
  const onStateRef = useRef(onState);
  onEventRef.current = onEvent;
  onStateRef.current = onState;

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let controller: AbortController | null = null;
    let backoff = MIN_BACKOFF_MS;

    async function connect() {
      const token = localStorage.getItem("token");
      if (!token || cancelled) return;

      controller?.abort();
      controller = new AbortController();
      onStateRef.current?.("connecting");

      try {
        const response = await fetch(`${config.apiBaseUrl}/notifications/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`SSE failed: ${response.status}`);

        backoff = MIN_BACKOFF_MS;
        onStateRef.current?.("open");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseChunk(buffer);
          buffer = rest;
          for (const event of events) onEventRef.current(event);
        }
      } catch {
        if (cancelled || controller?.signal.aborted) return;
        onStateRef.current?.("closed");
        const delay = backoff;
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        await new Promise((r) => setTimeout(r, delay));
        if (!cancelled) void connect();
      }
    }

    void connect();

    return () => {
      cancelled = true;
      controller?.abort();
      onStateRef.current?.("closed");
    };
  }, []);
}
