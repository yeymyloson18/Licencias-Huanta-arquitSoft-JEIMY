import { CBadge } from '@coreui/react';
import { ESTADOS } from './estados';

type Grupo = 'info' | 'warning' | 'success' | 'danger';

/** Grupo de color de cada estado (013, US4; data-model.md). */
const GRUPO: Readonly<Record<string, Grupo>> = {
  REGISTRADO: 'info',
  EN_EVALUACION: 'info',
  EN_INSPECCION: 'info',
  ITSE_POSTERIOR_PENDIENTE: 'info',
  OBSERVADO: 'warning',
  PENDIENTE_PAGO: 'warning',
  PAGADO: 'success',
  APROBADO: 'success',
  LICENCIA_PROVISIONAL: 'success',
  LICENCIA_EMITIDA: 'success',
  FINALIZADO: 'success',
  DENEGADO: 'danger',
  DERIVADO_A_FISCALIZACION: 'danger',
};

/**
 * Estado de un expediente como insignia de color (013, US4). El texto es el mismo de `ESTADOS`, así
 * el color nunca es la única señal.
 */
export function InsigniaEstado({ estado }: { readonly estado: string }) {
  const texto = (ESTADOS as Readonly<Record<string, string | undefined>>)[estado] ?? estado;
  return (
    <CBadge textBgColor={GRUPO[estado] ?? 'secondary'} className="insignia-estado">
      {texto}
    </CBadge>
  );
}
