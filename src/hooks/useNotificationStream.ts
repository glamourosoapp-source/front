"use client";

import { useEffect, useRef } from "react";
import { config } from "@/config";
import { useNotificationStore } from "@/stores/notification.store";
import type { Notification } from "@/types";
import type { NotificationEventPayload } from "@glamouroso/shared/schemas/notification";

const MIN_BACKOFF_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;

function parseSseChunk(buffer: string): { events: NotificationEventPayload[]; rest: string } {
  const events: NotificationEventPayload[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() || "";

  for (const part of parts) {
    const lines = part.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const payload = JSON.parse(line.slice(6)) as { type?: string; notification?: Notification };
        if (payload.type === "connected" || !payload.notification) continue;
        events.push(payload as NotificationEventPayload);
      } catch {
        /* ignore malformed */
      }
    }
  }

  return { events, rest };
}

export function useNotificationStream(enabled: boolean) {
  const prepend = useNotificationStore((s) => s.prepend);
  const abortRef = useRef<AbortController | null>(null);
  const backoffRef = useRef(MIN_BACKOFF_MS);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;

    async function connect() {
      const token = localStorage.getItem("token");
      if (!token || cancelled) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`${config.apiBaseUrl}/notifications/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`SSE failed: ${response.status}`);
        }

        backoffRef.current = MIN_BACKOFF_MS;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseChunk(buffer);
          buffer = rest;
          const currentUserId = (() => {
            try {
              const raw = localStorage.getItem("user");
              if (!raw) return null;
              return (JSON.parse(raw) as { id?: string }).id ?? null;
            } catch {
              return null;
            }
          })();

          for (const event of events) {
            const notification = event.notification as Notification | undefined;
            if (!notification) continue;
            if (currentUserId && notification.userId !== currentUserId) continue;
            prepend(notification);
          }
        }
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        const delay = backoffRef.current;
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        await new Promise((r) => setTimeout(r, delay));
        if (!cancelled) void connect();
      }
    }

    void connect();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [enabled, prepend]);
}
