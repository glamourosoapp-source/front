"use client";

import { useRouter } from "next/navigation";
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import type { CustomerFollowupRow } from "@glamouroso/shared/schemas/customer-followup";
import { formatMxPhone } from "@/utils/format-phone";
import { FOLLOWUP_BUCKET_LABELS, followupWhatsappMessage } from "@/constants/customer-followup";
import { ContactActions } from "./ContactActions";

interface CustomerFollowupTableProps {
  rows: CustomerFollowupRow[];
  /** El admin ve de quién es cada cliente; el vendedor solo ve los suyos. */
  showSeller: boolean;
  /** Nombre de quien manda el WhatsApp (usuario logueado). */
  senderName?: string | null;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function CustomerFollowupTable({ rows, showSeller, senderName }: CustomerFollowupTableProps) {
  const router = useRouter();

  return (
    <TableContainer component={Paper} elevation={0} className="table-container-premium">
      <Table sx={{ minWidth: showSeller ? 820 : 700 }}>
        <TableHead>
          <TableRow>
            <TableCell>Cliente</TableCell>
            <TableCell>Teléfono</TableCell>
            <TableCell>Zona</TableCell>
            <TableCell>Último pedido</TableCell>
            <TableCell>Sin comprar</TableCell>
            <TableCell>Pedidos</TableCell>
            {showSeller && <TableCell>Vendedor</TableCell>}
            <TableCell align="right">Contactar</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              hover
              sx={{ cursor: "pointer" }}
              onClick={() => router.push(`/dashboard/customers/${row.id}`)}
            >
              <TableCell>
                <span style={{ color: "var(--glam-blue)", fontWeight: 600 }}>{row.name}</span>
              </TableCell>
              <TableCell>{formatMxPhone(row.phone)}</TableCell>
              <TableCell>{row.zone || "—"}</TableCell>
              <TableCell>{formatDate(row.lastSaleAt)}</TableCell>
              <TableCell>
                <span className="pill warning" title={FOLLOWUP_BUCKET_LABELS[row.bucket]}>
                  {row.daysSinceLastSale} días
                </span>
              </TableCell>
              <TableCell>{row.effectiveOrders}</TableCell>
              {showSeller && <TableCell>{row.seller.name}</TableCell>}
              <TableCell align="right">
                <ContactActions
                  phone={row.phone}
                  message={followupWhatsappMessage({
                    customerName: row.name,
                    sellerName: senderName,
                    days: row.daysSinceLastSale,
                  })}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
