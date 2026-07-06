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
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { Profile, User } from "@/types";
import { toast } from "sonner";

interface UserFormDialogProps {
  open: boolean;
  user: User | null;
  profiles: Profile[];
  onClose: () => void;
  onSaved: () => void;
}

export function UserFormDialog({ open, user, profiles, onClose, onSaved }: UserFormDialogProps) {
  const isEdit = Boolean(user);
  const [isActive, setIsActive] = useState(user?.isActive ?? true);

  // El componente no se remonta al cambiar de usuario: sincroniza el switch al abrir.
  useEffect(() => {
    if (open) setIsActive(user?.isActive ?? true);
  }, [open, user]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const profileIdRaw = String(form.get("profileId") || "");
    const profileId = profileIdRaw ? profileIdRaw : null;

    try {
      if (isEdit && user) {
        await httpClient.put(`/users/${user.id}`, {
          name,
          email,
          profileId,
          isActive,
          ...(password ? { password } : {}),
        });
        toast.success("Usuario actualizado con éxito");
      } else {
        await httpClient.post("/users", { name, email, password, profileId });
        toast.success("Usuario creado con éxito");
      }
      onSaved();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar el usuario"));
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
          />
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
          <Button type="submit" variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
