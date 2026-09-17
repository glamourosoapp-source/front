"use client";

import {
  Alert,
  Divider,
  FormControlLabel,
  Link as MuiLink,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
} from "@mui/material";
import {
  TICKET_EMPHASIS_SIZES,
  TICKET_FONT_SIZES,
  TICKET_LINE_SPACINGS,
  TICKET_LOGO_POSITIONS,
  TICKET_PAPER_WIDTHS,
  type TicketPaperWidth,
} from "@glamouroso/shared";
import {
  GLAMOUROSO_TICKET_LOGO,
  TICKET_CONTENT_LABELS,
  TICKET_EMPHASIS_LABELS,
  TICKET_FONT_SIZE_LABELS,
  TICKET_GROUPS,
  TICKET_LINE_SPACING_LABELS,
  TICKET_LOGO_POSITION_LABELS,
  type TicketDraft,
  type TicketGroupKey,
  type TicketGroupState,
} from "@/lib/pos/ticket-settings-form";

/**
 * Formulario del ticket, el mismo para la empresa y para una sucursal.
 *
 * Con `groups` presente está editando una **sucursal**: cada grupo trae su
 * interruptor "Personalizar en esta sucursal". Apagado, los campos se ven
 * (con los valores heredados de la empresa) pero no se editan, y al guardar se
 * mandan en `null` para que la sucursal vuelva a heredar.
 */
export interface TicketSettingsFormProps {
  draft: TicketDraft;
  onChange: (patch: Partial<TicketDraft>) => void;
  /** Solo al editar una sucursal: qué grupos personaliza. */
  groups?: TicketGroupState;
  onToggleGroup?: (group: TicketGroupKey, enabled: boolean) => void;
  disabled?: boolean;
}

export function TicketSettingsForm({
  draft,
  onChange,
  groups,
  onToggleGroup,
  disabled = false,
}: TicketSettingsFormProps) {
  const isBranch = Boolean(groups);
  const locked = (group: TicketGroupKey) => disabled || (isBranch && !groups![group]);

  function GroupHeader({ group }: { group: TicketGroupKey }) {
    const meta = TICKET_GROUPS.find((item) => item.key === group)!;
    return (
      <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{meta.title}</h2>
          <p className="page-kicker" style={{ margin: 0 }}>
            {meta.description}
          </p>
        </div>
        {isBranch ? (
          <FormControlLabel
            control={
              <Switch
                checked={groups![group]}
                disabled={disabled}
                onChange={(event) => onToggleGroup?.(group, event.target.checked)}
              />
            }
            label={groups![group] ? "Personalizado" : "Hereda de la empresa"}
          />
        ) : null}
      </div>
    );
  }

  const text = (
    field: keyof TicketDraft,
    label: string,
    group: TicketGroupKey,
    extra: { helperText?: string; multiline?: boolean; minRows?: number; full?: boolean } = {}
  ) => (
    <TextField
      label={label}
      value={draft[field] as string}
      onChange={(event) => onChange({ [field]: event.target.value } as Partial<TicketDraft>)}
      disabled={locked(group)}
      fullWidth
      helperText={extra.helperText}
      multiline={extra.multiline}
      minRows={extra.minRows}
      sx={extra.full ? { gridColumn: "1 / -1" } : undefined}
    />
  );

  return (
    <div className="grid gap-4">
      <section className="panel p-5">
        <GroupHeader group="negocio" />
        <div className="form-grid ticket-fields" style={{ marginTop: 16 }}>
          {text("businessName", "Nombre comercial", "negocio", {
            helperText: "Vacío: se imprime el nombre de la sucursal.",
          })}
          {text("legalName", "Razón social", "negocio", {
            helperText: "Como aparece en la constancia de situación fiscal.",
          })}
          {text("taxId", "RFC", "negocio")}
          {text("taxRegime", "Régimen fiscal", "negocio", {
            helperText: "Ej: 601 - General de Ley Personas Morales.",
          })}
          {text("phone", "Teléfono", "negocio", {
            helperText: "Vacío: se imprime el teléfono de la sucursal.",
          })}
          {text("email", "Correo", "negocio")}
          {text("website", "Sitio web o redes", "negocio")}
          <TextField
            select
            label="Logo del ticket"
            value={draft.logoPosition}
            onChange={(event) =>
              onChange({ logoPosition: event.target.value as TicketDraft["logoPosition"] })
            }
            disabled={locked("negocio")}
            fullWidth
            helperText="La térmica lo imprime en blanco y negro."
          >
            {TICKET_LOGO_POSITIONS.map((position) => (
              <MenuItem key={position} value={position}>
                {TICKET_LOGO_POSITION_LABELS[position]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Imagen del logo"
            value={draft.logoUrl}
            onChange={(event) => onChange({ logoUrl: event.target.value })}
            disabled={locked("negocio") || draft.logoPosition === "none"}
            fullWidth
            helperText={
              draft.logoUrl === GLAMOUROSO_TICKET_LOGO ? (
                "Logotipo de Glamouroso."
              ) : (
                <>
                  URL de una imagen pública, o{" "}
                  <MuiLink
                    component="button"
                    type="button"
                    onClick={() => onChange({ logoUrl: GLAMOUROSO_TICKET_LOGO })}
                    disabled={locked("negocio") || draft.logoPosition === "none"}
                  >
                    usa el logotipo de Glamouroso
                  </MuiLink>
                  .
                </>
              )
            }
          />
          {text("addressLines", "Domicilio", "negocio", {
            multiline: true,
            minRows: 2,
            full: true,
            helperText:
              "Un renglón por línea. Vacío: se arma con la calle, la colonia, la ciudad y el CP de la sucursal.",
          })}
        </div>
      </section>

      <section className="panel p-5">
        <GroupHeader group="textos" />
        <div className="form-grid ticket-fields" style={{ marginTop: 16 }}>
          {text("headerLines", "Líneas extra del encabezado", "textos", {
            multiline: true,
            minRows: 2,
            full: true,
            helperText: "Una por renglón: horario, aviso de garantía, lo que haga falta.",
          })}
          {text("footerMessage", "Mensaje final", "textos", {
            full: true,
            helperText: "Va centrado al pie. Vacío: se usa el mensaje predeterminado.",
          })}
          {text("legalNotice", "Leyenda legal", "textos", {
            multiline: true,
            minRows: 2,
            full: true,
            helperText: "Ej: política de cambios y devoluciones, o el aviso de facturación.",
          })}
        </div>
      </section>

      <section className="panel p-5">
        <GroupHeader group="formato" />
        <div className="form-grid ticket-fields" style={{ marginTop: 16 }}>
          <TextField
            select
            label="Ancho del papel"
            value={draft.paperWidthMm}
            onChange={(event) =>
              onChange({ paperWidthMm: Number(event.target.value) as TicketPaperWidth })
            }
            disabled={locked("formato")}
            fullWidth
            helperText="El rollo que usan las impresoras de la sucursal."
          >
            {TICKET_PAPER_WIDTHS.map((width) => (
              <MenuItem key={width} value={width}>
                {width} mm
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Tamaño de la letra"
            value={draft.fontSize}
            onChange={(event) =>
              onChange({ fontSize: event.target.value as TicketDraft["fontSize"] })
            }
            disabled={locked("formato")}
            fullWidth
            helperText="La letra chica usa la fuente angosta y cabe más texto por renglón."
          >
            {TICKET_FONT_SIZES.map((size) => (
              <MenuItem key={size} value={size}>
                {TICKET_FONT_SIZE_LABELS[size]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Tamaño del nombre del negocio"
            value={draft.headerSize}
            onChange={(event) =>
              onChange({ headerSize: event.target.value as TicketDraft["headerSize"] })
            }
            disabled={locked("formato")}
            fullWidth
          >
            {TICKET_EMPHASIS_SIZES.map((size) => (
              <MenuItem key={size} value={size}>
                {TICKET_EMPHASIS_LABELS[size]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Tamaño del total"
            value={draft.totalSize}
            onChange={(event) =>
              onChange({ totalSize: event.target.value as TicketDraft["totalSize"] })
            }
            disabled={locked("formato")}
            fullWidth
          >
            {TICKET_EMPHASIS_SIZES.map((size) => (
              <MenuItem key={size} value={size}>
                {TICKET_EMPHASIS_LABELS[size]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Separación entre renglones"
            value={draft.lineSpacing}
            onChange={(event) =>
              onChange({ lineSpacing: event.target.value as TicketDraft["lineSpacing"] })
            }
            disabled={locked("formato")}
            fullWidth
          >
            {TICKET_LINE_SPACINGS.map((spacing) => (
              <MenuItem key={spacing} value={spacing}>
                {TICKET_LINE_SPACING_LABELS[spacing]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Carácter de las divisorias"
            value={draft.separatorChar}
            onChange={(event) => onChange({ separatorChar: event.target.value.slice(0, 1) })}
            disabled={locked("formato")}
            fullWidth
            inputProps={{ maxLength: 1 }}
            helperText="Un solo carácter, por ejemplo - = * o ."
          />
        </div>
      </section>

      <section className="panel p-5">
        <GroupHeader group="contenido" />
        <div className="form-grid ticket-fields" style={{ marginTop: 16 }}>
          {TICKET_CONTENT_LABELS.map(({ field, label, hint }) => (
            <Tooltip key={field} title={hint} placement="top-start">
              <FormControlLabel
                control={
                  <Switch
                    checked={draft[field] as boolean}
                    disabled={locked("contenido")}
                    onChange={(event) =>
                      onChange({ [field]: event.target.checked } as Partial<TicketDraft>)
                    }
                  />
                }
                label={label}
              />
            </Tooltip>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <GroupHeader group="impresion" />
        <div className="form-grid ticket-fields" style={{ marginTop: 16 }}>
          <TextField
            select
            label="Copias por venta"
            value={draft.copies}
            onChange={(event) => onChange({ copies: Number(event.target.value) })}
            disabled={locked("impresion")}
            fullWidth
            helperText="La segunda y la tercera salen marcadas como copia."
          >
            <MenuItem value={1}>1 (solo el cliente)</MenuItem>
            <MenuItem value={2}>2 (cliente y sucursal)</MenuItem>
            <MenuItem value={3}>3</MenuItem>
          </TextField>
          <TextField
            select
            label="Renglones en blanco al final"
            value={draft.feedLines}
            onChange={(event) => onChange({ feedLines: Number(event.target.value) })}
            disabled={locked("impresion")}
            fullWidth
            helperText="Para que el corte no se lleve la última línea."
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={draft.cutPaper}
                disabled={locked("impresion")}
                onChange={(event) => onChange({ cutPaper: event.target.checked })}
              />
            }
            label="Cortar el papel automáticamente"
          />
        </div>
        <Divider sx={{ my: 2 }} />
        <Alert severity="info">
          La impresora de cada caja no se elige aquí: se configura en la propia computadora de la
          sucursal, desde la caja, en <strong>Impresión de tickets</strong>.
        </Alert>
      </section>
    </div>
  );
}
