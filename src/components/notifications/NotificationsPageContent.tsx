"use client";

import Link from "next/link";
import {
  Bell,
  BellOff,
  CheckCheck,
  Inbox,
  Megaphone,
  MessageCircle,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { NotificationListItem } from "./NotificationListItem";
import type { Notification } from "@/types";
import { NOTIFICATION_TYPES } from "@glamouroso/shared/constants";

interface NotificationsPageContentProps {
  items: Notification[];
  loading: boolean;
  filter: "all" | "unread";
  unreadCount: number;
  onFilterChange: (filter: "all" | "unread") => void;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  onOpenItem: (n: Notification) => void;
}

function countByType(items: Notification[], type: string) {
  return items.filter((n) => n.type === type).length;
}

function NotificationsSkeleton() {
  return (
    <div className="notif-skeleton-list" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="notif-skeleton-row">
          <div className="notif-skeleton-icon" />
          <div className="notif-skeleton-lines">
            <div className="notif-skeleton-line notif-skeleton-line--short" />
            <div className="notif-skeleton-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationsEmpty({ filter }: { filter: "all" | "unread" }) {
  return (
    <div className="notif-empty">
      <div className="notif-empty__icon-wrap">
        {filter === "unread" ? <BellOff size={32} /> : <Inbox size={32} />}
      </div>
      <h3>{filter === "unread" ? "Estás al día" : "Sin notificaciones aún"}</h3>
      <p>
        {filter === "unread"
          ? "No tienes avisos pendientes. Las nuevas derivaciones, pedidos y campañas aparecerán aquí."
          : "Cuando ocurra un handoff, un pedido nuevo o una campaña finalizada, lo verás en este centro."}
      </p>
      <div className="notif-empty__links">
        <Link href="/dashboard/conversations" className="notif-empty__link">
          <MessageCircle size={16} />
          Conversaciones
        </Link>
        <Link href="/dashboard/orders" className="notif-empty__link">
          <PackageCheck size={16} />
          Pedidos
        </Link>
        <Link href="/dashboard/outreach" className="notif-empty__link">
          <Megaphone size={16} />
          Campañas
        </Link>
      </div>
    </div>
  );
}

export function NotificationsPageContent({
  items,
  loading,
  filter,
  unreadCount,
  onFilterChange,
  onRefresh,
  onMarkAllRead,
  onOpenItem,
}: NotificationsPageContentProps) {
  const handoffs = countByType(items, NOTIFICATION_TYPES.CONVERSATION_HANDOFF);
  const orders =
    countByType(items, NOTIFICATION_TYPES.ORDER_CREATED) +
    countByType(items, NOTIFICATION_TYPES.ORDER_STATUS_CHANGED);
  const campaigns = countByType(items, NOTIFICATION_TYPES.CAMPAIGN_COMPLETED);

  return (
    <div className="notifications-page">
      <header className="notifications-page__hero">
        <div className="notifications-page__hero-text">
          <p className="notifications-page__kicker">
            <Bell size={14} />
            Centro de notificaciones
          </p>
          <h1 className="page-title">Notificaciones</h1>
          <p className="page-kicker">
            Handoffs, pedidos y campañas en un solo lugar. Los avisos nuevos también aparecen en la
            campana del menú superior.
          </p>
        </div>
        <div className="notifications-page__hero-actions">
          <button
            type="button"
            className="notif-btn notif-btn--ghost"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Actualizar"
          >
            <RefreshCw size={16} className={loading ? "notif-spin" : undefined} />
            Actualizar
          </button>
          <button
            type="button"
            className="notif-btn notif-btn--primary"
            onClick={onMarkAllRead}
            disabled={loading || unreadCount === 0}
          >
            <CheckCheck size={16} />
            Marcar todas leídas
          </button>
        </div>
      </header>

      <section className="grid grid-4 notifications-page__stats">
        <div className="card metric notif-stat">
          <span>No leídas</span>
          <strong>{unreadCount}</strong>
          <small>Requieren tu atención</small>
        </div>
        <div className="card metric notif-stat">
          <span>En esta vista</span>
          <strong>{loading ? "—" : items.length}</strong>
          <small>{filter === "unread" ? "Solo pendientes" : "Últimas 50"}</small>
        </div>
        <div className="card metric notif-stat">
          <span>Handoffs</span>
          <strong>{loading ? "—" : handoffs}</strong>
          <small>En el listado actual</small>
        </div>
        <div className="card metric notif-stat">
          <span>Pedidos y campañas</span>
          <strong>{loading ? "—" : orders + campaigns}</strong>
          <small>Operación y envíos</small>
        </div>
      </section>

      <section className="panel notifications-page__panel">
        <div className="notifications-page__toolbar">
          <div className="notif-segmented" role="tablist" aria-label="Filtrar notificaciones">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              className={filter === "all" ? "notif-segmented__btn active" : "notif-segmented__btn"}
              onClick={() => onFilterChange("all")}
            >
              Todas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "unread"}
              className={filter === "unread" ? "notif-segmented__btn active" : "notif-segmented__btn"}
              onClick={() => onFilterChange("unread")}
            >
              No leídas
              {unreadCount > 0 ? (
                <span className="notif-segmented__count">{unreadCount}</span>
              ) : null}
            </button>
          </div>
          <p className="notifications-page__toolbar-hint">
            Haz clic en un aviso para ir al detalle y marcarlo como leído.
          </p>
        </div>

        <div className="notifications-page__list">
          {loading ? (
            <NotificationsSkeleton />
          ) : items.length === 0 ? (
            <NotificationsEmpty filter={filter} />
          ) : (
            items.map((n) => (
              <NotificationListItem
                key={n.id}
                notification={n}
                onClick={() => onOpenItem(n)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
