"use client";

import { create } from "zustand";
import { httpClient } from "@/services/http-client";
import { useNotificationStore } from "@/stores/notification.store";
import {
  activeSpace,
  clearSession,
  landsOnSupervisorApp,
  readSession,
  writeSession,
  writeSessionUser,
  type SessionSpace,
} from "@/lib/session";
import { User } from "@/types";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** Llave donde vive la sesión de esta pantalla: la principal o la del supervisor (ver `lib/session.ts`). */
  space: SessionSpace;
  /**
   * `space` fuerza dónde se guarda (el login de la app del supervisor); sin él,
   * el supervisor de caja va a su llave y el resto a la principal.
   */
  login: (email: string, password: string, options?: { space?: SessionSpace }) => Promise<boolean>;
  register: (payload: { name: string; email: string; password: string; organizationName?: string }) => Promise<boolean>;
  hydrate: () => void;
  applySession: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  space: "main",
  login: async (email, password, options) => {
    const response = await httpClient.post<{ token: string; user: User }>("/auth/login", { email, password });
    // El supervisor de caja nunca pisa la sesión principal: en la PC de la
    // tienda esa es la del cajero.
    const space = options?.space ?? (landsOnSupervisorApp(response.user) ? "supervisor" : "main");
    writeSession(space, response.token, response.user);
    set({ token: response.token, user: response.user, isAuthenticated: true, space });
    return true;
  },
  register: async (payload) => {
    const response = await httpClient.post<{ token: string; user: User }>("/auth/register", payload);
    writeSession("main", response.token, response.user);
    set({ token: response.token, user: response.user, isAuthenticated: true, space: "main" });
    return true;
  },
  hydrate: () => {
    const space = activeSpace();
    const session = readSession(space);
    if (session) {
      set({ token: session.token, user: session.user as unknown as User, isAuthenticated: true, space });
      // Refresca usuario + perfil/permisos desde el back (por si cambiaron).
      httpClient
        .get<User>("/auth/me")
        .then((fresh) => {
          writeSessionUser(space, fresh);
          set({ user: fresh });
        })
        .catch(() => undefined);
    } else {
      // Sin sesión en esta llave: nada en memoria (una pestaña que venía de la
      // caja no debe entrar a /supervisor con el usuario del cajero).
      set({ space, token: null, user: null, isAuthenticated: false });
    }
  },
  // El back devuelve token + usuario frescos tras cambiar la contraseña.
  applySession: (token, user) => {
    const space = get().space;
    writeSession(space, token, user);
    set({ token, user, isAuthenticated: true });
  },
  logout: () => {
    // Solo la sesión de esta pantalla: salir del supervisor no cierra la caja.
    clearSession(get().space);
    set({ token: null, user: null, isAuthenticated: false });
    // Estado en memoria del usuario anterior: no debe verlo el siguiente login.
    useNotificationStore.getState().reset();
  },
}));
