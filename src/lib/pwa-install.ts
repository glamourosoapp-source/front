"use client";

/**
 * Instalación de la caja como app del escritorio.
 *
 * Chrome dispara `beforeinstallprompt` **una sola vez y temprano**, así que el
 * evento se guarda en un singleton de módulo y no en estado de React: la caja y
 * `/pos/configuracion` se navegan del lado del cliente, y si cada pantalla
 * montara su propio listener la segunda nunca vería el evento.
 *
 * Requisitos del navegador para que llegue: manifiesto con iconos PNG, service
 * worker con handler de `fetch` y origen seguro (HTTPS o localhost). El SW solo
 * se registra en producción, así que **en desarrollo no llega nunca** y la UI
 * cae a las instrucciones manuales. No es un bug.
 */

/** Lo que Chrome entrega en `beforeinstallprompt`; no está en los tipos del DOM. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Listener = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let capturing = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Dónde deja el sistema la app instalada. */
export type InstallTarget = "escritorio" | "Dock";

/**
 * Windows deja el acceso directo en el escritorio; macOS la pone en Launchpad y
 * se fija al Dock. No es solo la palabra: los pasos manuales también cambian
 * (en Mac, Safari instala con "Archivo → Agregar al Dock"), y decirle a alguien
 * que busque en el escritorio de una Mac lo manda a buscar donde no está.
 */
export function installTarget(): InstallTarget {
  if (typeof navigator === "undefined") return "escritorio";
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "Dock" : "escritorio";
}

/** La caja ya corre en su propia ventana (instalada), no en una pestaña. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: window-controls-overlay)").matches ||
    // Safari en iOS/iPadOS.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Arranca la captura del evento. Idempotente: llamarla en cada layout es seguro. */
export function startCapturingInstallPrompt(): void {
  if (typeof window === "undefined" || capturing) return;
  capturing = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Sin `preventDefault` Chrome muestra su propio mini-infobar y el evento se
    // consume; con él, el botón de la caja es el único punto de entrada.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

export function canInstall(): boolean {
  return Boolean(deferredPrompt) && !installed;
}

export function alreadyInstalled(): boolean {
  return installed || isStandalone();
}

export function subscribeToInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Abre el diálogo de instalación de Chrome. Devuelve si el usuario aceptó.
 *
 * El evento es de un solo uso: si lo rechazan hay que esperar a que Chrome lo
 * vuelva a ofrecer (recargar la pestaña), y por eso se limpia al terminar.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferredPrompt;
  if (!event) return "unavailable";
  deferredPrompt = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") {
    installed = true;
    emit();
  }
  return outcome;
}
