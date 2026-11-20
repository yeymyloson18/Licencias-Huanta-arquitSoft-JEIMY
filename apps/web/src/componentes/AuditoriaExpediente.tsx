import { useEffect, useState } from 'react';
import { formatearFecha } from '../paginas/personal/Expedientes';
import { auditoriaDelExpediente, type RegistroAuditoria } from '../servicios/clienteApi';

// Sección "Auditoría" del detalle del expediente para la jefatura (historia 6 de la 005).

const ACCIONES: Record<string, string> = {
  PRESENTAR_EN_LINEA: 'Presentado en línea',
  REGISTRAR_PRESENCIAL: 'Registrado en mesa de partes',
  VER_DETALLE: 'Vio el detalle',
  INICIAR_EVALUACION: 'Empezó la revisión',
  CONFIRMAR_RIESGO: 'Confirmó el riesgo',
  CORREGIR_RIESGO: 'Corrigió el riesgo',
  OBSERVAR: 'Observó',
  SUBSANAR: 'Subsanó la observación',
  DENEGAR: 'Denegó',
  APROBAR: 'Aprobó',
};

export function AuditoriaExpediente({ numero }: { readonly numero: string }) {
  const [registros, setRegistros] = useState<readonly RegistroAuditoria[] | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let vigente = true;
    void auditoriaDelExpediente(numero).then((resultado) => {
      if (vigente) {
        setRegistros(resultado);
      }
    });
    return () => {
      vigente = false;
    };
  }, [numero]);

  return (
    <section className="tarjeta" aria-label="Auditoría del expediente">
      <h2 className="ficha__subtitulo">Auditoría</h2>
      {registros === undefined && <p role="status">Cargando…</p>}
      {registros === null && <p className="aviso aviso--error">No se pudo cargar la auditoría.</p>}
      {registros && registros.length === 0 && <p>Sin registros.</p>}
      {registros && registros.length > 0 && (
        <ol className="consulta__historial">
          {registros.map((registro, indice) => (
            <li key={`${registro.ocurridoEn}-${String(indice)}`}>
              {ACCIONES[registro.accion] ?? registro.accion} —{' '}
              {registro.nombreUsuario ?? 'El titular'} ({formatearFecha(registro.ocurridoEn)})
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
