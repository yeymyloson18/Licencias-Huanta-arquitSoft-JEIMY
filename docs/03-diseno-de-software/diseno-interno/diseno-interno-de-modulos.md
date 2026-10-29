# Diseño interno de los módulos

La arquitectura define **qué módulos existen y cómo se relacionan**. Este documento define
**cómo está organizado cada módulo por dentro**, respetando Clean Architecture (ADR-003).

## Estructura común de cada módulo

```
src/modulos/<modulo>/
├── dominio/          # entidades, objetos de valor, reglas y contratos (puertos)
├── aplicacion/       # casos de uso
├── infraestructura/  # adaptadores: repositorios PostgreSQL, clientes HTTP, caché
└── presentacion/     # controladores REST y tareas programadas
```

**Regla:** los archivos de `dominio/` no importan nada de NestJS, PostgreSQL, Redis ni librerías HTTP.

## Diseño de cada módulo

| Módulo | Dominio (entidades, objetos de valor, reglas) | Aplicación (casos de uso) | Puertos (contratos) | Adaptadores |
|---|---|---|---|---|
| **Seguridad y Usuarios** | `Usuario`, `Rol`, `CodigoOTP`. | `IniciarSesion`, `VerificarOTP`, `GestionarUsuario`, `AsignarRol` | `RepositorioUsuarios`, `EnviadorOTP` | `RepositorioUsuariosPostgres`, `EnviadorOtpSms` |
| **Catálogo y Asistente de ruta** | `Receta`, `Requisito`, `Ruta` (A, B, C), `Tasa`, `PlazoDiasHabiles`. | `ProponerLicencia`, `ConsultarReceta`, `ActualizarReceta` (administrador) | `RepositorioCatalogo` | `RepositorioCatalogoPostgres` + `RepositorioCatalogoConCache` (Redis) |
| **Trámites** | `Expediente`, `Documento`, `EstadoExpediente`, `NumeroExpediente`, `DniRuc`. Regla: el administrado consulta solo con número de expediente **y** DNI/RUC. | `RegistrarSolicitud`, `ObservarExpediente`, `SubsanarObservacion`, `ConfirmarNivelRiesgo`, `AprobarEvaluacion`, `DenegarExpediente`, `ConsultarEstado` | `RepositorioExpedientes`, `ValidadorIdentidad`, `AlmacenDocumentos` | `RepositorioExpedientesPostgres`, `AdaptadorValidacionDniRuc`, `AlmacenObjetos` |
| **Pagos en caja** | `Esquela`, `CodigoEsquela`, `Monto`, `NumeroRecibo`. Regla: una esquela solo se paga una vez. | `GenerarEsquela`, `RegistrarPagoEnCaja` | `RepositorioEsquelas`, `ConsultaTasa`, `GeneradorDocumentos`, `PublicadorEventos` | `RepositorioEsquelasPostgres`, `ConsultaTasaCatalogo`, `GeneradorPdf` (worker), `PublicadorEventosNest` |
| **Inspecciones** | `Inspeccion`, `ResultadoITSE`, `Foto`. Regla: una inspección tiene un solo inspector. | `AsignarInspeccion`, `RegistrarResultadoITSE` | `RepositorioInspecciones`, `AlmacenDocumentos` | `RepositorioInspeccionesPostgres`, `AlmacenObjetos` |
| **Licencias** | `Licencia`, `CertificadoITSE`, `CodigoQR`, `Vigencia`. Regla: no se emite sin pago registrado, salvo la ruta C. | `EmitirLicencia`, `EmitirLicenciaProvisional`, `VerificarLicenciaPublica`, `AvisarVencimientoITSE` (tarea diaria) | `RepositorioLicencias`, `GeneradorDocumentos` | `RepositorioLicenciasPostgres`, `GeneradorPdfQr` (worker) |
| **Reloj de plazos** | `Plazo`, `Feriado`. Regla: se cuentan solo días hábiles. | `VerificarPlazos` (tarea diaria), `RegistrarFeriado` (administrador) | `CalendarioHabil`, `ConsultaExpedientes` (solo lectura) | `CalendarioFeriadosPostgres`, `ConsultaExpedientesTramites` (usa la fachada de Trámites) |
| **Notificaciones** | `Mensaje`, `Canal`. | `NotificarCambioEstado`, `NotificarVencimiento` | `Notificador` | `NotificadorEnCola` (deja el mensaje en la cola; el worker lo envía con `NotificadorCorreoSMS`) |
| **Reportes** | `Indicador`. | `GenerarTablero`, `GenerarReporte` | `ConsultaExpedientes`, `ConsultaPagos` (solo lectura) | Adaptadores que usan las fachadas de Trámites y Pagos |

## Comunicación entre módulos

1. **Llamada directa:** un módulo usa la **fachada pública** de otro (por ejemplo, Trámites llama a `ModuloPagos.generarEsquela(numeroExpediente, codigoReceta)`). Nunca accede a sus repositorios ni a sus tablas.
2. **Puertos hacia otros módulos:** cuando un caso de uso necesita un dato de otro módulo, lo pide mediante un contrato propio (`ConsultaTasa`, `ConsultaExpedientes`); el adaptador de ese contrato llama a la fachada del otro módulo.
3. **Eventos de dominio:** cuando algo importante ocurre, el módulo publica un evento y otros reaccionan:
   - `PagoRegistrado` → Trámites marca el expediente como pagado y lo avanza.
   - `ResultadoITSERegistrado` → Trámites emite o deniega según la ruta.
   - `EstadoExpedienteCambiado` → Notificaciones encola el aviso al administrado.

## Ciclo de vida del expediente

```mermaid
stateDiagram-v2
    [*] --> Registrado: presentar solicitud
    Registrado --> Observado: faltan requisitos
    Observado --> Registrado: subsanar
    Registrado --> PendientePago: rutas A y B, se genera la esquela
    Registrado --> LicenciaProvisional: ruta C, bodega gratuita, sin esquela
    PendientePago --> Pagado: caja registra el pago
    Pagado --> LicenciaEmitida: ruta A, aprobación automática en 2 días
    Pagado --> EnEvaluacion: ruta B, evaluación previa
    EnEvaluacion --> EnInspeccion: evaluador aprueba, se programa ITSE previa
    EnEvaluacion --> Denegado: evaluador deniega
    EnInspeccion --> Aprobado: ITSE favorable
    EnInspeccion --> Denegado: ITSE desfavorable
    Aprobado --> LicenciaEmitida: emisión en 1 día hábil
    LicenciaProvisional --> LicenciaEmitida: ITSE dentro de 6 meses y definitiva a los 12 meses
    LicenciaEmitida --> [*]
    Denegado --> [*]
```

- **Ruta A:** después de emitir la licencia, Inspecciones programa la **ITSE posterior** (hasta 9 días hábiles); el certificado se renueva cada 2 años.
- **Ruta B:** la licencia solo se emite con evaluación aprobada e ITSE favorable.
- **Ruta C:** licencia provisional gratuita de 12 meses; la ITSE se realiza dentro de los primeros 6 meses.

## Ejemplo de flujo interno: pago en caja

```
1. tramites.controller → RegistrarSolicitud → requisitos completos (rutas A y B)
2. Trámites llama a ModuloPagos.generarEsquela(numeroExpediente, codigoReceta)
     → GenerarEsquela (aplicación)
     → ConsultaTasa.tasaDe(codigoReceta)          // la tasa sale del catálogo
     → CodigoEsquela: ESQ-<expediente>-<secuencial> (único)
     → GeneradorDocumentos: PDF de la esquela (worker)
3. El administrado paga en la caja de la Municipalidad.
4. pagos.controller (rol caja) → RegistrarPagoEnCaja (aplicación)
     → RepositorioEsquelas.buscarPorCodigo(codigo)
     → Esquela.registrarPago(numeroRecibo)   // falla si ya estaba pagada
     → PublicadorEventos.publicar(PagoRegistrado) → Trámites avanza el expediente
```