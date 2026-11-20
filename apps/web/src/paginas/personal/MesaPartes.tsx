import { useEffect, useId, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { aIdentidadSolicitud, CamposIdentidad } from '../../componentes/CamposIdentidad';
import { FormularioSolicitud, revisarFormulario } from '../../componentes/FormularioSolicitud';
import { formatearPlazoConTipo, formatearTasaFicha } from '../../componentes/formato';
import {
  listarLicencias,
  type NuevaSolicitud,
  obtenerFicha,
  type Receta,
  type RecetaResumen,
  registrarSolicitudPresencial,
  subirDocumentoPersonal,
} from '../../servicios/clienteApi';
import { useMesaPartes } from '../../tramite/ContextoMesaPartes';

// Registro presencial en mesa de partes (historia 3 de la 004, contracts/portal-tramite.md): mismo
// formulario que en línea; la identidad se comprueba con el servicio de identificación sin código.

const MENSAJE_NO_COINCIDE = 'Los datos del titular no coinciden con el servicio de identificación.';
const MENSAJE_SERVICIO_CAIDO =
  'El servicio de identificación no responde. Vuelve a intentarlo en unos minutos.';
const MENSAJE_NO_DISPONIBLE =
  'No se pudo registrar en este momento. Vuelve a intentarlo: no se duplicará.';
const MENSAJE_SIN_PERMISO = 'Tu usuario no tiene permiso para registrar solicitudes.';
const AVISO_SESION =
  'Tu sesión terminó. Ingresa de nuevo: conservamos lo que escribiste en esta pantalla.';

type EstadoCarga<T> =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'error' }
  | { readonly tipo: 'lista'; readonly datos: T };

/** Separa los errores de la identidad (`identidad.ruc` → `ruc`) de los del formulario. */
const separarErrores = (errores: readonly { campo: string; mensaje: string }[]) => {
  const identidad: Record<string, string> = {};
  const formulario: Record<string, string> = {};
  let noCoincide = false;
  for (const { campo, mensaje } of errores) {
    if (campo === 'identidad') {
      noCoincide = true;
    } else if (campo.startsWith('identidad.')) {
      identidad[campo.slice('identidad.'.length)] = mensaje;
    } else {
      formulario[campo] = mensaje;
    }
  }
  return { identidad, formulario, noCoincide };
};

/** Página `/personal/mesa-partes/nueva?licencia=<código>`. */
export function MesaPartes() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [parametros] = useSearchParams();
  const mesa = useMesaPartes();
  const idSelector = useId();
  const [licencias, setLicencias] = useState<EstadoCarga<RecetaResumen[]>>({ tipo: 'cargando' });
  const [receta, setReceta] = useState<EstadoCarga<Receta | null> | null>(null);
  const [erroresIdentidad, setErroresIdentidad] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const { licencia, elegirLicencia } = mesa;

  // La licencia de la URL solo se toma si todavía no se eligió ninguna (no pisa lo escrito).
  useEffect(() => {
    const inicial = parametros.get('licencia');
    if (licencia === '' && inicial !== null) {
      elegirLicencia(inicial);
    }
  }, [parametros, licencia, elegirLicencia]);

  useEffect(() => {
    let vigente = true;
    listarLicencias()
      .then((todas) => {
        if (vigente) {
          setLicencias({ tipo: 'lista', datos: todas.filter((r) => r.tipo === 'LICENCIA') });
        }
      })
      .catch(() => {
        if (vigente) {
          setLicencias({ tipo: 'error' });
        }
      });
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (licencia === '') {
      setReceta(null);
      return;
    }
    let vigente = true;
    setReceta({ tipo: 'cargando' });
    obtenerFicha(licencia)
      .then((ficha) => {
        if (vigente) {
          setReceta({ tipo: 'lista', datos: ficha && ficha.tipo === 'LICENCIA' ? ficha : null });
        }
      })
      .catch(() => {
        if (vigente) {
          setReceta({ tipo: 'error' });
        }
      });
    return () => {
      vigente = false;
    };
  }, [licencia]);

  const registrar = async (fichaReceta: Receta) => {
    const revision = revisarFormulario(
      fichaReceta,
      mesa.identidad.conRepresentante,
      mesa.borrador,
      mesa.documentos,
    );
    setError(null);
    setErroresIdentidad({});
    setErrores(revision);
    if (Object.keys(revision).length > 0) {
      return;
    }
    const { borrador } = mesa;
    const texto = (valor: string) => (valor.trim() === '' ? null : valor.trim());
    const solicitud: NuevaSolicitud = {
      codigoReceta: fichaReceta.codigo,
      identidad: aIdentidadSolicitud(mesa.identidad),
      nombreTitular: borrador.nombreTitular.trim(),
      razonSocial: texto(borrador.razonSocial),
      correo: texto(borrador.correo),
      nombreComercial: texto(borrador.nombreComercial),
      giro: borrador.giro.trim(),
      direccion: borrador.direccion.trim(),
      zona: borrador.zona.trim(),
      areaM2: borrador.areaM2.trim() === '' ? null : Number(borrador.areaM2.replace(',', '.')),
      documentos: Object.entries(mesa.documentos).map(([requisitoId, documento]) => ({
        requisitoId: Number(requisitoId),
        documentoId: documento.documentoId,
      })),
    };
    setEnviando(true);
    const resultado = await registrarSolicitudPresencial(solicitud, mesa.claveIdempotencia);
    setEnviando(false);
    switch (resultado.tipo) {
      case 'ok':
        mesa.terminar();
        void navegar(`/tramite/comprobante/${resultado.expediente.numero}`, {
          state: { expediente: resultado.expediente },
        });
        return;
      case 'invalido': {
        const separados = separarErrores(resultado.errores);
        setErroresIdentidad(separados.identidad);
        setErrores(separados.formulario);
        if (separados.noCoincide) {
          setError(MENSAJE_NO_COINCIDE);
        } else if (Object.keys(separados.identidad).length > 0) {
          setError('Revisa los datos del titular marcados.');
        }
        return;
      }
      case 'no-autenticado':
        void navegar('/ingresar', {
          state: { volverA: ubicacion.pathname, aviso: AVISO_SESION },
        });
        return;
      case 'sin-permiso':
        setError(MENSAJE_SIN_PERMISO);
        return;
      case 'servicio-caido':
        setError(MENSAJE_SERVICIO_CAIDO);
        return;
      case 'no-disponible':
        setError(MENSAJE_NO_DISPONIBLE);
        return;
    }
  };

  const subir = async (archivo: File) => {
    const resultado = await subirDocumentoPersonal(archivo);
    if (resultado.tipo === 'sin-permiso') {
      setError(MENSAJE_SIN_PERMISO);
      return { tipo: 'no-disponible' } as const;
    }
    return resultado;
  };

  const fichaLista = receta?.tipo === 'lista' ? receta.datos : null;

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Registrar solicitud presencial</h1>
        <p className="cabecera__descripcion">
          Mesa de partes: la identidad del titular se comprueba sin código al celular.
        </p>
      </header>

      <main className="contenido tramite">
        {error && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}

        <section className="tarjeta formulario">
          <h2 className="tramite__paso">Licencia y titular</h2>
          {licencias.tipo === 'cargando' && (
            <p className="aviso" role="status">
              Cargando las licencias…
            </p>
          )}
          {licencias.tipo === 'error' && (
            <p className="aviso aviso--error">El catálogo no está disponible en este momento.</p>
          )}
          {licencias.tipo === 'lista' && (
            <div className="campo">
              <label className="campo__etiqueta" htmlFor={idSelector}>
                Licencia solicitada
              </label>
              <select
                id={idSelector}
                className="campo__entrada"
                value={licencia}
                onChange={(evento) => {
                  elegirLicencia(evento.target.value);
                }}
              >
                <option value="">Elige una licencia</option>
                {licencias.datos.map((resumen) => (
                  <option key={resumen.codigo} value={resumen.codigo}>
                    {resumen.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <CamposIdentidad
            valor={mesa.identidad}
            errores={erroresIdentidad}
            alCambiar={mesa.guardarIdentidad}
            etiquetaRepresentante="Actúa un representante legal o apoderado"
          />
        </section>

        {receta?.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando los requisitos…
          </p>
        )}
        {receta?.tipo === 'error' && (
          <p className="aviso aviso--error">Los requisitos no se pudieron cargar.</p>
        )}
        {receta?.tipo === 'lista' && fichaLista === null && (
          <p className="aviso">Esta licencia no se puede registrar.</p>
        )}
        {fichaLista && (
          <section className="tarjeta">
            <h2 className="tramite__paso">
              {fichaLista.nombre}. Tasa: {formatearTasaFicha(fichaLista.tasa)}. Plazo:{' '}
              {formatearPlazoConTipo(fichaLista.plazoDias, fichaLista.tipoPlazo) ?? 'no aplica'}.
            </h2>
            <FormularioSolicitud
              receta={fichaLista}
              conRepresentante={mesa.identidad.conRepresentante}
              borrador={mesa.borrador}
              documentos={mesa.documentos}
              errores={errores}
              enviando={enviando}
              alCambiarBorrador={mesa.guardarBorrador}
              subirDocumento={subir}
              alGuardarDocumento={mesa.guardarDocumento}
              alPerderPermiso={() => {
                void navegar('/ingresar', {
                  state: { volverA: ubicacion.pathname, aviso: AVISO_SESION },
                });
              }}
              alPresentar={() => void registrar(fichaLista)}
            />
          </section>
        )}
      </main>
    </>
  );
}
