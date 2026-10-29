# Principios de diseño

## Principios SOLID aplicados al sistema de licencias

### S – Responsabilidad única (SRP)

> Una clase debe tener una sola razón para cambiar.

| ❌ Sin el principio | ✅ Con el principio |
|---|---|
| Una clase `TramiteService` valida documentos, calcula la tasa, genera la esquela, emite la licencia y envía correos. | Cada responsabilidad en su lugar: `RegistrarSolicitud` (Trámites), `GenerarEsquela` y `RegistrarPagoEnCaja` (Pagos en caja), `EmitirLicencia` (Licencias), `NotificarCambioEstado` (Notificaciones). |

### O – Abierto/Cerrado (OCP)

> Abierto para extender, cerrado para modificar.

- **Cambio de tasa o requisito:** se actualiza la receta en el catálogo, sin programar (ADR-002).
- **Nueva ruta de trámite:** se agrega una clase que implementa `RutaTramite` (patrón Strategy), sin tocar el motor.
- **Nuevo canal de notificación:** se agrega un adaptador que implementa `Notificador`.

### L – Sustitución de Liskov (LSP)

> Si dos clases prometen el mismo contrato, deben poder reemplazarse sin romper el sistema.

`AdaptadorValidacionDniRuc` (servicio real) y `ValidadorIdentidadSimulado` (pruebas) implementan el mismo
contrato `ValidadorIdentidad`. Por eso `RegistrarSolicitud` funciona igual con cualquiera de los dos.

### I – Segregación de interfaces (ISP)

> No obligar a una clase a depender de métodos que no usa.

| ❌ Interfaz demasiado grande | ✅ Interfaces pequeñas |
|---|---|
| `ServicioExpediente` con `registrar()`, `generarEsquela()`, `inspeccionar()`, `emitir()`, `notificar()` y `generarReporte()`. | `RepositorioExpedientes` (escritura) y `ConsultaExpedientes` (solo lectura, para Reportes y Reloj de plazos); `Notificador` separado de `GeneradorDocumentos`. |

### D – Inversión de dependencias (DIP)

> Depender de contratos, no de implementaciones concretas.

```typescript
// ❌ Acoplado a una base de datos concreta
class RegistrarPagoEnCaja {
  ejecutar() { const db = new ClientePostgres(); /* ... */ }
}

// ✅ Depende de un contrato; la implementación se inyecta desde afuera
class RegistrarPagoEnCaja {
  constructor(private readonly esquelas: RepositorioEsquelas) {}
}
```

La raíz de composición (`app.module`) decide qué adaptador se usa. Es el principio que hace posible
Clean Architecture (ADR-003).

## Otros principios aplicados

| Principio | Aplicación en el sistema |
|---|---|
| **DRY** (no te repitas) | Las reglas del TUPA viven solo en el catálogo; ningún módulo las copia. |
| **KISS** (mantenlo simple) | Monolito modular; pago en caja con esquela en lugar de pagos digitales; asistente de ruta con tres preguntas. |
| **YAGNI** (no lo construyas si no lo necesitas) | El chatbot se deja para la Fase 2; no se aplican Saga, CQRS ni Circuit Breaker. |
| **Mínimo privilegio** | Cada rol accede solo a lo que necesita; solo caja registra pagos; la página pública del QR muestra datos mínimos. |
| **Decisión humana** | El sistema propone el tipo de licencia y el nivel de riesgo; el evaluador decide. |