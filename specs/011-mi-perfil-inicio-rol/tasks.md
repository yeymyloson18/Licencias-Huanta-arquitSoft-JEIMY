# Tareas: Mi perfil del personal y pantalla de inicio por rol

**Entrada**: documentos de diseño en `specs/011-mi-perfil-inicio-rol/`

**Requisitos previos**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Pruebas**: obligatorias (principio V de la constitución y pedido de la especificación: pruebas de
permisos, de privacidad y de redirección abierta). Las unitarias corren en local. La integración, el
E2E y Postman corren en GitHub Actions (poca memoria local).

**Organización**: por historia de usuario. Orden de ejecución:

1. US1 (llegada por rol): solo portal; es el MVP.
2. US2 (ver mi perfil).
3. US4 (nadie ve el perfil de otro): endurece US2.
4. US3 (cambiar mi clave).

Un commit convencional al terminar cada fase, en la rama `011-mi-perfil-inicio-rol` (nunca en
`main`).

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: puede ir en paralelo (archivos distintos, sin dependencias pendientes).
- **[Historia]**: US1 llegada por rol, US2 ver mi perfil, US3 cambiar mi clave, US4 solo el perfil
  propio.

---

## Fase 1: Preparación (rama y contrato primero)

- [X] T001 Crear y cambiar a la rama `011-mi-perfil-inicio-rol` desde `main` actualizado
      (`git switch -c 011-mi-perfil-inicio-rol`); confirmar con `git branch --show-current`
- [X] T002 Editar `docs/06-contrato-api/openapi.yaml` según `contracts/api-perfil.md`:
  - **Esquema `PerfilPropio`** en `components/schemas`, junto a `Usuario`:
    - `type: object`, `additionalProperties: false`;
    - `required: [nombreCompleto, correo, celularEnmascarado, roles, ultimoIngreso, sesionesAbiertas]`;
    - `nombreCompleto: { type: string }`;
    - `correo: { type: string, format: email }`;
    - `celularEnmascarado: { type: string, example: '9*****321' }`;
    - `roles: { type: array, uniqueItems: true, items: Rol }`;
    - `ultimoIngreso: { type: [string, 'null'], format: date-time }`;
    - `sesionesAbiertas: { type: integer, minimum: 0 }`.
  - **Operación `GET /perfil`**:
    - `tags: [Seguridad]`, `operationId: obtenerMiPerfil`;
    - `security: [{ bearerPersonal: [] }]`;
    - sin parámetros;
    - 200 con la cabecera `Cache-Control: no-store`;
    - 401 `NoAutenticado`;
    - 403 `debe-cambiar-clave`.
  - **`POST /auth/cambiar-clave`**: cambiar solo `summary` y `description`, para decir que también es
    el cambio voluntario desde "Mi perfil" (011). El cuerpo y las respuestas no cambian.
  - **Descripción general**: agregar la línea de la 011.
- [X] T003 Actualizar la matriz de permisos en `docs/06-contrato-api/README.md`:
  - `GET /perfil`: sin token 401, clave temporal 403, cualquier rol 200 propio, sin roles 200 propio;
  - `POST /auth/cambiar-clave`: sin cambios, con la nota "voluntario u obligatorio".
  Después correr `npm run contrato` (sin errores nuevos) y `npm run generar` (regenera
  `packages/contracts`).

**Punto de control**: contrato válido; el tipo `components['schemas']['PerfilPropio']` existe en
`@licencias/contracts`.

---

## Fase 2: Base (bloquea US1 a US4)

- [ ] T004 Mover `apps/web/src/paginas/admin/roles.ts` a `apps/web/src/componentes/roles.ts`
      (`ROLES`, `nombreDelRol`). Actualizar las importaciones de `Usuarios.tsx`,
      `FormularioUsuario.tsx`, `FichaUsuario.tsx` y de cualquier otro archivo de
      `apps/web/src/paginas/admin/` que lo use. Correr `npm test -w apps/web` en verde.

**Punto de control**: portal en verde y el nombre de cada rol disponible para todo el personal.

---

## Fase 3: US1 - Llegar a mi pantalla de trabajo al ingresar (P1) 🎯 MVP

**Objetivo**: al ingresar, o al terminar el cambio de una clave temporal, cada rol llega a su
pantalla principal. El regreso a la pantalla pedida antes de ingresar acepta solo rutas internas
permitidas para su rol.

**Prueba independiente**: `npm test -w apps/web -- inicio Ingresar CambiarClave` en verde; en CI, el
E2E ingresa con CAJA y llega a `/personal/caja`.

### Pruebas de US1 (escribirlas primero; deben fallar)

- [ ] T005 [P] [US1] Crear `apps/web/src/sesion/inicio.test.ts` con tablas de casos.

  `inicioDe` (`ADMINISTRADOR`, `MESA_PARTES`, `EVALUADOR`, `CAJA`, `INSPECTOR` y `JEFATURA` son
  códigos de rol):

  | Roles | Pantalla |
  | --- | --- |
  | `['ADMINISTRADOR']` | `/admin` |
  | `['MESA_PARTES']` | `/personal/expedientes` |
  | `['EVALUADOR']` | `/personal/expedientes` |
  | `['CAJA']` | `/personal/caja` |
  | `['INSPECTOR']` | `/personal/inspecciones` |
  | `['JEFATURA']` | `/personal/tablero` |
  | `['INSPECTOR','CAJA']` | `/personal/caja` |
  | `['JEFATURA','EVALUADOR']` | `/personal/expedientes` |
  | `['JEFATURA','ADMINISTRADOR']` | `/admin` |
  | `[]` | `/perfil` |

  `destinoDespuesDeIngresar(volverA, roles)`, entradas que **deben** devolver `inicioDe(roles)`
  (redirección abierta; prueba exigida por el usuario):
  - `'//evil.example'`, `'//evil.example/admin'`, `'/\\evil.example'`;
  - `'https://evil.example'`, `'http:/evil.example'`, `'javascript:alert(1)'`;
  - `'/%2F%2Fevil.example'`, `'/admin/../..'`, `'/admin?x=1'`, `'/admin#x'`, `'/admin/ x'`;
  - `'evil.example'`, `''`, `'/'`, `'/consulta'`;
  - `null`, `undefined`, `42`, `{}`;
  - `'/admin'` con `['CAJA']`.

  Entradas que **deben** respetarse:
  - `'/perfil'` con cualquier rol y con `[]`;
  - `'/cambiar-clave'` con `['CAJA']`;
  - `'/personal/caja'` con `['CAJA']`;
  - `'/personal/expedientes/EXP-2026-000123'` con `['EVALUADOR']`;
  - `'/admin/usuarios'` con `['ADMINISTRADOR']`.

  Ruta solo para el rol INSPECTOR: `'/personal/inspecciones/abc/resultado'` se respeta con
  `['INSPECTOR']` y devuelve `inicioDe` con `['JEFATURA']`.

  Prueba de sincronía: cada `path` protegido declarado en `apps/web/src/Aplicacion.tsx` (lista fija
  copiada en la prueba) tiene una entrada que lo cubre en `PERMISOS_PANTALLA`.
- [ ] T006 [P] [US1] Ampliar `apps/web/src/paginas/Ingresar.test.tsx`:
  - con sesión de rol CAJA y sin `volverA`, termina en `/personal/caja`;
  - con `state.volverA = '//evil.example'`, termina en `/personal/caja` (nunca fuera del portal);
  - con `state.volverA = '/personal/caja'`, se respeta;
  - con `state.volverA = '/admin'` y rol CAJA, termina en `/personal/caja`.
- [ ] T007 [P] [US1] Ajustar `apps/web/src/paginas/CambiarClave.test.tsx`: con clave temporal y rol
      INSPECTOR, al terminar bien navega a `/personal/inspecciones` con el aviso "Su clave se cambió"
      (antes esperaba `/`)
- [ ] T008 [P] [US1] Crear `apps/web/src/componentes/AvisoNavegacion.test.tsx` (escenario 5 de US1,
      FR-012): montar `AvisoNavegacion` dentro de un `MemoryRouter` con varias entradas iniciales y
      comprobar:
  - con `state.aviso = 'Su clave se cambió'` muestra ese texto en un `role="status"`, en cualquier
    ruta del personal (`/admin`, `/personal/expedientes`, `/personal/caja`,
    `/personal/inspecciones`, `/personal/tablero`, `/perfil`);
  - sin `state.aviso` no muestra nada;
  - después de mostrarlo, el historial queda con el mismo `pathname`, sin `aviso` y conservando el
    resto del estado (por ejemplo, `sinRol: true`); al volver a montar en esa entrada, el aviso no
    aparece otra vez;
  - un `aviso` que no es una cadena (número u objeto) no se muestra.

### Implementación de US1

- [ ] T009 [US1] Reescribir `apps/web/src/sesion/inicio.ts`:
  - **`PRIORIDAD_INICIO`**: lista ordenada `[ADMINISTRADOR → '/admin', MESA_PARTES →
    '/personal/expedientes', EVALUADOR → '/personal/expedientes', CAJA → '/personal/caja',
    INSPECTOR → '/personal/inspecciones', JEFATURA → '/personal/tablero']`.
  - **`inicioDe(roles)`**: devuelve la primera coincidencia; sin roles, `'/perfil'`.
  - **`PERMISOS_PANTALLA`**: tabla de `data-model.md`, por prefijo de la ruta más específica a la
    menos específica. `/perfil` y `/cambiar-clave` → cualquiera;
    `/personal/inspecciones/<id>/resultado` → `INSPECTOR`.
  - **`destinoDespuesDeIngresar(volverA: unknown, roles)`**: acepta solo una cadena que coincide con
    `^\/(perfil|cambiar-clave|admin|personal)(\/[A-Za-z0-9_-]+)*$` **y** que está permitida para
    alguno de los roles; en cualquier otro caso, `inicioDe(roles)`.
  - Un comentario explica que es la defensa contra redirecciones abiertas (research §R-07).
- [ ] T010 [US1] En `apps/web/src/paginas/Ingresar.tsx`, borrar el `destinoSeguro` local y usar
      `destinoDespuesDeIngresar((ubicacion.state as { volverA?: unknown } | null)?.volverA,
      sesion.usuario.roles)`. Sin roles, pasar `state: { sinRol: true }` al navegar a `/perfil`.
- [ ] T011 [US1] Revisar que `apps/web/src/paginas/CambiarClave.tsx` siga usando `inicioDe` con la
      clave temporal (el destino nuevo sale de T009). Correr T005 a T007 en verde.
- [ ] T012 [US1] Crear `apps/web/src/componentes/AvisoNavegacion.tsx` y montarlo en
      `apps/web/src/Aplicacion.tsx` justo debajo de `<Menu />`, dentro del router, para que lo vean
      todas las pantallas:
  - lee `ubicacion.state?.aviso`; solo si es una cadena no vacía, la guarda en un estado local y la
    muestra en `<p className="aviso" role="status">`;
  - después llama una vez a `navegar(ubicacion.pathname, { replace: true, state: restoSinAviso })`,
    para que recargar la página no repita el aviso.
  Hoy ninguna pantalla de llegada lee ese aviso, así que se perdía. `CambiarClave` (T011 y la tarea
  de US3) sigue enviando `state: { aviso: 'Su clave se cambió' }`. Correr T008 en verde.

**Punto de control**: US1 completa. Commit `feat(web): cada rol llega a su pantalla al ingresar`.

---

## Fase 4: US2 - Ver mi perfil (P1)

**Objetivo**: "Mi perfil" en el menú para cualquier sesión del personal y la pantalla `/perfil` con
los datos propios.

**Prueba independiente**: `npm test -w apps/api -- obtener-mi-perfil` y
`npm test -w apps/web -- Menu MiPerfil` en verde; en CI, `perfil.e2e-spec.ts` en verde.

### Pruebas de US2 (escribirlas primero; deben fallar)

- [ ] T013 [P] [US2] Crear `apps/api/test/unit/modulos/seguridad/aplicacion/obtener-mi-perfil.spec.ts`,
      con los dobles de `apps/api/test/unit/modulos/seguridad/aplicacion/dobles.ts` (los mismos de
      `ficha-usuario.spec.ts`):
  - devuelve `nombreCompleto`, `correo`, `celular` (objeto de valor, para enmascarar en
    presentación), `roles` vigentes, `ultimoIngreso` (de `auditoria.ultimoIngreso`) y
    `sesionesAbiertas` (de `consulta.sesionesAbiertasDe(id, reloj.ahora())`);
  - con `ultimoIngreso` `null` devuelve `null`;
  - con un usuario inexistente lanza `ErrorAutenticacion` (nunca `ErrorUsuarioNoEncontrado`);
  - con un usuario inactivo también lanza `ErrorAutenticacion`;
  - consulta los puertos solo con el `usuarioId` recibido.
- [ ] T014 [P] [US2] Crear `apps/api/test/integracion/perfil.e2e-spec.ts`, con el apoyo de
      `apps/api/test/integracion/` que usa `control-permisos.e2e-spec.ts` para crear usuarios e
      ingresar:
  - `GET /api/v1/perfil` con sesión responde 200;
  - el cuerpo valida contra `PerfilPropio` del contrato;
  - `celularEnmascarado` coincide con `^\d\*{5}\d{3}$`;
  - la cabecera es `Cache-Control: no-store`;
  - dos ingresos del mismo usuario → `sesionesAbiertas = 2`;
  - `ultimoIngreso` no es `null` después de ingresar.
- [ ] T015 [P] [US2] Ampliar `apps/web/src/componentes/Menu.test.tsx`:
  - el enlace "Mi perfil" (`role="link"`, `href="/perfil"`) aparece junto al nombre para cada uno de
    los 6 roles y para una sesión sin roles;
  - lleva `aria-current="page"` cuando la ruta es `/perfil`;
  - sin sesión no hay menú.
- [ ] T016 [P] [US2] Crear `apps/web/src/paginas/personal/MiPerfil.test.tsx`:
  - muestra el nombre, el correo, `9*****321`, los roles con su nombre ("Mesa de partes, Caja"), el
    último ingreso con fecha y hora, "1 sesión abierta" y "3 sesiones abiertas";
  - con `ultimoIngreso` `null` muestra "Sin registro"; con `roles` `[]`, "Sin roles";
  - con `state.sinRol` muestra "Todavía no tiene un rol asignado. Consulte con el administrador."
    (`role="status"`); el aviso "Su clave se cambió" **no** lo muestra esta página, sino
    `AvisoNavegacion` (T012), para que no aparezca dos veces;
  - ante un error muestra `role="alert"` "No se pudo cargar su perfil. Inténtelo de nuevo." y el
    botón "Reintentar" vuelve a pedir el perfil;
  - el enlace "Cambiar mi clave" apunta a `/cambiar-clave`.

### Implementación de US2

- [ ] T017 [US2] Crear `apps/api/src/modulos/seguridad/aplicacion/obtener-mi-perfil.ts`:
  - clase `ObtenerMiPerfil` con `DependenciasObtenerMiPerfil { usuarios: RepositorioUsuarios;
    consulta: ConsultaPanel; auditoria: RepositorioAuditoria; reloj: Reloj }`;
  - interfaz `MiPerfil { usuario: Usuario; ultimoIngreso: Date | null; sesionesAbiertas: number }`;
  - `ejecutar(usuarioId)`: si el usuario es `null` o `activo !== true`, lanza `ErrorAutenticacion`;
    luego consulta en paralelo `auditoria.ultimoIngreso` y `consulta.sesionesAbiertasDe`, igual que
    `obtener-ficha-usuario.ts`.
- [ ] T018 [US2] En `apps/api/src/modulos/seguridad/presentacion/respuestas.ts`, agregar
      `aPerfilRespuesta(perfil): components['schemas']['PerfilPropio']`:
  - `nombreCompleto` y `correo` del usuario;
  - `celularEnmascarado: usuario.celular.enmascarado()`;
  - `roles` vigentes;
  - `ultimoIngreso` en ISO o `null`;
  - `sesionesAbiertas`;
  - **sin** `id`, `activo` ni `debeCambiarClave`.
- [ ] T019 [US2] Crear `apps/api/src/modulos/seguridad/presentacion/perfil.controller.ts`:
  - `@Controller('perfil')` con `@UseGuards(JwtAuthGuard)` (sin `RolesGuard` ni
    `@PermitirConClaveTemporal`);
  - `@Get() @Header('Cache-Control', 'no-store')`;
  - lee `usuarioId` **solo** de `peticion.sesionAutenticada`; no declara `@Param`, `@Query` ni
    `@Body`;
  - traduce `ErrorAutenticacion` a `ErrorProblema.noAutenticado()`.
- [ ] T020 [US2] En `apps/api/src/modulos/seguridad/seguridad.module.ts`, registrar `ObtenerMiPerfil`
      con una fábrica que inyecta los mismos tokens de `ObtenerFichaUsuario` (repositorio de
      usuarios, consulta del panel, auditoría y reloj) y agregar `PerfilController` a `controllers`.
      Correr `npm run regla-dependencia`.
- [ ] T021 [P] [US2] En `apps/web/src/servicios/clienteApi.ts`, agregar `obtenerMiPerfil()` con el
      mismo patrón de `obtenerFichaUsuario`: `GET /perfil` con el token y renovación ante 401.
      Devuelve `{ tipo: 'ok', datos: PerfilPropio } | { tipo: 'error' }`.
- [ ] T022 [US2] En `apps/web/src/componentes/Menu.tsx`, agregar
      `<Link to="/perfil" className="menu__perfil">Mi perfil</Link>` justo después de
      `menu__usuario`, visible para cualquier sesión, con
      `aria-current={ubicacion.pathname === '/perfil' ? 'page' : undefined}`
- [ ] T023 [US2] Crear `apps/web/src/paginas/personal/MiPerfil.tsx` según
      `contracts/portal-perfil.md`:
  - `<h1>Mi perfil</h1>` y una lista `<dl>` con los 6 datos;
  - roles con `nombreDelRol` de `componentes/roles.ts`;
  - fecha con el formateador de `componentes/formato.ts`;
  - plural "sesión abierta" / "sesiones abiertas";
  - aviso de `state.sinRol` (el de `state.aviso` lo muestra `AvisoNavegacion`);
  - estados de carga, error y reintento;
  - enlace "Cambiar mi clave" a `/cambiar-clave`;
  - sin `console.*`.
- [ ] T024 [US2] En `apps/web/src/Aplicacion.tsx`, agregar la ruta `/perfil` con
      `<RutaProtegida><MiPerfil /></RutaProtegida>` (sin `roles`)
- [ ] T025 [P] [US2] En `apps/web/src/estilos/global.css`, en `.menu` y `.menu__perfil`: `flex-wrap`,
      foco visible, tamaño táctil de 44 px como mínimo y nada de desplazamiento horizontal a 360 px;
      el `<dl>` del perfil en una sola columna a 360 px

**Punto de control**: US2 completa. Commit `feat(011): mi perfil del personal`.

---

## Fase 5: US4 - Nadie ve el perfil de otra persona (P1)

**Objetivo**: comprobar con pruebas la propiedad del perfil y la privacidad (FR-003, FR-004 y
FR-016).

**Prueba independiente**: en CI, `matriz-permisos-011.e2e-spec.ts` y los casos nuevos de
`datos-personales.e2e-spec.ts` en verde.

- [ ] T026 [P] [US4] Crear `apps/api/test/integracion/matriz-permisos-011.e2e-spec.ts`:
  - `GET /perfil` sin token → 401 `no-autenticado`;
  - con un token inválido → 401;
  - con clave temporal → 403 `debe-cambiar-clave`;
  - con cada uno de los 6 roles → 200 y el `correo` es el del usuario que ingresó;
  - el usuario A con `GET /perfil?usuarioId=<id de B>` → 200 con el perfil de **A**;
  - `GET /perfil/<id de B>` → 404 sin `correo` ni `nombreCompleto` de B en el cuerpo;
  - después de `POST /auth/cerrar-sesion` → 401;
  - después de que el administrador desactiva al usuario → 401;
  - **sin roles** (FR-006): la API no permite dejar a un usuario sin roles (`minItems: 1`), así que
    la prueba lo prepara directamente en la base, después de ingresar. Para eso ejecuta
    `UPDATE seguridad.usuario_rol SET retirado_en = now(), retirado_por = <id del administrador>
    WHERE usuario_id = <id> AND retirado_en IS NULL` con el cliente Prisma de la aplicación de
    prueba. Luego `GET /perfil` → 200 con `roles: []`. Si el guard rechaza al usuario sin roles,
    esta prueba lo detecta y se corrige.
- [ ] T027 [P] [US4] Ampliar `apps/api/test/integracion/datos-personales.e2e-spec.ts`:
  - la respuesta de `GET /perfil` no tiene las claves `id`, `claveHash` ni `celular`, ni ningún
    valor con 9 dígitos seguidos;
  - con el registro de la aplicación capturado (el mismo método que ya usa el archivo), al pedir el
    perfil y al cambiar la clave no aparecen el correo, el nombre, el celular completo, la clave
    actual ni la nueva.
- [ ] T028 [US4] En `apps/api/test/integracion/perfil.e2e-spec.ts`, agregar los casos de
      identificador ignorado. El usuario A pide su perfil con el id del usuario B de tres formas, y
      en todas recibe 200 con **su** correo, sin el correo ni el nombre de B en el cuerpo:
  - `GET /perfil?usuarioId=<id de B>`;
  - `GET /perfil?id=<id de B>`;
  - `GET /perfil` con la cabecera `X-Usuario-Id: <id de B>`.

  (No se envía un cuerpo en un `GET`.) Agregar a `tests/postman/humo.postman_collection.json` la petición
      `GET {{base}}/perfil` sin token, que espera 401.

**Punto de control**: US4 completa. Commit `test(011): permisos y privacidad del perfil`.

---

## Fase 6: US3 - Cambiar mi clave cuando quiera (P2)

**Objetivo**: desde "Mi perfil", cambiar la clave con las reglas de la 002 y volver al perfil con el
aviso; queda "Clave cambiada" en la auditoría.

**Prueba independiente**: `npm test -w apps/web -- CambiarClave` en verde; en CI, los casos de cambio
voluntario de `perfil.e2e-spec.ts` en verde.

### Pruebas de US3 (escribirlas primero; deben fallar)

- [ ] T029 [P] [US3] Ampliar `apps/web/src/paginas/CambiarClave.test.tsx`:
  - con una sesión **sin** clave temporal se ve el enlace "Volver a mi perfil";
  - un cambio correcto navega a `/perfil` con `state.aviso = 'Su clave se cambió'`;
  - claves nuevas distintas → "Las claves nuevas no coinciden" sin llamar a la API;
  - un 401 de la clave actual → "La clave actual no es correcta";
  - un 429 → "Demasiados intentos. Vuelva a intentarlo más tarde.";
  - un 422 → mensaje de la regla junto al campo.
- [ ] T030 [P] [US3] Ampliar `apps/api/test/integracion/perfil.e2e-spec.ts` con el cambio voluntario
      (usuario con clave definitiva y 2 sesiones):
  - `POST /auth/cambiar-clave` → 200;
  - la sesión anterior responde 401 en `GET /perfil`;
  - la nueva sesión ve `sesionesAbiertas = 1`;
  - la clave anterior ya no permite ingresar;
  - `GET /admin/auditoria?accion=CLAVE_CAMBIADA&afectadoId=<id>` (como administrador) tiene 1
    evento con actor = afectado.

  Rechazos:
  - una clave nueva igual a la actual → 422;
  - una clave nueva de menos de 12 caracteres o sin números → 422;
  - una clave actual incorrecta 5 veces → 429.

### Implementación de US3

- [ ] T031 [US3] En `apps/web/src/paginas/CambiarClave.tsx`:
  - al montar, guardar `const voluntario = sesion?.debeCambiarClave !== true`;
  - si `voluntario`, mostrar el enlace "Volver a mi perfil" (`<Link to="/perfil">`);
  - en `'ok'`, navegar a `voluntario ? '/perfil' : inicioDe(resultado.datos.usuario.roles)` con
    `replace: true` y `state: { aviso: 'Su clave se cambió' }`;
  - no cambiar mensajes, campos ni validaciones de la 002.
- [ ] T032 [US3] Verificar que `CambiarClave` (API) no necesita cambios. Si `cambiar-clave.spec.ts`
      no cubre "clave definitiva → registra `CLAVE_CAMBIADA` con actor = afectado", agregar ese caso
      en `apps/api/test/unit/modulos/seguridad/aplicacion/cambiar-clave.spec.ts`.

**Punto de control**: US3 completa. Commit `feat(011): cambiar mi clave desde el perfil`.

---

## Fase 7: Pulido y temas transversales

- [ ] T033 [P] Crear `tests/e2e/perfil.spec.ts` (Playwright; corre en los proyectos de
      `tests/e2e/playwright.config.ts`, incluido `celular` de 360×740), con los ayudantes de
      `tests/e2e/apoyo/sistema.ts`:
  - después de `ingresar(pagina, 'CAJA')`, `toHaveURL(/\/personal\/caja$/)`;
  - "Mi perfil" → `/perfil` muestra el nombre, `9*****321` y "1 sesión abierta";
  - "Cambiar mi clave" → vuelve a `/perfil` con "Su clave se cambió";
  - **sin desplazamiento horizontal a 360 px** (FR-018): en el proyecto `celular`, en `/perfil` y en
    `/cambiar-clave`, `await pagina.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth)` es `true`, con el menú abierto y con un error de
    validación visible en el formulario.

  Revisar `tests/e2e/ruta-a.spec.ts` y `tests/e2e/ruta-b.spec.ts`: si alguna espera llegar a `/`
  después de ingresar, cambiarla por la pantalla del rol (hoy `ingresar` en `apoyo/sistema.ts` solo
  espera el menú, así que se prevé que no haga falta cambiar nada).
- [ ] T034 [P] Documentación:
  - `README.md`: pantalla de llegada por rol, "Mi perfil" y cambio de clave voluntario;
  - `docs/03-diseno-de-software/diagrama-casos-de-uso.md`: caso "Ver mi perfil" y "Cambiar mi clave"
    para todo el personal;
  - `docs/08-sprint-2/README.md`, si ahí se listan las funcionalidades.
- [ ] T035 Lighthouse móvil en pantallas con sesión (FR-018, SC-007, EQ-05). Usa la misma medida
      de las funcionalidades anteriores (`.github/workflows/calidad-produccion.yml`): `formFactor:
      mobile`, `screenEmulation` 360×740 y `deviceScaleFactor: 2`, con la aserción
      `categories:accessibility` ≥ 0.9. Ese flujo solo mide pantallas públicas y en producción el
      código llega por un SMS real, así que esta medida corre en `.github/workflows/e2e.yml`, donde
      el sistema ya está levantado con `ENVIO_OTP=simulado`:
  - `tests/e2e/apoyo/lighthouse-ingreso.cjs`: `puppeteerScript` de Lighthouse CI que ingresa como
    usuario de prueba de rol CAJA (correo y clave, y lee el código de `dev:otp:<id>` en Redis con
    `docker compose exec -T redis redis-cli`, igual que `sistema.ts`);
  - `tests/e2e/lighthouserc.json`:
    - `collect.url`: `<base>/perfil` y `<base>/cambiar-clave`;
    - `puppeteerScript` y `disableStorageReset: true`, para que la cookie de renovación mantenga
      la sesión;
    - `numberOfRuns: 1`;
    - las mismas opciones móviles de 360 px;
    - `assert.assertions["categories:accessibility"] = ["error", {"minScore": 0.9}]`;
  - paso nuevo en `.github/workflows/e2e.yml`, después de Playwright, con `npx --yes @lhci/cli@0.14.0`
    (la misma versión de `calidad-produccion.yml`), que sube los informes
    como artefacto;
  - si el puntaje es menor que 0.9, corregir en `apps/web/src/estilos/global.css` o en los
    componentes y volver a medir;
  - anotar el resultado (puntaje de cada pantalla y enlace a la corrida) en la tabla de evidencias
    de `docs/08-sprint-2/README.md`.

  Es una dependencia de CI que se usa con `npx` y una versión fija; no se agrega al
  `package.json`.
- [ ] T036 Puertas locales de `quickstart.md`: `npm run lint && npm run typecheck && npm run
      formato`, `npm run contrato`, `npm run regla-dependencia`, `npm run cobertura` (≥ 80 % en
      `dominio/` y `aplicacion/`) y `npm test -w apps/web`, todo en verde. Marcar las tareas con
      `[X]` y hacer el commit `chore(011): cierre`.

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Fase 1 (preparación)**: sin dependencias. T002 → T003 (los tipos dependen del contrato).
- **Fase 2 (base)**: depende de la fase 1. Bloquea US2 (los nombres de rol).
- **US1 (fase 3)**: depende solo de la fase 1 (rama). Es solo portal y no necesita el contrato del
  perfil, pero la ruta `/perfil` para un usuario sin roles queda completa con US2.
- **US2 (fase 4)**: depende de las fases 1 y 2.
- **US4 (fase 5)**: depende de US2 (el endpoint debe existir).
- **US3 (fase 6)**: depende de US2 (el enlace sale del perfil y vuelve a él) y de US1 (`inicioDe`
  para la clave temporal).
- **Pulido (fase 7)**: depende de todas.

### Dentro de cada historia

- Pruebas primero (deben fallar).
- API: caso de uso → respuesta → controlador → módulo.
- Portal: cliente → componentes → ruta.

### Oportunidades de paralelo

- US1: T005, T006, T007 y T008 en paralelo.
- US2: T013, T014, T015 y T016 en paralelo. Además, T021 y T025 en paralelo con la API
  (T017 a T020).
- US4: T026 y T027 en paralelo.
- US3: T029 y T030 en paralelo.
- Pulido: T033 y T034 en paralelo; T035 después de T033 (usa el mismo sistema levantado del E2E).

---

## Ejemplo de paralelo: US2

```bash
# Pruebas de US2 a la vez:
Tarea: "obtener-mi-perfil.spec.ts en apps/api/test/unit/modulos/seguridad/aplicacion/"
Tarea: "perfil.e2e-spec.ts en apps/api/test/integracion/"
Tarea: "Menu.test.tsx en apps/web/src/componentes/"
Tarea: "MiPerfil.test.tsx en apps/web/src/paginas/personal/"

# API y portal a la vez:
Tarea: "ObtenerMiPerfil + aPerfilRespuesta + PerfilController + seguridad.module.ts"
Tarea: "obtenerMiPerfil en clienteApi.ts + estilos del menú"
```

---

## Estrategia de implementación

### MVP primero (solo US1)

1. Fase 1 (rama; el contrato puede ir después si se entrega solo US1).
2. Fase 3: US1. Cada rol llega a su pantalla y el regreso está protegido contra redirecciones
   abiertas.
3. **Detenerse y validar** con `inicio.test.ts` e `Ingresar.test.tsx`.

### Entrega incremental

1. Preparación y base → contrato y tipos listos.
2. US1 → llegada por rol (MVP).
3. US2 → Mi perfil.
4. US4 → permisos y privacidad comprobados.
5. US3 → cambio de clave voluntario.
6. Pulido → E2E, documentación, accesibilidad y puertas.

---

## Notas

- [P] = archivos distintos, sin dependencias pendientes.
- La integración, el E2E y Postman corren en GitHub Actions; en local solo las puertas de T036.
- No se crean migraciones: si una tarea parece necesitar una, revisar `data-model.md` antes.
- Nunca poner datos personales en la URL, en `console.*` ni en los registros.
