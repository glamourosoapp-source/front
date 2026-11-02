import { describe, expect, it } from "bun:test";
import { shouldStoreRenewedToken } from "./session-token";

const NOW = Date.UTC(2026, 10, 2, 18, 56);
const DAY = 86_400;

function token(iat: number, exp: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ user_id: "u", iat, exp })}.firma`;
}

const nowSeconds = Math.floor(NOW / 1000);

describe("shouldStoreRenewedToken", () => {
  it("guarda la renovación de una sesión de más de un día", () => {
    const current = token(nowSeconds - 2 * DAY, nowSeconds + 5 * DAY);
    const renewed = token(nowSeconds, nowSeconds + 7 * DAY);
    expect(shouldStoreRenewedToken(renewed, current, NOW)).toBe(true);
  });

  it("ignora el token renovado de una respuesta en caché, ya vencido", () => {
    const fromLogin = token(nowSeconds, nowSeconds + 7 * DAY);
    const cached = token(nowSeconds - 8 * DAY, nowSeconds - DAY);
    expect(shouldStoreRenewedToken(cached, fromLogin, NOW)).toBe(false);
  });

  it("ignora un token en caché aún vigente pero más viejo que el del login", () => {
    const fromLogin = token(nowSeconds, nowSeconds + 7 * DAY);
    const cached = token(nowSeconds - 3 * DAY, nowSeconds + 4 * DAY);
    expect(shouldStoreRenewedToken(cached, fromLogin, NOW)).toBe(false);
  });

  it("sin sesión vigente no revive nada", () => {
    expect(shouldStoreRenewedToken(token(nowSeconds, nowSeconds + 7 * DAY), null, NOW)).toBe(false);
  });

  it("ignora un header que no es un JWT", () => {
    const current = token(nowSeconds - 2 * DAY, nowSeconds + 5 * DAY);
    expect(shouldStoreRenewedToken("basura", current, NOW)).toBe(false);
  });
});
