"use client";

import { can, resolvePermissions } from "@glamouroso/shared";
import type { PermissionMap } from "@glamouroso/shared";

/**
 * Sesiones por app en el mismo navegador.
 *
 * La caja y el panel guardan su sesión en `localStorage` (`token`/`user`), una
 * por navegador: la caja instalada y cualquier pestaña de `glamouroso.app`
 * comparten esa llave. Si la supervisora entraba con su usuario en la PC de la
 * tienda, desplazaba la sesión del cajero y la caja quedaba con la suya.
 *
 * Por eso la app del supervisor (`/supervisor`) guarda su sesión aparte
 * (`supervisor.token`/`supervisor.user`). En la misma PC conviven la caja
 * abierta con el cajero y una pestaña con la supervisora; salir de una no
 * cierra la otra. La sesión principal no cambia de llave: la caja no se toca.
 */
export type SessionSpace = "main" | "supervisor";

const KEYS: Record<SessionSpace, { token: string; user: string }> = {
  main: { token: "token", user: "user" },
  supervisor: { token: "supervisor.token", user: "supervisor.user" },
};

type StoredUser = { role?: string | null; profile?: { permissions?: PermissionMap | null } | null };

function permissionsOf(user: StoredUser | null | undefined): PermissionMap {
  return resolvePermissions(user?.role ?? undefined, user?.profile?.permissions ?? null);
}

/** La pantalla actual es de la app del supervisor (incluye su login, `/login?app=supervisor`). */
export function onSupervisorApp(): boolean {
  if (typeof window === "undefined") return false;
  const { pathname, search } = window.location;
  return pathname.startsWith("/supervisor") || (pathname === "/login" && new URLSearchParams(search).get("app") === "supervisor");
}

/** El usuario puede usar la app del supervisor (perfil Supervisor de caja, o admin). */
export function canUseSupervisorApp(user: StoredUser | null | undefined): boolean {
  return can(permissionsOf(user), "posSupervisor", "view");
}

/**
 * Aterriza en `/supervisor`: misma regla que `landingRouteFor` (sin panel, sin
 * caja, con la app del supervisor). Su sesión va a la llave del supervisor.
 */
export function landsOnSupervisorApp(user: StoredUser | null | undefined): boolean {
  const permissions = permissionsOf(user);
  const allows = (module: Parameters<typeof can>[1]) => can(permissions, module, "view");
  return !(allows("dashboard") || allows("orders")) && !allows("pos") && allows("posSupervisor");
}

export function readSession(space: SessionSpace): { token: string; user: StoredUser & Record<string, unknown> } | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(KEYS[space].token);
  const raw = window.localStorage.getItem(KEYS[space].user);
  if (!token || !raw) return null;
  try {
    return { token, user: JSON.parse(raw) };
  } catch {
    return null;
  }
}

export function writeSession(space: SessionSpace, token: string, user: unknown): void {
  window.localStorage.setItem(KEYS[space].token, token);
  window.localStorage.setItem(KEYS[space].user, JSON.stringify(user));
}

export function writeSessionUser(space: SessionSpace, user: unknown): void {
  window.localStorage.setItem(KEYS[space].user, JSON.stringify(user));
}

export function writeSessionToken(space: SessionSpace, token: string): void {
  window.localStorage.setItem(KEYS[space].token, token);
}

export function clearSession(space: SessionSpace): void {
  window.localStorage.removeItem(KEYS[space].token);
  window.localStorage.removeItem(KEYS[space].user);
}

/**
 * Qué sesión usa la pantalla actual. Fuera de `/supervisor`, siempre la
 * principal. En `/supervisor`, la propia del supervisor; si no hay, la
 * principal solo cuando ya puede usar la app (un admin, o un supervisor que
 * entró antes de separar las sesiones). La de un cajero no: ahí se pide entrar.
 */
export function activeSpace(): SessionSpace {
  if (!onSupervisorApp()) return "main";
  if (readSession("supervisor")) return "supervisor";
  const main = readSession("main");
  return main && canUseSupervisorApp(main.user) ? "main" : "supervisor";
}

/** Token con el que salen las peticiones de esta pantalla. */
export function activeToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEYS[activeSpace()].token);
}

/** Usuario guardado de la sesión de esta pantalla (para el encabezado de organización). */
export function activeUserRaw(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEYS[activeSpace()].user);
}

/** A dónde mandar a iniciar sesión desde esta pantalla. */
export function loginRoute(): string {
  return onSupervisorApp() ? "/login?app=supervisor" : "/login";
}
