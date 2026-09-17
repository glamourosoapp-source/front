"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mui/material";
import { DataTable } from "@/components/ui/DataTable";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMoney } from "@/lib/format-money";
import { formatMxPhone } from "@/utils/format-phone";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { BranchCustomerRow, ListResponse } from "@/types";
import { toast } from "sonner";
import { FilterBar, FilterMeta, FilterSearch } from "../FilterBar";
import { formatDate, relativeDays } from "../pos-labels";

/**
 * Clientes registrados en la sucursal: los que dieron su teléfono al cobrar.
 * Lo que compró cada uno cuenta solo lo de ESTA sucursal; el perfil completo
 * del CRM (pedidos de WhatsApp, otras sucursales) está en su ficha.
 */
export function BranchCustomersTab({ branchId }: { branchId: string }) {
  const router = useRouter();
  const { subscribe } = useRealtime();
  const [rows, setRows] = useState<BranchCustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await httpClient.get<ListResponse<BranchCustomerRow>>(
        `/pos/branches/${branchId}/customers`,
        { search: debouncedSearch, page, limit }
      );
      setRows(result.items);
      setTotal(result.total);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los clientes"));
    } finally {
      setLoading(false);
    }
  }, [branchId, debouncedSearch, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "pos_sales_changed" && event.branchId === branchId) void load();
    });
  }, [subscribe, branchId, load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="page-stack">
      <FilterBar>
        <FilterSearch
          value={search}
          placeholder="Buscar cliente por nombre o teléfono"
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <FilterMeta>
          <strong>{total.toLocaleString("es-MX")}</strong>{" "}
          {total === 1 ? "cliente registrado" : "clientes registrados"}
        </FilterMeta>
      </FilterBar>

      {rows.length ? (
      <DataTable
        rows={rows}
        getKey={(row: BranchCustomerRow) => row.id}
        onRowClick={(row: BranchCustomerRow) => router.push(`/dashboard/customers/${row.id}`)}
        columns={[
          { key: "name", label: "Cliente", render: (row: BranchCustomerRow) => <strong>{row.name}</strong> },
          { key: "phone", label: "WhatsApp", render: (row: BranchCustomerRow) => formatMxPhone(row.phone) },
          { key: "email", label: "Correo", render: (row: BranchCustomerRow) => row.email || "—" },
          {
            key: "tier",
            label: "Lista",
            render: (row: BranchCustomerRow) => (
              <span className="pill">{row.pricingTier === "wholesale" ? "Mayoreo" : "Menudeo"}</span>
            ),
          },
          { key: "purchases", label: "Compras aquí", render: (row: BranchCustomerRow) => String(row.purchases) },
          { key: "spent", label: "Gastado aquí", render: (row: BranchCustomerRow) => <strong>{formatMoney(row.spent)}</strong> },
          {
            key: "last",
            label: "Última compra",
            render: (row: BranchCustomerRow) => `${relativeDays(row.lastPurchaseAt)} · ${formatDate(row.lastPurchaseAt)}`,
          },
          { key: "first", label: "Cliente desde", render: (row: BranchCustomerRow) => formatDate(row.firstPurchaseAt) },
        ]}
      />
      ) : null}
      {loading ? <p className="page-kicker">Cargando...</p> : null}
      {!loading && !rows.length ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          {debouncedSearch
            ? "Ningún cliente coincide con la búsqueda."
            : "Todavía nadie se ha registrado al cobrar en esta sucursal."}
        </div>
      ) : null}
      {totalPages > 1 ? (
        <div className="toolbar" style={{ justifyContent: "flex-end" }}>
          <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="page-kicker" style={{ margin: 0 }}>
            Página {page} de {totalPages}
          </span>
          <Button size="small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      ) : null}
    </div>
  );
}
