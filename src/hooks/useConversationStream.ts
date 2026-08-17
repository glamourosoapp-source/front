"use client";

import { useEffect, useRef } from "react";
import type { ConversationStreamEvent } from "@glamouroso/shared/entities";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { ConnectionState } from "@/lib/realtime-client";

export type { ConnectionState };

interface Options {
  onEvent: (event: ConversationStreamEvent) => void;
  onState?: (state: ConnectionState) => void;
}

const CONVERSATION_EVENT_TYPES = new Set(["message_created", "agent_typing", "conversation_updated"]);

/**
 * Entrega los eventos de conversación (message_created / agent_typing /
 * conversation_updated) en tiempo real desde el WebSocket compartido del
 * dashboard (RealtimeProvider). La reconexión con backoff y el watchdog viven
 * en el RealtimeClient; el estado de conexión se propaga por onState igual que
 * cuando este hook manejaba su propia conexión SSE.
 */
export function useConversationStream({ onEvent, onState }: Options) {
  const { subscribe, connectionState } = useRealtime();
  const onEventRef = useRef(onEvent);
  const onStateRef = useRef(onState);
  onEventRef.current = onEvent;
  onStateRef.current = onState;

  useEffect(() => {
    return subscribe((event) => {
      if (CONVERSATION_EVENT_TYPES.has(event.type)) {
        onEventRef.current(event as ConversationStreamEvent);
      }
    });
  }, [subscribe]);

  useEffect(() => {
    onStateRef.current?.(connectionState);
  }, [connectionState]);
}
