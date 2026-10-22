"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Rectangle, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { OpportunityMapResponse, OpportunityZone } from "@glamouroso/shared/schemas/opportunity-map";
import { formatMoneyShort } from "@/lib/format-money";
import { BRANCH_COLOR, HEAT_COLORS, ZONE_COLOR } from "./opportunity-colors";

/** Corte de cada escalón por quintiles, para que un par de celdas enormes no aplanen el resto. */
function heatThresholds(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return [];
  return [0.2, 0.4, 0.6, 0.8].map((q) => sorted[Math.floor(q * (sorted.length - 1))]);
}

function heatColor(value: number, thresholds: number[]): string {
  const step = thresholds.findIndex((limit) => value <= limit);
  return HEAT_COLORS[step === -1 ? HEAT_COLORS.length - 1 : step];
}

function zoneIcon(zone: OpportunityZone, selected: boolean) {
  const size = selected ? 34 : 26;
  return L.divIcon({
    className: "opportunity-zone-icon",
    html: `<span class="opportunity-zone-pin${selected ? " is-selected" : ""}" style="width:${size}px;height:${size}px">${zone.rank}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Encuadra el mapa en los datos al cargar y cuando cambian (periodo o radio). */
function FitToData({ data }: { data: OpportunityMapResponse }) {
  const map = useMap();
  useEffect(() => {
    const latLngs: L.LatLngExpression[] = [
      ...data.cells.map((cell) => [cell.lat, cell.lng] as L.LatLngTuple),
      ...data.zones.map((zone) => [zone.lat, zone.lng] as L.LatLngTuple),
    ];
    // Sin demanda ubicada, al menos las sucursales.
    if (!latLngs.length) latLngs.push(...data.branches.map((branch) => [branch.lat, branch.lng] as L.LatLngTuple));
    if (latLngs.length) map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24], maxZoom: 14 });
  }, [data, map]);
  return null;
}

/**
 * Al elegir una zona en la lista, el mapa va a ella. Solo con `focusKey`
 * nuevo: la zona que se preselecciona al cargar no debe quitar la vista de
 * toda la ciudad.
 */
function FlyToZone({ zone, focusKey }: { zone: OpportunityZone | null; focusKey: number }) {
  const map = useMap();
  useEffect(() => {
    if (zone && focusKey > 0) map.flyTo([zone.lat, zone.lng], Math.max(map.getZoom(), 13), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando piden enfocar
  }, [focusKey, map]);
  return null;
}

interface Props {
  data: OpportunityMapResponse;
  selectedZoneId: string | null;
  /** Cambia cada vez que se elige una zona desde la lista. */
  focusKey: number;
  onSelectZone: (zoneId: string) => void;
}

export default function OpportunityLeafletMap({ data, selectedZoneId, focusKey, onSelectZone }: Props) {
  const thresholds = useMemo(() => heatThresholds(data.cells.map((cell) => cell.revenue)), [data.cells]);
  const selectedZone = data.zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const radiusM = data.radiusKm * 1000;

  return (
    <MapContainer
      center={[20.6736, -103.344]}
      zoom={11}
      scrollWheelZoom
      className="opportunity-map"
      attributionControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        className="opportunity-tiles"
      />
      <FitToData data={data} />
      <FlyToZone zone={selectedZone} focusKey={focusKey} />

      {data.cells.map((cell) => (
        <Rectangle
          key={`${cell.lat},${cell.lng}`}
          bounds={[
            [cell.lat - cell.halfLat, cell.lng - cell.halfLng],
            [cell.lat + cell.halfLat, cell.lng + cell.halfLng],
          ]}
          pathOptions={{ stroke: false, fillColor: heatColor(cell.revenue, thresholds), fillOpacity: 0.6 }}
        >
          <Tooltip sticky>
            {cell.customers} {cell.customers === 1 ? "cliente" : "clientes"} · {cell.orders} pedidos ·{" "}
            {formatMoneyShort(cell.revenue)}
          </Tooltip>
        </Rectangle>
      ))}

      {data.branches.map((branch) => (
        <Circle
          key={`radius-${branch.id}`}
          center={[branch.lat, branch.lng]}
          radius={radiusM}
          interactive={false}
          pathOptions={{ color: BRANCH_COLOR, weight: 1, dashArray: "4 4", fillColor: BRANCH_COLOR, fillOpacity: 0.04 }}
        />
      ))}

      {selectedZone ? (
        <Circle
          center={[selectedZone.lat, selectedZone.lng]}
          radius={radiusM}
          interactive={false}
          pathOptions={{ color: ZONE_COLOR, weight: 2, dashArray: "6 4", fillColor: ZONE_COLOR, fillOpacity: 0.06 }}
        />
      ) : null}

      {data.branches.map((branch) => (
        <CircleMarker
          key={branch.id}
          center={[branch.lat, branch.lng]}
          radius={7}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: BRANCH_COLOR, fillOpacity: 1 }}
        >
          <Tooltip>
            <strong>
              {branch.code} · {branch.name}
            </strong>
            <br />
            {branch.weeklySales !== null
              ? `Vende ${formatMoneyShort(branch.weeklySales)} por semana en caja`
              : branch.type === "franchise"
                ? "Franquicia (sin caja)"
                : "Aún sin una semana de ventas en caja"}
          </Tooltip>
        </CircleMarker>
      ))}

      {data.zones.map((zone) => (
        <Marker
          key={zone.id}
          position={[zone.lat, zone.lng]}
          icon={zoneIcon(zone, zone.id === selectedZoneId)}
          zIndexOffset={zone.id === selectedZoneId ? 1000 : 500}
          eventHandlers={{ click: () => onSelectZone(zone.id) }}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            #{zone.rank} {zone.label} · puntaje {zone.score}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
