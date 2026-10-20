"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Box, Button, Chip } from "@mui/material";
import {
  ArrowLeft,
  Cake,
  CalendarDays,
  Clock,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Receipt,
  ShieldAlert,
  StickyNote,
  Store,
  Tag,
  Trash2,
  UserCog,
  Wallet,
} from "lucide-react";
import { POS_SALE_STATUS, posPaymentMethodLabel } from "@glamouroso/shared/constants";
import { formatCustomerDeliveryAddress } from "@glamouroso/shared";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { formatMxPhone } from "@/utils/format-phone";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { Customer, ListResponse, PosSale } from "@/types";
import { toast } from "sonner";
import { CustomerAvatar } from "./CustomerAvatar";
import { customerDisplayName } from "./customer-labels";
import { PosSaleDialog } from "./PosSaleDialog";
import { InfoRow, StatTile } from "./StatTile";
import { formatBusinessTime, formatDate, relativeDays } from "./pos-labels";

const LIST_HREF = "/dashboard/pos/clientes";
/** Tope de tickets que se cargan; de ahí salen "lo que más compra" y "dónde compra". */
const SALES_LIMIT = 200;

interface ProductSummary {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  total: number;
  tickets: number;
}

interface BranchSummary {
  id: string;
  code: string;
  name: string;
  tickets: number;
  total: number;
}

/** "1990-03-12" → "12 de marzo". El año no se muestra: es para felicitarlo. */
function formatBirthday(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
}

/**
 * Detalle de un cliente que registró la caja: lo que ha comprado en las
 * sucursales, qué productos se lleva, dónde compra y sus tickets. Los pedidos
 * de WhatsApp y la facturación viven en su perfil del CRM (botón arriba).
 */
export function BranchCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const canView = can("customers", "view");
  // Los tickets salen de /pos/sales, que pide el permiso de reportes del POS.
  const canSeeSales = can("posReports", "view");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<PosSale[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [loadingSales, setLoadingSales] = useState(false);
  const [selected, setSelected] = useState<PosSale | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const loadCustomer = useCallback(async () => {
    try {
      setCustomer(await httpClient.get<Customer>(`/customers/${params.id}`));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el cliente"));
      router.push(LIST_HREF);
    }
  }, [params.id, router]);

  const loadSales = useCallback(async () => {
    if (!canSeeSales) return;
    setLoadingSales(true);
    try {
      const result = await httpClient.get<ListResponse<PosSale>>("/pos/sales", {
        customerId: params.id,
        limit: SALES_LIMIT,
      });
      setSales(result.items);
      setSalesTotal(result.total);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los tickets"));
    } finally {
      setLoadingSales(false);
    }
  }, [canSeeSales, params.id]);

  useEffect(() => {
    if (!canView) return;
    void loadCustomer();
    void loadSales();
  }, [canView, loadCustomer, loadSales]);

  // Un cobro nuevo a este cliente mueve sus contadores y su lista de tickets.
  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "pos_sales_changed") {
        void loadCustomer();
        void loadSales();
      }
    });
  }, [subscribe, loadCustomer, loadSales]);

  const { products, branches } = useMemo(() => {
    const byProduct = new Map<string, ProductSummary>();
    const byBranch = new Map<string, BranchSummary>();
    for (const sale of sales) {
      if (sale.status === POS_SALE_STATUS.VOIDED) continue;
      if (sale.branch) {
        const current = byBranch.get(sale.branch.id) ?? {
          id: sale.branch.id,
          code: sale.branch.code,
          name: sale.branch.name,
          tickets: 0,
          total: 0,
        };
        current.tickets += 1;
        current.total += Number(sale.total);
        byBranch.set(sale.branch.id, current);
      }
      const seen = new Set<string>();
      for (const item of sale.items ?? []) {
        const key = item.productId ?? item.lineId ?? item.productName;
        const current = byProduct.get(key) ?? {
          key,
          name: item.productName,
          quantity: 0,
          unit: item.saleUnit === "liter" ? "L" : "pz",
          total: 0,
          tickets: 0,
        };
        current.quantity += Number(item.quantity);
        current.total += Number(item.total);
        if (!seen.has(key)) current.tickets += 1;
        seen.add(key);
        byProduct.set(key, current);
      }
    }
    return {
      products: Array.from(byProduct.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 6),
      branches: Array.from(byBranch.values()).sort((a, b) => b.total - a.total),
    };
  }, [sales]);

  async function remove() {
    if (!customer) return;
    const ok = window.confirm(
      `¿Eliminar a ${customerDisplayName(customer.name)}? Se borra también su perfil del CRM.`
    );
    if (!ok) return;
    try {
      await httpClient.delete(`/customers/${customer.id}`);
      toast.success("Cliente eliminado");
      router.push(LIST_HREF);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo eliminar el cliente"));
    }
  }

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              Los clientes de sucursal necesitan el permiso de Clientes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="page-stack">
        <p className="page-kicker">Cargando cliente...</p>
      </div>
    );
  }

  const name = customerDisplayName(customer.name);
  const purchases = Number(customer.posSalesCount ?? 0);
  const spent = Number(customer.posSpent ?? 0);
  const average = purchases ? spent / purchases : 0;
  const address = formatCustomerDeliveryAddress(customer);
  const birthday = formatBirthday(customer.birthday);
  const topTotal = products[0]?.total ?? 0;
  const isWholesale = customer.pricingTier === "wholesale";

  return (
    <div className="page-stack">
      <div className="toolbar customer-detail-toolbar">
        <div>
          <Link
            href={LIST_HREF}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]"
          >
            <ArrowLeft size={16} />
            Volver a Clientes de sucursal
          </Link>
          <div className="customer-hero">
            <CustomerAvatar id={customer.id} name={customer.name} size={56} />
            <div style={{ minWidth: 0 }}>
              <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {name}
                <Chip
                  label={isWholesale ? "Mayoreo" : "Menudeo"}
                  size="small"
                  color={isWholesale ? "secondary" : "default"}
                  variant={isWholesale ? "filled" : "outlined"}
                />
              </h1>
              <p className="page-kicker" style={{ margin: 0 }}>
                {formatMxPhone(customer.phone)}
                {customer.originBranch ? (
                  <>
                    {" · Alta en "}
                    <Link href={`/dashboard/pos/sucursales/${customer.originBranch.id}`}>
                      {customer.originBranch.code} · {customer.originBranch.name}
                    </Link>
                  </>
                ) : null}
                {` · desde ${formatDate(customer.createdAt)}`}
              </p>
            </div>
          </div>
        </div>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            startIcon={<ExternalLink size={16} />}
            component={Link}
            href={`/dashboard/customers/${customer.id}`}
          >
            Perfil en CRM
          </Button>
          {can("customers", "update") ? (
            <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={() => setEditOpen(true)}>
              Editar
            </Button>
          ) : null}
          {can("customers", "delete") ? (
            <Button color="error" startIcon={<Trash2 size={16} />} onClick={() => void remove()}>
              Eliminar
            </Button>
          ) : null}
        </Box>
      </div>

      <div className="stat-tiles">
        <StatTile
          icon={Receipt}
          label="Compras"
          value={purchases.toLocaleString("es-MX")}
          hint={purchases ? "tickets en sucursal" : "Todavía no compra"}
          muted={!purchases}
        />
        <StatTile
          icon={Wallet}
          label="Gastado"
          value={formatMoney(spent)}
          hint={purchases ? `Ticket promedio ${formatMoney(average)}` : undefined}
          muted={!purchases}
        />
        <StatTile
          icon={Clock}
          label="Última compra"
          value={customer.lastPosSaleAt ? capitalize(relativeDays(customer.lastPosSaleAt)) : "Nunca"}
          hint={customer.lastPosSaleAt ? formatDate(customer.lastPosSaleAt) : undefined}
          muted={!customer.lastPosSaleAt}
        />
        <StatTile
          icon={CalendarDays}
          label="Cliente desde"
          value={formatDate(customer.createdAt)}
          hint={customer.creator ? `Lo registró ${customer.creator.name}` : undefined}
        />
      </div>

      <div className="customer-detail-grid">
        <div className="page-stack" style={{ minWidth: 0 }}>
          <section className="panel p-5">
            <div className="customer-section-head">
              <h2>Tickets</h2>
              {canSeeSales && salesTotal > sales.length ? (
                <span className="page-kicker" style={{ margin: 0 }}>
                  Se muestran los {sales.length} más recientes de {salesTotal}
                </span>
              ) : null}
            </div>
            {!canSeeSales ? (
              <p className="customer-empty">Ver los tickets necesita el permiso de Reportes del punto de venta.</p>
            ) : loadingSales && !sales.length ? (
              <p className="page-kicker">Cargando tickets...</p>
            ) : !sales.length ? (
              <p className="customer-empty">Este cliente todavía no tiene tickets en ninguna sucursal.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table customer-sales-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Folio</th>
                      <th>Sucursal</th>
                      <th>Pago</th>
                      <th style={{ textAlign: "right" }}>Productos</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => {
                      const voided = sale.status === POS_SALE_STATUS.VOIDED;
                      return (
                        <tr
                          key={sale.id}
                          className={voided ? "is-voided" : ""}
                          onClick={() => setSelected(sale)}
                          title="Ver el ticket completo"
                        >
                          <td>
                            <div style={{ fontWeight: 600, color: "var(--glam-navy)" }}>{formatDate(sale.soldAt)}</div>
                            <div className="customer-cell-sub">{formatBusinessTime(sale.soldAt)}</div>
                          </td>
                          <td>{sale.ticketNumber}</td>
                          <td>
                            {sale.branch ? (
                              <span className="branch-code-badge" title={sale.branch.name}>
                                {sale.branch.code}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{posPaymentMethodLabel(sale.paymentMethod)}</td>
                          <td style={{ textAlign: "right" }}>{formatQuantity(sale.itemsCount)}</td>
                          <td
                            style={{
                              textAlign: "right",
                              fontWeight: 700,
                              textDecoration: voided ? "line-through" : undefined,
                            }}
                          >
                            {formatMoney(sale.total)}
                          </td>
                          <td>
                            {voided ? (
                              <Chip label="Anulado" size="small" color="error" />
                            ) : sale.returns?.length ? (
                              <Chip label="Con devolución" size="small" color="warning" />
                            ) : (
                              <Chip label="Cobrado" size="small" color="success" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="page-stack" style={{ minWidth: 0 }}>
          {canSeeSales && products.length ? (
            <section className="panel p-5">
              <div className="customer-section-head">
                <h2>Lo que más compra</h2>
              </div>
              <ul className="customer-products">
                {products.map((product) => (
                  <li key={product.key}>
                    <div className="customer-products-row">
                      <span className="customer-products-name">{product.name}</span>
                      <strong>{formatMoney(product.total)}</strong>
                    </div>
                    <div className="customer-products-bar">
                      <span style={{ width: `${topTotal ? Math.max(4, (product.total / topTotal) * 100) : 0}%` }} />
                    </div>
                    <div className="customer-cell-sub">
                      {formatQuantity(product.quantity)} {product.unit} · en {product.tickets}{" "}
                      {product.tickets === 1 ? "ticket" : "tickets"}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {canSeeSales && branches.length > 1 ? (
            <section className="panel p-5">
              <div className="customer-section-head">
                <h2>Dónde compra</h2>
              </div>
              <ul className="customer-branches">
                {branches.map((branch) => (
                  <li key={branch.id}>
                    <Link href={`/dashboard/pos/sucursales/${branch.id}`} className="customer-branch">
                      <span className="branch-code-badge">{branch.code}</span>
                      {branch.name}
                    </Link>
                    <span className="customer-cell-sub">
                      {branch.tickets} {branch.tickets === 1 ? "ticket" : "tickets"} ·{" "}
                      <strong style={{ color: "var(--glam-navy)" }}>{formatMoney(branch.total)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="panel p-5">
            <div className="customer-section-head">
              <h2>Datos del cliente</h2>
            </div>
            <div className="customer-info">
              <InfoRow icon={Phone} label="WhatsApp" value={formatMxPhone(customer.phone)} />
              <InfoRow icon={Mail} label="Correo" value={customer.email || null} empty="Sin correo" />
              <InfoRow icon={Cake} label="Cumpleaños" value={birthday} empty="Sin capturar" />
              <InfoRow icon={MapPin} label="Domicilio" value={address || null} empty="Sin domicilio" />
              <InfoRow
                icon={Store}
                label="Sucursal de alta"
                value={customer.originBranch ? `${customer.originBranch.code} · ${customer.originBranch.name}` : null}
                empty="Sin sucursal"
              />
              <InfoRow icon={Tag} label="Lista de precios" value={isWholesale ? "Mayoreo" : "Menudeo"} />
              <InfoRow icon={UserCog} label="Registró" value={customer.creator?.name ?? null} empty="Sin dato" />
              {customer.taxId ? (
                <InfoRow
                  icon={FileText}
                  label="Facturación"
                  value={[customer.taxId, customer.legalName].filter(Boolean).join(" · ")}
                />
              ) : null}
              {customer.notes ? <InfoRow icon={StickyNote} label="Notas" value={customer.notes} /> : null}
            </div>
          </section>
        </div>
      </div>

      <PosSaleDialog sale={selected} onClose={() => setSelected(null)} />
      <CustomerFormDialog
        open={editOpen}
        customer={customer}
        onClose={() => setEditOpen(false)}
        onSaved={() => void loadCustomer()}
      />
    </div>
  );
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
