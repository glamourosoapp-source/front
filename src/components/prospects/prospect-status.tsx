import { PROSPECT_STATUS, OUTREACH_CHANNEL } from "@glamouroso/shared/constants";

interface StatusMeta {
  label: string;
  className: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  [PROSPECT_STATUS.NEW]: { label: "Nuevo", className: "pill" },
  [PROSPECT_STATUS.CONTACTED_WHATSAPP]: { label: "WhatsApp enviado", className: "pill-success" },
  [PROSPECT_STATUS.CONTACTED_VOICE]: { label: "Llamado", className: "pill-success" },
  [PROSPECT_STATUS.FAILED]: { label: "Fallido", className: "pill-danger" },
};

export function statusMeta(status?: string | null): StatusMeta {
  if (status && STATUS_META[status]) return STATUS_META[status];
  return { label: status || "Nuevo", className: "pill" };
}

export function ProspectStatusPill({ status }: { status?: string | null }) {
  const meta = statusMeta(status);
  return <span className={meta.className}>{meta.label}</span>;
}

const CHANNEL_LABEL: Record<string, string> = {
  [OUTREACH_CHANNEL.WHATSAPP]: "WhatsApp",
  [OUTREACH_CHANNEL.VOICE]: "Llamada",
  [OUTREACH_CHANNEL.BOTH]: "WhatsApp + Llamada",
};

export function channelLabel(channel?: string | null): string {
  if (channel && CHANNEL_LABEL[channel]) return CHANNEL_LABEL[channel];
  return channel || "-";
}
