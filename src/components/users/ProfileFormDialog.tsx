"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  ORDER_SCOPES,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
} from "@glamouroso/shared/constants";
import type { OrderScope, PermissionAction, PermissionMap, PermissionModule } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { Profile } from "@/types";
import { toast } from "sonner";

interface ProfileFormDialogProps {
  open: boolean;
  profile: Profile | null;
  onClose: () => void;
  onSaved: () => void;
}

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Ver",
  create: "Crear",
  update: "Editar",
  delete: "Eliminar",
};

export function ProfileFormDialog({ open, profile, onClose, onSaved }: ProfileFormDialogProps) {
  const isEdit = Boolean(profile);
  const [permissions, setPermissions] = useState<PermissionMap>(() => ({ ...(profile?.permissions ?? {}) }));

  // El componente no se remonta al cambiar de perfil: sincroniza la matriz al abrir.
  useEffect(() => {
    if (open) setPermissions({ ...(profile?.permissions ?? {}) });
  }, [open, profile]);

  const isChecked = (module: PermissionModule, action: PermissionAction) =>
    permissions[module]?.[action] === true;

  const toggle = (module: PermissionModule, action: PermissionAction) => {
    setPermissions((prev) => {
      const current = { ...(prev[module] ?? {}) };
      current[action] = !current[action];
      return { ...prev, [module]: current };
    });
  };

  const scope: OrderScope =
    permissions.orders?.scope === ORDER_SCOPES.OWN ? ORDER_SCOPES.OWN : ORDER_SCOPES.ALL;

  const setScope = (value: OrderScope) => {
    setPermissions((prev) => ({ ...prev, orders: { ...(prev.orders ?? {}), scope: value } }));
  };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || "").trim(),
      description: String(form.get("description") || ""),
      permissions,
    };
    try {
      if (isEdit && profile) {
        await httpClient.put(`/profiles/${profile.id}`, payload);
        toast.success("Perfil actualizado con éxito");
      } else {
        await httpClient.post("/profiles", payload);
        toast.success("Perfil creado con éxito");
      }
      onSaved();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar el perfil"));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" key={profile?.id ?? "new"}>
      <form onSubmit={save}>
        <DialogTitle>{isEdit ? "Editar perfil" : "Nuevo perfil"}</DialogTitle>
        <DialogContent dividers>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <TextField name="name" label="Nombre del perfil" defaultValue={profile?.name || ""} fullWidth required />
            <TextField
              name="description"
              label="Descripción"
              defaultValue={profile?.description || ""}
              fullWidth
            />
          </div>

          <Typography variant="subtitle2" sx={{ mb: 1, color: "var(--glam-navy)" }}>
            Permisos por módulo
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Módulo</TableCell>
                {PERMISSION_ACTIONS.map((action) => (
                  <TableCell key={action} align="center">
                    {ACTION_LABELS[action]}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {PERMISSION_MODULES.map((module) => (
                <TableRow key={module.key}>
                  <TableCell>{module.label}</TableCell>
                  {PERMISSION_ACTIONS.map((action) => (
                    <TableCell key={action} align="center" padding="none">
                      <Checkbox
                        size="small"
                        checked={isChecked(module.key, action)}
                        onChange={() => toggle(module.key, action)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5, color: "var(--glam-navy)" }}>
            Alcance de pedidos
          </Typography>
          <RadioGroup row value={scope} onChange={(e) => setScope(e.target.value as OrderScope)}>
            <FormControlLabel value={ORDER_SCOPES.ALL} control={<Radio size="small" />} label="Todos los pedidos" />
            <FormControlLabel value={ORDER_SCOPES.OWN} control={<Radio size="small" />} label="Solo los suyos" />
          </RadioGroup>
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
