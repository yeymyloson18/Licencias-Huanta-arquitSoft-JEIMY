import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { IDENTIDAD_VACIA, type IdentidadEscrita } from '../componentes/CamposIdentidad';
import { BORRADOR_VACIO, type BorradorSolicitud, type DocumentoSubido } from './ContextoTramite';

// Lo que escribe el personal de mesa de partes (historia 3 de la 004). Vive SOLO en memoria, por
// encima de las rutas: si la sesión vence y hay que volver a ingresar, lo escrito se conserva; al
// recargar la página se pierde. Tiene datos personales: nunca va al almacenamiento del navegador.

interface ValorMesaPartes {
  readonly licencia: string;
  readonly identidad: IdentidadEscrita;
  readonly borrador: BorradorSolicitud;
  readonly documentos: Readonly<Record<number, DocumentoSubido>>;
  readonly claveIdempotencia: string;
  readonly elegirLicencia: (codigo: string) => void;
  readonly guardarIdentidad: (identidad: IdentidadEscrita) => void;
  readonly guardarBorrador: (borrador: BorradorSolicitud) => void;
  readonly guardarDocumento: (requisitoId: number, documento: DocumentoSubido) => void;
  /** Termina el registro (después del comprobante): borra todo y prepara una clave nueva. */
  readonly terminar: () => void;
}

const Contexto = createContext<ValorMesaPartes | null>(null);

const nuevaClave = () => crypto.randomUUID();

export function ProveedorMesaPartes({ children }: { readonly children: ReactNode }) {
  const [licencia, setLicencia] = useState('');
  const [identidad, setIdentidad] = useState<IdentidadEscrita>(IDENTIDAD_VACIA);
  const [borrador, setBorrador] = useState<BorradorSolicitud>(BORRADOR_VACIO);
  const [documentos, setDocumentos] = useState<Record<number, DocumentoSubido>>({});
  const [claveIdempotencia, setClaveIdempotencia] = useState(nuevaClave);

  const elegirLicencia = useCallback((codigo: string) => {
    setLicencia(codigo);
    // Otra licencia pide otros requisitos.
    setDocumentos({});
  }, []);

  const guardarDocumento = useCallback((requisitoId: number, documento: DocumentoSubido) => {
    setDocumentos((actuales) => ({ ...actuales, [requisitoId]: documento }));
  }, []);

  const terminar = useCallback(() => {
    setLicencia('');
    setIdentidad(IDENTIDAD_VACIA);
    setBorrador(BORRADOR_VACIO);
    setDocumentos({});
    setClaveIdempotencia(nuevaClave());
  }, []);

  const valor = useMemo<ValorMesaPartes>(
    () => ({
      licencia,
      identidad,
      borrador,
      documentos,
      claveIdempotencia,
      elegirLicencia,
      guardarIdentidad: setIdentidad,
      guardarBorrador: setBorrador,
      guardarDocumento,
      terminar,
    }),
    [
      licencia,
      identidad,
      borrador,
      documentos,
      claveIdempotencia,
      elegirLicencia,
      guardarDocumento,
      terminar,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useMesaPartes = (): ValorMesaPartes => {
  const valor = useContext(Contexto);
  if (valor === null) {
    throw new Error('useMesaPartes debe usarse dentro de ProveedorMesaPartes');
  }
  return valor;
};
