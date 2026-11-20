import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { FormularioSolicitud, revisarFormulario } from '../../componentes/FormularioSolicitud';
import { formatearPlazoConTipo, formatearTasaFicha } from '../../componentes/formato';
import {
  type NuevaSolicitud,
  obtenerFicha,
  presentarSolicitud,
  type Receta,
  subirDocumento,
} from '../../servicios/clienteApi';
import { type BorradorSolicitud, useTramite } from '../../tramite/ContextoTramite';
import { TiempoRestante } from '../../tramite/TiempoRestante';

// Formulario del trámite en línea (CU04 de la 004, contracts/portal-tramite.md). Necesita el permiso
// de identidad en memoria; sin él vuelve a la identidad.

const MENSAJE_NO_DISPONIBLE =
  'No pudimos presentar tu solicitud en este momento. Vuelve a intentarlo: no se duplicará.';
const AVISO_PERMISO_VENCIDO =
  'Tu confirmación de identidad venció. Confírmala de nuevo: lo que escribiste se conserva.';
const AVISO_PERMISO_USADO =
  'Esa confirmación de identidad ya se usó en otra solicitud. Confírmala de nuevo para continuar.';
const AVISO_IDENTIDAD_DISTINTA =
  'Los datos de identidad no coinciden con los confirmados. Confírmalos de nuevo.';

const textoONulo = (texto: string) => (texto.trim() === '' ? null : texto.trim());

const aSolicitud = (
  receta: Receta,
  identidad: NuevaSolicitud['identidad'],
  borrador: BorradorSolicitud,
  documentos: Readonly<Record<number, { documentoId: string }>>,
): NuevaSolicitud => ({
  codigoReceta: receta.codigo,
  identidad,
  nombreTitular: borrador.nombreTitular.trim(),
  razonSocial: textoONulo(borrador.razonSocial),
  correo: textoONulo(borrador.correo),
  nombreComercial: textoONulo(borrador.nombreComercial),
  giro: borrador.giro.trim(),
  direccion: borrador.direccion.trim(),
  zona: borrador.zona.trim(),
  areaM2: borrador.areaM2.trim() === '' ? null : Number(borrador.areaM2.replace(',', '.')),
  documentos: Object.entries(documentos).map(([requisitoId, documento]) => ({
    requisitoId: Number(requisitoId),
    documentoId: documento.documentoId,
  })),
});

type EstadoReceta =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'error' }
  | { readonly tipo: 'no-disponible' }
  | { readonly tipo: 'lista'; readonly receta: Receta };

/** Página `/tramite/solicitud?licencia=<código>`. */
export function Solicitud() {
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const codigo = parametros.get('licencia') ?? '';
  const tramite = useTramite();
  const { permiso } = tramite;
  const [estado, setEstado] = useState<EstadoReceta>({ tipo: 'cargando' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // La página misma navega al salir (comprobante o identidad con aviso): sin esta marca, al borrarse
  // el permiso redirigiría a la identidad sin el aviso antes de que la navegación termine.
  const saliendo = useRef(false);

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    try {
      const receta = await obtenerFicha(codigo);
      setEstado(
        receta && receta.tipo === 'LICENCIA'
          ? { tipo: 'lista', receta }
          : { tipo: 'no-disponible' },
      );
    } catch {
      setEstado({ tipo: 'error' });
    }
  }, [codigo]);

  useEffect(() => {
    if (permiso !== null) {
      void cargar();
    }
  }, [cargar, permiso]);

  const aIdentidad = `/tramite/identidad?licencia=${encodeURIComponent(codigo)}`;

  const volverAIdentidad = useCallback(
    (aviso: string) => {
      saliendo.current = true;
      tramite.olvidarPermiso();
      void navegar(aIdentidad, { state: { aviso } });
    },
    [tramite, navegar, aIdentidad],
  );

  if (permiso === null) {
    if (saliendo.current) {
      return null;
    }
    return <Navigate to={aIdentidad} replace />;
  }

  const conRepresentante = Boolean(permiso.identidad.representante);

  const presentar = async (receta: Receta) => {
    const revision = revisarFormulario(
      receta,
      conRepresentante,
      tramite.borrador,
      tramite.documentos,
    );
    setError(null);
    setErrores(revision);
    if (Object.keys(revision).length > 0) {
      return;
    }
    setEnviando(true);
    const resultado = await presentarSolicitud(
      permiso.token,
      aSolicitud(receta, permiso.identidad, tramite.borrador, tramite.documentos),
      tramite.claveIdempotencia,
    );
    setEnviando(false);
    switch (resultado.tipo) {
      case 'ok':
        void navegar(`/tramite/comprobante/${resultado.expediente.numero}`, {
          state: { expediente: resultado.expediente },
        });
        return;
      case 'invalido':
        setErrores(
          Object.fromEntries(resultado.errores.map((falla) => [falla.campo, falla.mensaje])),
        );
        return;
      case 'no-autenticado':
        volverAIdentidad(AVISO_PERMISO_VENCIDO);
        return;
      case 'permiso-usado':
        volverAIdentidad(AVISO_PERMISO_USADO);
        return;
      case 'identidad-distinta':
        volverAIdentidad(AVISO_IDENTIDAD_DISTINTA);
        return;
      case 'no-disponible':
        setError(MENSAJE_NO_DISPONIBLE);
        return;
    }
  };

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Solicitud de licencia</h1>
        {estado.tipo === 'lista' && (
          <p className="cabecera__descripcion">
            {estado.receta.nombre}. Tasa: {formatearTasaFicha(estado.receta.tasa)}. Plazo:{' '}
            {formatearPlazoConTipo(estado.receta.plazoDias, estado.receta.tipoPlazo) ?? 'no aplica'}
            .
          </p>
        )}
      </header>

      <main className="contenido tramite">
        <TiempoRestante venceEn={permiso.venceEn} />
        {estado.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando la licencia…
          </p>
        )}
        {estado.tipo === 'error' && (
          <div className="aviso aviso--error" role="alert">
            <p>La licencia no se pudo cargar. Vuelve a intentarlo en unos minutos.</p>
            <button type="button" className="boton" onClick={() => void cargar()}>
              Reintentar
            </button>
          </div>
        )}
        {estado.tipo === 'no-disponible' && (
          <p className="aviso">Esta licencia no se puede solicitar en línea.</p>
        )}
        {error && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}
        {estado.tipo === 'lista' && (
          <FormularioSolicitud
            receta={estado.receta}
            conRepresentante={conRepresentante}
            borrador={tramite.borrador}
            documentos={tramite.documentos}
            errores={errores}
            enviando={enviando}
            alCambiarBorrador={tramite.guardarBorrador}
            subirDocumento={(archivo) => subirDocumento(permiso.token, archivo)}
            alGuardarDocumento={tramite.guardarDocumento}
            alPerderPermiso={() => {
              volverAIdentidad(AVISO_PERMISO_VENCIDO);
            }}
            alPresentar={() => void presentar(estado.receta)}
          />
        )}
      </main>
    </>
  );
}
