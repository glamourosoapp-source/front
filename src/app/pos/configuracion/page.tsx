"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, FormControlLabel, MenuItem, Switch, TextField } from "@mui/material";
import { ArrowLeft, Check, MonitorDown, Printer, RefreshCw } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import {
  detectPrintAgent,
  listPrinters,
  loadPrintAgentConfig,
  printRaw,
  savePrintAgentConfig,
  type PrintAgentConfig,
  type PrinterInfo,
} from "@/lib/print/print-agent-client";
import { buildTicketEscPos } from "@/lib/print/escpos";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { DEFAULT_TICKET_SETTINGS } from "@glamouroso/shared";
import type { PosSale, PosSession } from "@/types";
import { toast } from "sonner";

/** Ticket de prueba: mismo formato que el real, con datos de muestra. */
function sampleSale(session: PosSession | null): PosSale {
  return {
    id: "sample",
    branchId: session?.branch.id ?? "",
    branch: session?.branch,
    ticketNumber: `${session?.branch.code ?? "SUC"}-PRUEBA-0001`,
    cashierUserId: session?.cashier.id ?? "",
    cashier: session?.cashier,
    status: "completed",
    subtotal: 258,
    discount: 0,
    total: 258,
    paymentMethod: "cash",
    amountTendered: 300,
    changeAmount: 42,
    itemsCount: 26,
    soldAt: new Date().toISOString(),
    items: [
      {
        id: "s1",
        saleId: "sample",
        productName: "Mas Color (litro)",
        saleUnit: "liter",
        quantity: 25,
        unitPrice: 16,
        priceTier: "retail",
        total: 258,
        pricingBreakdown: { bidones: 1, restLiters: 5, bidonPrice: 178, literPrice: 16 },
      },
      {
        id: "s2",
        saleId: "sample",
        productName: "Escoba de plástico",
        saleUnit: "piece",
        quantity: 1,
        unitPrice: 45,
        priceTier: "retail",
        total: 45,
      },
    ],
  } as PosSale;
}

/**
 * Configuración de impresión de ESTA caja.
 *
 * Se guarda en `localStorage` de la PC, no en el servidor: cada sucursal tiene
 * su propia impresora USB y el agente corre en la misma máquina.
 */
export default function PosPrintSettingsPage() {
  const [config, setConfig] = useState<PrintAgentConfig>(loadPrintAgentConfig());
  const [status, setStatus] = useState<{ online: boolean; version?: string; hostname?: string; error?: string }>({
    online: false,
  });
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [session, setSession] = useState<PosSession | null>(null);
  const [checking, setChecking] = useState(false);
  const pwa = usePwaInstall();

  const refresh = useCallback(
    async (next: PrintAgentConfig) => {
      setChecking(true);
      const detected = await detectPrintAgent(next);
      setStatus(detected);
      if (detected.online) {
        try {
          setPrinters(await listPrinters(next));
        } catch (error) {
          toast.error(getApiErrorMessage(error, "El agente no devolvió la lista de impresoras"));
        }
      } else {
        setPrinters([]);
      }
      setChecking(false);
    },
    []
  );

  useEffect(() => {
    void refresh(config);
    httpClient
      .get<PosSession>("/pos/session")
      .then(setSession)
      .catch(() => setSession(null));
    // Solo al montar: después se refresca con el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(patch: Partial<PrintAgentConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    savePrintAgentConfig(next);
  }

  async function testPrint() {
    const settings = session?.ticketSettings ?? DEFAULT_TICKET_SETTINGS;
    try {
      await printRaw(config, buildTicketEscPos(sampleSale(session), settings));
      toast.success("Ticket de prueba enviado a la impresora");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo imprimir la prueba"));
    }
  }

  const settings = session?.ticketSettings ?? DEFAULT_TICKET_SETTINGS;

  return (
    <main style={{ padding: 24, maxWidth: 860, margin: "0 auto", overflow: "auto", height: "100vh" }}>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Impresión de tickets</h1>
          <p className="page-kicker">
            Elige a qué impresora de esta computadora salen los tickets. La configuración es local:
            cada caja tiene la suya.
          </p>
        </div>
        <Link href="/pos" className="pos-action" style={{ textDecoration: "none" }}>
          <ArrowLeft size={14} /> Volver a la caja
        </Link>
      </div>

      {status.online ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          Agente detectado en {config.baseUrl} · versión {status.version} · equipo {status.hostname}
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No se detectó el agente de impresión en {config.baseUrl}. Sin él, cobrar con F1 abre el
          diálogo de impresión del navegador y el ticket sale igual, con un toque extra.
          {status.error ? <div style={{ marginTop: 6, fontSize: 12 }}>{status.error}</div> : null}
        </Alert>
      )}

      <div className="panel p-5">
        <div className="form-grid">
          <TextField
            label="Dirección del agente"
            value={config.baseUrl}
            onChange={(event) => update({ baseUrl: event.target.value })}
            fullWidth
            helperText="Por defecto http://127.0.0.1:9377"
          />
          <TextField
            label="Token de emparejamiento"
            value={config.token}
            onChange={(event) => update({ token: event.target.value })}
            fullWidth
            helperText="Lo muestra la ventana del agente la primera vez que corre."
          />
          <TextField
            select
            label="Impresora"
            value={config.printerName ?? ""}
            onChange={(event) => update({ printerName: event.target.value || null })}
            fullWidth
            disabled={!printers.length}
            helperText={
              printers.length
                ? "Impresoras instaladas en esta computadora."
                : "Se llena cuando el agente responde."
            }
          >
            <MenuItem value="">Sin elegir</MenuItem>
            {printers.map((printer) => (
              <MenuItem key={printer.name} value={printer.name}>
                {printer.name}
                {printer.isDefault ? " (predeterminada)" : ""}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={config.autoPrint}
                onChange={(event) => update({ autoPrint: event.target.checked })}
              />
            }
            label="Imprimir automáticamente al cobrar"
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshCw size={16} />}
            onClick={() => void refresh(config)}
            disabled={checking}
          >
            {checking ? "Buscando..." : "Volver a detectar"}
          </Button>
          <Button
            variant="contained"
            startIcon={<Printer size={16} />}
            onClick={() => void testPrint()}
            disabled={!status.online || !config.printerName}
          >
            Imprimir prueba
          </Button>
        </div>
      </div>

      <div className="panel p-5" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Abrir la caja desde el {pwa.target}</h2>
        <p className="page-kicker">
          Instalada, la caja queda como cualquier programa de esta computadora: un icono con la G
          de Glamouroso en el {pwa.target}, y al abrirlo una ventana propia sin barra de
          direcciones ni pestañas. Se instala una vez por equipo, en Windows y en Mac.
        </p>

        {pwa.installed ? (
          <Alert severity="success" icon={<Check size={18} />}>
            Esta caja ya está instalada. Ábrela desde el icono de Glamouroso en el {pwa.target}.
          </Alert>
        ) : pwa.available ? (
          <Button
            variant="contained"
            startIcon={<MonitorDown size={16} />}
            onClick={() => {
              void pwa.install().then((outcome) => {
                if (outcome === "accepted") toast.success(`Caja instalada en el ${pwa.target}`);
                else if (outcome === "dismissed")
                  toast.info("Instalación cancelada. Puedes volver a intentarlo recargando.");
              });
            }}
          >
            Instalar en el {pwa.target}
          </Button>
        ) : pwa.target === "Dock" ? (
          <Alert severity="info">
            Este navegador todavía no ofrece la instalación. A mano: en <strong>Chrome</strong>,
            menú <strong>⋮ → Guardar y compartir → Instalar página como aplicación</strong>; en{" "}
            <strong>Safari</strong>, <strong>Archivo → Agregar al Dock</strong>. La app queda en
            Launchpad y se puede arrastrar al Dock.
          </Alert>
        ) : (
          <Alert severity="info">
            Chrome todavía no ofrece la instalación en esta computadora. Puedes instalarla a mano
            desde el menú <strong>⋮ → Guardar y compartir → Instalar página como aplicación</strong>
            {" "}(en versiones anteriores, <strong>⋮ → Más herramientas → Crear acceso directo</strong>,
            con &quot;Abrir como ventana&quot;). El icono queda en el escritorio.
          </Alert>
        )}

        {pwa.target === "Dock" ? null : (
          <p className="page-kicker" style={{ marginBottom: 0 }}>
            El instalador del agente de impresión también deja ese acceso directo, así que en una PC
            nueva no hace falta hacerlo a mano.
          </p>
        )}
      </div>

      <div className="panel p-5" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Ticket de esta sucursal</h2>
        <p className="page-kicker">
          El ancho, el encabezado y el mensaje final se editan desde el panel, en Sucursales. Aquí
          solo se elige la impresora.
        </p>
        <ul style={{ color: "var(--muted)", fontSize: 14 }}>
          <li>Ancho de papel: {settings.paperWidthMm} mm</li>
          <li>
            Encabezado: {settings.headerLines.length ? settings.headerLines.join(" · ") : "sin líneas"}
          </li>
          <li>Mensaje final: {settings.footerMessage || "sin mensaje"}</li>
        </ul>
      </div>
    </main>
  );
}
