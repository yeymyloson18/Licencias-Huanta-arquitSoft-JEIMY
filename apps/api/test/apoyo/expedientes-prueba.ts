import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';

// Apoyo de las pruebas de la funcionalidad 004: siembra expedientes válidos directamente en la base,
// para que las historias de consulta (US2) y bandeja (US4) se prueben sin depender del flujo de
// presentación (US1). Todos los datos personales son FICTICIOS (ver quickstart.md) y se cifran con el
// mismo protector que usa la aplicación.

export const TITULAR_DE_PRUEBA = {
  tipoDocumento: 'DNI',
  documento: '40000001',
  ruc: '10400000011',
  celular: '987000001',
  correo: 'titular.prueba@ejemplo.pe',
  nombre: 'Titular de Prueba Uno',
  direccion: 'Jr. Ficticio 123, Huanta',
} as const;

export interface OpcionesExpedienteDePrueba {
  readonly codigoReceta?: string;
  readonly canal?: 'EN_LINEA' | 'MESA_PARTES';
  readonly estado?: string;
  readonly documento?: string;
  readonly ruc?: string;
  readonly nombreTitular?: string;
  readonly presentadoEn?: Date;
  readonly conRepresentante?: boolean;
}

export interface ExpedienteSembrado {
  readonly id: string;
  readonly numero: string;
  readonly codigoReceta: string;
  readonly ruta: string;
  readonly documento: string;
  readonly ruc: string;
}

/** Copia de la receta vigente, con la forma de `receta_al_presentar` (data-model.md §1). */
const leerRecetaAlPresentar = async (prisma: PrismaClient, codigo: string) => {
  const receta = await prisma.receta.findUniqueOrThrow({
    where: { codigo },
    include: { requisito: { orderBy: { orden: 'asc' } } },
  });
  return {
    receta,
    copia: {
      codigo: receta.codigo,
      nombre: receta.nombre,
      ruta: receta.ruta,
      tasa: receta.tasa.toFixed(2),
      plazoDias: receta.plazo_dias,
      tipoPlazo: receta.tipo_plazo,
      calificacion: receta.calificacion,
      ordenItse: receta.orden_itse,
      plazoItseDias: receta.plazo_itse_dias,
      vigenciaMeses: receta.vigencia_meses,
      requisitos: receta.requisito.map((requisito) => ({
        id: Number(requisito.id),
        orden: requisito.orden,
        descripcion: requisito.descripcion,
        obligatorio: requisito.obligatorio,
        condicion: requisito.condicion,
      })),
    },
  };
};

/** Inserta un expediente REGISTRADO válido con su primer registro del historial. */
export const sembrarExpediente = async (
  prisma: PrismaClient,
  protector: ProtectorDatos,
  opciones: OpcionesExpedienteDePrueba = {},
): Promise<ExpedienteSembrado> => {
  const codigoReceta = opciones.codigoReceta ?? 'LIC-02';
  const canal = opciones.canal ?? 'EN_LINEA';
  const documento = opciones.documento ?? TITULAR_DE_PRUEBA.documento;
  const ruc = opciones.ruc ?? TITULAR_DE_PRUEBA.ruc;
  const presentadoEn = opciones.presentadoEn ?? new Date();
  const conRepresentante = opciones.conRepresentante ?? false;
  const { receta, copia } = await leerRecetaAlPresentar(prisma, codigoReceta);
  const ruta = (receta.ruta ?? 'A').trim();

  const [{ correlativo }] = await prisma.$queryRaw<[{ correlativo: bigint }]>`
    SELECT nextval('tramites.numero_expediente_seq') AS correlativo`;
  const numero = `EXP-${String(presentadoEn.getFullYear())}-${String(correlativo).padStart(6, '0')}`;
  const bytes = (texto: string) => Buffer.from(protector.cifrar(texto));
  const huella = (texto: string) => Buffer.from(protector.hmac(texto));

  const expediente = await prisma.expediente.create({
    data: {
      numero,
      codigo_receta: codigoReceta,
      ruta,
      estado: opciones.estado ?? 'REGISTRADO',
      canal,
      tipo_documento: TITULAR_DE_PRUEBA.tipoDocumento,
      documento_cifrado: bytes(documento),
      documento_hmac: huella(documento),
      ruc_cifrado: bytes(ruc),
      ruc_hmac: huella(ruc),
      nombre_titular: opciones.nombreTitular ?? TITULAR_DE_PRUEBA.nombre,
      celular_cifrado: bytes(TITULAR_DE_PRUEBA.celular),
      correo_cifrado: bytes(TITULAR_DE_PRUEBA.correo),
      representante_cifrado: conRepresentante
        ? bytes(JSON.stringify({ tipoDocumento: 'DNI', numeroDocumento: '40000002' }))
        : null,
      giro: 'Bodega y abarrotes',
      direccion_cifrada: bytes(TITULAR_DE_PRUEBA.direccion),
      zona: 'Centro',
      area_m2: new Prisma.Decimal('40.00'),
      presentado_en: presentadoEn,
      registrado_por: canal === 'MESA_PARTES' ? randomUUID() : null,
      verificacion_id: canal === 'EN_LINEA' ? randomUUID() : null,
      receta_al_presentar: copia,
      con_representante: conRepresentante,
      historial_estado: {
        create: {
          estado_anterior: null,
          estado_nuevo: 'REGISTRADO',
          comentario: canal === 'EN_LINEA' ? 'Presentada en línea' : 'Registrada en mesa de partes',
          ocurrido_en: presentadoEn,
        },
      },
    },
  });

  return { id: expediente.id, numero, codigoReceta, ruta, documento, ruc };
};

/** Borra todo lo que crean las pruebas de trámites (expedientes, documentos, idempotencia, eventos). */
export const limpiarTramites = async (prisma: PrismaClient): Promise<void> => {
  await prisma.$transaction([
    prisma.clave_idempotencia.deleteMany(),
    prisma.documento.deleteMany(),
    prisma.documento_temporal.deleteMany(),
    prisma.historial_estado.deleteMany(),
    prisma.observacion.deleteMany(),
    prisma.auditoriaTramites.deleteMany(),
    prisma.expediente.deleteMany(),
    prisma.evento_pendiente.deleteMany({ where: { tipo: 'SolicitudPresentada' } }),
  ]);
};
