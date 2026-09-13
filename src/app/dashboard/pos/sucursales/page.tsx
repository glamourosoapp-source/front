"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Chip, Tab, Tabs } from "@mui/material";
import { Plus, ShieldAlert, Store } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { BranchFormDialog } from "@/components/pos-admin/BranchFormDialog";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import { usePermissions } from "@/lib/permissions";
import { Branch, ListResponse, User } from "@/types";
import { toast } from "sonner";

const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function BranchesPage() {
  const { can } = usePermissions();
  const canView = can("posBranches", "view");
  const canCreate = can("posBranches", "create");
  const canUpdate = can("posBranches", "update");
  const canDelete = can("posBranches", "delete");

  const [tab, setTab] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [branchesRes, usersRes] = await Promise.all([
        httpClient.get<ListResponse<Branch>>("/pos/branches", { limit: 200 }),
        httpClient.get<ListResponse<User>>("/users", { limit: 200 }),
      ]);
      setBranches(branchesRes.items);
      setUsers(usersRes.items);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar las sucursales"));
    } finally {
      setLoading(false);
    }
  }, []);

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
              La administración de sucursales necesita el permiso de Sucursales del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function remove(branch: Branch) {
    try {
      await httpClient.delete(`/pos/branches/${branch.id}`);
      toast.success(`Sucursal ${branch.name} eliminada`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo eliminar la sucursal"));
    }
  }

  const isFranchise = (branch: Branch) => branch.type === BRANCH_TYPES.FRANCHISE;
  const visible = tab === 0 ? branches.filter((b) => !isFranchise(b)) : branches.filter(isFranchise);
  const userCount = (branchId: string) => users.filter((u) => u.branchId === branchId).length;

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Sucursales</h1>
          <p className="page-kicker">
            Cada sucursal tiene su caja, su inventario, su ticket y su día de corte de faltantes.
          </p>
        </div>
        {canCreate ? (
          <Button
            variant="contained"
            startIcon={<Plus size={16} />}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Nueva sucursal
          </Button>
        ) : null}
      </div>

      <Tabs value={tab} onChange={(_e, value) => setTab(value)}>
        <Tab label={`Sucursales (${branches.filter((b) => !isFranchise(b)).length})`} />
        <Tab label={`Franquicias (${branches.filter(isFranchise).length})`} />
      </Tabs>

      <DataTable
        rows={visible}
        getKey={(branch) => branch.id}
        columns={[
          {
            key: "code",
            label: "Código",
            render: (branch) => (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Store size={14} style={{ color: "var(--glam-blue)" }} />
                <strong>{branch.code}</strong>
              </span>
            ),
          },
          { key: "name", label: "Nombre", render: (branch) => branch.name },
          {
            key: "address",
            label: "Domicilio",
            render: (branch) =>
              [branch.street, branch.colony, branch.city].filter(Boolean).join(", ") || "—",
          },
          { key: "phone", label: "Teléfono", render: (branch) => branch.phone || "—" },
          {
            key: "cutoff",
            label: "Corte de faltantes",
            render: (branch) =>
              branch.restockCutoffDow == null ? (
                <span className="pill-muted">Manual</span>
              ) : (
                WEEKDAY_LABELS[branch.restockCutoffDow]
              ),
          },
          {
            key: "users",
            label: "Usuarios",
            render: (branch) => userCount(branch.id) || "—",
          },
          {
            key: "status",
            label: "Estado",
            render: (branch) =>
              branch.isActive ? (
                <Chip label="Activa" size="small" color="primary" />
              ) : (
                <Chip label="Inactiva" size="small" />
              ),
          },
        ]}
        onEdit={
          canUpdate
            ? (branch) => {
                setEditing(branch);
                setDialogOpen(true);
              }
            : undefined
        }
        onDelete={canDelete ? remove : undefined}
        getDeleteLabel={(branch) => branch.name}
        deleteDescription={(label) => (
          <>
            Se eliminará la sucursal <strong>{label}</strong>. Solo es posible con sucursales sin
            ventas registradas ni usuarios asignados; si ya operó, desactívala en lugar de borrarla.
          </>
        )}
      />

      {loading ? <p className="page-kicker">Cargando...</p> : null}

      <BranchFormDialog
        open={dialogOpen}
        branch={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
