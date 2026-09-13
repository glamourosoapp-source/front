"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Ban,
  Copy,
  Droplets,
  LogOut,
  Printer,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  UserRound,
  Wifi,
  WifiOff,
  MonitorDown,
} from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { usePosStore } from "@/stores/pos.store";
import { usePosShortcuts } from "@/hooks/usePosShortcuts";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import {
  lineFromBulk,
  lineFromProduct,
  priceTicket,
  salePayload,
  type PosLine,
} from "@/lib/pos/ticket";
import {
  detectPrintAgent,
  loadPrintAgentConfig,
  printRaw,
  type PrintAgentConfig,
} from "@/lib/print/print-agent-client";
import { buildTicketEscPos } from "@/lib/print/escpos";
import { PosQuantityDialog } from "@/components/pos/PosQuantityDialog";
import { PosSearchDialog } from "@/components/pos/PosSearchDialog";
import { PosCustomerDialog } from "@/components/pos/PosCustomerDialog";
import { PosChargeDialog } from "@/components/pos/PosChargeDialog";
import { PosDaySalesDialog } from "@/components/pos/PosDaySalesDialog";
import { PosTicketSheet } from "@/components/pos/PosTicketSheet";
import { PRICING_TIERS } from "@glamouroso/shared/constants";
import { DEFAULT_TICKET_SETTINGS } from "@glamouroso/shared";
import type { PosCatalog, PosCatalogLine, PosCatalogProduct, PosSale, PosSession } from "@/types";
import type { Customer } from "@/types";
import { toast } from "sonner";

type DialogName = "search" | "stock" | "customer" | "charge" | "daySales" | null;
type QuantityIntent =
  | { mode: "multi" }
  | { mode: "editLine"; key: string; allowDecimals: boolean; current: number }
  | { mode: "bulk"; line: PosCatalogLine };

export default function PosPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { can } = usePermissions();
  const { subscribe, connectionState } = useRealtime();
  const pwa = usePwaInstall();

  const {
    session,
    catalog,
    tickets,
    activeTicketId,
    selectedLineKey,
    lastSale,
    setSession,
    setCatalog,
    setLastSale,
    newTicket,
    closeTicket,
    selectTicket,
    updateTicket,
    addOrIncrement,
    addLine,
    updateLine,
    removeLine,
    selectLine,
    clearActiveTicket,
  } = usePosStore();

  const ticket = tickets.find((row) => row.id === activeTicketId) ?? tickets[0]!;
  const codeRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  /** Texto con el que abre el buscador, para no perder lo ya escrito. */
  const [searchTerm, setSearchTerm] = useState("");
  const [dialog, setDialog] = useState<DialogName>(null);
  const [quantityIntent, setQuantityIntent] = useState<QuantityIntent | null>(null);
  const [charging, setCharging] = useState(false);
  const [successChange, setSuccessChange] = useState<number | null>(null);
  const [printConfig, setPrintConfig] = useState<PrintAgentConfig>(loadPrintAgentConfig());
  const [printerOnline, setPrinterOnline] = useState(false);
  const [sheetSale, setSheetSale] = useState<PosSale | null>(null);
  const [clock, setClock] = useState("");

  /**
   * La caja cobra; no informa.
   *
   * Existencias y ventas del día son datos de la empresa, no del mostrador: el
   * perfil Cajero no trae `posInventory` ni `posReports`, así que no ve la
   * columna Existencia, ni F3, ni F4. El Back tampoco se los manda. Un
   * administrador que abra `/pos` sí los ve, por el bypass del rol.
   */
  const canSeeStock = can("posInventory", "view");
  const canSeeDaySales = can("posReports", "view");

  const ticketSettings = session?.ticketSettings ?? DEFAULT_TICKET_SETTINGS;
  const walkInName = session?.walkInCustomerName ?? "Mostrador";
  const totals = useMemo(() => priceTicket(ticket.lines, catalog), [ticket.lines, catalog]);
  const total = useMemo(
    () => Math.max(0, Math.round((totals.subtotal - ticket.discount) * 100) / 100),
    [totals.subtotal, ticket.discount]
  );

  const focusCode = useCallback(() => {
    window.setTimeout(() => codeRef.current?.focus(), 30);
  }, []);

  /** Sesión y catálogo de la sucursal del cajero. */
  const loadSession = useCallback(async () => {
    try {
      const data = await httpClient.get<PosSession>("/pos/session");
      setSession(data);
      setLastSale(data.lastSale ?? null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo abrir la caja"));
    }
  }, [setSession, setLastSale]);

  const loadCatalog = useCallback(async () => {
    try {
      const result = await httpClient.get<{ changed: boolean; catalog?: PosCatalog }>(
        "/pos/catalog"
      );
      if (result.catalog) setCatalog(result.catalog);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el catálogo"));
    }
  }, [setCatalog]);

  useEffect(() => {
    void loadSession();
    void loadCatalog();
  }, [loadSession, loadCatalog]);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  /** Estado del agente de impresión: se refleja en la barra superior. */
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const status = await detectPrintAgent(printConfig);
      if (!cancelled) setPrinterOnline(status.online && Boolean(printConfig.printerName));
    };
    void check();
    const timer = window.setInterval(check, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [printConfig]);

  // Otra caja de la misma sucursal cobró: la existencia del catálogo cambió.
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === "pos_sales_changed" && event.branchId === session?.branch.id) {
        void loadCatalog();
      }
    });
    return unsubscribe;
  }, [subscribe, session?.branch.id, loadCatalog]);

  useEffect(() => {
    focusCode();
  }, [activeTicketId, focusCode]);

  // ---- Altas de partidas ----

  const tier = ticket.customerTier;

  const addProduct = useCallback(
    (product: PosCatalogProduct, quantity = 1) => {
      addOrIncrement(lineFromProduct(product, tier, quantity));
      focusCode();
    },
    [addOrIncrement, tier, focusCode]
  );

  const addBulk = useCallback(
    (line: PosCatalogLine, liters: number) => {
      addLine(lineFromBulk(line, tier, liters));
      focusCode();
    },
    [addLine, tier, focusCode]
  );

  /**
   * Un código es lo que escribe el lector: dígitos, y a veces guiones. Si el
   * cajero teclea algo con letras está buscando por nombre, así que se va
   * directo al buscador en vez de fallar con "código no encontrado".
   */
  const looksLikeCode = (value: string) => /^[0-9][0-9-]*$/.test(value);

  const lookupCode = useCallback(
    async (raw: string, quantity = 1) => {
      const clean = raw.trim();
      if (!clean) return;

      const local = catalog?.products.find(
        (product) =>
          product.barcode === clean || product.sku === clean || product.posId === clean
      );
      if (local) {
        addProduct(local, quantity);
        setCode("");
        return;
      }

      // Nombre o marca: abrir el buscador YA con esa búsqueda hecha.
      if (!looksLikeCode(clean)) {
        setSearchTerm(clean);
        setDialog("search");
        return;
      }

      try {
        const product = await httpClient.get<PosCatalogProduct>("/pos/products/lookup", {
          code: clean,
        });
        addProduct(product, quantity);
        setCode("");
      } catch {
        // Código que no existe: se avisa y se ofrece el buscador con el texto.
        toast.error(`Sin producto con el código ${clean}`);
        setSearchTerm(clean);
        setDialog("search");
      }
    },
    [catalog, addProduct]
  );

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lookupCode(code);
  }

  // ---- Acciones del ticket ----

  const selectedLine = ticket.lines.find((row) => row.key === selectedLineKey) ?? null;

  const toggleWholesale = useCallback(() => {
    if (!selectedLine) {
      toast.info("Elige una partida del ticket para cambiarle la lista");
      return;
    }
    updateLine(selectedLine.key, {
      priceTier:
        selectedLine.priceTier === PRICING_TIERS.WHOLESALE
          ? PRICING_TIERS.RETAIL
          : PRICING_TIERS.WHOLESALE,
    });
    focusCode();
  }, [selectedLine, updateLine, focusCode]);

  const deleteSelected = useCallback(() => {
    if (!selectedLine) return;
    removeLine(selectedLine.key);
    focusCode();
  }, [selectedLine, removeLine, focusCode]);

  const openBulkForSelected = useCallback(() => {
    // F7: litros sueltos de la línea del producto seleccionado, o de la primera
    // línea que coincida con lo escrito en el campo de código.
    const fromSelected = selectedLine?.lineId
      ? catalog?.lines.find((line) => line.id === selectedLine.lineId)
      : undefined;
    const line = fromSelected ?? catalog?.lines.find((row) => row.canSellByLiter);
    if (!line) {
      toast.info("No hay líneas de líquidos configuradas para vender por litro");
      return;
    }
    setQuantityIntent({ mode: "bulk", line });
  }, [selectedLine, catalog]);

  const editQuantity = useCallback(() => {
    if (!selectedLine) {
      toast.info("Elige una partida para cambiarle la cantidad");
      return;
    }
    setQuantityIntent({
      mode: "editLine",
      key: selectedLine.key,
      allowDecimals: selectedLine.kind === "liter",
      current: selectedLine.quantity,
    });
  }, [selectedLine]);

  // ---- Impresión ----

  const printSale = useCallback(
    async (sale: PosSale, reprint = false) => {
      if (printConfig.printerName && printerOnline) {
        try {
          await printRaw(printConfig, buildTicketEscPos(sale, ticketSettings, { reprint }));
          await httpClient.post(`/pos/sales/${sale.id}/printed`, { target: "agent" }).catch(() => null);
          return;
        } catch (error) {
          toast.error(
            `${getApiErrorMessage(error, "La impresora no respondió")}. Se abrirá el diálogo del navegador.`
          );
        }
      }
      // Respaldo: hoja térmica por el diálogo del navegador.
      setSheetSale(sale);
      window.setTimeout(() => {
        window.print();
        void httpClient.post(`/pos/sales/${sale.id}/printed`, { target: "browser" }).catch(() => null);
      }, 150);
    },
    [printConfig, printerOnline, ticketSettings]
  );

  // ---- Cobro ----

  const charge = useCallback(
    async ({
      amountTendered,
      print,
      notes,
    }: {
      amountTendered: number;
      print: boolean;
      notes: string;
    }) => {
      if (!ticket.lines.length) return;
      setCharging(true);
      // La clave se fija por ticket: si la red falla y el cajero reintenta, el
      // servidor devuelve el mismo ticket en vez de cobrar dos veces.
      const idempotencyKey = ticket.idempotencyKey ?? crypto.randomUUID();
      if (!ticket.idempotencyKey) updateTicket(ticket.id, { idempotencyKey });

      try {
        const sale = await httpClient.post<PosSale>("/pos/sales", {
          idempotencyKey,
          customerId: ticket.customerId,
          items: salePayload(ticket.lines),
          discount: ticket.discount,
          amountTendered,
          notes: notes || null,
        });

        setDialog(null);
        setLastSale(sale);
        setSuccessChange(Number(sale.changeAmount));
        window.setTimeout(() => setSuccessChange(null), 2600);
        clearActiveTicket();
        void loadCatalog();
        if (print) void printSale(sale);
        else void httpClient.post(`/pos/sales/${sale.id}/printed`, { target: "none" }).catch(() => null);
        focusCode();
      } catch (error) {
        toast.error(getApiErrorMessage(error, "No se pudo cobrar"));
      } finally {
        setCharging(false);
      }
    },
    [ticket, updateTicket, setLastSale, clearActiveTicket, loadCatalog, printSale, focusCode]
  );

  // ---- Flechas: mover la selección y ajustar cantidad ----

  /**
   * Las flechas solo manejan el ticket cuando el campo de código está vacío.
   * Con algo escrito ahí, el cursor manda: el cajero está corrigiendo un código
   * y no debe perder el texto porque una flecha se lo llevó al grid.
   */
  const arrowsControlGrid = code.trim() === "";

  /**
   * Se lee el estado del store en el momento de aplicar, no el del render: dos
   * pulsaciones rápidas (o la tecla sostenida) ocurren antes de que React
   * vuelva a pintar, y con el valor congelado del render la segunda se perdía.
   */
  const moveSelection = useCallback((delta: number) => {
    const state = usePosStore.getState();
    const current = state.activeTicket();
    if (!current.lines.length) return;
    const index = current.lines.findIndex((row) => row.key === state.selectedLineKey);
    const next =
      index < 0
        ? delta > 0
          ? 0
          : current.lines.length - 1
        : Math.min(current.lines.length - 1, Math.max(0, index + delta));
    state.selectLine(current.lines[next]!.key);
  }, []);

  /**
   * Suma o resta una unidad a la fila seleccionada. En litros el paso es de un
   * litro; al llegar a cero la partida se quita, que es lo que espera quien
   * está corrigiendo una captura.
   */
  const bumpQuantity = useCallback((delta: number) => {
    const state = usePosStore.getState();
    const current = state.activeTicket();
    const line =
      current.lines.find((row) => row.key === state.selectedLineKey) ?? current.lines.at(-1);
    if (!line) return;
    const next = Math.round((line.quantity + delta) * 100) / 100;
    if (next <= 0) {
      state.removeLine(line.key);
      return;
    }
    if (line.key !== state.selectedLineKey) state.selectLine(line.key);
    state.updateLine(line.key, { quantity: next });
  }, []);

  // ---- Atajos ----
  const shortcutsEnabled = dialog === null && quantityIntent === null;

  usePosShortcuts(
    useMemo(
      () => ({
        // F3 y F4 se registran igual sin permiso, con handler vacío: así la tecla
        // no se le escapa al navegador (F3 abre su buscador) en plena venta.
        F3: () => {
          if (canSeeStock) setDialog("stock");
        },
        F4: () => {
          if (canSeeDaySales) setDialog("daySales");
        },
        F5: () => editQuantity(),
        F6: () => {
          newTicket();
          toast.success("Ticket guardado como pendiente");
        },
        F7: () => openBulkForSelected(),
        F8: () => setDialog("customer"),
        F10: () => {
          // Con algo escrito en el código, F10 arranca la búsqueda con ese texto.
          setSearchTerm(code.trim());
          setDialog("search");
        },
        F11: () => toggleWholesale(),
        F12: () => {
          if (ticket.lines.length) setDialog("charge");
        },
        Insert: () => setQuantityIntent({ mode: "multi" }),
        Delete: () => deleteSelected(),
        // Flechas sobre el ticket: arriba/abajo eligen la fila, derecha/izquierda
        // suman y restan una unidad. Solo con el campo de código vacío.
        ArrowUp: (event) => {
          if (!arrowsControlGrid) return;
          event.preventDefault();
          moveSelection(-1);
        },
        ArrowDown: (event) => {
          if (!arrowsControlGrid) return;
          event.preventDefault();
          moveSelection(1);
        },
        ArrowRight: (event) => {
          if (!arrowsControlGrid) return;
          event.preventDefault();
          bumpQuantity(1);
        },
        ArrowLeft: (event) => {
          if (!arrowsControlGrid) return;
          event.preventDefault();
          bumpQuantity(-1);
        },
        // Un SKU puede traer guion, así que + y - también esperan el campo vacío.
        "+": () => {
          if (arrowsControlGrid) bumpQuantity(1);
        },
        "-": () => {
          if (arrowsControlGrid) bumpQuantity(-1);
        },
      }),
      [
        editQuantity,
        newTicket,
        openBulkForSelected,
        toggleWholesale,
        deleteSelected,
        ticket.lines.length,
        code,
        canSeeStock,
        canSeeDaySales,
        arrowsControlGrid,
        moveSelection,
        bumpQuantity,
      ]
    ),
    shortcutsEnabled
  );

  const canVoid = can("pos", "update");

  return (
    <main className="pos">
      {/* 1. Barra superior */}
      <header className="pos-topbar">
        <span className="pos-brand">
          <Image
            className="pos-logo"
            src="/branding/glamouroso-logo-azul-sobre-blanco.svg"
            alt="Glamouroso"
            width={478}
            height={117}
            priority
          />
          <span className="pos-brand-label">Punto de venta</span>
        </span>
        <span className="pos-branch-chip">
          <Store size={13} />
          {session?.branch.code ?? "—"} · {session?.branch.name ?? "Sin sucursal"}
        </span>
        <div className="pos-topbar-spacer" />
        <div className="pos-topbar-meta">
          <span>
            Le atiende: <strong>{user?.name}</strong>
          </span>
          <span>{clock}</span>
          <span className="pos-status" title={`Conexión ${connectionState}`}>
            <span
              className={`pos-status-dot ${connectionState === "open" ? "" : "off"}`}
            />
            {connectionState === "open" ? <Wifi size={13} /> : <WifiOff size={13} />}
          </span>
          <span className="pos-status" title="Agente de impresión">
            <span className={`pos-status-dot ${printerOnline ? "" : "warn"}`} />
            <Printer size={13} />
          </span>
          {/*
            Solo aparece en la PC donde la caja todavía corre en una pestaña: al
            instalarla, Chrome deja de ofrecer el evento y el botón desaparece
            para siempre. Es la vía para que el cajero abra la caja desde el
            escritorio con la G de Glamouroso.
          */}
          {pwa.available && !pwa.installed ? (
            <button
              className="pos-action pos-action-accent"
              onClick={() => {
                void pwa.install().then((outcome) => {
                  if (outcome === "accepted") toast.success("Caja instalada en el escritorio");
                });
              }}
              title={`Instalar la caja como app y dejarla en el ${pwa.target}`}
            >
              <MonitorDown size={14} />
              Instalar en el {pwa.target}
            </button>
          ) : null}
          <Link href="/pos/configuracion" className="pos-action" style={{ textDecoration: "none" }}>
            <Settings size={14} />
            Configuración
          </Link>
          <button className="pos-action" onClick={() => logout()}>
            <LogOut size={14} />
            Salir
          </button>
        </div>
      </header>

      {/* 2. Captura */}
      <section className="pos-capture">
        <div className="pos-capture-title">Venta · {ticket.label}</div>
        <form className="pos-capture-body" onSubmit={submitCode}>
          <label className="pos-code-label" htmlFor="pos-code">
            Código del producto:
          </label>
          <input
            id="pos-code"
            ref={codeRef}
            className="pos-code-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Escanea o teclea el código y presiona Enter"
            autoComplete="off"
            autoFocus
          />
          <button type="submit" className="pos-action">
            <ShoppingCart size={14} />
            Enter · Agregar
          </button>
        </form>
        <div className="pos-actions">
          <button className="pos-action" onClick={() => setQuantityIntent({ mode: "multi" })}>
            <span className="pos-action-key">INS</span> Varios
          </button>
          <button
            className="pos-action"
            onClick={() => {
              setSearchTerm(code.trim());
              setDialog("search");
            }}
          >
            <span className="pos-action-key">F10</span>
            <Search size={14} /> Buscar
          </button>
          <button className="pos-action" onClick={toggleWholesale} disabled={!selectedLine}>
            <span className="pos-action-key">F11</span>
            <Tag size={14} /> Mayoreo
          </button>
          <button className="pos-action" onClick={openBulkForSelected}>
            <span className="pos-action-key">F7</span>
            <Droplets size={14} /> Litros
          </button>
          <button className="pos-action" onClick={() => setDialog("customer")}>
            <span className="pos-action-key">F8</span>
            <UserRound size={14} /> Cliente
          </button>
          <button className="pos-action" onClick={deleteSelected} disabled={!selectedLine}>
            <span className="pos-action-key">DEL</span>
            <Trash2 size={14} /> Borrar artículo
          </button>
          {canSeeStock ? (
            <button className="pos-action" onClick={() => setDialog("stock")}>
              <span className="pos-action-key">F3</span> Existencias
            </button>
          ) : null}
        </div>
      </section>

      {/* 3. Tickets pendientes */}
      <nav className="pos-tabs">
        {tickets.map((row) => (
          <button
            key={row.id}
            className={`pos-tab ${row.id === activeTicketId ? "active" : ""}`}
            onClick={() => selectTicket(row.id)}
          >
            <Receipt size={13} />
            {row.label}
            {row.lines.length ? <span className="pos-tab-count">{row.lines.length}</span> : null}
            {tickets.length > 1 ? (
              <span
                className="pos-tab-close"
                role="button"
                aria-label={`Cerrar ${row.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTicket(row.id);
                }}
              >
                ×
              </span>
            ) : null}
          </button>
        ))}
        <button className="pos-tab" onClick={() => newTicket()} title="Nuevo ticket pendiente (F6)">
          <Copy size={13} /> Nuevo
        </button>
      </nav>

      {/* 4. Grid del ticket */}
      <div className="pos-grid-wrap">
        <table className="pos-grid">
          <thead>
            <tr>
              <th style={{ width: 120 }}>Código</th>
              <th>Descripción del producto</th>
              <th style={{ width: 120, textAlign: "right" }}>Precio</th>
              <th style={{ width: 110, textAlign: "right" }}>Cant.</th>
              <th style={{ width: 130, textAlign: "right" }}>Importe</th>
              {canSeeStock ? (
                <th style={{ width: 130, textAlign: "right" }}>Existencia</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {totals.lines.map((line) => (
              <tr
                key={line.key}
                className={`${line.key === selectedLineKey ? "selected" : ""} ${
                  line.appliedTier === PRICING_TIERS.WHOLESALE ? "wholesale" : ""
                }`}
                onClick={() => selectLine(line.key)}
              >
                <td className="code">{line.code || "—"}</td>
                <td className="name">
                  {line.name}
                  {line.breakdown &&
                  (line.breakdown.bidones > 0 || line.breakdown.restLiters > 0) ? (
                    <span className="pos-breakdown">
                      {line.breakdown.bidones > 0
                        ? `${line.breakdown.bidones} bidón × ${formatMoney(line.breakdown.bidonPrice)}`
                        : ""}
                      {line.breakdown.bidones > 0 && line.breakdown.restLiters > 0 ? " + " : ""}
                      {line.breakdown.restLiters > 0
                        ? `${formatQuantity(line.breakdown.restLiters)} L × ${formatMoney(line.breakdown.literPrice)}`
                        : ""}
                    </span>
                  ) : null}
                  {line.litersDeducted && line.kind === "piece" ? (
                    <span className="pos-breakdown">
                      descuenta {formatQuantity(line.litersDeducted)} L de su línea
                    </span>
                  ) : null}
                  {line.wholesaleFellBack ? (
                    <span className="pos-breakdown" style={{ color: "#d97706" }}>
                      sin precio de mayoreo: se cobra menudeo
                    </span>
                  ) : null}
                </td>
                <td className="num">
                  {formatMoney(line.unitPrice)}
                  {line.kind === "liter" ? " / L" : ""}
                </td>
                <td className="num">
                  <input
                    className="pos-qty-input"
                    value={line.quantity}
                    onChange={(event) => {
                      const parsed = Number(event.target.value.replace(",", "."));
                      if (!Number.isFinite(parsed) || parsed <= 0) return;
                      if (line.kind === "piece" && !Number.isInteger(parsed)) return;
                      updateLine(line.key, { quantity: parsed });
                    }}
                    inputMode={line.kind === "liter" ? "decimal" : "numeric"}
                    aria-label={`Cantidad de ${line.name}`}
                  />
                  {line.kind === "liter" ? " L" : ""}
                </td>
                <td className="num amount">{formatMoney(line.total)}</td>
                {canSeeStock ? (
                  <td
                    className={`num ${line.stock !== null && line.stock < 0 ? "stock-negative" : ""}`}
                  >
                    {line.stock === null
                      ? "—"
                      : `${formatQuantity(line.stock)} ${line.stockUnit === "litro" ? "L" : "pz"}`}
                  </td>
                ) : null}
              </tr>
            ))}
            {!totals.lines.length ? (
              <tr>
                <td colSpan={canSeeStock ? 6 : 5} className="pos-empty">
                  Escanea un código o presiona <strong>F10</strong> para buscar por nombre. Con
                  partidas capturadas, las flechas eligen la fila y suman cantidad.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* 5. Pie */}
      <footer>
        <div className="pos-footer">
          <div className="pos-footer-left">
            <span className="pos-count">
              <strong>{formatQuantity(totals.itemsCount)}</strong>{" "}
              productos en la venta actual
            </span>
            {ticket.lines.length ? (
              <span className="pos-hint">
                <kbd>↑</kbd>
                <kbd>↓</kbd> elegir fila
                <kbd>→</kbd>
                <kbd>←</kbd> sumar o quitar
              </span>
            ) : null}
            <button className="pos-action" onClick={editQuantity} disabled={!selectedLine}>
              <span className="pos-action-key">F5</span> Cambiar cantidad
            </button>
            <button className="pos-action" onClick={() => newTicket()}>
              <span className="pos-action-key">F6</span> Pendiente
            </button>
            <button
              className="pos-action"
              onClick={() => clearActiveTicket()}
              disabled={!ticket.lines.length}
            >
              <Ban size={14} /> Eliminar venta
            </button>
            <span className="pos-count">
              Cliente: <strong>{ticket.customerName ?? walkInName}</strong>
            </span>
          </div>

          <button
            className="pos-charge"
            onClick={() => setDialog("charge")}
            disabled={!ticket.lines.length}
          >
            <span className="pos-action-key">F12</span> Cobrar
          </button>

          <div className="pos-total">
            <div className="pos-total-label">Total</div>
            <div className="pos-total-value">{formatMoney(total)}</div>
          </div>
        </div>

        <div className="pos-lastsale">
          {lastSale ? (
            <>
              <span>
                Última venta <b>{lastSale.ticketNumber}</b>
              </span>
              <span>
                Total: <b>{formatMoney(lastSale.total)}</b>
              </span>
              <span>
                Pagó con: <b>{formatMoney(lastSale.amountTendered)}</b>
              </span>
              <span>
                Cambio: <b>{formatMoney(lastSale.changeAmount)}</b>
              </span>
              <button className="pos-action" onClick={() => void printSale(lastSale, true)}>
                <Printer size={14} /> Reimprimir último ticket
              </button>
            </>
          ) : (
            <span>Sin ventas todavía en esta caja.</span>
          )}
          {canSeeDaySales ? (
            <button className="pos-action" onClick={() => setDialog("daySales")}>
              <span className="pos-action-key">F4</span> Ventas del día
            </button>
          ) : null}
        </div>
      </footer>

      {/* Diálogos */}
      <PosSearchDialog
        open={dialog === "search" || (dialog === "stock" && canSeeStock)}
        catalog={catalog}
        readOnly={dialog === "stock"}
        showStock={canSeeStock}
        initialTerm={dialog === "search" ? searchTerm : ""}
        onClose={() => {
          setDialog(null);
          setSearchTerm("");
          focusCode();
        }}
        onPickProduct={(product) => {
          addProduct(product);
          setCode("");
          setSearchTerm("");
        }}
        onPickLine={(line) => {
          setCode("");
          setSearchTerm("");
          setQuantityIntent({ mode: "bulk", line });
        }}
      />

      <PosCustomerDialog
        open={dialog === "customer"}
        walkInName={walkInName}
        onClose={() => {
          setDialog(null);
          focusCode();
        }}
        onPick={(customer: Customer | null) => {
          updateTicket(ticket.id, {
            customerId: customer?.id ?? null,
            customerName: customer?.name ?? null,
            customerTier:
              (customer?.pricingTier as typeof PRICING_TIERS.RETAIL) ?? PRICING_TIERS.RETAIL,
          });
        }}
      />

      <PosChargeDialog
        open={dialog === "charge"}
        total={total}
        itemsCount={totals.itemsCount}
        customerName={ticket.customerName ?? walkInName}
        charging={charging}
        printerReady={printerOnline}
        onClose={() => {
          setDialog(null);
          focusCode();
        }}
        onCharge={charge}
      />

      <PosDaySalesDialog
        open={dialog === "daySales" && canSeeDaySales}
        canVoid={canVoid}
        onClose={() => {
          setDialog(null);
          focusCode();
        }}
        onReprint={(sale) => void printSale(sale, true)}
        onVoided={() => {
          void loadCatalog();
          void loadSession();
        }}
      />

      {quantityIntent ? (
        <PosQuantityDialog
          open
          title={
            quantityIntent.mode === "bulk"
              ? `Litros de ${quantityIntent.line.name}`
              : quantityIntent.mode === "multi"
                ? "Varios del mismo producto"
                : "Cambiar cantidad"
          }
          label={quantityIntent.mode === "bulk" ? "Litros" : "Cantidad"}
          allowDecimals={
            quantityIntent.mode === "bulk"
              ? true
              : quantityIntent.mode === "editLine"
                ? quantityIntent.allowDecimals
                : false
          }
          initialValue={quantityIntent.mode === "editLine" ? quantityIntent.current : 1}
          helperText={
            quantityIntent.mode === "bulk"
              ? `Cada ${formatQuantity(quantityIntent.line.litersPerBidon)} L completos se cobran a precio de bidón.`
              : quantityIntent.mode === "multi"
                ? "Después escanea o teclea el código del producto."
                : undefined
          }
          onClose={() => {
            setQuantityIntent(null);
            focusCode();
          }}
          onConfirm={(quantity) => {
            if (quantityIntent.mode === "bulk") addBulk(quantityIntent.line, quantity);
            else if (quantityIntent.mode === "editLine")
              updateLine(quantityIntent.key, { quantity });
            else if (code.trim()) void lookupCode(code, quantity);
            else toast.info("Escribe el código y vuelve a presionar INS");
          }}
        />
      ) : null}

      {successChange !== null ? (
        <div className="pos-success" onClick={() => setSuccessChange(null)}>
          <div>
            <div className="pos-total-label" style={{ color: "#ffe443" }}>
              Cambio a entregar
            </div>
            <div className="change">{formatMoney(successChange)}</div>
            <p style={{ opacity: 0.8 }}>Toca para continuar</p>
          </div>
        </div>
      ) : null}

      <PosTicketSheet sale={sheetSale} settings={ticketSettings} />
    </main>
  );
}
