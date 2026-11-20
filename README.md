# Sistema de Trámite de Licencias de Funcionamiento – Municipalidad Provincial de Huanta

## Estudiante: Sulca Ccorimanya, Jeimy Gregori – Código 27190105

## Descripción

Sistema web que guía al administrado para obtener su licencia de funcionamiento en la
Municipalidad Provincial de Huanta: le dice qué licencia le corresponde, qué documentos presentar,
cuánto pagar y cuánto demora; genera la **esquela de pago** para pagar en la caja municipal,
controla los plazos en días hábiles, registra la inspección ITSE y emite la licencia digital con código QR.

## Idea central: Un motor, nueve recetas

Las nueve licencias del TUPA 2024 siguen casi los mismos pasos. Lo que cambia (requisitos, tasa,
plazo, calificación, orden del ITSE y vigencia) se guarda como **datos en un catálogo de recetas**,
y un único **motor de trámites** sigue la receta que corresponde (ADR-002).

## Cómo levantar el sistema

### Herramientas previas

- [Git](https://git-scm.com/)
- [Docker](https://docs.docker.com/get-docker/) con Docker Compose v2 (Docker Desktop ya lo incluye)
- [Node.js 24 LTS](https://nodejs.org/) con npm, **solo** para ejecutar las pruebas fuera de Docker

### Comando único

Desde la raíz del repositorio:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Levanta PostgreSQL 16, Redis 7, el backend (NestJS) y el portal web. No hace falta crear ningún
archivo ni pedir secretos: la primera vez el backend crea el esquema y carga el catálogo del TUPA
con migraciones versionadas, que se aplican una sola vez.

> **Aviso:** `.env.example` y los valores por defecto de `infra/docker-compose.yml` son
> **ficticios** y solo sirven para desarrollo local. Nunca los use en producción.

### Cómo verificar que funciona

```bash
docker compose -f infra/docker-compose.yml ps   # los 4 servicios en estado "healthy"
curl http://localhost:3000/api/v1/salud         # {"estado":"OK","baseDeDatos":"OK","cache":"OK",...}
```

- Chequeo de salud: <http://localhost:3000/api/v1/salud>
- Portal web: <http://localhost:8080>

También puede ejecutar la prueba de humo, que levanta todo, lo verifica, lo reinicia y comprueba
que los datos no se duplican: `bash infra/prueba-humo.sh`.

Auditoría Lighthouse 12 del portal (<http://localhost:8080>, modo móvil, 17/11/2026):

| Rendimiento | Accesibilidad | Buenas prácticas | SEO |
| ----------- | ------------- | ---------------- | --- |
| 100         | 100           | 100              | 91  |

Para repetirla: `npx lighthouse http://localhost:8080 --form-factor=mobile --view` (el mínimo
exigido es 90 en accesibilidad y en buenas prácticas, SC-006).

Auditoría Lighthouse 12 de las pantallas de seguridad (funcionalidad 002, modo móvil, 18/11/2026,
stack recién clonado y con las cabeceras de seguridad activas):

| Pantalla                               | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
| -------------------------------------- | ----------- | ------------- | ---------------- | --- |
| `/ingresar`                            | 99          | 100           | 96               | 91  |
| `/cambiar-clave` (con clave temporal)  | 99          | 100           | 100              | 91  |
| `/admin/usuarios` (como administrador) | 99          | 100           | 100              | 91  |

El 96 de `/ingresar` se debe a un único aviso: al abrir el portal se llama a `POST /auth/renovar`
para recuperar la sesión, y sin sesión responde 401, que el navegador anota en la consola. El portal
no puede saber antes si existe la cookie porque es `HttpOnly` a propósito (no se lee desde
JavaScript), así que se acepta. Las pantallas con sesión se auditan pasando la cookie
`refresh_personal` con `--extra-headers`.

Escaneo base de OWASP ZAP (`zap-baseline.py`, 18/11/2026) contra el portal: **0 alertas de riesgo
alto o medio** (65 reglas sin hallazgos). El primer escaneo encontró 2 medias (sin
`Content-Security-Policy` y sin protección contra clickjacking) y 5 bajas (cabeceras
`X-Content-Type-Options`, `Permissions-Policy` y `Cross-Origin-*`, y la versión de nginx en
`Server`); se corrigieron con `apps/web/cabeceras-seguridad.conf`, `server_tokens off` y quitando
`X-Powered-By` de la API. Quedan 3 alertas **informativas**, justificadas:

| Alerta (id)                            | Por qué se acepta                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Comentarios sospechosos (10027)        | Es el texto `query` dentro del código minificado de `openapi-fetch`, no un comentario con información interna.                                  |
| Contenido almacenable en caché (10049) | Son los archivos de `/assets/` con hash en el nombre; se guardan en caché a propósito. Las respuestas de la API usan `Cache-Control: no-store`. |
| Aplicación web moderna (10109)         | Solo informa que el portal es una SPA, lo que limita la exploración automática de ZAP.                                                          |

Para repetirlo (el informe `zap-informe.html` no se versiona):
`docker run --rm -t -v "${PWD}:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://host.docker.internal:8080 -r zap-informe.html`.

Tiempos de las tareas del personal (funcionalidad 002), medidos en el navegador sobre un clon limpio
recorriendo el portal con datos ficticios. Incluyen el tiempo de leer el código simulado en Redis:

| Tarea                                                                            | Tiempo | Objetivo |
| -------------------------------------------------------------------------------- | ------ | -------- |
| Iniciar sesión en dos pasos desde que se abre `/ingresar` (SC-001)               | 42 s   | < 1 min  |
| Primer ingreso de un usuario nuevo hasta cambiar la clave y ver el menú (SC-008) | 54 s   | < 2 min  |
| Crear un usuario con dos roles en `/admin/usuarios` (SC-009)                     | 38 s   | < 2 min  |

### Crear el primer administrador

En una instalación nueva no hay usuarios. Con el sistema levantado, cree el primer administrador
(ninguna clave real queda en el repositorio):

```bash
docker compose -f infra/docker-compose.yml exec api npm run crear-administrador
```

El comando pide correo, nombre completo, celular (9 dígitos) y clave (sin mostrarla, dos veces), e
imprime solo el id del usuario creado. Si ya existe un administrador activo, no hace ningún cambio.
El administrador deberá cambiar la clave en su primer ingreso.

> Prefiera el modo interactivo: también acepta las variables `ADMIN_CORREO`, `ADMIN_NOMBRE`,
> `ADMIN_CELULAR` y `ADMIN_CLAVE` (por ejemplo, con `exec -e ...`), pero así la clave queda en el
> historial de la terminal.

### Inicio de sesión del personal (desarrollo)

El personal ingresa en <http://localhost:8080/ingresar> en dos pasos: correo y clave, y luego un
código de 6 dígitos que vale 5 minutos. Mientras no haya proveedor de SMS (`ENVIO_OTP=simulado`),
el código no se envía: se guarda en Redis y en desarrollo se lee con:

```bash
docker compose -f infra/docker-compose.yml exec redis redis-cli GET dev:otp:<usuarioId>
```

El `<usuarioId>` es el que imprime `crear-administrador` (o el que muestra la gestión de usuarios).
Con una clave temporal, el portal lleva a `/cambiar-clave` antes de cualquier otra pantalla. Tras 5
intentos fallidos con el mismo correo o desde la misma IP, el ingreso se bloquea 15 minutos.

El administrador gestiona al personal en <http://localhost:8080/admin/usuarios>: alta con clave
temporal, edición, roles, desactivación y asignación de una clave temporal a quien olvidó la suya.

### Variables de entorno de seguridad

La funcionalidad 002 agrega estas variables (están en `.env.example` y Docker Compose las trae por
defecto):

| Variable              | Para qué sirve                                                                      |
| --------------------- | ----------------------------------------------------------------------------------- |
| `JWT_SECRETO`         | Firma del token de acceso de 15 minutos (al menos 32 bytes)                         |
| `CLAVE_CIFRADO_DATOS` | Clave AES-256-GCM con la que se cifran el correo y el celular (base64, 32 bytes)    |
| `CLAVE_HMAC_DATOS`    | Huella HMAC para buscar por correo sin descifrar y para guardar el código OTP       |
| `ENVIO_OTP`           | `simulado` (desarrollo y pruebas); `sms` queda reservado para cuando haya proveedor |
| `TRUST_PROXY_SALTOS`  | Cuántos proxies hay delante de la API, para conocer la IP real en los límites       |
| `NODE_ENV`            | `production` activa las comprobaciones de arranque descritas abajo                  |

**Por qué no tienen valores reales:** el repositorio es público para el curso y cualquier clave
escrita en él deja de ser secreta. Los valores de `.env.example` son ficticios y dicen
"desarrollo" en su contenido. La API **se niega a arrancar** si una clave es demasiado corta (en
cualquier entorno) o si se pide `ENVIO_OTP=sms` sin proveedor; con `NODE_ENV=production`, además,
si alguna clave es igual a la de ejemplo o si `ENVIO_OTP=simulado`. En producción las
claves reales se entregan como variables del servidor y nunca se suben al repositorio.

### Cómo detenerlo

```bash
docker compose -f infra/docker-compose.yml down      # detiene y conserva los datos
docker compose -f infra/docker-compose.yml down -v   # detiene y borra la base (reinicio desde cero)
```

### Si un puerto ya está ocupado

Los puertos por defecto son 8080 (portal), 3000 (API), 5432 (PostgreSQL) y 6379 (Redis). Para
cambiarlos, copie el archivo de ejemplo a `infra/.env` (Docker Compose lo lee automáticamente) y
edite las variables `PUERTO_*`:

```bash
cp .env.example infra/.env
```

### Cómo ejecutar las pruebas

```bash
npm ci
npm test                    # pruebas unitarias y de integración (requiere PostgreSQL y Redis)
npm run cobertura           # cobertura mínima de 80 % en dominio y aplicacion
npm run regla-dependencia   # regla de dependencia de Clean Architecture
npm run contrato            # validación del contrato OpenAPI
```

Las pruebas de integración usan `DATABASE_URL` y `REDIS_URL` (por defecto, `localhost:5432` y
`localhost:6379`), así que basta con tener levantado el sistema con el comando único.

## Asistente de ruta y catálogo (funcionalidad 003)

- **Asistente "¿Qué licencia necesito?"** (`/asistente`, sin iniciar sesión): hace las preguntas del
  catálogo, una por pantalla, y propone la licencia que corresponde con su tasa, plazo, inspección
  ITSE y requisitos. La propuesta es orientativa: la municipalidad confirma el nivel de riesgo al
  evaluar la solicitud. Si con las respuestas no se puede determinar la licencia (por ejemplo, "No
  lo sé" en el nivel de riesgo), lo dice y sugiere acudir a la Subgerencia. Las respuestas viven en
  la dirección de la página (sobreviven a una recarga) y no se guardan en el servidor.
- **Ficha pública** (`/licencias/<código>`, por ejemplo `/licencias/LIC-03`): cada tarjeta del
  inicio enlaza a la ficha de su licencia. Una receta desactivada responde "Esta licencia no está
  disponible".
- **Edición por el administrador** (`/admin/catalogo`, opción "Catálogo" del menú, solo rol
  ADMINISTRADOR): cambia la tasa, el plazo, la calificación y el ITSE (solo con valores válidos para
  la ruta), la vigencia, el estado activa/desactivada y los requisitos (agregar, quitar, reordenar),
  **sin tocar código**. Un cambio inválido se rechaza completo, con el error junto a cada campo.
  Cada guardado queda registrado en la misma operación: quién, cuándo y los valores antes y
  después (`catalogo.cambio_receta`). Si dos administradores guardan a la vez, queda el último y
  cada guardado tiene su registro.
- **Tiempo máximo de propagación: 5 minutos.** Normalmente el cambio se ve en la siguiente
  consulta, porque al guardar se borra la caché. Si Redis fallara justo en ese momento, el cambio se
  ve como máximo en 5 minutos: 240 s de caché en Redis (`CATALOGO_CACHE_TTL_SEGUNDOS`, la API no
  arranca con más de 240) + 60 s de caché del navegador (`Cache-Control: public, max-age=60`).
- **Requisitos de los trámites conectados**: la migración `0005` carga los requisitos de TRF-01,
  CGI-01 y DUP-01 según el documento 09 (TUPA págs. 384, 390 y 499), que la semilla inicial no traía.

### Resultados de la funcionalidad 003

Auditoría Lighthouse 12 (modo móvil, 18/11/2026, stack recién clonado con su propio nombre de
proyecto de Compose; la pantalla de administración con la cookie `refresh_personal` en
`--extra-headers`, como en la 002):

| Pantalla                                                                   | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
| -------------------------------------------------------------------------- | ----------- | ------------- | ---------------- | --- |
| `/asistente`                                                               | 99          | 100           | 96               | 91  |
| `/asistente?TIPO_ESTABLECIMIENTO=OTRO&ES_CESIONARIO=NO&NIVEL_RIESGO=MEDIO` | 98          | 100           | 96               | 91  |
| `/licencias/LIC-03`                                                        | 99          | 100           | 96               | 91  |
| `/admin/catalogo/LIC-02` (como administrador)                              | 99          | 100           | 100              | 91  |

El 96 tiene la misma causa aceptada en la 002: sin sesión, `POST /auth/renovar` responde 401 y el
navegador lo anota en la consola. Con Chrome sin interfaz y una ventana de 360 px, ninguna página de
la 003 (ni el inicio, ni las de administración) tiene desplazamiento horizontal.

Prueba de carga de EQ-01 / SC-004 con k6 (`tests/carga/eq01-catalogo.js`, `grafana/k6:0.54.0`;
50 % lista, 30 % ficha y 20 % preguntas + propuesta; cada usuario espera de 1 a 3 s entre
consultas). Se ejecutó contra un stack aislado en Docker Desktop, en la misma computadora que k6:
AMD Ryzen 7 5825U (8 núcleos, 16 hilos), 15.3 GB de RAM, Windows 11 (Docker con 16 CPU y 7.4 GB).

| Usuarios virtuales | Duración       | Peticiones | p95 (meta < 2 s) | Errores (meta < 1 %) | Resultado |
| ------------------ | -------------- | ---------- | ---------------- | -------------------- | --------- |
| 100 (humo)         | 2 min + subida | 8,127      | 5.3 ms           | 0 %                  | Cumple    |
| 1,000              | 2 min + subida | 81,108     | 6.4 ms           | 0.01 % (15)          | Cumple    |

Con 1,000 usuarios la API usó cerca de 42 % de CPU y 183 MB de memoria, PostgreSQL casi nada (las
lecturas salen de Redis) y Redis 9 %. Los 15 fallos no dejaron ningún error ni aviso en los registros
de la API ni del portal: se atribuyen a la red de Docker Desktop entre el contenedor de k6 y el
stack. La corrida es concluyente para esta computadora, pero como k6 y el sistema comparten la
máquina, **SC-004 debe confirmarse en el entorno desplegado** con su propia red. Para repetirla:

```bash
docker run --rm -i -e BASE=http://host.docker.internal:3000/api/v1 -e USUARIOS=1000 -e DURACION=2m \
  grafana/k6:0.54.0 run - < tests/carga/eq01-catalogo.js
```

Recorrido de la guía de validación (`specs/003-catalogo-asistente/quickstart.md`, escenarios 1 a 5
y 7) en un clon con su propio nombre de proyecto y puertos, con un administrador ficticio: 24 de 24
comprobaciones de la API correctas. También se comprobó el peor caso: con Redis detenido, guardar
responde 200, la ficha ya muestra el valor nuevo y queda un aviso en el registro. Tiempos medidos en
el navegador:

| Tarea                                                                                        | Tiempo | Objetivo |
| -------------------------------------------------------------------------------------------- | ------ | -------- |
| Desde el inicio hasta ver la licencia propuesta, solo con el teclado (SC-001)                | 69 s   | ≤ 3 min  |
| Desde el menú hasta guardar un cambio de tasa y de un requisito, con un error antes (SC-007) | 52 s   | ≤ 3 min  |

## Solicitud, consulta, mesa de partes y bandeja (funcionalidad 004)

- **Presentar en línea** (botón "Presentar solicitud" en la ficha de cada licencia): la persona
  confirma su identidad (DNI con fecha de emisión o carné de extranjería, RUC y celular; también los
  del representante, si actúa uno) con un código de 6 dígitos y recibe un **permiso de 30 minutos**
  para una sola solicitud. El formulario muestra cuántos minutos quedan y avisa cuando faltan 5.
  Pide los documentos en el orden de la receta (PDF, JPG o PNG reales de hasta 10 MB; el tipo se
  revisa por el contenido) y, al presentar, entrega el comprobante con el número `EXP-AAAA-NNNNNN`.
  Enviar la misma solicitud varias veces crea un solo expediente. Lo escrito vive solo en la memoria
  de la pestaña.
- **Consultar el estado** (`/consulta`, sin cuenta): con el número de expediente y el DNI, carné de
  extranjería o RUC del titular, en un formulario POST (nada queda en la URL). Muestra el estado en
  lenguaje sencillo, qué sigue y el historial; nunca el documento, el RUC, el celular, el correo ni
  la dirección. Tras 5 fallos desde el mismo origen en 15 minutos, se bloquea con la hora para
  reintentar.
- **Mesa de partes** (`/personal/mesa-partes/nueva`, rol MESA_PARTES): el mismo formulario; la
  identidad se comprueba con el servicio de identificación sin código al celular.
- **Bandeja del personal** (`/personal/expedientes`, roles MESA_PARTES, EVALUADOR y JEFATURA): todos
  los expedientes con filtros por estado y ruta; el detalle muestra el documento enmascarado y la
  dirección, registra quién lo vio y permite descargar los documentos.
- **Documentos sin usar**: una tarea de la API borra cada hora los que tienen más de 24 horas (solo
  una réplica a la vez, con un candado de PostgreSQL).
- **Servicio de identificación simulado** (el real aún no está contratado). Datos FICTICIOS:

  | Caso                    | Documento    | Fecha de emisión | RUC         |
  | ----------------------- | ------------ | ---------------- | ----------- |
  | Titular de prueba 1     | DNI 40000001 | 2020-01-15       | 10400000011 |
  | Representante de prueba | DNI 40000002 | 2019-05-10       | —           |
  | Titular extranjero      | CE 000123456 | —                | 15000123456 |
  | Servicio caído (503)    | DNI 49999999 | —                | —           |

  En desarrollo el código no se envía por SMS: queda en Redis con la clave `dev:otp:<desafioId>`.

### Resultados de la funcionalidad 004

Mediciones del 19 y 20/11/2026 en un clon con su propio nombre de proyecto de Compose y puertos,
con datos y usuarios ficticios, en la misma computadora de la 003 (AMD Ryzen 7 5825U, 15.3 GB de RAM,
Windows 11 con Docker Desktop).

Auditoría Lighthouse 12 (modo móvil). La solicitud y el comprobante dependen del permiso en memoria,
así que se midieron en modo instantánea dentro del recorrido real (ese modo no mide rendimiento):

| Pantalla                                           | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
| -------------------------------------------------- | ----------- | ------------- | ---------------- | --- |
| `/tramite/identidad?licencia=LIC-02`               | 99          | 100           | 96               | 91  |
| `/tramite/solicitud?licencia=LIC-02` (instantánea) | —           | 100           | 100              | 80  |
| `/tramite/comprobante/<número>` (instantánea)      | —           | 100           | 100              | 80  |
| `/consulta`                                        | 99          | 100           | 96               | 91  |

El 96 tiene la misma causa aceptada en la 002 y la 003 (sin sesión, `POST /auth/renovar` responde
401 y el navegador lo anota en la consola). A 360 px ninguna pantalla nueva tiene desplazamiento
horizontal: identidad, solicitud, comprobante, consulta, bandeja, detalle y mesa de partes. El
escaneo base de OWASP ZAP sobre identidad y consulta no dejó alertas altas, medias ni bajas (solo
informativas).

Prueba de carga de EQ-01 / SC-002 con k6 (`tests/carga/eq01-consulta.js`, `grafana/k6:0.54.0`):
consultas correctas sobre 200 expedientes sembrados, cada usuario con su propio origen para medir la
API y no el límite de intentos, y de 1 a 3 s de espera entre consultas.

| Usuarios virtuales | Duración       | Peticiones | p95 (meta < 2 s) | Errores (meta < 1 %) | Resultado |
| ------------------ | -------------- | ---------- | ---------------- | -------------------- | --------- |
| 100 (humo)         | 2 min + subida | 6,793      | 15.6 ms          | 0 %                  | Cumple    |
| 1,000              | 2 min + subida | 66,527     | 113.6 ms         | 0.02 % (18)          | Cumple    |

Con 1,000 usuarios la API usó cerca de 4.9 núcleos y 269 MB, PostgreSQL 33 % de un núcleo y Redis
12 %. Los 18 fallos no dejaron errores en los registros de la API; como en la 003, se atribuyen a la
red de Docker Desktop entre el contenedor de k6 y el stack. **Pendiente para el entorno desplegado:**
confirmar SC-002 con k6 en otra máquina (aquí k6 y el sistema comparten la computadora) y comprobar
TLS 1.3 con testssl.sh (EQ-04); en local no hay TLS. Para repetir la carga:

```bash
docker run --rm -i -e BASE=http://host.docker.internal:<puerto-api>/api/v1 \
  -e NUMEROS=<expedientes sembrados, separados por comas> -e DOCUMENTO=40000001 \
  -e USUARIOS=1000 -e DURACION=2m grafana/k6:0.54.0 run - < tests/carga/eq01-consulta.js
```

Recorrido de la guía de validación (`specs/004-solicitud-consulta/quickstart.md`, escenarios 1 a 4)
contra la API del clon: 23 de 23 comprobaciones correctas. Con **2 réplicas de la API** detrás del
nginx del portal (`--scale api=2`), 6 de 6 solicitudes presentadas seguidas se crearon y 12 de 12
documentos se descargaron con el mismo SHA-256 con que se subieron; las dos réplicas atendieron
peticiones (la API no guarda estado y el almacén de documentos es un volumen compartido).

Tiempos a 360 px, con un recorrido automatizado que escribe tecla por tecla y hace pausas de
lectura (no reemplaza la prueba con personas que pide SC-001):

| Tarea                                                                                               | Tiempo | Objetivo |
| --------------------------------------------------------------------------------------------------- | ------ | -------- |
| Desde la ficha de LIC-02 hasta el comprobante, con identidad y los documentos obligatorios (SC-001) | 81 s   | ≤ 15 min |
| Mesa de partes: registrar una solicitud presencial con documentos ya digitalizados (SC-010)         | 47 s   | ≤ 10 min |

## Evaluación, esquela y pago en caja (funcionalidad 005)

- **Evaluar** (detalle del expediente, rol EVALUADOR): "Empezar revisión" pasa el expediente a
  EN_EVALUACION; "Confirmar riesgo" confirma la licencia presentada o la corrige a otra vigente del
  mismo grupo, y lo deja PENDIENTE_PAGO (con tasa 0.00 pasa directo a PAGADO, sin esquela). También
  puede **observar** una sola vez (con texto de 10 a 1000 caracteres) o **denegar** con motivo. Cada
  decisión envía la versión leída en `If-Match`: si otra persona cambió el expediente, avisa y lo
  recarga (412) en lugar de pisar el cambio.
- **Esquela** (`ESQ-EXP-AAAA-NNNNNN`): se genera en segundos por una cola de eventos en PostgreSQL
  (`comun.evento_pendiente`, con reintentos sin límite y espera creciente). El administrado la
  descarga en PDF desde la consulta pública con un permiso de 15 minutos solo para su expediente; el
  personal (EVALUADOR, CAJA y JEFATURA), desde el detalle. El PDF no lleva datos personales.
- **Caja** (`/personal/caja`, rol CAJA): busca la esquela por su código, muestra expediente, titular,
  licencia y monto, y registra el número de recibo una sola vez (10 pagos simultáneos registran uno).
  El expediente pasa a PAGADO por la misma cola de eventos.
- **Subsanar** (enlace en la consulta cuando está OBSERVADO): el titular confirma su identidad con el
  código y adjunta los documentos que faltaban; mesa de partes también puede hacerlo. El expediente
  vuelve a EN_EVALUACION.
- **Aprobar** (rol EVALUADOR): un expediente PAGADO de ruta A o C queda APROBADO. La ruta B
  (inspección previa) y la emisión de la licencia llegan en las funcionalidades 007 y 009.
- **Auditoría** (`/personal/auditoria`, rol JEFATURA): pagos y correcciones con filtro de fechas y
  paginación, "Corregir recibo" con motivo, y la auditoría de cada expediente en su detalle.
- **Migraciones 0008 y 0009**: acciones nuevas de la auditoría, plazo de subsanación opcional, espera
  entre reintentos de la cola y usuario nulo en la auditoría cuando el titular subsana en línea.

### Resultados de la funcionalidad 005

Medición del 20/11/2026 en un clon con su propio nombre de proyecto de Compose y puertos, con datos y
usuarios ficticios, en la misma computadora de la 004. Recorrido automatizado a 360 px que escribe
tecla por tecla (120 ms por carácter) y hace pausas de lectura (no reemplaza la prueba con personas):

| Tarea                                                                               | Tiempo | Objetivo |
| ----------------------------------------------------------------------------------- | ------ | -------- |
| Evaluador: desde la bandeja hasta confirmar el riesgo y generar la esquela (SC-001) | 28 s   | ≤ 2 min  |
| Caja: desde escribir el código de la esquela hasta registrar el pago (SC-002)       | 13 s   | ≤ 1 min  |

A 360 px ni el detalle del expediente ni la caja tienen desplazamiento horizontal. Al terminar, el
expediente del clon quedó PAGADO por la cola de eventos y la API no registró errores. La matriz de
permisos (SC-007) comprueba 75 casos de 401 y 403 sin cambios en los datos, y la prueba de
privacidad (SC-006) recorre todas las operaciones nuevas sin que el documento, el RUC, el celular,
el correo ni la dirección del titular aparezcan en registros, URL, errores, eventos, auditorías o el
PDF. Quedan para el despliegue (007): k6, Lighthouse y ZAP.

## Verificaciones automáticas

Cada pull request y cada push a `main` ejecutan en GitHub Actions (`.github/workflows/ci.yml`)
cinco verificaciones. Las cinco deben terminar en verde para poder fusionar:

| Check               | Qué revisa                                                                                                                                                                                                                                                                               | Cómo ejecutarlo en local                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `compilacion`       | Tipos estrictos en los 3 workspaces (contra los tipos generados del contrato), ESLint, Prettier y el build del backend y del portal                                                                                                                                                      | `npm run typecheck && npm run lint && npm run formato && npm run build` |
| `pruebas`           | Pruebas unitarias y de integración del backend (PostgreSQL y Redis reales, respuestas validadas contra `openapi.yaml`) y pruebas del portal                                                                                                                                              | `npm test` (con el sistema levantado)                                   |
| `cobertura`         | Cobertura de líneas y ramas ≥ 80 % en `dominio/` y `aplicacion/`                                                                                                                                                                                                                         | `npm run cobertura`                                                     |
| `regla-dependencia` | Regla de dependencia de Clean Architecture con dependency-cruiser: el dominio no importa paquetes ni otras capas, la aplicación no importa infraestructura, presentación ni paquetes, un módulo solo usa otro por su `fachada.ts` y no hay ciclos. El error indica el archivo y la regla | `npm run regla-dependencia`                                             |
| `contrato`          | Lint del contrato OpenAPI con Redocly (referencias rotas, esquemas o ejemplos inválidos)                                                                                                                                                                                                 | `npm run contrato`                                                      |

> **No cambie los nombres de estos checks** (`compilacion`, `pruebas`, `cobertura`,
> `regla-dependencia`, `contrato`): la protección de la rama `main` los exige por nombre. Si se
> renombra un job, hay que actualizar también esa protección y esta tabla.

### Protección de `main`

La rama `main` está protegida (constitución, principio VIII; FR-019a). Se configura en GitHub,
en **Settings → Branches → Branch protection rules → `main`**:

| Regla                                     | Valor                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| Exigir pull request antes de fusionar     | Sí, con 0 aprobaciones (proyecto de una persona)                       |
| Exigir que los checks pasen               | `compilacion`, `pruebas`, `cobertura`, `regla-dependencia`, `contrato` |
| Exigir que la rama esté al día con `main` | Sí                                                                     |
| Aplicar también a los administradores     | Sí                                                                     |
| Permitir _force push_                     | No                                                                     |
| Permitir borrar la rama                   | No                                                                     |

Equivalente con la API de GitHub (requiere permisos de administrador):

```bash
gh api -X PUT repos/yeymyloson18/licencias-huanta-arquitsoft-jeimy/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["compilacion","pruebas","cobertura","regla-dependencia","contrato"] },
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "enforce_admins": true,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

Cómo comprobarla:

```bash
gh api repos/yeymyloson18/licencias-huanta-arquitsoft-jeimy/branches/main/protection
git push origin main   # un push directo es rechazado: "protected branch hook declined"
```

Todo cambio entra a `main` desde una rama propia mediante un pull request con los cinco checks en verde.

## Documentación del proyecto (Sprint 1)

| N.° | Documento                                                     | Ubicación                                                                                                                                      |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Necesidad del negocio                                         | [`docs/01-analisis-de-sistema/00-necesidad-del-negocio.md`](docs/01-analisis-de-sistema/00-necesidad-del-negocio.md)                           |
| 2   | Actores                                                       | [`docs/01-analisis-de-sistema/01-actores.md`](docs/01-analisis-de-sistema/01-actores.md)                                                       |
| 3   | Historias de usuario                                          | [`docs/01-analisis-de-sistema/02-historias-de-usuario.md`](docs/01-analisis-de-sistema/02-historias-de-usuario.md)                             |
| 4   | Requisitos funcionales                                        | [`docs/01-analisis-de-sistema/03-requisitos-funcionales.md`](docs/01-analisis-de-sistema/03-requisitos-funcionales.md)                         |
| 5   | Atributos de calidad                                          | [`docs/01-analisis-de-sistema/04-atributos-de-calidad.md`](docs/01-analisis-de-sistema/04-atributos-de-calidad.md)                             |
| 6   | Restricciones                                                 | [`docs/01-analisis-de-sistema/05-restricciones.md`](docs/01-analisis-de-sistema/05-restricciones.md)                                           |
| 7   | Drivers arquitectónicos                                       | [`docs/01-analisis-de-sistema/06-drivers-arquitectonicos.md`](docs/01-analisis-de-sistema/06-drivers-arquitectonicos.md)                       |
| 8   | Decisiones arquitectónicas (ADR)                              | [`docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md`](docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md)                 |
| 9   | Escenarios de atributos de calidad                            | [`docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md`](docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md)             |
| 10  | Arquitectura inicial                                          | [`docs/02-arquitectura-software/arquitectura-inicial.md`](docs/02-arquitectura-software/arquitectura-inicial.md)                               |
| 11  | Estilo arquitectónico                                         | [`docs/02-arquitectura-software/estilo-arquitectonico.md`](docs/02-arquitectura-software/estilo-arquitectonico.md)                             |
| 12  | Enfoque arquitectónico (Clean Architecture)                   | [`docs/02-arquitectura-software/enfoque-arquitectonico.md`](docs/02-arquitectura-software/enfoque-arquitectonico.md)                           |
| 13  | Componentes arquitectónicos                                   | [`docs/02-arquitectura-software/componentes-arquitectonicos.md`](docs/02-arquitectura-software/componentes-arquitectonicos.md)                 |
| 14  | Diseño interno (módulos, patrones y principios)               | [`docs/03-diseno-de-software/diseno-interno/`](docs/03-diseno-de-software/diseno-interno/)                                                     |
| 15  | Modelo C4 (niveles 1 a 4)                                     | [`docs/04-modelo-c4/`](docs/04-modelo-c4/)                                                                                                     |
| 16  | Ejemplo de código (Clean Architecture)                        | [`tecnologia/README.md`](tecnologia/README.md)                                                                                                 |
| 17  | Validación del TUPA (fichas y diferencias encontradas)        | [`docs/01-analisis-de-sistema/09-validacion-del-tupa.md`](docs/01-analisis-de-sistema/09-validacion-del-tupa.md)                               |
| 18  | Diagramas de secuencia (presentar solicitud y pagar en caja)  | [`docs/03-diseno-de-software/diagramas-de-secuencia.md`](docs/03-diseno-de-software/diagramas-de-secuencia.md)                                 |
| 19  | Modelo entidad-relación y diccionario de datos                | [`docs/05-modelo-de-datos/modelo-entidad-relacion.md`](docs/05-modelo-de-datos/modelo-entidad-relacion.md)                                     |
| 20  | Esquema PostgreSQL y datos semilla del TUPA                   | [`docs/05-modelo-de-datos/esquema.sql`](docs/05-modelo-de-datos/esquema.sql), [`datos-semilla.sql`](docs/05-modelo-de-datos/datos-semilla.sql) |
| 21  | Contrato de la API (OpenAPI 3.1) y matriz de permisos por rol | [`docs/06-contrato-api/`](docs/06-contrato-api/)                                                                                               |
| 22  | Diagrama de casos de uso (25 casos, trazados a HU y RF)       | [`docs/03-diseno-de-software/diagrama-casos-de-uso.md`](docs/03-diseno-de-software/diagrama-casos-de-uso.md)                                   |

El **backlog** está en [GitHub Issues](https://github.com/yeymyloson18/Licencias-Huanta-arquitSoft-JEIMY/issues): un
issue por historia de usuario y por tarea técnica, con etiquetas de módulo y prioridad, agrupados en un
[hito por funcionalidad](https://github.com/yeymyloson18/Licencias-Huanta-arquitSoft-JEIMY/milestones). Las
decisiones ADR-008 (réplica con Patroni), ADR-009 (portal en React + Vite) y ADR-010 (Cloudflare para DNS y CDN)
están en el documento 8.

## Cambios de alcance (simplificación)

| Cambio                                                               | Motivo                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El inspector trabaja siempre con internet desde su celular           | Se elimina el modo sin conexión y la aplicación instalable.                                                                                                                                                                                             |
| No hay pagos digitales                                               | El TUPA indica el pago en la caja municipal; el sistema genera una esquela de pago y el personal de caja registra el pago.                                                                                                                              |
| Atributos de calidad reducidos a seis                                | Rendimiento, seguridad, disponibilidad, escalabilidad, usabilidad y mantenibilidad.                                                                                                                                                                     |
| Sin integración con SIAF                                             | Queda fuera de alcance.                                                                                                                                                                                                                                 |
| Sin recursos de reconsideración ni apelación                         | Quedan fuera del alcance del sistema.                                                                                                                                                                                                                   |
| Sin anulación de pagos en el sistema                                 | Se evita el error con una pantalla de confirmación para el cajero; un número de recibo mal digitado lo corrige la jefatura (RF24). Anular un pago ya registrado sigue el procedimiento de caja de la Municipalidad.                                     |
| Registro de cambios del catálogo sin historial visible ni versionado | Cada cambio de una receta queda registrado (quién, cuándo, valores antes y después) en la misma operación; no hay pantalla para consultar ese historial ni versiones del catálogo para volver atrás. Cada esquela guarda el monto con el que se generó. |
| Gana el último que guarda al editar una receta                       | Pocos administradores; el registro de cambios permite recuperar un valor sobrescrito (aclaración 5 de la 003).                                                                                                                                          |
| La búsqueda de usuarios usa `POST /usuarios/busqueda`                | Un `GET ?texto=` dejaría el nombre o el correo en la URL, que queda en logs de proxies e historial del navegador (principio VII; research.md §R-13 de la 002). El listado sin texto sigue siendo `GET /usuarios`.                                       |
| El correo del personal se guarda cifrado                             | Por eso solo se puede buscar por el correo **completo** (se compara su huella HMAC), no por un fragmento; el nombre sí admite fragmentos (research.md §R-04 de la 002).                                                                                 |

## Mejoras para la Fase 2 (fuera del Sprint 1)

| Idea                                            | Motivo para dejarla después                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Asistente por chat y WhatsApp                   | Definido como Fase 2 desde el inicio (RC13).                                                                                   |
| Pantalla de historial y versionado del catálogo | El registro de cambios ya existe (funcionalidad 003); falta consultarlo desde el portal y poder volver a una versión anterior. |

## Curso: Arquitectura de Software – UNSCH 2026
