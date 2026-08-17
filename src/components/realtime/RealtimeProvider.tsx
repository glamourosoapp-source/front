"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { RealtimeServerEvent } from "@glamouroso/shared";
import { realtimeClient, type ConnectionState } from "@/lib/realtime-client";
import { useAuthStore } from "@/stores/auth.store";
import { useNotificationStore } from "@/stores/notification.store";
import type { Notification } from "@/types";

interface RealtimeContextValue {
  subscribe: (listener: (event: RealtimeServerEvent) => void) => () => void;
  connectionState: ConnectionState;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  subscribe: () => () => undefined,
  connectionState: "closed",
});

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

/**
 * Dueño de la conexión realtime del dashboard: conecta el WS al montar y
 * puentea las notificaciones al store global (antes eso vivía dentro de
 * NotificationsMenu). El resto de las páginas se suscriben vía useRealtime().
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [connectionState, setConnectionState] = useState<ConnectionState>("closed");

  useEffect(() => {
    if (!isAuthenticated) return;
    realtimeClient.connect();
    const offState = realtimeClient.onStateChange(setConnectionState);
    return () => {
      offState();
      realtimeClient.disconnect();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const prepend = useNotificationStore.getState().prepend;
    return realtimeClient.subscribe((event) => {
      if (!("notification" in event) || !event.notification) return;
      const notification = event.notification as Notification;
      const currentUserId = useAuthStore.getState().user?.id ?? null;
      // El server ya filtra por userId; este guard cubre carreras de sesión.
      if (currentUserId && notification.userId !== currentUserId) return;
      prepend(notification);
    });
  }, []);

  return (
    <RealtimeContext.Provider value={{ subscribe: realtimeClient.subscribe.bind(realtimeClient), connectionState }}>
      {children}
    </RealtimeContext.Provider>
  );
}
