import { ConsultarAuditoria } from '../../../../../src/modulos/seguridad/aplicacion/consultar-auditoria';
import {
  eventoGestion,
  eventoIngreso,
} from '../../../../../src/modulos/seguridad/dominio/evento-auditoria';
import { ErrorFiltroAuditoria } from '../../../../../src/modulos/seguridad/dominio/filtro-auditoria';
import { AuditoriaEnMemoria, RelojFalso } from './dobles';

// RelojFalso marca 2026-11-17T10:00Z: en Lima es el 17 de noviembre.
const en = (iso: string) => new Date(iso);

const preparar = async () => {
  const auditoria = new AuditoriaEnMemoria();
  auditoria.nombres.set('admin-1', 'Ana Admin');
  auditoria.nombres.set('u-1', 'Beto Caja');
  await auditoria.registrar(
    eventoGestion({
      accion: 'ROL_ASIGNADO',
      administradorId: 'admin-1',
      usuarioId: 'u-1',
      en: en('2026-11-17T08:00:00Z'),
      detalle: { rol: 'CAJA' },
    }),
  );
  await auditoria.registrar(
    eventoIngreso({
      accion: 'CLAVE_INCORRECTA',
      afectadoUsuarioId: 'u-1',
      origenHmac: null,
      en: en('2026-11-17T09:00:00Z'),
    }),
  );
  await auditoria.registrar(
    eventoGestion({
      accion: 'USUARIO_CREADO',
      administradorId: 'admin-1',
      usuarioId: 'u-1',
      en: en('2026-10-01T15:00:00Z'),
      detalle: { roles: ['CAJA'] },
    }),
  );
  const consulta = new ConsultarAuditoria({ auditoria, reloj: new RelojFalso() });
  return { auditoria, consulta };
};

describe('ConsultarAuditoria (HU2 de la 009)', () => {
  it('pagina de la más reciente a la más antigua, con el texto de la acción y los nombres', async () => {
    const { consulta } = await preparar();

    const pagina = await consulta.pagina({}, 1, 20);

    expect(pagina).toMatchObject({ pagina: 1, porPagina: 20, total: 2 });
    expect(
      pagina.datos.map((d) => [
        d.accion,
        d.textoAccion,
        d.actor?.nombre ?? null,
        d.afectado?.nombre,
      ]),
    ).toEqual([
      ['CLAVE_INCORRECTA', 'Clave incorrecta', null, 'Beto Caja'],
      ['ROL_ASIGNADO', 'Rol asignado', 'Ana Admin', 'Beto Caja'],
    ]);
  });

  it('aplica los filtros y el desplazamiento de la página', async () => {
    const { consulta } = await preparar();

    const filtrada = await consulta.pagina(
      { desde: '2026-10-01', accion: 'USUARIO_CREADO' },
      1,
      20,
    );
    const segunda = await consulta.pagina({ desde: '2026-10-01' }, 2, 2);

    expect(filtrada.datos.map((d) => d.accion)).toEqual(['USUARIO_CREADO']);
    expect(segunda).toMatchObject({ pagina: 2, porPagina: 2, total: 3 });
    expect(segunda.datos.map((d) => d.accion)).toEqual(['USUARIO_CREADO']);
  });

  it('descarga el CSV con los mismos filtros y el nombre con la fecha de Lima', async () => {
    const { consulta } = await preparar();

    const descarga = await consulta.csv({ actorId: 'admin-1' });

    expect(descarga.truncado).toBe(false);
    expect(descarga.nombreArchivo).toBe('auditoria-seguridad-2026-11-17.csv');
    const lineas = descarga.contenido.trim().split('\r\n');
    expect(lineas).toHaveLength(2);
    expect(lineas[1]).toContain('Rol asignado;Ana Admin;Beto Caja');
  });

  it('marca truncado cuando hay más de 10,000 filas', async () => {
    const auditoria = new AuditoriaEnMemoria();
    jest.spyOn(auditoria, 'buscar').mockResolvedValue({ filas: [], total: 10_001 });
    const consulta = new ConsultarAuditoria({ auditoria, reloj: new RelojFalso() });

    await expect(consulta.csv({})).resolves.toMatchObject({ truncado: true });
    expect(auditoria.buscar).toHaveBeenCalledWith(expect.anything(), 0, 10_000);
  });

  it('rechaza un rango inválido sin consultar', async () => {
    const { auditoria, consulta } = await preparar();
    const buscar = jest.spyOn(auditoria, 'buscar');

    await expect(
      consulta.pagina({ desde: '2026-11-20', hasta: '2026-11-01' }, 1, 20),
    ).rejects.toBeInstanceOf(ErrorFiltroAuditoria);
    expect(buscar).not.toHaveBeenCalled();
  });
});
