"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Checkbox, FormControlLabel, Tab, Tabs, Tooltip } from "@mui/material";
import { Printer } from "lucide-react";
import { OrderEditDialog } from "@/components/orders/OrderEditDialog";
import { OrdersPrintSheets } from "@/components/orders/OrderPrintSheet";
import { DataTable } from "@/components/ui/DataTable";
import { DateFilterField } from "@/components/ui/DateFilterField";
import { ListPagination } from "@/components/ui/ListPagination";
import {
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  orderCreatorLabel,
  orderStatusLabel,
  orderTeamLabel,
  paymentStatusLabel,
} from "@/constants/orders";
import { getApiErrorMessage } from "@/services/http-client";
import { httpClient } from "@/services/http-client";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { usePermissions } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import { DEFAULT_DELIVERY_SCHEDULE } from "@glamouroso/shared";
import { formatDateOnly, localDateOnly } from "@/lib/format-date-only";
import { exportOrdersToPdf, exportOrdersToXlsx } from "@/lib/export-orders-list";
import { ListResponse, Order } from "@/types";
import { toast } from "sonner";

type DeliveryTab = "today" | "tomorrow" | "upcoming" | "all" | "drafts";

const TAB_LABELS: Record<DeliveryTab, string> = {
  today: "Hoy",
  tomorrow: "Mañana",
  upcoming: "Próximos",
  all: "Todos",
  drafts: "Borradores",
};

const TAB_VALUES: DeliveryTab[] = ["today", "tomorrow", "upcoming", "all", "drafts"];

/**
 * Params de fecha de entrega según el tab activo. "Hoy"/"Mañana" se calculan
 * en la timezone del negocio: un usuario en otra TZ vería el día equivocado.
 */
function deliveryParams(tab: DeliveryTab, unscheduledOnly: boolean, timeZone: string) {
  switch (tab) {
    case "today":
      return { deliveryFrom: localDateOnly(0, timeZone), deliveryTo: localDateOnly(0, timeZone), sortBy: "deliveryDate" };
    case "tomorrow":
      return { deliveryFrom: localDateOnly(1, timeZone), deliveryTo: localDateOnly(1, timeZone), sortBy: "deliveryDate" };
    case "upcoming":
      return { deliveryFrom: localDateOnly(2, timeZone), sortBy: "deliveryDate" };
    case "all":
      return unscheduledOnly ? { unscheduled: true } : {};
    case "drafts":
      return {};
  }
}

/** Una nota ya impresa se pinta en el listado y solo un admin puede reimprimirla. */
function isPrinted(order: Order) {
  return Boolean(order.printedAt);
}

function formatPrintedAt(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOrderDate(value: string | Date | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export default function OrdersPage() {
  const router = useRouter();
  const { can, isAdmin } = usePermissions();
  const orgTimezone = useAuthStore(
    (s) => s.user?.organization?.timezone ?? DEFAULT_DELIVERY_SCHEDULE.timezone
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [undelivered, setUndelivered] = useState(false);
  const [tab, setTab] = useState<DeliveryTab>("today");
  const [unscheduledOnly, setUnscheduledOnly] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [draftCount, setDraftCount] = useState(0);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Selección para imprimir notas: se guarda el pedido completo (no solo el id)
  // para poder imprimir lo marcado en páginas anteriores sin volver a pedirlo.
  const [selected, setSelected] = useState<Record<string, Order>>({});
  const [printing, setPrinting] = useState(false);
  const [printBatch, setPrintBatch] = useState<Order[]>([]);

  // En el tab Borradores el estado va fijo a "draft" y no aplican los filtros
  // de entrega ni "sin entregar" (el server excluye drafts de esos listados).
  const buildParams = useCallback(
    () => ({
      search: appliedSearch || undefined,
      status: tab === "drafts" ? "draft" : status || undefined,
      paymentStatus: paymentStatus || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      undelivered: (tab !== "drafts" && undelivered) || undefined,
      ...deliveryParams(tab, unscheduledOnly, orgTimezone),
    }),
    [appliedSearch, dateFrom, dateTo, paymentStatus, status, tab, undelivered, unscheduledOnly, orgTimezone]
  );

  // Solo la carga más reciente escribe estado: al cambiar rápido de tab/filtro
  // con red lenta, la respuesta vieja no debe pisar a la nueva.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const response = await httpClient.get<ListResponse<Order>>("/orders", {
        ...buildParams(),
        page,
        limit,
      });
      if (seq !== loadSeq.current) return;
      setOrders(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages || 1);
    } catch {
      if (seq !== loadSeq.current) return;
      toast.error("No se pudieron cargar los pedidos.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [buildParams, page, limit]);

  // Conteo del badge del tab Borradores: pide 1 fila y lee el total (el
  // scope own/team lo aplica el server).
  const loadDraftCount = useCallback(async () => {
    try {
      const response = await httpClient.get<ListResponse<Order>>("/orders", {
        status: "draft",
        limit: 1,
      });
      setDraftCount(response.total);
    } catch {
      // Silencioso: el badge es informativo, la lista ya reporta sus errores.
    }
  }, []);

  /** Trae TODO lo filtrado paginando (el tope del API es 200 por página). */
  const fetchAllFiltered = useCallback(async () => {
    const params = buildParams();
    const all: Order[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const response = await httpClient.get<ListResponse<Order>>("/orders", {
        ...params,
        page,
        limit: 200,
      });
      all.push(...response.items);
      totalPages = response.totalPages || 1;
      page += 1;
    } while (page <= totalPages && page <= 50);
    return all;
  }, [buildParams]);

  async function handleExport(format: "xlsx" | "pdf") {
    setExporting(true);
    try {
      const all = await fetchAllFiltered();
      if (!all.length) {
        toast.info("No hay pedidos para exportar con los filtros actuales.");
        return;
      }
      const context = { scopeLabel: TAB_LABELS[tab] };
      if (format === "xlsx") await exportOrdersToXlsx(all, context);
      else await exportOrdersToPdf(all, context);
    } catch {
      toast.error("No se pudo generar la exportación.");
    } finally {
      setExporting(false);
    }
  }

  const selectedOrders = Object.values(selected);

  /** Reimprimir una nota ya impresa es exclusivo de los administradores. */
  const canPrintOrder = useCallback((order: Order) => isAdmin || !isPrinted(order), [isAdmin]);

  const printableOrders = orders.filter(canPrintOrder);

  function toggleSelected(order: Order) {
    if (!canPrintOrder(order)) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[order.id]) delete next[order.id];
      else next[order.id] = order;
      return next;
    });
  }

  const pageAllSelected =
    printableOrders.length > 0 && printableOrders.every((order) => selected[order.id]);

  function toggleSelectedPage() {
    setSelected((prev) => {
      const next = { ...prev };
      if (pageAllSelected) printableOrders.forEach((order) => delete next[order.id]);
      else printableOrders.forEach((order) => (next[order.id] = order));
      return next;
    });
  }

  /**
   * Notas de remisión en una sola impresión: lo marcado con checkbox o, si no
   * hay nada marcado, todos los pedidos del tab/filtro actual (no solo la
   * página visible). El diálogo del navegador permite guardarlas como PDF.
   *
   * Antes de abrir el diálogo se marcan en el server (POST /orders/print): esa
   * llamada es la que autoriza, y a partir de ahí la fila queda pintada y solo
   * un administrador puede volver a sacarla. Si se cancela el diálogo del
   * navegador el pedido igual queda marcado —para reimprimirlo hace falta un
   * admin, que es justo el control que se busca.
   */
  async function handlePrintNotes() {
    setPrinting(true);
    try {
      const all = selectedOrders.length ? selectedOrders : await fetchAllFiltered();
      if (!all.length) {
        toast.info("No hay pedidos para imprimir con los filtros actuales.");
        return;
      }
      const batch = all.filter(canPrintOrder);
      if (!batch.length) {
        toast.info("Estos pedidos ya se imprimieron; solo un administrador puede reimprimirlos.");
        return;
      }
      const skipped = all.length - batch.length;
      const printed = await httpClient.post<Order[]>("/orders/print", {
        orderIds: batch.map((order) => order.id),
      });
      if (skipped) {
        toast.info(`${skipped} nota(s) ya impresa(s) se omitieron.`);
      }
      setPrintBatch(printed.length ? printed : batch);
      setSelected({});
      void load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron preparar los pedidos para imprimir."));
    } finally {
      setPrinting(false);
    }
  }

  // Las hojas se montan por portal: hay que esperar a que estén pintadas antes
  // de abrir el diálogo de impresión, y desmontarlas al cerrarlo.
  useEffect(() => {
    if (!printBatch.length) return;
    const timer = setTimeout(() => {
      window.print();
      setPrintBatch([]);
    }, 150);
    return () => clearTimeout(timer);
  }, [printBatch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadDraftCount();
  }, [loadDraftCount]);

  // Refresco en vivo: otra sesión, un compañero o el agente creó/cambió un
  // pedido. Señal sin datos → refetch con los filtros y scope actuales; el
  // debounce agrupa ráfagas y el seq guard de load absorbe el resto.
  const { subscribe } = useRealtime();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribe((event) => {
      if (event.type !== "orders_changed") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void load();
        void loadDraftCount();
      }, 500);
    });
    return () => {
      if (timer) clearTimeout(timer);
      off();
    };
  }, [subscribe, load, loadDraftCount]);

  // Deep-links ?search= (buscador global del header) y ?tab= (p. ej. al volver
  // de guardar un borrador). En efecto para no leer window durante el render
  // (hidratación).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("search");
    if (fromUrl) {
      setSearch(fromUrl);
      setAppliedSearch(fromUrl.trim());
    }
    const tabFromUrl = params.get("tab") as DeliveryTab | null;
    if (tabFromUrl && TAB_VALUES.includes(tabFromUrl)) setTab(tabFromUrl);
  }, []);

  // Filtros o tab nuevos vuelven a la página 1 (el seq guard evita el doble render)
  // y descartan la selección: lo marcado ya no corresponde a lo que se ve.
  useEffect(() => {
    setPage(1);
    setSelected({});
  }, [tab, appliedSearch, status, paymentStatus, dateFrom, dateTo, undelivered, unscheduledOnly]);

  function applySearch() {
    setAppliedSearch(search.trim());
  }

  function openEdit(order: Order) {
    // Un borrador se edita en la pantalla completa de captura (permite
    // agregar productos); los demás pedidos, en el diálogo de metadatos.
    if (order.status === "draft") {
      router.push(`/dashboard/orders/new?draftId=${order.id}`);
      return;
    }
    setEditing(order);
    setOpen(true);
  }

  async function confirmDraft(order: Order) {
    setConfirmingId(order.id);
    try {
      const confirmed = await httpClient.post<Order>(`/orders/${order.id}/confirm`, {});
      toast.success(
        `Pedido ${confirmed.orderNumber} creado${
          confirmed.scheduledDeliveryDate
            ? ` · entrega ${formatDateOnly(confirmed.scheduledDeliveryDate)}`
            : ""
        }`
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo convertir el borrador."));
    } finally {
      setConfirmingId(null);
      await load();
      await loadDraftCount();
    }
  }

  function clearFilters() {
    setSearch("");
    setAppliedSearch("");
    setStatus("");
    setPaymentStatus("");
    setDateFrom("");
    setDateTo("");
    setUndelivered(false);
    setUnscheduledOnly(false);
  }

  async function remove(order: Order) {
    try {
      await httpClient.delete(`/orders/${order.id}`);
      toast.success(`Pedido ${order.orderNumber} eliminado con éxito`);
      await load();
    } catch {
      toast.error("Error al eliminar el pedido");
    }
  }

  const hasFilters = Boolean(
    appliedSearch || status || paymentStatus || dateFrom || dateTo || undelivered || unscheduledOnly
  );

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Pedidos</h1>
          <p className="page-kicker">Alta rapida y seguimiento de pedidos capturados desde el panel o WhatsApp.</p>
        </div>
        {can("orders", "create") ? (
          <Button component={Link} href="/dashboard/orders/new" variant="contained">
            Nuevo pedido
          </Button>
        ) : null}
      </div>
      <section className="panel p-4">
        <Tabs
          value={tab}
          onChange={(_, value: DeliveryTab) => setTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab value="today" label="Entregas de hoy" />
          <Tab value="tomorrow" label="Mañana" />
          <Tab value="upcoming" label="Próximos" />
          <Tab value="all" label="Todos" />
          <Tab
            value="drafts"
            label={
              <Badge badgeContent={draftCount} color="warning" max={99} sx={{ "& .MuiBadge-badge": { right: -10 } }}>
                Borradores
              </Badge>
            }
          />
        </Tabs>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>
              {tab === "drafts"
                ? "Borradores de pedido"
                : tab === "all"
                  ? "Pedidos recientes"
                  : `Pedidos con entrega: ${TAB_LABELS[tab]}`}
            </h2>
            <p className="page-kicker">
              {tab === "drafts"
                ? "Pedidos guardados sin confirmar; edítalos o conviértelos en pedido."
                : "Busca por folio o cliente; combina con fechas, estado y pago."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="small" variant="outlined" disabled={exporting || !orders.length} onClick={() => handleExport("xlsx")}>
              {exporting ? "Exportando..." : "Excel"}
            </Button>
            <Button size="small" variant="outlined" disabled={exporting || !orders.length} onClick={() => handleExport("pdf")}>
              PDF
            </Button>
            {can("orderPrint") ? (
              <Button
                size="small"
                variant="contained"
                startIcon={<Printer size={16} />}
                disabled={
                  printing || (!printableOrders.length && !selectedOrders.length)
                }
                onClick={() => void handlePrintNotes()}
              >
                {printing
                  ? "Preparando..."
                  : selectedOrders.length
                    ? `Imprimir pedidos (${selectedOrders.length})`
                    : "Imprimir pedidos"}
              </Button>
            ) : null}
            <span className="pill">{total.toLocaleString("es-MX")} pedidos</span>
          </div>
        </div>
        <div className="mb-4 flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-[minmax(280px,1fr)_auto]">
            <input
              className="input"
              placeholder="Buscar por folio o nombre de cliente"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
            />
            <Button variant="outlined" onClick={applySearch} disabled={loading}>
              {loading ? "Cargando..." : "Buscar"}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(170px,1fr)_minmax(170px,1fr)_160px_160px]">
            <DateFilterField label="Creado desde" value={dateFrom} onChange={setDateFrom} max={dateTo || undefined} />
            <DateFilterField label="Creado hasta" value={dateTo} onChange={setDateTo} min={dateFrom || undefined} />
            <select
              className="input"
              value={tab === "drafts" ? "" : status}
              disabled={undelivered || tab === "drafts"}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">{tab === "drafts" ? "Borradores" : "Todos los estados"}</option>
              {ORDER_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              <option value="">Todos los pagos</option>
              {PAYMENT_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {tab !== "drafts" ? (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={undelivered}
                    onChange={(e) => {
                      setUndelivered(e.target.checked);
                      if (e.target.checked) setStatus("");
                    }}
                  />
                }
                label="Solo sin entregar"
              />
            ) : null}
            {tab === "all" ? (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={unscheduledOnly}
                    onChange={(e) => setUnscheduledOnly(e.target.checked)}
                  />
                }
                label="Solo sin fecha de entrega"
              />
            ) : null}
            {hasFilters ? (
              <Button size="small" variant="text" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : null}
          </div>
        </div>
        <DataTable
          rows={orders}
          getKey={(row) => row.id}
          getDeleteLabel={(row) => `el pedido ${row.orderNumber}`}
          onRowClick={(row) => router.push(`/dashboard/orders/${row.id}`)}
          onEdit={can("orders", "update") ? openEdit : undefined}
          onDelete={can("orders", "delete") ? remove : undefined}
          isRowHighlighted={(row: Order) => isPrinted(row)}
          selection={
            can("orderPrint")
              ? {
                  isSelected: (row: Order) => Boolean(selected[row.id]),
                  onToggle: toggleSelected,
                  allSelected: pageAllSelected,
                  someSelected: selectedOrders.length > 0,
                  onToggleAll: toggleSelectedPage,
                  isDisabled: (row: Order) => !canPrintOrder(row),
                  label: "Seleccionar pedidos para imprimir",
                }
              : undefined
          }
          columns={[
            {
              key: "orderNumber",
              label: "Folio",
              // El azul de la fila no puede ser la única señal (daltonismo,
              // impresiones en gris): la marca "Impreso" dice quién y cuándo.
              render: (r: Order) =>
                isPrinted(r) ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {r.orderNumber}
                    <Tooltip
                      arrow
                      title={`Impreso ${formatPrintedAt(r.printedAt)}${
                        r.printer?.name ? ` por ${r.printer.name}` : ""
                      }`}
                    >
                      <span className="pill">Impreso</span>
                    </Tooltip>
                  </span>
                ) : (
                  r.orderNumber
                ),
            },
            { key: "createdAt", label: "Fecha", render: (r) => formatOrderDate(r.createdAt) },
            {
              key: "scheduledDeliveryDate",
              label: "Entrega",
              render: (r) =>
                r.scheduledDeliveryDate ? (
                  <span>
                    {formatDateOnly(r.scheduledDeliveryDate)}
                    {r.deliveryTimeWindow ? ` · ${r.deliveryTimeWindow}` : ""}
                  </span>
                ) : (
                  <span className="pill">Sin fecha</span>
                ),
            },
            { key: "customer", label: "Cliente", render: (r) => r.customer?.name || "" },
            { key: "creator", label: "Creado por", render: (r) => orderCreatorLabel(r) },
            { key: "team", label: "Equipo", render: (r) => orderTeamLabel(r) },
            {
              key: "status",
              label: "Estado",
              render: (r) => <span className="pill">{orderStatusLabel(r.status)}</span>,
            },
            {
              key: "paymentStatus",
              label: "Pago",
              render: (r) => <span className="pill">{paymentStatusLabel(r.paymentStatus)}</span>,
            },
            { key: "total", label: "Total", render: (r) => `$${Number(r.total).toFixed(2)}` },
            ...(tab === "drafts" && can("orders", "update")
              ? [
                  {
                    key: "confirm",
                    label: "",
                    render: (r: Order) => (
                      <Button
                        size="small"
                        variant="contained"
                        disabled={confirmingId !== null}
                        onClick={(event) => {
                          event.stopPropagation();
                          void confirmDraft(r);
                        }}
                      >
                        {confirmingId === r.id ? "Convirtiendo..." : "Convertir en pedido"}
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
        <ListPagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(nextLimit) => {
            setLimit(nextLimit);
            setPage(1);
          }}
        />
      </section>

      <OrderEditDialog
        open={open}
        order={editing}
        onClose={() => setOpen(false)}
        onSaved={() => void load()}
      />

      <OrdersPrintSheets orders={printBatch} />
    </div>
  );
}
