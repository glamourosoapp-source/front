"use client";

import { create } from "zustand";
import { httpClient } from "@/services/http-client";
import { User } from "@/types";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (payload: { name: string; email: string; password: string; organizationName?: string }) => Promise<boolean>;
  hydrate: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  login: async (email, password) => {
    const response = await httpClient.post<{ token: string; user: User }>("/auth/login", { email, password });
    localStorage.setItem("token", response.token);
    localStorage.setItem("user", JSON.stringify(response.user));
    set({ token: response.token, user: response.user, isAuthenticated: true });
    return true;
  },
  register: async (payload) => {
    const response = await httpClient.post<{ token: string; user: User }>("/auth/register", payload);
    localStorage.setItem("token", response.token);
    localStorage.setItem("user", JSON.stringify(response.user));
    set({ token: response.token, user: response.user, isAuthenticated: true });
    return true;
  },
  hydrate: () => {
    const token = localStorage.getItem("token");
    const raw = localStorage.getItem("user");
    if (token && raw) set({ token, user: JSON.parse(raw), isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
