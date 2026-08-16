"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
} from "@mui/material";
import { ADMIN_ROLES, ROLES } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { Profile, Team, User } from "@/types";
import { toast } from "sonner";

interface UserFormDialogProps {
  open: boolean;
  user: User | null;
  profiles: Profile[];
  teams: Team[];
  onClose: () => void;
  onSaved: () => void;
}

type AccessType = "admin" | "profile";

function accessTypeFromRole(role?: string | null): AccessType {
  return role && ADMIN_ROLES.includes(role) ? "admin" : "profile";
}

export function UserFormDialog({ open, user, profiles, teams, onClose, onSaved }: UserFormDialogProps) {
  const isEdit = Boolean(user);
  const { isAdmin } = usePermissions();
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [accessType, setAccessType] = useState<AccessType>(() => accessTypeFromRole(user?.role));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setIsActive(user?.isActive ?? true);
      setAccessType(accessTypeFromRole(user?.role));
    }
  }, [open, user]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const profileIdRaw = String(form.get("profileId") || "");
    const profileId = profileIdRaw ? profileIdRaw : null;
    const teamIdRaw = String(form.get("teamId") || "");
    const selectedAccess = (String(form.get("accessType") || accessType) as AccessType) || "profile";

    const payload: Record<string, unknown> = {
      name,
      email,
      profileId: selectedAccess === "profile" ? profileId : null,
      teamId: teamIdRaw ? teamIdRaw : null,
    };
    if (isAdmin) {
      payload.role = selectedAccess === "admin" ? ROLES.ADMIN : ROLES.ASSISTANT;
    }

    setSaving(true);
    try {
      if (isEdit && user) {
        await httpClient.put(`/users/${user.id}`, {
          ...payload,
          isActive,
          ...(password ? { password } : {}),
        });
        toast.success("Usuario actualizado con éxito");
      } else {
        await httpClient.post("/users", { ...payload, password });
        toast.success("Usuario creado con éxito");
      }
      onSaved();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar el usuario"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" key={user?.id ?? "new"}>
      <form onSubmit={save}>
        <DialogTitle>{isEdit ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
        <DialogContent className="form-grid" dividers>
          <TextField name="name" label="Nombre" defaultValue={user?.name || ""} fullWidth required />
          <TextField name="email" label="Correo" type="email" defaultValue={user?.email || ""} fullWidth required />
          <TextField
            name="password"
            label={isEdit ? "Nueva contraseña (opcional)" : "Contraseña"}
            type="password"
            fullWidth
            required={!isEdit}
            inputProps={{ minLength: 6 }}
            placeholder={isEdit ? "Dejar en blanco para no cambiarla" : undefined}
            helperText="Es temporal: el usuario tendrá que elegir una propia al entrar."
          />
          {isAdmin ? (
            <TextField
              select
              name="accessType"
              label="Tipo de acceso"
              value={accessType}
              onChange={(e) => setAccessType(e.target.value as AccessType)}
              fullWidth
              helperText="Los administradores tienen acceso total. El costo de productos se controla por perfil (Catalogo: precio de costo)."
              sx={{ gridColumn: "1 / -1" }}
            >
              <MenuItem value="admin">Administrador</MenuItem>
              <MenuItem value="profile">Usuario con perfil</MenuItem>
            </TextField>
          ) : null}
          {(!isAdmin || accessType === "profile") ? (
            <TextField
              select
              name="profileId"
              label="Perfil"
              defaultValue={user?.profileId || ""}
              fullWidth
              helperText="Define qué puede ver y hacer este usuario."
            >
              <MenuItem value="">Sin perfil (acceso base)</MenuItem>
              {profiles.map((profile) => (
                <MenuItem key={profile.id} value={profile.id}>
                  {profile.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          <TextField
            select
            name="teamId"
            label="Equipo"
            defaultValue={user?.teamId || ""}
            fullWidth
            helperText="Los perfiles con alcance 'Solo su equipo' ven pedidos y clientes de este equipo."
          >
            <MenuItem value="">Sin equipo</MenuItem>
            {teams.map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {team.name}
              </MenuItem>
            ))}
          </TextField>
          {isEdit ? (
            <FormControlLabel
              control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
              label={isActive ? "Activo" : "Inactivo"}
              sx={{ gridColumn: "1 / -1" }}
            />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
