// Herramientas técnicas del panel del administrador (010): la documentación interactiva de la API
// (Swagger, actividad 4 del Sprint 2) y el buzón de pruebas de la 009. Antes el enlace a /api/docs
// estaba en el pie de todas las páginas, también las del público; ahora solo lo ve el administrador.
// Solo se muestra cuando el portal se compiló con la documentación activa (desarrollo): en
// producción /api/docs está apagada por defecto y el buzón no existe.

interface Propiedades {
  /** Por defecto, lo que se fijó al compilar (`__DOCS_API__`). */
  readonly mostrar?: boolean;
  /** Dirección del buzón de pruebas (Mailpit); por defecto el puerto 8025 del mismo equipo. */
  readonly urlBuzon?: string;
}

const buzonDelEquipo = (): string =>
  `${window.location.protocol}//${window.location.hostname}:8025/`;

export function HerramientasTecnicas({ mostrar = __DOCS_API__, urlBuzon }: Propiedades) {
  if (!mostrar) {
    return null;
  }
  return (
    <section className="tarjeta" aria-labelledby="herramientas-tecnicas">
      <h2 id="herramientas-tecnicas" className="ficha__nombre">
        Herramientas técnicas
      </h2>
      <p>Solo en desarrollo. No se muestran al público ni en producción.</p>
      <ul className="panel__lista">
        <li>
          <a href="/api/docs/">Documentación de la API (Swagger)</a>
        </li>
        <li>
          <a href={urlBuzon ?? buzonDelEquipo()} target="_blank" rel="noreferrer">
            Buzón de pruebas (códigos y avisos)
          </a>
        </li>
      </ul>
    </section>
  );
}
