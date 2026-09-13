"use client";

/**
 * Cliente del agente de impresión local.
 *
 * El agente es un ejecutable que corre en la PC de la sucursal y escucha solo en
 * loopback (`127.0.0.1`). Chrome permite `fetch` a loopback desde una página
 * https sin marcarlo como contenido mixto, así que el POS puede listar las
 * impresoras del equipo e imprimir el ticket sin diálogo.
 *
 * La configuración (URL, token y impresora elegida) vive en `localStorage` de
 * ESA PC: cada caja imprime en su propia impresora.
 */

const STORAGE_KEY = "pos.printAgent";
const DEFAULT_URL = "http://127.0.0.1:9377";
const TIMEOUT_MS = 4000;

export interface PrintAgentConfig {
  baseUrl: string;
  token: string;
  printerName: string | null;
  /** Si está apagado, el cobro no manda nada al agente (F1 imprime por diálogo). */
  autoPrint: boolean;
}

export interface PrinterInfo {
  name: string;
  isDefault?: boolean;
  status?: string;
  portName?: string;
}

export const DEFAULT_PRINT_AGENT_CONFIG: PrintAgentConfig = {
  baseUrl: DEFAULT_URL,
  token: "",
  printerName: null,
  autoPrint: true,
};

export function loadPrintAgentConfig(): PrintAgentConfig {
  if (typeof window === "undefined") return DEFAULT_PRINT_AGENT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRINT_AGENT_CONFIG;
    return { ...DEFAULT_PRINT_AGENT_CONFIG, ...(JSON.parse(raw) as Partial<PrintAgentConfig>) };
  } catch {
    return DEFAULT_PRINT_AGENT_CONFIG;
  }
}

export function savePrintAgentConfig(config: PrintAgentConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* modo privado: la caja sigue imprimiendo por diálogo */
  }
}

async function request<T>(
  config: PrintAgentConfig,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || `El agente respondió ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** ¿Hay agente escuchando? Se usa para pintar el estado en la barra de la caja. */
export async function detectPrintAgent(
  config: PrintAgentConfig
): Promise<{ online: boolean; version?: string; hostname?: string; error?: string }> {
  try {
    const health = await request<{ name: string; version: string; hostname: string }>(
      config,
      "/health"
    );
    return { online: true, version: health.version, hostname: health.hostname };
  } catch (error) {
    return { online: false, error: (error as Error).message };
  }
}

export async function listPrinters(config: PrintAgentConfig): Promise<PrinterInfo[]> {
  const result = await request<{ printers: PrinterInfo[] }>(config, "/printers");
  return result.printers ?? [];
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function printRaw(config: PrintAgentConfig, bytes: Uint8Array): Promise<void> {
  if (!config.printerName) throw new Error("No hay impresora elegida en esta caja");
  await request(config, "/print", {
    method: "POST",
    body: JSON.stringify({ printerName: config.printerName, dataBase64: toBase64(bytes) }),
  });
}
