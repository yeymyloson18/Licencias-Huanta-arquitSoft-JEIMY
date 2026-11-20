import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import type { EmisorTokensConsulta } from '../dominio/puertos/emisor-tokens';
import type { Rol } from '../dominio/rol';
import { EMISOR_TOKENS } from '../tokens';
import { METADATO_ROLES } from './decoradores';
import { JwtAuthGuard, type PeticionAutenticada } from './jwt-auth.guard';

/** Quién lee un documento del expediente (005): el administrado con su `tokenConsulta` o el personal. */
export type LectorConsulta =
  | { readonly tipo: 'CONSULTA'; readonly numeroExpediente: string }
  | { readonly tipo: 'PERSONAL'; readonly usuarioId: string };

interface PeticionLector extends PeticionAutenticada {
  numeroExpedienteConsultado?: string;
}

const PREFIJO = 'Bearer ';

/**
 * Acepta un `tokenConsulta` (el administrado, solo para ese expediente) o una sesión del personal con
 * uno de los roles declarados con `@Roles(...)` (research §R-08 de la 005). Sin ninguno → 401; sesión
 * con otro rol → 403. Un token del personal nunca vale como `tokenConsulta`, ni al revés.
 */
@Injectable()
export class ConsultaOPersonalGuard implements CanActivate {
  constructor(
    @Inject(EMISOR_TOKENS) private readonly emisor: EmisorTokensConsulta,
    private readonly jwt: JwtAuthGuard,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionLector>();
    const cabecera = peticion.headers.authorization;
    const token =
      typeof cabecera === 'string' && cabecera.startsWith(PREFIJO)
        ? cabecera.slice(PREFIJO.length)
        : null;
    const numero = token === null ? null : await this.emisor.verificarConsulta(token);
    if (numero !== null) {
      peticion.numeroExpedienteConsultado = numero;
      return true;
    }
    await this.jwt.canActivate(contexto);
    const admitidos =
      this.reflector.getAllAndOverride<readonly Rol[] | undefined>(METADATO_ROLES, [
        contexto.getHandler(),
        contexto.getClass(),
      ]) ?? [];
    const roles = peticion.sesionAutenticada?.roles ?? [];
    if (!roles.some((rol) => admitidos.includes(rol))) {
      throw ErrorProblema.sinPermiso();
    }
    return true;
  }
}

/** Entrega el `LectorConsulta` que dejó `ConsultaOPersonalGuard`. */
export const LectorActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): LectorConsulta => {
    const peticion = contexto.switchToHttp().getRequest<PeticionLector>();
    if (peticion.numeroExpedienteConsultado !== undefined) {
      return { tipo: 'CONSULTA', numeroExpediente: peticion.numeroExpedienteConsultado };
    }
    if (peticion.sesionAutenticada !== undefined) {
      return { tipo: 'PERSONAL', usuarioId: peticion.sesionAutenticada.usuarioId };
    }
    throw ErrorProblema.noAutenticado();
  },
);
