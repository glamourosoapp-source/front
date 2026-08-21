"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Plus, Trash2 } from "lucide-react";
import {
  CONTAINER_UNIT_PRICE,
  PRICING_TIERS,
  hasWholesalePrice,
  productCarriesReturnableContainer,
  resolveProductPricing,
  type PricingTier,
} from "@glamouroso/shared";
import { httpClient } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import type { ListResponse, Order, Product } from "@/types";
import { toast } from "sonner";

export interface OrderLineItem {
  key: string;
  /** Vacío solo en partidas cuyo producto ya no está en el catálogo. */
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  /** Lista de precios de ESTA fila; se elige por producto, no por pedido. */
  priceTier: PricingTier;
}

export const PRICE_TIER_OPTIONS: Array<{ value: PricingTier; label: string }> = [
  { value: PRICING_TIERS.RETAIL, label: "Menudeo" },
  { value: PRICING_TIERS.WHOLESALE, label: "Mayoreo" },
];

export function priceTierLabel(tier: PricingTier | string | null | undefined): string {
  return tier === PRICING_TIERS.WHOLESALE ? "Mayoreo" : "Menudeo";
}

export function isWholesaleTier(tier: PricingTier | string | null | undefined): boolean {
  return tier === PRICING_TIERS.WHOLESALE;
}

/** Rojo de las partidas de mayoreo: mismo tono en captura, detalle y nota impresa. */
export const WHOLESALE_COLOR = "#c62828";
export const WHOLESALE_ROW_BG = "rgba(198, 40, 40, 0.08)";

export function newLineItem(product: Product, tier: PricingTier): OrderLineItem {
  const { unitPrice, appliedTier } = resolveProductPricing(product, tier);
  return {
    key: crypto.randomUUID(),
    productId: product.id,
    product,
    quantity: 1,
    unitPrice,
    priceTier: appliedTier,
  };
}

/**
 * Convierte las partidas guardadas de un pedido en filas editables.
 *
 * Se reprecian con el catálogo actual respetando la lista elegida en cada
 * partida: es lo que va a cobrar el server al guardar (el precio es
 * server-side). Solo las partidas cuyo producto ya no está en el catálogo
 * conservan su precio congelado, porque no hay de dónde repreciarlas.
 */
export function lineItemsFromOrder(items: NonNullable<Order["items"]>): OrderLineItem[] {
  return items.map((item) => {
    const catalogProduct = (item.product as Product | null) ?? null;
    const product: Product =
      catalogProduct ??
      ({
        id: item.productId ?? crypto.randomUUID(),
        name: item.productName,
        unit: item.unit ?? "pieza",
        price: Number(item.unitPrice),
      } as Product);
    const savedTier: PricingTier = item.priceTier === PRICING_TIERS.WHOLESALE
      ? PRICING_TIERS.WHOLESALE
      : PRICING_TIERS.RETAIL;
    const repriced = catalogProduct ? resolveProductPricing(catalogProduct, savedTier) : null;
    return {
      key: crypto.randomUUID(),
      productId: catalogProduct ? (item.productId ?? "") : "",
      product,
      quantity: Number(item.quantity),
      unitPrice: repriced ? repriced.unitPrice : Number(item.unitPrice),
      priceTier: repriced ? repriced.appliedTier : savedTier,
    };
  });
}

/**
 * Partidas con producto eliminado del catálogo (prefill de un pedido viejo)
 * viajan por nombre y con su precio congelado —el server no tiene de dónde
 * sacarlo—; el resto solo por productId y la lista de la fila: el precio y los
 * bidones los pone el server.
 */
export function lineItemsPayload(items: OrderLineItem[]) {
  return items.map((item) =>
    item.productId
      ? { productId: item.productId, quantity: item.quantity, priceTier: item.priceTier }
      : {
          productName: item.product.name,
          unit: item.product.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          priceTier: item.priceTier,
        }
  );
}

// Cada unidad 20L de una línea líquida trae bidón retornable que se cobra
// aparte (los plásticos con "20 LITROS" en el nombre no llevan bidón).
function addsContainer(product: Product): boolean {
  return productCarriesReturnableContainer(product);
}

export function orderTotals(items: OrderLineItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  // Bidones: siempre automáticos (1 por unidad 20L de línea líquida). No se
  // capturan: el server los deriva del catálogo igual que este cálculo, esto
  // es solo el avance de lo que va a cobrar.
  const containersCount = items.reduce(
    (sum, item) => sum + (addsContainer(item.product) ? item.quantity : 0),
    0
  );
  const containersFee = containersCount * CONTAINER_UNIT_PRICE;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  return { subtotal, containersCount, containersFee, total: subtotal + containersFee, itemCount };
}

interface OrderItemsEditorProps {
  items: OrderLineItem[];
  onChange: (items: OrderLineItem[]) => void;
  /** Lista con la que entran las filas nuevas: la del cliente del pedido. */
  defaultTier: PricingTier;
  disabled?: boolean;
  /** Oculta el bloque de subtotal/bidones/total (el diálogo lo muestra aparte). */
  hideTotals?: boolean;
}

/**
 * Captura de partidas de un pedido: buscador del catálogo + tabla editable.
 * La lista de precios se elige **por fila** (menudeo/mayoreo) y la fila de
 * mayoreo se pinta de rojo, igual que en el detalle y en la nota impresa.
 * Lo usan el alta/borrador (orders/new) y la edición de un pedido confirmado
 * (OrderEditDialog): una sola implementación del repricing por fila.
 */
export function OrderItemsEditor({
  items,
  onChange,
  defaultTier,
  disabled = false,
  hideTotals = false,
}: OrderItemsEditorProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productInput, setProductInput] = useState("");
  const debouncedProductInput = useDebounce(productInput, 300);
  const productSeq = useRef(0);

  // Búsqueda server-side: con >200 productos, cargar una sola página y filtrar
  // en memoria dejaba registros imposibles de encontrar.
  useEffect(() => {
    const seq = ++productSeq.current;
    setLoadingProducts(true);
    httpClient
      .get<ListResponse<Product>>("/products", {
        available: true,
        search: debouncedProductInput.trim() || undefined,
        limit: 50,
      })
      .then((res) => {
        if (seq === productSeq.current) setProducts(res.items);
      })
      .catch(() => {
        if (seq === productSeq.current) toast.error("No se pudo cargar productos");
      })
      .finally(() => {
        if (seq === productSeq.current) setLoadingProducts(false);
      });
  }, [debouncedProductInput]);

  // La opción seleccionada debe seguir existiendo aunque la búsqueda actual ya
  // no la incluya (el server solo devuelve lo que matchea el texto).
  const productOptions = useMemo(
    () =>
      selectedProduct && !products.some((p) => p.id === selectedProduct.id)
        ? [selectedProduct, ...products]
        : products,
    [products, selectedProduct]
  );

  const totals = orderTotals(items);
  const canAddProduct = Boolean(selectedProduct) && !loadingProducts && !disabled;

  function addProduct() {
    if (!selectedProduct) {
      toast.error("Selecciona un producto del catálogo");
      return;
    }
    const existing = items.find((item) => item.productId === selectedProduct.id);
    if (existing) {
      onChange(
        items.map((item) =>
          item.key === existing.key ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      onChange([...items, newLineItem(selectedProduct, defaultTier)]);
    }
    setSelectedProduct(null);
    setProductInput("");
  }

  function updateQuantity(key: string, quantity: number) {
    onChange(items.map((item) => (item.key === key ? { ...item, quantity } : item)));
  }

  /**
   * Cambio de lista en una fila: reprecia solo esa partida. Si se pide mayoreo
   * de un producto sin precio de mayoreo cargado, cae a menudeo y se avisa —el
   * server hace exactamente lo mismo, así que la fila no queda "en rojo"
   * cobrando precio de menudeo.
   */
  function updateTier(key: string, tier: PricingTier) {
    onChange(
      items.map((item) => {
        if (item.key !== key) return item;
        if (!item.productId) return { ...item, priceTier: tier };
        const { unitPrice, appliedTier } = resolveProductPricing(item.product, tier);
        if (tier === PRICING_TIERS.WHOLESALE && appliedTier !== PRICING_TIERS.WHOLESALE) {
          toast.warning(`${item.product.name} no tiene precio de mayoreo: se deja en menudeo.`);
        }
        return { ...item, unitPrice, priceTier: appliedTier };
      })
    );
  }

  function removeLineItem(key: string) {
    onChange(items.filter((item) => item.key !== key));
  }

  return (
    <>
      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap", mb: 3 }}>
        <Autocomplete
          options={productOptions}
          value={selectedProduct}
          disabled={disabled}
          onChange={(_, value) => setSelectedProduct(value)}
          onInputChange={(_, value, reason) => {
            // "reset" es el relleno del label al seleccionar: no buscar eso.
            if (reason !== "reset") setProductInput(value);
          }}
          filterOptions={(options) => options}
          getOptionLabel={(option) =>
            `${option.name}${option.sku ? ` · ${option.sku}` : ""} · $${Number(option.price).toFixed(2)}`
          }
          isOptionEqualToValue={(option, value) => option.id === value.id}
          loading={loadingProducts}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Producto del catálogo"
              helperText={
                loadingProducts
                  ? "Buscando productos…"
                  : productOptions.length === 0
                    ? productInput.trim()
                      ? "Sin resultados en el catálogo"
                      : "Escribe para buscar en el catálogo"
                    : "Tip: presiona Enter para agregar"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (canAddProduct) addProduct();
                }
              }}
            />
          )}
          sx={{ flex: "1 1 320px" }}
        />
        <Button
          variant="contained"
          startIcon={<Plus size={16} />}
          onClick={addProduct}
          disabled={!canAddProduct}
          sx={{ mt: 0.5 }}
        >
          Agregar
        </Button>
      </Box>

      {items.length === 0 ? (
        <Typography sx={{ color: "var(--muted)", py: 4, textAlign: "center" }}>
          Aún no hay productos. Selecciona uno del catálogo para comenzar.
        </Typography>
      ) : (
        <TableContainer className="order-items-table">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Producto</TableCell>
                <TableCell>Unidad</TableCell>
                <TableCell align="right">Cantidad</TableCell>
                <TableCell>Lista</TableCell>
                <TableCell align="right">Precio unit.</TableCell>
                <TableCell align="right">Subtotal</TableCell>
                <TableCell align="center">Quitar</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => {
                const wholesale = isWholesaleTier(item.priceTier);
                const noWholesalePrice = Boolean(item.productId) && !hasWholesalePrice(item.product);
                return (
                  <TableRow
                    key={item.key}
                    sx={wholesale ? { backgroundColor: WHOLESALE_ROW_BG } : undefined}
                  >
                    <TableCell sx={wholesale ? { color: WHOLESALE_COLOR } : undefined}>
                      <strong>{item.product.name}</strong>
                      {item.product.sku ? (
                        <Typography variant="caption" display="block" sx={{ color: "var(--muted)" }}>
                          SKU: {item.product.sku}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>{item.product.unit}</TableCell>
                    <TableCell align="right">
                      <TextField
                        type="number"
                        size="small"
                        value={item.quantity}
                        disabled={disabled}
                        onChange={(e) =>
                          updateQuantity(item.key, Math.max(1, Number(e.target.value) || 1))
                        }
                        inputProps={{ min: 1, step: 1 }}
                        sx={{ width: 88 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        value={item.priceTier}
                        // Sin producto en el catálogo no hay de dónde repreciar:
                        // la partida conserva su precio congelado.
                        disabled={disabled || !item.productId}
                        onChange={(e) => updateTier(item.key, e.target.value as PricingTier)}
                        helperText={noWholesalePrice ? "Sin precio de mayoreo" : undefined}
                        sx={{
                          width: 128,
                          "& .MuiInputBase-input": wholesale
                            ? { color: WHOLESALE_COLOR, fontWeight: 700 }
                            : undefined,
                        }}
                      >
                        {PRICE_TIER_OPTIONS.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={wholesale ? { color: WHOLESALE_COLOR, fontWeight: 700 } : undefined}
                    >
                      ${item.unitPrice.toFixed(2)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={wholesale ? { color: WHOLESALE_COLOR, fontWeight: 700 } : undefined}
                    >
                      ${(item.quantity * item.unitPrice).toFixed(2)}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Quitar producto">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={disabled}
                            onClick={() => removeLineItem(item.key)}
                            aria-label={`Quitar ${item.product.name}`}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {hideTotals ? null : (
                <>
                  <TableRow>
                    <TableCell colSpan={5} align="right" sx={{ color: "var(--muted)" }}>
                      Subtotal
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      ${totals.subtotal.toFixed(2)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  {/* Bidones: 1 por unidad de 20L líquida, calculado, sin captura. */}
                  <TableRow>
                    <TableCell colSpan={2} align="right" sx={{ color: "var(--muted)" }}>
                      Bidones (envase 20L)
                    </TableCell>
                    <TableCell align="right">{totals.containersCount}</TableCell>
                    <TableCell colSpan={2} align="right" sx={{ color: "var(--muted)" }}>
                      × ${CONTAINER_UNIT_PRICE.toFixed(2)}
                    </TableCell>
                    <TableCell align="right">${totals.containersFee.toFixed(2)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 700 }}>
                      Total
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      ${totals.total.toFixed(2)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
