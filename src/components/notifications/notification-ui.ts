import {
  Megaphone,
  MessageCircle,
  PackageCheck,
  type LucideIcon,
} from "lucide-react";
import { NOTIFICATION_TYPES } from "@glamouroso/shared/constants";
import { NOTIFICATION_ENTITY_TYPES } from "@glamouroso/shared/constants";
import type { Notification } from "@/types";

export interface NotificationTypeConfig {
  label: string;
  icon: LucideIcon;
  tone: "handoff" | "order" | "order-update" | "campaign";
}

export function getNotificationTypeConfig(type: string): NotificationTypeConfig {
  switch (type) {
    case NOTIFICATION_TYPES.CONVERSATION_HANDOFF:
      return { label: "Handoff", icon: MessageCircle, tone: "handoff" };
    case NOTIFICATION_TYPES.ORDER_CREATED:
      return { label: "Pedido nuevo", icon: PackageCheck, tone: "order" };
    case NOTIFICATION_TYPES.ORDER_STATUS_CHANGED:
      return { label: "Pedido actualizado", icon: PackageCheck, tone: "order-update" };
    case NOTIFICATION_TYPES.CAMPAIGN_COMPLETED:
      return { label: "Campaña", icon: Megaphone, tone: "campaign" };
    default:
      return { label: "Aviso", icon: MessageCircle, tone: "handoff" };
  }
}

export function hrefForNotification(n: Notification): string {
  if (n.entityType === NOTIFICATION_ENTITY_TYPES.ORDER) {
    return `/dashboard/orders/${n.entityId}`;
  }
  if (n.entityType === NOTIFICATION_ENTITY_TYPES.CONVERSATION) {
    return `/dashboard/conversations`;
  }
  return "/dashboard/outreach";
}

export function formatRelativeTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  const rtf = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });

  if (absSec < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 7) return rtf.format(diffDay, "day");

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatFullTime(value?: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
