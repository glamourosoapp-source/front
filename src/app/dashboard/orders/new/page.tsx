"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  Tooltip,
  TextField,
  Typography,
} from "@mui/material";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/constants/orders";
import { ArrowLeft, Plus, ShieldAlert, Trash2 } from "lucide-react";
import {
  CONTAINER_UNIT_PRICE,
  customerLocationMapsUrl,
  formatCustomerDeliveryAddress,
  formatCustomerLocationAddress,
  productCarriesReturnableContainer,
  resolveProductUnitPrice,
} from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDateOnly } from "@/lib/format-date-only";
import { Customer, CustomerLocation, ListResponse, Order, Product } from "@/types";
import { toast } from "sonner";

interface OrderLineItem {
  key: string;
  /** Vacío solo en partidas de un borrador cuyo producto ya no está en el catálogo. */
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
}

function defaultUnitPrice(product: Product, pricingTier: Customer["pricingTier"]) {
  return resolveProductUnitPrice(product, pricingTier || "retail");
}

// Cada unidad 20L de una línea líquida trae bidón retornable que se cobra
// aparte (los plásticos con "20 LITROS" en el nombre no llevan bidón).
function addsContainer(product: Product): boolean {
  return productCarriesReturnableContainer(product);
}

/** Valor del selector para capturar una dirección que no es un domicilio guardado. */
const CUSTOM_LOCATION_VALUE = "custom";

function locationTitle(location: CustomerLocation, index: number): string {
  return location.label?.trim() || `Domicilio ${index + 1}`;
}

export default function NewOrderPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { can } = usePermissions();
  const canCreate = can("orders", "create");
  const canUpdate = can("orders", "update");
  const [submitting, setSubmitting] = useState(false);
  // Modo edición de borrador (?draftId=): misma pantalla, prellenada; guarda
  // con PUT y convierte con POST /confirm en lugar de crear.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // Domicilios guardados del cliente (hasta 3): se elige a cuál se entrega;
  // "Otra dirección" captura una de una sola vez, sin guardarla en el cliente.
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationChoice, setLocationChoice] = useState<string>(CUSTOM_LOCATION_VALUE);
  const [customAddress, setCustomAddress] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([]);
  const [orderNote, setOrderNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  /** Cliente que edita el diálogo (null = alta de cliente nuevo). */
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const pricingTier = selectedCustomer?.pricingTier || "retail";

  function openCreateCustomer() {
    setEditingCustomer(null);
    setCustomerDialogOpen(true);
  }

  // Los domicilios se administran en el mismo diálogo del cliente (que ya trae
  // el editor de ubicaciones), para no duplicar ese formulario aquí.
  function openCustomerLocations() {
    if (!selectedCustomer) return;
    setEditingCustomer(selectedCustomer);
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
  const locationSeq = useRef(0);
  /** Dirección ya guardada en el borrador que se está editando, para preseleccionarla. */
  const prefillAddressRef = useRef<string | null>(null);

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

  // Domicilios del cliente elegido. Al cambiar de cliente queda preseleccionado
  // el predeterminado (o el que ya traía el borrador); al volver del diálogo de
  // domicilios se preselecciona el que se acaba de agregar.
  const loadLocations = useCallback(
    async (customerId: string, previousIds?: string[]) => {
      const seq = ++locationSeq.current;
      setLoadingLocations(true);
      try {
        const items = await httpClient.get<CustomerLocation[]>(
          `/customers/${customerId}/locations`
        );
        if (seq !== locationSeq.current) return;
        const list = items ?? [];
        setLocations(list);

        if (previousIds) {
          const added = list.find((l) => !previousIds.includes(l.id));
          setLocationChoice((current) => {
            if (added) return added.id;
            if (list.some((l) => l.id === current)) return current;
            return (list.find((l) => l.isDefault) ?? list[0])?.id ?? CUSTOM_LOCATION_VALUE;
          });
          if (added) setCustomAddress("");
          return;
        }

        // Al editar un borrador se preselecciona el domicilio que coincide con
        // la dirección ya guardada; si no coincide con ninguno se conserva tal
        // cual como dirección manual, sin pisarla con la predeterminada.
        const prefill = prefillAddressRef.current?.trim() || "";
        prefillAddressRef.current = null;
        const matched = prefill
          ? list.find((l) => formatCustomerLocationAddress(l) === prefill)
          : undefined;
        if (matched) {
          setLocationChoice(matched.id);
          setCustomAddress("");
          return;
        }
        if (prefill) {
          setLocationChoice(CUSTOM_LOCATION_VALUE);
          setCustomAddress(prefill);
          return;
        }
        const preferred = list.find((l) => l.isDefault) ?? list[0];
        setLocationChoice(preferred?.id ?? CUSTOM_LOCATION_VALUE);
        setCustomAddress("");
      } catch {
        if (seq !== locationSeq.current) return;
        setLocations([]);
        setLocationChoice(CUSTOM_LOCATION_VALUE);
        setCustomAddress("");
        toast.error("No se pudieron cargar los domicilios del cliente");
      } finally {
        if (seq === locationSeq.current) setLoadingLocations(false);
      }
    },
    []
  );

  const selectedCustomerId = selectedCustomer?.id ?? null;
  useEffect(() => {
    if (!selectedCustomerId) {
      setLocations([]);
      setLocationChoice(CUSTOM_LOCATION_VALUE);
      setCustomAddress("");
      return;
    }
    void loadLocations(selectedCustomerId);
  }, [selectedCustomerId, loadLocations]);

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === locationChoice) ?? null,
    [locations, locationChoice]
  );

  // Dirección cacheada en el propio cliente: es la que usa el server cuando el
  // pedido va sin dirección, así que se muestra como referencia.
  const customerFallbackAddress = useMemo(
    () =>
      selectedCustomer
        ? formatCustomerDeliveryAddress({
            street: selectedCustomer.street,
            colony: selectedCustomer.colony,
            postalCode: selectedCustomer.postalCode,
            city: selectedCustomer.city,
            zone: selectedCustomer.zone,
            address: selectedCustomer.address,
          })
        : "",
    [selectedCustomer]
  );

  const deliveryAddress = selectedLocation
    ? formatCustomerLocationAddress(selectedLocation)
    : customAddress.trim();
  const selectedLocationMapsUrl = selectedLocation ? customerLocationMapsUrl(selectedLocation) : "";
  const deliveryZone = selectedLocation?.zone?.trim() || "";

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

  // El precio es el del catálogo según el tier del cliente: cambiar de cliente
  // reprecia todas las partidas. Las de producto borrado (sin productId)
  // conservan el precio congelado del borrador: no hay catálogo del que sacarlo.
  useEffect(() => {
    setLineItems((items) =>
      items.map((item) =>
        item.productId ? { ...item, unitPrice: defaultUnitPrice(item.product, pricingTier) } : item
      )
    );
  }, [pricingTier]);

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [lineItems]
  );

  // Bidones: siempre automáticos (1 por unidad 20L de línea líquida). No se
  // capturan: el server los deriva del catálogo igual que este cálculo, esto
  // es solo el avance de lo que va a cobrar.
  const containersCount = useMemo(
    () => lineItems.reduce((sum, item) => sum + (addsContainer(item.product) ? item.quantity : 0), 0),
    [lineItems]
  );
  const containersFee = containersCount * CONTAINER_UNIT_PRICE;
  const total = subtotal + containersFee;

  const itemCount = useMemo(() => lineItems.reduce((sum, item) => sum + item.quantity, 0), [lineItems]);
  const canSubmit = Boolean(selectedCustomer) && lineItems.length > 0 && !submitting && !loadingDraft;
  const canAddProduct = Boolean(selectedProduct) && !loadingProducts;

  // Carga del borrador a editar. ?draftId= se lee de window en efecto (mismo
  // patrón que el ?search= de la lista: useSearchParams exigiría <Suspense>).
  useEffect(() => {
    if (!user) return;
    const fromUrl = new URLSearchParams(window.location.search).get("draftId");
    if (!fromUrl || fromUrl === draftId) return;
    setDraftId(fromUrl);
    setLoadingDraft(true);
    httpClient
      .get<Order>(`/orders/${fromUrl}`)
      .then((order) => {
        if (order.status !== "draft") {
          toast.info("Este pedido ya no es un borrador.");
          router.replace(`/dashboard/orders/${order.id}`);
          return;
        }
        setDraftNumber(order.orderNumber);
        prefillAddressRef.current = order.deliveryAddress ?? null;
        const draftCustomer = (order.customer as Customer) ?? null;
        setSelectedCustomer(draftCustomer);
        setLineItems(
          (order.items ?? []).map((item) => {
            // Producto eliminado del catálogo: stub con los datos congelados de
            // la partida; el payload manda productName en vez de productId.
            const catalogProduct = (item.product as Product | null) ?? null;
            const product: Product =
              catalogProduct ??
              ({
                id: item.productId ?? crypto.randomUUID(),
                name: item.productName,
                unit: item.unit ?? "pieza",
                price: Number(item.unitPrice),
              } as Product);
            return {
              key: crypto.randomUUID(),
              productId: catalogProduct ? (item.productId ?? "") : "",
              product,
              quantity: Number(item.quantity),
              // El borrador se reprecia con el catálogo actual (es lo que va a
              // cobrar el server); solo el producto borrado guarda su precio.
              unitPrice: catalogProduct
                ? defaultUnitPrice(catalogProduct, draftCustomer?.pricingTier)
                : Number(item.unitPrice),
            };
          })
        );
        setOrderNote(order.customerNotes ?? "");
        setPaymentMethod(order.paymentMethod ?? "");
        setPaymentStatus(order.paymentStatus || "unpaid");
      })
      .catch(() => {
        toast.error("No se pudo cargar el borrador.");
        router.replace("/dashboard/orders?tab=drafts");
      })
      .finally(() => setLoadingDraft(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, draftId]);

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
      },
    ]);
    setSelectedProduct(null);
    setProductInput("");
  }

  function updateQuantity(key: string, quantity: number) {
    setLineItems((items) => items.map((item) => (item.key === key ? { ...item, quantity } : item)));
  }

  function removeLineItem(key: string) {
    setLineItems((items) => items.filter((item) => item.key !== key));
  }

  function validateForm() {
    if (lineItems.length === 0) {
      toast.error("Agrega al menos un producto al pedido");
      return false;
    }
    if (!selectedCustomer) {
      toast.error("Selecciona un cliente");
      return false;
    }
    return true;
  }

  // Partidas con producto eliminado del catálogo (prefill de borrador) viajan
  // por nombre y con su precio congelado —el server no tiene de dónde sacarlo—;
  // el resto solo por productId: precio y bidones los pone el server.
  function buildItemsPayload() {
    return lineItems.map((item) =>
      item.productId
        ? { productId: item.productId, quantity: item.quantity }
        : {
            productName: item.product.name,
            unit: item.product.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          }
    );
  }

  async function createOrder(asDraft: boolean) {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const created = await httpClient.post<{ scheduledDeliveryDate?: string | null }>("/orders", {
        customerId: selectedCustomer!.id,
        customerLocationId: selectedLocation?.id ?? null,
        deliveryAddress: deliveryAddress || undefined,
        deliveryZone: deliveryZone || undefined,
        customerNotes: orderNote.trim() || undefined,
        paymentMethod: paymentMethod || undefined,
        paymentStatus,
        items: buildItemsPayload(),
        source: "panel",
        asDraft,
      });
      if (asDraft) {
        toast.success("Borrador guardado. Conviértelo en pedido cuando el cliente apruebe.");
        router.push("/dashboard/orders?tab=drafts");
        return;
      }
      const deliveryLabel = created?.scheduledDeliveryDate
        ? ` Entrega asignada: ${formatDateOnly(created.scheduledDeliveryDate, { weekday: "long", day: "2-digit", month: "long" })}.`
        : "";
      toast.success(`Nuevo pedido creado con éxito.${deliveryLabel}`);
      router.push("/dashboard/orders");
    } catch (err) {
      toast.error(getApiErrorMessage(err, asDraft ? "Error al guardar el borrador" : "Error al crear el pedido"));
    } finally {
      setSubmitting(false);
    }
  }

  function draftPayload() {
    return {
      customerLocationId: selectedLocation?.id ?? null,
      // Sin dirección elegida se omiten los campos: el borrador conserva la
      // que ya tenía en vez de quedarse sin ella.
      deliveryAddress: deliveryAddress || undefined,
      deliveryZone: deliveryZone || undefined,
      customerNotes: orderNote.trim() || null,
      paymentMethod: paymentMethod || null,
      paymentStatus,
      items: buildItemsPayload(),
    };
  }

  async function saveDraft() {
    if (!draftId || !validateForm()) return;
    setSubmitting(true);
    try {
      await httpClient.put<Order>(`/orders/${draftId}`, draftPayload());
      toast.success(`Borrador ${draftNumber} guardado.`);
      router.push("/dashboard/orders?tab=drafts");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Error al guardar el borrador"));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDraft() {
    if (!draftId || !validateForm()) return;
    setSubmitting(true);
    try {
      const confirmed = await httpClient.post<Order>(`/orders/${draftId}/confirm`, draftPayload());
      const deliveryLabel = confirmed?.scheduledDeliveryDate
        ? ` Entrega asignada: ${formatDateOnly(confirmed.scheduledDeliveryDate, { weekday: "long", day: "2-digit", month: "long" })}.`
        : "";
      toast.success(`Pedido ${confirmed.orderNumber} creado con éxito.${deliveryLabel}`);
      router.push("/dashboard/orders");
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast.info("Este borrador ya fue confirmado.");
        router.replace(`/dashboard/orders/${draftId}`);
        return;
      }
      toast.error(getApiErrorMessage(err, "Error al convertir el borrador"));
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftId) await confirmDraft();
    else await createOrder(false);
  }

  // Resumen + botones de acción: viven en la barra pegajosa del pie, siempre
  // visible mientras se captura (sin scrollear de vuelta al header).
  const orderActions = (
    <>
      <Box className="order-actions-summary" sx={{ mr: "auto", textAlign: "left" }}>
        <Typography variant="caption" sx={{ color: "var(--muted)", display: "block" }}>
          {itemCount} {itemCount === 1 ? "artículo" : "artículos"} · Subtotal ${subtotal.toFixed(2)}
        </Typography>
        <Typography variant="h6" sx={{ color: "var(--glam-navy)", fontWeight: 700, lineHeight: 1.15 }}>
          ${total.toFixed(2)}
        </Typography>
      </Box>
      <Button component={Link} href={draftId ? "/dashboard/orders?tab=drafts" : "/dashboard/orders"} variant="outlined">
        Cancelar
      </Button>
      {draftId ? (
        <Button variant="outlined" disabled={!canSubmit || !canUpdate} onClick={() => void saveDraft()}>
          {submitting ? "Guardando..." : "Guardar borrador"}
        </Button>
      ) : (
        <Button variant="outlined" disabled={!canSubmit} onClick={() => void createOrder(true)}>
          {submitting ? "Guardando..." : "Guardar borrador"}
        </Button>
      )}
      <Button type="submit" variant="contained" disabled={!canSubmit || (Boolean(draftId) && !canUpdate)}>
        {submitting ? "Guardando..." : draftId ? "Confirmar pedido" : "Crear pedido"}
      </Button>
    </>
  );

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
    <form className="page-stack" onSubmit={submit}>
      <div className="toolbar">
        <div>
          <Link
            href={draftId ? "/dashboard/orders?tab=drafts" : "/dashboard/orders"}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]"
          >
            <ArrowLeft size={16} />
            {draftId ? "Volver a borradores" : "Volver a pedidos"}
          </Link>
          <h1 className="page-title">{draftId ? `Editar borrador ${draftNumber}` : "Nuevo pedido"}</h1>
          <p className="page-kicker">
            {draftId
              ? "Ajusta productos y datos; guarda el borrador o conviértelo en pedido."
              : "Agrega productos y asigna el cliente. La fecha de entrega se asigna automáticamente según la hora de corte."}
          </p>
        </div>
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
                          updateQuantity(item.key, Math.max(1, Number(e.target.value) || 1))
                        }
                        inputProps={{ min: 1, step: 1 }}
                        sx={{ width: 88 }}
                      />
                    </TableCell>
                    {/* Precio de la lista del cliente: no se captura ni se edita. */}
                    <TableCell align="right">${item.unitPrice.toFixed(2)}</TableCell>
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
                {/* Bidones: 1 por unidad de 20L líquida, calculado, sin captura. */}
                <TableRow>
                  <TableCell colSpan={2} align="right" sx={{ color: "var(--muted)" }}>
                    Bidones (envase 20L)
                  </TableCell>
                  <TableCell align="right">{containersCount}</TableCell>
                  <TableCell align="right" sx={{ color: "var(--muted)" }}>
                    × ${CONTAINER_UNIT_PRICE.toFixed(2)}
                  </TableCell>
                  <TableCell align="right">${containersFee.toFixed(2)}</TableCell>
                  <TableCell />
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
              // El contrato de borradores no permite cambiar el cliente: se
              // congela al guardar (crea otro borrador si es para otro cliente).
              disabled={Boolean(draftId)}
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
            {!draftId ? (
              <Button variant="outlined" onClick={openCreateCustomer} sx={{ mt: 0.5, whiteSpace: "nowrap" }}>
                Nuevo cliente
              </Button>
            ) : null}
          </Box>

          {/* Domicilio de entrega: el cliente puede tener hasta tres guardados. */}
          {selectedCustomer ? (
            <Box sx={{ display: "grid", gap: 1.5 }}>
              {loadingLocations ? (
                <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                  Cargando domicilios del cliente…
                </Typography>
              ) : (
                <>
                  {locations.length > 0 ? (
                    <TextField
                      select
                      label="Domicilio de entrega"
                      value={locationChoice}
                      onChange={(e) => setLocationChoice(e.target.value)}
                      fullWidth
                      helperText={
                        locations.length === 1
                          ? "El cliente tiene un domicilio guardado."
                          : `El cliente tiene ${locations.length} domicilios guardados.`
                      }
                      SelectProps={{
                        renderValue: (value) => {
                          const id = String(value);
                          if (id === CUSTOM_LOCATION_VALUE) return "Otra dirección";
                          const index = locations.findIndex((l) => l.id === id);
                          const location = locations[index];
                          if (!location) return "";
                          return `${locationTitle(location, index)} — ${
                            formatCustomerLocationAddress(location) || "sin dirección"
                          }`;
                        },
                      }}
                    >
                      {locations.map((location, index) => (
                        <MenuItem
                          key={location.id}
                          value={location.id}
                          sx={{ whiteSpace: "normal", alignItems: "flex-start" }}
                        >
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {locationTitle(location, index)}
                              {location.isDefault ? " · predeterminado" : ""}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                              {formatCustomerLocationAddress(location) || "Sin dirección capturada"}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                      <MenuItem value={CUSTOM_LOCATION_VALUE}>Otra dirección…</MenuItem>
                    </TextField>
                  ) : null}

                  {selectedLocation ? (
                    <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                      {selectedLocationMapsUrl ? (
                        <Typography variant="caption">
                          <a
                            href={selectedLocationMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--glam-blue)" }}
                          >
                            Ver en Google Maps
                          </a>
                        </Typography>
                      ) : null}
                      <Button size="small" onClick={openCustomerLocations} sx={{ ml: "auto" }}>
                        Administrar domicilios
                      </Button>
                    </Box>
                  ) : (
                    <TextField
                      label="Dirección de entrega"
                      value={customAddress}
                      onChange={(e) => setCustomAddress(e.target.value)}
                      fullWidth
                      multiline
                      minRows={2}
                      placeholder="Calle y número, colonia, ciudad o link de Google Maps"
                      helperText={
                        locations.length === 0
                          ? customerFallbackAddress
                            ? `Este cliente no tiene domicilios guardados. Si la dejas vacía se usa la del cliente: ${customerFallbackAddress}`
                            : "Este cliente no tiene domicilios guardados."
                          : "Dirección solo para este pedido: no se guarda en el cliente."
                      }
                    />
                  )}

                  {!selectedLocation ? (
                    <Box sx={{ display: "flex" }}>
                      <Button size="small" onClick={openCustomerLocations} sx={{ ml: "auto" }}>
                        {locations.length === 0 ? "Agregar domicilio" : "Administrar domicilios"}
                      </Button>
                    </Box>
                  ) : null}
                </>
              )}
            </Box>
          ) : null}
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

      <Box className="order-actions-floating">{orderActions}</Box>
    </form>

    <CustomerFormDialog
      open={customerDialogOpen}
      customer={editingCustomer}
      onClose={() => setCustomerDialogOpen(false)}
      onSaved={(saved) => {
        if (!saved) return;
        if (editingCustomer) {
          // Edición de domicilios: recargar la lista y quedarse con el que se
          // acaba de agregar (o con el que ya estaba elegido).
          void loadLocations(
            editingCustomer.id,
            locations.map((l) => l.id)
          );
          return;
        }
        setCustomers((prev) => (prev.some((c) => c.id === saved.id) ? prev : [...prev, saved]));
        setSelectedCustomer(saved);
      }}
    />
    </>
  );
}
