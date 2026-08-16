"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { evaluatePasswordRules, isStrongPassword } from "@glamouroso/shared/schemas/auth";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useAuthStore } from "@/stores/auth.store";
import { User } from "@/types";
import { toast } from "sonner";

/**
 * Modal bloqueante del primer ingreso: aparece mientras el usuario siga con la
 * contraseña que le puso el administrador (`user.mustChangePassword`). No se
 * puede cerrar con Escape ni clickeando afuera; la única salida sin cambiarla
 * es cerrar sesión.
 */
export function ForcePasswordChangeDialog({ open }: { open: boolean }) {
  const applySession = useAuthStore((s) => s.applySession);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const rules = evaluatePasswordRules(newPassword);
  const strong = isStrongPassword(newPassword);
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const sameAsCurrent = newPassword.length > 0 && newPassword === currentPassword;
  const canSubmit =
    Boolean(currentPassword) && strong && !mismatch && !sameAsCurrent && confirmPassword === newPassword;

  const visibilityToggle = (
    <InputAdornment position="end">
      <IconButton
        onClick={() => setVisible((v) => !v)}
        edge="end"
        aria-label={visible ? "Ocultar contraseñas" : "Mostrar contraseñas"}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </IconButton>
    </InputAdornment>
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const session = await httpClient.post<{ token: string; user: User }>("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      applySession(session.token, session.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Contraseña actualizada con éxito");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cambiar la contraseña"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => undefined}
      disableEscapeKeyDown
      fullWidth
      maxWidth="xs"
      aria-labelledby="force-password-title"
    >
      <form onSubmit={submit}>
        <DialogTitle id="force-password-title">Cambia tu contraseña</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              La contraseña que te dio el administrador es temporal. Elegí una propia para seguir usando el
              CRM.
            </Alert>

            <TextField
              label="Contraseña actual"
              type={visible ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              fullWidth
              required
              autoFocus
              InputProps={{ endAdornment: visibilityToggle }}
            />

            <TextField
              label="Nueva contraseña"
              type={visible ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              fullWidth
              required
              error={sameAsCurrent}
              helperText={sameAsCurrent ? "Tiene que ser distinta de la actual." : undefined}
              InputProps={{ endAdornment: visibilityToggle }}
            />

            <TextField
              label="Confirmar nueva contraseña"
              type={visible ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              fullWidth
              required
              error={mismatch}
              helperText={mismatch ? "Las contraseñas no coinciden." : undefined}
              InputProps={{ endAdornment: visibilityToggle }}
            />

            <Stack spacing={0.5} component="ul" sx={{ listStyle: "none", m: 0, pl: 0 }}>
              {rules.map((rule) => (
                <Typography
                  key={rule.id}
                  component="li"
                  variant="body2"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    color: rule.ok ? "success.main" : "text.secondary",
                  }}
                >
                  {rule.ok ? <Check size={15} /> : <X size={15} />}
                  {rule.label}
                </Typography>
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              logout();
              router.push("/login");
            }}
          >
            Cerrar sesión
          </Button>
          <Button type="submit" variant="contained" disabled={!canSubmit || saving}>
            {saving ? "Guardando..." : "Guardar contraseña"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
