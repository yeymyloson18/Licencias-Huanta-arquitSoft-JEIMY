import type { Reloj } from '../dominio/reloj';

export class RelojSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}
