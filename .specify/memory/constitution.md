<!--
Sync Impact Report (enmienda 1.1.0, 2026-11-24)
================================================
Cambio de versión: 1.0.0 → 1.1.0 (MINOR: se amplía materialmente una guía y se agrega un módulo).
Motivo: funcionalidad 012 (chat de orientación del portal), aprobada por la usuaria en el análisis
de la 012 (hallazgo D1).
Principios modificados:
  - I. Monolito modular con Clean Architecture: de 9 a 10 módulos (se agrega "Orientación").
Secciones modificadas:
  - Restricciones tecnológicas y de alcance: el chat de orientación del portal entra en la Fase 1;
    el asistente por WhatsApp (RC13) sigue fuera de alcance (Fase 2).
Documentos actualizados: diseno-interno-de-modulos.md (módulo 10) y README.md (alcance).
Migración del código: ninguna; el módulo nuevo no cambia los existentes.

Sync Impact Report (ratificación 1.0.0)
=======================================
Cambio de versión: plantilla sin completar → 1.0.0 (ratificación inicial)
Principios definidos (los 5 marcadores de la plantilla se amplían a 8 principios, a pedido):
  - [PRINCIPLE_1_NAME] → I. Monolito modular con Clean Architecture
  - [PRINCIPLE_2_NAME] → II. Contrato primero
  - [PRINCIPLE_3_NAME] → III. Modelo de datos por módulo
  - [PRINCIPLE_4_NAME] → IV. TypeScript estricto y lenguaje del dominio
  - [PRINCIPLE_5_NAME] → V. Toda tarea incluye su prueba
  - (nuevo) VI. Escenarios de calidad como criterios de aceptación
  - (nuevo) VII. Protección de datos personales
  - (nuevo) VIII. Flujo Git disciplinado
Secciones añadidas:
  - [SECTION_2_NAME] → Restricciones tecnológicas y de alcance
  - [SECTION_3_NAME] → Flujo de desarrollo y puertas de calidad
  - Governance → Gobernanza (completada)
Secciones eliminadas: ninguna
Plantillas dependientes: leen la constitución en tiempo de ejecución; no se modifican aquí.
TODO diferidos: ninguno.
Fuente: docs/sdd/constitucion-entrada.md y documentos de docs/.
-->

# Constitución del Sistema de Licencias de Funcionamiento – Municipalidad Provincial de Huanta

## Principios fundamentales

### I. Monolito modular con Clean Architecture

- El sistema es **una sola aplicación** (ADR-001) dividida en los **10 módulos** definidos en
  `docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md`: Seguridad y Usuarios,
  Catálogo y Asistente de ruta, Trámites, Pagos en caja, Inspecciones, Licencias, Reloj de plazos,
  Notificaciones, Reportes y Orientación (desde la enmienda 1.1.0). Agregar, quitar o fusionar un módulo exige enmendar esta constitución.
- Cada módulo vive en `src/modulos/<modulo>/` con cuatro capas (ADR-003): `dominio/` (domain),
  `aplicacion/` (application), `infraestructura/` (infrastructure) y `presentacion/` (presentation).
- **Regla de dependencia:** las dependencias apuntan solo hacia el dominio. Los archivos de `dominio/`
  NO DEBEN importar NestJS, PostgreSQL, Redis, librerías HTTP ni ningún paquete externo; solo código
  del propio dominio.
- Un módulo NO DEBE importar el interior de otro (sus entidades, casos de uso, repositorios o
  tablas). Solo puede usar su **fachada pública**, un puerto propio cuyo adaptador llama a esa
  fachada, o reaccionar a sus eventos de dominio.
- La regla de dependencia y el aislamiento entre módulos se verifican automáticamente con
  dependency-cruiser en CI; una violación hace fallar el pipeline.

**Justificación:** las reglas del TUPA son lo más valioso y estable; aislarlas permite probarlas sin
base de datos, cambiar la tecnología sin tocar el negocio y extraer un módulo en el futuro (EQ-06).

### II. Contrato primero

- Toda API HTTP DEBE cumplir `docs/06-contrato-api/openapi.yaml` (rutas, parámetros, cuerpos,
  códigos de estado, esquemas de error y permisos por rol).
- Para crear, cambiar o eliminar un endpoint, **primero** se modifica el contrato OpenAPI (en el
  mismo PR o en uno previo) y después el código. No se fusiona código que exponga un endpoint ausente
  del contrato o que lo contradiga.
- Las pruebas de integración validan las respuestas contra el contrato.

**Justificación:** el contrato es el acuerdo entre el Portal Web, el backend y la futura Fase 2
(chatbot); cambiarlo en silencio rompe a los consumidores.

### III. Modelo de datos por módulo

- La persistencia sigue `docs/05-modelo-de-datos/` (`modelo-entidad-relacion.md`, `esquema.sql` y
  `datos-semilla.sql`): una sola base PostgreSQL con **un esquema por módulo** (MD1).
- Las claves foráneas existen **solo dentro** de un esquema. Entre módulos se guarda el
  identificador de negocio (`numero_expediente`, `codigo_receta`, `usuario_id`) sin FK (MD2).
- Un módulo NO DEBE leer ni escribir tablas de otro esquema.
- Los datos personales (DNI/RUC, celular, correo, dirección y documentos adjuntos) se guardan
  cifrados con AES-256-GCM en la aplicación (`*_cifrado`) y se buscan por HMAC-SHA256 (`*_hmac`)
  (MD3). Las claves se guardan con argon2id.
- Todo cambio de esquema se hace con una migración versionada y se refleja en
  `docs/05-modelo-de-datos/` en el mismo PR.

**Justificación:** cada módulo es dueño de sus datos; lo que se ve en la base coincide con el
código y se cumple la Ley N.° 29733.

### IV. TypeScript estricto y lenguaje del dominio

- Todo el código es TypeScript con `"strict": true`. No se permite `any` implícito ni explícito,
  salvo en adaptadores hacia librerías sin tipos, con un comentario que lo justifique.
- Los nombres del dominio (entidades, objetos de valor, casos de uso, puertos, eventos, carpetas
  de módulos y tablas) se escriben **en español**, con los términos de la documentación y del
  TUPA 2024: `Expediente`, `Esquela`, `Receta`, `RegistrarPagoEnCaja`, `PagoRegistrado`.
- Las palabras reservadas del lenguaje y los nombres propios de librerías se mantienen como son.

**Justificación:** un lenguaje común con la Municipalidad evita traducciones y errores de
interpretación; el tipado estricto detecta errores antes de ejecutar.

### V. Toda tarea incluye su prueba

- Ninguna tarea se considera terminada sin sus pruebas automáticas en el mismo PR.
- **Jest** para pruebas unitarias (dominio y casos de uso, sin base de datos ni red) y
  **Supertest** para pruebas de integración de la API.
- La cobertura mínima es de **80 %** de líneas y ramas en las capas `dominio/` y `aplicacion/` de
  cada módulo. CI falla si baja de ese umbral.
- Todo error corregido incluye una prueba que lo reproduce.

**Justificación:** el trámite tiene efectos legales (plazos, pagos, licencias); las pruebas son la
única forma de cambiar el código con confianza.

### VI. Escenarios de calidad como criterios de aceptación

- Los escenarios **EQ-01 a EQ-07** de
  `docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md` son criterios de aceptación
  del sistema, no metas opcionales.
- Cada especificación y plan DEBE indicar qué escenarios afecta y cómo se comprobará su medida con
  la herramienta indicada en ese documento (k6, OWASP ZAP, dependency-cruiser, Lighthouse, etc.).
- Una funcionalidad que empeore un escenario por debajo de su medida no se fusiona.
- Las medidas marcadas como "propuesta por validar" rigen tal como están hasta que la
  Municipalidad las confirme o cambie; el cambio se registra en ese documento.

**Justificación:** los atributos de calidad guiaron la arquitectura; si no se exigen, la
arquitectura pierde sentido.

### VII. Protección de datos personales

- Los datos personales NUNCA DEBEN aparecer en URL (ruta ni parámetros de consulta), en logs ni en
  mensajes de error (Ley N.° 29733, ADR-007). Se envían en el cuerpo de la petición sobre TLS 1.3.
- Los logs y errores identifican registros solo con datos no personales (número de expediente,
  código de esquela, identificador interno).
- La página pública del QR muestra datos mínimos.
- Se aplican las demás medidas de ADR-007: OTP y roles para el personal, consulta pública solo con
  número de expediente **y** DNI/RUC, límite de 5 intentos fallidos en 15 minutos y auditoría de
  cada operación importante en la misma transacción.
- Las pruebas de seguridad (EQ-04) verifican estas reglas.

**Justificación:** se manejan datos de ciudadanos y decisiones administrativas; una filtración tiene
consecuencias legales para la Municipalidad.

### VIII. Flujo Git disciplinado

- Cada funcionalidad se desarrolla en **su propia rama**; nadie hace commit directo en `main`.
- Los mensajes siguen **commits convencionales** con los tipos `feat`, `fix`, `test`, `docs` y
  `chore`.
- Todo cambio entra a `main` mediante un **PR con CI en verde** (pruebas, cobertura, regla de
  dependencia y validación del contrato).

**Justificación:** un historial limpio y una integración verificada permiten rastrear cada cambio
y evitan romper la rama principal.

## Restricciones tecnológicas y de alcance

- **Backend:** NestJS sobre Node.js con TypeScript; sin estado, para escalar con varias instancias
  detrás de un balanceador (ADR-005).
- **Datos:** PostgreSQL con réplica síncrona y conmutación automática; Redis para caché y
  contadores de intentos; workers con outbox para PDF, QR, correos y SMS.
- **Motor único + catálogo de recetas (ADR-002):** las reglas del TUPA (requisitos, tasa, plazo,
  calificación, orden del ITSE y vigencia) se guardan como datos. NO se programan flujos distintos
  por tipo de licencia.
- **Pagos:** solo pago presencial con esquela en la caja municipal (ADR-004). Sin pasarela digital.
- **Plazos:** se cuentan en días hábiles con el calendario de feriados; las tareas diarias usan
  bloqueo en PostgreSQL (ADR-006).
- **Fuera de alcance:** modo sin conexión, integración con SIAF, recursos de reconsideración o
  apelación, anulación de pagos en el sistema y el asistente por WhatsApp (Fase 2, RC13). El chat
  de orientación del portal (funcionalidad 012) sí está en la Fase 1 (enmienda 1.1.0). Incluir cualquiera
  de ellos exige actualizar el README y, si afecta un principio, enmendar esta constitución.

## Flujo de desarrollo y puertas de calidad

- Las funcionalidades siguen el flujo de Spec Kit: especificación → plan → tareas → implementación.
- El plan de cada funcionalidad DEBE pasar la **verificación constitucional**: módulos afectados,
  cambios en el contrato OpenAPI, cambios en el modelo de datos, escenarios EQ afectados y
  tratamiento de datos personales.
- Puertas obligatorias en CI (GitHub Actions) antes de fusionar:
  1. Compilación TypeScript estricta sin errores.
  2. Pruebas Jest y Supertest aprobadas.
  3. Cobertura ≥ 80 % en `dominio/` y `aplicacion/`.
  4. dependency-cruiser sin violaciones de la regla de dependencia ni entre módulos.
  5. Validación del contrato OpenAPI.
- La revisión del PR comprueba además que no haya datos personales en URL, logs ni errores.

## Gobernanza

- Esta constitución prevalece sobre cualquier otra práctica o guía del proyecto. Ante un
  conflicto entre la documentación de `docs/` y esta constitución, se corrige el documento o se
  enmienda la constitución; no se ignora ninguno.
- **Enmiendas:** se proponen mediante un PR que modifica `.specify/memory/constitution.md`,
  explica el motivo, actualiza los documentos de `docs/` afectados y describe cómo migrar el
  código existente.
- **Versionado semántico:**
  - MAJOR: se elimina o redefine un principio de forma incompatible.
  - MINOR: se agrega un principio o sección, o se amplía materialmente una guía.
  - PATCH: aclaraciones, redacción o correcciones sin cambio de significado.
- **Cumplimiento:** cada PR y cada plan verifican el cumplimiento de estos principios. Toda
  excepción DEBE justificarse por escrito en el plan (sección de complejidad) y aprobarse en la
  revisión; una excepción no justificada bloquea la fusión.

**Versión**: 1.1.0 | **Ratificada**: 2026-11-16 | **Última enmienda**: 2026-11-24
