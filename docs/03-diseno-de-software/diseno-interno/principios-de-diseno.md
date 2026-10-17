# Principios de diseño

## Principios SOLID aplicados al sistema de licencias

Los principios SOLID son cinco reglas para que el código sea fácil de mantener, extender y probar.
En este sistema se aplican sobre todo a los **pagos**, las **rutas del trámite** y las **integraciones externas**.

### S – Responsabilidad única (SRP)

> Una clase debe tener una sola razón para cambiar.

| ❌ Sin el principio | ✅ Con el principio |
|---|---|
| Una clase `TramiteService` valida documentos, calcula la tasa, cobra, emite la licencia y envía correos. Cualquier cambio del TUPA, de la pasarela o del formato del correo la afecta. | Cada responsabilidad en su lugar: `RegistrarSolicitud` (Trámites), `CalcularTasa` y `PagarTasa` (Pagos), `EmitirLicencia` (Licencias), `NotificarCambioEstado` (Notificaciones). |

### O – Abierto/Cerrado (OCP)

> Abierto para extender, cerrado para modificar.

- **Nuevo tipo de licencia:** se agrega una **receta** en el catálogo, sin programar (ADR-002).
- **Nueva ruta de trámite:** se agrega una clase que implementa `RutaTramite` (patrón Strategy), sin tocar el motor.
- **Nuevo medio de pago o nueva pasarela:** se agrega un adaptador que implementa `PasarelaPago`, sin tocar `PagarTasa`.

### L – Sustitución de Liskov (LSP)

> Si dos clases prometen el mismo contrato, deben poder reemplazarse sin romper el sistema.

`AdaptadorPasarelaPago` (real) y `PasarelaPagoSimulada` (pruebas) implementan el mismo contrato
`PasarelaPago` con el mismo comportamiento esperado: devolver *aprobado*, *rechazado* o *pendiente* y
respetar el identificador de pago. Por eso `PagarTasa` funciona igual con cualquiera de las dos.

### I – Segregación de interfaces (ISP)

> No obligar a una clase a depender de métodos que no usa.

| ❌ Interfaz demasiado grande | ✅ Interfaces pequeñas |
|---|---|
| `ServicioExpediente` con `registrar()`, `pagar()`, `inspeccionar()`, `emitir()`, `notificar()` y `generarReporte()`. | `RepositorioExpedientes` (escritura) y `ConsultaExpedientes` (solo lectura, para Reportes y Reloj de plazos); `Notificador` separado de `GeneradorDocumentos`. |

Así, **Reportes** solo depende de la interfaz de lectura y puede leer desde la réplica.

### D – Inversión de dependencias (DIP)

> Depender de contratos, no de implementaciones concretas.

```typescript
// ❌ Acoplado a un proveedor concreto
class PagarTasa {
  ejecutar() { const pasarela = new ProveedorXSDK(); /* ... */ }
}

// ✅ Depende de un contrato; la implementación se inyecta desde afuera
class PagarTasa {
  constructor(private readonly pasarela: PasarelaPago,
              private readonly pagos: RepositorioPagos) {}
}
```

La raíz de composición (`app.module`) decide qué adaptador se usa. Es el principio que hace posible
Clean Architecture (ADR-003).

## Otros principios aplicados

| Principio | Aplicación en el sistema |
|---|---|
| **DRY** (no te repitas) | Las reglas del TUPA viven solo en el catálogo; ningún módulo las copia. |
| **KISS** (mantenlo simple) | Monolito modular en lugar de microservicios; asistente de ruta con 3 reglas en lugar de inteligencia artificial. |
| **YAGNI** (no lo construyas si no lo necesitas) | El chatbot se deja para la Fase 2; no se aplican Saga ni CQRS completo. |
| **Mínimo privilegio** | Cada rol accede solo a lo que necesita; la página pública del QR muestra datos mínimos. |
| **Decisión humana** | El sistema propone el tipo de licencia y el nivel de riesgo; el evaluador decide. |

## SOLID en una sola idea

> No se trata de usar una pasarela u otra, sino de diseñar el sistema para que **cambiar el TUPA, la
> pasarela o un canal de atención sea sencillo y seguro**, sin tocar las reglas del trámite.