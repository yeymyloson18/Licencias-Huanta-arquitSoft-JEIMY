# Tecnología – Ejemplo de Clean Architecture

Esta carpeta guarda los recursos tecnológicos del proyecto, separados de la documentación (`docs/`).
Aquí se muestra **cómo se vería en código** el enfoque Clean Architecture para un flujo crítico:
**pagar la tasa sin cobro doble** (ADR-003 y ADR-004).

> No es una funcionalidad terminada: es un ejemplo para comprobar que el diseño es implementable.

## Stack propuesto

| Parte | Tecnología propuesta |
|---|---|
| Portal Web y PWA | React + TypeScript |
| Backend API | Node.js + NestJS (TypeScript) |
| Base de datos | PostgreSQL |
| Caché | Redis |
| Cola de tareas | Cola de mensajes + workers en Node.js |
| Contenedores y despliegue | Docker en la nube o en el centro de datos municipal |
| Control de versiones | Git y GitHub |

## Estructura del ejemplo

```
src/pagos/
├── dominio/           Pago.ts, PasarelaPago.ts, RepositorioPagos.ts
├── aplicacion/        PagarTasa.ts
├── infraestructura/   PasarelaPagoSimulada.ts, RepositorioPagosEnMemoria.ts
└── composicion.ts     conecta contratos con adaptadores
```

## 1. Dominio (no importa nada externo)

```typescript
// dominio/Pago.ts
export type EstadoPago = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

export class Pago {
  constructor(
    readonly id: string,              // identificador único: evita cobros dobles
    readonly numeroExpediente: string,
    readonly monto: number,
    public estado: EstadoPago = 'PENDIENTE',
  ) {
    if (monto < 0) throw new Error('El monto no puede ser negativo');
  }
}

// dominio/PasarelaPago.ts  (puerto)
export interface PasarelaPago {
  cobrar(idPago: string, monto: number): Promise<'APROBADO' | 'RECHAZADO' | 'PENDIENTE'>;
}

// dominio/RepositorioPagos.ts  (puerto)
export interface RepositorioPagos {
  buscarPorId(idPago: string): Promise<Pago | null>;
  guardar(pago: Pago): Promise<void>;
}
```

## 2. Aplicación (caso de uso)

```typescript
// aplicacion/PagarTasa.ts
import { Pago, EstadoPago } from '../dominio/Pago';
import { PasarelaPago } from '../dominio/PasarelaPago';
import { RepositorioPagos } from '../dominio/RepositorioPagos';

export class PagarTasa {
  constructor(
    private readonly pasarela: PasarelaPago,     // DIP: depende de contratos
    private readonly pagos: RepositorioPagos,
  ) {}

  async ejecutar(idPago: string, numeroExpediente: string, tasa: number): Promise<EstadoPago> {
    const existente = await this.pagos.buscarPorId(idPago);
    if (existente) return existente.estado;        // idempotencia: no se cobra dos veces

    const pago = new Pago(idPago, numeroExpediente, tasa);
    await this.pagos.guardar(pago);
    pago.estado = await this.pasarela.cobrar(idPago, tasa);
    await this.pagos.guardar(pago);
    return pago.estado;
  }
}
```

## 3. Infraestructura (adaptadores intercambiables)

```typescript
// infraestructura/PasarelaPagoSimulada.ts – para pruebas, sin internet
import { PasarelaPago } from '../dominio/PasarelaPago';

export class PasarelaPagoSimulada implements PasarelaPago {
  cobros = 0;
  async cobrar(): Promise<'APROBADO'> { this.cobros++; return 'APROBADO'; }
}

// infraestructura/RepositorioPagosEnMemoria.ts – en producción sería PostgreSQL
import { Pago } from '../dominio/Pago';
import { RepositorioPagos } from '../dominio/RepositorioPagos';

export class RepositorioPagosEnMemoria implements RepositorioPagos {
  private datos = new Map<string, Pago>();
  async buscarPorId(id: string) { return this.datos.get(id) ?? null; }
  async guardar(p: Pago) { this.datos.set(p.id, p); }
}
```

## 4. Composición (único lugar que elige los adaptadores)

```typescript
// composicion.ts
import { PagarTasa } from './aplicacion/PagarTasa';
import { PasarelaPagoSimulada } from './infraestructura/PasarelaPagoSimulada';
import { RepositorioPagosEnMemoria } from './infraestructura/RepositorioPagosEnMemoria';

const pasarela = new PasarelaPagoSimulada();          // en producción: AdaptadorPasarelaPago
const pagarTasa = new PagarTasa(pasarela, new RepositorioPagosEnMemoria());

// El administrado reintenta el mismo pago tres veces:
await pagarTasa.ejecutar('PAGO-001', 'EXP-2026-0001', 159.50);
await pagarTasa.ejecutar('PAGO-001', 'EXP-2026-0001', 159.50);
await pagarTasa.ejecutar('PAGO-001', 'EXP-2026-0001', 159.50);
console.log(pasarela.cobros);   // 1 → un solo cobro (escenario EQ-05)
```

## Qué demuestra este ejemplo

| Idea | Dónde se ve |
|---|---|
| El dominio no depende de la tecnología | `Pago` y los contratos no importan nada externo. |
| Inversión de dependencias (DIP) | `PagarTasa` recibe `PasarelaPago` y `RepositorioPagos` por el constructor. |
| Adaptadores intercambiables (LSP) | `PasarelaPagoSimulada` se reemplaza por la pasarela real sin cambiar `PagarTasa`. |
| Idempotencia (ADR-004, EQ-05) | El mismo `idPago` nunca genera un segundo cobro. |
| Se prueba sin base de datos ni internet | Todo el ejemplo funciona en memoria. |