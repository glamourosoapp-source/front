"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Tab, Tabs } from "@mui/material";
import { ShieldAlert } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { UserFormDialog } from "@/components/users/UserFormDialog";
import { ProfileFormDialog } from "@/components/users/ProfileFormDialog";
import { TeamFormDialog } from "@/components/users/TeamFormDialog";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { ADMIN_ROLES } from "@glamouroso/shared/constants";
import { usePermissions } from "@/lib/permissions";
import { ListResponse, Profile, Team, User } from "@/types";
import { toast } from "sonner";

export default function UsersPage() {
  const { can } = usePermissions();
  const canView = can("users", "view");
  const canManage = can("users", "create") || can("users", "update");

  const [tab, setTab] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  const load = async () => {
    try {
      const [usersRes, profilesRes, teamsRes] = await Promise.all([
        httpClient.get<ListResponse<User>>("/users", { limit: 200 }),
        httpClient.get<ListResponse<Profile>>("/profiles", { limit: 200 }),
        httpClient.get<ListResponse<Team>>("/teams", { limit: 200 }),
      ]);
      setUsers(usersRes.items);
      setProfiles(profilesRes.items);
      setTeams(teamsRes.items);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar usuarios y perfiles"));
    }
  };

  useEffect(() => {
    if (canView) void load();
  }, [canView]);

  const profileNameById = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [profiles]);

  const userCountByProfile = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => {
      if (u.profileId) map.set(u.profileId, (map.get(u.profileId) ?? 0) + 1);
    });
    return map;
  }, [users]);

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    teams.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [teams]);

  const userCountByTeam = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => {
      if (u.teamId) map.set(u.teamId, (map.get(u.teamId) ?? 0) + 1);
    });
    return map;
  }, [users]);

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Solo administradores</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              La gestión de usuarios y perfiles solo está disponible para administradores.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function removeProfile(profile: Profile) {
    try {
      await httpClient.delete(`/profiles/${profile.id}`);
      toast.success(`Perfil ${profile.name} eliminado`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo eliminar el perfil"));
    }
  }

  async function removeTeam(team: Team) {
    try {
      await httpClient.delete(`/teams/${team.id}`);
      toast.success(`Equipo ${team.name} eliminado`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo eliminar el equipo"));
    }
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-kicker">Administra el equipo y los perfiles de acceso al panel.</p>
        </div>
        {canManage ? (
          tab === 0 ? (
            <Button
              variant="contained"
              onClick={() => {
                setEditingUser(null);
                setUserDialogOpen(true);
              }}
            >
              Nuevo usuario
            </Button>
          ) : tab === 1 ? (
            <Button
              variant="contained"
              onClick={() => {
                setEditingProfile(null);
                setProfileDialogOpen(true);
              }}
            >
              Nuevo perfil
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={() => {
                setEditingTeam(null);
                setTeamDialogOpen(true);
              }}
            >
              Nuevo equipo
            </Button>
          )
        ) : null}
      </div>

      <section className="panel p-4">
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
          <Tab label="Usuarios" />
          <Tab label="Perfiles" />
          <Tab label="Equipos" />
        </Tabs>

        {tab === 0 ? (
          <DataTable
            rows={users}
            getKey={(row) => row.id}
            getDeleteLabel={(row) => row.name}
            onEdit={
              can("users", "update")
                ? (row) => {
                    setEditingUser(row);
                    setUserDialogOpen(true);
                  }
                : undefined
            }
            columns={[
              { key: "name", label: "Nombre" },
              { key: "email", label: "Correo" },
              {
                key: "role",
                label: "Rol",
                render: (r) => (ADMIN_ROLES.includes(r.role) ? "Administrador" : "Usuario"),
              },
              {
                key: "profileId",
                label: "Perfil",
                render: (r) => (r.profileId ? profileNameById.get(r.profileId) ?? "—" : "Sin perfil"),
              },
              {
                key: "teamId",
                label: "Equipo",
                render: (r) => (r.teamId ? teamNameById.get(r.teamId) ?? "—" : "Sin equipo"),
              },
              {
                key: "isActive",
                label: "Estado",
                render: (r) =>
                  r.isActive === false ? (
                    <span className="pill">Inactivo</span>
                  ) : (
                    <span className="pill pill-success">Activo</span>
                  ),
              },
            ]}
          />
        ) : tab === 1 ? (
          <DataTable
            rows={profiles}
            getKey={(row) => row.id}
            getDeleteLabel={(row) => row.name}
            onEdit={
              can("users", "update")
                ? (row) => {
                    setEditingProfile(row);
                    setProfileDialogOpen(true);
                  }
                : undefined
            }
            onDelete={can("users", "delete") ? removeProfile : undefined}
            columns={[
              { key: "name", label: "Nombre" },
              { key: "description", label: "Descripción", render: (r) => r.description || "—" },
              {
                key: "users",
                label: "Usuarios",
                render: (r) => userCountByProfile.get(r.id) ?? 0,
              },
            ]}
          />
        ) : (
          <DataTable
            rows={teams}
            getKey={(row) => row.id}
            getDeleteLabel={(row) => row.name}
            onEdit={
              can("users", "update")
                ? (row) => {
                    setEditingTeam(row);
                    setTeamDialogOpen(true);
                  }
                : undefined
            }
            onDelete={can("users", "delete") ? removeTeam : undefined}
            columns={[
              { key: "name", label: "Nombre" },
              {
                key: "users",
                label: "Usuarios",
                render: (r) => userCountByTeam.get(r.id) ?? 0,
              },
            ]}
          />
        )}
      </section>

      <UserFormDialog
        open={userDialogOpen}
        user={editingUser}
        profiles={profiles}
        teams={teams}
        onClose={() => setUserDialogOpen(false)}
        onSaved={() => void load()}
      />
      <ProfileFormDialog
        open={profileDialogOpen}
        profile={editingProfile}
        onClose={() => setProfileDialogOpen(false)}
        onSaved={() => void load()}
      />
      <TeamFormDialog
        open={teamDialogOpen}
        team={editingTeam}
        onClose={() => setTeamDialogOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
