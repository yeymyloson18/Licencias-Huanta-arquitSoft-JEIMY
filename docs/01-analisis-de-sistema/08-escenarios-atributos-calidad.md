# Escenarios de atributos de calidad – Sistema de Licencias de Funcionamiento de Huanta

Cada escenario convierte un atributo de calidad en algo **medible**: fuente, estímulo, artefacto,
entorno, respuesta y medida. Las medidas son **propuestas por validar** con la Municipalidad.

> **Sprint 1:** todavía no hay sistema construido, así que **ninguna medida se ha ejecutado**. La fila *Herramienta* indica con qué se medirá cada escenario cuando exista el prototipo.

## EQ-01. Rendimiento: consulta del catálogo y del estado del trámite

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Rendimiento |
| **Origen** | AC01 · DA02 · ADR-005 |
| **Fuente** | Administrado desde el Portal Web o el celular |
| **Estímulo** | Consulta los requisitos de una licencia o el estado de su expediente. |
| **Artefacto** | Módulos Catálogo y Trámites, y caché Redis |
| **Entorno** | Operación normal, con hasta 1,000 usuarios simultáneos. |
| **Respuesta** | El sistema muestra la información sin errores. |
| **Medida** | **Propuesta por validar:** el 95 % de las consultas responde en 2 segundos o menos, con menos del 1 % de errores técnicos (5xx). |
| **Verificación** | Prueba de carga con 1,000 usuarios virtuales. |
| **Herramienta** | **k6** (script de carga) y **Grafana + Prometheus** para ver el percentil 95 y los errores 5xx. |
| **Estado** | Pendiente de validar la meta con la Municipalidad. |

## EQ-02. Escalabilidad: picos de campaña

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Escalabilidad |
| **Origen** | AC04 · DA02 · ADR-005 |
| **Fuente** | Aumento de solicitudes durante una campaña de formalización |
| **Estímulo** | La concurrencia sube de 1,000 a 10,000 usuarios simultáneos. |
| **Artefacto** | Instancias del backend, balanceador, Redis y workers |
| **Entorno** | Campaña de formalización. |
| **Respuesta** | Se agregan instancias del backend y el sistema sigue atendiendo. |
| **Medida** | **Propuesta por validar:** con 10,000 usuarios, el 95 % de las respuestas en 3 segundos o menos y menos del 1 % de errores. |
| **Verificación** | Prueba de carga escalonada (1,000 → 5,000 → 10,000 usuarios). |
| **Herramienta** | **k6** con etapas (`stages`) y **Docker Compose** (`--scale api=N`) para agregar instancias. |
| **Estado** | Pendiente de confirmar la demanda real. |

## EQ-03. Disponibilidad: continuidad del servicio

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Disponibilidad |
| **Origen** | AC03 · DA06 · ADR-005 |
| **Fuente** | Administrados y personal municipal |
| **Estímulo** | Falla una instancia del backend. |
| **Artefacto** | Backend API, balanceador y réplica de PostgreSQL |
| **Entorno** | Horario de atención. |
| **Respuesta** | El balanceador envía el tráfico a la otra instancia; presentar solicitudes, generar esquelas y consultar estado siguen funcionando. |
| **Medida** | **Propuesta por validar:** disponibilidad mensual de 99,5 %; recuperación en 5 minutos o menos. |
| **Verificación** | Simulacro apagando una instancia; revisión mensual del monitoreo. |
| **Herramienta** | **Docker** (`docker stop` de una instancia), **Nginx** como balanceador con chequeo de salud y **Uptime Kuma** para medir la disponibilidad mensual. |
| **Estado** | Pendiente de definir las ventanas de mantenimiento. |

## EQ-04. Seguridad: acceso a operaciones protegidas

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Seguridad |
| **Origen** | AC02 · DA03 · ADR-007 · Ley N.° 29733 |
| **Fuente** | Personal sin sesión, sin código OTP o con un rol insuficiente; o un administrado que no conoce el DNI/RUC del expediente |
| **Estímulo** | Intenta aprobar un expediente, registrar un pago de caja, cambiar el catálogo o consultar el expediente de otra persona. |
| **Artefacto** | API REST (autenticación y roles), Seguridad y Usuarios; módulos Trámites, Pagos en caja, Catálogo y Licencias |
| **Entorno** | Pruebas de seguridad en el entorno de pruebas. |
| **Respuesta** | El sistema rechaza la operación, no modifica datos y no expone información sensible. |
| **Medida** | Rechazar el 100 % de los intentos no autorizados probados; ningún dato personal en mensajes de error ni en la página pública del QR. |
| **Verificación** | Matriz de pruebas por rol (mesa de partes, evaluador, inspector, caja, jefatura y administrador) y prueba de consulta del administrado con un DNI/RUC que no corresponde al expediente. |
| **Herramienta** | **Jest + Supertest** (pruebas automáticas por rol), **OWASP ZAP** (escaneo de vulnerabilidades) y **testssl.sh** (comprobar TLS 1.3). |
| **Estado** | Pendiente de aprobar la matriz de permisos por rol. |

## EQ-05. Usabilidad: trámite desde el celular

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Usabilidad |
| **Origen** | AC05 · RF01 · ADR-002 |
| **Fuente** | Administrado que nunca hizo el trámite |
| **Estímulo** | Usa el asistente de ruta y presenta su solicitud desde el celular. |
| **Artefacto** | Portal Web y módulo Catálogo y Asistente |
| **Entorno** | Prueba de usabilidad con personas reales, sin ayuda del personal. |
| **Respuesta** | La persona identifica su licencia, presenta la solicitud y descarga su esquela de pago. |
| **Medida** | **Propuesta por validar:** el 90 % de los participantes completa el proceso en 15 minutos o menos, sin ayuda. |
| **Verificación** | Prueba de usabilidad con un grupo de administrados. |
| **Herramienta** | Prueba con usuarios reales, **cronómetro** y cuestionario **SUS** en **Google Forms**; **Lighthouse** para revisar la vista en celular. |
| **Estado** | Pendiente de organizar la prueba. |

## EQ-06. Mantenibilidad: cambio del TUPA y cambios por módulo

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Mantenibilidad |
| **Origen** | AC06 · DA01 · DA08 · ADR-002 · ADR-003 |
| **Fuente** | Administrador del sistema o equipo de desarrollo |
| **Estímulo** | El TUPA cambia una tasa o un requisito, o se corrige un módulo. |
| **Artefacto** | Catálogo de recetas y módulos del sistema |
| **Entorno** | Sistema en producción. |
| **Respuesta** | El cambio de tasa o requisito se hace en el catálogo, sin programar; la corrección de un módulo no afecta a los demás. |
| **Medida** | Ninguna línea de código modificada para cambiar una tasa; las pruebas de los demás módulos siguen aprobándose. |
| **Verificación** | Cambiar una tasa de prueba y ejecutar las pruebas de regresión. |
| **Herramienta** | **Jest** (pruebas de regresión), **dependency-cruiser** (verifica que el dominio no importe infraestructura) y **GitHub Actions** (ejecuta todo en cada commit). |
| **Estado** | Pendiente de definir las pruebas obligatorias. |

## EQ-07. Disponibilidad del reloj de plazos: alertas a tiempo

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Disponibilidad |
| **Origen** | AC03 · DA05 · ADR-006 · RC04 (Ley N.° 27444) |
| **Fuente** | Tarea programada diaria del Reloj de plazos |
| **Estímulo** | Un expediente abierto llega a 2 días hábiles de su vencimiento. |
| **Artefacto** | Reloj de plazos, calendario de feriados y Notificaciones |
| **Entorno** | Operación normal, incluso si una instancia del backend está caída. |
| **Respuesta** | Una sola instancia obtiene el bloqueo de la tarea (ADR-006), detecta el expediente y alerta a la jefatura una sola vez. |
| **Medida** | **Propuesta por validar:** el 100 % de los expedientes próximos a vencer genera **una** alerta (ni cero ni duplicadas); ningún día hábil sin ejecutar la tarea en el mes. |
| **Verificación** | Prueba con expedientes de fechas simuladas y feriados registrados; revisión mensual del registro de ejecuciones. |
| **Herramienta** | **Jest** con fechas simuladas y feriados de prueba, y **Docker Compose** con 2 instancias para comprobar que sale una sola alerta. |
| **Estado** | Pendiente de definir con cuántos días de anticipación se alerta. |

---

## Resumen de escenarios

| Código | Atributo | Qué se busca comprobar | Origen |
|---|---|---|---|
| EQ-01 | Rendimiento | Que las consultas respondan dentro del tiempo establecido. | AC01 · DA02 |
| EQ-02 | Escalabilidad | Que el sistema pase de 1,000 a 10,000 usuarios. | AC04 · DA02 |
| EQ-03 | Disponibilidad | Que el sistema siga funcionando si falla un servidor. | AC03 · DA06 |
| EQ-04 | Seguridad | Que nadie haga operaciones ni vea datos sin autorización. | AC02 · DA03 |
| EQ-05 | Usabilidad | Que el administrado haga su trámite solo, desde el celular. | AC05 |
| EQ-06 | Mantenibilidad | Que un cambio del TUPA no exija programar. | AC06 · DA01 · DA08 |
| EQ-07 | Disponibilidad | Que ningún plazo venza sin alerta. | AC03 · DA05 |

## Herramientas de medición

| Herramienta | Para qué se usa | Escenarios |
|---|---|---|
| k6 | Simular cientos o miles de usuarios y medir tiempos de respuesta y errores. | EQ-01, EQ-02 |
| Grafana + Prometheus | Ver en gráficos el tiempo de respuesta, los errores y el uso de las instancias. | EQ-01, EQ-02 |
| Docker / Docker Compose | Levantar varias instancias, apagar una a propósito y escalar. | EQ-02, EQ-03, EQ-07 |
| Nginx | Balanceador que deja de enviar tráfico a una instancia caída. | EQ-03 |
| Uptime Kuma | Revisar cada minuto si el sistema responde y calcular la disponibilidad mensual. | EQ-03 |
| Jest + Supertest | Pruebas automáticas del backend NestJS (roles, reglas, plazos). | EQ-04, EQ-06, EQ-07 |
| OWASP ZAP | Buscar vulnerabilidades comunes en la API y el Portal Web. | EQ-04 |
| testssl.sh | Comprobar que el servidor usa TLS 1.3. | EQ-04 |
| Cuestionario SUS + Google Forms | Medir la facilidad de uso con personas reales. | EQ-05 |
| Lighthouse | Revisar la vista en celular y la accesibilidad del Portal Web. | EQ-05 |
| dependency-cruiser | Verificar la regla de dependencia de Clean Architecture. | EQ-06 |
| GitHub Actions | Ejecutar las pruebas automáticamente en cada commit. | EQ-04, EQ-06, EQ-07 |

Todas son herramientas gratuitas o con versión gratuita.