"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MenuItem, TextField } from "@mui/material";
import { ShieldAlert } from "lucide-react";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { DataTable } from "@/components/ui/DataTable";
import { ListPagination } from "@/components/ui/ListPagination";
import { FilterBar, FilterMeta, FilterSearch } from "@/components/pos-admin/FilterBar";
import { CustomerAvatar } from "@/components/pos-admin/CustomerAvatar";
import { customerDisplayName } from "@/components/pos-admin/customer-labels";
import { formatDate, relativeDays } from "@/components/pos-admin/pos-labels";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMoney } from "@/lib/format-money";
import { formatMxPhone } from "@/utils/format-phone";
import { usePermissions } from "@/lib/permissions";
import { Branch, Customer, ListResponse } from "@/types";
import { toast } from "sonner";

/** Órdenes que entiende `GET /customers?origin=branch` (`sort`). */
const SORT_OPTIONS = [
  { value: "", label: "Actividad reciente" },
  { value: "last_purchase", label: "Última compra" },
  { value: "spent", label: "Más gastado" },
  { value: "purchases", label: "Más compras" },
  { value: "newest", label: "Alta más reciente" },
  { value: "name", label: "Nombre (A–Z)" },
];

/**
 * Clientes que registró una caja, con la sucursal donde los dieron de alta.
 * Son los mismos registros de Clientes (mismo perfil que sus pedidos de
 * WhatsApp): editar va por /customers. El clic abre su detalle de sucursal.
 */
export default function BranchCustomersPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const canView = can("customers", "view");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [sort, setSort] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Customer | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    if (!canView) return;
    httpClient
      .get<ListResponse<Branch>>("/pos/branches", { limit: 200 })
      .then((res) => setBranches(res.items.filter((branch) => branch.type !== BRANCH_TYPES.FRANCHISE)))
      .catch(() => setBranches([]));
  }, [canView]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await httpClient.get<ListResponse<Customer>>("/customers", {
        origin: "branch",
        ...(branchId ? { originBranchId: branchId } : {}),
        ...(sort ? { sort } : {}),
        search: debouncedSearch,
        page,
        limit,
      });
      setCustomers(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar los clientes"));
    } finally {
      setLoading(false);
    }
  }, [branchId, sort, debouncedSearch, page, limit]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

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

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Clientes de sucursal</h1>
          <p className="page-kicker">
            Clientes que registró la caja y la sucursal donde los dieron de alta.
          </p>
        </div>
      </div>

      <FilterBar>
        <FilterSearch
          value={search}
          placeholder="Buscar nombre o teléfono"
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <TextField
          select
          size="small"
          label="Sucursal"
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setPage(1);
          }}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">Todas las sucursales</MenuItem>
          {branches.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.code} · {branch.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Ordenar por"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
          sx={{ minWidth: 190 }}
        >
          {SORT_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <FilterMeta>
          {loading ? "Cargando…" : <><strong>{total.toLocaleString("es-MX")}</strong> {total === 1 ? "cliente" : "clientes"}</>}
        </FilterMeta>
      </FilterBar>

      <DataTable
        rows={customers}
        getKey={(row: Customer) => row.id}
        onRowClick={(row: Customer) => router.push(`/dashboard/pos/clientes/${row.id}`)}
        onEdit={can("customers", "update") ? (row: Customer) => setEditing(row) : undefined}
        columns={[
          {
            key: "name",
            label: "Cliente",
            render: (row: Customer) => (
              <div className="customer-cell">
                <CustomerAvatar id={row.id} name={row.name} />
                <div style={{ minWidth: 0 }}>
                  <div className="customer-cell-name">
                    {customerDisplayName(row.name)}
                    {row.pricingTier === "wholesale" ? <span className="customer-tier-pill">Mayoreo</span> : null}
                  </div>
                  <div className="customer-cell-sub">{formatMxPhone(row.phone)}</div>
                </div>
              </div>
            ),
          },
          {
            key: "originBranch",
            label: "Sucursal",
            render: (row: Customer) =>
              row.originBranch ? (
                <span className="customer-branch">
                  <span className="branch-code-badge">{row.originBranch.code}</span>
                  {row.originBranch.name}
                </span>
              ) : (
                <span className="customer-cell-sub">Sin sucursal</span>
              ),
          },
          {
            key: "createdAt",
            label: "Alta",
            render: (row: Customer) => (
              <>
                <div>{formatDate(row.createdAt)}</div>
                {row.creator ? <div className="customer-cell-sub">por {row.creator.name}</div> : null}
              </>
            ),
          },
          {
            key: "posSalesCount",
            label: "Compras",
            align: "right",
            render: (row: Customer) =>
              Number(row.posSalesCount ?? 0) > 0 ? (
                <strong>{row.posSalesCount}</strong>
              ) : (
                <span className="customer-cell-sub">Sin compras</span>
              ),
          },
          {
            key: "posSpent",
            label: "Gastado",
            align: "right",
            render: (row: Customer) =>
              Number(row.posSpent ?? 0) > 0 ? (
                <strong className="customer-money">{formatMoney(row.posSpent)}</strong>
              ) : (
                <span className="customer-cell-sub">—</span>
              ),
          },
          {
            key: "lastPosSaleAt",
            label: "Última compra",
            render: (row: Customer) =>
              row.lastPosSaleAt ? (
                <>
                  <div style={{ fontWeight: 600 }}>{relativeDays(row.lastPosSaleAt)}</div>
                  <div className="customer-cell-sub">{formatDate(row.lastPosSaleAt)}</div>
                </>
              ) : (
                <span className="customer-cell-sub">—</span>
              ),
          },
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

      <CustomerFormDialog
        open={Boolean(editing)}
        customer={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}
