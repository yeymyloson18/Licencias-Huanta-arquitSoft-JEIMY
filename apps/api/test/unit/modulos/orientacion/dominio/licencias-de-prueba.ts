import type {
  LicenciaVigente,
  TemaGuia,
} from '../../../../../src/modulos/orientacion/dominio/puertos';

// Datos FICTICIOS de las pruebas de la 012, con la forma del catálogo de demostración (LIC-01 a LIC-09).

const licencia = (
  codigo: string,
  nombre: string,
  datos: Partial<LicenciaVigente> = {},
): LicenciaVigente => ({
  codigo,
  nombre,
  ruta: 'A',
  tasa: '159.50',
  plazoDias: 2,
  tipoPlazo: 'HABILES',
  calificacion: 'APROBACION_AUTOMATICA',
  ordenItse: 'POSTERIOR',
  plazoItseDias: 9,
  vigenciaMeses: null,
  requisitos: ['Solicitud con declaración jurada'],
  ...datos,
});

export const LICENCIAS: readonly LicenciaVigente[] = [
  licencia('LIC-01', 'Licencia de funcionamiento – riesgo bajo'),
  licencia('LIC-02', 'Licencia de funcionamiento – riesgo medio', { tasa: '177.10' }),
  licencia('LIC-03', 'Licencia de funcionamiento – riesgo alto', {
    ruta: 'B',
    tasa: '305.90',
    plazoDias: 8,
    calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO',
    ordenItse: 'PREVIA',
    plazoItseDias: 7,
  }),
  licencia('LIC-04', 'Licencia de funcionamiento – riesgo muy alto', {
    ruta: 'B',
    tasa: '538.90',
    plazoDias: 8,
    calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO',
    ordenItse: 'PREVIA',
    plazoItseDias: 7,
  }),
  licencia('LIC-06', 'Licencia para cesionarios – riesgo medio', { tasa: '180.40' }),
  licencia('LIC-09', 'Licencia provisional para bodegas', {
    ruta: 'C',
    tasa: '0.00',
    plazoDias: 5,
    ordenItse: 'DENTRO_6_MESES',
    plazoItseDias: null,
    vigenciaMeses: 12,
    requisitos: ['Solicitud de licencia provisional', 'Declaración jurada de seguridad'],
  }),
];

const tema = (id: string, palabrasClave: string[], respuesta: string): TemaGuia => ({
  id,
  titulo: id,
  palabrasClave,
  respuesta,
  enlaces: [],
});

export const TEMAS: readonly TemaGuia[] = [
  { ...tema('rutas', ['ruta', 'pasos'], 'Ruta A, B y C.'), enlaces: ['LICENCIAS', 'ASISTENTE'] },
  tema('itse', ['itse', 'inspeccion'], 'El certificado ITSE se renueva cada 2 años.'),
  { ...tema('pago', ['pago', 'pagar', 'caja', 'como pago'], 'En caja.'), enlaces: ['CONSULTA'] },
  tema('presentar', ['presentar', 'solicitud'], 'Presente en línea.'),
  tema('subsanar', ['subsanar', 'observado'], 'Tiene 2 días hábiles para subsanar.'),
  tema('consultar', ['consultar', 'mi expediente'], 'Use Consultar mi trámite.'),
  tema('bodega', ['bodega', 'abarrotes'], 'Hasta 50 m².'),
  {
    ...tema('tramites-no-atendidos', ['transferencia', 'cambio de giro'], 'No se atienden aquí.'),
    enlaces: ['LICENCIAS'],
  },
];
