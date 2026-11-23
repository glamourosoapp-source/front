"use client";

import { useState } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";

/**
 * "¿Cómo leer esta tabla?": plegable arriba de los renglones. Explica la letra
 * A/B/C bajo cada producto y qué dice cada columna. Las reglas salen de
 * `INVENTORY_COUNT_DEFAULTS` (ABC por venta en pesos de 90 días con cortes de
 * 80 % y 95 %; tolerancia ±1 L/pz o ±2 %).
 */
export function CountTableGuide({ full, showsExpected }: { full: boolean; showsExpected: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`count-guide${open ? " is-open" : ""}`}>
      <button type="button" className="count-guide-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <CircleHelp size={16} aria-hidden />
        <span>¿Cómo leer esta tabla?</span>
        <ChevronDown size={16} className="count-guide-chevron" aria-hidden />
      </button>
      {open ? (
        <div className="count-guide-body">
          <div className="count-guide-abc">
            <h3>La letra bajo cada producto (A, B, C)</h3>
            <p>Dice qué tanto vende el producto en la sucursal, en pesos, en los últimos 90 días.</p>
            <ul>
              <li>
                <span className="count-abc is-A">A</span>
                <span>
                  <b>Lo que más se vende.</b> Los productos que juntos hacen el 80 % de la venta. Se cuentan cada mes.
                </span>
              </li>
              <li>
                <span className="count-abc is-B">B</span>
                <span>
                  <b>Venta media.</b> El siguiente 15 % de la venta. Se cuentan cada 2 meses.
                </span>
              </li>
              <li>
                <span className="count-abc is-C">C</span>
                <span>
                  <b>Lo que menos se vende.</b> El último 5 % (o sin venta). Se cuentan cada 3 meses.
                </span>
              </li>
            </ul>
            {full ? null : (
              <p className="count-guide-note">
                Junto a la letra va por qué entró a la lista: <b>Vencido</b> (le tocaba por su letra), <b>Riesgo</b>{" "}
                (tuvo diferencias antes o existencia negativa) o <b>Azar</b> (para que la lista no se adivine).
              </p>
            )}
          </div>
          <dl className="count-guide-cols">
            {showsExpected ? (
              <>
                <dt>Esperado</dt>
                <dd>Lo que el sistema decía que había al cerrar el conteo (por ventas, surtidos y ajustes).</dd>
              </>
            ) : null}
            <dt>Contado</dt>
            <dd>
              Lo que capturó el supervisor{full ? "" : ", a ciegas (sin ver lo esperado)"}. Pasa el mouse para ver a qué
              hora.
            </dd>
            {full ? null : (
              <>
                <dt>Reconteo</dt>
                <dd>Segunda captura cuando la primera salió muy lejos de lo esperado. Si hay reconteo, manda ese.</dd>
              </>
            )}
            <dt>Diferencia</dt>
            <dd>
              Contado menos esperado. <span className="count-positive">Verde</span> = sobraba,{" "}
              <span className="count-negative">rojo</span> = faltaba.
            </dd>
            <dt>Diferencia aceptable</dt>
            <dd>
              Se perdona hasta 1 litro o 1 pieza, o el 2 % de lo esperado si eso es más. Ejemplo: si se esperaban 118 L,
              se acepta de 115.6 a 120.4 L. Si la diferencia pasa de eso, el renglón dice &quot;fuera de tolerancia&quot;
              y no cuenta para la exactitud.
            </dd>
            <dt>Valor</dt>
            <dd>La diferencia en pesos a precio de tienda: lo que vale lo que sobró o faltó.</dd>
            <dt>Estado</dt>
            <dd>
              <b>Ajustado</b>: el inventario se corrigió a lo contado. <b>Cuadra</b>: no hubo diferencia.{" "}
              <b>Revertido</b>: el administrador deshizo el ajuste.
            </dd>
            <dt>Revertir</dt>
            <dd>Si fue un error de conteo, deshace el ajuste de ese renglón con un motivo.</dd>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
