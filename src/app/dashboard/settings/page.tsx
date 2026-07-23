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
  MenuItem,
  TextField,
} from "@mui/material";
import { ShieldAlert } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";
import type { DeliveryScheduleConfig } from "@glamouroso/shared";
import { toast } from "sonner";

interface WhatsAppConfig {
  phoneNumberId?: string;
  displayPhone?: string;
  webhookSecret?: string;
  settings?: { aiProvider?: string; model?: string };
}

const OFFSET_LABELS = ["Mismo día", "+1 día", "+2 días", "+3 días", "+4 días", "+5 días", "+6 días", "+7 días"];

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { can } = usePermissions();
  const canSettings = can("settings", "view");
  const [settings, setSettings] = useState<WhatsAppConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryScheduleConfig | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);

  useEffect(() => {
    if (!canSettings) return;
    httpClient
      .get<WhatsAppConfig>("/whatsapp/config")
      .then(setSettings)
      .catch((error) => toast.error(getApiErrorMessage(error, "Error al cargar la configuracion")));
    httpClient
      .get<DeliveryScheduleConfig>("/settings/delivery")
      .then(setDelivery)
      .catch((error) => toast.error(getApiErrorMessage(error, "Error al cargar la configuracion de entregas")));
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

  async function saveDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await httpClient.put<DeliveryScheduleConfig>("/settings/delivery", {
        cutoffTime: String(form.get("cutoffTime") || "15:00"),
        offsetBeforeCutoffDays: Number(form.get("offsetBeforeCutoffDays") ?? 1),
        offsetAfterCutoffDays: Number(form.get("offsetAfterCutoffDays") ?? 2),
        timezone: String(form.get("timezone") || "America/Mexico_City"),
        skipSundays: form.get("skipSundays") === "on",
      });
      setDelivery(result);
      setDeliveryOpen(false);
      toast.success("Configuración de entregas guardada con éxito");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar la configuración de entregas"));
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
              En Kapso, registra el webhook del numero apuntando al agente (eve), no al backend:
              <br />
              <code>https://glamouroso-agent.vercel.app/webhook</code>
            </li>
            <li>
              Suscribete al evento <code>whatsapp.message.received</code> (los de status/delivered no
              invocan al agente).
            </li>
            <li>
              El secreto del webhook en Kapso debe coincidir con{" "}
              <code>KAPSO_WEBHOOK_SECRET</code> del proyecto Vercel <code>glamouroso-agent</code>{" "}
              (tambien puedes guardarlo aqui para referencia).
            </li>
          </ol>
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            El agente valida la firma HMAC, resuelve la organizacion por Phone Number ID y descarta
            reintentos duplicados. Sin Phone Number ID activo en esta configuracion, los mensajes se
            ignoran en silencio.
          </p>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <h2>Entregas</h2>
            <Button size="small" variant="outlined" onClick={() => setDeliveryOpen(true)} disabled={!delivery}>
              Editar entregas
            </Button>
          </div>
          <p className="page-kicker mt-1">
            Regla de agendamiento automático: los pedidos recibidos a partir de la hora de corte se
            entregan más días después.
          </p>
          <div className="mt-4 grid gap-3">
            <div className="flex items-center justify-between gap-3 border-b border-glam-line py-2 text-sm text-glam-muted">
              <span>Hora de corte</span>
              <strong>{delivery?.cutoffTime || "15:00"}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-glam-line py-2 text-sm text-glam-muted">
              <span>Entrega antes del corte</span>
              <strong>{OFFSET_LABELS[delivery?.offsetBeforeCutoffDays ?? 1] || `+${delivery?.offsetBeforeCutoffDays} días`}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-glam-line py-2 text-sm text-glam-muted">
              <span>Entrega después del corte</span>
              <strong>{OFFSET_LABELS[delivery?.offsetAfterCutoffDays ?? 2] || `+${delivery?.offsetAfterCutoffDays} días`}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-glam-line py-2 text-sm text-glam-muted">
              <span>Zona horaria</span>
              <strong>{delivery?.timezone || "America/Mexico_City"}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 py-2 text-sm text-glam-muted">
              <span>Domingos</span>
              <strong>{delivery?.skipSundays === false ? "Se entrega" : "Sin entregas (pasa a lunes)"}</strong>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={deliveryOpen} onClose={() => setDeliveryOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={saveDelivery}>
          <DialogTitle>Editar configuracion de entregas</DialogTitle>
          <DialogContent className="form-grid" dividers>
            <TextField
              name="cutoffTime"
              label="Hora de corte"
              type="time"
              defaultValue={delivery?.cutoffTime || "15:00"}
              helperText="Los pedidos recibidos a partir de esta hora usan el desfase 'después del corte'"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              select
              name="offsetBeforeCutoffDays"
              label="Entrega antes del corte"
              defaultValue={delivery?.offsetBeforeCutoffDays ?? 1}
              fullWidth
            >
              {OFFSET_LABELS.map((label, index) => (
                <MenuItem key={label} value={index}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              name="offsetAfterCutoffDays"
              label="Entrega después del corte"
              defaultValue={delivery?.offsetAfterCutoffDays ?? 2}
              fullWidth
            >
              {OFFSET_LABELS.map((label, index) => (
                <MenuItem key={label} value={index}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              name="timezone"
              label="Zona horaria"
              defaultValue={delivery?.timezone || "America/Mexico_City"}
              helperText="Ej: America/Mexico_City"
              fullWidth
            />
            <FormControlLabel
              control={<Checkbox name="skipSundays" defaultChecked={delivery?.skipSundays !== false} />}
              label="Sin entregas en domingo (pasan a lunes)"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeliveryOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="contained">Guardar</Button>
          </DialogActions>
        </form>
      </Dialog>

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
