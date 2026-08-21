"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from "@mui/material";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { OrderNote, type PrintableOrder } from "@/components/orders/OrderPrintSheet";
import { downloadBlob, nodeToPngBlob } from "@/lib/node-to-image";
import { toast } from "sonner";

// Ancho de hoja carta a 96dpi (8.5in) con el mismo padding que .print-only:
// lo que se ve aquí es lo que sale al imprimir.
const SHEET_WIDTH = 816;
const SHEET_PADDING = 24;

interface OrderNotePreviewDialogProps {
  open: boolean;
  orders: PrintableOrder[];
  onClose: () => void;
}

/**
 * Vista previa de la nota de remisión: la MISMA nota que se imprime, pero en
 * pantalla y descargable como PNG.
 *
 * No toca el server: no llama a POST /orders/print, así que NO marca el pedido
 * como impreso ni pinta la fila del listado. Es solo mirar.
 */
export function OrderNotePreviewDialog({ open, orders, onClose }: OrderNotePreviewDialogProps) {
  const [index, setIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  // La hoja siempre mide 816px (carta) y se encoge con transform para caber en
  // el diálogo: así se ve completa sin scroll horizontal y la captura sigue
  // saliendo a tamaño real (nodeToPngBlob mide con offsetWidth, sin transform).
  const [scale, setScale] = useState(1);
  const [sheetHeight, setSheetHeight] = useState(0);

  // Cada vez que se abre con otro lote se arranca en la primera nota.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open, orders]);

  const total = orders.length;
  const order = orders[Math.min(index, Math.max(0, total - 1))];

  // La hoja se mide con callback refs y no con un useEffect: el contenido del
  // Dialog se monta DESPUÉS del primer commit (transición de MUI), así que en
  // un efecto los refs todavía vienen en null y la escala se quedaba en 1.
  const measure = useCallback(() => {
    const area = areaRef.current;
    const sheet = sheetRef.current;
    if (!area || !sheet) return;
    setScale(Math.min(1, area.clientWidth / SHEET_WIDTH));
    setSheetHeight(sheet.offsetHeight);
  }, []);

  const attach = useCallback(
    (target: "area" | "sheet") => (node: HTMLDivElement | null) => {
      if (target === "area") areaRef.current = node;
      else sheetRef.current = node;
      const observer =
        observerRef.current ?? (observerRef.current = new ResizeObserver(() => measure()));
      observer.disconnect();
      if (areaRef.current) observer.observe(areaRef.current);
      if (sheetRef.current) observer.observe(sheetRef.current);
      measure();
    },
    [measure]
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  async function handleDownload() {
    const node = sheetRef.current;
    if (!node || !order) return;
    setDownloading(true);
    try {
      const blob = await nodeToPngBlob(node, { scale: 2 });
      downloadBlob(blob, `nota-${order.orderNumber || "pedido"}.png`);
    } catch {
      toast.error("No se pudo generar la imagen de la nota.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          fontWeight: 700,
          color: "var(--glam-navy)",
        }}
      >
        <span>
          Vista previa de la nota
          {total > 1 ? ` · ${index + 1} de ${total}` : ""}
        </span>
        <IconButton onClick={onClose} size="small" aria-label="Cerrar vista previa">
          <X size={18} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ background: "#eef1f6" }}>
        <p className="page-kicker" style={{ marginBottom: 12 }}>
          Así se ve la nota al imprimir. Esta vista no marca el pedido como impreso.
        </p>
        {order ? (
          <div ref={attach("area")} style={{ width: "100%" }}>
            <div
              style={{
                width: SHEET_WIDTH * scale,
                height: sheetHeight ? sheetHeight * scale : undefined,
                margin: "0 auto",
                overflow: "hidden",
                boxShadow: "0 1px 6px rgba(15, 23, 42, 0.18)",
              }}
            >
              {/* Este es el nodo que se captura: sin sombra ni escala propias
                  para que el PNG salga igual que la hoja impresa. */}
              <div
                ref={attach("sheet")}
                style={{
                  width: SHEET_WIDTH,
                  padding: SHEET_PADDING,
                  background: "#fff",
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                <OrderNote order={order} />
              </div>
            </div>
          </div>
        ) : (
          <p className="page-kicker">No hay pedidos para previsualizar.</p>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, py: 2 }}>
        <div className="flex items-center gap-2">
          {total > 1 ? (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ChevronLeft size={16} />}
                disabled={index === 0}
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
              >
                Anterior
              </Button>
              <Button
                size="small"
                variant="outlined"
                endIcon={<ChevronRight size={16} />}
                disabled={index >= total - 1}
                onClick={() => setIndex((value) => Math.min(total - 1, value + 1))}
              >
                Siguiente
              </Button>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onClose}>Cerrar</Button>
          <Button
            variant="contained"
            startIcon={<Download size={16} />}
            disabled={!order || downloading}
            onClick={() => void handleDownload()}
          >
            {downloading ? "Generando..." : "Descargar imagen"}
          </Button>
        </div>
      </DialogActions>
    </Dialog>
  );
}
