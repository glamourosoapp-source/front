"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NotificationsPageContent } from "@/components/notifications/NotificationsPageContent";
import { hrefForNotification } from "@/components/notifications/notification-ui";
import { httpClient } from "@/services/http-client";
import { useNotificationStore } from "@/stores/notification.store";
import type { Notification } from "@/types";
import type { PaginatedList } from "@glamouroso/shared";
import "@/components/notifications/notifications.css";

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const markReadLocal = useNotificationStore((s) => s.markReadLocal);
  const markAllReadLocal = useNotificationStore((s) => s.markAllReadLocal);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, countRes] = await Promise.all([
        httpClient.get<PaginatedList<Notification>>("/notifications", {
          limit: 50,
          unreadOnly: filter === "unread",
        }),
        httpClient.get<{ count: number }>("/notifications/unread-count"),
      ]);
      setItems(res.items);
      setUnreadCount(countRes.count);
    } catch {
      toast.error("No se pudieron cargar las notificaciones.");
    } finally {
      setLoading(false);
    }
  }, [filter, setUnreadCount]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAllRead() {
    try {
      await httpClient.post("/notifications/read-all");
      markAllReadLocal();
      await load();
      toast.success("Todas marcadas como leídas.");
    } catch {
      toast.error("No se pudo completar la acción.");
    }
  }

  async function openItem(n: Notification) {
    if (!n.readAt) {
      try {
        await httpClient.patch(`/notifications/${n.id}/read`);
        markReadLocal(n.id);
        setItems((prev) =>
          prev.map((row) =>
            row.id === n.id ? { ...row, readAt: row.readAt || new Date().toISOString() } : row
          )
        );
      } catch {
        /* navigate anyway */
      }
    }
    router.push(hrefForNotification(n));
  }

  return (
    <NotificationsPageContent
      items={items}
      loading={loading}
      filter={filter}
      unreadCount={unreadCount}
      onFilterChange={setFilter}
      onRefresh={() => void load()}
      onMarkAllRead={() => void markAllRead()}
      onOpenItem={(n) => void openItem(n)}
    />
  );
}
