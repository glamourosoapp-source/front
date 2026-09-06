"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Skeleton } from "@mui/material";
import { CalendarClock, PhoneCall, Users } from "lucide-react";
import { toast } from "sonner";
import { getCustomerFollowupScope, ORDER_SCOPES } from "@glamouroso/shared";
import { CUSTOMER_FOLLOWUP } from "@glamouroso/shared/constants";
import type { CustomerFollowupBucket } from "@glamouroso/shared/constants";
import type {
  CustomerFollowupListResponse,
  CustomerFollowupRow,
  CustomerFollowupSummaryResponse,
} from "@glamouroso/shared/schemas/customer-followup";
import { CustomerFollowupTable } from "@/components/customer-followup/CustomerFollowupTable";
import { ListPagination } from "@/components/ui/ListPagination";
import { FOLLOWUP_BUCKET_LABELS, FOLLOWUP_BUCKET_SHORT } from "@/constants/customer-followup";
import { useDebounce } from "@/hooks/useDebounce";
import { usePermissions } from "@/lib/permissions";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useAuthStore } from "@/stores/auth.store";

const emptySummary: CustomerFollowupSummaryResponse = {
  total: 0,
  buckets: { 15: 0, 30: 0, 60: 0 },
  minDays: CUSTOMER_FOLLOWUP.MIN_DAYS,
  maxDays: CUSTOMER_FOLLOWUP.MAX_DAYS,
  sellers: [],
};

/**
 * Seguimiento de clientes: los que el vendedor atendió por última vez y llevan
 * entre 15 y 65 días sin comprar, para escribirles o llamarles desde su propio
 * teléfono. Pasados 65 días (o si la última venta fue del agente IA) el cliente
 * pasa a Reactivación y deja de salir aquí. Con alcance "team" en el perfil se
 * ve la cartera de todo el equipo; el admin ve la de todos.
 */
export default function SeguimientoPage() {
  const { can, isAdmin, permissions } = usePermissions();
  const user = useAuthStore((s) => s.user);
  const teamScope = isAdmin || getCustomerFollowupScope(permissions) === ORDER_SCOPES.TEAM;

  const [bucket, setBucket] = useState<CustomerFollowupBucket | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [sellerId, setSellerId] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const [rows, setRows] = useState<CustomerFollowupRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CustomerFollowupSummaryResponse>(emptySummary);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const canView = can("customerFollowup");

  const loadSummary = useCallback(async () => {
    try {
      const params: Record<string, unknown> = {};
      if (sellerId) params.sellerId = sellerId;
      setSummary(await httpClient.get<CustomerFollowupSummaryResponse>("/customers/followup/summary", params));
      setSummaryError(null);
    } catch (error) {
      // Un cero silencioso se lee como "nadie por recomprar" y no es lo mismo.
      setSummaryError(getApiErrorMessage(error, "No se pudo cargar el resumen"));
    }
  }, [sellerId]);

  // Solo la carga más reciente escribe estado (cambios rápidos de cubo/búsqueda).
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit };
      if (bucket) params.bucket = bucket;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (sellerId) params.sellerId = sellerId;
      const response = await httpClient.get<CustomerFollowupListResponse>("/customers/followup", params);
      if (seq !== loadSeq.current) return;
      setRows(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (error) {
      if (seq !== loadSeq.current) return;
      toast.error(getApiErrorMessage(error, "Error al cargar clientes por recomprar"));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [page, limit, bucket, debouncedSearch, sellerId]);

  useEffect(() => {
    if (!user || !canView) return;
    load().catch(() => undefined);
  }, [load, user, canView]);

  useEffect(() => {
    if (!user || !canView) return;
    loadSummary().catch(() => undefined);
  }, [loadSummary, user, canView]);

  // Filtros nuevos vuelven a la página 1.
  useEffect(() => {
    setPage(1);
  }, [bucket, debouncedSearch, sellerId, limit]);

  // `user` nulo = aún hidratando la sesión; sin este guard la pantalla de "Sin
  // acceso" parpadea en cada carga dura incluso para el admin.
  if (user && !canView) {
    return (
      <div className="page-stack">
        <section className="panel p-5">
          <h2 style={{ margin: 0 }}>Sin acceso a Seguimiento</h2>
          <p className="page-kicker" style={{ margin: 0 }}>
            Pide a tu administrador el permiso de Seguimiento de clientes para usar este módulo.
          </p>
        </section>
      </div>
    );
  }

  const cards: Array<{ key: CustomerFollowupBucket | null; label: string; value: number; hint: string }> = [
    {
      key: null,
      label: "Por recomprar",
      value: summary.total,
      hint: `Entre ${summary.minDays} y ${summary.maxDays} días sin comprar`,
    },
    { key: 15, label: "1 · Recientes", value: summary.buckets[15], hint: FOLLOWUP_BUCKET_LABELS[15] },
    { key: 30, label: "2 · Enfriándose", value: summary.buckets[30], hint: FOLLOWUP_BUCKET_LABELS[30] },
    {
      key: 60,
      label: "3 · Últimos días",
      value: summary.buckets[60],
      hint: `${FOLLOWUP_BUCKET_LABELS[60]} · después pasan a Reactivación`,
    },
  ];

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Seguimiento de clientes</h1>
          <p className="page-kicker">
            {isAdmin
              ? "Clientes atendidos por un vendedor que llevan tiempo sin comprar. "
              : teamScope
                ? "Clientes a los que tu equipo les vendió por última vez y llevan tiempo sin comprar. "
                : "Clientes a los que les vendiste por última vez y llevan tiempo sin comprar. "}
            Escríbeles o llámales desde tu teléfono. Pasados {CUSTOMER_FOLLOWUP.MAX_DAYS} días pasan
            a Reactivación con el agente IA.
          </p>
        </div>
      </div>

      {summaryError && (
        <div
          className="panel p-4 flex flex-wrap items-center justify-between gap-2"
          style={{ borderColor: "#f5a524" }}
        >
          <span className="page-kicker" style={{ margin: 0 }}>
            <strong>Los números de abajo no son reales:</strong> {summaryError}
          </span>
          <Button size="small" variant="outlined" onClick={() => loadSummary()}>
            Reintentar
          </Button>
        </div>
      )}

      <section className="grid grid-4" style={summaryError ? { opacity: 0.5 } : undefined}>
        {cards.map((card) => {
          const active = bucket === card.key;
          const Icon = card.key === null ? Users : card.key === 60 ? CalendarClock : PhoneCall;
          return (
            <div
              key={String(card.key)}
              className="card metric"
              role="button"
              tabIndex={0}
              onClick={() => setBucket(card.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setBucket(card.key);
              }}
              style={{
                cursor: "pointer",
                outline: active ? "2px solid var(--glam-blue)" : undefined,
                outlineOffset: 2,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span>{card.label}</span>
                <Icon size={18} style={{ color: "var(--glam-blue)" }} />
              </div>
              <strong>{card.value}</strong>
              <small>{card.hint}</small>
            </div>
          );
        })}
      </section>

      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="small"
              variant={bucket === null ? "contained" : "outlined"}
              onClick={() => setBucket(null)}
            >
              Todos
            </Button>
            {CUSTOMER_FOLLOWUP.BUCKETS.map((option) => (
              <Button
                key={option}
                size="small"
                variant={bucket === option ? "contained" : "outlined"}
                onClick={() => setBucket(option)}
                title={FOLLOWUP_BUCKET_LABELS[option]}
              >
                {FOLLOWUP_BUCKET_SHORT[option]}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {teamScope ? (
              <select className="input" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                <option value="">{isAdmin ? "Todos los vendedores" : "Todo mi equipo"}</option>
                {summary.sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.name}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              className="input"
              style={{ maxWidth: 280 }}
              placeholder="Buscar cliente o teléfono"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={48} animation="wave" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="page-kicker" style={{ padding: "24px 0", textAlign: "center" }}>
            {bucket
              ? `Nadie lleva ${FOLLOWUP_BUCKET_LABELS[bucket]} sin comprar. Prueba otro rango.`
              : "Ningún cliente por recomprar en este momento. Buena señal: revisa más adelante."}
          </p>
        ) : (
          <>
            <CustomerFollowupTable rows={rows} showSeller={teamScope} senderName={user?.name} />
            <ListPagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </>
        )}
      </section>
    </div>
  );
}
