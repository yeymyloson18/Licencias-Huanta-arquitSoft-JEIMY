import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorAutenticacion } from '../aplicacion/errores';
import { ObtenerMiPerfil } from '../aplicacion/obtener-mi-perfil';
import { JwtAuthGuard, type PeticionAutenticada } from './jwt-auth.guard';
import { aPerfilRespuesta, type PerfilPropioRespuesta } from './respuestas';

/**
 * Mi perfil (011). Cualquier usuario del personal con sesión, también sin roles; con clave temporal
 * el guard responde 403 `debe-cambiar-clave` (no lleva `@PermitirConClaveTemporal`).
 *
 * No declara `@Param`, `@Query` ni `@Body`: el usuario sale SOLO de la sesión validada, así nadie
 * puede pedir el perfil de otra persona (FR-004). Nada de datos personales en la URL ni en registros.
 */
@Controller('perfil')
@UseGuards(JwtAuthGuard)
export class PerfilController {
  constructor(private readonly obtenerMiPerfil: ObtenerMiPerfil) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async perfil(@Req() peticion: PeticionAutenticada): Promise<PerfilPropioRespuesta> {
    const sesion = peticion.sesionAutenticada;
    if (sesion === undefined) {
      throw ErrorProblema.noAutenticado();
    }
    try {
      return aPerfilRespuesta(await this.obtenerMiPerfil.ejecutar(sesion.usuarioId));
    } catch (error) {
      if (error instanceof ErrorAutenticacion) {
        throw ErrorProblema.noAutenticado();
      }
      throw error;
    }
  }
}
