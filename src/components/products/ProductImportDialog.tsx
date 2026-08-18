"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import type {
  ProductImportChange,
  ProductImportPreview,
  ProductImportResult,
  ProductImportRow,
  ProductImportWarnings,
} from "@glamouroso/shared/schemas/product";
import { parseProductImportFile } from "@/lib/parse-product-import-xlsx";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { toast } from "sonner";

const MAX_ROWS = 3000;
const MAX_RENDER = 200;

const FIELD_LABELS: Record<ProductImportChange["field"], string> = {
  price: "Menudeo",
  wholesalePrice: "Mayoreo",
  cost: "Costo",
  stock: "Stock",
  minStock: "Stock mín.",
  category: "Categoría",
  sku: "SKU",
};

const MONEY_FIELDS = new Set(["price", "wholesalePrice", "cost"]);

function changeLabel(change: ProductImportChange): string {
  const format = (value: string | number | null) => {
    if (value == null || value === "") return "—";
    return MONEY_FIELDS.has(change.field) ? `$${Number(value).toFixed(2)}` : String(value);
  };
  return `${FIELD_LABELS[change.field]}: ${format(change.from)} → ${format(change.to)}`;
}

function NameList({ names }: { names: string[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <Button size="small" onClick={() => setExpanded((value) => !value)} sx={{ ml: 1, py: 0 }}>
        {expanded ? "Ocultar" : "Ver lista"}
      </Button>
      <Collapse in={expanded}>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {names.slice(0, MAX_RENDER).map((name) => (
            <li key={name}>{name}</li>
          ))}
          {names.length > MAX_RENDER ? <li>…y {names.length - MAX_RENDER} más</li> : null}
        </ul>
      </Collapse>
    </>
  );
}

function WarningAlerts({ warnings, context }: { warnings: ProductImportWarnings; context: "preview" | "done" }) {
  return (
    <Stack spacing={1}>
      {warnings.newWithoutDescription.length > 0 ? (
        <Alert severity="warning">
          {warnings.newWithoutDescription.length} producto(s) nuevo(s){" "}
          {context === "preview" ? "quedarán" : "quedaron"} sin descripción.
          <NameList names={warnings.newWithoutDescription} />
        </Alert>
      ) : null}
      {warnings.duplicateNames.length > 0 || warnings.duplicatePosIds.length > 0 ? (
        <Alert severity="warning">
          El archivo trae filas repetidas (se usó la última de cada una):{" "}
          {[...warnings.duplicateNames, ...warnings.duplicatePosIds.map((id) => `ID ${id}`)].join(", ")}
        </Alert>
      ) : null}
      {warnings.missingDepartment.length > 0 ? (
        <Alert severity="info">
          {warnings.missingDepartment.length} producto(s) sin departamento irán a &quot;Sin categoría&quot;.
          <NameList names={warnings.missingDepartment} />
        </Alert>
      ) : null}
      {warnings.costIgnored ? (
        <Alert severity="info">La columna de costo se ignoró porque no tienes permiso para editar costos.</Alert>
      ) : null}
      {warnings.createSkipped ? (
        <Alert severity="warning">
          No tienes permiso para crear productos: los productos nuevos del archivo{" "}
          {context === "preview" ? "se omitirán" : "se omitieron"}.
        </Alert>
      ) : null}
    </Stack>
  );
}

type Phase = "select" | "processing" | "preview" | "applying" | "done";

interface ProductImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function ProductImportDialog({ open, onClose, onImported }: ProductImportDialogProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ProductImportRow[]>([]);
  const [skippedRows, setSkippedRows] = useState(0);
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const [error, setError] = useState("");

  const busy = phase === "processing" || phase === "applying";

  function reset() {
    setPhase("select");
    setFileName("");
    setRows([]);
    setSkippedRows(0);
    setPreview(null);
    setResult(null);
    setError("");
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setError("");
    setFileName(file.name);
    setPhase("processing");
    try {
      const parsed = await parseProductImportFile(file);
      if (parsed.missingColumns.length) {
        throw new Error(`El archivo no trae las columnas requeridas: ${parsed.missingColumns.join(", ")}`);
      }
      if (!parsed.rows.length) {
        throw new Error("No se encontraron productos válidos en el archivo (se necesita ID y Descripcion).");
      }
      if (parsed.rows.length > MAX_ROWS) {
        throw new Error(`El archivo trae ${parsed.rows.length} productos; el máximo por importación es ${MAX_ROWS}.`);
      }
      setRows(parsed.rows);
      setSkippedRows(parsed.skippedRows);
      const previewResult = await httpClient.post<ProductImportPreview>("/products/import", {
        rows: parsed.rows,
        dryRun: true,
      });
      setPreview(previewResult);
      setPhase("preview");
    } catch (err) {
      setError(getApiErrorMessage(err, (err as Error).message || "No se pudo leer el archivo"));
      setPhase("select");
    }
  }

  async function applyImport() {
    setPhase("applying");
    try {
      const applied = await httpClient.post<ProductImportResult>("/products/import", { rows, dryRun: false });
      setResult(applied);
      setPhase("done");
      toast.success(`Importación aplicada: ${applied.created.length} creados, ${applied.updated.length} actualizados`);
      onImported();
    } catch (err) {
      setError(getApiErrorMessage(err, "Error al aplicar la importación"));
      setPhase("preview");
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 700, color: "var(--glam-navy)" }}>
        Importar productos desde Excel
      </DialogTitle>
      <DialogContent dividers>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {phase === "select" ? (
          <Stack spacing={2} alignItems="flex-start">
            <p className="text-sm">
              Sube el Excel del punto de venta (.xls o .xlsx). Se esperan las columnas{" "}
              <strong>Descripcion</strong>, <strong>Precio Venta</strong>, <strong>Precio Mayoreo</strong>,{" "}
              <strong>costo</strong>, <strong>Inventario</strong>, <strong>Inv. Minimo</strong> y{" "}
              <strong>Departamento</strong>, con el ID del producto en la primera columna. Antes de aplicar nada verás
              una vista previa con lo que se creará y lo que se actualizará.
            </p>
            <Button variant="contained" component="label">
              Elegir archivo
              <input
                type="file"
                accept=".xls,.xlsx"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleFile(file);
                }}
              />
            </Button>
          </Stack>
        ) : null}

        {phase === "processing" || phase === "applying" ? (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <CircularProgress />
            <p className="text-sm">
              {phase === "processing" ? `Analizando ${fileName}...` : "Aplicando importación..."}
            </p>
          </Stack>
        ) : null}

        {phase === "preview" && preview ? (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip color="success" label={`Se crearán ${preview.toCreate.length}`} />
              <Chip color="info" label={`Se actualizarán ${preview.toUpdate.length}`} />
              <Chip label={`Sin cambios: ${preview.unchanged}`} />
              {skippedRows > 0 ? <Chip variant="outlined" label={`${skippedRows} filas descartadas`} /> : null}
              {preview.categoriesToCreate.length > 0 ? (
                <Chip color="secondary" label={`Categorías nuevas: ${preview.categoriesToCreate.join(", ")}`} />
              ) : null}
            </Stack>

            <WarningAlerts warnings={preview.warnings} context="preview" />

            {preview.toCreate.length > 0 ? (
              <div>
                <p className="form-section-title">Se crearán</p>
                <div style={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Producto</TableCell>
                        <TableCell>Departamento</TableCell>
                        <TableCell align="right">Menudeo</TableCell>
                        <TableCell align="right">Mayoreo</TableCell>
                        <TableCell>Descripción</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.toCreate.slice(0, MAX_RENDER).map((item) => (
                        <TableRow key={item.posId}>
                          <TableCell>{item.posId}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>{item.department ?? "Sin categoría"}</TableCell>
                          <TableCell align="right">${item.price.toFixed(2)}</TableCell>
                          <TableCell align="right">${item.wholesalePrice.toFixed(2)}</TableCell>
                          <TableCell>{item.hasDescription ? "Sí" : "Sin descripción"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {preview.toCreate.length > MAX_RENDER ? (
                  <p className="text-sm">…y {preview.toCreate.length - MAX_RENDER} más</p>
                ) : null}
              </div>
            ) : null}

            {preview.toUpdate.length > 0 ? (
              <div>
                <p className="form-section-title">Se actualizarán</p>
                <div style={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Producto</TableCell>
                        <TableCell>Cambios</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.toUpdate.slice(0, MAX_RENDER).map((item) => (
                        <TableRow key={item.productId}>
                          <TableCell>{item.posId}</TableCell>
                          <TableCell>
                            {item.name}
                            {item.willRestore ? <Chip size="small" color="warning" label="Se reactivará" sx={{ ml: 1 }} /> : null}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              {item.changes.map((change, index) => (
                                <Chip key={index} size="small" variant="outlined" label={changeLabel(change)} />
                              ))}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {preview.toUpdate.length > MAX_RENDER ? (
                  <p className="text-sm">…y {preview.toUpdate.length - MAX_RENDER} más</p>
                ) : null}
              </div>
            ) : null}
          </Stack>
        ) : null}

        {phase === "done" && result ? (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip color="success" label={`Creados: ${result.created.length}`} />
              <Chip color="info" label={`Actualizados: ${result.updated.length}`} />
              <Chip label={`Sin cambios: ${result.unchanged}`} />
              {result.skipped.length > 0 ? <Chip color="warning" label={`Omitidos: ${result.skipped.length}`} /> : null}
              {result.errors.length > 0 ? <Chip color="error" label={`Errores: ${result.errors.length}`} /> : null}
              {result.categoriesCreated > 0 ? <Chip color="secondary" label={`Categorías nuevas: ${result.categoriesCreated}`} /> : null}
            </Stack>

            {result.embeddingsPending > 0 ? (
              <Alert severity="info">
                La búsqueda inteligente de {result.embeddingsPending} producto(s) se regenera en segundo plano.
              </Alert>
            ) : null}

            <WarningAlerts warnings={result.warnings} context="done" />

            {result.created.length > 0 ? (
              <Alert severity="success">
                Se agregaron {result.created.length} producto(s).
                <NameList names={result.created.map((item) => item.name)} />
              </Alert>
            ) : null}

            {result.updated.length > 0 ? (
              <div>
                <p className="form-section-title">Actualizados</p>
                <div style={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Producto</TableCell>
                        <TableCell>Cambios</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.updated.slice(0, MAX_RENDER).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.posId}</TableCell>
                          <TableCell>
                            {item.name}
                            {item.restored ? <Chip size="small" color="warning" label="Reactivado" sx={{ ml: 1 }} /> : null}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              {item.changes.map((change, index) => (
                                <Chip key={index} size="small" variant="outlined" label={changeLabel(change)} />
                              ))}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {result.updated.length > MAX_RENDER ? (
                  <p className="text-sm">…y {result.updated.length - MAX_RENDER} más</p>
                ) : null}
              </div>
            ) : null}

            {result.skipped.length > 0 ? (
              <Alert severity="warning">
                Omitidos: {result.skipped.slice(0, MAX_RENDER).map((item) => `${item.name} (${item.reason})`).join("; ")}
                {result.skipped.length > MAX_RENDER ? ` …y ${result.skipped.length - MAX_RENDER} más` : ""}
              </Alert>
            ) : null}

            {result.errors.length > 0 ? (
              <Alert severity="error">
                Fallaron: {result.errors.slice(0, MAX_RENDER).map((item) => `${item.name} (${item.message})`).join("; ")}
                {result.errors.length > MAX_RENDER ? ` …y ${result.errors.length - MAX_RENDER} más` : ""}
              </Alert>
            ) : null}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {phase === "preview" ? (
          <>
            <Button onClick={close}>Cancelar</Button>
            <Button variant="contained" onClick={() => void applyImport()}>
              Aplicar importación
            </Button>
          </>
        ) : (
          <Button onClick={close} disabled={busy}>
            {phase === "done" ? "Cerrar" : "Cancelar"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
