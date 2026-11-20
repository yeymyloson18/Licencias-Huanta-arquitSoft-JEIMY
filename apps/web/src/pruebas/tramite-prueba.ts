import type { Receta, RecetaResumen } from '../servicios/clienteApi';
import { json, problema, type Manejador } from './api-simulada';

// Datos FICTICIOS para las pruebas del trámite en línea (004). La forma sigue el contrato.

export const IDENTIDAD_PRUEBA = {
  tipoDocumento: 'DNI',
  numeroDocumento: '40000001',
  fechaEmision: '2020-01-15',
  ruc: '10400000011',
  celular: '987000001',
} as const;

export const DESAFIO_PRUEBA = {
  desafioId: '00000000-0000-4000-8000-0000000000d1',
  venceEn: '2026-11-19T10:05:00.000Z',
  celularEnmascarado: '9*****001',
};

export const RECETA_LIC02: Receta = {
  codigo: 'LIC-02',
  nombre: 'Licencia de funcionamiento – riesgo medio',
  tipo: 'LICENCIA',
  ruta: 'A',
  tasa: '177.10',
  plazoDias: 4,
  codigoTupa: 'PE102735B76',
  paginaTupa: 370,
  nivelRiesgo: 'MEDIO',
  tipoPlazo: 'HABILES',
  calificacion: 'APROBACION_AUTOMATICA',
  ordenItse: 'POSTERIOR',
  plazoItseDias: 7,
  vigenciaMeses: null,
  requisitos: [
    {
      id: 11,
      orden: 1,
      descripcion: 'Solicitud con declaración jurada',
      obligatorio: true,
      condicion: 'SIEMPRE',
    },
    {
      id: 12,
      orden: 2,
      descripcion: 'Carta poder',
      obligatorio: true,
      condicion: 'CON_REPRESENTANTE',
    },
    {
      id: 13,
      orden: 3,
      descripcion: 'Planos de ubicación',
      obligatorio: true,
      condicion: 'SIN_PLANOS_VIGENTES',
    },
    {
      id: 14,
      orden: 4,
      descripcion: 'Requisitos del giro',
      obligatorio: true,
      condicion: 'GIRO_ESPECIAL',
    },
  ],
};

export const RECETA_LIC09: Receta = {
  ...RECETA_LIC02,
  codigo: 'LIC-09',
  nombre: 'Licencia provisional para bodegas',
  ruta: 'C',
  tasa: '0.00',
  requisitos: [RECETA_LIC02.requisitos[0] as Receta['requisitos'][number]],
};

const resumen = (receta: Receta): RecetaResumen => ({
  codigo: receta.codigo,
  nombre: receta.nombre,
  tipo: receta.tipo,
  ruta: receta.ruta ?? null,
  tasa: receta.tasa,
  plazoDias: receta.plazoDias ?? null,
});

export const LICENCIAS_PRUEBA: RecetaResumen[] = [resumen(RECETA_LIC02), resumen(RECETA_LIC09)];

/** Manejadores comunes: sin sesión del personal, catálogo y fichas. */
export const baseTramite: Record<string, Manejador> = {
  'POST /auth/renovar': () => problema(401, 'no-autenticado'),
  'GET /catalogo/recetas': () => json(LICENCIAS_PRUEBA),
  'GET /catalogo/recetas/LIC-02': () => json(RECETA_LIC02),
  'GET /catalogo/recetas/LIC-09': () => json(RECETA_LIC09),
};
