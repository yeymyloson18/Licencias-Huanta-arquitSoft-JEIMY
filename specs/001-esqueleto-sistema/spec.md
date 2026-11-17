# Especificación de funcionalidad: Esqueleto del sistema

**Rama de la funcionalidad**: `001-esqueleto-sistema`

**Creada**: 2026-11-16

**Estado**: Borrador

**Entrada**: Descripción de la usuaria: "Usa como entrada el archivo docs/sdd/001-esqueleto-specify.md" (Funcionalidad 001: Esqueleto del sistema. Como desarrolladora necesito una base del proyecto que se levante con un solo comando, para construir encima los 9 módulos sin volver a configurar nada.)

**Cubre**: criterios 3, 12 y 14 del plan de trabajo; escenarios de calidad EQ-03 (disponibilidad) y EQ-06 (mantenibilidad).

## Aclaraciones

### Sesión 2026-11-16

- P: Cuando solo falla la caché y la base de datos funciona, ¿qué responde el chequeo de salud al balanceador? → R: 200 con estado `DEGRADADO`; solo la caída de la base de datos responde 503 con `CAIDO` (ADR-005).
- P: ¿Cada pull request incluye la validación del contrato OpenAPI como quinta verificación? → R: Sí; son 5 verificaciones: compilación, pruebas, cobertura, regla de dependencia y validación del contrato (archivo `openapi.yaml` válido y respuestas que lo cumplen).
- P: ¿Los datos semilla del TUPA se cargan también en producción o solo en desarrollo y pruebas? → R: Catálogo y roles se cargan con migraciones versionadas en todos los entornos, incluida producción; los datos ficticios de prueba, si se necesitan, van en un paso aparte solo para desarrollo.
- P: ¿Se configura en GitHub la protección de `main` para impedir fusionar con CI en rojo o hacer push directo? → R: Sí; se exigen las 5 verificaciones en verde y se prohíbe el push directo a `main`; la configuración queda documentada en el README.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Levantar el sistema completo con un solo comando (Prioridad: P1)

Una persona del equipo (o cualquier persona que clone el repositorio) sigue el README y, con un solo
comando, pone en marcha la base de datos, la caché, el backend y el portal web en su computadora, sin
pedir secretos a nadie ni configurar nada a mano.

**Por qué esta prioridad**: sin una base que arranque de forma repetible no se puede construir ni
probar ninguno de los 9 módulos; es el cimiento de todo lo demás.

**Prueba independiente**: en una computadora limpia que solo tenga las herramientas listadas como
requisito en el README, clonar el repositorio, ejecutar el comando indicado y comprobar que los cuatro
componentes quedan en funcionamiento.

**Escenarios de aceptación**:

1. **Dado** un repositorio recién clonado y las herramientas previas instaladas, **cuando** la persona
   ejecuta el comando único descrito en el README, **entonces** la base de datos, la caché, el backend
   y el portal web quedan en funcionamiento sin pasos manuales adicionales.
2. **Dado** un repositorio recién clonado, **cuando** la persona revisa los archivos de configuración,
   **entonces** solo encuentra valores de ejemplo claramente marcados como tales y ningún secreto real
   (claves, contraseñas o tokens de producción).
3. **Dado** que el sistema ya se levantó una vez, **cuando** la persona lo detiene y lo vuelve a
   levantar con el mismo comando, **entonces** arranca de nuevo sin errores y sin duplicar los datos
   semilla.

---

### Historia de usuario 2 - Chequeo de salud para el balanceador y el monitoreo (Prioridad: P1)

El balanceador y la herramienta de monitoreo de disponibilidad consultan periódicamente al backend
para saber si la instancia está sana. El backend responde indicando el estado de la base de datos y
de la caché, para que el balanceador deje de enviar tráfico a una instancia que no puede atender
(EQ-03).

**Por qué esta prioridad**: es la base del escenario EQ-03; sin este chequeo no se puede retirar
automáticamente una instancia caída ni medir la disponibilidad mensual.

**Prueba independiente**: con el sistema levantado, consultar el chequeo de salud; luego detener la
caché y consultar de nuevo; luego detener la base de datos y consultar de nuevo, verificando la
respuesta en cada caso.

**Escenarios de aceptación**:

1. **Dado** que la base de datos y la caché funcionan, **cuando** se consulta el chequeo de salud,
   **entonces** responde con éxito, estado general `OK` y ambas dependencias en `OK`.
2. **Dado** que la caché no responde pero la base de datos sí, **cuando** se consulta el chequeo de
   salud, **entonces** responde con éxito, estado general `DEGRADADO`, base de datos `OK` y caché
   `CAIDO` (la instancia sigue atendiendo, ADR-005).
3. **Dado** que la base de datos no responde, **cuando** se consulta el chequeo de salud, **entonces**
   responde con un código de servicio no disponible, estado general `CAIDO` y base de datos `CAIDO`,
   de modo que el balanceador retira la instancia.
4. **Dado** cualquier estado, **cuando** se consulta el chequeo de salud, **entonces** la respuesta
   cumple exactamente el esquema `Salud` del contrato OpenAPI y no requiere iniciar sesión.

---

### Historia de usuario 3 - Ver el catálogo de licencias en el portal desde el celular (Prioridad: P2)

Un administrado abre el portal web desde su celular y ve una página de inicio con la lista de las 9
licencias de funcionamiento del TUPA 2024, con su nombre, tasa y plazo, obtenidas del backend.

**Por qué esta prioridad**: demuestra de punta a punta que portal, backend, base de datos y datos
semilla están conectados correctamente; es la primera pieza visible para la Municipalidad.

**Prueba independiente**: con el sistema levantado, abrir el portal en una pantalla de celular y
comprobar que aparecen las 9 licencias con los datos de `docs/05-modelo-de-datos/datos-semilla.sql`.

**Escenarios de aceptación**:

1. **Dado** que la base de datos se creó con los datos semilla, **cuando** un visitante abre la página
   de inicio, **entonces** ve las 9 licencias (LIC-01 a LIC-09) con su nombre, tasa en soles y plazo.
2. **Dado** una pantalla de celular de 360 px de ancho, **cuando** se abre la página de inicio,
   **entonces** todo el contenido se lee sin desplazamiento horizontal ni ampliar la pantalla.
3. **Dado** que el backend no responde, **cuando** un visitante abre la página de inicio, **entonces**
   ve un mensaje comprensible indicando que el catálogo no está disponible por el momento, en lugar
   de una página en blanco o un error técnico.
4. **Dado** que se cambia la tasa de una licencia directamente en los datos del catálogo, **cuando** se
   vuelve a cargar la página (pasado el tiempo de caché), **entonces** se muestra la nueva tasa sin
   haber modificado ninguna línea de código (EQ-06).

---

### Historia de usuario 4 - Estructura de módulos y verificación automática en cada pull request (Prioridad: P2)

El equipo de desarrollo encuentra ya creada la estructura vacía de los 9 módulos, cada uno con sus 4
capas, y cada pull request ejecuta automáticamente la compilación, las pruebas, la cobertura, la
verificación de la regla de dependencia y la validación del contrato OpenAPI, bloqueando la fusión si
algo falla (EQ-06).

**Por qué esta prioridad**: garantiza desde el primer día que la arquitectura de la constitución se
respete; corregirla después sería mucho más costoso.

**Prueba independiente**: abrir un pull request de prueba que introduce a propósito una importación
prohibida (por ejemplo, el dominio de un módulo importando una librería externa o el interior de otro
módulo) y comprobar que la verificación automática falla; luego revertirla y comprobar que pasa.

**Escenarios de aceptación**:

1. **Dado** el repositorio, **cuando** se revisa la carpeta de módulos, **entonces** existen los 9
   módulos de la constitución (Seguridad y Usuarios, Catálogo y Asistente de ruta, Trámites, Pagos en
   caja, Inspecciones, Licencias, Reloj de plazos, Notificaciones y Reportes), cada uno con las capas
   `dominio`, `aplicacion`, `infraestructura` y `presentacion`.
2. **Dado** un pull request sin violaciones, **cuando** se abre, **entonces** la verificación
   automática ejecuta compilación estricta, pruebas, cobertura, regla de dependencia y validación del
   contrato OpenAPI, y termina en verde.
3. **Dado** un pull request donde un archivo de `dominio` importa una librería externa o donde un
   módulo importa el interior de otro, **cuando** se abre, **entonces** la verificación automática
   falla e indica el archivo y la regla incumplida.
4. **Dado** un pull request que hace bajar la cobertura de `dominio` o `aplicacion` por debajo del
   80 %, **cuando** se abre, **entonces** la verificación automática falla.
5. **Dado** un pull request con un error de compilación o una prueba fallida, **cuando** se abre,
   **entonces** la verificación automática falla y el repositorio no permite fusionarlo.
6. **Dado** una persona con permiso de escritura, **cuando** intenta hacer push directo a `main`,
   **entonces** el repositorio lo rechaza.

---

### Casos límite

- La base de datos tarda en arrancar más que el backend: el backend no debe quedar inutilizable; el
  chequeo de salud informa `CAIDO` hasta que la base esté lista y luego pasa a `OK` sin reiniciar.
- La caché se cae y vuelve: el chequeo de salud pasa de `DEGRADADO` a `OK` sin reiniciar el backend.
- Una dependencia no responde (se queda colgada en lugar de fallar): el chequeo de salud debe
  responder de todos modos en pocos segundos, marcando esa dependencia como `CAIDO`.
- Se levanta el sistema sobre datos ya existentes: la creación del esquema y la carga de semillas no
  falla ni duplica registros (cada migración se aplica una sola vez).
- Un entorno de producción nuevo recibe el catálogo completo del TUPA al aplicar las migraciones, sin
  pasos manuales, y nunca recibe datos ficticios de prueba.
- Un puerto necesario ya está ocupado en la computadora: el README indica cómo cambiarlo mediante la
  configuración de ejemplo.
- El catálogo responde vacío (por ejemplo, si no se cargaron las semillas): el portal muestra un
  mensaje claro en lugar de una lista vacía sin explicación.
- Las carpetas de módulos vacías no deben hacer fallar la compilación ni la cobertura (la cobertura
  se mide sobre el código existente).

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Arranque y configuración**

- **FR-001**: El sistema DEBE poder levantarse completo (base de datos, caché, backend y portal web)
  con un único comando documentado en el README.
- **FR-002**: El README DEBE indicar las herramientas previas necesarias, el comando de arranque, cómo
  verificar que todo funciona (chequeo de salud y página de inicio), cómo detener el sistema y cómo
  ejecutar las pruebas.
- **FR-003**: El repositorio NO DEBE contener secretos reales; toda configuración sensible DEBE
  tomarse de variables de entorno, con un archivo de ejemplo que contenga solo valores ficticios para
  desarrollo local.
- **FR-004**: Levantar el sistema de nuevo sobre datos existentes NO DEBE fallar ni duplicar datos.

**Base de datos y datos semilla**

- **FR-005**: Al levantar el sistema, la base de datos DEBE crearse con el esquema de
  `docs/05-modelo-de-datos/esquema.sql` (un esquema por módulo) mediante migraciones versionadas.
- **FR-006**: La base de datos DEBE cargarse con los datos semilla de
  `docs/05-modelo-de-datos/datos-semilla.sql`, de modo que el catálogo contenga las 9 licencias
  (LIC-01 a LIC-09), los trámites conectados, sus requisitos y los roles. Estos datos de referencia
  DEBEN cargarse mediante migraciones versionadas que se aplican igual en todos los entornos,
  incluida producción.
- **FR-006a**: Los datos ficticios de prueba, si se necesitan, DEBEN cargarse en un paso separado que
  solo se ejecuta en desarrollo y pruebas, y que nunca se aplica en producción.

**Chequeo de salud (EQ-03)**

- **FR-007**: El backend DEBE exponer el chequeo de salud público definido en el contrato OpenAPI
  (`GET /salud`, esquema `Salud`), sin requerir inicio de sesión.
- **FR-008**: El chequeo de salud DEBE comprobar en cada consulta que la base de datos y la caché
  responden, e informar `OK` o `CAIDO` para cada una.
- **FR-009**: El estado general DEBE ser `OK` si ambas dependencias funcionan (respuesta exitosa),
  `DEGRADADO` si solo falla la caché (respuesta 200, la instancia sigue recibiendo tráfico) y `CAIDO`
  si falla la base de datos (respuesta 503).
- **FR-010**: El chequeo de salud DEBE responder en un tiempo acotado aunque una dependencia no
  conteste, considerándola `CAIDO` si supera ese tiempo.
- **FR-011**: La respuesta del chequeo de salud NO DEBE revelar datos de conexión, credenciales ni
  detalles internos del error.

**Catálogo en el portal**

- **FR-012**: El backend DEBE exponer la lista pública de recetas del catálogo según el contrato
  OpenAPI (`GET /catalogo/recetas`, esquema `RecetaResumen`), incluido el filtro por tipo.
- **FR-013**: El portal web DEBE mostrar una página de inicio que obtenga el catálogo del backend y
  liste las licencias con su nombre, tasa en soles y plazo en días hábiles.
- **FR-014**: La página de inicio DEBE ser legible y usable en una pantalla de celular de 360 px de
  ancho, sin desplazamiento horizontal.
- **FR-015**: Si el backend no responde o el catálogo llega vacío, la página de inicio DEBE mostrar un
  mensaje comprensible para el administrado.
- **FR-016**: Los datos mostrados (nombre, tasa, plazo) DEBEN provenir del catálogo almacenado y nunca
  estar escritos en el código del portal ni del backend (ADR-002, EQ-06).

**Estructura de módulos y verificación automática (EQ-06)**

- **FR-017**: DEBE existir la estructura de los 9 módulos de la constitución, cada uno con las capas
  `dominio`, `aplicacion`, `infraestructura` y `presentacion`.
- **FR-018**: La regla de dependencia DEBE estar declarada y verificarse automáticamente: `dominio` no
  importa nada externo ni de otras capas, las dependencias apuntan hacia el dominio y ningún módulo
  importa el interior de otro (solo su fachada pública).
- **FR-019**: Cada pull request DEBE ejecutar automáticamente 5 verificaciones: compilación estricta,
  pruebas unitarias y de integración, medición de cobertura con umbral de 80 % en `dominio` y
  `aplicacion`, verificación de la regla de dependencia y validación del contrato OpenAPI (el archivo
  `docs/06-contrato-api/openapi.yaml` es válido). Si cualquier paso falla, el pull request DEBE quedar
  marcado como fallido.
- **FR-019a**: La rama `main` DEBE estar protegida en el repositorio remoto: solo admite cambios
  mediante pull request, exige que las 5 verificaciones de FR-019 estén en verde antes de fusionar y
  rechaza el push directo. El README DEBE documentar esta configuración.
- **FR-020**: Las pruebas de integración del chequeo de salud y del catálogo DEBEN validar las
  respuestas contra el contrato OpenAPI.

### Entidades clave

- **Receta (licencia o trámite conectado)**: entrada del catálogo del TUPA 2024 con código (por
  ejemplo LIC-01), nombre, tipo (licencia o trámite conectado), ruta, tasa en soles y plazo en días
  hábiles. En esta funcionalidad solo se lee.
- **Estado de salud**: resultado del chequeo con estado general (`OK`, `DEGRADADO`, `CAIDO`), estado
  de la base de datos, estado de la caché y versión del servicio. No se almacena.
- **Módulo**: cada una de las 9 unidades de la constitución, con sus 4 capas; en esta funcionalidad
  solo existe su estructura vacía (salvo lo mínimo que necesiten el catálogo y el chequeo de salud).

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Una persona que no participó en el proyecto levanta el sistema completo siguiendo solo
  el README, con un único comando de arranque, en menos de 15 minutos (sin contar descargas iniciales).
- **SC-002**: El 100 % de los archivos del repositorio pasa una revisión de secretos sin hallazgos de
  credenciales reales.
- **SC-003**: El chequeo de salud refleja correctamente el estado en los 3 casos (todo sano, caché
  caída, base caída) y responde en menos de 3 segundos aun cuando una dependencia no contesta.
- **SC-004**: Tras detener la instancia de base de datos, el chequeo de salud informa la caída en la
  siguiente consulta, permitiendo que el balanceador y el monitoreo la detecten en su siguiente ciclo
  (cada minuto, según EQ-03).
- **SC-005**: La página de inicio muestra las 9 licencias del TUPA 2024 con tasas y plazos idénticos a
  los datos semilla, y carga en menos de 3 segundos en una conexión móvil típica.
- **SC-006**: La página de inicio obtiene una puntuación de accesibilidad y de vista móvil de al menos
  90 en una auditoría con la herramienta indicada para EQ-05.
- **SC-007**: El 100 % de los pull requests ejecuta automáticamente las 5 verificaciones (compilación,
  pruebas, cobertura, regla de dependencia y validación del contrato); un pull request con una
  violación intencional de la regla de dependencia, o con un contrato OpenAPI inválido, falla en el
  100 % de los intentos.
- **SC-008**: Cambiar la tasa de una licencia en el catálogo se refleja en el portal sin modificar
  ninguna línea de código (medida de EQ-06).
- **SC-009**: Las 9 carpetas de módulos con sus 4 capas existen y coinciden al 100 % con los nombres
  definidos en la constitución.

## Supuestos

- La "única instancia" de cada componente basta para el desarrollo local; la réplica de base de datos
  con conmutación automática, el balanceador con varias instancias y el monitoreo de disponibilidad
  mensual se configurarán en una funcionalidad de despliegue posterior. Esta funcionalidad solo
  entrega el chequeo de salud que esos componentes usarán.
- Una caída solo de la caché produce `DEGRADADO` con respuesta 200 y una caída de la base de datos
  produce `CAIDO` con respuesta 503, conforme a ADR-005 (ver Aclaraciones). El texto del 503 en el
  contrato ("alguna dependencia falla") se interpreta como "la base de datos falla".
- La página de inicio lista solo las recetas de tipo licencia (las 9); los trámites conectados quedan
  cargados en la base pero no se muestran todavía.
- La caché de la lista del catálogo dura como máximo 5 minutos (`Cache-Control: public, max-age=300`
  del contrato); un cambio de tasa se ve después de ese tiempo.
- La tecnología a usar es la fijada por la constitución (sección "Restricciones tecnológicas y de
  alcance"); esta especificación no la repite.
- El plan de trabajo (criterios 3, 12 y 14) no está en el repositorio; se toma como fuente lo descrito
  en la entrada `docs/sdd/001-esqueleto-specify.md`.
- La cobertura mínima del 80 % se aplica sobre el código que exista en `dominio` y `aplicacion`; las
  carpetas vacías no cuentan.
- No se manejan datos personales en esta funcionalidad; aun así, ni el chequeo de salud ni los logs
  incluirán datos de conexión ni información sensible (principio VII).

## Fuera de alcance

- Inicio de sesión, OTP y roles del personal.
- Presentación de trámites, esquelas, pagos, inspecciones, licencias, plazos, notificaciones y reportes.
- Cualquier regla de negocio del TUPA (asistente de ruta, cálculo de tasas, validación de requisitos).
- Detalle de una receta, edición del catálogo y página del QR.
- Despliegue en producción, réplica de base de datos, balanceador y monitoreo (solo se deja listo el
  chequeo de salud que usarán).
