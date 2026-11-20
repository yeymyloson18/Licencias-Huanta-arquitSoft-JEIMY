import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { type LicenciaPublica, verificarLicencia } from '../servicios/clienteApi';

// Verificación pública del QR (historia 1 de la 006, ADR-007): cualquier persona, sin cuenta, ve los
// datos mínimos que prueban que la licencia es válida. Nunca datos personales del titular.

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly licencia: LicenciaPublica }
  | { readonly tipo: 'error'; readonly mensaje: string };

const ESTADOS: Record<string, string> = {
  VIGENTE: 'Vigente',
  VENCIDA: 'Vencida',
  REEMPLAZADA: 'Reemplazada',
};

const ITSE: Record<string, string> = {
  SIN_CERTIFICADO: 'Sin certificado registrado',
  VIGENTE: 'Vigente',
  VENCIDO: 'Vencido',
};

const fecha = (texto: string | null | undefined): string =>
  texto
    ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(`${texto}T00:00:00Z`),
      )
    : '—';

const hora = (instante: Date) =>
  new Intl.DateTimeFormat('es-PE', { timeStyle: 'short', timeZone: 'America/Lima' }).format(
    instante,
  );

/** Página `/verificar/:codigo`. */
export function Verificar() {
  const { codigo = '' } = useParams();
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });

  useEffect(() => {
    let vigente = true;
    void verificarLicencia(codigo).then((resultado) => {
      if (!vigente) {
        return;
      }
      switch (resultado.tipo) {
        case 'ok':
          setCarga({ tipo: 'lista', licencia: resultado.licencia });
          return;
        case 'no-encontrada':
          setCarga({ tipo: 'error', mensaje: 'No encontramos una licencia con ese código.' });
          return;
        case 'bloqueado':
          setCarga({
            tipo: 'error',
            mensaje: `Demasiados intentos. Vuelve a intentarlo después de las ${hora(resultado.reintentarEn)}.`,
          });
          return;
        case 'no-disponible':
          setCarga({
            tipo: 'error',
            mensaje:
              'La verificación no está disponible en este momento. Inténtalo en unos minutos.',
          });
          return;
      }
    });
    return () => {
      vigente = false;
    };
  }, [codigo]);

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Verificación de licencia</h1>
        <p className="cabecera__descripcion">
          Datos de la licencia de funcionamiento asociada al código QR.
        </p>
      </header>
      <main className="contenido">
        {carga.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Verificando…
          </p>
        )}
        {carga.tipo === 'error' && (
          <p className="aviso aviso--error" role="alert">
            {carga.mensaje}
          </p>
        )}
        {carga.tipo === 'lista' && (
          <section className="tarjeta" aria-labelledby="titulo-licencia">
            <h2 id="titulo-licencia" className="ficha__nombre">
              {carga.licencia.numero}
            </h2>
            <p
              className={`aviso ${carga.licencia.estado === 'VIGENTE' ? 'aviso--info' : 'aviso--error'}`}
              role="status"
            >
              Licencia {ESTADOS[carga.licencia.estado]?.toLowerCase() ?? carga.licencia.estado}
            </p>
            <dl className="ficha__datos">
              {[
                ['Tipo', carga.licencia.tipo === 'PROVISIONAL' ? 'Provisional' : 'Definitiva'],
                ['Titular', carga.licencia.titular],
                ['Nombre comercial', carga.licencia.nombreComercial ?? '—'],
                ['Giro', carga.licencia.giro],
                ['Zona', carga.licencia.zona ?? '—'],
                ['Emitida el', fecha(carga.licencia.emitidaEn)],
                [
                  'Vigencia',
                  carga.licencia.vigenteHasta
                    ? `Hasta el ${fecha(carga.licencia.vigenteHasta)}`
                    : 'Indeterminada',
                ],
                [
                  'Certificado ITSE',
                  carga.licencia.itseEstado === 'VIGENTE' || carga.licencia.itseEstado === 'VENCIDO'
                    ? `${ITSE[carga.licencia.itseEstado] ?? ''} (vence el ${fecha(carga.licencia.itseVenceEn)})`
                    : (ITSE[carga.licencia.itseEstado ?? 'SIN_CERTIFICADO'] ?? '—'),
                ],
              ].map(([etiqueta, valor]) => (
                <div key={etiqueta} className="ficha__dato">
                  <dt>{etiqueta}</dt>
                  <dd>{valor}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </main>
    </>
  );
}
