import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  descargarDocumentoExpediente,
  type Expediente,
  obtenerExpediente,
} from '../../servicios/clienteApi';
import { AccionesEvaluador } from '../../componentes/AccionesEvaluador';
import { DescargarEsquela } from '../../componentes/DescargarEsquela';
import { useSesion } from '../../sesion/ProveedorSesion';
import { ESTADOS, formatearFecha } from './Expedientes';

// Detalle del expediente para el personal (historia 4 de la 004): datos, historial y documentos con
// descarga. La API registra quién abrió el detalle (VER_DETALLE).

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'no-encontrado' }
  | { readonly tipo: 'error'; readonly mensaje: string }
  | { readonly tipo: 'lista'; readonly expediente: Expediente };

const formatearFechaHora = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(new Date(iso));

const CANALES: Record<string, string> = { EN_LINEA: 'En línea', MESA_PARTES: 'Mesa de partes' };

/** Estados en los que el expediente ya tiene esquela (después de confirmar el riesgo). */
const ESTADOS_CON_ESQUELA: ReadonlySet<string> = new Set([
  'PENDIENTE_PAGO',
  'PAGADO',
  'EN_INSPECCION',
  'APROBADO',
  'LICENCIA_PROVISIONAL',
  'LICENCIA_EMITIDA',
]);

/** Página `/personal/expedientes/:numero`. */
export function DetalleExpediente() {
  const { numero = '' } = useParams();
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });
  const [avisoDescarga, setAvisoDescarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { sesion } = useSesion();
  const esEvaluador = sesion?.usuario.roles.includes('EVALUADOR') ?? false;
  // El PDF de la esquela lo descargan EVALUADOR, CAJA y JEFATURA (005).
  const puedeDescargarEsquela =
    sesion?.usuario.roles.some((rol) => ['EVALUADOR', 'CAJA', 'JEFATURA'].includes(rol)) ?? false;

  const cargar = useCallback(async () => {
    setCarga({ tipo: 'cargando' });
    const resultado = await obtenerExpediente(numero);
    switch (resultado.tipo) {
      case 'ok':
        setCarga({ tipo: 'lista', expediente: resultado.datos });
        return;
      case 'no-encontrado':
        setCarga({ tipo: 'no-encontrado' });
        return;
      case 'sin-permiso':
        setCarga({ tipo: 'error', mensaje: 'No tienes permiso para ver este expediente.' });
        return;
      default:
        setCarga({
          tipo: 'error',
          mensaje: 'El expediente no se pudo cargar. Vuelve a intentarlo en unos minutos.',
        });
    }
  }, [numero]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const descargar = async (documentoId: string, nombre: string) => {
    setAvisoDescarga(null);
    const resultado = await descargarDocumentoExpediente(numero, documentoId);
    if (resultado.tipo !== 'ok') {
      setAvisoDescarga(
        resultado.tipo === 'no-encontrado'
          ? 'El documento ya no está disponible.'
          : 'El documento no se pudo descargar. Vuelve a intentarlo.',
      );
      return;
    }
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(resultado.archivo);
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Expediente {numero}</h1>
      </header>

      <main className="contenido">
        {carga.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando el expediente…
          </p>
        )}
        {carga.tipo === 'no-encontrado' && (
          <p className="aviso">No existe un expediente con ese número.</p>
        )}
        {carga.tipo === 'error' && (
          <div className="aviso aviso--error" role="alert">
            <p>{carga.mensaje}</p>
            <button type="button" className="boton" onClick={() => void cargar()}>
              Reintentar
            </button>
          </div>
        )}
        {aviso && (
          <p className="aviso aviso--info" role="status">
            {aviso}
          </p>
        )}
        {carga.tipo === 'lista' && esEvaluador && (
          <AccionesEvaluador
            expediente={carga.expediente}
            alActualizar={(expediente) => {
              setAviso('Decisión guardada.');
              setCarga({ tipo: 'lista', expediente });
            }}
            alCambiar={(mensaje) => {
              setAviso(mensaje);
              void cargar();
            }}
          />
        )}
        {carga.tipo === 'lista' &&
          puedeDescargarEsquela &&
          ESTADOS_CON_ESQUELA.has(carga.expediente.estado) && (
            <DescargarEsquela codigo={`ESQ-${carga.expediente.numero}`} />
          )}
        {carga.tipo === 'lista' && (
          <article className="tarjeta" aria-label={`Expediente ${carga.expediente.numero}`}>
            <dl className="ficha__datos">
              {[
                ['Licencia', carga.expediente.nombreLicencia ?? carga.expediente.codigoReceta],
                ['Estado', ESTADOS[carga.expediente.estado]],
                ['Ruta', carga.expediente.ruta],
                ['Canal', CANALES[carga.expediente.canal] ?? carga.expediente.canal],
                ['Presentado', formatearFecha(carga.expediente.presentadoEn)],
                ['Titular', carga.expediente.nombreTitular],
                ['Documento del titular', carga.expediente.documentoTitularEnmascarado],
                ['Razón social', carga.expediente.razonSocial],
                ['Nombre comercial', carga.expediente.nombreComercial],
                ['Giro', carga.expediente.giro],
                ['Dirección', carga.expediente.direccion],
                ['Zona', carga.expediente.zona],
                [
                  'Área',
                  carga.expediente.areaM2 === null || carga.expediente.areaM2 === undefined
                    ? null
                    : `${String(carga.expediente.areaM2)} m²`,
                ],
              ]
                .filter(
                  (dato): dato is [string, string] => typeof dato[1] === 'string' && dato[1] !== '',
                )
                .map(([etiqueta, valor]) => (
                  <div key={etiqueta} className="ficha__dato">
                    <dt>{etiqueta}</dt>
                    <dd>{valor}</dd>
                  </div>
                ))}
            </dl>

            <h2 className="ficha__subtitulo">Documentos</h2>
            {avisoDescarga && (
              <p className="aviso aviso--error" role="alert">
                {avisoDescarga}
              </p>
            )}
            {carga.expediente.documentos.length === 0 ? (
              <p>Este expediente no tiene documentos.</p>
            ) : (
              <ul className="documentos">
                {carga.expediente.documentos.map((documento) => (
                  <li key={documento.id} className="documento">
                    <span>{documento.nombreOriginal}</span>
                    <button
                      type="button"
                      className="boton boton--secundario"
                      aria-label={`Descargar ${documento.nombreOriginal}`}
                      onClick={() => void descargar(documento.id, documento.nombreOriginal)}
                    >
                      Descargar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="ficha__subtitulo">Historial</h2>
            <ol className="consulta__historial">
              {carga.expediente.historial.map((registro) => (
                <li key={`${registro.estadoNuevo}-${registro.ocurridoEn}`}>
                  {(ESTADOS as Readonly<Record<string, string | undefined>>)[
                    registro.estadoNuevo
                  ] ?? registro.estadoNuevo}
                  {registro.comentario ? ` — ${registro.comentario}` : ''} (
                  {formatearFechaHora(registro.ocurridoEn)})
                </li>
              ))}
            </ol>
          </article>
        )}
        <p className="licencia__volver">
          <Link to="/personal/expedientes">Volver a la bandeja</Link>
        </p>
      </main>
    </>
  );
}
