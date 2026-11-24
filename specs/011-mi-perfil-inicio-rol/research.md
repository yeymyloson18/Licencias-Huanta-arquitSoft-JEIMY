# Investigación: Mi perfil del personal y pantalla de inicio por rol (011)

No quedaron puntos marcados como "NEEDS CLARIFICATION" en el contexto técnico. Cada decisión se
tomó revisando el código de la 002 y la 009.

## R-01. Ruta de la API del perfil

- **Decisión**: `GET /perfil` en un controlador nuevo `perfil.controller.ts` del módulo `seguridad`,
  protegido solo con `JwtAuthGuard` (sin `RolesGuard`). No recibe parámetros: el usuario sale de
  `peticion.sesionAutenticada`. Responde `Cache-Control: no-store`.
- **Por qué**: FR-004 prohíbe elegir el perfil con un identificador. Si no hay parámetro, no se puede
  pedir el perfil de otra persona. Una ruta propia evita que `/usuarios/yo` choque con
  `/usuarios/{usuarioId}`, que es solo del ADMINISTRADOR (`@RequiereRoles` a nivel de clase).
- **Alternativas**: `GET /usuarios/yo` (choca con la ruta y con el guard de clase del administrador);
  `GET /auth/perfil` (el perfil no es parte del ingreso y `/auth/*` se audita como "ingresos").

## R-02. Clave temporal y el perfil

- **Decisión**: `GET /perfil` **no** lleva `@PermitirConClaveTemporal()`. Con clave temporal responde
  403 `debe-cambiar-clave`, como cualquier otra operación (FR-006).
- **Por qué**: así se conserva la regla de la 002: con clave temporal la única operación posible es
  cambiarla. El portal ya envía a `/cambiar-clave` antes de mostrar cualquier pantalla.

## R-03. Reutilizar el cálculo de la ficha del usuario

- **Decisión**: caso de uso nuevo `ObtenerMiPerfil` con dependencias `usuarios`, `consulta`
  (`ConsultaPanel.sesionesAbiertasDe`), `auditoria` (`RepositorioAuditoria.ultimoIngreso`) y `reloj`.
  Son los mismos puertos y adaptadores que usa `ObtenerFichaUsuario`, sin el bloqueo, el historial de
  roles ni los eventos.
- **Por qué**: así "último ingreso" y "sesiones abiertas" significan lo mismo en la ficha del
  administrador y en el perfil (supuestos de la especificación). No se necesitan consultas ni
  migraciones nuevas.
- **Usuario inexistente o inactivo**: `JwtAuthGuard` ya rechaza las sesiones revocadas y las de
  usuarios desactivados. Si aun así el usuario no existe, el caso de uso lanza `ErrorAutenticacion`
  y la respuesta es 401 (nunca 404, que revelaría algo sobre otro id).
- **Alternativa descartada**: llamar a `ObtenerFichaUsuario` y recortar la respuesta. Haría
  consultas de más (bloqueos en Redis, historial y eventos) y mezclaría un caso del administrador con
  uno propio.

## R-04. Forma de la respuesta del perfil

- **Decisión**: esquema nuevo `PerfilPropio` con `nombreCompleto`, `correo`, `celularEnmascarado`,
  `roles` (códigos `Rol`), `ultimoIngreso` (fecha y hora o `null`) y `sesionesAbiertas`.
  `additionalProperties: false`. No lleva `id`, `activo` ni `debeCambiarClave`.
- **Por qué**: solo lo que pide FR-002. El portal pone el nombre de cada rol con `nombreDelRol`
  (`apps/web/src/paginas/admin/roles.ts`, que se mueve a una ubicación compartida), igual que la
  ficha de la 009. El celular se enmascara con `Celular.enmascarado()`, que ya usa `aUsuarioRespuesta`.
- **Alternativa**: devolver el nombre de cada rol desde la API. Se descarta porque el resto del
  contrato devuelve solo el código y el portal ya traduce.

## R-05. Cambio de clave voluntario

- **Decisión**: se reutiliza `POST /auth/cambiar-clave` y el caso de uso `CambiarClave` **sin
  cambios**: ya acepta a cualquier usuario autenticado, valida la clave actual con el límite de
  intentos, aplica `PoliticaClave`, rechaza una clave igual a la actual, registra `CLAVE_CAMBIADA`
  (actor = afectado = el usuario) en la misma transacción, cierra las demás sesiones y rota la
  actual.
- **Contrato**: solo cambian el `summary` y la `description` de la operación, para decir que también
  sirve como cambio voluntario. No cambian el esquema, los códigos de estado ni la forma.
- **Portal**: se reutiliza la página `CambiarClave` en `/cambiar-clave`. Si la sesión tenía
  `debeCambiarClave`, al terminar va a la pantalla de su rol (`inicioDe`). Si no, vuelve a `/perfil`
  con el aviso "Su clave se cambió" (FR-011). Con un cambio voluntario muestra un enlace "Volver a mi
  perfil".
- **Alternativa**: una pantalla nueva `/perfil/clave`. Duplicaría el formulario y sus mensajes sin
  ganar nada.

## R-06. Pantalla de inicio por rol

- **Decisión**: `inicioDe(roles)` en `apps/web/src/sesion/inicio.ts` recorre la lista ordenada
  `ADMINISTRADOR → /admin`, `MESA_PARTES → /personal/expedientes`, `EVALUADOR →
  /personal/expedientes`, `CAJA → /personal/caja`, `INSPECTOR → /personal/inspecciones`,
  `JEFATURA → /personal/tablero` y devuelve la primera que coincide. Sin roles devuelve `/perfil`
  con el estado `{ sinRol: true }`, para mostrar el mensaje de FR-014.
- **Por qué**: es la única función que ya usan `Ingresar` y `CambiarClave`. Es una función pura que
  se prueba con tablas.

## R-07. Regreso seguro a la pantalla pedida (sin redirección abierta)

- **Situación actual**: `Ingresar.tsx` ya tiene `destinoSeguro`, con la expresión
  `^\/(admin|personal|cambiar-clave)(\/[\w-]+)*$`, pero no comprueba el rol y no admite `/perfil`.
- **Decisión**: mover la regla a una función pura exportada `destinoDespuesDeIngresar(volverA,
  roles)` en `sesion/inicio.ts`, con dos filtros:
  1. **Forma**: solo una cadena que coincide con `^\/(perfil|cambiar-clave|admin|personal)(\/[A-Za-z0-9_-]+)*$`.
     Exige empezar con un solo `/` seguido de una letra, así que rechaza `//otro.sitio`, `/\otro`,
     `https://…`, `javascript:…`, `/%2F%2F…`, `/admin/../..`, rutas con `?`, `#`, `:`, `.`, `@`,
     espacios, cadenas vacías y valores que no son cadena.
  2. **Rol**: la ruta debe estar permitida para alguno de los roles, según la tabla
     `PERMISOS_PANTALLA` (por prefijo, de la más específica a la menos específica), que copia los
     `roles` de `Aplicacion.tsx`. `/perfil` y `/cambiar-clave` valen para todos.
  Si falla cualquiera de los dos filtros, devuelve `inicioDe(roles)`.
- **Por qué**: es la exigencia del usuario (solo rutas internas que empiecen con un `/`, nunca `//`
  ni una dirección externa) y FR-015 (solo si su rol la permite). Usar una lista blanca de
  caracteres es más seguro que buscar lo prohibido.
- **Prueba**: `inicio.test.ts` con una tabla de entradas maliciosas, todas con resultado
  `inicioDe(roles)`. También hay una prueba de `Ingresar` que monta la página con
  `state.volverA = '//evil.example'` y comprueba que termina en la pantalla del rol.
- **Alternativa descartada**: usar `new URL(volverA, location.origin)` y comparar el origen. Es
  correcto, pero acepta consultas y fragmentos y depende del navegador. La lista blanca es más simple
  de leer y de probar.

## R-08. Menú

- **Decisión**: dentro de `Menu`, junto a `menu__usuario`, un `<Link to="/perfil">Mi perfil</Link>`
  visible para cualquier sesión del personal. "Inicio" sigue llevando a la página pública.
- **Accesibilidad**: es un enlace real (se usa con el teclado), con `aria-current="page"` cuando la
  pantalla activa es `/perfil`. En 360 px el nombre, "Mi perfil" y "Cerrar sesión" se acomodan con
  `flex-wrap`, sin desplazamiento horizontal.

## R-09. Privacidad y registros

- Ni la ruta ni las consultas llevan datos personales.
- El proyecto **no usa pino**. Los registros de la API se escriben con el `Logger` de NestJS. La
  prueba de privacidad (`apps/api/test/integracion/datos-personales.e2e-spec.ts`) crea la aplicación
  de prueba con `crearAplicacionDePrueba` y el `LoggerCapturador`
  (`apps/api/test/apoyo/aplicacion-prueba.ts`). Con él comprueba que los registros capturados al
  pedir `/perfil` y al cambiar la clave no contienen el correo, el nombre, el celular completo, la
  clave actual ni la nueva.
- El código nuevo (`ObtenerMiPerfil` y `PerfilController`) no escribe registros con datos de la
  persona. Si escribe alguno, lo identifica solo con el `usuarioId` interno.
- La respuesta del perfil lleva `Cache-Control: no-store` para que ningún proxy ni el navegador la
  guarden (pedido del usuario; mismo patrón que la ficha de la 009).
- Ver el perfil no se registra en la auditoría (supuesto de la especificación).
