interface Propiedades {
  /** Nombre del `<nav>` (por ejemplo, "Páginas"). */
  readonly etiqueta: string;
  readonly pagina: number;
  readonly total: number;
  readonly alCambiar: (pagina: number) => void;
}

/**
 * Paginación con "Anterior", "Página X de Y" y "Siguiente" (013, US5): los textos de siempre con la
 * estructura `pagination` de CoreUI; la página actual lleva `aria-current="page"`.
 */
export function Paginacion({ etiqueta, pagina, total, alCambiar }: Propiedades) {
  const enPrimera = pagina <= 1;
  const enUltima = pagina >= total;

  return (
    <nav className="paginacion" aria-label={etiqueta}>
      <ul className="pagination mb-0">
        <li className={`page-item${enPrimera ? ' disabled' : ''}`}>
          <button
            type="button"
            className="page-link"
            disabled={enPrimera}
            onClick={() => {
              alCambiar(pagina - 1);
            }}
          >
            Anterior
          </button>
        </li>
        <li className="page-item active">
          <span className="page-link" aria-current="page">
            Página {pagina} de {total}
          </span>
        </li>
        <li className={`page-item${enUltima ? ' disabled' : ''}`}>
          <button
            type="button"
            className="page-link"
            disabled={enUltima}
            onClick={() => {
              alCambiar(pagina + 1);
            }}
          >
            Siguiente
          </button>
        </li>
      </ul>
    </nav>
  );
}
