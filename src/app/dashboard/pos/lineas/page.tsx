"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Chip, TextField } from "@mui/material";
import { Droplets, Plus, ShieldAlert } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { ListPagination } from "@/components/ui/ListPagination";
import { ProductLineFormDialog } from "@/components/pos-admin/ProductLineFormDialog";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMoney } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { ListResponse, ProductLine } from "@/types";
import { toast } from "sonner";

type SellableFilter = "" | "true" | "false";

export default function ProductLinesPage() {
  const { can } = usePermissions();
  const canView = can("posInventory", "view");
  const canManage = can("posInventory", "update");

  const [lines, setLines] = useState<ProductLine[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState("");
  const [sellable, setSellable] = useState<SellableFilter>("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductLine | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await httpClient.get<ListResponse<ProductLine>>("/pos/lines", {
        page,
        limit,
        search: debouncedSearch,
        ...(sellable ? { sellableByLiter: sellable } : {}),
      });
      setLines(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar las líneas"));
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, sellable]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const sellableCount = useMemo(() => lines.filter((line) => line.canSellByLiter).length, [lines]);

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              Las líneas de líquidos necesitan el permiso de Inventario por sucursal.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function remove(line: ProductLine) {
    try {
      await httpClient.delete(`/pos/lines/${line.id}`);
      toast.success(`Línea ${line.name} eliminada`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo eliminar la línea"));
    }
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Líneas de líquidos</h1>
          <p className="page-kicker">
            Cada línea se inventaría en litros en la sucursal. El bidón y el litro definen el precio
            de la venta a granel.
          </p>
        </div>
        {canManage ? (
          <Button
            variant="contained"
            startIcon={<Plus size={16} />}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Nueva línea
          </Button>
        ) : null}
      </div>

      <div className="toolbar">
        <TextField
          label="Buscar línea"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          sx={{ minWidth: 260 }}
        />
        <select
          className="input"
          value={sellable}
          onChange={(e) => {
            setSellable(e.target.value as SellableFilter);
            setPage(1);
          }}
        >
          <option value="">Todas</option>
          <option value="true">Se venden por litro</option>
          <option value="false">Faltan productos por asignar</option>
        </select>
        <span className="page-kicker">
          {sellableCount} de {lines.length} en esta página venden por litro
        </span>
      </div>

      <DataTable
        rows={lines}
        getKey={(line) => line.id}
        columns={[
          {
            key: "name",
            label: "Línea",
            render: (line: ProductLine) => (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Droplets size={14} style={{ color: "var(--glam-blue)" }} />
                <strong>{line.name}</strong>
              </span>
            ),
          },
          {
            key: "bidon",
            label: "Bidón (20 L)",
            render: (line: ProductLine) =>
              line.bidonProduct ? (
                <>
                  {line.bidonProduct.name}
                  <br />
                  <span className="page-kicker">{formatMoney(line.bidonProduct.price)}</span>
                </>
              ) : (
                <span className="pill-warning">Sin asignar</span>
              ),
          },
          {
            key: "liter",
            label: "Litro",
            render: (line: ProductLine) =>
              line.literProduct ? (
                <>
                  {line.literProduct.name}
                  <br />
                  <span className="page-kicker">{formatMoney(line.literProduct.price)}</span>
                </>
              ) : (
                <span className="pill-warning">Sin asignar</span>
              ),
          },
          {
            key: "litersPerBidon",
            label: "L por bidón",
            render: (line: ProductLine) => `${Number(line.litersPerBidon)} L`,
          },
          {
            key: "sellable",
            label: "Venta por litro",
            render: (line: ProductLine) =>
              line.canSellByLiter ? (
                <Chip label="Habilitada" size="small" color="primary" />
              ) : (
                <Chip label="Incompleta" size="small" color="warning" />
              ),
          },
          {
            key: "status",
            label: "Estado",
            render: (line: ProductLine) =>
              line.isActive ? "Activa" : <span className="pill-muted">Inactiva</span>,
          },
        ]}
        onEdit={
          canManage
            ? (line: ProductLine) => {
                setEditing(line);
                setDialogOpen(true);
              }
            : undefined
        }
        onDelete={canManage ? remove : undefined}
        getDeleteLabel={(line: ProductLine) => line.name}
        deleteDescription={(label) => (
          <>
            Se eliminará la línea <strong>{label}</strong> y sus productos volverán a contarse por
            pieza. Solo es posible con líneas sin inventario ni ventas.
          </>
        )}
      />

      <ListPagination
        page={page}
        totalPages={totalPages}
        limit={limit}
        total={total}
        onPageChange={setPage}
        onLimitChange={(value) => {
          setLimit(value);
          setPage(1);
        }}
      />

      {loading ? <p className="page-kicker">Cargando...</p> : null}

      <ProductLineFormDialog
        open={dialogOpen}
        line={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
