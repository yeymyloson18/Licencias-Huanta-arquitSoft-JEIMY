import { JwtService } from '@nestjs/jwt';
import type {
  EmisorTokens,
  EmisorTokensIdentidad,
  ReclamosAcceso,
} from '../dominio/puertos/emisor-tokens';
import { esRol } from '../dominio/rol';

const QUINCE_MINUTOS = 900;
/** Audiencia del token de identidad del administrado (research §R-03 de la 004). */
const AUDIENCIA_IDENTIDAD = 'identidad-administrado';

const sonReclamosValidos = (carga: unknown): carga is ReclamosAcceso => {
  if (typeof carga !== 'object' || carga === null) {
    return false;
  }
  const { sub, sid, roles, vs, dcc } = carga as Record<string, unknown>;
  return (
    typeof sub === 'string' &&
    typeof sid === 'string' &&
    Array.isArray(roles) &&
    roles.every(esRol) &&
    typeof vs === 'number' &&
    Number.isInteger(vs) &&
    vs > 0 &&
    typeof dcc === 'boolean'
  );
};

/** Token de acceso del personal: JWT HS256 de 15 minutos (research.md §R-05). */
export class EmisorTokensJwt implements EmisorTokens, EmisorTokensIdentidad {
  readonly segundosDeVidaIdentidad = QUINCE_MINUTOS;
  private readonly jwt: JwtService;

  constructor(
    secreto: string,
    readonly segundosDeVida: number = QUINCE_MINUTOS,
  ) {
    this.jwt = new JwtService({ secret: secreto });
  }

  firmarAcceso(reclamos: ReclamosAcceso): Promise<string> {
    const { sub, sid, roles, vs, dcc } = reclamos;
    return this.jwt.signAsync(
      { sub, sid, roles: [...roles], vs, dcc },
      { algorithm: 'HS256', expiresIn: this.segundosDeVida },
    );
  }

  async verificarAcceso(token: string): Promise<ReclamosAcceso | null> {
    try {
      const carga: unknown = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
      // Un token con audiencia (el de identidad del administrado) nunca vale como token del personal.
      if (!sonReclamosValidos(carga) || 'aud' in carga) {
        return null;
      }
      const { sub, sid, roles, vs, dcc } = carga;
      return { sub, sid, roles, vs, dcc };
    } catch {
      return null;
    }
  }

  firmarIdentidad(verificacionId: string): Promise<string> {
    return this.jwt.signAsync(
      {},
      {
        algorithm: 'HS256',
        audience: AUDIENCIA_IDENTIDAD,
        jwtid: verificacionId,
        expiresIn: this.segundosDeVidaIdentidad,
      },
    );
  }

  async verificarIdentidad(token: string): Promise<string | null> {
    try {
      const carga: unknown = await this.jwt.verifyAsync(token, {
        algorithms: ['HS256'],
        audience: AUDIENCIA_IDENTIDAD,
      });
      const jti = (carga as { jti?: unknown } | null)?.jti;
      return typeof jti === 'string' && jti.length > 0 ? jti : null;
    } catch {
      return null;
    }
  }
}
