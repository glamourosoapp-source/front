"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { ShieldAlert } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";
import { toast } from "sonner";

interface WhatsAppConfig {
  phoneNumberId?: string;
  displayPhone?: string;
  webhookSecret?: string;
  settings?: { aiProvider?: string; model?: string };
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { can } = usePermissions();
  const canSettings = can("settings", "view");
  const [settings, setSettings] = useState<WhatsAppConfig | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!canSettings) return;
    httpClient
      .get<WhatsAppConfig>("/whatsapp/config")
      .then(setSettings)
      .catch((error) => toast.error(getApiErrorMessage(error, "Error al cargar la configuracion")));
  }, [canSettings]);

  if (user && !canSettings) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Solo administradores</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              La configuracion del sistema (WhatsApp Kapso e IA) solo esta disponible para el
              administrador. Pide acceso a tu administrador si necesitas un cambio.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await httpClient.put<WhatsAppConfig>("/whatsapp/config", {
        phoneNumberId: String(form.get("phoneNumberId") || ""),
        displayPhone: String(form.get("displayPhone") || ""),
        webhookSecret: String(form.get("webhookSecret") || ""),
        isActive: true,
        settings: {
          aiProvider: String(form.get("aiProvider") || "deepseek"),
          model: String(form.get("model") || "deepseek-chat"),
        },
      });
      setSettings(result);
      setOpen(false);
      toast.success("Configuración de WhatsApp e IA guardada con éxito");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar la configuración"));
    }
  }

  const kapsoConfigured = Boolean(settings?.phoneNumberId);

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Configuracion</h1>
          <p className="page-kicker">
            Conexion de WhatsApp (Kapso) y proveedor de IA. Visible solo para administradores.
          </p>
        </div>
        <Button variant="contained" onClick={() => setOpen(true)}>Editar configuracion</Button>
      </div>
      <section className="grid grid-2">
        <div className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <h2>Kapso WhatsApp</h2>
            <span className={kapsoConfigured ? "pill-success" : "pill warning"}>
              {kapsoConfigured ? "Configurado" : "Sin configurar"}
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            <div className="flex items-center justify-between gap-3 border-b border-glam-line py-2 text-sm text-glam-muted">
              <span>Phone ID</span>
              <strong>{settings?.phoneNumberId || "Sin configurar"}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-glam-line py-2 text-sm text-glam-muted">
              <span>Telefono</span>
              <strong>{settings?.displayPhone || "Sin configurar"}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-glam-line py-2 text-sm text-glam-muted">
              <span>Webhook secret</span>
              <strong>{settings?.webhookSecret ? "••••••••" : "Sin configurar"}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-glam-line py-2 text-sm text-glam-muted">
              <span>Proveedor IA</span>
              <strong>{settings?.settings?.aiProvider || "deepseek"}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 py-2 text-sm text-glam-muted">
              <span>Modelo</span>
              <strong>{settings?.settings?.model || "deepseek-chat"}</strong>
            </div>
          </div>
        </div>
        <div className="panel p-5">
          <h2>Webhook Kapso</h2>
          <p>Pasos para conectar WhatsApp:</p>
          <ol className="mt-2 grid gap-2 text-sm" style={{ paddingLeft: 18 }}>
            <li>En Kapso, copia el Phone Number ID de tu numero y pegalo aqui en Editar configuracion.</li>
            <li>
              En Kapso, registra el webhook apuntando a:
              <br />
              <code>{"<URL del backend>"}/api/webhooks/kapso</code>
            </li>
            <li>Pega el secreto del webhook de Kapso en el campo Webhook secret.</li>
          </ol>
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            El backend valida la firma del webhook cuando hay secreto configurado y descarta eventos
            duplicados automaticamente.
          </p>
        </div>
      </section>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={save}>
          <DialogTitle>Editar configuracion</DialogTitle>
          <DialogContent className="form-grid" dividers>
            <TextField
              name="phoneNumberId"
              label="Phone number ID"
              defaultValue={settings?.phoneNumberId || ""}
              helperText="ID del numero de WhatsApp en Kapso"
              fullWidth
            />
            <TextField
              name="displayPhone"
              label="Telefono visible"
              defaultValue={settings?.displayPhone || ""}
              helperText="Ej: +52 33 1234 5678"
              fullWidth
            />
            <TextField
              name="webhookSecret"
              label="Webhook secret"
              type="password"
              defaultValue={settings?.webhookSecret || ""}
              helperText="Secreto del webhook configurado en Kapso"
              fullWidth
            />
            <TextField name="aiProvider" label="Proveedor IA" defaultValue={settings?.settings?.aiProvider || "deepseek"} fullWidth />
            <TextField name="model" label="Modelo" defaultValue={settings?.settings?.model || "deepseek-chat"} fullWidth />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="contained">Guardar</Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}
