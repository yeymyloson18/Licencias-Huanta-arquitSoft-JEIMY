// Pie del portal (008): enlace a la documentación interactiva de la API, servida por la propia API en
// /api/docs. Solo se muestra cuando el portal se compiló con la documentación activa (no en
// producción, donde /api/docs está apagada por defecto).

interface Propiedades {
  /** Por defecto, lo que se fijó al compilar (`__DOCS_API__`). */
  readonly mostrarDocumentacion?: boolean;
}

export function PiePagina({ mostrarDocumentacion = __DOCS_API__ }: Propiedades) {
  if (!mostrarDocumentacion) {
    return null;
  }
  return (
    <footer className="pie">
      <a href="/api/docs/">Documentación de la API</a>
    </footer>
  );
}
