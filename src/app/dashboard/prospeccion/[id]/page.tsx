"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Skeleton } from "@mui/material";
import { ArrowLeft, UserCheck } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { DetailField } from "@/components/ui/DetailField";
import { ProspectStatusPill, channelLabel } from "@/components/prospects/prospect-status";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMxPhone } from "@/utils/format-phone";
import { OUTREACH_ATTEMPT_STATUS } from "@glamouroso/shared/constants";
import { toast } from "sonner";

interface OutreachAttemptRow {
  id: string;
  channel: string;
  status: string;
  error?: string | null;
  createdAt: string;
}

interface ProspectDetail {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  businessType?: string | null;
  source?: string;
  status?: string;
  customerId?: string | null;
  convertedAt?: string | null;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
  outreachAttempts?: OutreachAttemptRow[];
  customer?: { id: string; name: string; phone?: string | null } | null;
}

const SOURCE_LABELS: Record<string, string> = {
  google_places: "Google Places",
  google_places_mock: "Google Places",
  manual: "Manual",
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function attemptStatusLabel(status: string) {
  if (status === OUTREACH_ATTEMPT_STATUS.SENT) return "Enviado";
  if (status === OUTREACH_ATTEMPT_STATUS.COMPLETED) return "Completado";
  if (status === OUTREACH_ATTEMPT_STATUS.FAILED) return "Fallido";
  if (status === OUTREACH_ATTEMPT_STATUS.PENDING) return "Pendiente";
  return status;
}

export default function ProspectDetailPage() {
  const params = useParams<{ id: string }>();
  const prospectId = params.id;

  const [prospect, setProspect] = useState<ProspectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProspect(await httpClient.get<ProspectDetail>(`/prospects/${prospectId}`));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar el prospecto"));
    } finally {
      setLoading(false);
    }
  }, [prospectId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (loading) {
    return (
      <div className="page-stack">
        <Skeleton variant="text" width={280} height={40} />
        <Skeleton variant="rounded" height={180} />
        <Skeleton variant="rounded" height={240} />
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="page-stack">
        <Link href="/dashboard/prospeccion" className="flex items-center gap-1" style={{ color: "var(--glam-blue)" }}>
          <ArrowLeft size={16} /> Volver a Prospeccion
        </Link>
        <section className="panel p-5">
          <p className="page-kicker">No se encontro el prospecto.</p>
        </section>
      </div>
    );
  }

  const attempts = prospect.outreachAttempts || [];
  const searchQuery = (prospect.metadata as { searchQuery?: string } | null)?.searchQuery;

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <Link
            href="/dashboard/prospeccion"
            className="flex items-center gap-1"
            style={{ color: "var(--glam-blue)", fontSize: 13, fontWeight: 600 }}
          >
            <ArrowLeft size={16} /> Volver a Prospeccion
          </Link>
          <h1 className="page-title" style={{ marginTop: 8 }}>
            {prospect.name}
          </h1>
          <p className="page-kicker">
            <span className="flex items-center gap-2">
              <ProspectStatusPill status={prospect.status} />
              {searchQuery ? <span>Importado con: “{searchQuery}”</span> : null}
            </span>
          </p>
        </div>
        {prospect.customer && (
          <Button
            component={Link}
            href={`/dashboard/customers/${prospect.customer.id}`}
            variant="contained"
            startIcon={<UserCheck size={16} />}
          >
            Ver cliente
          </Button>
        )}
      </div>

      <section className="panel p-5">
        <h2>Datos del negocio</h2>
        <div className="grid grid-4" style={{ marginTop: 12 }}>
          <DetailField label="Telefono" value={formatMxPhone(prospect.phone) || "—"} />
          <DetailField label="Ciudad" value={prospect.city || "—"} />
          <DetailField label="Giro" value={prospect.businessType || "—"} />
          <DetailField
            label="Origen"
            value={SOURCE_LABELS[prospect.source || ""] || prospect.source || "—"}
          />
          <DetailField label="Direccion" value={prospect.address || "—"} />
          <DetailField label="Importado" value={formatDateTime(prospect.createdAt)} />
          <DetailField label="Convertido" value={formatDateTime(prospect.convertedAt)} />
          <DetailField
            label="Cliente"
            value={
              prospect.customer ? (
                <Link href={`/dashboard/customers/${prospect.customer.id}`} style={{ color: "var(--glam-blue)" }}>
                  {prospect.customer.name}
                </Link>
              ) : (
                "—"
              )
            }
          />
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Historial de outreach</h2>
            <p className="page-kicker">Intentos de contacto por WhatsApp y llamada.</p>
          </div>
          <span className="pill">{attempts.length} intentos</span>
        </div>
        <DataTable
          rows={attempts}
          getKey={(row) => row.id}
          columns={[
            { key: "createdAt", label: "Fecha", render: (row) => formatDateTime(row.createdAt) },
            { key: "channel", label: "Canal", render: (row) => channelLabel(row.channel) },
            {
              key: "status",
              label: "Resultado",
              render: (row) => (
                <span
                  className={
                    row.status === OUTREACH_ATTEMPT_STATUS.FAILED
                      ? "pill-danger"
                      : row.status === OUTREACH_ATTEMPT_STATUS.PENDING
                        ? "pill"
                        : "pill-success"
                  }
                >
                  {attemptStatusLabel(row.status)}
                </span>
              ),
            },
            {
              key: "error",
              label: "Detalle",
              render: (row) => row.error || "—",
            },
          ]}
        />
      </section>
    </div>
  );
}
