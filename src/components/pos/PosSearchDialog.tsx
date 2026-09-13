"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { Droplets } from "lucide-react";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import type { PosCatalog, PosCatalogLine, PosCatalogProduct } from "@/types";

interface PosSearchDialogProps {
  open: boolean;
  catalog: PosCatalog | null;
  /** Solo consulta de existencia: no agrega nada al ticket (F3). */
  readOnly?: boolean;
  /**
   * Muestra la columna Existencia. Apagada para el cajero: el inventario es
   * información de la empresa y el servidor tampoco se lo manda.
   */
  showStock?: boolean;
  /**
   * Lo que el cajero ya había escrito en el campo de código. Si teclea un
   * nombre y presiona Enter, el buscador abre con esa búsqueda hecha en vez de
   * pedirle que la escriba otra vez.
   */
  initialTerm?: string;
  onClose: () => void;
  onPickProduct: (product: PosCatalogProduct) => void;
  onPickLine: (line: PosCatalogLine) => void;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Búsqueda por nombre (F10) y consulta de existencia (F3).
 *
 * Sin imágenes de producto: el catálogo de Glamouroso no las tiene y el cajero
 * lee más rápido una lista de texto con precio y existencia.
 */
export function PosSearchDialog({
  open,
  catalog,
  readOnly = false,
  showStock = false,
  initialTerm = "",
  onClose,
  onPickProduct,
  onPickLine,
}: PosSearchDialogProps) {
  const [term, setTerm] = useState(initialTerm);

  useEffect(() => {
    if (open) setTerm(initialTerm);
  }, [open, initialTerm]);

  const results = useMemo(() => {
    const needle = normalize(term).trim();
    if (!needle || !catalog) return { products: [], lines: [] };
    const matches = (value: string | null | undefined) => normalize(value).includes(needle);
    return {
      products: catalog.products
        .filter((p) => matches(p.name) || matches(p.sku) || matches(p.barcode))
        .slice(0, 60),
      lines: catalog.lines.filter((l) => l.canSellByLiter && matches(l.name)).slice(0, 20),
    };
  }, [term, catalog]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{readOnly ? "Consultar existencia" : "Buscar producto"}</DialogTitle>
      <DialogContent dividers>
        <TextField
          label="Nombre, código o marca"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          autoFocus
          fullWidth
          helperText={
            readOnly
              ? "Solo consulta: no agrega nada al ticket."
              : "Elige una fila para agregarla. Las líneas de líquidos se venden por litro."
          }
        />

        {results.lines.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <p className="page-kicker" style={{ margin: "0 0 6px" }}>
              Líneas por litro
            </p>
            <div className="pos-dialog-table">
            <table className="pos-grid">
              <tbody>
                {results.lines.map((line) => (
                  <tr
                    key={line.id}
                    onClick={() => {
                      if (readOnly) return;
                      onPickLine(line);
                      onClose();
                    }}
                  >
                    <td>
                      <Droplets size={14} style={{ color: "var(--glam-blue)", marginRight: 6 }} />
                      <strong>{line.name}</strong> · por litro
                    </td>
                    <td className="num">{formatMoney(line.literPrice)} / L</td>
                    <td className="num">{formatMoney(line.bidonPrice)} / bidón</td>
                    {showStock ? (
                      <td className={`num ${Number(line.stockLiters) < 0 ? "stock-negative" : ""}`}>
                        {formatQuantity(line.stockLiters ?? 0)} L
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ) : null}

        {results.products.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <p className="page-kicker" style={{ margin: "0 0 6px" }}>
              Productos
            </p>
            <div className="pos-dialog-table">
            <table className="pos-grid">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: "right" }}>Precio</th>
                  <th style={{ textAlign: "right" }}>Mayoreo</th>
                  {showStock ? <th style={{ textAlign: "right" }}>Existencia</th> : null}
                </tr>
              </thead>
              <tbody>
                {results.products.map((product) => (
                  <tr
                    key={product.id}
                    onClick={() => {
                      if (readOnly) return;
                      onPickProduct(product);
                      onClose();
                    }}
                  >
                    <td className="code">{product.barcode || product.sku || product.posId || "—"}</td>
                    <td>
                      {product.name}
                      {product.lineId ? (
                        <Chip
                          label="líquido por litro"
                          size="small"
                          sx={{ ml: 1, height: 18, fontSize: 10 }}
                        />
                      ) : null}
                    </td>
                    <td className="num">{formatMoney(product.price)}</td>
                    <td className="num">
                      {product.wholesalePrice ? formatMoney(product.wholesalePrice) : "—"}
                    </td>
                    {showStock ? (
                      <td className={`num ${Number(product.stock) < 0 ? "stock-negative" : ""}`}>
                        {formatQuantity(product.stock ?? 0)} {product.lineId ? "L" : "pz"}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ) : null}

        {term && !results.products.length && !results.lines.length ? (
          <p className="pos-empty">Sin resultados para “{term}”.</p>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar (ESC)</Button>
      </DialogActions>
    </Dialog>
  );
}
