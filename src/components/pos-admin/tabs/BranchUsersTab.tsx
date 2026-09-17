"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Chip } from "@mui/material";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { UserFormDialog } from "@/components/users/UserFormDialog";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import type { Branch, ListResponse, Profile, Team, User } from "@/types";
import { toast } from "sonner";

/**
 * Usuarios fijados a la sucursal (cajeros, o el usuario de la franquicia).
 * Reusa el diálogo de Usuarios con la sucursal preseleccionada.
 */
export function BranchUsersTab({ branch }: { branch: Branch }) {
  const { can } = usePermissions();
  const canManage = can("users", "create");
  const canEditUsers = can("users", "update");

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await httpClient.get<User[]>(`/pos/branches/${branch.id}/users`));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los usuarios"));
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Catálogos del diálogo, solo cuando alguien puede usarlo.
  useEffect(() => {
    if (!canManage && !canEditUsers) return;
    Promise.all([
      httpClient.get<ListResponse<Profile>>("/profiles", { limit: 200 }),
      httpClient.get<ListResponse<Team>>("/teams", { limit: 200 }),
      httpClient.get<ListResponse<Branch>>("/pos/branches", { limit: 200 }),
    ])
      .then(([profilesRes, teamsRes, branchesRes]) => {
        setProfiles(profilesRes.items);
        setTeams(teamsRes.items);
        setBranches(branchesRes.items);
      })
      .catch(() => null);
  }, [canManage, canEditUsers]);

  return (
    <div className="page-stack">
      <div className="toolbar">
        <p className="page-kicker" style={{ margin: 0 }}>
          Un usuario fijado a esta {branch.type === "franchise" ? "franquicia" : "sucursal"} solo puede operar
          aquí. El perfil decide qué puede hacer: Cajero cobra, Franquicia pide a fábrica.
        </p>
        {canManage ? (
          <Button
            variant="contained"
            startIcon={<Plus size={16} />}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Nuevo usuario
          </Button>
        ) : null}
      </div>

      {users.length ? (
      <DataTable
        rows={users}
        getKey={(user: User) => user.id}
        columns={[
          { key: "name", label: "Nombre", render: (user: User) => <strong>{user.name}</strong> },
          { key: "email", label: "Correo", render: (user: User) => user.email },
          {
            key: "profile",
            label: "Perfil",
            render: (user: User) => user.profile?.name ?? (user.role === "admin" ? "Administrador" : "—"),
          },
          {
            key: "status",
            label: "Estado",
            render: (user: User) => (
              <span style={{ display: "inline-flex", gap: 6 }}>
                {user.isActive ? (
                  <Chip label="Activo" size="small" color="primary" />
                ) : (
                  <Chip label="Inactivo" size="small" />
                )}
                {user.mustChangePassword ? (
                  <Chip label="Contraseña temporal" size="small" color="warning" variant="outlined" />
                ) : null}
              </span>
            ),
          },
        ]}
        onEdit={
          canEditUsers
            ? (user: User) => {
                setEditing(user);
                setDialogOpen(true);
              }
            : undefined
        }
      />
      ) : null}
      {loading ? <p className="page-kicker">Cargando...</p> : null}
      {!loading && !users.length ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          Nadie está asignado todavía. {canManage ? "Crea el usuario de caja desde aquí." : ""}
        </div>
      ) : null}

      <UserFormDialog
        open={dialogOpen}
        user={editing}
        defaultBranchId={branch.id}
        profiles={profiles}
        teams={teams}
        branches={branches.length ? branches : [branch]}
        onClose={() => setDialogOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
