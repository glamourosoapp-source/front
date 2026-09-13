import { create } from "zustand";
import { PRICING_TIERS } from "@glamouroso/shared/constants";
import type { PricingTier } from "@glamouroso/shared/constants";
import type { PosCatalog, PosSale, PosSession } from "@/types";
import type { PosLine } from "@/lib/pos/ticket";

/** Un ticket pendiente: lo que eleventa maneja como pestañas de venta. */
export interface PosTicket {
  id: string;
  label: string;
  lines: PosLine[];
  customerId: string | null;
  customerName: string | null;
  customerTier: PricingTier;
  discount: number;
  notes: string;
  /** Se genera al abrir el cobro; reintentar con la misma clave no duplica. */
  idempotencyKey: string | null;
}

interface PosState {
  session: PosSession | null;
  catalog: PosCatalog | null;
  tickets: PosTicket[];
  activeTicketId: string;
  selectedLineKey: string | null;
  lastSale: PosSale | null;

  setSession: (session: PosSession) => void;
  setCatalog: (catalog: PosCatalog) => void;
  setLastSale: (sale: PosSale | null) => void;

  activeTicket: () => PosTicket;
  newTicket: () => void;
  closeTicket: (id: string) => void;
  selectTicket: (id: string) => void;
  updateTicket: (id: string, patch: Partial<PosTicket>) => void;

  addLine: (line: PosLine) => void;
  /** Suma cantidad si ya está la misma partida; útil al reescanear un código. */
  addOrIncrement: (line: PosLine) => void;
  updateLine: (key: string, patch: Partial<PosLine>) => void;
  removeLine: (key: string) => void;
  selectLine: (key: string | null) => void;
  clearActiveTicket: () => void;
}

const STORAGE_KEY = "pos.tickets";

function emptyTicket(index: number): PosTicket {
  return {
    id: crypto.randomUUID(),
    label: `Ticket ${index}`,
    lines: [],
    customerId: null,
    customerName: null,
    customerTier: PRICING_TIERS.RETAIL,
    discount: 0,
    notes: "",
    idempotencyKey: null,
  };
}

/**
 * Los tickets pendientes viven en `localStorage` de ESA PC: si la caja se
 * recarga (o se va la luz del navegador) las ventas a medio capturar siguen
 * ahí. No viajan al servidor: un ticket solo existe cuando se cobra.
 */
function loadTickets(): { tickets: PosTicket[]; activeTicketId: string } {
  if (typeof window === "undefined") {
    const first = emptyTicket(1);
    return { tickets: [first], activeTicketId: first.id };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { tickets: PosTicket[]; activeTicketId: string };
      if (parsed.tickets?.length) {
        return {
          tickets: parsed.tickets,
          activeTicketId: parsed.activeTicketId || parsed.tickets[0]!.id,
        };
      }
    }
  } catch {
    /* storage bloqueado o corrupto: se arranca con un ticket limpio */
  }
  const first = emptyTicket(1);
  return { tickets: [first], activeTicketId: first.id };
}

function persist(tickets: PosTicket[], activeTicketId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tickets, activeTicketId }));
  } catch {
    /* modo privado o cuota llena: la caja sigue operando en memoria */
  }
}

const initial = loadTickets();

export const usePosStore = create<PosState>((set, get) => ({
  session: null,
  catalog: null,
  tickets: initial.tickets,
  activeTicketId: initial.activeTicketId,
  selectedLineKey: null,
  lastSale: null,

  setSession: (session) => set({ session }),
  setCatalog: (catalog) => set({ catalog }),
  setLastSale: (lastSale) => set({ lastSale }),

  activeTicket: () => {
    const { tickets, activeTicketId } = get();
    return tickets.find((ticket) => ticket.id === activeTicketId) ?? tickets[0]!;
  },

  newTicket: () =>
    set((state) => {
      const used = new Set(state.tickets.map((ticket) => ticket.label));
      let index = 1;
      while (used.has(`Ticket ${index}`)) index += 1;
      const ticket = emptyTicket(index);
      const tickets = [...state.tickets, ticket];
      persist(tickets, ticket.id);
      return { tickets, activeTicketId: ticket.id, selectedLineKey: null };
    }),

  closeTicket: (id) =>
    set((state) => {
      const remaining = state.tickets.filter((ticket) => ticket.id !== id);
      const tickets = remaining.length ? remaining : [emptyTicket(1)];
      const activeTicketId =
        state.activeTicketId === id ? tickets[tickets.length - 1]!.id : state.activeTicketId;
      persist(tickets, activeTicketId);
      return { tickets, activeTicketId, selectedLineKey: null };
    }),

  selectTicket: (id) =>
    set((state) => {
      persist(state.tickets, id);
      return { activeTicketId: id, selectedLineKey: null };
    }),

  updateTicket: (id, patch) =>
    set((state) => {
      const tickets = state.tickets.map((ticket) =>
        ticket.id === id ? { ...ticket, ...patch } : ticket
      );
      persist(tickets, state.activeTicketId);
      return { tickets };
    }),

  addLine: (line) =>
    set((state) => {
      const tickets = state.tickets.map((ticket) =>
        ticket.id === state.activeTicketId ? { ...ticket, lines: [...ticket.lines, line] } : ticket
      );
      persist(tickets, state.activeTicketId);
      return { tickets, selectedLineKey: line.key };
    }),

  addOrIncrement: (line) =>
    set((state) => {
      let selectedLineKey = line.key;
      const tickets = state.tickets.map((ticket) => {
        if (ticket.id !== state.activeTicketId) return ticket;
        // Los litros sueltos siempre entran como partida nueva: 5 L y luego 3 L
        // no son lo mismo que 8 L para el desglose de bidones del ticket.
        const existing =
          line.kind === "piece"
            ? ticket.lines.find(
                (row) =>
                  row.kind === "piece" &&
                  row.productId === line.productId &&
                  row.priceTier === line.priceTier
              )
            : undefined;
        if (existing) {
          selectedLineKey = existing.key;
          return {
            ...ticket,
            lines: ticket.lines.map((row) =>
              row.key === existing.key ? { ...row, quantity: row.quantity + line.quantity } : row
            ),
          };
        }
        return { ...ticket, lines: [...ticket.lines, line] };
      });
      persist(tickets, state.activeTicketId);
      return { tickets, selectedLineKey };
    }),

  updateLine: (key, patch) =>
    set((state) => {
      const tickets = state.tickets.map((ticket) =>
        ticket.id === state.activeTicketId
          ? {
              ...ticket,
              lines: ticket.lines.map((row) => (row.key === key ? { ...row, ...patch } : row)),
            }
          : ticket
      );
      persist(tickets, state.activeTicketId);
      return { tickets };
    }),

  removeLine: (key) =>
    set((state) => {
      const tickets = state.tickets.map((ticket) =>
        ticket.id === state.activeTicketId
          ? { ...ticket, lines: ticket.lines.filter((row) => row.key !== key) }
          : ticket
      );
      persist(tickets, state.activeTicketId);
      return {
        tickets,
        selectedLineKey: state.selectedLineKey === key ? null : state.selectedLineKey,
      };
    }),

  selectLine: (selectedLineKey) => set({ selectedLineKey }),

  clearActiveTicket: () =>
    set((state) => {
      const tickets = state.tickets.map((ticket) =>
        ticket.id === state.activeTicketId
          ? { ...ticket, lines: [], discount: 0, notes: "", idempotencyKey: null, customerId: null, customerName: null, customerTier: PRICING_TIERS.RETAIL }
          : ticket
      );
      persist(tickets, state.activeTicketId);
      return { tickets, selectedLineKey: null };
    }),
}));
