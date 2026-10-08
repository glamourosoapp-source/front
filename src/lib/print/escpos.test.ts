import { describe, expect, test } from "bun:test";
import { DEFAULT_TICKET_SETTINGS } from "@glamouroso/shared";
import { sampleSale } from "@/lib/pos/sample-ticket";
import { buildTicketEscPos } from "./escpos";

// ESC p 0 25 250 (pin 2) seguido de ESC p 1 25 250 (pin 5).
const DRAWER_PULSE = [0x1b, 0x70, 0x00, 0x19, 0xfa, 0x1b, 0x70, 0x01, 0x19, 0xfa];

function countPulses(bytes: Uint8Array): number {
  let count = 0;
  for (let i = 0; i + 4 < bytes.length; i += 1) {
    if (bytes[i] === 0x1b && bytes[i + 1] === 0x70 && bytes[i + 3] === 0x19 && bytes[i + 4] === 0xfa) {
      count += 1;
    }
  }
  return count;
}

describe("cajón de dinero", () => {
  const sale = sampleSale({});

  test("una venta nueva abre el cajón antes de imprimir", () => {
    const bytes = buildTicketEscPos(sale, DEFAULT_TICKET_SETTINGS, { openDrawer: true });
    expect(Array.from(bytes.slice(0, DRAWER_PULSE.length))).toEqual(DRAWER_PULSE);
    expect(countPulses(bytes)).toBe(2);
  });

  test("con copias el cajón se abre una sola vez", () => {
    const bytes = buildTicketEscPos(sale, { ...DEFAULT_TICKET_SETTINGS, copies: 2 }, { openDrawer: true });
    expect(countPulses(bytes)).toBe(2);
  });

  test("una reimpresión no abre el cajón", () => {
    const bytes = buildTicketEscPos(sale, DEFAULT_TICKET_SETTINGS, { openDrawer: true, reprint: true });
    expect(countPulses(bytes)).toBe(0);
  });

  test("sin pedirlo no abre el cajón", () => {
    expect(countPulses(buildTicketEscPos(sale, DEFAULT_TICKET_SETTINGS))).toBe(0);
  });
});
