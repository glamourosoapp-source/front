"use client";

import { ChevronRight } from "lucide-react";
import type { Notification } from "@/types";
import {
  formatFullTime,
  formatRelativeTime,
  getNotificationTypeConfig,
} from "./notification-ui";

interface NotificationListItemProps {
  notification: Notification;
  onClick: () => void;
  compact?: boolean;
}

export function NotificationListItem({
  notification,
  onClick,
  compact = false,
}: NotificationListItemProps) {
  const config = getNotificationTypeConfig(notification.type);
  const Icon = config.icon;
  const isUnread = !notification.readAt;

  return (
    <button
      type="button"
      className={`notif-row${isUnread ? " notif-row--unread" : ""}${compact ? " notif-row--compact" : ""}`}
      onClick={onClick}
    >
      <span className={`notif-row__icon notif-row__icon--${config.tone}`} aria-hidden="true">
        <Icon size={compact ? 18 : 20} />
      </span>

      <span className="notif-row__body">
        <span className="notif-row__top">
          <span className="notif-row__title">{notification.title}</span>
          <span className={`notif-type-badge notif-type-badge--${config.tone}`}>{config.label}</span>
        </span>
        {notification.message ? (
          <span className="notif-row__message">{notification.message}</span>
        ) : null}
        <span className="notif-row__meta">
          <time dateTime={notification.createdAt} title={formatFullTime(notification.createdAt)}>
            {formatRelativeTime(notification.createdAt)}
          </time>
        </span>
      </span>

      <span className="notif-row__aside">
        {isUnread ? <span className="notif-row__dot" aria-label="No leída" /> : null}
        <ChevronRight size={16} className="notif-row__chevron" aria-hidden="true" />
      </span>
    </button>
  );
}
