"use client";

import type { PrintAgentConfig } from "@/lib/print/print-agent-client";
import type { FolioCounter, OfflineMeta, OutboxEntry } from "./store";

/**
 * Respaldo de la cola en el Conector de impresión.
 *
 * El conector ya corre en la PC de cada sucursal para imprimir, así que es el
 * único lugar fuera del navegador donde la caja puede dejar una copia. Cubre el
 * accidente más probable: alguien "limpia" Chrome y se lleva IndexedDB con
 * ventas cobradas dentro.
 *
 * El conector NO sube nada al servidor: no tiene credenciales y no se las vamos a
 * dar. Es un espejo para restaurar, nada más (decisión del negocio: subir desde
 * el conector se evalúa después del piloto).
 */

const TIMEOUT_MS = 4000;

export interface PosBackup {
  outbox: OutboxEntry[];
  counter: FolioCounter | null;
  meta: OfflineMeta | null;
  savedAt: string;
}

async function request(
  config: PrintAgentConfig,
  path: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${config.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
        ...(init.headers ?? {}),
      },
    });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Deja una copia en el conector. Es best-effort a propósito: si el conector no está
 * corriendo, la caja **no** debe dejar de cobrar por eso.
 */
export async function pushBackup(
  config: PrintAgentConfig,
  backup: Omit<PosBackup, "savedAt">
): Promise<boolean> {
  if (!config.token) return false;
  try {
    const response = await request(config, "/pos/backup", {
      method: "PUT",
      body: JSON.stringify({ ...backup, savedAt: new Date().toISOString() }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Lee el respaldo del conector. Se usa solo cuando la base local aparece vacía. */
export async function pullBackup(config: PrintAgentConfig): Promise<PosBackup | null> {
  if (!config.token) return null;
  try {
    const response = await request(config, "/pos/backup", { method: "GET" });
    if (!response.ok) return null;
    const data = (await response.json()) as PosBackup;
    return data?.outbox ? data : null;
  } catch {
    return null;
  }
}
