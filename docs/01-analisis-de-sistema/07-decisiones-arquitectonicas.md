# Decisiones arquitectónicas (ADR)

Un **ADR (Architecture Decision Record)** documenta una decisión importante, su contexto,
las alternativas evaluadas y sus consecuencias.

## Resumen

| ID | Decisión arquitectónica | Driver relacionado | Justificación | Resultado |
|---|---|---|---|---|
| ADR-001 | Monolito modular | DA07 | Una sola aplicación desplegable, organizada en módulos, simple de construir y operar para un equipo pequeño. | Módulos: Seguridad y Usuarios, Catálogo y Asistente de ruta, Trámites, Pagos en caja, Inspecciones, Licencias, Reloj de plazos, Notificaciones y Reportes. |
| ADR-002 | Motor único + catálogo de recetas | DA01 | Las 9 licencias siguen los mismos pasos; lo que cambia se guarda como datos. | Un cambio de tasa, requisito o plazo del TUPA se actualiza en el catálogo, no en el código. |
| ADR-003 | Clean Architecture | DA08 | Separar las reglas del trámite de los detalles tecnológicos. | Capas Dominio, Aplicación, Infraestructura y Presentación. |
| ADR-004 | Pago presencial con esquela | DA04 | El TUPA indica el pago en la caja de la Municipalidad. | El sistema genera una sola esquela por expediente y el personal de caja registra el pago. |
| ADR-005 | Escalamiento horizontal con caché y cola | DA02, DA06 | Soportar de 1,000 a 10,000 usuarios y seguir operando si falla un servidor. | Varias instancias, balanceador, Redis, réplica de base de datos con conmutación automática y workers. |
| ADR-006 | Reloj de plazos como tarea programada | DA05 | Contar días hábiles y alertar antes del vencimiento. | Proceso diario con calendario de feriados (RF23) que se ejecuta una sola vez por día gracias a un bloqueo en PostgreSQL. |
| ADR-007 | Seguridad por capas | DA03 | Proteger datos personales y operaciones del personal. | OTP, identidad confirmada del administrado, límite de intentos, roles, TLS 1.3, AES-256, registro de auditoría y QR público con datos mínimos. |
| ADR-008 | PostgreSQL con réplica síncrona y Patroni | DA06, DA02 | Que caer la base principal no detenga el trámite ni pierda pagos confirmados. | Primaria + réplica síncrona; Patroni (con etcd) elige la nueva primaria y PgBouncer reparte las conexiones. |
| ADR-009 | Portal web como SPA en React + Vite | DA02, DA08 · RC07, RC08 | Una sola aplicación web responsive, servida como archivos estáticos y unida a la API solo por el contrato OpenAPI. | React + TypeScript + Vite, tipos generados desde `openapi.yaml`, servida por nginx y cacheable en una CDN. |
| ADR-010 | Cloudflare para DNS, CDN y borde TLS | DA02, DA03, DA06 · RC10 | Entregar el portal rápido en todo el país y proteger el origen sin montar infraestructura propia. | DNS con proxy, CDN para `/assets/`, TLS de borde con modo "Full (strict)" hacia nginx con Let's Encrypt. |
| ADR-011 | Proveedor externo de IA para el chat de orientación | DA02, DA03, DA08 · RC13 | Responder preguntas libres sobre licencias sin inventar datos ni sacar datos personales del sistema. | Servicio compatible con OpenAI (Groq, `openai/gpt-oss-120b`) llamado solo desde el backend con `fetch`; contexto solo del catálogo y la guía; datos personales quitados; revisión de cifras; sin clave, el chat se desactiva. |
| ADR-012 | Adopción de CoreUI para el diseño del portal | DA02, DA08 · RC07 | Dar al personal un área de administración y al ciudadano un portal ligero y consistente, sin reescribir las pantallas ni perder accesibilidad ni rendimiento. | CoreUI 5 (React y Sass, MIT) con versiones fijas, importado por partes con los colores de la Municipalidad; modo claro u oscuro con `data-coreui-theme` y `prefers-color-scheme`; CSP sin cambios. |

---

## ADR-001: Monolito modular
- **Contexto:** la Municipalidad tiene un equipo de TI pequeño y el trámite es transaccional (expediente, pago, inspección y licencia deben ser consistentes).
- **Alternativas:** microservicios; monolito sin módulos.
- **Decisión:** una sola aplicación con módulos de límites claros y una base PostgreSQL.
- **Consecuencias:** ✅ simple de construir, probar y desplegar; ✅ transacciones normales; ✅ se puede extraer un módulo en el futuro. ⚠️ se escala la aplicación completa.

## ADR-002: Motor único + catálogo de recetas
- **Contexto:** las 9 licencias difieren solo en 6 datos: requisitos, tasa, plazo, calificación, orden del ITSE y vigencia.
- **Alternativas:** programar 9 flujos distintos.
- **Decisión:** un motor que sigue la receta del catálogo; las reglas del TUPA se guardan como datos.
- **Consecuencias:** ✅ cambiar una tasa o un requisito no exige programar; ✅ las reglas viven en un solo lugar. ⚠️ el administrador del sistema debe mantener el catálogo actualizado.

## ADR-003: Clean Architecture
- **Contexto:** las reglas del trámite son lo más valioso y estable; la tecnología puede cambiar y habrá una Fase 2 (chatbot).
- **Alternativas:** capas tradicionales donde el negocio depende de la base de datos; MVC.
- **Decisión:** dominio en el centro; los casos de uso usan contratos; la infraestructura implementa esos contratos con adaptadores.
- **Consecuencias:** ✅ las reglas se prueban sin base de datos; ✅ se cambia la base de datos o el servicio de DNI/RUC sin tocar el negocio; ✅ el chatbot será otro adaptador de entrada. ⚠️ más archivos e interfaces.

## ADR-004: Pago presencial con esquela
- **Contexto:** el TUPA indica el pago en efectivo en la Caja de la Entidad; no se incluyen pagos digitales.
- **Alternativas:** pasarela de pago digital (descartada por alcance y por el TUPA vigente).
- **Decisión:** cuando el nivel de riesgo ya está confirmado (verificación de requisitos en la ruta A; evaluación previa en la ruta B), el sistema calcula la tasa desde el catálogo y genera **una sola esquela por expediente** en PDF, con el código `ESQ-<expediente>` (protegido con una restricción UNIQUE sobre el número de expediente en la base de datos; si se pide otra vez, se devuelve la misma esquela). El personal de caja ve el expediente, el titular y el monto, confirma, y registra el pago con ese código y el número de recibo. Un número de recibo mal digitado solo lo corrige la jefatura, con motivo y registro de auditoría.
- **Consecuencias:** ✅ sin integraciones externas de pago, más simple y barato; ✅ una esquela solo puede pagarse una vez y un expediente no puede tener dos esquelas, así nadie paga dos veces; ✅ como el riesgo se confirma antes de generar la esquela, el monto pagado siempre coincide con la licencia. ⚠️ el trámite avanza recién cuando caja registra el pago; ⚠️ anular un pago ya registrado queda fuera del sistema (procedimiento de caja).

## ADR-005: Escalamiento horizontal con caché y cola
- **Contexto:** campañas de formalización y renovaciones del ITSE generan picos de 1,000 a 10,000 usuarios.
- **Alternativas:** un servidor grande; microservicios.
- **Decisión:** backend sin estado con varias instancias detrás de un balanceador; Redis para el catálogo, el estado de los trámites y los contadores de intentos (compartidos por todas las instancias); PostgreSQL primaria con una réplica **síncrona** en espera (así no se pierde ningún pago ya confirmado) y **conmutación automática** (Patroni o el servicio administrado de PostgreSQL de la nube); y workers para generar PDF y QR, enviar correos y SMS, y entregar los eventos pendientes (outbox).
- **Reglas de la caché:** al actualizar una receta, el catálogo borra esa receta de Redis; al cambiar el estado de un expediente, Trámites borra su clave. Además, cada clave vence sola a los 10 minutos como respaldo. Si Redis falla, el sistema lee directo de PostgreSQL y el límite de intentos se aplica con un contador en la memoria de cada instancia hasta que Redis vuelva (mientras tanto, el límite se cuenta por instancia y es algo más permisivo).
- **Consecuencias:** ✅ crece según la demanda; ✅ sigue operando si falla una instancia o la base de datos principal; ✅ la caché nunca muestra datos viejos después de un cambio. ⚠️ infraestructura más compleja que un solo servidor.
- **Actualización (funcionalidades 001 y 002, noviembre de 2026):** al implementar se precisaron dos puntos, sin cambiar la decisión:
  1. **Vencimiento de la caché del catálogo:** 5 minutos en total en el peor caso: Redis 240 s (`CATALOGO_CACHE_TTL_SEGUNDOS=240`, máximo validado al arrancar) + 60 s de `Cache-Control` en el navegador; al guardar una receta se borran sus claves y el cambio se ve en la siguiente consulta (EQ-06, funcionalidad 003). Antes eran 10 minutos; se bajó para que un cambio del TUPA se vea antes si falla el borrado de la clave.
  2. **Si Redis falla, el inicio de sesión del personal responde 503 ("falla cerrado")** en lugar de contar los intentos en la memoria de cada instancia. Con varias instancias, un contador por instancia multiplica los intentos permitidos y debilita la protección contra fuerza bruta (EQ-04). El resto del sistema sigue funcionando y lee directo de PostgreSQL. Detalle en `specs/002-seguridad-usuarios/research.md` §R-08.

## ADR-006: Reloj de plazos como tarea programada
- **Contexto:** los plazos del TUPA se cuentan en días hábiles y su vencimiento tiene efectos legales (Ley N.° 27444).
- **Alternativas:** control manual del evaluador.
- **Decisión:** un proceso diario que usa un calendario de feriados y alerta a la jefatura. Como el backend tiene de 2 a N instancias, la tarea se intenta cada hora en todas, pero solo la instancia que obtiene un **bloqueo en PostgreSQL** (pg_try_advisory_lock) la ejecuta, y antes revisa en la tabla ejecuciones_tareas si ya corrió ese día. Así corre **una sola vez al día** y, si esa instancia cae, otra la ejecuta en el siguiente intento. La misma regla se aplica al aviso de vencimiento del ITSE.
- **Consecuencias:** ✅ ningún plazo pasa desapercibido; se comprueba con el escenario EQ-07. ⚠️ el administrador debe mantener actualizado el calendario de feriados (HU16, RF23).

## ADR-007: Seguridad por capas
- **Contexto:** se manejan datos personales (Ley N.° 29733) y decisiones administrativas.
- **Decisión:**
  - OTP para el personal y roles.
  - Antes de presentar una solicitud en línea, el administrado confirma su identidad: el servicio externo valida su RUC y su DNI con la fecha de emisión o su carné de extranjería (y los del representante legal o apoderado, si actúa uno), y el módulo Seguridad envía un código OTP a su celular. En mesa de partes, el personal verifica el documento físico y el sistema comprueba la identidad con el mismo servicio, sin código.
  - **`tokenIdentidad` (funcionalidad 004):** al acertar el código, Seguridad firma un token de 30 minutos con **audiencia propia** (`identidad-administrado`), distinta de la del token del personal: ninguno de los dos sirve en lugar del otro. El token no lleva datos personales; su identificador es el de la verificación. Es de **un solo uso**: sirve para un único expediente, y lo garantiza un índice único sobre `verificacion_id` en la tabla de expedientes (otra solicitud con el mismo permiso responde 409). La identidad se vuelve a enviar con la solicitud y se compara por huellas HMAC con la confirmada.
  - El administrado consulta su trámite solo con su número de expediente **y** su DNI/RUC juntos.
  - **Límite de intentos:** 5 intentos fallidos en 15 minutos, por IP y por número de expediente (o usuario), bloquean temporalmente la consulta, el inicio de sesión o el código OTP. Los contadores se guardan en Redis para que todas las instancias los compartan.
  - TLS 1.3; AES-256 en reposo para DNI/RUC, celular, correo, dirección y documentos adjuntos.
  - Registro de auditoría (RF25): cada módulo guarda en su propia tabla quién hizo cada operación importante y cuándo, en la misma transacción que la operación.
  - QR público con datos mínimos.
- **Consecuencias:** ✅ cada rol solo hace lo suyo (por ejemplo, solo caja registra pagos); ✅ nadie presenta un trámite a nombre de otra persona ni adivina expedientes por fuerza bruta; ✅ se sabe quién registró cada pago o decisión. ⚠️ mayor gestión de credenciales y un paso más para el administrado.
## ADR-008: PostgreSQL con réplica síncrona y Patroni
- **Contexto:** ADR-005 pide una réplica con conmutación automática, y el escenario EQ-03 exige recuperarse en 5 minutos o menos **sin perder pagos ya registrados**. La base de datos es única (RC09) y guarda pagos y decisiones con efecto legal. RC10 permite la nube o el centro de datos municipal, así que la solución no puede depender de un solo proveedor.
- **Alternativas:**
  1. **Servicio administrado de la nube** (por ejemplo, RDS Multi-AZ o Cloud SQL): conmutación sin operar nada, pero ata el sistema a un proveedor y no sirve si se despliega en el centro de datos municipal.
  2. **Réplica con conmutación manual:** simple, pero alguien debe estar disponible para promoverla y el tiempo de recuperación depende de esa persona.
  3. **repmgr:** automatiza la conmutación, pero tiene menos protección contra tener dos primarias a la vez (*split-brain*).
  4. **Patroni con un almacén de consenso (etcd):** software libre, igual en la nube o en el centro de datos municipal.
- **Decisión:** PostgreSQL 16 con una **primaria y una réplica síncrona** (`synchronous_commit = on`): un pago se confirma solo cuando ya está escrito en las dos. **Patroni** vigila ambos nodos y, si cae la primaria, promueve la réplica usando **etcd** (3 nodos) para que nunca haya dos primarias. **PgBouncer** reparte las conexiones de las N instancias de la API y siempre apunta a la primaria vigente. En el desarrollo local sigue habiendo una sola base (Docker Compose); Patroni se monta en el entorno de despliegue (funcionalidad 010). Si se despliega en una nube con PostgreSQL administrado y alta disponibilidad, ese servicio puede reemplazar a Patroni sin cambiar el código.
- **Consecuencias:** ✅ cae la primaria y el trámite sigue en segundos, sin perder pagos confirmados (EQ-03); ✅ el mismo diseño sirve en la nube y en el centro de datos municipal; ✅ el código no cambia: la API solo conoce la dirección de PgBouncer. ⚠️ cada escritura espera a la réplica, así que es algo más lenta (milisegundos dentro del mismo centro de datos); ⚠️ si cae la réplica, las escrituras se detienen hasta que vuelva o se desactive el modo síncrono, y ese procedimiento debe quedar documentado; ⚠️ etcd agrega 3 nodos más que operar.

- **Implementación (007, 2026-11-22):** el despliegue del curso es un solo droplet de 2 GB, así que la réplica síncrona con Patroni **no se puso en marcha**: necesita al menos dos nodos de base de datos más etcd, y en un solo servidor no da alta disponibilidad. Lo que sí quedó hecho:
  - **PgBouncer** en modo transacción entre las dos réplicas de la API y PostgreSQL. La API ya solo conoce la dirección de PgBouncer, así que pasar a Patroni no cambia el código.
  - **Respaldo diario** de la base (`pg_dump` comprimido) y de los documentos, con 7 días de retención.
  - **Restauración documentada** que compara los conteos de expedientes, pagos, licencias y auditorías.
  - **Reinicio automático** de los contenedores.

  EQ-03 se cubre en parte: si cae una réplica de la API, la otra sigue atendiendo. Si cae la base, se recupera desde el último respaldo; los pagos de ese día se reconcilian a mano. **Siguiente paso:** dos servidores de base de datos con Patroni y etcd (o PostgreSQL administrado con alta disponibilidad) y copias de los respaldos fuera del servidor. Detalle en `docs/07-despliegue/`.

## ADR-009: Portal web como SPA en React + Vite
- **Contexto:** RC07 pide una aplicación web responsive que se use en computadora y celular (el inspector la usa desde su celular), y RC08 exige que el frontend y el backend se comuniquen solo por una API REST. El portal tiene dos públicos: el administrado, sin cuenta, y el personal municipal con sus roles. Debe aguantar las campañas de 1,000 a 10,000 usuarios (DA02) y la Fase 2 (chatbot) usará la misma API (DA08).
- **Alternativas:**
  1. **Páginas generadas en el servidor** (plantillas o Next.js): mejor posicionamiento en buscadores, pero obliga a operar otro servidor de Node.js que también hay que escalar, y no hace falta: el sistema no vive de los buscadores.
  2. **Angular:** completo y del mismo lenguaje que NestJS, pero más pesado para celulares de gama baja y con una curva de aprendizaje mayor.
  3. **Aplicación móvil nativa:** obligaría a mantener tres aplicaciones (Android, iOS y web) y a pasar por las tiendas.
  4. **SPA en React + TypeScript con Vite.**
- **Decisión:** una sola **SPA en React + TypeScript**, compilada con **Vite** a archivos estáticos y servida por **nginx**, que además reenvía `/api/` a la API (mismo origen, sin CORS). El portal **no contiene reglas del TUPA**: las tasas, requisitos y plazos llegan del backend. Sus tipos se **generan desde `openapi.yaml`** (`packages/contracts`), así que si el contrato cambia y el portal no, la compilación falla. Las rutas del personal se protegen según sus roles, y el token de acceso vive solo en memoria (ADR-007).
- **Consecuencias:** ✅ los archivos estáticos se cachean en la CDN y casi no cargan al servidor en un pico (DA02); ✅ el portal y la API no pueden desalinearse sin que el CI lo detecte; ✅ la Fase 2 usa la misma API sin tocar el portal (DA08); ✅ Lighthouse móvil con 100 en accesibilidad en las funcionalidades 001 y 002. ⚠️ el contenido no se indexa bien en buscadores (no es un objetivo del sistema); ⚠️ la primera carga descarga el JavaScript del portal, por eso se divide por rutas y se cachea por años con nombres con hash.

## ADR-010: Cloudflare para DNS, CDN y borde TLS
- **Contexto:** el criterio 10 del proyecto pide dominio o subdominio, DNS y CDN. Los administrados entran desde todo el país y desde celulares con conexiones lentas; el portal es estático (ADR-009). ADR-007 exige TLS 1.3, y el servidor de origen debe quedar protegido de ataques de denegación de servicio, sobre todo en campañas (DA02, DA06). RC10 permite la nube o el centro de datos municipal, y el equipo de TI es pequeño (DA07).
- **Alternativas:**
  1. **DNS del proveedor de dominio, sin CDN:** simple, pero todo el tráfico llega al origen y no hay protección en el borde.
  2. **CDN del proveedor de nube** (por ejemplo, CloudFront o Cloud CDN): muy buena, pero ata el sistema a esa nube y no encaja si se despliega en el centro de datos municipal.
  3. **Cloudflare (plan gratuito):** DNS, CDN, TLS y protección básica, independiente de dónde esté el origen.
- **Decisión:** el subdominio que entregue la Municipalidad (o, si no se obtiene durante el curso, un dominio propio de bajo costo) delega su DNS a **Cloudflare**. Registros con proxy: el portal, `api.` solo si la API se separa, y `status.` para Uptime Kuma. La **CDN** cachea `/assets/` (nombres con hash, `Cache-Control` de un año) y **nunca** cachea `/api/` ni `index.html`. El **TLS** usa modo **"Full (strict)"**: TLS 1.3 entre el ciudadano y Cloudflare, y entre Cloudflare y nginx con un certificado válido de **Let's Encrypt**; se comprueba con testssl.sh (EQ-04). El firewall del origen solo acepta conexiones desde los rangos de Cloudflare, y la API ya toma la IP real del ciudadano de la cabecera del proxy (`TRUST_PROXY_SALTOS`) para los límites de intentos.
- **Consecuencias:** ✅ el portal carga rápido en todo el país y los picos de archivos estáticos no llegan al servidor (DA02); ✅ TLS 1.3 y certificados renovados sin intervención; ✅ protección básica contra denegación de servicio y el origen queda oculto (DA03, DA06); ✅ funciona igual con el origen en la nube o en el centro de datos municipal. ⚠️ Cloudflare ve el tráfico descifrado en su borde: es un encargado de tratamiento de datos que debe declararse según la Ley N.° 29733, o se puede usar solo para DNS y archivos estáticos si la Municipalidad lo exige; ⚠️ hay que contar un salto más de proxy en `TRUST_PROXY_SALTOS` para no tomar la IP de Cloudflare como la del ciudadano; ⚠️ depende de un servicio externo, así que el DNS debe tener una alternativa documentada.
- **Implementación (007, 2026-11-22):** no hay dominio propio todavía. La dirección pública es `https://164-90-143-165.sslip.io` (sslip.io resuelve a la IP incluida en el nombre). **Caddy** obtiene y renueva solo el certificado de Let's Encrypt, ofrece **solo TLS 1.3** (principio VII) y cumple la parte de caché que esta decisión asignaba a la CDN:
  - `/assets/` con `Cache-Control` de un año e `immutable`;
  - `index.html` sin caché;
  - `/api/` con las cabeceras de cada respuesta;
  - compresión zstd/gzip.

  Quedan **pendientes** por no tener dominio: el DNS delegado a Cloudflare con proxy, la CDN, el modo Full (strict) y el origen restringido a los rangos de Cloudflare. El paso a paso está en `docs/07-despliegue/dominio-cloudflare.md`; el cambio en el servidor es la variable `DOMINIO` y `TRUST_PROXY_SALTOS=2`. Mientras tanto, el origen se protege con ufw y el cortafuegos de DigitalOcean: solo los puertos 22, 80 y 443.

## ADR-011: Proveedor externo de IA para el chat de orientación
- **Contexto:** la funcionalidad 012 agrega un chat "Pregúntanos" en las páginas públicas para que el administrado pregunte con sus palabras sobre licencias de funcionamiento (enmienda 1.1.0 de la constitución). Entender preguntas libres en español exige un modelo de lenguaje, que el equipo no puede entrenar ni alojar. Las respuestas no pueden inventar tasas, plazos ni requisitos (ADR-002: el catálogo es la fuente), y los datos personales no pueden salir del sistema (ADR-007, Ley N.° 29733). No hay presupuesto para un servicio pagado durante el curso. Nota: la decisión se pidió como "ADR-008", pero ese número ya era el de PostgreSQL con Patroni.
- **Alternativas:**
  1. **Solo el asistente de ruta (sin chat):** no entiende preguntas libres; ya existe y se sigue ofreciendo.
  2. **Modelo propio alojado en el servidor:** sin dependencia externa, pero el VPS de 2 GB no lo soporta y su calidad en español sería baja.
  3. **SDK de un proveedor concreto:** más rápido de empezar, pero ata el código a ese proveedor y agrega una dependencia.
  4. **Servicio externo con formato compatible con OpenAI, llamado con `fetch`:** cambia de proveedor o de modelo solo con variables de entorno.
- **Decisión:** alternativa 4. Por defecto, **Groq** con el modelo **`openai/gpt-oss-120b`** en su nivel gratuito (`ORIENTACION_API_URL`, `ORIENTACION_MODELO`, `ORIENTACION_API_KEY`). El módulo `orientacion` lo llama **solo desde el backend**, con `fetch` nativo, un tiempo máximo de 15 s (`AbortSignal.timeout`) y sin reintentos ni SDK. **Qué sale hacia el proveedor:** la pregunta y las anteriores de la conversación **sin datos personales** (DNI, RUC, celular, carné de extranjería y correo se reemplazan por "[dato personal]") y un contexto público acotado (la tabla de licencias vigentes, hasta 2 recetas con sus requisitos y hasta 4 temas de la guía). **Qué nunca sale:** datos de expedientes, pagos o personas, la IP, identificadores internos y la clave. La respuesta se valida: si menciona un monto o un plazo que no está en el contexto, se muestra "No tengo esa información"; los enlaces los arma el sistema. La clave vive solo en `infra/.env` (no se sube al repositorio), nunca en el código, en `.env.example`, en los registros ni en las pruebas.
- **Consecuencias:** ✅ el administrado pregunta con sus palabras y recibe datos del catálogo vigente (EQ-06); ✅ cambiar de proveedor compatible o de modelo es cambiar variables; ✅ los datos personales no salen del sistema y las pruebas no usan el proveedor real (EQ-04). ⚠️ El servicio es externo y gratuito: puede fallar, cambiar sus límites o sus condiciones; por eso el chat responde "no disponible" y ofrece el asistente, y el resto del sistema no depende de él (EQ-03). ⚠️ El proveedor recibe preguntas de ciudadanos (sin datos personales): la Municipalidad debe aprobar su uso en producción; sin clave, el chat queda desactivado. ⚠️ La calidad de las respuestas depende del modelo: se mide con el escenario **EQ-08** y un conjunto de preguntas de prueba.

## ADR-012: Adopción de CoreUI para el diseño del portal
- **Contexto:** la funcionalidad 013 pide un área de administración para el personal (menú lateral por rol, barra con el usuario, migas de pan) y un portal ligero para el ciudadano, con un estilo consistente en formularios, tablas, avisos y paginación, y modo claro u oscuro. El portal ya es una SPA en React (ADR-009) con estilos propios en `global.css`. La constitución exige accesibilidad a 360 px (EQ-05), no depender de recursos externos y una CSP estricta (`script-src 'self'; style-src 'self'`, ADR-007). La línea base de Lighthouse antes del cambio era de 97 a 99 en rendimiento y 100 en accesibilidad.
- **Alternativas:**
  1. **Seguir con CSS propio:** sin dependencias, pero cada componente (menú lateral, desplegables, insignias, tablas adaptables, modo oscuro) habría que construirlo y mantenerlo a mano.
  2. **La plantilla completa de CoreUI (Redux, `react-router-dom`, Chart.js, simplebar) o su CSS precompilado:** rápida de mostrar, pero trae dependencias que el portal no usa, mucho más peso y los colores de la plantilla.
  3. **Otra biblioteca de componentes (por ejemplo, con CSS en JavaScript):** necesita estilos en línea, que la CSP prohíbe.
  4. **CoreUI 5 (`@coreui/react` y el Sass de `@coreui/coreui`) importado por partes, con un tema propio:** los componentes que hacen falta, con su accesibilidad y su modo oscuro, solo lo usado y sin estilos en línea.
- **Decisión:** alternativa 4.
  - **Versiones fijas, sin `^`:** `@coreui/react` 5.13.1, `@coreui/coreui` 5.9.1, `@coreui/icons-react` 2.3.0 y `sass` 1.107.1 (desarrollo). No son las últimas: al decidir, `@coreui/react` 5.14.0 y `@coreui/coreui` 5.10.0 tenían dos días publicadas, y por seguridad de la cadena de suministro se eligieron versiones con más de dos semanas. `@popperjs/core` 2.11.8 entra como dependencia de los desplegables y queda fijo en `package-lock.json`. Licencia **MIT** en los tres paquetes.
  - **Sass por partes con tema propio** (`apps/web/src/estilos/tema.scss`): solo los módulos usados (reboot, formularios, botones, desplegable, tarjetas, insignias, avisos, tablas, paginación, barra y pie) y una API de utilidades acotada; el menú lateral y las migas van en `tema-personal.scss`, que se carga con el área del personal (`React.lazy`), no en el portal público. Los colores son los de la Municipalidad: primario `#0b5394` y foco `#f2a900`, no los de la plantilla. Las clases propias de las pantallas toman el aspecto de CoreUI con `@extend` (`_puente.scss`), sin reescribir cada pantalla.
  - **Excluidos:** Redux, `react-router-dom` (el portal usa `react-router` 7), Chart.js (los gráficos siguen siendo SVG propios), simplebar y `@coreui/icons` (los pocos íconos son trazos propios).
  - **Modo claro u oscuro:** un botón alterna entre los dos. La elección se guarda en el navegador y se aplica con `data-coreui-theme` en `<html>` antes de montar React. Sin elección, el CSS sigue a `prefers-color-scheme` desde el primer pintado, sin JavaScript (el bloque oscuro se emite también bajo esa media query). En oscuro, el primario como texto usa un tinte claro (`#9dbad4`) para el contraste.
  - **CSP sin cambios:** no hay scripts ni estilos en línea, ni fuentes o recursos de otros dominios.
- **Consecuencias:** ✅ el personal tiene un área de administración con menú por rol, plegable en el celular, y el ciudadano un portal ligero; ✅ formularios, tablas, avisos, insignias y paginación se ven igual en todo el portal, en claro y en oscuro; ✅ las rutas, la sesión, los roles, el contrato de la API y el backend no cambian; ✅ la accesibilidad medida se mantiene en ambos modos (ver `docs/08-sprint-2/evidencias/diseno-013/despues.md`). ⚠️ El CSS del portal público pasa de 17 KB a 125 KB sin comprimir (de 5.4 a 19.8 KB con gzip) y el JS crece unos 5 KB con gzip; el área del personal descarga además 15.6 KB de JS y 6.1 KB de CSS. El rendimiento medido (Lighthouse móvil) sube 1 punto en la portada, queda igual en el asistente y la consulta, y baja 1 en el ingreso y 2 en la bandeja y el tablero frente a la línea base (`despues.md`). ⚠️ Con una elección de modo contraria al dispositivo, el primer cuadro sale en el modo del dispositivo antes de que corra el módulo (un destello del fondo); evitarlo exige un script externo en `<head>` (plan B de research R-05), pendiente de aprobación. ⚠️ Actualizar CoreUI es una decisión explícita: las versiones fijas y el Sass por partes pueden necesitar ajustes en el tema y en el puente.
