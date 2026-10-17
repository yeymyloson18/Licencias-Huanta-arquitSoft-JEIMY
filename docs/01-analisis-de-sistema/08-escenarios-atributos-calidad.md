# Escenarios de atributos de calidad – Sistema de Licencias de Funcionamiento de Huanta

Un atributo de calidad escrito como "el sistema debe ser rápido" no se puede evaluar.
Cada escenario de este archivo responde seis preguntas: **quién** origina la exigencia (fuente),
**qué** ocurre (estímulo), **sobre qué parte** del sistema (artefacto), **en qué condiciones** (entorno),
**qué debe hacer** el sistema (respuesta) y **con qué valor** se comprueba (medida).

Las medidas son **propuestas por validar** con la Municipalidad Provincial de Huanta y se confirman
con pruebas. Cada escenario indica de qué atributo (AC) y driver (DA) proviene.

---

## EQ-01. Rendimiento: consulta del catálogo y del estado del trámite

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Rendimiento |
| **Origen** | AC02 – Rendimiento · DA02 · ADR-005 |
| **Fuente** | Administrado desde el Portal Web o el celular |
| **Estímulo** | Consulta los requisitos de una licencia o el estado de su expediente. |
| **Artefacto** | Módulos Catálogo y Trámites, caché Redis y réplica de lectura de PostgreSQL |
| **Entorno** | Operación normal, con hasta 1,000 usuarios simultáneos. |
| **Respuesta** | El sistema muestra la información solicitada sin errores. |
| **Medida** | **Propuesta por validar:** el 95 % de las consultas responde en 2 segundos o menos, con menos del 1 % de errores técnicos (5xx). |
| **Verificación** | Prueba de carga con 1,000 usuarios virtuales; registrar el percentil 95 y la tasa de errores. |
| **Estado** | Pendiente de validar la meta con la Municipalidad. |

## EQ-02. Escalabilidad: picos de campaña y renovación del ITSE

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Escalabilidad y elasticidad |
| **Origen** | AC03 – Escalabilidad · AC11 – Elasticidad · DA02 · ADR-005 |
| **Fuente** | Aumento de solicitudes durante campañas de formalización o vencimientos masivos del ITSE |
| **Estímulo** | La concurrencia sube de 1,000 a 10,000 usuarios simultáneos en menos de 30 minutos. |
| **Artefacto** | Instancias del backend, balanceador de carga, Redis, réplicas de lectura y workers |
| **Entorno** | Campaña de formalización con la concurrencia máxima esperada. |
| **Respuesta** | El autoescalado agrega instancias; si se supera la capacidad máxima, se activa la sala de espera virtual en lugar de mostrar errores. Al terminar el pico, vuelve a dos instancias. |
| **Medida** | **Propuesta por validar:** con 10,000 usuarios, el 95 % de las respuestas en 3 segundos o menos y menos del 1 % de errores; nuevas instancias operativas en 5 minutos o menos. |
| **Verificación** | Prueba de carga escalonada (1,000 → 5,000 → 10,000 usuarios) y revisión de las métricas de autoescalado. |
| **Estado** | Pendiente de confirmar la demanda real y el presupuesto de infraestructura. |

## EQ-03. Disponibilidad: continuidad del servicio

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Disponibilidad |
| **Origen** | AC04 – Disponibilidad · ADR-005 |
| **Fuente** | Administrados y personal municipal |
| **Estímulo** | Falla una instancia del backend o la base de datos principal. |
| **Artefacto** | Backend API, balanceador, PostgreSQL primaria y réplica |
| **Entorno** | Horario de atención y periodos de campaña. |
| **Respuesta** | El balanceador retira la instancia que falla y la base de datos conmuta a la réplica. Las operaciones críticas (presentar solicitud, pagar y consultar estado) siguen disponibles. |
| **Medida** | **Propuesta por validar:** disponibilidad mensual de 99,5 % para las operaciones críticas; recuperación en 5 minutos o menos. |
| **Verificación** | Simulacro apagando una instancia y la base primaria; revisión mensual de los registros de monitoreo. |
| **Estado** | Pendiente de definir las ventanas de mantenimiento. |

## EQ-04. Seguridad: acceso a operaciones protegidas y datos personales

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Seguridad |
| **Origen** | AC05 – Seguridad · DA03 · ADR-007 · Ley N.° 29733 |
| **Fuente** | Usuario sin sesión, con credenciales inválidas, sin código OTP o con un rol insuficiente |
| **Estímulo** | Intenta aprobar un expediente, emitir una licencia o ver los datos personales de otra persona. |
| **Artefacto** | Middleware de autenticación y roles; módulos Trámites y Licencias; página pública del QR |
| **Entorno** | Pruebas de seguridad en el entorno de pruebas. |
| **Respuesta** | El sistema rechaza la operación, no modifica datos, no expone información sensible y registra el intento en la bitácora. |
| **Medida** | Rechazar y registrar el 100 % de los intentos no autorizados probados; ningún dato personal en los mensajes de error ni en la página pública del QR. |
| **Verificación** | Matriz de pruebas por rol (administrado, mesa de partes, evaluador, inspector, jefatura y administrador funcional) y revisión de las respuestas. |
| **Estado** | Pendiente de aprobar la matriz de permisos por rol. |

## EQ-05. Confiabilidad: pagos sin cobro doble

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Confiabilidad |
| **Origen** | AC06 – Confiabilidad · DA04 · ADR-004 |
| **Fuente** | Administrado |
| **Estímulo** | Pulsa "Pagar", la conexión falla y vuelve a intentarlo varias veces. |
| **Artefacto** | Módulo Pagos, puerto `PasarelaPago` y receptor de notificaciones de la pasarela (webhook) |
| **Entorno** | Red inestable o pasarela lenta. |
| **Respuesta** | El sistema reconoce el mismo identificador de pago y no genera un segundo cobro. El expediente queda en "pago pendiente" hasta recibir la confirmación. |
| **Medida** | Ningún cobro doble en el 100 % de los reintentos probados; conciliación diaria sin diferencias. |
| **Verificación** | Pruebas con una pasarela simulada que corta la conexión; conciliación contra el reporte de la pasarela. |
| **Estado** | Pendiente de elegir la pasarela de pago. |

## EQ-06. Modificabilidad: cambio del TUPA sin reprogramar

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Modificabilidad |
| **Origen** | AC01 – Modificabilidad · DA01 · ADR-002 |
| **Fuente** | Administrador funcional de la Municipalidad |
| **Estímulo** | El TUPA cambia una tasa, un requisito o un plazo, o se agrega un nuevo tipo de licencia. |
| **Artefacto** | Módulo Catálogo |
| **Entorno** | Sistema en producción con expedientes en curso. |
| **Respuesta** | Se publica una nueva versión de la receta sin cambiar código ni volver a desplegar. Los expedientes iniciados conservan la versión con la que empezaron. |
| **Medida** | Ninguna línea de código modificada; publicación en 1 día hábil o menos; el 100 % de los expedientes en curso conserva su versión original. |
| **Verificación** | Publicar una versión de prueba y comparar los expedientes antes y después del cambio. |
| **Estado** | Pendiente de definir quién aprueba la publicación de versiones. |

## EQ-07. Operación sin conexión: inspección ITSE en campo

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Disponibilidad sin conexión |
| **Origen** | AC09 – Operación sin conexión · DA07 · ADR-008 |
| **Fuente** | Inspector ITSE |
| **Estímulo** | Registra el resultado de la inspección con fotos en un lugar sin señal. |
| **Artefacto** | Aplicación instalable (PWA) de inspectores y módulo Inspecciones |
| **Entorno** | Zona sin cobertura móvil. |
| **Respuesta** | La aplicación guarda la inspección en el celular y la sincroniza automáticamente al recuperar la señal. |
| **Medida** | Ninguna inspección perdida; sincronización en 5 minutos o menos tras recuperar la conexión. |
| **Verificación** | Prueba en modo avión, reconexión y verificación de los datos en el servidor. |
| **Estado** | Pendiente de prueba en campo. |

## EQ-08. Auditabilidad: bitácora que nadie puede alterar

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Auditabilidad |
| **Origen** | AC07 – Auditabilidad · DA05 · ADR-007 · Ley N.° 27444 |
| **Fuente** | Funcionario municipal o auditor de Contraloría |
| **Estímulo** | Se realiza una acción sobre un expediente, o alguien intenta editar o borrar un registro de la bitácora. |
| **Artefacto** | Bitácora de auditoría (componente transversal) |
| **Entorno** | Operación normal y revisión de auditoría. |
| **Respuesta** | Toda acción queda registrada con usuario, fecha y hora. La bitácora rechaza cualquier edición o borrado. |
| **Medida** | El 100 % de las acciones de prueba aparece en la bitácora; el 100 % de los intentos de modificarla es rechazado. |
| **Verificación** | Ejecutar acciones de prueba y compararlas con la bitácora; intentar actualizar y borrar registros. |
| **Estado** | Pendiente. |

## EQ-09. Cumplimiento de plazos: reloj en días hábiles

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Confiabilidad del control de plazos |
| **Origen** | RF08 · DA06 · ADR-006 · Ley N.° 27444 |
| **Fuente** | Reloj de plazos (tarea programada diaria) |
| **Estímulo** | Un expediente de evaluación previa se acerca a su plazo de 8 días hábiles. |
| **Artefacto** | Reloj de plazos, calendario de feriados y Notificaciones |
| **Entorno** | Periodos que incluyen fines de semana y feriados. |
| **Respuesta** | El sistema alerta a la jefatura antes del vencimiento; si el plazo vence, marca el expediente en rojo y lo registra. |
| **Medida** | El 100 % de los expedientes alertados al menos 1 día hábil antes del vencimiento; ningún error de cálculo en los casos de prueba con feriados. |
| **Verificación** | Casos de prueba con calendarios que incluyen feriados y fines de semana largos. |
| **Estado** | Pendiente de cargar el calendario oficial de feriados. |

---

## Resumen de escenarios

| Código | Atributo | Qué se busca comprobar | Origen |
|---|---|---|---|
| EQ-01 | Rendimiento | Que las consultas respondan dentro del tiempo establecido. | AC02 · DA02 |
| EQ-02 | Escalabilidad | Que el sistema pase de 1,000 a 10,000 usuarios sin superar los límites. | AC03, AC11 · DA02 |
| EQ-03 | Disponibilidad | Que las operaciones críticas sigan disponibles ante una falla. | AC04 |
| EQ-04 | Seguridad | Que nadie ejecute operaciones ni vea datos sin autorización. | AC05 · DA03 |
| EQ-05 | Confiabilidad | Que un reintento de pago nunca genere un cobro doble. | AC06 · DA04 |
| EQ-06 | Modificabilidad | Que un cambio del TUPA se cargue sin reprogramar. | AC01 · DA01 |
| EQ-07 | Operación sin conexión | Que ninguna inspección se pierda por falta de señal. | AC09 · DA07 |
| EQ-08 | Auditabilidad | Que toda acción quede registrada y no se pueda alterar. | AC07 · DA05 |
| EQ-09 | Plazos | Que ningún plazo venza sin aviso previo. | RF08 · DA06 |