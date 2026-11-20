import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import type { EmisorTokensIdentidad } from '../dominio/puertos/emisor-tokens';
import { EMISOR_TOKENS } from '../tokens';
import { JwtAuthGuard, type PeticionAutenticada } from './jwt-auth.guard';
import type { IdentidadConfirmada } from './token-identidad.guard';

/** Quién presenta una solicitud o sube un documento (004): sin datos personales. */
export type Solicitante =
  | { readonly canal: 'EN_LINEA'; readonly verificacionId: string }
  | { readonly canal: 'MESA_PARTES'; readonly usuarioId: string };

interface PeticionSolicitante extends PeticionAutenticada {
  identidadConfirmada?: IdentidadConfirmada;
}

const PREFIJO = 'Bearer ';

/**
 * Acepta un `tokenIdentidad` del administrado (canal en línea) o la sesión de un usuario con rol
 * MESA_PARTES (canal presencial). Sin ninguno → 401; sesión con otro rol → 403
 * (contracts/identidad-y-solicitud.md de la 004). Un token del personal nunca vale como identidad.
 */
@Injectable()
export class SolicitanteGuard implements CanActivate {
  constructor(
    @Inject(EMISOR_TOKENS) private readonly emisor: EmisorTokensIdentidad,
    private readonly jwt: JwtAuthGuard,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionSolicitante>();
    const cabecera = peticion.headers.authorization;
    const token =
      typeof cabecera === 'string' && cabecera.startsWith(PREFIJO)
        ? cabecera.slice(PREFIJO.length)
        : null;
    const verificacionId = token === null ? null : await this.emisor.verificarIdentidad(token);
    if (verificacionId !== null) {
      peticion.identidadConfirmada = { verificacionId };
      return true;
    }
    // No es un token de identidad: debe ser una sesión vigente del personal (401 si no).
    await this.jwt.canActivate(contexto);
    if (peticion.sesionAutenticada?.roles.includes('MESA_PARTES') !== true) {
      throw ErrorProblema.sinPermiso();
    }
    return true;
  }
}

/** Entrega el `Solicitante` que dejó `SolicitanteGuard`. */
export const SolicitanteActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): Solicitante => {
    const peticion = contexto.switchToHttp().getRequest<PeticionSolicitante>();
    if (peticion.identidadConfirmada !== undefined) {
      return { canal: 'EN_LINEA', verificacionId: peticion.identidadConfirmada.verificacionId };
    }
    if (peticion.sesionAutenticada !== undefined) {
      return { canal: 'MESA_PARTES', usuarioId: peticion.sesionAutenticada.usuarioId };
    }
    throw ErrorProblema.noAutenticado();
  },
);
