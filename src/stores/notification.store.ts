"use client";

import { create } from "zustand";
import type { Notification } from "@/types";

interface NotificationState {
  unreadCount: number;
  preview: Notification[];
  setUnreadCount: (count: number) => void;
  setPreview: (items: Notification[]) => void;
  prepend: (item: Notification) => void;
  markReadLocal: (id: string) => void;
  markAllReadLocal: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  preview: [],
  setUnreadCount: (count) => set({ unreadCount: count }),
  setPreview: (items) => set({ preview: items }),
  prepend: (item) =>
    set((state) => ({
      preview: [item, ...state.preview.filter((n) => n.id !== item.id)].slice(0, 20),
      unreadCount: item.readAt ? state.unreadCount : state.unreadCount + 1,
    })),
  markReadLocal: (id) =>
    set((state) => {
      const target = state.preview.find((n) => n.id === id);
      const wasUnread = target && !target.readAt;
      return {
        preview: state.preview.map((n) =>
          n.id === id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n
        ),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    }),
  markAllReadLocal: () =>
    set((state) => ({
      preview: state.preview.map((n) => ({
        ...n,
        readAt: n.readAt || new Date().toISOString(),
      })),
      unreadCount: 0,
    })),
}));
