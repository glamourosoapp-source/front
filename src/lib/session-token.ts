/**
 * ¿Se guarda la sesión renovada que mandó el back (`X-Renewed-Token`)?
 *
 * El header puede venir de la caché del navegador, no del servidor: una
 * respuesta que se guardó con su token renovado la reutiliza el navegador cada
 * vez que el back contesta 304, con todo y ese token. Una semana después ese
 * token ya venció, y guardarlo encima del que acaba de dar el login sacaba a la
 * caja en cada intento ("¿Deseas salir de la app?", 2026-11-02).
 *
 * Por eso solo se acepta si es más nuevo que el vigente y no ha vencido. Sin
 * sesión vigente no se acepta nada: un header en caché no revive una sesión
 * cerrada.
 */
export function shouldStoreRenewedToken(
  renewed: string,
  current: string | null,
  now: number = Date.now()
): boolean {
  if (!current) return false;
  const next = readClaims(renewed);
  if (!next?.iat || !next.exp || next.exp * 1000 <= now) return false;
  const previous = readClaims(current);
  if (!previous?.iat) return true;
  return next.iat > previous.iat;
}

function readClaims(token: string): { iat?: number; exp?: number } | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}
