import type { Reloj } from '../dominio/puertos/reloj';

export class RelojSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}
