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
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMoney } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { Branch, Customer, ListResponse } from "@/types";
import { toast } from "sonner";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Clientes que registró una caja, con la sucursal donde los dieron de alta.
 * Son los mismos registros de Clientes (mismo perfil que sus pedidos de
 * WhatsApp): editar y eliminar van por /customers.
 */
export default function BranchCustomersPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const canView = can("customers", "view");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
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
  }, [branchId, debouncedSearch, page, limit]);

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

  async function remove(customer: Customer) {
    try {
      await httpClient.delete(`/customers/${customer.id}`);
      toast.success(`Cliente ${customer.name} eliminado`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo eliminar el cliente"));
    }
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
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="">Todas las sucursales</MenuItem>
          {branches.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.code} · {branch.name}
            </MenuItem>
          ))}
        </TextField>
        <FilterMeta>
          {loading ? "Cargando…" : <><strong>{total.toLocaleString("es-MX")}</strong> clientes</>}
        </FilterMeta>
      </FilterBar>

      <DataTable
        rows={customers}
        getKey={(row: Customer) => row.id}
        getDeleteLabel={(row: Customer) => row.name}
        onRowClick={(row: Customer) => router.push(`/dashboard/customers/${row.id}`)}
        onEdit={can("customers", "update") ? (row: Customer) => setEditing(row) : undefined}
        onDelete={can("customers", "delete") ? remove : undefined}
        columns={[
          { key: "name", label: "Nombre", render: (row: Customer) => <strong>{row.name}</strong> },
          { key: "phone", label: "Teléfono" },
          {
            key: "originBranch",
            label: "Sucursal",
            render: (row: Customer) =>
              row.originBranch ? (
                <>
                  {row.originBranch.name}
                  <br />
                  <span className="page-kicker">{row.originBranch.code}</span>
                </>
              ) : (
                <span className="page-kicker">Sin sucursal</span>
              ),
          },
          { key: "createdAt", label: "Alta", render: (row: Customer) => formatDate(row.createdAt) },
          { key: "posSalesCount", label: "Compras", render: (row: Customer) => row.posSalesCount ?? 0 },
          { key: "posSpent", label: "Gastado", render: (row: Customer) => formatMoney(row.posSpent ?? 0) },
          { key: "lastPosSaleAt", label: "Última compra", render: (row: Customer) => formatDate(row.lastPosSaleAt) },
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
