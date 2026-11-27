# Evaluación de la arquitectura frente a los atributos de calidad (ATAM simplificado)

Este documento evalúa si las decisiones de arquitectura (ADR-001 a ADR-012) logran los atributos de
calidad del Sprint 1 y qué cuesta cada una. Usa una versión simplificada del método **ATAM**
(*Architecture Tradeoff Analysis Method*, del SEI). Las mediciones que lo respaldan están en
[atributos-de-calidad.md](atributos-de-calidad.md).

**Cómo se hizo**: ATAM completo es un taller con todos los interesados. Aquí lo hizo la arquitecta
del proyecto, con lo construido y medido hasta el cierre del Sprint 2 y las mejoras 009 a 013 (`main`
en `7076895`). Las prioridades del árbol de utilidad son una **propuesta de esta evaluación**, igual
que las medidas del Sprint 1: quedan por validar con la Municipalidad.

| Paso de ATAM | Dónde está |
| --- | --- |
| 1. Impulsores del negocio | §1 |
| 2. Árbol de utilidad (atributos priorizados con sus escenarios) | §2 |
| 3. Análisis de los enfoques: qué decisión responde a cada escenario | §3 |
| 4. Puntos de sensibilidad, compromisos, riesgos y no riesgos | §4 a §6 |
| 5. Temas de riesgo y conclusión | §7 y §8 |

## 1. Impulsores del negocio

Salen de [`06-drivers-arquitectonicos.md`](../01-analisis-de-sistema/06-drivers-arquitectonicos.md):

- **Formalizar negocios en Huanta** con un trámite que el ciudadano haga desde el celular, sin ir a la
  Municipalidad (DA01, AC05).
- **Cumplir la ley**: plazos en días hábiles con efecto legal (Ley N.° 27444, DA05) y protección de
  datos personales (Ley N.° 29733, DA03).
- **Aguantar las campañas de formalización**, de 1,000 a 10,000 usuarios a la vez (DA02, AC04).
- **Un equipo de TI municipal pequeño** que debe mantenerlo, y un TUPA que cambia (DA06 a DA08, AC06).

## 2. Árbol de utilidad

Cada hoja es un escenario del Sprint 1 con dos calificaciones: **importancia** para el negocio y
**dificultad** para la arquitectura. A = alta, M = media, B = baja.

| Atributo | Refinamiento | Escenario | Importancia | Dificultad |
| --- | --- | --- | --- | --- |
| **Seguridad** | Nadie opera ni ve datos sin autorización | EQ-04: 100 % de accesos no autorizados rechazados, bloqueo al 6.º intento, sin datos personales en errores ni en el QR | A | M |
| **Disponibilidad** | Ningún plazo legal vence sin aviso | EQ-07: una sola alerta por expediente, aunque corran 2 instancias | A | M |
| **Mantenibilidad** | El TUPA cambia sin programar | EQ-06: 0 líneas de código para cambiar una tasa; los demás módulos siguen en verde | A | M |
| **Rendimiento** | El ciudadano consulta rápido | EQ-01: p95 ≤ 2 s y < 1 % de errores con 1,000 usuarios | A | M |
| **Escalabilidad** | Picos de campaña | EQ-02: p95 ≤ 3 s con 10,000 usuarios agregando instancias | M | A |
| **Disponibilidad** | El servicio sigue si falla un servidor | EQ-03: 99.5 % mensual; recuperación ≤ 5 min sin perder pagos | M | A |
| **Usabilidad** | Trámite solo, desde el celular | EQ-05: 90 % completa en ≤ 15 min sin ayuda; accesibilidad ≥ 90 | M | M |
| **Exactitud** | El chat no inventa datos | EQ-08: ≥ 90 % correctas y 0 cifras ajenas al catálogo | M | M |

Los escenarios **(A, A)** son los que más conviene vigilar. Aquí no hay ninguno: los de importancia
alta tienen dificultad media porque el diseño los resolvió desde el inicio, y los de dificultad alta
(EQ-02 y EQ-03) dependen de infraestructura que se arma en el Sprint 3.

## 3. Qué decisión responde a cada escenario

| Escenario | Decisiones (ADR) | Por qué funciona | Resultado medido |
| --- | --- | --- | --- |
| EQ-04 Seguridad | ADR-007 (seguridad por capas), ADR-003 (dominio aislado) | Clave + código de 6 dígitos para el personal; identidad con código para el ciudadano; roles verificados en la API, no solo en el portal; contadores de intentos en Redis compartidos por todas las réplicas; datos personales cifrados (AES-256-GCM) y nunca en caché ni en registros | Matrices de permisos de la 005 a la 011 con 401 o 403 y sin cambiar datos; ZAP sin alertas altas, medias ni bajas; Newman 41 aserciones sin fallas. **Cumple parcialmente**: falta TLS en el servidor |
| EQ-07 Reloj de plazos | ADR-006 (tarea programada con candado) | Todas las instancias intentan cada hora, pero solo la que obtiene `pg_try_advisory_xact_lock` trabaja, y una restricción `UNIQUE` impide la alerta repetida aunque el candado fallara | Con 2 aplicaciones contra la misma base: una sola alerta por vencimiento. **Cumple** |
| EQ-06 Mantenibilidad | ADR-002 (motor único y recetas), ADR-001 y ADR-003 (módulos con fachadas y regla de dependencia) | Las diferencias entre las 9 licencias son datos de la tabla de recetas; un módulo solo entra a otro por su `fachada.ts`; dependency-cruiser rompe el CI si alguien lo viola | Tasas y requisitos se editan en `/admin/catalogo`. Las funcionalidades 012 y 013 se agregaron sin romper las pruebas de los demás módulos. **Cumple** |
| EQ-01 Rendimiento | ADR-005 (sin estado, caché y cola), ADR-009 (portal estático) | Catálogo en Redis con *cache-aside* e invalidación al guardar; índices para cada consulta crítica; el portal son archivos estáticos que el navegador guarda | 2,000 usuarios: p95 6 ms y 0 % de errores en 387,235 peticiones. **Cumple** (falta repetirlo contra el servidor) |
| EQ-02 Escalabilidad | ADR-005, ADR-008 (PgBouncer) | La API no guarda estado en memoria: sesiones, contadores y caché viven en Redis y PostgreSQL, así que agregar réplicas no cambia el código. PgBouncer reparte las conexiones | Con 2 réplicas hasta 2,000 usuarios sin errores; cada réplica al 64 % de CPU. **Cumple parcialmente**: 10,000 no se puede medir en el entorno del curso |
| EQ-03 Disponibilidad | ADR-005, ADR-008 | Dos réplicas de la API detrás del proxy; si cae Redis, la salud responde `DEGRADADO` y el catálogo sigue desde PostgreSQL; la cola de eventos es idempotente y los pagos usan transacciones | Réplicas probadas en Docker. **Pendiente**: la réplica de la base con Patroni no se montó (un solo servidor) y la disponibilidad mensual se mide en producción |
| EQ-05 Usabilidad | ADR-009 (SPA primero celular), ADR-002 (asistente de 3 preguntas), ADR-012 (CoreUI) | El asistente elige la licencia; el formulario se arma con la receta; un diseño consistente en claro y oscuro | Accesibilidad Lighthouse **100** en claro y oscuro; recorrido automatizado a 360 px en 81 s. **Cumple parcialmente**: falta el SUS con personas |
| EQ-08 Exactitud | ADR-011 (proveedor de IA externo), ADR-002 | El chat responde solo con el catálogo vigente y una guía; el sistema revisa cada monto y plazo contra el catálogo antes de mostrarlo | 37 de 37 correctas, 0 cifras ajenas, p95 3.2 s. **Cumple** |

## 4. Puntos de sensibilidad

Un punto de sensibilidad es un parámetro de la arquitectura donde un cambio pequeño mueve un atributo
de calidad. Conviene conocerlos para no cambiarlos sin medir.

| Parámetro | Valor actual | Atributo que mueve | Qué pasa si cambia |
| --- | --- | --- | --- |
| Vida del catálogo en Redis + caché del navegador | 240 s + 60 s (la configuración no deja subir de 240) | Rendimiento ↔ frescura de las tasas | Más tiempo, menos consultas a la base, pero si fallara el borrado al guardar, una tasa nueva tardaría más de 5 minutos en verse |
| Intervalo de la cola de eventos (`DESPACHADOR_INTERVALO_MS`) | 2 s, con reintentos crecientes hasta 5 min | Rendimiento ↔ prontitud | Más corto, el pago se refleja antes en el expediente pero la base trabaja más; más largo, al revés |
| Límite de intentos del personal | 5 fallos en 15 min | Seguridad ↔ usabilidad | Más bajo, más difícil adivinar claves pero más bloqueos por error |
| Réplicas de la API | 2 | Escalabilidad y disponibilidad ↔ memoria del servidor | En el droplet de 2 GB, una tercera réplica compite por memoria con PostgreSQL |
| Tiempo máximo y límite del chat | 15 s; 10 preguntas cada 15 min | Usabilidad ↔ cuota gratuita del proveedor | Más preguntas por persona agotan antes la cuota diaria de Groq |
| CSS que bloquea el primer pintado | 25.4 KB de CoreUI (antes 5.4 KB) y `modo-inicial.js` | Usabilidad (diseño, sin destello) ↔ rendimiento | Cada módulo de Sass que se agrega resta puntos de Lighthouse |

## 5. Compromisos (lo que se gana y lo que se cede)

| Decisión | Se gana | Se cede | Por qué se aceptó |
| --- | --- | --- | --- |
| **Monolito modular** (ADR-001) en lugar de microservicios | Un solo despliegue, transacciones simples entre expediente, pago y licencia, pruebas de integración fáciles | Escalar un módulo obliga a escalar todo; un error grave puede detener a todos los módulos | El equipo de TI es pequeño (DA07). Las fachadas y la regla de dependencia dejan separar un módulo después |
| **Contadores de seguridad que se cierran si cae Redis** | Ningún atacante aprovecha una caída para probar claves sin límite | Si cae Redis, el personal no puede ingresar (503), aunque la consulta y el catálogo sigan | La seguridad (A) pesa más que el ingreso del personal durante una caída corta (ADR-005, ADR-007) |
| **Cola de eventos en PostgreSQL** (bandeja de salida) en lugar de un broker | Sin otra pieza que operar; el evento se guarda en la misma transacción que el cambio | Hasta unos 2 s de espera entre módulos; la base hace un poco más de trabajo | Consistencia y simplicidad; la espera no afecta al ciudadano |
| **Datos personales cifrados y fuera de la caché** | Cumple la Ley N.° 29733 aunque alguien lea la base o Redis | La consulta pública siempre va a PostgreSQL | La consulta igual responde con p95 de 113.6 ms con 1,000 usuarios |
| **CoreUI** (ADR-012) | Diseño profesional y consistente, modo oscuro, accesibilidad 100 | De 1 a 4 puntos de rendimiento en Lighthouse (portada 95 frente a 97; tablero 94 frente a 98) | El rendimiento sigue sobre 90; registrado en `evidencias/diseno-013/despues.md` |
| **Script de modo inicial** | Sin destello cuando la elección es contraria al dispositivo | De 1 a 3 puntos de rendimiento (bloquea el primer pintado) | Pedido por la usuaria; compatible con la CSP |
| **Groq gratuito** para el chat (ADR-011) | Costo cero y respuestas en lenguaje natural | Depende de un servicio externo con cuota diaria | Si falla, el chat lo dice y ofrece el asistente; los datos personales se quitan antes de enviar |
| **Revisión de cifras del chat** | El chat nunca muestra una tasa o un plazo inventado | A veces responde "No tengo esa información" aunque la IA tuviera razón | Una tasa falsa en un trámite municipal es peor que una respuesta incompleta |

## 6. Riesgos y no riesgos

**Riesgos** (decisiones o vacíos que pueden impedir un escenario):

| N.° | Riesgo | Escenario | Cómo se maneja |
| --- | --- | --- | --- |
| R1 | La base de datos es única: Patroni y la réplica síncrona (ADR-008) no se montaron porque el servidor del curso es uno solo | EQ-03 | Respaldo diario con restauración probada; PgBouncer ya está en medio, así que pasar a Patroni no cambia el código. Siguiente paso documentado en ADR-008 |
| R2 | En producción no hay envío real del código de verificación: hoy solo existe el simulado | EQ-04 | Decidir el proveedor de SMS o correo antes de abrir el sistema al público (README §6) |
| R3 | La carga se midió con k6 en la misma máquina que el sistema y solo hasta 2,000 usuarios | EQ-01, EQ-02 | Repetir k6 contra el servidor en el Sprint 3. Los resultados actuales son un piso |
| R4 | Redis es una sola instancia y los límites de seguridad dependen de ella | EQ-03, EQ-04 | Reinicio automático del contenedor; la salud avisa `DEGRADADO`; una caída corta es aceptable (§5) |
| R5 | El chat depende de un proveedor externo gratuito y la Municipalidad aún no aprueba su uso | EQ-08 | Configurable por variables (se cambia de proveedor sin código); salida útil si falla |
| R6 | Sin dominio propio, Cloudflare (ADR-010) no se aplicó: no hay CDN ni origen oculto | EQ-01, EQ-03 | sslip.io da HTTPS válido y TLS 1.3. El cambio a dominio es un solo valor en el servidor |
| R7 | Validación de DNI y RUC simulada | EQ-04 | Adaptador listo detrás de un puerto (ADR-003); falta el contrato con el proveedor |

**No riesgos** (decisiones que ya están probadas y no preocupan):

- **Motor único y recetas** (ADR-002): cambiar una tasa no exige código, y lo comprueba el EQ-06.
- **Clean Architecture con regla automática** (ADR-003): dependency-cruiser con 0 violaciones en
  cada PR, y 99.4 % de cobertura de líneas en dominio y aplicación.
- **Reloj de plazos con candado y `UNIQUE`** (ADR-006): probado con 2 instancias a la vez.
- **Caché con respaldo**: si Redis cae, el catálogo se sirve desde PostgreSQL, y la carga del Sprint 2
  lo comprobó con Redis detenido.
- **Pago presencial con esquela única** (ADR-004): una restricción en la base impide la segunda
  esquela y el doble pago.

## 7. Temas de riesgo

Los riesgos se agrupan en dos temas que amenazan a los impulsores del negocio:

1. **La disponibilidad y la escala reales dependen del servidor** (R1, R3, R4, R6). La arquitectura
   está preparada (sin estado, PgBouncer, respaldos), pero EQ-02 y EQ-03 solo se cierran con el
   sistema publicado. Esto es el centro del Sprint 3.
2. **Los servicios externos están simulados o en plan gratuito** (R2, R5, R7). El diseño los aísla
   detrás de puertos y adaptadores, así que contratarlos no cambia el dominio, pero el sistema no
   puede atender al público real hasta tenerlos.

## 8. Conclusión

La arquitectura **cumple los escenarios de importancia alta** (EQ-01, EQ-04, EQ-06 y EQ-07) y el EQ-08,
con evidencia automática en el CI. Los compromisos se tomaron a favor de lo que más pesa en este
sistema: la seguridad de los datos y la ley de plazos por encima de la disponibilidad del ingreso
durante una caída de Redis, y la simplicidad del monolito por encima de escalar cada módulo por
separado.

Lo que falta no es un problema de diseño, sino de entorno: la escala de 10,000 usuarios, la base con
réplica y la disponibilidad mensual necesitan el servidor y, para la alta disponibilidad completa,
más de un servidor de base de datos. El Sprint 3 debe:

1. Desplegar en el servidor y repetir k6 desde otra máquina (R3, EQ-01 y EQ-02).
2. Medir TLS 1.3 y las cabeceras en internet (EQ-04) y la disponibilidad con Uptime Kuma (EQ-03).
3. Hacer la prueba SUS con personas (EQ-05).
4. Dejar documentado el camino a Patroni (R1) y a un envío real del código (R2).
