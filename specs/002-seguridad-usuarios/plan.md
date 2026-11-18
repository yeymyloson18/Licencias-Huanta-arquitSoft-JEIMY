# Plan de implementación: Seguridad y usuarios del personal municipal

**Rama**: `002-seguridad-usuarios` | **Fecha**: 2026-11-17 | **Especificación**: [spec.md](./spec.md)

**Entrada**: especificación de `specs/002-seguridad-usuarios/spec.md` (con 5 aclaraciones del
2026-11-17) y plan técnico de `docs/sdd/002-seguridad-plan.md`.

## Resumen

Implementar el módulo `seguridad` (sus 4 capas) sobre la base de la 001: inicio de sesión del
personal en dos pasos (correo + clave con argon2id, luego OTP de 6 dígitos por un puerto
`EnviadorOTP` con adaptador simulado), sesión con JWT de acceso de 15 minutos y refresh token opaco
en cookie `HttpOnly`/`SameSite=Strict` con rotación y detección de reutilización (máximo 8 h, cierre
tras 30 min sin actividad), límites compartidos en Redis (5 fallos en 15 min por correo y por IP;
3 códigos en 15 min), efecto inmediato de desactivar o cambiar roles mediante una versión de
seguridad por usuario (Redis con respaldo en PostgreSQL), control de permisos reutilizable
(`@RequiereRoles`, `JwtAuthGuard`, `RolesGuard`) expuesto por la fachada, gestión de usuarios con
historial de roles y la regla "nunca sin administrador" con bloqueo de filas, el comando
`crear-administrador` y tres pantallas del portal (`/ingresar`, `/cambiar-clave`,
`/admin/usuarios`).

**Primero el contrato y el modelo** (principios II y III), en el mismo PR y antes del código:

1. `docs/06-contrato-api/openapi.yaml` según [contracts/openapi-cambios.md](./contracts/openapi-cambios.md).
2. Migración `0003_seguridad_usuarios` y actualización de `docs/05-modelo-de-datos/` según
   [data-model.md](./data-model.md), con la nueva prueba de equivalencia (research §R-15).

**Dónde este plan se aparta de la entrada** (la constitución prevalece, sección Gobernanza):

| Entrada | Plan | Motivo |
|---|---|---|
| Parámetro `buscar` en `GET /usuarios` | `POST /usuarios/busqueda` con el texto en el cuerpo | Principio VII: el nombre o el correo buscado no puede ir en la URL (research §R-13) |
| Solo el celular cifrado | También el correo: `correo_cifrado` + `correo_hmac` | Principio III / MD3 exige cifrar el correo (research §R-04) |
| Columnas de `sesion`: `ultima_actividad_en`, `vence_maximo_en` | Además `refresh_anterior_hash` y `rotada_en`; `usuario.version_seguridad` | Necesarias para detectar la reutilización y para el respaldo en PostgreSQL que la propia entrada pide |
| "Actualizar `esquema.sql`" | `esquema.sql` = estado actual; `0001` congelada; prueba de equivalencia estructural | La prueba de la 001 exige `0001 == esquema.sql` y `0001` ya está aplicada (research §R-15) |

## Contexto técnico

**Lenguaje/versión**: TypeScript 5.x con `"strict": true` sobre Node.js 24 LTS (igual que la 001).

**Dependencias principales**: las de la 001 (NestJS 11, Prisma 6 con `multiSchema`, ioredis 5,
React 19 + Vite, openapi-fetch) más: `argon2` (huellas argon2id), `@nestjs/jwt` (token de acceso),
`cookie-parser` (cookie del refresh token) y `react-router` 7 (rutas del portal). `node:crypto` para
AES-256-GCM, HMAC-SHA256 y números aleatorios, siempre detrás de puertos (research §R-01).

**Almacenamiento**: PostgreSQL 16, esquema `seguridad` (migración `0003`); Redis 7 para límites de
intentos, versión de seguridad y OTP simulado (research §R-07, §R-08, §R-11).

**Pruebas**: Jest + ts-jest (unitarias de dominio y aplicación con dobles de los puertos; portal con
jsdom + Testing Library), Supertest + Ajv contra `openapi.yaml` (integración), prueba de concurrencia
del último administrador, matriz de permisos por rol, fuerza bruta y búsqueda de datos personales en
respuestas y logs.

**Plataforma objetivo**: contenedores Linux (Docker Compose en desarrollo y CI); navegadores móviles
desde 360 px.

**Tipo de proyecto**: aplicación web (monorepo de la 001: `apps/api`, `apps/web`,
`packages/contracts`).

**Metas de rendimiento**: una operación protegida añade solo la verificación del JWT en memoria y una
lectura en Redis, sin consultar PostgreSQL en el caso normal (EQ-01); el inicio de sesión completo
cabe en < 1 minuto para la persona (SC-001), con argon2id ≈ 50–100 ms por verificación.

**Restricciones**: ninguna clave ni código en claro en la base, logs, URL o respuestas (FR-027 a
FR-029); claves de cifrado, HMAC y JWT solo por variables de entorno, con valores de ejemplo
rechazados en producción (research §R-16); envío simulado prohibido en producción (FR-031); el
comando único de la 001 sigue funcionando sin crear archivos.

**Escala/alcance**: personal municipal del orden de decenas a pocos cientos de usuarios; varias
instancias de la API detrás del balanceador (contadores y versiones en Redis compartido); 1 módulo
con 13 casos de uso, 11 operaciones HTTP (5 de `/auth` y 6 de `/usuarios`, incluida la búsqueda),
3 pantallas del portal y 1 comando de instalación.

## Verificación constitucional

*Puerta: debe pasar antes de la fase 0 y revisarse después de la fase 1.*

| Principio / puerta | Cómo lo cumple este plan | Estado |
|---|---|---|
| **I. Monolito modular con Clean Architecture** | Todo en `apps/api/src/modulos/seguridad/{dominio,aplicacion,infraestructura,presentacion}`. Criptografía, tiempo, Redis y JWT detrás de puertos del dominio (research §R-01), así `dominio/` y `aplicacion/` no importan npm ni `node:*`. Otros módulos usan solo `fachada.ts` (decoradores, guards y `FachadaSeguridad`). Sin cambios en `.dependency-cruiser.cjs`. | ✅ |
| **II. Contrato primero** | `openapi.yaml` se cambia primero ([contracts/openapi-cambios.md](./contracts/openapi-cambios.md)); los tipos del portal se regeneran; las pruebas de integración validan cada respuesta con Ajv; `redocly lint` en CI. | ✅ |
| **III. Modelo de datos por módulo** | Solo se toca el esquema `seguridad`, con la migración versionada `0003` y `docs/05-modelo-de-datos/` actualizado en el mismo PR. Correo y celular cifrados con AES-256-GCM y buscados por HMAC-SHA256; claves con argon2id (MD3). `asignado_por`/`retirado_por` sin FK hacia otros esquemas. Equivalencia `docs` ↔ migraciones verificada por prueba (research §R-15). | ✅ |
| **IV. TypeScript estricto y lenguaje del dominio** | `strict` y sin `any`. Nombres en español: `Usuario`, `AsignacionRol`, `CodigoOtp`, `Sesion`, `PoliticaClave`, `ReglaUltimoAdministrador`, `IniciarSesion`, `VerificarOtp`, `RenovarSesion`, `CambiarClave`, `ReemplazarRoles`, `AsignarClaveTemporal`, `CrearPrimerAdministrador`, `EnviadorOTP`, `LimitadorIntentos`. Términos técnicos de librerías (`JwtAuthGuard`) se mantienen. | ✅ |
| **V. Toda tarea incluye su prueba** | Unitarias de cada objeto de valor, regla y caso de uso; integración de cada endpoint; umbral 80 % en `dominio`/`aplicacion` del módulo. | ✅ |
| **VI. Escenarios de calidad** | **EQ-04** (principal): matriz por rol de los endpoints de usuarios (Jest + Supertest), fuerza bruta con bloqueo exacto en el 6.º intento, sin datos personales en errores; OWASP ZAP y testssl.sh quedan para el entorno de pruebas desplegado (no existe aún). **EQ-01**: sin consulta a PostgreSQL por petición en el caso normal. **EQ-05**: Lighthouse ≥ 90 en las 3 pantallas. **EQ-06**: el adaptador SMS se cambia sin tocar casos de uso. | ✅ |
| **VII. Protección de datos personales** | Búsqueda por `POST` (no en la URL); errores sin datos personales; logs solo con `usuarioId`/`sesionId` (research §R-17); OTP y límite de 5 intentos en 15 minutos; prueba automática de SC-007 sobre respuestas y logs. | ✅ |
| **VIII. Flujo Git disciplinado** | Rama `002-seguridad-usuarios`, commits convencionales, PR con los 5 checks en verde. | ✅ |
| **Puertas de CI (5)** | Las mismas de la 001; el job `pruebas` incorpora la equivalencia de esquema y la concurrencia; `cobertura` incluye el módulo. El workflow necesita las variables nuevas con valores de ejemplo (`JWT_SECRETO`, `CLAVE_CIFRADO_DATOS`, `CLAVE_HMAC_DATOS`). | ✅ |

**Módulos afectados**: `seguridad` (nuevo código en sus 4 capas); `compartido` (configuración,
`trust proxy`, `cookie-parser`, logger de pruebas). Ningún otro módulo cambia; Catálogo y Salud
siguen públicos.
**Cambios en el contrato OpenAPI**: 3 operaciones nuevas, 6 modificadas, 4 esquemas nuevos y 3
modificados, 1 esquema de seguridad nuevo (`cookieRefresh`) y catálogo de tipos de problema
([detalle](./contracts/openapi-cambios.md)).
**Cambios en el modelo de datos**: `usuario`, `usuario_rol` y `sesion` del esquema `seguridad`
(migración `0003`, [detalle](./data-model.md)).
**Datos personales**: correo, nombre y celular del personal; correo y celular cifrados, nombre en
claro (lo necesita la búsqueda; no está en la lista de MD3), ninguno en URL, logs ni errores.

**Resultado de la puerta (antes de la fase 0)**: aprobada, con las cuatro diferencias respecto de la
entrada resueltas a favor de la constitución (tabla del resumen); ninguna excepción que justificar.
**Revisión después de la fase 1**: aprobada; [data-model.md](./data-model.md) y
[contracts/](./contracts/) no introducen violaciones.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/002-seguridad-usuarios/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas (R-01 a R-17)
├── data-model.md        # Fase 1: migración 0003, entidades y reglas
├── quickstart.md        # Fase 1: guía de validación de punta a punta
├── contracts/           # Fase 1: contratos de interfaz
│   ├── openapi-cambios.md
│   ├── autenticacion.md
│   ├── control-permisos.md
│   ├── portal-seguridad.md
│   └── crear-administrador.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea este comando)
```

### Código fuente (raíz del repositorio)

```text
docs/
├── 05-modelo-de-datos/
│   ├── esquema.sql                  # estado actual (columnas nuevas de seguridad)
│   └── modelo-entidad-relacion.md   # diagrama y diccionario del esquema seguridad
└── 06-contrato-api/
    ├── openapi.yaml                 # cambios de contracts/openapi-cambios.md
    └── README.md                    # operaciones nuevas, cookie, búsqueda por POST

.env.example                         # + NODE_ENV, JWT_SECRETO, CLAVE_CIFRADO_DATOS, CLAVE_HMAC_DATOS,
                                     #   ENVIO_OTP, TRUST_PROXY_SALTOS (valores ficticios)
infra/docker-compose.yml             # mismas variables con valores por defecto de desarrollo
.github/workflows/ci.yml             # variables de ejemplo en los jobs pruebas y cobertura

apps/api/
├── package.json                     # + argon2, @nestjs/jwt, cookie-parser; script crear-administrador
├── prisma/
│   ├── schema.prisma                # regenerado con db pull tras 0003
│   └── migrations/0003_seguridad_usuarios/migration.sql
├── src/
│   ├── configurar-aplicacion.ts     # + trust proxy, cookie-parser
│   ├── compartido/infraestructura/configuracion.ts   # + variables nuevas y reglas de producción
│   └── modulos/seguridad/
│       ├── dominio/                 # Usuario, AsignacionRol, CodigoOtp, Sesion, Correo, Celular,
│       │                            # NombreCompleto, Rol, PoliticaClave, ReglaUltimoAdministrador,
│       │                            # errores y puertos (RepositorioUsuarios, RepositorioSesiones,
│       │                            # RepositorioCodigosOtp, HasherClaves, ProtectorDatos,
│       │                            # GeneradorSecretos, EmisorTokens, LimitadorIntentos,
│       │                            # AlmacenVersionSeguridad, EnviadorOTP, Reloj)
│       ├── aplicacion/              # IniciarSesion, VerificarOtp, RenovarSesion, CerrarSesion,
│       │                            # CambiarClave, ListarUsuarios, BuscarUsuarios, CrearUsuario,
│       │                            # ActualizarUsuario, ReemplazarRoles, AsignarClaveTemporal,
│       │                            # CrearPrimerAdministrador, ResolverUsuarioAutenticado
│       ├── infraestructura/         # Repositorio*Postgres, HasherClavesArgon2, ProtectorDatosAesGcm,
│       │                            # GeneradorSecretosCrypto, EmisorTokensJwt, LimitadorIntentosRedis,
│       │                            # AlmacenVersionSeguridadRedis, EnviadorOtpSimulado, RelojSistema
│       ├── presentacion/            # AuthController, UsuariosController, JwtAuthGuard, RolesGuard,
│       │                            # decoradores Roles/RequiereRoles/UsuarioActual, DTO,
│       │                            # cli/crear-administrador.ts
│       ├── seguridad.module.ts      # @Global, cableado con useFactory
│       └── fachada.ts               # RequiereRoles, Roles, guards, UsuarioActual, Rol, FachadaSeguridad
└── test/
    ├── unit/modulos/seguridad/      # dominio, aplicación, guards
    ├── unit/migraciones.spec.ts     # 0001 congelada (SHA-256) y 0002 == datos-semilla.sql
    ├── integracion/
    │   ├── autenticacion.e2e-spec.ts
    │   ├── fuerza-bruta.e2e-spec.ts
    │   ├── control-permisos.e2e-spec.ts        # controlador de prueba @RequiereRoles('CAJA')
    │   ├── matriz-permisos-usuarios.e2e-spec.ts
    │   ├── usuarios.e2e-spec.ts
    │   ├── ultimo-administrador.e2e-spec.ts    # concurrencia
    │   ├── crear-administrador.e2e-spec.ts
    │   ├── datos-personales.e2e-spec.ts        # SC-007 en respuestas y logs
    │   └── esquema-equivalente.e2e-spec.ts     # docs/esquema.sql ≡ migraciones
    └── apoyo/                       # sesiones de prueba, lector del OTP simulado, logger capturador

apps/web/
├── package.json                     # + react-router
└── src/
    ├── main.tsx                     # enrutador
    ├── sesion/                      # ProveedorSesion, renovación, inactividad, Web Locks
    ├── servicios/clienteApi.ts      # middleware Authorization + reintento tras 401
    ├── componentes/                 # Menu, RutaProtegida, CampoFormulario
    └── paginas/
        ├── Ingresar.tsx             # (+ .test.tsx)
        ├── CambiarClave.tsx         # (+ .test.tsx)
        └── admin/Usuarios.tsx       # (+ .test.tsx), formularios de alta y edición
```

**Decisión de estructura**: la misma de la 001. El módulo `seguridad` ocupa sus carpetas ya creadas
(con `.gitkeep`) y añade `fachada.ts` y `seguridad.module.ts` como Catálogo. El comando de
instalación es un adaptador de entrada más, por eso vive en `presentacion/cli/`.

## Seguimiento de complejidad

No hay violaciones de la constitución que justificar.
