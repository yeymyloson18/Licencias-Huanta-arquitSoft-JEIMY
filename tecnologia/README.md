# Tecnología – Ejemplo de Clean Architecture

Esta carpeta guarda los recursos tecnológicos del proyecto, separados de la documentación (`docs/`).
Aquí se muestra **cómo se vería en código** el enfoque Clean Architecture para el flujo de
**pago en caja con esquela** (ADR-003 y ADR-004).

> No es una funcionalidad terminada: es un ejemplo para comprobar que el diseño es implementable.

## Stack propuesto

| Parte | Tecnología propuesta |
|---|---|
| Portal Web (computadora y celular) | React + TypeScript |
| Backend API | Node.js + NestJS (TypeScript) |
| Base de datos | PostgreSQL |
| Caché | Redis |
| Cola de tareas | Cola de mensajes + workers en Node.js |
| Contenedores y despliegue | Docker en la nube o en el centro de datos municipal |
| Control de versiones | Git y GitHub |

## Estructura del ejemplo

```
src/pagos/
├── dominio/           Esquela.ts, RepositorioEsquelas.ts
├── aplicacion/        GenerarEsquela.ts, RegistrarPagoEnCaja.ts
├── infraestructura/   RepositorioEsquelasEnMemoria.ts
└── composicion.ts     conecta contratos con adaptadores
```

## 1. Dominio (no importa nada externo)

```typescript
// dominio/Esquela.ts
export class Esquela {
  private numeroRecibo: string | null = null;

  constructor(
    readonly codigo: string,              // código único impreso en la esquela
    readonly numeroExpediente: string,
    readonly monto: number,
  ) {
    if (monto < 0) throw new Error('El monto no puede ser negativo');
  }

  registrarPago(numeroRecibo: string): void {
    if (this.numeroRecibo) throw new Error('Esta esquela ya fue pagada');   // regla: se paga una sola vez
    this.numeroRecibo = numeroRecibo;
  }

  estaPagada(): boolean { return this.numeroRecibo !== null; }
}

// dominio/RepositorioEsquelas.ts  (puerto)
export interface RepositorioEsquelas {
  buscarPorCodigo(codigo: string): Promise<Esquela | null>;
  guardar(esquela: Esquela): Promise<void>;
}
```

## 2. Aplicación (casos de uso)

```typescript
// aplicacion/GenerarEsquela.ts
import { Esquela } from '../dominio/Esquela';
import { RepositorioEsquelas } from '../dominio/RepositorioEsquelas';

export class GenerarEsquela {
  constructor(private readonly esquelas: RepositorioEsquelas) {}   // DIP: depende del contrato

  async ejecutar(numeroExpediente: string, tasa: number): Promise<Esquela> {
    const codigo = `ESQ-${numeroExpediente}`;
    const esquela = new Esquela(codigo, numeroExpediente, tasa);
    await this.esquelas.guardar(esquela);
    return esquela;   // luego un worker genera el PDF
  }
}

// aplicacion/RegistrarPagoEnCaja.ts
import { RepositorioEsquelas } from '../dominio/RepositorioEsquelas';

export class RegistrarPagoEnCaja {
  constructor(private readonly esquelas: RepositorioEsquelas) {}

  async ejecutar(codigo: string, numeroRecibo: string): Promise<void> {
    const esquela = await this.esquelas.buscarPorCodigo(codigo);
    if (!esquela) throw new Error('Esquela no encontrada');
    esquela.registrarPago(numeroRecibo);
    await this.esquelas.guardar(esquela);
    // aquí se publica el evento PagoRegistrado → Trámites avanza el expediente
  }
}
```

## 3. Infraestructura (adaptador intercambiable)

```typescript
// infraestructura/RepositorioEsquelasEnMemoria.ts – en producción sería PostgreSQL
import { Esquela } from '../dominio/Esquela';
import { RepositorioEsquelas } from '../dominio/RepositorioEsquelas';

export class RepositorioEsquelasEnMemoria implements RepositorioEsquelas {
  private datos = new Map<string, Esquela>();
  async buscarPorCodigo(codigo: string) { return this.datos.get(codigo) ?? null; }
  async guardar(e: Esquela) { this.datos.set(e.codigo, e); }
}
```

## 4. Composición (único lugar que elige los adaptadores)

```typescript
// composicion.ts
import { GenerarEsquela } from './aplicacion/GenerarEsquela';
import { RegistrarPagoEnCaja } from './aplicacion/RegistrarPagoEnCaja';
import { RepositorioEsquelasEnMemoria } from './infraestructura/RepositorioEsquelasEnMemoria';

const repo = new RepositorioEsquelasEnMemoria();       // en producción: RepositorioEsquelasPostgres
const generar = new GenerarEsquela(repo);
const registrar = new RegistrarPagoEnCaja(repo);

const esquela = await generar.ejecutar('EXP-2026-0001', 159.50);   // licencia de riesgo bajo
await registrar.ejecutar(esquela.codigo, 'REC-000123');            // caja registra el pago
console.log(esquela.estaPagada());                                 // true

await registrar.ejecutar(esquela.codigo, 'REC-000124');            // Error: Esta esquela ya fue pagada
```

## Qué demuestra este ejemplo

| Idea | Dónde se ve |
|---|---|
| El dominio no depende de la tecnología | `Esquela` y el contrato no importan nada externo. |
| Inversión de dependencias (DIP) | Los casos de uso reciben `RepositorioEsquelas` por el constructor. |
| Adaptadores intercambiables (LSP) | El repositorio en memoria se reemplaza por PostgreSQL sin cambiar los casos de uso. |
| Regla de negocio en el dominio | Una esquela solo puede pagarse una vez. |
| Se prueba sin base de datos | Todo el ejemplo funciona en memoria. |