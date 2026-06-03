"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { httpClient } from "@/services/http-client";
import { toast } from "sonner";

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { httpClient.get("/whatsapp/config").then(setSettings); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await httpClient.put("/whatsapp/config", {
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
    } catch (err) {
      toast.error("Error al guardar la configuración");
    }
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Configuracion</h1>
          <p className="page-kicker">Parametros de Kapso, webhook y proveedor de IA para el CRM.</p>
        </div>
        <Button variant="contained" onClick={() => setOpen(true)}>Editar configuracion</Button>
      </div>
      <section className="grid grid-2">
        <div className="panel p-5">
          <h2>Kapso WhatsApp</h2>
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
          <p>Configura en Kapso el endpoint:</p>
          <code>/api/webhooks/kapso</code>
          <p>El backend valida firma cuando `KAPSO_WEBHOOK_SECRET` esta configurado y guarda eventos para idempotencia.</p>
        </div>
      </section>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={save}>
          <DialogTitle>Editar configuracion</DialogTitle>
          <DialogContent className="form-grid" dividers>
            <TextField name="phoneNumberId" label="Phone number ID" defaultValue={settings?.phoneNumberId || ""} fullWidth />
            <TextField name="displayPhone" label="Telefono visible" defaultValue={settings?.displayPhone || ""} fullWidth />
            <TextField name="webhookSecret" label="Webhook secret" defaultValue={settings?.webhookSecret || ""} fullWidth />
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
