"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  CloudOff,
  CloudUpload,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { usePosStore } from "@/stores/pos.store";
import { usePosShortcuts } from "@/hooks/usePosShortcuts";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { usePosOffline } from "@/hooks/usePosOffline";
import { posSync } from "@/lib/pos-offline/sync";
import { buildLocalSale, buildSaleEvent } from "@/lib/pos-offline/sale-event";
import { nextFolio, readMeta, findSaleByEvent } from "@/lib/pos-offline/store";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { businessStamp } from "@/lib/business-time";
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
import { buildFactoryReturnEscPos, buildTicketEscPos } from "@/lib/print/escpos";
import { rasterizeLogo } from "@/lib/print/logo-raster";
import { PosQuantityDialog } from "@/components/pos/PosQuantityDialog";
import { PosSearchDialog } from "@/components/pos/PosSearchDialog";
import {
  PosCodeSuggestions,
  usePosSuggestions,
  type PosSuggestion,
} from "@/components/pos/PosCodeSuggestions";
import { PosCustomerDialog } from "@/components/pos/PosCustomerDialog";
import {
  PosChargeDialog,
  type PosChargeParams,
} from "@/components/pos/PosChargeDialog";
import { PosDaySalesDialog } from "@/components/pos/PosDaySalesDialog";
import { PosTicketSheet } from "@/components/pos/PosTicketSheet";
import { PosFactoryReturnDialog } from "@/components/pos/PosFactoryReturnDialog";
import { FactoryReturnSheet } from "@/components/pos/FactoryReturnSheet";
import {
  PRICING_TIERS,
  POS_PAYMENT_METHODS,
  posPaymentMethodLabel,
} from "@glamouroso/shared/constants";
import { POS_CLOCK_SKEW_WARN_MS } from "@glamouroso/shared/pos-sync";
import { DEFAULT_TICKET_SETTINGS } from "@glamouroso/shared";
import type {
  PosCatalog,
  PosCatalogLine,
  PosCatalogProduct,
  PosSale,
  PosSession,
} from "@/types";
import type { Customer, FactoryReturn } from "@/types";
import { toast } from "sonner";

type DialogName =
  "search" | "stock" | "customer" | "charge" | "daySales" | "return" | null;
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
    openReturnTicket,
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

  const ticket =
    tickets.find((row) => row.id === activeTicketId) ?? tickets[0]!;
  const isReturn = ticket.kind === "return";
  const codeRef = useRef<HTMLInputElement>(null);
  /** Versión del catálogo que ya tiene la caja: si no cambió, no se transfiere. */
  const catalogVersionRef = useRef<string | null>(null);
  const [code, setCode] = useState("");
  /** Texto con el que abre el buscador, para no perder lo ya escrito. */
  const [searchTerm, setSearchTerm] = useState("");
  const [dialog, setDialog] = useState<DialogName>(null);
  /**
   * Para qué se abrió el diálogo de cliente: `F8` solo lo asigna; `F12` lo
   * pide antes de cobrar y, elegido, sigue directo al cobro.
   */
  const [customerIntent, setCustomerIntent] = useState<"assign" | "charge">(
    "assign",
  );
  const [quantityIntent, setQuantityIntent] = useState<QuantityIntent | null>(
    null,
  );
  const [charging, setCharging] = useState(false);
  /** Overlay tras cobrar: el cambio si fue efectivo, o "cobrado con tarjeta/transferencia". */
  const [successChange, setSuccessChange] = useState<{
    change: number;
    total: number;
    paymentMethod: PosSale["paymentMethod"];
  } | null>(null);
  const [printConfig, setPrintConfig] = useState<PrintAgentConfig>(
    loadPrintAgentConfig(),
  );
  const [printerOnline, setPrinterOnline] = useState(false);
  const [sheetSale, setSheetSale] = useState<PosSale | null>(null);
  /** La hoja de respaldo también tiene que decir que es reimpresión. */
  const [sheetReprint, setSheetReprint] = useState(false);
  const [sheetReturn, setSheetReturn] = useState<FactoryReturn | null>(null);
  const [clock, setClock] = useState("");
  /**
   * El servidor contestó que este usuario no tiene sucursal: la caja no puede
   * cobrar ni subir nada. Es configuración del usuario, no falta de internet.
   */
  const [noBranch, setNoBranch] = useState(false);

  /**
   * La caja escribe en la PC primero y sube después, con o sin internet.
   *
   * Arranca con lo que quedó guardado —catálogo, sesión, cola— así que abre y
   * cobra aunque el servidor no conteste, y aunque la PC se haya reiniciado.
   */
  const offline = usePosOffline({
    onCatalog: setCatalog,
    onSession: (saved) => {
      // Solo mientras no haya llegado la sesión fresca del servidor.
      if (!usePosStore.getState().session) setSession(saved);
    },
  });
  const {
    status: syncStatus,
    storageReady,
    restored,
    backup,
    persistSession,
  } = offline;

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
  /**
   * Devolución a fábrica (F9): una pestaña que se captura como una venta pero
   * que F12 registra en vez de cobrar. Sin cliente, sin mayoreo, sin dinero.
   */
  const canReturn = can("posReturns", "create");

  useEffect(() => {
    catalogVersionRef.current = catalog?.version ?? null;
  }, [catalog?.version]);

  const ticketSettings = session?.ticketSettings ?? DEFAULT_TICKET_SETTINGS;
  const walkInName = session?.walkInCustomerName ?? "Mostrador";
  const totals = useMemo(
    () => priceTicket(ticket.lines, catalog),
    [ticket.lines, catalog],
  );
  const total = useMemo(
    () =>
      Math.max(0, Math.round((totals.subtotal - ticket.discount) * 100) / 100),
    [totals.subtotal, ticket.discount],
  );

  const focusCode = useCallback(() => {
    window.setTimeout(() => codeRef.current?.focus(), 30);
  }, []);

  /** Sesión y catálogo de la sucursal del cajero. */
  /**
   * Sesión de la sucursal. Si el servidor no contesta no se avisa con un error
   * rojo: la caja ya abrió con la sesión guardada y el cajero está atendiendo.
   */
  const loadSession = useCallback(async () => {
    try {
      const data = await httpClient.get<PosSession>("/pos/session");
      setSession(data);
      setLastSale(data.lastSale ?? null);
      setNoBranch(false);
      await persistSession(data);
    } catch (error) {
      // 400 = usuario sin sucursal fija (típicamente un admin): hay que decirlo.
      // Sin red la caja sigue con la sesión que guardó la última vez.
      const status = (error as { response?: { status?: number } } | null)?.response?.status;
      if (status === 400) setNoBranch(true);
    }
    // `persistSession` es estable; depender del objeto `offline` entero volvía a
    // crear esta función en cada render y relanzaba el efecto que la llama.
  }, [setSession, setLastSale, persistSession]);

  /**
   * Catálogo: se pide solo si cambió, y lo que llega se guarda en la PC. Es lo
   * que la caja usa para cobrar cuando no hay a quién preguntarle un precio.
   */
  const loadCatalog = useCallback(async () => {
    await posSync.refreshOfflineData(catalogVersionRef.current);
  }, []);

  useEffect(() => {
    void loadSession();
    void loadCatalog();
  }, [loadSession, loadCatalog]);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  /** Estado del Conector de impresión: se refleja en la barra superior. */
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const status = await detectPrintAgent(printConfig);
      if (!cancelled)
        setPrinterOnline(status.online && Boolean(printConfig.printerName));
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
      if (
        event.type === "pos_sales_changed" &&
        event.branchId === session?.branch.id
      ) {
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
    [addOrIncrement, tier, focusCode],
  );

  const addBulk = useCallback(
    (line: PosCatalogLine, liters: number) => {
      addLine(lineFromBulk(line, tier, liters));
      focusCode();
    },
    [addLine, tier, focusCode],
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
          product.barcode === clean ||
          product.sku === clean ||
          product.posId === clean,
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
        const product = await httpClient.get<PosCatalogProduct>(
          "/pos/products/lookup",
          {
            code: clean,
          },
        );
        addProduct(product, quantity);
        setCode("");
      } catch {
        // Código que no existe: se avisa y se ofrece el buscador con el texto.
        toast.error(`Sin producto con el código ${clean}`);
        setSearchTerm(clean);
        setDialog("search");
      }
    },
    [catalog, addProduct],
  );

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lookupCode(code);
  }

  // ---- Sugerencias al escribir (3+ letras) ----

  const suggestions = usePosSuggestions(catalog, code);
  /** Fila resaltada con las flechas; -1 = ninguna, para que Enter busque el código exacto. */
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  /** ESC oculta la lista hasta que el cajero vuelva a escribir. */
  const [suggestionsHidden, setSuggestionsHidden] = useState(false);
  const showSuggestions =
    dialog === null && !suggestionsHidden && suggestions.length > 0;

  const pickSuggestion = useCallback(
    (item: PosSuggestion) => {
      setCode("");
      setActiveSuggestion(-1);
      if (item.kind === "product") {
        addProduct(item.product);
      } else {
        setQuantityIntent({ mode: "bulk", line: item.line });
      }
    },
    [addProduct],
  );

  function onCodeChange(value: string) {
    setCode(value);
    setActiveSuggestion(-1);
    setSuggestionsHidden(false);
  }

  function onCodeKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((index) =>
        index <= 0 ? suggestions.length - 1 : index - 1,
      );
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSuggestionsHidden(true);
      setActiveSuggestion(-1);
    } else if (event.key === "Enter" && activeSuggestion >= 0) {
      // Con una fila resaltada, Enter la agrega en vez de mandar el formulario.
      event.preventDefault();
      pickSuggestion(suggestions[activeSuggestion]);
    }
  }

  // ---- Acciones del ticket ----

  const selectedLine =
    ticket.lines.find((row) => row.key === selectedLineKey) ?? null;

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
    const line =
      fromSelected ?? catalog?.lines.find((row) => row.canSellByLiter);
    if (!line) {
      toast.info(
        "No hay líneas de líquidos configuradas para vender por litro",
      );
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

  /**
   * Baja la existencia del catálogo que la caja tiene en memoria.
   *
   * Sin red nadie va a refrescarlo: si no se descuenta aquí, el cajero cobra
   * diez garrafas y `F3` le sigue diciendo que hay las mismas de la mañana.
   * Es una proyección local hasta el siguiente catálogo del servidor, que es la
   * versión buena.
   */
  const deductLocalStock = useCallback(
    (
      lines: {
        lineId: string | null;
        productId: string | null;
        quantity: number;
        litersDeducted: number | null;
      }[],
    ) => {
      const current = usePosStore.getState().catalog;
      if (!current) return;

      const byLine = new Map<string, number>();
      const byProduct = new Map<string, number>();
      for (const line of lines) {
        if (line.lineId) {
          const liters = line.litersDeducted ?? line.quantity;
          byLine.set(line.lineId, (byLine.get(line.lineId) ?? 0) + liters);
        } else if (line.productId) {
          byProduct.set(
            line.productId,
            (byProduct.get(line.productId) ?? 0) + line.quantity,
          );
        }
      }

      setCatalog({
        ...current,
        products: current.products.map((product) => {
          // Un envase de una línea descuenta litros de la línea, no piezas de sí
          // mismo: su existencia se lee del saldo de la línea.
          const fromLine = product.lineId
            ? byLine.get(product.lineId)
            : undefined;
          const fromOwn = byProduct.get(product.id);
          const drop = fromLine ?? fromOwn;
          if (!drop || product.stock == null) return product;
          return { ...product, stock: Number(product.stock) - drop };
        }),
        lines: current.lines.map((line) => {
          const drop = byLine.get(line.id);
          if (!drop || line.stockLiters == null) return line;
          return { ...line, stockLiters: Number(line.stockLiters) - drop };
        }),
      });
    },
    [setCatalog],
  );

  /**
   * Lo que la barra superior dice de la sincronización.
   *
   * El cajero no tiene por qué saber qué es una cola: le importa si sus ventas
   * ya están a salvo y, si no, cuántas faltan y desde cuándo.
   */
  const syncLabel = useMemo(() => {
    const { online, syncing, pendingCount, oldestPendingAt, lastSyncedAt } =
      syncStatus;
    if (syncing && pendingCount)
      return { tone: "warn" as const, text: `Subiendo ${pendingCount}…` };
    if (pendingCount) {
      const since = oldestPendingAt
        ? new Date(oldestPendingAt).toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : null;
      return {
        tone: online ? ("warn" as const) : ("off" as const),
        text: `${pendingCount} ${pendingCount === 1 ? "venta" : "ventas"} por subir${since ? ` desde ${since}` : ""}`,
      };
    }
    if (!online) return { tone: "off" as const, text: "Sin conexión" };
    // Hay conexión pero el servidor rechaza la caja: se dice por qué.
    if (noBranch) return { tone: "warn" as const, text: "Usuario sin sucursal" };
    if (syncStatus.lastError) return { tone: "warn" as const, text: syncStatus.lastError };
    const at = lastSyncedAt
      ? new Date(lastSyncedAt).toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    return { tone: "ok" as const, text: at ? `Al día · ${at}` : "En línea" };
  }, [syncStatus, noBranch]);

  /** El reloj corrido no bloquea nada, pero se avisa: mueve el día del ticket. */
  const clockWarning = useMemo(() => {
    const skew = Math.abs(syncStatus.clockOffsetMs);
    if (skew < POS_CLOCK_SKEW_WARN_MS) return null;
    const hours = Math.round(skew / 3_600_000);
    return hours >= 1
      ? `El reloj de esta computadora está ${hours} ${hours === 1 ? "hora" : "horas"} fuera de hora`
      : `El reloj de esta computadora está ${Math.round(skew / 60_000)} minutos fuera de hora`;
  }, [syncStatus.clockOffsetMs]);

  /**
   * Cerrar la caja con ventas sin subir es perder dinero si alguien limpia el
   * navegador antes de que vuelva la red. Se avisa, aunque Chrome muestre su
   * propio texto.
   */
  useEffect(() => {
    if (!syncStatus.pendingCount) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [syncStatus.pendingCount]);

  /** Este navegador no puede guardar ventas: hay que decirlo antes del primer cobro. */
  useEffect(() => {
    if (storageReady === false) {
      toast.error(
        "Esta ventana no puede guardar las ventas de la caja. Ábrela en Chrome, fuera del modo privado.",
        { duration: Infinity },
      );
    }
  }, [storageReady]);

  useEffect(() => {
    if (restored) {
      toast.warning(
        "Se recuperaron ventas pendientes del Conector de impresión. Revisa que el total del día cuadre.",
      );
    }
  }, [restored]);

  // ---- Impresión ----

  /**
   * "Por dónde salió el ticket" solo tiene sentido para un ticket que el
   * servidor conoce. Un ticket recién cobrado sin red todavía no existe allá,
   * así que marcar su impresión sería un 404 por cada venta.
   */
  const markPrinted = useCallback(async (sale: PosSale, target: string) => {
    const local = await findSaleByEvent(sale.id);
    if (local && !local.serverId) return;
    await httpClient
      .post(`/pos/sales/${local?.serverId ?? sale.id}/printed`, { target })
      .catch(() => null);
  }, []);

  const printSale = useCallback(
    async (sale: PosSale, reprint = false) => {
      if (printConfig.printerName && printerOnline) {
        try {
          // El logo se rasteriza una vez y queda memorizado: la térmica no
          // entiende PNG. Si no se puede (sin CORS, sin red), el ticket sale igual.
          const logo =
            ticketSettings.logoPosition !== "none"
              ? await rasterizeLogo(
                  ticketSettings.logoUrl,
                  ticketSettings.paperWidthMm,
                )
              : null;
          await printRaw(
            printConfig,
            buildTicketEscPos(sale, ticketSettings, {
              reprint,
              logo,
              walkInCustomerName: walkInName,
            }),
          );
          void markPrinted(sale, "agent");
          return;
        } catch (error) {
          toast.error(
            `${getApiErrorMessage(error, "La impresora no respondió")}. Se abrirá el diálogo del navegador.`,
          );
        }
      }
      // Respaldo: hoja térmica por el diálogo del navegador.
      setSheetReturn(null);
      setSheetReprint(reprint);
      setSheetSale(sale);
      window.setTimeout(() => {
        window.print();
        void markPrinted(sale, "browser");
      }, 150);
    },
    [printConfig, printerOnline, ticketSettings, walkInName, markPrinted],
  );

  /** Ticket de devolución: dos ejemplares marcados, por el conector o el navegador. */
  const printFactoryReturn = useCallback(
    async (ret: FactoryReturn) => {
      if (printConfig.printerName && printerOnline) {
        try {
          await printRaw(printConfig, buildFactoryReturnEscPos(ret, ticketSettings));
          return;
        } catch (error) {
          toast.error(
            `${getApiErrorMessage(error, "La impresora no respondió")}. Se abrirá el diálogo del navegador.`,
          );
        }
      }
      setSheetSale(null);
      setSheetReturn(ret);
      window.setTimeout(() => window.print(), 150);
    },
    [printConfig, printerOnline, ticketSettings],
  );

  /** La devolución quedó registrada: imprime, baja la existencia local y cierra la pestaña. */
  const onReturnRegistered = useCallback(
    (ret: FactoryReturn) => {
      setDialog(null);
      deductLocalStock(totals.lines);
      closeTicket(ticket.id);
      toast.success(`Devolución ${ret.folio} registrada`);
      void printFactoryReturn(ret);
      void loadCatalog();
      focusCode();
    },
    [deductLocalStock, totals.lines, closeTicket, ticket.id, printFactoryReturn, loadCatalog, focusCode],
  );

  // ---- Cobro ----

  /**
   * F12: antes de cobrar se pide el cliente. Con teléfono registrado basta
   * ese dato; si no existe, se registra ahí mismo (nombre y teléfono como
   * mínimo). Un ticket que ya trae cliente va directo al cobro.
   */
  const startCharge = useCallback(() => {
    if (!ticket.lines.length) return;
    if (ticket.customerId) {
      setDialog("charge");
      return;
    }
    setCustomerIntent("charge");
    setDialog("customer");
  }, [ticket.lines.length, ticket.customerId]);

  /**
   * Cobra: escribe el ticket en la PC, imprime y lo encola para subir.
   *
   * No espera al servidor. El folio lo pone la caja, los precios son los que
   * están en pantalla y la hora es la del mostrador, así que el cobro tarda lo
   * mismo con internet que sin él y el papel que se lleva el cliente siempre
   * coincide con lo que acabará en el sistema.
   */
  const charge = useCallback(
    async ({
      paymentMethod,
      amountTendered,
      print,
      notes,
    }: PosChargeParams) => {
      if (!ticket.lines.length) return;
      if (storageReady === false) {
        toast.error(
          "Este navegador no puede guardar las ventas. Abre la caja en Chrome, fuera de una ventana privada.",
        );
        return;
      }
      if (!session?.branch.code) {
        toast.error(
          "La caja todavía no sabe de qué sucursal es. Espera a que abra.",
        );
        return;
      }

      setCharging(true);
      try {
        const soldAt = new Date();
        const meta = await readMeta();
        const ticketNumber = await nextFolio(
          session.branch.code,
          businessStamp(soldAt),
        );
        const eventId = ticket.idempotencyKey ?? crypto.randomUUID();

        const input = {
          ticketNumber,
          soldAt,
          lines: totals.lines,
          subtotal: totals.subtotal,
          discount: ticket.discount,
          total,
          paymentMethod,
          amountTendered,
          itemsCount: totals.itemsCount,
          notes: notes || null,
          customerId: ticket.customerId,
          localCustomer: null,
          customerName: ticket.customerName,
          session,
          catalogVersion: catalog?.version ?? null,
          recordedOffline: !posSync.getStatus().online,
          clockOffsetMs: meta.clockOffsetMs,
        };

        const localSale = buildLocalSale(input, eventId);
        await posSync.push(buildSaleEvent(input, eventId), localSale);
        void backup();

        setDialog(null);
        setLastSale(localSale.sale);
        setSuccessChange({
          change: localSale.changeAmount,
          total: localSale.total,
          paymentMethod: localSale.sale.paymentMethod,
        });
        window.setTimeout(() => setSuccessChange(null), 2600);
        clearActiveTicket();
        if (print) void printSale(localSale.sale);
        focusCode();
        // La existencia del catálogo local baja con la venta: el siguiente
        // ticket ya tiene que ver el saldo correcto aunque no haya red.
        deductLocalStock(totals.lines);
      } catch (error) {
        toast.error(
          getApiErrorMessage(
            error,
            "No se pudo guardar la venta en esta computadora",
          ),
        );
      } finally {
        setCharging(false);
      }
    },
    [
      ticket,
      totals,
      total,
      session,
      catalog?.version,
      storageReady,
      backup,
      setLastSale,
      clearActiveTicket,
      printSale,
      focusCode,
      deductLocalStock,
    ],
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
    const index = current.lines.findIndex(
      (row) => row.key === state.selectedLineKey,
    );
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
      current.lines.find((row) => row.key === state.selectedLineKey) ??
      current.lines.at(-1);
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
        F8: () => {
          if (isReturn) return;
          setCustomerIntent("assign");
          setDialog("customer");
        },
        F9: () => {
          if (canReturn) openReturnTicket();
        },
        F10: () => {
          // Con algo escrito en el código, F10 arranca la búsqueda con ese texto.
          setSearchTerm(code.trim());
          setDialog("search");
        },
        F11: () => {
          if (!isReturn) toggleWholesale();
        },
        F12: () => {
          if (isReturn) {
            if (ticket.lines.length) setDialog("return");
          } else startCharge();
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
        startCharge,
        ticket.lines.length,
        code,
        canSeeStock,
        canSeeDaySales,
        arrowsControlGrid,
        moveSelection,
        bumpQuantity,
        isReturn,
        canReturn,
        openReturnTicket,
      ],
    ),
    shortcutsEnabled,
  );

  const canVoid = can("pos", "update");

  return (
    <main className={`pos ${isReturn ? "pos-return-mode" : ""} ${noBranch ? "pos-has-banner" : ""}`}>
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
          {session?.branch.code ?? "—"} ·{" "}
          {session?.branch.name ?? "Sin sucursal"}
        </span>
        <div className="pos-topbar-spacer" />
        <div className="pos-topbar-meta">
          <span>
            Le atiende: <strong>{user?.name}</strong>
          </span>
          <span>{clock}</span>
          <span
            className="pos-status"
            title={
              syncStatus.pendingCount
                ? "Ventas cobradas que todavía están en esta computadora"
                : `Conexión ${connectionState}`
            }
          >
            <span
              className={`pos-status-dot ${syncLabel.tone === "ok" ? "" : syncLabel.tone}`}
            />
            {syncLabel.tone === "ok" ? (
              <Wifi size={13} />
            ) : syncStatus.syncing ? (
              <CloudUpload size={13} />
            ) : syncStatus.online ? (
              <CloudUpload size={13} />
            ) : (
              <CloudOff size={13} />
            )}
            <span className="pos-status-text">{syncLabel.text}</span>
          </span>
          {clockWarning ? (
            <span className="pos-status" title={clockWarning}>
              <span className="pos-status-dot warn" />
              <TriangleAlert size={13} />
            </span>
          ) : null}
          <span className="pos-status" title="Conector de impresión">
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
                  if (outcome === "accepted")
                    toast.success("Caja instalada en el escritorio");
                });
              }}
              title={`Instalar la caja como app y dejarla en el ${pwa.target}`}
            >
              <MonitorDown size={14} />
              Instalar en el {pwa.target}
            </button>
          ) : null}
          <Link
            href="/pos/configuracion"
            className="pos-action"
            style={{ textDecoration: "none" }}
          >
            <Settings size={14} />
            Configuración
          </Link>
          <button className="pos-action" onClick={() => logout()}>
            <LogOut size={14} />
            Salir
          </button>
        </div>
      </header>

      {noBranch ? (
        <div className="pos-no-branch" role="alert">
          Tu usuario (<strong>{user?.name}</strong>) no tiene sucursal asignada, así que esta caja no
          puede cobrar ni registrar devoluciones. Entra con el usuario de caja de la sucursal, o
          asígnale una sucursal en Usuarios.
        </div>
      ) : null}

      {/* 2. Captura */}
      <section className="pos-capture">
        <div className="pos-capture-title">
          {isReturn ? "Devolución a fábrica · lo roto o echado a perder que se lleva el transportista" : `Venta · ${ticket.label}`}
        </div>
        <form className="pos-capture-body" onSubmit={submitCode}>
          <label className="pos-code-label" htmlFor="pos-code">
            Código del producto:
          </label>
          <div className="pos-code-wrap">
            <input
              id="pos-code"
              ref={codeRef}
              className="pos-code-input"
              value={code}
              onChange={(event) => onCodeChange(event.target.value)}
              onKeyDown={onCodeKeyDown}
              placeholder="Escanea o teclea el código, o escribe 3 letras del nombre"
              autoComplete="off"
              autoFocus
              role="combobox"
              aria-expanded={showSuggestions}
              aria-controls="pos-code-suggestions"
              aria-activedescendant={
                activeSuggestion >= 0
                  ? `pos-suggestion-${activeSuggestion}`
                  : undefined
              }
            />
            {showSuggestions ? (
              <PosCodeSuggestions
                items={suggestions}
                activeIndex={activeSuggestion}
                onHover={setActiveSuggestion}
                onPick={pickSuggestion}
              />
            ) : null}
          </div>
          <button type="submit" className="pos-action">
            <ShoppingCart size={14} />
            Enter · Agregar
          </button>
        </form>
        <div className="pos-actions">
          <button
            className="pos-action"
            onClick={() => setQuantityIntent({ mode: "multi" })}
          >
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
          <button
            className="pos-action"
            onClick={toggleWholesale}
            disabled={!selectedLine}
          >
            <span className="pos-action-key">F11</span>
            <Tag size={14} /> Mayoreo
          </button>
          <button className="pos-action" onClick={openBulkForSelected}>
            <span className="pos-action-key">F7</span>
            <Droplets size={14} /> Litros
          </button>
          <button
            className="pos-action"
            onClick={() => {
              setCustomerIntent("assign");
              setDialog("customer");
            }}
          >
            <span className="pos-action-key">F8</span>
            <UserRound size={14} /> Cliente
          </button>
          <button
            className="pos-action"
            onClick={deleteSelected}
            disabled={!selectedLine}
          >
            <span className="pos-action-key">DEL</span>
            <Trash2 size={14} /> Borrar artículo
          </button>
          {canSeeStock ? (
            <button className="pos-action" onClick={() => setDialog("stock")}>
              <span className="pos-action-key">F3</span> Existencias
            </button>
          ) : null}
          {canReturn ? (
            <button
              className="pos-action pos-action-return"
              onClick={() => openReturnTicket()}
              title="Producto roto o echado a perder que se regresa a fábrica"
            >
              <span className="pos-action-key">F9</span>
              <Undo2 size={14} /> Devolución
            </button>
          ) : null}
        </div>
      </section>

      {/* 3. Tickets pendientes */}
      <nav className="pos-tabs">
        {tickets.map((row) => (
          <button
            key={row.id}
            className={`pos-tab ${row.id === activeTicketId ? "active" : ""} ${row.kind === "return" ? "pos-tab-return" : ""}`}
            onClick={() => selectTicket(row.id)}
          >
            {row.kind === "return" ? <Undo2 size={13} /> : <Receipt size={13} />}
            {row.label}
            {row.lines.length ? (
              <span className="pos-tab-count">{row.lines.length}</span>
            ) : null}
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
        <button
          className="pos-tab"
          onClick={() => newTicket()}
          title="Nuevo ticket pendiente (F6)"
        >
          <Copy size={13} /> Nuevo
        </button>
      </nav>

      {/* 4. Grid del ticket */}
      <div className="pos-grid-wrap">
        {isReturn ? (
          <div className="pos-watermark" aria-hidden>
            DEVOLUCIÓN
          </div>
        ) : null}
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
                  line.appliedTier === PRICING_TIERS.WHOLESALE
                    ? "wholesale"
                    : ""
                }`}
                onClick={() => selectLine(line.key)}
              >
                <td className="code">{line.code || "—"}</td>
                <td className="name">
                  {line.name}
                  {line.breakdown &&
                  (line.breakdown.bidones > 0 ||
                    line.breakdown.restLiters > 0) ? (
                    <span className="pos-breakdown">
                      {line.breakdown.bidones > 0
                        ? `${line.breakdown.bidones} bidón × ${formatMoney(line.breakdown.bidonPrice)}`
                        : ""}
                      {line.breakdown.bidones > 0 &&
                      line.breakdown.restLiters > 0
                        ? " + "
                        : ""}
                      {line.breakdown.restLiters > 0
                        ? `${formatQuantity(line.breakdown.restLiters)} L × ${formatMoney(line.breakdown.literPrice)}`
                        : ""}
                    </span>
                  ) : null}
                  {line.litersDeducted && line.kind === "piece" ? (
                    <span className="pos-breakdown">
                      descuenta {formatQuantity(line.litersDeducted)} L de su
                      línea
                    </span>
                  ) : null}
                  {line.wholesaleFellBack ? (
                    <span
                      className="pos-breakdown"
                      style={{ color: "#d97706" }}
                    >
                      sin precio de mayoreo: se cobra menudeo
                    </span>
                  ) : null}
                </td>
                <td className="num">
                  {/* La devolución se valúa a precio de tienda en el servidor: el de venta confundiría. */}
                  {isReturn ? "—" : formatMoney(line.unitPrice)}
                  {!isReturn && line.kind === "liter" ? " / L" : ""}
                </td>
                <td className="num">
                  <span className="pos-qty-cell">
                    <input
                      className="pos-qty-input"
                      value={line.quantity}
                      onChange={(event) => {
                        const parsed = Number(
                          event.target.value.replace(",", "."),
                        );
                        if (!Number.isFinite(parsed) || parsed <= 0) return;
                        if (line.kind === "piece" && !Number.isInteger(parsed))
                          return;
                        updateLine(line.key, { quantity: parsed });
                      }}
                      inputMode={line.kind === "liter" ? "decimal" : "numeric"}
                      aria-label={`Cantidad de ${line.name}`}
                    />
                    {line.kind === "liter" ? (
                      <span className="pos-qty-unit">L</span>
                    ) : null}
                  </span>
                </td>
                <td className="num amount">{isReturn ? "—" : formatMoney(line.total)}</td>
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
                  Escanea un código, escribe 3 letras del nombre para ver
                  sugerencias, o presiona <strong>F10</strong> para buscar. Con
                  partidas capturadas, las flechas eligen la fila y suman
                  cantidad.
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
              <strong>{totals.linesCount}</strong>{" "}
              {totals.linesCount === 1 ? "producto" : "productos"} en la venta
              actual
            </span>
            {ticket.lines.length ? (
              <span className="pos-hint">
                <kbd>↑</kbd>
                <kbd>↓</kbd> elegir fila
                <kbd>→</kbd>
                <kbd>←</kbd> sumar o quitar
              </span>
            ) : null}
            <button
              className="pos-action"
              onClick={editQuantity}
              disabled={!selectedLine}
            >
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
            {isReturn ? null : (
              <span className="pos-count">
                Cliente: <strong>{ticket.customerName ?? walkInName}</strong>
              </span>
            )}
          </div>

          {isReturn ? (
            <button
              className="pos-charge pos-charge-return"
              onClick={() => setDialog("return")}
              disabled={!ticket.lines.length}
            >
              <span className="pos-action-key">F12</span> Registrar devolución
            </button>
          ) : (
            <button
              className="pos-charge"
              onClick={() => startCharge()}
              disabled={!ticket.lines.length}
            >
              <span className="pos-action-key">F12</span> Cobrar
            </button>
          )}

          <div className="pos-total">
            <div className="pos-total-label">{isReturn ? "A devolver (no se cobra)" : "Total"}</div>
            <div className="pos-total-value">
              {isReturn ? `${totals.linesCount} ${totals.linesCount === 1 ? "partida" : "partidas"}` : formatMoney(total)}
            </div>
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
                Forma de pago:{" "}
                <b>{posPaymentMethodLabel(lastSale.paymentMethod)}</b>
              </span>
              {lastSale.paymentMethod === POS_PAYMENT_METHODS.CASH ? (
                <>
                  <span>
                    Pagó con: <b>{formatMoney(lastSale.amountTendered)}</b>
                  </span>
                  <span>
                    Cambio: <b>{formatMoney(lastSale.changeAmount)}</b>
                  </span>
                </>
              ) : null}
              <button
                className="pos-action"
                onClick={() => void printSale(lastSale, true)}
              >
                <Printer size={14} /> Reimprimir último ticket
              </button>
            </>
          ) : (
            <span>Sin ventas todavía en esta caja.</span>
          )}
          {canSeeDaySales ? (
            <button
              className="pos-action"
              onClick={() => setDialog("daySales")}
            >
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
        purpose={customerIntent}
        onClose={() => {
          setDialog(null);
          focusCode();
        }}
        onPick={(customer: Customer | null) => {
          updateTicket(ticket.id, {
            customerId: customer?.id ?? null,
            customerName: customer?.name ?? null,
            customerTier:
              (customer?.pricingTier as typeof PRICING_TIERS.RETAIL) ??
              PRICING_TIERS.RETAIL,
          });
          // Pedido desde F12: con el cliente resuelto se pasa directo al cobro.
          if (customerIntent === "charge") {
            setDialog("charge");
          } else {
            setDialog(null);
            focusCode();
          }
        }}
      />

      <PosChargeDialog
        open={dialog === "charge"}
        total={total}
        linesCount={totals.linesCount}
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
          initialValue={
            quantityIntent.mode === "editLine" ? quantityIntent.current : 1
          }
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
            if (quantityIntent.mode === "bulk")
              addBulk(quantityIntent.line, quantity);
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
              {successChange.paymentMethod === POS_PAYMENT_METHODS.CASH
                ? "Cambio a entregar"
                : `Cobrado con ${posPaymentMethodLabel(successChange.paymentMethod).toLowerCase()}`}
            </div>
            <div className="change">
              {successChange.paymentMethod === POS_PAYMENT_METHODS.CASH
                ? formatMoney(successChange.change)
                : formatMoney(successChange.total)}
            </div>
            <p style={{ opacity: 0.8 }}>Toca para continuar</p>
          </div>
        </div>
      ) : null}

      <PosFactoryReturnDialog
        open={dialog === "return" && isReturn}
        lines={ticket.lines}
        onClose={() => {
          setDialog(null);
          focusCode();
        }}
        onRegistered={onReturnRegistered}
      />

      <FactoryReturnSheet ret={sheetReturn} settings={ticketSettings} />

      <PosTicketSheet
        sale={sheetSale}
        settings={ticketSettings}
        reprint={sheetReprint}
        walkInCustomerName={walkInName}
      />
    </main>
  );
}
