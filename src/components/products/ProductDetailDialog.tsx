"use client";

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from "@mui/material";
import { Product } from "@/types";

interface ProductDetailDialogProps {
  product: Product | null;
  loading?: boolean;
  open: boolean;
  onClose: () => void;
  onEdit?: (product: Product) => void;
}

function formatMoney(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "—";
  return `$${Number(value).toFixed(2)}`;
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "number") return true;
  return String(value).trim().length > 0;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="product-detail-field">
      <span className="product-detail-label">{label}</span>
      <div className="product-detail-value">{value}</div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="product-detail-section">
      <Typography variant="overline" sx={{ color: "var(--glam-muted)", fontWeight: 800, letterSpacing: 1.2 }}>
        {title}
      </Typography>
      <div className="product-detail-section-grid">{children}</div>
    </section>
  );
}

function PriceCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="product-price-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ProductDetailDialog({ product, loading, open, onClose, onEdit }: ProductDetailDialogProps) {
  const presentation = product?.variants?.presentacion;
  const productGroupKey = product?.variants?.productGroupKey;
  const showPackaging =
    hasValue(product?.unitType) ||
    product?.unitsPerPackage != null ||
    hasValue(presentation) ||
    hasValue(productGroupKey);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        className: "product-detail-dialog",
        sx: {
          borderRadius: 3,
          overflow: "hidden",
          boxShadow: "0 24px 48px rgba(38, 45, 96, 0.12)",
        },
      }}
    >
      <DialogTitle sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
        <Stack spacing={1}>
          <Typography variant="h5" sx={{ fontWeight: 800, color: "var(--glam-navy)", lineHeight: 1.2 }}>
            {loading ? "Cargando producto..." : product?.name || "Producto"}
          </Typography>
          {product && !loading ? (
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {product.sku ? <span className="pill pill-muted">SKU {product.sku}</span> : null}
              {product.category?.name ? <span className="pill pill-muted">{product.category.name}</span> : null}
              <span className={`pill ${product.isAvailable ? "pill-success" : "pill-muted"}`}>
                {product.isAvailable ? "Disponible" : "Inactivo"}
              </span>
            </Stack>
          ) : null}
        </Stack>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ px: 3, py: 2 }}>
        {loading ? (
          <p className="page-kicker">Obteniendo ficha completa del producto...</p>
        ) : product ? (
          <Stack spacing={2}>
            <DetailSection title="Precios">
              <div className="product-price-grid">
                <PriceCard label="Menudeo" value={formatMoney(product.price)} />
                <PriceCard label="Mayoreo" value={formatMoney(product.wholesalePrice)} />
                <PriceCard label="Costo" value={formatMoney(product.cost)} />
              </div>
            </DetailSection>

            <DetailSection title="Inventario y venta">
              <DetailField label="Unidad de venta" value={product.unit} />
              <DetailField label="Stock actual" value={Number(product.stock || 0).toLocaleString("es-MX")} />
              <DetailField label="Stock minimo" value={Number(product.minStock || 0).toLocaleString("es-MX")} />
            </DetailSection>

            {showPackaging ? (
              <DetailSection title="Empaque y presentacion">
                {hasValue(product.unitType) ? <DetailField label="Tipo de empaque" value={product.unitType} /> : null}
                {product.unitsPerPackage != null ? (
                  <DetailField label="Unidades por empaque" value={String(product.unitsPerPackage)} />
                ) : null}
                {hasValue(presentation) ? <DetailField label="Presentacion" value={String(presentation)} /> : null}
                {hasValue(productGroupKey) ? <DetailField label="Linea de producto" value={String(productGroupKey)} /> : null}
              </DetailSection>
            ) : null}

            <section className="product-detail-section product-detail-description">
              <Typography variant="overline" sx={{ color: "var(--glam-muted)", fontWeight: 800, letterSpacing: 1.2 }}>
                Descripcion
              </Typography>
              <p>{product.description?.trim() || "Sin descripcion."}</p>
            </section>
          </Stack>
        ) : (
          <p className="page-kicker">No se pudo cargar el producto.</p>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ textTransform: "none", fontWeight: 700 }}>
          Cerrar
        </Button>
        {product && onEdit ? (
          <Button
            variant="contained"
            sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2 }}
            onClick={() => {
              onEdit(product);
              onClose();
            }}
          >
            Editar producto
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
