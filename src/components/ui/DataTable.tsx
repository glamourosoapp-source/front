"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import { Edit3, Trash2 } from "lucide-react";

interface Column {
  key: string;
  label: string;
  render?: (row: any) => React.ReactNode;
}

interface DataTableProps {
  rows: any[];
  columns: Column[];
  getKey: (row: any) => string | number;
  onRowClick?: (row: any) => void;
  onEdit?: (row: any) => void;
  onDelete?: (row: any) => void;
  getDeleteLabel?: (row: any) => string;
}

export function DataTable({
  rows = [],
  columns = [],
  getKey,
  onRowClick,
  onEdit,
  onDelete,
  getDeleteLabel,
}: DataTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const handleDeleteClick = (row: any) => {
    setDeleteTarget(row);
  };

  const handleConfirmDelete = () => {
    if (onDelete && deleteTarget) {
      onDelete(deleteTarget);
    }
    setDeleteTarget(null);
  };

  const deleteLabel = deleteTarget
    ? getDeleteLabel
      ? getDeleteLabel(deleteTarget)
      : "este registro"
    : "";

  return (
    <>
      <TableContainer component={Paper} elevation={0} className="table-container-premium">
        <Table sx={{ minWidth: 650 }} aria-label="premium data table">
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell key={col.key} className="table-head-cell">
                  {col.label}
                </TableCell>
              ))}
              {(onEdit || onDelete) && (
                <TableCell align="right" className="table-head-cell">
                  Acciones
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (onEdit || onDelete ? 1 : 0)}
                  align="center"
                  sx={{ py: 6, color: "text.secondary" }}
                >
                  No se encontraron registros.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const rowKey = getKey(row);
                return (
                  <TableRow
                    key={rowKey}
                    hover
                    onClick={() => onRowClick?.(row)}
                    sx={{
                      "&:last-child td, &:last-child th": { border: 0 },
                      transition: "background-color 0.2s",
                      cursor: onRowClick ? "pointer" : undefined,
                      "&:hover": {
                        backgroundColor: "rgba(6, 166, 224, 0.04) !important",
                      },
                    }}
                  >
                    {columns.map((col) => (
                      <TableCell key={col.key} className="table-body-cell">
                        {col.render ? col.render(row) : row[col.key] ?? "-"}
                      </TableCell>
                    ))}
                    {(onEdit || onDelete) && (
                      <TableCell align="right">
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                          {onEdit && (
                            <Tooltip title="Editar" arrow>
                              <IconButton
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onEdit(row);
                                }}
                                sx={{
                                  color: "var(--glam-navy)",
                                  backgroundColor: "rgba(38, 45, 96, 0.05)",
                                  "&:hover": {
                                    backgroundColor: "rgba(38, 45, 96, 0.12)",
                                  },
                                }}
                              >
                                <Edit3 size={16} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {onDelete && (
                            <Tooltip title="Eliminar" arrow>
                              <IconButton
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteClick(row);
                                }}
                                sx={{
                                  color: "#d32f2f",
                                  backgroundColor: "rgba(211, 47, 47, 0.05)",
                                  "&:hover": {
                                    backgroundColor: "rgba(211, 47, 47, 0.12)",
                                  },
                                }}
                              >
                                <Trash2 size={16} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialogo de Confirmacion de Eliminacion */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-description"
        PaperProps={{
          sx: {
            borderRadius: 3,
            padding: 1,
            boxShadow: "0 24px 48px rgba(38, 45, 96, 0.12)",
          },
        }}
      >
        <DialogTitle id="confirm-delete-title" sx={{ fontWeight: 700, color: "var(--glam-navy)" }}>
          ¿Confirmar eliminación?
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="confirm-delete-description" sx={{ color: "text.secondary" }}>
            ¿Estás seguro de que deseas eliminar permanentemente <strong>{deleteLabel}</strong>? Esta acción no se puede deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            sx={{
              color: "var(--glam-muted)",
              fontWeight: 700,
              textTransform: "none",
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmDelete}
            variant="contained"
            color="error"
            autoFocus
            sx={{
              fontWeight: 700,
              textTransform: "none",
              borderRadius: 2,
              boxShadow: "0 8px 16px rgba(211, 47, 47, 0.2)",
            }}
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
