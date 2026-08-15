"use client";

import { FormEvent, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { Team } from "@/types";
import { toast } from "sonner";

interface TeamFormDialogProps {
  open: boolean;
  team: Team | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TeamFormDialog({ open, team, onClose, onSaved }: TeamFormDialogProps) {
  const isEdit = Boolean(team);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { name: String(form.get("name") || "").trim() };
    setSaving(true);
    try {
      if (isEdit && team) {
        await httpClient.put(`/teams/${team.id}`, payload);
        toast.success("Equipo actualizado con éxito");
      } else {
        await httpClient.post("/teams", payload);
        toast.success("Equipo creado con éxito");
      }
      onSaved();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar el equipo"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" key={team?.id ?? "new"}>
      <form onSubmit={save}>
        <DialogTitle>{isEdit ? "Editar equipo" : "Nuevo equipo"}</DialogTitle>
        <DialogContent dividers>
          <TextField
            name="name"
            label="Nombre del equipo"
            defaultValue={team?.name || ""}
            fullWidth
            required
            inputProps={{ minLength: 2, maxLength: 80 }}
          />
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
