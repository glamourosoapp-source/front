"use client";

import { useCallback, useState } from "react";
import type { FactoryForm } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { exportFactoryFormPdf } from "@/lib/export-factory-form";
import { toast } from "sonner";

/**
 * Botón "Descargar formato": pide el `FactoryForm` al Back (`GET .../form`) y
 * lo baja como PDF. `key` distingue qué botón está generando cuando hay varios
 * en la misma pantalla (una tarjeta por pedido).
 *
 * `printedUrl` (el formato de un pedido): avisa al Back que se imprimió, porque
 * desde ahí el pedido ya no se puede cancelar; `onPrinted` refresca la vista.
 */
export function useFactoryFormDownload() {
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const download = useCallback(
    async (url: string, key: string = url, printed?: { printedUrl: string; onPrinted?: () => void }) => {
      setDownloadingKey(key);
      try {
        const form = await httpClient.get<FactoryForm>(url);
        await exportFactoryFormPdf(form);
        if (printed) {
          await markFormPrinted(printed.printedUrl);
          printed.onPrinted?.();
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, "No se pudo generar el formato de pedido"));
      } finally {
        setDownloadingKey((current) => (current === key ? null : current));
      }
    },
    []
  );

  const isDownloading = useCallback((key: string) => downloadingKey === key, [downloadingKey]);

  return { download, isDownloading, downloading: downloadingKey !== null };
}

/** Avisa al Back que el formato de un pedido se imprimió; si falla, el PDF ya salió y no se estorba. */
export async function markFormPrinted(printedUrl: string): Promise<void> {
  try {
    await httpClient.post(printedUrl, {});
  } catch {
    /* best-effort */
  }
}
