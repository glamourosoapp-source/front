"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton } from "@mui/material";
import { Building2, Info, MapPinned, Search, Store, Users } from "lucide-react";
import { toast } from "sonner";
import { OPPORTUNITY_MAP } from "@glamouroso/shared/constants";
import type {
  OpportunityBusinessScanResponse,
  OpportunityGeocodeResponse,
  OpportunityMapResponse,
  OpportunityZone,
} from "@glamouroso/shared/schemas/opportunity-map";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import { formatMoneyShort } from "@/lib/format-money";
import { HEAT_COLORS, ZONE_COLOR } from "./opportunity-colors";

// Leaflet toca `window` al importarse: solo en el navegador.
const OpportunityLeafletMap = dynamic(() => import("./OpportunityLeafletMap"), {
  ssr: false,
  loading: () => <Skeleton variant="rounded" className="opportunity-map" animation="wave" />,
});

const MISSING_REASON: Record<string, string> = {
  sin_direccion: "sin dirección capturada",
  pendiente: "falta ubicarla",
  no_encontrada: "Google no encontró su dirección",
};

/** Tandas de geocodificación por clic (300 cada una): cubre ~1,500 direcciones. */
const MAX_GEOCODE_ROUNDS = 5;

function zoneProspectQuery(zone: OpportunityZone): string {
  return `lavanderías y restaurantes en ${zone.label}${zone.city ? `, ${zone.city}` : ""}`;
}

function ScoreBar({ score }: { score: number }) {
  return (
    <span className="opportunity-score-bar" aria-hidden>
      <span style={{ width: `${Math.max(4, score)}%` }} />
    </span>
  );
}

function ZoneDetail({ zone, data }: { zone: OpportunityZone; data: OpportunityMapResponse }) {
  const weeks = data.days / 7;
  return (
    <div className="opportunity-detail">
      <div className="opportunity-detail-head">
        <span className="opportunity-zone-pin is-static">{zone.rank}</span>
        <div>
          <strong>{zone.label}</strong>
          <small>{zone.city || "Ciudad sin capturar"}</small>
        </div>
        <span className="opportunity-detail-score">
          {zone.score}
          <small>/100</small>
        </span>
      </div>

      <dl className="opportunity-facts">
        <div>
          <dt>Demanda a {data.radiusKm} km</dt>
          <dd>
            {zone.demand.customers} clientes · {zone.demand.orders} pedidos
            <small>
              {formatMoneyShort(zone.demand.revenue)} en {data.days} días (~
              {formatMoneyShort(zone.demand.revenue / weeks)} por semana)
            </small>
          </dd>
        </div>
        <div>
          <dt>Sucursal más cercana</dt>
          <dd>
            {zone.nearestBranch ? (
              <>
                {zone.nearestBranch.code} · {zone.nearestBranch.name}
                <small>a {zone.nearestBranch.distanceKm.toLocaleString("es-MX")} km</small>
              </>
            ) : (
              "Ninguna en el mapa"
            )}
          </dd>
        </div>
        <div>
          <dt>Negocios a {OPPORTUNITY_MAP.SCAN_RADIUS_KM} km</dt>
          <dd>
            {zone.businesses ? (
              <span className="opportunity-business-list">
                {OPPORTUNITY_MAP.BUSINESS_CATEGORIES.map((category) => (
                  <span key={category.key}>
                    <strong>
                      {zone.businesses!.counts[category.key]}
                      {zone.businesses!.capped && zone.businesses!.counts[category.key] >= 60 ? "+" : ""}
                    </strong>{" "}
                    {category.label.toLowerCase()}
                  </span>
                ))}
              </span>
            ) : (
              <small>Aún sin contar: usa “Contar negocios” arriba.</small>
            )}
          </dd>
        </div>
        <div>
          <dt>Venta estimada de una tienda aquí</dt>
          <dd>
            {zone.estimatedWeeklySales !== null ? (
              <>
                ~{formatMoneyShort(zone.estimatedWeeklySales)} por semana
                <small>
                  Estimación preliminar: lo que venden en caja las tiendas por cada peso de demanda a
                  domicilio a su alrededor ({data.model.branchesWithData} tiendas con datos).
                </small>
              </>
            ) : (
              <small>
                Faltan tiendas con al menos una semana de ventas en caja y demanda ubicada alrededor para
                comparar.
              </small>
            )}
          </dd>
        </div>
      </dl>

      {zone.similarBranches.length ? (
        <div className="opportunity-similar">
          <span>Tiendas con demanda parecida alrededor</span>
          {zone.similarBranches.map((branch) => (
            <div key={branch.code}>
              <strong>{branch.code}</strong> {branch.name}
              <em>{formatMoneyShort(branch.weeklySales)}/sem</em>
            </div>
          ))}
        </div>
      ) : null}

      <div className="opportunity-detail-actions">
        <Button
          size="small"
          variant="outlined"
          startIcon={<Search size={16} />}
          component={Link}
          href={`/dashboard/prospeccion?tab=buscar&q=${encodeURIComponent(zoneProspectQuery(zone))}`}
        >
          Buscar negocios en esta zona
        </Button>
        <Button
          size="small"
          variant="text"
          startIcon={<MapPinned size={16} />}
          component="a"
          href={`https://www.google.com/maps/search/?api=1&query=${zone.lat.toFixed(5)},${zone.lng.toFixed(5)}`}
          target="_blank"
          rel="noreferrer"
        >
          Ver en Google Maps
        </Button>
      </div>
    </div>
  );
}

/**
 * Mapa de oportunidad (Crecimiento): dónde hay demanda a domicilio sin una
 * sucursal a menos de N km, con un puntaje por zona. Spec:
 * docs/product-specs/mapa-oportunidad.md.
 */
export function OpportunityMapPage() {
  const { can } = usePermissions();
  const user = useAuthStore((s) => s.user);
  const canView = can("expansion");
  const canRun = can("expansion", "update");

  const [days, setDays] = useState<number>(OPPORTUNITY_MAP.DEFAULT_DAYS);
  const [radiusKm, setRadiusKm] = useState<number>(OPPORTUNITY_MAP.DEFAULT_RADIUS_KM);
  const [data, setData] = useState<OpportunityMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [geocoding, setGeocoding] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showHow, setShowHow] = useState(false);

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const response = await httpClient.get<OpportunityMapResponse>("/opportunity-map", { days, radiusKm });
      if (seq !== loadSeq.current) return;
      setData(response);
      setLoadError(null);
      setSelectedZoneId((current) =>
        response.zones.some((zone) => zone.id === current) ? current : (response.zones[0]?.id ?? null)
      );
    } catch (error) {
      if (seq !== loadSeq.current) return;
      setLoadError(getApiErrorMessage(error, "No se pudo cargar el mapa"));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [days, radiusKm]);

  useEffect(() => {
    if (!user || !canView) return;
    load().catch(() => undefined);
  }, [load, user, canView]);

  async function locatePending() {
    setGeocoding(true);
    let located = 0;
    let notFound = 0;
    try {
      for (let round = 0; round < MAX_GEOCODE_ROUNDS; round += 1) {
        const result = await httpClient.post<OpportunityGeocodeResponse>("/opportunity-map/geocode", {});
        located += result.located;
        notFound += result.notFound;
        if (result.stoppedReason) {
          toast.error(result.stoppedReason, { duration: 12000 });
          break;
        }
        if (result.remaining <= 0 || result.located + result.notFound === 0) break;
      }
      if (located || notFound) {
        toast.success(
          `${located} direcciones ubicadas${notFound ? `, ${notFound} que Google no encontró con precisión` : ""}`
        );
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron ubicar las direcciones"));
    } finally {
      setGeocoding(false);
      load().catch(() => undefined);
    }
  }

  async function scanBusinesses() {
    setScanning(true);
    try {
      const result = await httpClient.post<OpportunityBusinessScanResponse>("/opportunity-map/businesses", {
        days,
        radiusKm,
        top: OPPORTUNITY_MAP.DEFAULT_SCAN_ZONES,
      });
      if (result.stoppedReason) toast.error(result.stoppedReason, { duration: 12000 });
      else
        toast.success(
          `Negocios contados en ${result.zones} zonas (${result.searches} búsquedas nuevas, ${result.cached} de la caché)`
        );
      setScanOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron contar los negocios"));
    } finally {
      setScanning(false);
      load().catch(() => undefined);
    }
  }

  if (user && !canView) {
    return (
      <div className="page-stack">
        <section className="panel p-5">
          <h2 style={{ margin: 0 }}>Sin acceso al Mapa de oportunidad</h2>
          <p className="page-kicker" style={{ margin: 0 }}>
            Pide a tu administrador el permiso “Crecimiento: mapa de oportunidad”.
          </p>
        </section>
      </div>
    );
  }

  const coverage = data?.coverage;
  const selectedZone = data?.zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const unscannedTop = data?.zones.slice(0, OPPORTUNITY_MAP.DEFAULT_SCAN_ZONES).filter((zone) => !zone.businesses).length ?? 0;
  const located = coverage ? coverage.located : 0;
  const locatedPct = coverage && coverage.locations ? Math.round((located / coverage.locations) * 100) : 0;

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Mapa de oportunidad</h1>
          <p className="page-kicker">
            Dónde viven los clientes que piden a domicilio y no tienen una sucursal a menos de {radiusKm} km:
            ahí conviene la siguiente tienda o franquicia.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Periodo">
            {OPPORTUNITY_MAP.DAY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                Pedidos de los últimos {option} días
              </option>
            ))}
          </select>
          <select
            className="input"
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            aria-label="Radio de una tienda"
          >
            {OPPORTUNITY_MAP.RADIUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                Una tienda cubre {option} km
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadError ? (
        <div className="panel p-4 flex flex-wrap items-center justify-between gap-2" style={{ borderColor: "#f5a524" }}>
          <span className="page-kicker" style={{ margin: 0 }}>
            <strong>No se pudo cargar el mapa:</strong> {loadError}
          </span>
          <Button size="small" variant="outlined" onClick={() => load()}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {coverage && (coverage.pending > 0 || coverage.branchesMissing.length > 0) ? (
        <div className="panel p-4 opportunity-coverage">
          <div>
            {coverage.pending > 0 ? (
              <p style={{ margin: 0 }}>
                <strong>
                  {coverage.pending} de {coverage.locations} domicilios
                </strong>{" "}
                todavía no están en el mapa. Se ubican una sola vez con Google (unos US$5 por cada 1,000
                direcciones) y se guardan.
              </p>
            ) : null}
            {coverage.branchesMissing.length > 0 ? (
              <p className="page-kicker" style={{ margin: coverage.pending > 0 ? "6px 0 0" : 0 }}>
                Sucursales fuera del mapa:{" "}
                {coverage.branchesMissing.map((branch, index) => (
                  <span key={branch.code}>
                    {index ? "; " : ""}
                    <strong>{branch.code}</strong> ({MISSING_REASON[branch.reason]})
                  </span>
                ))}
                .{" "}
                {coverage.branchesMissing.some((branch) => branch.reason === "sin_direccion")
                  ? "Captura su dirección en Punto de venta → Sucursales."
                  : ""}
              </p>
            ) : null}
          </div>
          {canRun && (coverage.pending > 0 || coverage.branchesMissing.some((b) => b.reason === "pendiente")) ? (
            <Button variant="contained" onClick={locatePending} disabled={geocoding}>
              {geocoding ? "Ubicando…" : "Ubicar direcciones pendientes"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <section className="grid grid-4">
        <div className="card metric">
          <span>Demanda a domicilio</span>
          <strong>{data ? formatMoneyShort(data.totals.revenue) : "—"}</strong>
          <small>
            {data ? `${data.totals.customers} clientes · ${data.totals.orders} pedidos en ${data.days} días` : " "}
          </small>
        </div>
        <div className="card metric">
          <span>Domicilios en el mapa</span>
          <strong>{coverage ? `${locatedPct} %` : "—"}</strong>
          <small>{coverage ? `${located} de ${coverage.locations} con pedidos en el periodo` : " "}</small>
        </div>
        <div className="card metric">
          <span>Sucursales en el mapa</span>
          <strong>{coverage ? coverage.branchesLocated : "—"}</strong>
          <small>{coverage ? `de ${coverage.branches} activas (tiendas y franquicias)` : " "}</small>
        </div>
        <div className="card metric">
          <span>Zonas sugeridas</span>
          <strong>{data ? data.zones.length : "—"}</strong>
          <small>Con 3+ clientes y sin tienda a {radiusKm} km</small>
        </div>
      </section>

      <section className="opportunity-layout">
        <div className="panel opportunity-map-panel">
          {data ? (
            <OpportunityLeafletMap
              data={data}
              selectedZoneId={selectedZoneId}
              focusKey={focusKey}
              onSelectZone={setSelectedZoneId}
            />
          ) : (
            <Skeleton variant="rounded" className="opportunity-map" animation="wave" />
          )}
          <div className="opportunity-legend">
            <span>
              <i className="opportunity-legend-heat">
                {HEAT_COLORS.map((color) => (
                  <b key={color} style={{ background: color }} />
                ))}
              </i>
              Importe a domicilio por km² (menos → más)
            </span>
            <span>
              <i className="opportunity-legend-branch" /> Sucursal y su radio de {radiusKm} km
            </span>
            <span>
              <i className="opportunity-legend-zone" style={{ background: ZONE_COLOR }} /> Zona sugerida
            </span>
          </div>
        </div>

        <aside className="panel p-4 opportunity-side">
          <div className="opportunity-side-head">
            <h2>Zonas sugeridas</h2>
            <button type="button" className="opportunity-how" onClick={() => setShowHow((v) => !v)}>
              <Info size={14} /> ¿Cómo se calcula?
            </button>
          </div>
          {showHow ? (
            <p className="opportunity-how-text">
              Cada celda de 1 km con domicilios se evalúa por lo que tiene a {radiusKm} km: <strong>65 %</strong>{" "}
              demanda a domicilio (importe y clientes distintos, contra la mejor zona), <strong>15 %</strong> qué
              tan lejos queda la sucursal más cercana y <strong>20 %</strong> negocios objetivo (lavanderías,
              restaurantes y hoteles) cuando ya se contaron. Solo entran zonas con 3 o más clientes y sin tienda
              dentro del radio, y no se enciman entre sí.
            </p>
          ) : null}

          {canRun && data && data.zones.length > 0 && unscannedTop > 0 ? (
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Building2 size={16} />}
              onClick={() => setScanOpen(true)}
              style={{ marginBottom: 12 }}
            >
              Contar negocios en las {Math.min(OPPORTUNITY_MAP.DEFAULT_SCAN_ZONES, data.zones.length)} mejores zonas
            </Button>
          ) : null}

          {loading && !data ? (
            <div className="grid gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rounded" height={52} animation="wave" />
              ))}
            </div>
          ) : data && data.zones.length === 0 ? (
            <p className="page-kicker" style={{ padding: "16px 0" }}>
              {coverage && coverage.located === 0
                ? "Todavía no hay domicilios ubicados. Ubica las direcciones pendientes para ver el mapa."
                : `No hay zonas con 3 o más clientes sin una sucursal a ${radiusKm} km. Prueba un radio menor o un periodo más largo.`}
            </p>
          ) : (
            <ol className="opportunity-zone-list">
              {data?.zones.map((zone) => (
                <li key={zone.id}>
                  <button
                    type="button"
                    className={zone.id === selectedZoneId ? "is-selected" : undefined}
                    onClick={() => {
                      setSelectedZoneId(zone.id);
                      setFocusKey((key) => key + 1);
                    }}
                  >
                    <span className="opportunity-zone-pin is-static">{zone.rank}</span>
                    <span className="opportunity-zone-text">
                      <strong>{zone.label}</strong>
                      <small>
                        <Users size={12} /> {zone.demand.customers} · {formatMoneyShort(zone.demand.revenue)}
                        {zone.nearestBranch ? (
                          <>
                            {" "}
                            · <Store size={12} /> {zone.nearestBranch.distanceKm.toLocaleString("es-MX")} km
                          </>
                        ) : null}
                      </small>
                    </span>
                    <span className="opportunity-zone-score">
                      {zone.score}
                      <ScoreBar score={zone.score} />
                    </span>
                  </button>
                  {zone.id === selectedZoneId && data ? <ZoneDetail zone={zone} data={data} /> : null}
                </li>
              ))}
            </ol>
          )}
          {selectedZone === null && data && data.zones.length > 0 ? (
            <p className="page-kicker">Elige una zona para ver su detalle.</p>
          ) : null}
        </aside>
      </section>

      <Dialog open={scanOpen} onClose={() => (scanning ? undefined : setScanOpen(false))} maxWidth="xs" fullWidth>
        <DialogTitle>Contar negocios con Google Places</DialogTitle>
        <DialogContent>
          <p style={{ marginTop: 0 }}>
            Se buscan lavanderías, restaurantes y hoteles a {OPPORTUNITY_MAP.SCAN_RADIUS_KM} km de las{" "}
            {Math.min(OPPORTUNITY_MAP.DEFAULT_SCAN_ZONES, data?.zones.length ?? 0)} mejores zonas: hasta{" "}
            {unscannedTop * OPPORTUNITY_MAP.BUSINESS_CATEGORIES.length * 3} consultas a Google, solo de identificadores
            (la tarifa más baja; pocos dólares como máximo).
          </p>
          <p className="page-kicker" style={{ marginBottom: 0 }}>
            Lo contado se guarda {OPPORTUNITY_MAP.PLACES_CACHE_DAYS} días y no se vuelve a pagar. No se importa ni
            se contacta a ningún negocio.
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScanOpen(false)} disabled={scanning}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={scanBusinesses} disabled={scanning}>
            {scanning ? "Contando…" : "Contar negocios"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
