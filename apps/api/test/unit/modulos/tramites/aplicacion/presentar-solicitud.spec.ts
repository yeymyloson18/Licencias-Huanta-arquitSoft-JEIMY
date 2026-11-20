import {
  ErrorIdentidadNoConfirmada,
  ErrorIdentificacionNoDisponible,
  ErrorPermisoUsado,
} from '../../../../../src/modulos/tramites/aplicacion/errores';
import {
  PresentarSolicitud,
  type SolicitudEntrante,
} from '../../../../../src/modulos/tramites/aplicacion/presentar-solicitud';
import { ErrorValidacionSolicitud } from '../../../../../src/modulos/tramites/dominio/errores';
import {
  CatalogoFalso,
  DocumentosTemporalesEnMemoria,
  HuellaFalsa,
  RelojFalso,
  T0,
  UnidadDeTrabajoFalsa,
  VerificadorFalso,
} from '../apoyo/dobles';

const VERIFICACION = 'verificacion-1';

// Datos FICTICIOS (quickstart.md de la 004).
const solicitud = (cambios: Partial<SolicitudEntrante> = {}): SolicitudEntrante => ({
  codigoReceta: 'LIC-02',
  expedienteOrigen: null,
  identidad: {
    tipoDocumento: 'DNI',
    numeroDocumento: '40000001',
    fechaEmision: '2020-01-15',
    ruc: '10400000011',
    celular: '987000001',
  },
  nombreTitular: 'Titular de Prueba',
  razonSocial: null,
  correo: null,
  nombreComercial: null,
  giro: 'Bodega',
  direccion: 'Jr. Ficticio 123',
  zona: 'Centro',
  areaM2: 40,
  documentos: [
    { requisitoId: 11, documentoId: 'doc-1' },
    { requisitoId: 13, documentoId: 'doc-3' },
  ],
  ...cambios,
});

const preparar = () => {
  const unidad = new UnidadDeTrabajoFalsa();
  const catalogo = new CatalogoFalso();
  const verificador = new VerificadorFalso();
  const documentos = new DocumentosTemporalesEnMemoria();
  const reloj = new RelojFalso();
  for (const id of ['doc-1', 'doc-2', 'doc-3', 'doc-4']) {
    documentos.documentos.set(id, {
      id,
      claveAlmacen: `clave-${id}`,
      nombreOriginal: `${id}.pdf`,
      tipoMime: 'application/pdf',
      tamanoBytes: 100,
      sha256: 'a'.repeat(64),
      verificacionId: VERIFICACION,
      usuarioId: null,
      subidoEn: T0,
    });
  }
  const casoDeUso = new PresentarSolicitud({
    unidad,
    catalogo,
    verificador,
    documentos,
    huella: new HuellaFalsa(),
    reloj,
  });
  return { casoDeUso, unidad, catalogo, verificador, documentos, reloj };
};

const presentar = (
  casoDeUso: PresentarSolicitud,
  datos: SolicitudEntrante = solicitud(),
  clave = 'clave-1',
  verificacionId = VERIFICACION,
) =>
  casoDeUso.ejecutar({
    solicitud: datos,
    claveIdempotencia: clave,
    canal: { tipo: 'EN_LINEA', verificacionId },
  });

const camposDe = async (promesa: Promise<unknown>): Promise<string[]> => {
  try {
    await promesa;
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorValidacionSolicitud);
    return (error as ErrorValidacionSolicitud).errores.map((falla) => falla.campo);
  }
  throw new Error('Se esperaba ErrorValidacionSolicitud');
};

describe('PresentarSolicitud en línea (CU04, FR-008 a FR-022 de la 004)', () => {
  it('crea el expediente REGISTRADO con la ruta de la receta y sin datos personales en la respuesta', async () => {
    const { casoDeUso, unidad } = preparar();

    const resultado = await presentar(casoDeUso);

    expect(resultado).toEqual({
      tipo: 'CREADO',
      expediente: {
        numero: 'EXP-2026-000001',
        estado: 'REGISTRADO',
        ruta: 'A',
        codigoReceta: 'LIC-02',
        nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
        canal: 'EN_LINEA',
        presentadoEn: T0,
        siguientePaso: 'La municipalidad revisará tus documentos y confirmará el nivel de riesgo',
        vencePlazoEn: null,
      },
    });
    const [expediente] = unidad.expedientes;
    expect(expediente?.verificacionId).toBe(VERIFICACION);
    expect(expediente?.documentos).toEqual([
      { documentoId: 'doc-1', requisitoId: 11, requisitoOrden: 1 },
      { documentoId: 'doc-3', requisitoId: 13, requisitoOrden: 3 },
    ]);
    expect(expediente?.historial[0]?.comentario).toBe('Presentada en línea');
  });

  it('la misma clave y el mismo cuerpo devuelven el mismo expediente (FR-020)', async () => {
    const { casoDeUso, unidad } = preparar();
    await presentar(casoDeUso);

    const otra = await presentar(casoDeUso);

    expect(otra).toMatchObject({ tipo: 'EXISTENTE', expediente: { numero: 'EXP-2026-000001' } });
    expect(unidad.expedientes).toHaveLength(1);
  });

  it('el mismo cuerpo con las claves en otro orden da la misma huella', async () => {
    const { casoDeUso } = preparar();
    await presentar(casoDeUso);
    const reordenada = Object.fromEntries(
      Object.entries(solicitud()).reverse(),
    ) as SolicitudEntrante;

    await expect(presentar(casoDeUso, reordenada)).resolves.toMatchObject({ tipo: 'EXISTENTE' });
  });

  it('la misma clave con otro cuerpo se rechaza en Idempotency-Key', async () => {
    const { casoDeUso } = preparar();
    await presentar(casoDeUso);

    expect(await camposDe(presentar(casoDeUso, solicitud({ giro: 'Otro' })))).toEqual([
      'Idempotency-Key',
    ]);
  });

  it('el mismo permiso con otra clave es un conflicto (aclaración 2)', async () => {
    const { casoDeUso } = preparar();
    await presentar(casoDeUso);

    await expect(presentar(casoDeUso, solicitud(), 'clave-2')).rejects.toBeInstanceOf(
      ErrorPermisoUsado,
    );
  });

  it('si otro envío con la misma clave ganó la carrera, devuelve ese expediente', async () => {
    const { casoDeUso, unidad } = preparar();
    await presentar(casoDeUso);
    unidad.forzar = { tipo: 'CLAVE_EXISTENTE' };
    const claves = new Map(unidad.claves);
    unidad.claves.clear();
    const buscar = unidad.buscarPorClave.bind(unidad);
    let llamadas = 0;
    unidad.buscarPorClave = (clave: string) => {
      llamadas += 1;
      return llamadas === 1 ? Promise.resolve(null) : Promise.resolve(claves.get(clave) ?? null);
    };

    await expect(presentar(casoDeUso)).resolves.toMatchObject({ tipo: 'EXISTENTE' });
    unidad.buscarPorClave = buscar;
  });

  it('una identidad distinta de la confirmada se rechaza', async () => {
    const { casoDeUso, verificador } = preparar();
    verificador.resultado = { tipo: 'NO_CONFIRMADA' };

    await expect(presentar(casoDeUso)).rejects.toBeInstanceOf(ErrorIdentidadNoConfirmada);
  });

  it('una identidad con formato inválido se informa por campo', async () => {
    const { casoDeUso, verificador } = preparar();
    verificador.resultado = { tipo: 'DATOS_INVALIDOS', campos: ['ruc'] };

    expect(await camposDe(presentar(casoDeUso))).toEqual(['identidad.ruc']);
  });

  it('una licencia desactivada o inexistente se rechaza en codigoReceta', async () => {
    const { casoDeUso } = preparar();

    expect(await camposDe(presentar(casoDeUso, solicitud({ codigoReceta: 'LIC-06' })))).toEqual([
      'codigoReceta',
    ]);
  });

  it('un trámite conectado (expedienteOrigen) se rechaza', async () => {
    const { casoDeUso } = preparar();

    expect(
      await camposDe(presentar(casoDeUso, solicitud({ expedienteOrigen: 'EXP-2026-000009' }))),
    ).toEqual(['expedienteOrigen']);
  });

  it('cada requisito obligatorio sin documento es un error', async () => {
    const { casoDeUso, unidad } = preparar();

    expect(await camposDe(presentar(casoDeUso, solicitud({ documentos: [] })))).toEqual([
      'documentos.requisito.11',
      'documentos.requisito.13',
    ]);
    expect(unidad.expedientes).toEqual([]);
  });

  it('con representante, la carta poder es obligatoria', async () => {
    const { casoDeUso } = preparar();
    const conRepresentante = solicitud({
      identidad: {
        ...solicitud().identidad,
        representante: {
          tipoDocumento: 'DNI',
          numeroDocumento: '40000002',
          fechaEmision: '2019-05-10',
        },
      },
    });

    expect(await camposDe(presentar(casoDeUso, conRepresentante))).toEqual([
      'documentos.requisito.12',
    ]);
  });

  it('un documento de otro solicitante se responde como no disponible', async () => {
    const { casoDeUso, documentos } = preparar();
    const ajeno = documentos.documentos.get('doc-3');
    if (ajeno) documentos.documentos.set('doc-3', { ...ajeno, verificacionId: 'otra' });

    expect(await camposDe(presentar(casoDeUso))).toEqual(['documentos.requisito.13']);
  });

  it('un documento de más de 24 horas se rechaza', async () => {
    const { casoDeUso, reloj } = preparar();
    reloj.avanzar(24 * 60 * 60 + 1);

    expect(await camposDe(presentar(casoDeUso))).toEqual([
      'documentos.requisito.11',
      'documentos.requisito.13',
    ]);
  });

  it('un documento inexistente se rechaza', async () => {
    const { casoDeUso } = preparar();

    expect(
      await camposDe(
        presentar(
          casoDeUso,
          solicitud({
            documentos: [
              { requisitoId: 11, documentoId: 'doc-1' },
              { requisitoId: 13, documentoId: 'no-existe' },
            ],
          }),
        ),
      ),
    ).toEqual(['documentos.requisito.13']);
  });

  it('si un documento desaparece entre la revisión y el registro, pide volver a subirlo', async () => {
    const { casoDeUso, unidad } = preparar();
    unidad.forzar = { tipo: 'DOCUMENTOS_NO_DISPONIBLES' };

    expect(await camposDe(presentar(casoDeUso))).toEqual(['documentos']);
  });

  it('los datos del establecimiento se validan con el dominio (bodega > 50 m²)', async () => {
    const { casoDeUso, catalogo } = preparar();
    catalogo.recetas.set('LIC-09', { ...solicitudReceta('C'), codigo: 'LIC-09' });

    expect(
      await camposDe(
        presentar(casoDeUso, solicitud({ codigoReceta: 'LIC-09', areaM2: 60, documentos: [] })),
      ),
    ).toEqual(['areaM2']);
  });
});

const solicitudReceta = (ruta: 'A' | 'B' | 'C') => ({
  nombre: 'Licencia provisional para bodegas',
  ruta,
  tasa: '0.00',
  plazoDias: 5,
  tipoPlazo: 'HABILES',
  calificacion: 'APROBACION_AUTOMATICA',
  ordenItse: 'DENTRO_6_MESES',
  plazoItseDias: null,
  vigenciaMeses: 12,
  requisitos: [],
});

describe('PresentarSolicitud en mesa de partes (historia 3 de la 004)', () => {
  const USUARIO = 'usuario-mesa-1';

  /** Documentos subidos por el usuario de mesa de partes. */
  const prepararPresencial = () => {
    const preparado = preparar();
    for (const [id, documento] of preparado.documentos.documentos) {
      preparado.documentos.documentos.set(id, {
        ...documento,
        verificacionId: null,
        usuarioId: USUARIO,
      });
    }
    return preparado;
  };

  const registrar = (casoDeUso: PresentarSolicitud, datos: SolicitudEntrante = solicitud()) =>
    casoDeUso.ejecutar({
      solicitud: datos,
      claveIdempotencia: 'clave-presencial',
      canal: { tipo: 'MESA_PARTES', usuarioId: USUARIO },
    });

  it('registra con canal MESA_PARTES, quién lo registró y el historial con el usuario', async () => {
    const { casoDeUso, unidad } = prepararPresencial();

    const resultado = await registrar(casoDeUso);

    expect(resultado.tipo).toBe('CREADO');
    expect(resultado.expediente.canal).toBe('MESA_PARTES');
    const [expediente] = unidad.expedientes;
    expect(expediente?.canal).toBe('MESA_PARTES');
    expect(expediente?.registradoPor).toBe(USUARIO);
    expect(expediente?.verificacionId).toBeNull();
    expect(expediente?.historial).toEqual([
      expect.objectContaining({
        estadoNuevo: 'REGISTRADO',
        usuarioId: USUARIO,
        comentario: 'Registrada en mesa de partes',
      }),
    ]);
  });

  it('comprueba la identidad con la fachada presencial, no con el permiso en línea', async () => {
    const { casoDeUso, verificador } = prepararPresencial();
    const enLinea = jest.spyOn(verificador, 'confirmarEnLinea');
    const presencial = jest.spyOn(verificador, 'verificarPresencial');

    await registrar(casoDeUso);

    expect(presencial).toHaveBeenCalledTimes(1);
    expect(enLinea).not.toHaveBeenCalled();
  });

  it('una identidad que no coincide se rechaza sin nombrar el dato', async () => {
    const { casoDeUso, verificador, unidad } = prepararPresencial();
    verificador.presencial = { tipo: 'NO_COINCIDE' };

    expect(await camposDe(registrar(casoDeUso))).toEqual(['identidad']);
    expect(unidad.expedientes).toHaveLength(0);
  });

  it('una identidad con formato inválido se informa por campo', async () => {
    const { casoDeUso, verificador } = prepararPresencial();
    verificador.presencial = { tipo: 'DATOS_INVALIDOS', campos: ['ruc'] };

    expect(await camposDe(registrar(casoDeUso))).toEqual(['identidad.ruc']);
  });

  it('si el servicio de identificación no responde, no registra nada', async () => {
    const { casoDeUso, verificador, unidad } = prepararPresencial();
    verificador.presencial = { tipo: 'NO_DISPONIBLE' };

    await expect(registrar(casoDeUso)).rejects.toBeInstanceOf(ErrorIdentificacionNoDisponible);
    expect(unidad.expedientes).toHaveLength(0);
  });

  it('los documentos subidos por otro usuario o por un administrado no sirven', async () => {
    const { casoDeUso, documentos } = prepararPresencial();
    const otroUsuario = documentos.documentos.get('doc-1');
    if (otroUsuario) documentos.documentos.set('doc-1', { ...otroUsuario, usuarioId: 'otro' });
    const enLinea = documentos.documentos.get('doc-3');
    if (enLinea) {
      documentos.documentos.set('doc-3', {
        ...enLinea,
        usuarioId: null,
        verificacionId: VERIFICACION,
      });
    }

    expect(await camposDe(registrar(casoDeUso))).toEqual([
      'documentos.requisito.11',
      'documentos.requisito.13',
    ]);
  });

  it('falta un documento obligatorio → el mismo error que en línea', async () => {
    const { casoDeUso } = prepararPresencial();

    expect(
      await camposDe(
        registrar(
          casoDeUso,
          solicitud({ documentos: [{ requisitoId: 13, documentoId: 'doc-3' }] }),
        ),
      ),
    ).toEqual(['documentos.requisito.11']);
  });

  it('varios registros presenciales no chocan por el permiso de un solo uso', async () => {
    const { casoDeUso, unidad } = prepararPresencial();
    await registrar(casoDeUso);

    const segundo = await casoDeUso.ejecutar({
      solicitud: solicitud({
        documentos: [
          { requisitoId: 11, documentoId: 'doc-2' },
          { requisitoId: 13, documentoId: 'doc-4' },
        ],
      }),
      claveIdempotencia: 'otra-clave',
      canal: { tipo: 'MESA_PARTES', usuarioId: USUARIO },
    });

    expect(segundo.tipo).toBe('CREADO');
    expect(unidad.expedientes).toHaveLength(2);
  });
});
