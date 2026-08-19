"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  InputAdornment,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  TextField,
  Typography,
} from "@mui/material";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/constants/orders";
import { ArrowLeft, Plus, ShieldAlert, Trash2 } from "lucide-react";
import {
  CONTAINER_UNIT_PRICE,
  carriesReturnableContainer,
  extractPresentation,
  resolveProductUnitPrice,
} from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDateOnly } from "@/lib/format-date-only";
import { Customer, ListResponse, Product } from "@/types";
import { toast } from "sonner";

interface OrderLineItem {
  key: string;
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  priceOverridden: boolean;
}

function defaultUnitPrice(product: Product, pricingTier: Customer["pricingTier"]) {
  return resolveProductUnitPrice(product, pricingTier || "retail");
}

// Cada unidad 20L de una línea líquida trae bidón retornable que se cobra
// aparte (los plásticos con "20 LITROS" en el nombre no llevan bidón).
// `variants.presentacion` la puebla el importador; para catálogo capturado a
// mano se deriva del nombre con la misma regla compartida.
function addsContainer(product: Product): boolean {
  const fromVariants = product.variants?.presentacion;
  const presentation =
    typeof fromVariants === "string" && fromVariants.trim()
      ? fromVariants.trim()
      : extractPresentation(product.name);
  const categoryName = product.category?.name ?? product.category?.externalCode ?? null;
  return carriesReturnableContainer(presentation, categoryName);
}

export default function NewOrderPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { can } = usePermissions();
  const canCreate = can("orders", "create");
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([]);
  const [orderNote, setOrderNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);

  const pricingTier = selectedCustomer?.pricingTier || "retail";

  function openCreateCustomer() {
    setCustomerDialogOpen(true);
  }

  // Búsqueda server-side: con >200 clientes/productos, cargar una sola página
  // y filtrar en memoria dejaba registros imposibles de encontrar.
  const [customerInput, setCustomerInput] = useState("");
  const [productInput, setProductInput] = useState("");
  const debouncedCustomerInput = useDebounce(customerInput, 300);
  const debouncedProductInput = useDebounce(productInput, 300);
  const customerSeq = useRef(0);
  const productSeq = useRef(0);

  useEffect(() => {
    if (!canCreate) {
      setLoadingCustomers(false);
      return;
    }
    const seq = ++customerSeq.current;
    setLoadingCustomers(true);
    httpClient
      .get<ListResponse<Customer>>("/customers", {
        search: debouncedCustomerInput.trim() || undefined,
        limit: 50,
      })
      .then((res) => {
        if (seq === customerSeq.current) setCustomers(res.items);
      })
      .catch(() => {
        if (seq === customerSeq.current) toast.error("No se pudo cargar clientes");
      })
      .finally(() => {
        if (seq === customerSeq.current) setLoadingCustomers(false);
      });
  }, [canCreate, debouncedCustomerInput]);

  useEffect(() => {
    if (!canCreate) {
      setLoadingProducts(false);
      return;
    }
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
  }, [canCreate, debouncedProductInput]);

  // La opción seleccionada debe seguir existiendo aunque la búsqueda actual ya
  // no la incluya (el server solo devuelve lo que matchea el texto).
  const customerOptions = useMemo(
    () =>
      selectedCustomer && !customers.some((c) => c.id === selectedCustomer.id)
        ? [selectedCustomer, ...customers]
        : customers,
    [customers, selectedCustomer]
  );
  const productOptions = useMemo(
    () =>
      selectedProduct && !products.some((p) => p.id === selectedProduct.id)
        ? [selectedProduct, ...products]
        : products,
    [products, selectedProduct]
  );

  useEffect(() => {
    setLineItems((items) =>
      items.map((item) => {
        if (item.priceOverridden) return item;
        return {
          ...item,
          unitPrice: defaultUnitPrice(item.product, pricingTier),
        };
      })
    );
  }, [pricingTier]);

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [lineItems]
  );

  // Bidones: auto (1 por unidad 20L) hasta que la capturista lo edita, p. ej.
  // cuando el cliente entrega bidones vacíos a cambio y se cobran menos.
  const [manualContainersCount, setManualContainersCount] = useState(0);
  const [containersOverridden, setContainersOverridden] = useState(false);
  const autoContainersCount = useMemo(
    () => lineItems.reduce((sum, item) => sum + (addsContainer(item.product) ? item.quantity : 0), 0),
    [lineItems]
  );
  const containersCount = containersOverridden ? manualContainersCount : autoContainersCount;
  const containersFee = containersCount * CONTAINER_UNIT_PRICE;
  const total = subtotal + containersFee;

  const itemCount = useMemo(() => lineItems.reduce((sum, item) => sum + item.quantity, 0), [lineItems]);
  const canSubmit = Boolean(selectedCustomer) && lineItems.length > 0 && !submitting;
  const canAddProduct = Boolean(selectedProduct) && !loadingProducts;

  function addProduct() {
    if (!selectedProduct) {
      toast.error("Selecciona un producto del catálogo");
      return;
    }

    const existing = lineItems.find((item) => item.productId === selectedProduct.id);
    if (existing) {
      setLineItems((items) =>
        items.map((item) =>
          item.productId === selectedProduct.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
      setSelectedProduct(null);
      setProductInput("");
      return;
    }

    setLineItems((items) => [
      ...items,
      {
        key: crypto.randomUUID(),
        productId: selectedProduct.id,
        product: selectedProduct,
        quantity: 1,
        unitPrice: defaultUnitPrice(selectedProduct, pricingTier),
        priceOverridden: false,
      },
    ]);
    setSelectedProduct(null);
    setProductInput("");
  }

  function updateLineItem(key: string, patch: Partial<Pick<OrderLineItem, "quantity" | "unitPrice">>) {
    setLineItems((items) =>
      items.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...patch };
        if (patch.unitPrice !== undefined) {
          next.priceOverridden = true;
        }
        return next;
      })
    );
  }

  function removeLineItem(key: string) {
    setLineItems((items) => items.filter((item) => item.key !== key));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (lineItems.length === 0) {
      toast.error("Agrega al menos un producto al pedido");
      return;
    }

    if (!selectedCustomer) {
      toast.error("Selecciona un cliente");
      return;
    }

    setSubmitting(true);
    try {
      const created = await httpClient.post<{ scheduledDeliveryDate?: string | null }>("/orders", {
        customerId: selectedCustomer.id,
        customerNotes: orderNote.trim() || undefined,
        paymentMethod: paymentMethod || undefined,
        paymentStatus,
        items: lineItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          ...(item.priceOverridden ? { unitPrice: item.unitPrice } : {}),
        })),
        containersCount,
        source: "panel",
      });
      const deliveryLabel = created?.scheduledDeliveryDate
        ? ` Entrega asignada: ${formatDateOnly(created.scheduledDeliveryDate, { weekday: "long", day: "2-digit", month: "long" })}.`
        : "";
      toast.success(`Nuevo pedido creado con éxito.${deliveryLabel}`);
      router.push("/dashboard/orders");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Error al crear el pedido"));
    } finally {
      setSubmitting(false);
    }
  }

  if (user && !canCreate) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin permiso para crear pedidos</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              Tu perfil no tiene la accion de crear en el modulo de pedidos. Pide acceso a tu
              administrador si necesitas registrar un pedido.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <form className="page-stack has-bottom-actions" onSubmit={submit}>
      <div className="toolbar">
        <div>
          <Link
            href="/dashboard/orders"
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]"
          >
            <ArrowLeft size={16} />
            Volver a pedidos
          </Link>
          <h1 className="page-title">Nuevo pedido</h1>
          <p className="page-kicker">
            Agrega productos y asigna el cliente. La fecha de entrega se asigna automáticamente según la hora de corte.
          </p>
        </div>
        <Box className="order-actions" sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          <Box className="order-actions-summary" sx={{ mr: 1, textAlign: "right" }}>
            <Typography variant="caption" sx={{ color: "var(--muted)", display: "block" }}>
              {itemCount} {itemCount === 1 ? "artículo" : "artículos"} · Subtotal ${subtotal.toFixed(2)}
            </Typography>
            <Typography variant="h6" sx={{ color: "var(--glam-navy)", fontWeight: 700, lineHeight: 1.15 }}>
              ${total.toFixed(2)}
            </Typography>
          </Box>
          <Button component={Link} href="/dashboard/orders" variant="outlined">
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={!canSubmit}>
            {submitting ? "Guardando..." : "Crear pedido"}
          </Button>
        </Box>
      </div>

      <section className="panel p-5">
        <h2>Productos</h2>
        <p className="page-kicker mb-4">Busca en el catálogo y agrega los productos del pedido.</p>

        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap", mb: 3 }}>
          <Autocomplete
            options={productOptions}
            value={selectedProduct}
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

        {lineItems.length === 0 ? (
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
                  <TableCell align="right">Precio unit.</TableCell>
                  <TableCell align="right">Subtotal</TableCell>
                  <TableCell align="center">Quitar</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lineItems.map((item) => (
                  <TableRow key={item.key}>
                    <TableCell>
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
                        onChange={(e) =>
                          updateLineItem(item.key, { quantity: Math.max(1, Number(e.target.value) || 1) })
                        }
                        inputProps={{ min: 1, step: 1 }}
                        sx={{ width: 88 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        type="number"
                        size="small"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateLineItem(item.key, { unitPrice: Math.max(0, Number(e.target.value) || 0) })
                        }
                        inputProps={{ min: 0, step: "0.01" }}
                        slotProps={{
                          input: {
                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                          },
                        }}
                        sx={{ width: 110 }}
                      />
                    </TableCell>
                    <TableCell align="right">${(item.quantity * item.unitPrice).toFixed(2)}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="Quitar producto">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeLineItem(item.key)}
                          aria-label={`Quitar ${item.product.name}`}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} align="right" sx={{ color: "var(--muted)" }}>
                    Subtotal
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    ${subtotal.toFixed(2)}
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={2} align="right" sx={{ color: "var(--muted)" }}>
                    Bidones (envase 20L)
                    {containersOverridden && manualContainersCount !== autoContainersCount ? (
                      <Typography variant="caption" display="block" sx={{ color: "var(--muted)" }}>
                        auto: {autoContainersCount}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={containersCount}
                      onChange={(e) => {
                        setManualContainersCount(Math.max(0, Math.trunc(Number(e.target.value) || 0)));
                        setContainersOverridden(true);
                      }}
                      inputProps={{ min: 0, step: 1, "aria-label": "Bidones" }}
                      sx={{ width: 88 }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ color: "var(--muted)" }}>
                    × ${CONTAINER_UNIT_PRICE.toFixed(2)}
                  </TableCell>
                  <TableCell align="right">${containersFee.toFixed(2)}</TableCell>
                  <TableCell align="center">
                    {containersOverridden ? (
                      <Tooltip title="Volver al cálculo automático (1 bidón por unidad de 20L)">
                        <Button size="small" onClick={() => setContainersOverridden(false)}>
                          Auto
                        </Button>
                      </Tooltip>
                    ) : null}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>
                    Total
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    ${total.toFixed(2)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </section>

      <section className="panel p-5">
        <h2>Cliente y pago</h2>
        <p className="page-kicker mb-4">Asigna el cliente, el metodo de pago y una nota opcional.</p>

        <div className="form-grid">
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
            <Autocomplete
              options={customerOptions}
              value={selectedCustomer}
              onChange={(_, value) => setSelectedCustomer(value)}
              onInputChange={(_, value, reason) => {
                if (reason !== "reset") setCustomerInput(value);
              }}
              filterOptions={(options) => options}
              loading={loadingCustomers}
              getOptionLabel={(option) => `${option.name}${option.phone ? ` (${option.phone})` : ""}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Buscar cliente"
                  required
                  helperText={
                    loadingCustomers
                      ? "Buscando clientes…"
                      : customerOptions.length === 0
                        ? customerInput.trim()
                          ? "Sin resultados"
                          : "Escribe para buscar clientes"
                        : " "
                  }
                />
              )}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Button variant="outlined" onClick={openCreateCustomer} sx={{ mt: 0.5, whiteSpace: "nowrap" }}>
              Nuevo cliente
            </Button>
          </Box>
          <TextField
            select
            label="Metodo de pago"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            fullWidth
            helperText="Opcional"
          >
            {PAYMENT_METHOD_OPTIONS.map((option) => (
              <MenuItem key={option.value || "none"} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Estado de pago"
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            fullWidth
            helperText=" "
          >
            {PAYMENT_STATUS_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Nota del pedido"
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            placeholder="Instrucciones de entrega, preferencias, etc."
            helperText={`${orderNote.trim().length}/280`}
            inputProps={{ maxLength: 280 }}
          />
        </div>

        {selectedCustomer?.pricingTier === "wholesale" && (
          <span className="pill mt-4 inline-block">Lista de precios: mayoreo</span>
        )}
        {!selectedCustomer && !loadingCustomers && (
          <Typography sx={{ color: "var(--muted)", mt: 2 }}>
            Selecciona un cliente para aplicar la lista de precios correcta.
          </Typography>
        )}
      </section>
    </form>

    <CustomerFormDialog
      open={customerDialogOpen}
      customer={null}
      onClose={() => setCustomerDialogOpen(false)}
      onSaved={(created) => {
        if (!created) return;
        setCustomers((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
        setSelectedCustomer(created);
      }}
    />
    </>
  );
}
