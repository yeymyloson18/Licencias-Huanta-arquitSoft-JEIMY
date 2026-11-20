import { useState } from 'react';
import { descargarPdfEsquela, guardarArchivo } from '../servicios/clienteApi';

interface Propiedades {
  readonly codigo: string;
  /** El administrado lo recibe en la consulta pública; el personal usa su sesión. */
  readonly tokenConsulta?: string;
}

/** Botón "Descargar esquela" (historia 3 de la 005). Un 202 avisa que vuelva a intentar. */
export function DescargarEsquela({ codigo, tokenConsulta }: Propiedades) {
  const [descargando, setDescargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const descargar = async () => {
    setAviso(null);
    setDescargando(true);
    const resultado = await descargarPdfEsquela(codigo, tokenConsulta);
    setDescargando(false);
    switch (resultado.tipo) {
      case 'ok':
        guardarArchivo(resultado.pdf, resultado.nombre);
        return;
      case 'en-generacion':
        setAviso('La esquela se está generando. Vuelve a intentarlo en unos segundos.');
        return;
      case 'sin-permiso':
        setAviso(
          tokenConsulta === undefined
            ? 'Tu usuario no tiene permiso para descargar esta esquela.'
            : 'El permiso para descargar venció. Vuelve a consultar tu expediente.',
        );
        return;
      case 'no-disponible':
        setAviso('No se pudo descargar la esquela. Vuelve a intentarlo.');
        return;
    }
  };

  return (
    <div className="descargar-esquela">
      <button
        type="button"
        className="boton"
        disabled={descargando}
        onClick={() => void descargar()}
      >
        {descargando ? 'Descargando…' : 'Descargar esquela'}
      </button>
      {aviso && (
        <p className="aviso aviso--info" role="status">
          {aviso}
        </p>
      )}
    </div>
  );
}
