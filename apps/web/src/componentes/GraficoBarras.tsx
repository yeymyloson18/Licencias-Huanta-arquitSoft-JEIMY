import { useId } from 'react';

// Gráfico de barras horizontales en SVG, accesible (FR-005 de la 007, contracts/portal-007.md): el SVG
// tiene título y un resumen en texto, y debajo va una tabla con los mismos datos. Se adapta al ancho
// (viewBox), así que funciona a 360 px sin desplazamiento horizontal.

export interface Barra {
  readonly etiqueta: string;
  readonly valor: number;
  /** Texto del valor (por ejemplo "S/ 177.10" o "2.5 días"); por defecto, el número. */
  readonly texto?: string;
  /** Marca opcional (por ejemplo, el plazo del TUPA) en la misma escala. */
  readonly marca?: number;
}

interface Propiedades {
  readonly titulo: string;
  readonly barras: readonly Barra[];
  /** Encabezados de la tabla: [etiqueta, valor]. */
  readonly columnas: readonly [string, string];
  /** Texto de la marca en la leyenda (si hay marcas). */
  readonly leyendaMarca?: string;
}

const ALTO_BARRA = 28;
const ANCHO = 320;
const ANCHO_ETIQUETA = 120;

/** "3 expedientes: 2 Pagado, 1 Observado" o el texto que corresponda. */
export const resumenDe = (titulo: string, barras: readonly Barra[]): string =>
  barras.length === 0
    ? `${titulo}: sin datos.`
    : `${titulo}: ${barras.map((b) => `${b.etiqueta}, ${b.texto ?? String(b.valor)}`).join('; ')}.`;

export function GraficoBarras({ titulo, barras, columnas, leyendaMarca }: Propiedades) {
  const id = useId();
  const maximo = Math.max(1, ...barras.flatMap((b) => [b.valor, b.marca ?? 0]));
  const escala = (valor: number) => ((ANCHO - ANCHO_ETIQUETA - 8) * valor) / maximo;
  const alto = Math.max(1, barras.length) * ALTO_BARRA;

  return (
    <figure className="grafico">
      {barras.length > 0 && (
        <svg
          className="grafico__svg"
          role="img"
          viewBox={`0 0 ${String(ANCHO)} ${String(alto)}`}
          aria-labelledby={`${id}-titulo`}
          aria-describedby={`${id}-resumen`}
        >
          <title id={`${id}-titulo`}>{titulo}</title>
          {barras.map((barra, indice) => {
            const y = indice * ALTO_BARRA;
            return (
              <g key={barra.etiqueta}>
                <text x={0} y={y + 18} className="grafico__etiqueta">
                  {barra.etiqueta.length > 16 ? `${barra.etiqueta.slice(0, 15)}…` : barra.etiqueta}
                </text>
                <rect
                  x={ANCHO_ETIQUETA}
                  y={y + 4}
                  width={Math.max(2, escala(barra.valor))}
                  height={ALTO_BARRA - 10}
                  className="grafico__barra"
                />
                {barra.marca !== undefined && (
                  <line
                    x1={ANCHO_ETIQUETA + escala(barra.marca)}
                    x2={ANCHO_ETIQUETA + escala(barra.marca)}
                    y1={y + 1}
                    y2={y + ALTO_BARRA - 3}
                    className="grafico__marca"
                  />
                )}
              </g>
            );
          })}
        </svg>
      )}
      <figcaption id={`${id}-resumen`} className="grafico__resumen">
        {resumenDe(titulo, barras)}
        {leyendaMarca && barras.some((b) => b.marca !== undefined) ? ` ${leyendaMarca}` : ''}
      </figcaption>
      <div className="grafico__tabla" role="region" aria-label={`Tabla: ${titulo}`} tabIndex={0}>
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">{columnas[0]}</th>
              <th scope="col">{columnas[1]}</th>
            </tr>
          </thead>
          <tbody>
            {barras.map((barra) => (
              <tr key={barra.etiqueta}>
                <th scope="row">{barra.etiqueta}</th>
                <td>{barra.texto ?? String(barra.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
