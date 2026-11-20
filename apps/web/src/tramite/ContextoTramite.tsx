import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import type { IdentidadSolicitud } from '../servicios/clienteApi';

// Estado del trámite en línea (contracts/portal-tramite.md de la 004). Vive SOLO en memoria: nada
// va a localStorage ni a sessionStorage. Está montado por encima de las rutas, así lo escrito
// sobrevive a la navegación interna (por ejemplo, la vuelta a la identidad tras un 401 o un 409),
// y se pierde al recargar la página.

/** Permiso de identidad confirmado (token de un solo uso, 30 minutos). */
export interface PermisoIdentidad {
  readonly token: string;
  readonly identidad: IdentidadSolicitud;
  readonly venceEn: Date;
}

/** Documento ya subido para un requisito. */
export interface DocumentoSubido {
  readonly documentoId: string;
  readonly nombre: string;
}

/** Lo escrito en el formulario de la solicitud. */
export interface BorradorSolicitud {
  readonly nombreTitular: string;
  readonly razonSocial: string;
  readonly correo: string;
  readonly nombreComercial: string;
  readonly giro: string;
  readonly direccion: string;
  readonly zona: string;
  readonly areaM2: string;
}

export const BORRADOR_VACIO: BorradorSolicitud = {
  nombreTitular: '',
  razonSocial: '',
  correo: '',
  nombreComercial: '',
  giro: '',
  direccion: '',
  zona: '',
  areaM2: '',
};

interface ValorTramite {
  readonly permiso: PermisoIdentidad | null;
  /** Identidad escrita en el paso 1; se conserva aunque el permiso venza (para no pedirla de nuevo). */
  readonly identidad: IdentidadSolicitud | null;
  readonly borrador: BorradorSolicitud;
  /** Documentos subidos con el permiso actual, por requisito. */
  readonly documentos: Readonly<Record<number, DocumentoSubido>>;
  /** Clave de idempotencia del intento de presentación en curso. */
  readonly claveIdempotencia: string;
  readonly recordarIdentidad: (identidad: IdentidadSolicitud) => void;
  readonly confirmar: (token: string, expiraEnSegundos: number) => void;
  /** El permiso venció o ya se usó: se descarta con sus documentos, se conserva lo escrito. */
  readonly olvidarPermiso: () => void;
  readonly guardarBorrador: (borrador: BorradorSolicitud) => void;
  readonly guardarDocumento: (requisitoId: number, documento: DocumentoSubido | null) => void;
  /** Termina el trámite (después del comprobante): borra todo. */
  readonly terminar: () => void;
}

const Contexto = createContext<ValorTramite | null>(null);

const nuevaClave = () => crypto.randomUUID();

export function ProveedorTramite({ children }: { readonly children: ReactNode }) {
  const [identidad, setIdentidad] = useState<IdentidadSolicitud | null>(null);
  const [permiso, setPermiso] = useState<PermisoIdentidad | null>(null);
  const [borrador, setBorrador] = useState<BorradorSolicitud>(BORRADOR_VACIO);
  const [documentos, setDocumentos] = useState<Record<number, DocumentoSubido>>({});
  const [claveIdempotencia, setClaveIdempotencia] = useState(nuevaClave);

  const recordarIdentidad = useCallback((datos: IdentidadSolicitud) => {
    setIdentidad(datos);
  }, []);

  const confirmar = useCallback(
    (token: string, expiraEnSegundos: number) => {
      if (identidad === null) {
        return;
      }
      setPermiso({
        token,
        identidad,
        venceEn: new Date(Date.now() + expiraEnSegundos * 1000),
      });
      // Los documentos y la clave pertenecen al permiso: con uno nuevo se empieza de cero.
      setDocumentos({});
      setClaveIdempotencia(nuevaClave());
    },
    [identidad],
  );

  const olvidarPermiso = useCallback(() => {
    setPermiso(null);
    setDocumentos({});
  }, []);

  const guardarDocumento = useCallback((requisitoId: number, documento: DocumentoSubido | null) => {
    setDocumentos((actuales) =>
      documento === null
        ? Object.fromEntries(Object.entries(actuales).filter(([id]) => Number(id) !== requisitoId))
        : { ...actuales, [requisitoId]: documento },
    );
  }, []);

  const terminar = useCallback(() => {
    setIdentidad(null);
    setPermiso(null);
    setBorrador(BORRADOR_VACIO);
    setDocumentos({});
    setClaveIdempotencia(nuevaClave());
  }, []);

  const valor = useMemo<ValorTramite>(
    () => ({
      permiso,
      identidad,
      borrador,
      documentos,
      claveIdempotencia,
      recordarIdentidad,
      confirmar,
      olvidarPermiso,
      guardarBorrador: setBorrador,
      guardarDocumento,
      terminar,
    }),
    [
      permiso,
      identidad,
      borrador,
      documentos,
      claveIdempotencia,
      recordarIdentidad,
      confirmar,
      olvidarPermiso,
      guardarDocumento,
      terminar,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useTramite = (): ValorTramite => {
  const valor = useContext(Contexto);
  if (valor === null) {
    throw new Error('useTramite debe usarse dentro de ProveedorTramite');
  }
  return valor;
};
