import { useState } from 'react';
import { descargarPdfLicencia, guardarArchivo } from '../servicios/clienteApi';

interface Propiedades {
  readonly numero: string;
  /** El administrado lo recibe en la consulta pública; el personal usa su sesión. */
  readonly tokenConsulta?: string;
}

/** Botón "Descargar licencia" (historia 1 de la 006). */
export function DescargarLicencia({ numero, tokenConsulta }: Propiedades) {
  const [descargando, setDescargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const descargar = async () => {
    setAviso(null);
    setDescargando(true);
    const resultado = await descargarPdfLicencia(numero, tokenConsulta);
    setDescargando(false);
    if (resultado.tipo === 'ok') {
      guardarArchivo(resultado.pdf, resultado.nombre);
      return;
    }
    setAviso(
      resultado.tipo === 'sin-permiso'
        ? tokenConsulta === undefined
          ? 'Tu usuario no tiene permiso para descargar esta licencia.'
          : 'El permiso para descargar venció. Vuelve a consultar tu expediente.'
        : 'No se pudo descargar la licencia. Vuelve a intentarlo.',
    );
  };

  return (
    <div className="descargar-esquela">
      <button
        type="button"
        className="boton"
        disabled={descargando}
        onClick={() => void descargar()}
      >
        {descargando ? 'Descargando…' : 'Descargar licencia'}
      </button>
      {aviso && (
        <p className="aviso aviso--info" role="status">
          {aviso}
        </p>
      )}
    </div>
  );
}
