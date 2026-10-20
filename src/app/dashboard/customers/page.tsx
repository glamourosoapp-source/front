"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, MenuItem, TextField } from "@mui/material";
import { Plus } from "lucide-react";
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
import { Customer, ListResponse, Team } from "@/types";
import { toast } from "sonner";

/** Órdenes del CRM que entiende `GET /customers` (`sort`). */
const SORT_OPTIONS = [
  { value: "", label: "Actividad reciente" },
  { value: "last_order", label: "Último pedido" },
  { value: "total_spent", label: "Más comprado" },
  { value: "total_orders", label: "Más pedidos" },
  { value: "newest", label: "Alta más reciente" },
  { value: "name", label: "Nombre (A–Z)" },
];

/**
 * Directorio del CRM, con el mismo formato que Clientes de sucursal: avatar,
 * nombre parejo y lo que compra en pedidos. Editar va en la fila; eliminar,
 * en el detalle.
 */
export default function CustomersPage() {
  const router = useRouter();
  const { can, isAdmin } = usePermissions();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState("");
  const [teamId, setTeamId] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  // La primera carga espera a leer ?search= (buscador global del header).
  const [ready, setReady] = useState(false);

  const debouncedSearch = useDebounce(search, 300);
  const debouncedZone = useDebounce(zone, 300);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("search");
    if (fromUrl) setSearch(fromUrl);
    setReady(true);
  }, []);

  // El filtro por equipo solo aplica para admins (los perfiles team-scoped ya vienen filtrados).
  useEffect(() => {
    if (!isAdmin) return;
    httpClient
      .get<ListResponse<Team>>("/teams", { limit: 200 })
      .then((r) => setTeams(r.items))
      .catch(() => undefined);
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await httpClient.get<ListResponse<Customer>>("/customers", {
        search: debouncedSearch,
        zone: debouncedZone,
        teamId,
        ...(sort ? { sort } : {}),
        page,
        limit,
      });
      setCustomers(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar clientes"));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, debouncedZone, teamId, sort, page, limit]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-kicker">Directorio de clientes, historial de pedidos y compras acumuladas.</p>
        </div>
        {can("customers", "create") ? (
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={openCreate}>
            Nuevo cliente
          </Button>
        ) : null}
      </div>

      <FilterBar>
        <FilterSearch
          value={search}
          placeholder="Buscar nombre, WhatsApp, correo o RFC"
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <TextField
          size="small"
          label="Zona"
          placeholder="Todas"
          value={zone}
          onChange={(e) => {
            setZone(e.target.value);
            setPage(1);
          }}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 150 }}
        />
        {isAdmin ? (
          <TextField
            select
            size="small"
            label="Equipo"
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setPage(1);
            }}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ displayEmpty: true }}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="">Todos los equipos</MenuItem>
            {teams.map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {team.name}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
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
          sx={{ minWidth: 180 }}
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
        onRowClick={(row: Customer) => router.push(`/dashboard/customers/${row.id}`)}
        onEdit={
          can("customers", "update")
            ? (row: Customer) => {
                setEditing(row);
                setOpen(true);
              }
            : undefined
        }
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
            key: "zone",
            label: "Zona",
            render: (row: Customer) =>
              row.zone || row.colony ? (
                <>
                  <div>{row.zone || row.colony}</div>
                  {row.zone && row.colony ? <div className="customer-cell-sub">{row.colony}</div> : null}
                </>
              ) : (
                <span className="customer-cell-sub">Sin zona</span>
              ),
          },
          {
            key: "team",
            label: "Equipo",
            // Los de caja no tienen equipo: se ve la sucursal donde los registraron.
            render: (row: Customer) =>
              row.team ? (
                <span style={{ whiteSpace: "nowrap" }}>{row.team.name}</span>
              ) : row.originBranch ? (
                <span className="customer-branch" style={{ whiteSpace: "nowrap" }} title="Registrado en la caja">
                  <span className="branch-code-badge">{row.originBranch.code}</span>
                  {row.originBranch.name}
                </span>
              ) : (
                <span className="customer-cell-sub">Sin equipo</span>
              ),
          },
          {
            key: "totalOrders",
            label: "Pedidos",
            align: "right",
            render: (row: Customer) =>
              Number(row.totalOrders ?? 0) > 0 ? (
                <strong>{row.totalOrders}</strong>
              ) : (
                <span className="customer-cell-sub">—</span>
              ),
          },
          {
            key: "totalSpent",
            label: "Comprado",
            align: "right",
            render: (row: Customer) =>
              Number(row.totalSpent ?? 0) > 0 ? (
                <strong className="customer-money">{formatMoney(row.totalSpent)}</strong>
              ) : (
                <span className="customer-cell-sub">—</span>
              ),
          },
          {
            key: "lastOrderAt",
            label: "Último pedido",
            render: (row: Customer) =>
              row.lastOrderAt ? (
                <>
                  <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{relativeDays(row.lastOrderAt)}</div>
                  <div className="customer-cell-sub">{formatDate(row.lastOrderAt)}</div>
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
        open={open}
        customer={editing}
        onClose={() => setOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
