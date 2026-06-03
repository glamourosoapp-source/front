"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Popover } from "@mui/material";
import { Bell, Inbox } from "lucide-react";
import { httpClient } from "@/services/http-client";
import { useNotificationStore } from "@/stores/notification.store";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import { NotificationListItem } from "./NotificationListItem";
import { hrefForNotification } from "./notification-ui";
import type { Notification } from "@/types";
import type { PaginatedList } from "@glamouroso/shared";
import "./notifications.css";

export function NotificationsMenu() {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(false);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const preview = useNotificationStore((s) => s.preview);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const setPreview = useNotificationStore((s) => s.setPreview);
  const markReadLocal = useNotificationStore((s) => s.markReadLocal);

  useNotificationStream(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [countRes, listRes] = await Promise.all([
        httpClient.get<{ count: number }>("/notifications/unread-count"),
        httpClient.get<PaginatedList<Notification>>("/notifications", { limit: 15 }),
      ]);
      setUnreadCount(countRes.count);
      setPreview(listRes.items);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [setPreview, setUnreadCount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = Boolean(anchorEl);

  async function handleItemClick(n: Notification) {
    if (!n.readAt) {
      try {
        await httpClient.patch(`/notifications/${n.id}/read`);
        markReadLocal(n.id);
      } catch {
        /* continue navigation */
      }
    }
    setAnchorEl(null);
    router.push(hrefForNotification(n));
  }

  return (
    <>
      <div className="topbar-notify-wrap">
        <Badge
          className="topbar-notify-badge"
          badgeContent={unreadCount > 0 ? unreadCount : undefined}
          color="error"
          max={99}
          overlap="circular"
        >
          <button
            type="button"
            className="icon-action"
            aria-label="Notificaciones"
            aria-expanded={open}
            onClick={(e) => {
              setAnchorEl(e.currentTarget);
              void refresh();
            }}
          >
            <Bell size={18} />
          </button>
        </Badge>
      </div>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { className: "notifications-popover-paper" } }}
      >
        <div className="notifications-popover-header">
          <h2>Notificaciones</h2>
          {unreadCount > 0 ? (
            <span className="notif-segmented__count">{unreadCount}</span>
          ) : null}
        </div>
        <div className="notifications-list">
          {loading && preview.length === 0 ? (
            <div className="notif-skeleton-list" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="notif-skeleton-row">
                  <div className="notif-skeleton-icon" />
                  <div className="notif-skeleton-lines">
                    <div className="notif-skeleton-line notif-skeleton-line--short" />
                    <div className="notif-skeleton-line" />
                  </div>
                </div>
              ))}
            </div>
          ) : preview.length === 0 ? (
            <div className="notif-empty" style={{ padding: "32px 20px 36px" }}>
              <div className="notif-empty__icon-wrap" style={{ width: 56, height: 56, marginBottom: 12 }}>
                <Inbox size={26} />
              </div>
              <p style={{ margin: 0, fontSize: 13 }}>No hay notificaciones recientes</p>
            </div>
          ) : (
            preview.map((n) => (
              <NotificationListItem
                key={n.id}
                notification={n}
                compact
                onClick={() => void handleItemClick(n)}
              />
            ))
          )}
        </div>
        <div className="notifications-popover-footer">
          <Link href="/dashboard/notifications" onClick={() => setAnchorEl(null)}>
            Ver centro de notificaciones
          </Link>
        </div>
      </Popover>
    </>
  );
}
