import { BuscarUsuarios } from '../../../../../src/modulos/seguridad/aplicacion/buscar-usuarios';
import { ListarUsuarios } from '../../../../../src/modulos/seguridad/aplicacion/listar-usuarios';
import { NombreCompleto } from '../../../../../src/modulos/seguridad/dominio/nombre-completo';
import { RepositorioUsuariosEnMemoria, usuarioFicticio } from './dobles';

const preparar = async () => {
  const usuarios = new RepositorioUsuariosEnMemoria();
  const nombres = ['Ana Quispe', 'Beto Huamán', 'Carla Rojas', 'Diego Ccorimanya'];
  for (const [i, nombre] of nombres.entries()) {
    const usuario = usuarioFicticio({
      id: `u-${String(i)}`,
      correo: `persona${String(i)}@ejemplo.pe`,
      activo: i !== 3,
    });
    usuario.cambiarNombre(NombreCompleto.crear(nombre));
    await usuarios.crear(usuario);
  }
  return usuarios;
};

describe('ListarUsuarios y BuscarUsuarios (FR-016)', () => {
  it('lista paginado y ordenado por nombre, con el total', async () => {
    const usuarios = await preparar();

    const pagina = await new ListarUsuarios({ usuarios }).ejecutar({ pagina: 1, porPagina: 2 });

    expect(pagina.total).toBe(4);
    expect(pagina.pagina).toBe(1);
    expect(pagina.porPagina).toBe(2);
    expect(pagina.usuarios.map((u) => u.nombreCompleto.valor)).toEqual([
      'Ana Quispe',
      'Beto Huamán',
    ]);
  });

  it('filtra por activo', async () => {
    const usuarios = await preparar();

    const inactivos = await new ListarUsuarios({ usuarios }).ejecutar({
      activo: false,
      pagina: 1,
      porPagina: 20,
    });

    expect(inactivos.usuarios.map((u) => u.id)).toEqual(['u-3']);
  });

  it('busca por fragmento del nombre sin distinguir mayúsculas', async () => {
    const usuarios = await preparar();

    const resultado = await new BuscarUsuarios({ usuarios }).ejecutar({
      texto: 'ROJ',
      pagina: 1,
      porPagina: 20,
    });

    expect(resultado.usuarios.map((u) => u.id)).toEqual(['u-2']);
  });

  it('busca por correo completo (exacto, por HMAC en la base)', async () => {
    const usuarios = await preparar();

    const resultado = await new BuscarUsuarios({ usuarios }).ejecutar({
      texto: 'Persona1@Ejemplo.pe',
      pagina: 1,
      porPagina: 20,
    });

    expect(resultado.usuarios.map((u) => u.id)).toEqual(['u-1']);
  });

  it('un fragmento de correo no encuentra nada (no se busca por partes del correo)', async () => {
    const usuarios = await preparar();

    const resultado = await new BuscarUsuarios({ usuarios }).ejecutar({
      texto: 'persona1@',
      pagina: 1,
      porPagina: 20,
    });

    expect(resultado.total).toBe(0);
  });
});
