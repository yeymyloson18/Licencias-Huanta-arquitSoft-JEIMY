import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { ActualizarUsuario } from '../aplicacion/actualizar-usuario';
import { AsignarClaveTemporal } from '../aplicacion/asignar-clave-temporal';
import { BuscarUsuarios } from '../aplicacion/buscar-usuarios';
import { CrearUsuario } from '../aplicacion/crear-usuario';
import {
  ErrorClaveInvalida,
  ErrorCorreoEnUso,
  ErrorDatosInvalidos,
  ErrorUsuarioNoEncontrado,
} from '../aplicacion/errores';
import { ListarUsuarios, type PaginaDeUsuarios } from '../aplicacion/listar-usuarios';
import { ReemplazarRoles } from '../aplicacion/reemplazar-roles';
import { ErrorDominio } from '../dominio/error-dominio';
import { PoliticaClave } from '../dominio/politica-clave';
import { ErrorUltimoAdministrador } from '../dominio/regla-ultimo-administrador';
import { ROLES } from '../dominio/rol';
import { RequiereRoles, UsuarioActual, type UsuarioAutenticado } from './control-permisos';
import { aUsuarioRespuesta, type UsuarioRespuesta } from './respuestas';
import { validarCuerpo } from './validacion';

const rol = z.enum(ROLES);
const listaRoles = z
  .array(rol)
  .min(1)
  .refine((roles) => new Set(roles).size === roles.length);

const paginacion = {
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
};

const esquemaListado = z.object({
  ...paginacion,
  activo: z.enum(['true', 'false']).optional(),
});
const esquemaBusqueda = z
  .object({
    texto: z.string().min(2).max(150).optional(),
    activo: z.boolean().optional(),
    pagina: z.number().int().min(1).default(1),
    porPagina: z.number().int().min(1).max(100).default(20),
  })
  .strict();
const esquemaNuevoUsuario = z
  .object({
    correo: z.email().max(120),
    nombreCompleto: z.string().min(3).max(150),
    celular: z.string().regex(/^9[0-9]{8}$/),
    claveTemporal: z.string().max(128),
    roles: listaRoles,
  })
  .strict();
const esquemaActualizacion = z
  .object({
    nombreCompleto: z.string().min(3).max(150).optional(),
    celular: z
      .string()
      .regex(/^9[0-9]{8}$/)
      .optional(),
    activo: z.boolean().optional(),
  })
  .strict()
  .refine((cuerpo) => Object.keys(cuerpo).length > 0, { path: ['cuerpo'] });
const esquemaRoles = z.object({ roles: listaRoles }).strict();
const esquemaClaveTemporal = z.object({ claveTemporal: z.string().max(128) }).strict();

const MENSAJES: Readonly<Record<string, string>> = {
  correo: 'Debe ser un correo válido',
  nombreCompleto: 'Debe tener entre 3 y 150 caracteres',
  nombre: 'Debe tener entre 3 y 150 caracteres',
  celular: 'Debe tener 9 dígitos y empezar con 9',
  roles: 'Elija al menos un rol, sin repetir',
  claveTemporal: 'La clave temporal es obligatoria',
  activo: 'Debe ser verdadero o falso',
  texto: 'Escriba entre 2 y 150 caracteres',
  pagina: 'Debe ser un número mayor que 0',
  porPagina: 'Debe ser un número entre 1 y 100',
  cuerpo: 'Indique al menos un dato para cambiar',
};

interface PaginaRespuesta {
  readonly pagina: number;
  readonly porPagina: number;
  readonly total: number;
  readonly datos: UsuarioRespuesta[];
}

const aPagina = (pagina: PaginaDeUsuarios): PaginaRespuesta => ({
  pagina: pagina.pagina,
  porPagina: pagina.porPagina,
  total: pagina.total,
  datos: pagina.usuarios.map(aUsuarioRespuesta),
});

/**
 * Gestión de usuarios del personal (historia 5, RF22). Todas las operaciones son solo para el rol
 * ADMINISTRADOR (FR-021). Las búsquedas por nombre o correo usan POST para que esos datos no queden
 * en la URL (principio VII). El celular nunca se devuelve completo (FR-028).
 */
@Controller('usuarios')
@RequiereRoles('ADMINISTRADOR')
export class UsuariosController {
  constructor(
    private readonly listarUsuarios: ListarUsuarios,
    private readonly buscarUsuarios: BuscarUsuarios,
    private readonly crearUsuario: CrearUsuario,
    private readonly actualizarUsuario: ActualizarUsuario,
    private readonly reemplazarRoles: ReemplazarRoles,
    private readonly asignarClaveTemporal: AsignarClaveTemporal,
  ) {}

  @Get()
  async listar(@Query() consulta: unknown): Promise<PaginaRespuesta> {
    const filtro = validarCuerpo(esquemaListado, consulta, MENSAJES);
    return aPagina(
      await this.listarUsuarios.ejecutar({
        pagina: filtro.pagina,
        porPagina: filtro.porPagina,
        ...(filtro.activo === undefined ? {} : { activo: filtro.activo === 'true' }),
      }),
    );
  }

  @Post('busqueda')
  @HttpCode(200)
  async buscar(@Body() cuerpo: unknown): Promise<PaginaRespuesta> {
    const filtro = validarCuerpo(esquemaBusqueda, cuerpo, MENSAJES);
    return aPagina(await this.buscarUsuarios.ejecutar(filtro));
  }

  @Post()
  async crear(
    @Body() cuerpo: unknown,
    @UsuarioActual() administrador: UsuarioAutenticado,
  ): Promise<UsuarioRespuesta> {
    const datos = validarCuerpo(esquemaNuevoUsuario, cuerpo, MENSAJES);
    try {
      return aUsuarioRespuesta(await this.crearUsuario.ejecutar(datos, administrador.usuarioId));
    } catch (error) {
      throw traducirError(error);
    }
  }

  @Patch(':usuarioId')
  async actualizar(
    @Param('usuarioId') usuarioId: string,
    @Body() cuerpo: unknown,
  ): Promise<UsuarioRespuesta> {
    const cambios = validarCuerpo(esquemaActualizacion, cuerpo, MENSAJES);
    try {
      return aUsuarioRespuesta(await this.actualizarUsuario.ejecutar(usuarioId, cambios));
    } catch (error) {
      throw traducirError(error);
    }
  }

  @Put(':usuarioId/roles')
  async asignarRoles(
    @Param('usuarioId') usuarioId: string,
    @Body() cuerpo: unknown,
    @UsuarioActual() administrador: UsuarioAutenticado,
  ): Promise<UsuarioRespuesta> {
    const { roles } = validarCuerpo(esquemaRoles, cuerpo, MENSAJES);
    try {
      return aUsuarioRespuesta(
        await this.reemplazarRoles.ejecutar(usuarioId, roles, administrador.usuarioId),
      );
    } catch (error) {
      throw traducirError(error);
    }
  }

  @Post(':usuarioId/clave-temporal')
  @HttpCode(204)
  async claveTemporal(
    @Param('usuarioId') usuarioId: string,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    const { claveTemporal } = validarCuerpo(esquemaClaveTemporal, cuerpo, MENSAJES);
    try {
      await this.asignarClaveTemporal.ejecutar(usuarioId, claveTemporal);
    } catch (error) {
      throw traducirError(error, 'claveTemporal');
    }
  }
}

/** Convierte los errores de aplicación y dominio en problemas HTTP del contrato. */
const traducirError = (error: unknown, campoClave = 'claveTemporal'): unknown => {
  if (error instanceof ErrorCorreoEnUso) {
    return ErrorProblema.correoEnUso();
  }
  if (error instanceof ErrorUltimoAdministrador) {
    return ErrorProblema.ultimoAdministrador();
  }
  if (error instanceof ErrorUsuarioNoEncontrado) {
    return ErrorProblema.noEncontrado();
  }
  if (error instanceof ErrorDatosInvalidos) {
    return new ErrorValidacion(
      error.campos.map((campo) => ({ campo, mensaje: MENSAJES[campo] ?? 'Valor no válido' })),
    );
  }
  if (error instanceof ErrorClaveInvalida) {
    return new ErrorValidacion(
      error.reglas.map((regla) => ({ campo: campoClave, mensaje: PoliticaClave.describir(regla) })),
    );
  }
  if (error instanceof ErrorDominio) {
    return new ErrorValidacion([{ campo: 'cuerpo', mensaje: 'Los datos no son válidos' }]);
  }
  return error;
};
