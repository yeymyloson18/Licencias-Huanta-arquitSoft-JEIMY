# Plan de implementación: Mi perfil del personal y pantalla de inicio por rol

**Rama**: `011-mi-perfil-inicio-rol` | **Fecha**: 2026-11-24 | **Especificación**: [spec.md](./spec.md)

**Entrada**: la especificación y las indicaciones del usuario: seguir la constitución y los patrones
de la 002 y la 009; contrato OpenAPI primero; reutilizar el cambio de clave y el cálculo de último
ingreso y sesiones de la ficha; perfil con `Cache-Control: no-store`; el regreso a la pantalla pedida
solo acepta rutas internas que empiecen con `/` (nunca `//` ni una dirección externa), con su prueba.

## Resumen

1. **Contrato primero** (`docs/06-contrato-api/openapi.yaml`):
   - operación nueva `GET /perfil` → `PerfilPropio`, cualquier rol, sin parámetros, con
     `Cache-Control: no-store`;
   - en `POST /auth/cambiar-clave` solo cambia la descripción (ahora también es un cambio voluntario);
   - matriz de permisos actualizada. Después, `npm run generar`.
2. **API, módulo `seguridad`** (sin migraciones):
   - caso de uso `ObtenerMiPerfil`, que reutiliza `RepositorioAuditoria.ultimoIngreso` y
     `ConsultaPanel.sesionesAbiertasDe` (los mismos puertos de `ObtenerFichaUsuario`);
   - `perfil.controller.ts` con `JwtAuthGuard` y sin roles; el usuario sale solo del token;
   - `CambiarClave` **no cambia**: ya registra `CLAVE_CAMBIADA` y cierra las demás sesiones.
3. **Portal**:
   - enlace "Mi perfil" en el menú;
   - página nueva `/perfil`;
   - `CambiarClave` distingue el cambio voluntario (vuelve a `/perfil`) del obligatorio (va a la
     pantalla del rol);
   - `inicioDe(roles)` con la prioridad de roles;
   - `destinoDespuesDeIngresar(volverA, roles)`: lista blanca de forma y permiso por rol, contra las
     redirecciones abiertas, con su tabla de pruebas maliciosas.
4. **Pruebas**:
   - unitarias de dominio y aplicación (≥ 80 %);
   - integración: perfil, matriz de permisos 011 y privacidad;
   - portal: inicio, Ingresar, Menú, MiPerfil y CambiarClave;
   - ajuste del E2E que esperaba `/` después de ingresar;
   - Postman: `GET /perfil` sin token → 401.
5. **Documentación**: contrato y su matriz, README (pantalla de llegada y Mi perfil), diagrama de casos
   de uso (caso "Ver mi perfil"), `docs/08-sprint-2/README.md` si corresponde.

**Lo que no se ejecuta en local** (memoria del equipo): no se construyen imágenes ni se levanta el
sistema. En local corren lint, tipos, formato, contrato, regla de dependencia y pruebas unitarias. La
integración, el E2E y Postman corren en GitHub Actions.

**Dónde este plan se aparta de la especificación** (sin cambiar lo que pide):

| Especificación | Plan | Motivo |
| --- | --- | --- |
| "Botón 'Cambiar mi clave'" que abre un formulario | Reutiliza la página `/cambiar-clave` | El formulario, los mensajes y las reglas son los mismos de la 002 (research §R-05) |
| "Sus roles con su nombre en pantalla" | La API devuelve códigos y el portal pone los nombres | Mismo criterio que la ficha y la lista de usuarios (research §R-04) |

## Contexto técnico

**Lenguaje/versión**: TypeScript 5 estricto, Node.js 24 LTS.

**Dependencias principales**: NestJS (API), React + React Router (portal), los tipos generados
`@licencias/contracts`. **Sin dependencias nuevas.**

**Almacenamiento**: PostgreSQL 16, esquema `seguridad`. Solo lectura (`usuario`, asignaciones de rol,
`sesion` y `auditoria`); el cambio de clave escribe como en la 002. Sin migraciones.

**Pruebas**: Jest (unitarias de la API), Jest + Supertest (integración, en CI), Jest + Testing
Library (portal), Playwright (E2E, en CI), Newman (humo), Lighthouse (accesibilidad).

**Plataforma**: Docker Compose (desarrollo) y el mismo compose de producción. Sin cambios de
infraestructura.

**Tipo de proyecto**: monorepo web (API NestJS + portal React).

**Metas de rendimiento**: perfil visible en menos de 2 s (SC-002). Son 1 lectura del usuario y 2
conteos con índices existentes, en paralelo.

**Restricciones**:

- datos personales nunca en la URL ni en los registros;
- solo el perfil propio (sin parámetro de usuario);
- `Cache-Control: no-store`;
- sin redirecciones abiertas;
- 360 px;
- poca memoria local.

**Escala**: decenas de usuarios del personal, 6 roles fijos.

## Verificación constitucional

| Principio | Cómo se cumple | Estado |
| --- | --- | --- |
| I. Monolito modular + Clean Architecture | Todo vive en `seguridad`: `ObtenerMiPerfil` (aplicación) depende solo de puertos del dominio ya existentes; el controlador (presentación) usa el guard del módulo. Ningún módulo nuevo ni importación entre módulos | ✅ |
| II. Contrato primero | Se edita primero `openapi.yaml` (`GET /perfil`, `PerfilPropio`, descripción de `cambiar-clave`, matriz) y se regeneran los tipos; la integración valida la respuesta contra el contrato | ✅ |
| III. Un esquema por módulo | Solo se leen tablas de `seguridad`. Sin cambios de esquema; `docs/05` no cambia | ✅ |
| IV. TypeScript estricto, español | `ObtenerMiPerfil`, `PerfilPropio`, `MiPerfil`, `destinoDespuesDeIngresar`, `PERMISOS_PANTALLA` | ✅ |
| V. Toda tarea con prueba | Unitarias por cada caso de uso y función pura; integración de permisos y privacidad; portal por pantalla; prueba explícita de redirección abierta | ✅ |
| VI. Escenarios de calidad | EQ-04: matriz 401/403, propiedad del perfil, privacidad, `no-store`, límite de intentos en el cambio de clave, sin redirección abierta. EQ-05: Lighthouse ≥ 90 a 360 px. EQ-06: regla de dependencia en verde. EQ-01: no empeora (una lectura liviana) | ✅ |
| VII. Datos personales | Sin datos en la URL; celular enmascarado; sin id, huella ni código en la respuesta; registros sin cuerpos; el perfil no se cachea; el correo solo lo ve su dueño | ✅ |
| VIII. Git | Rama propia `011-mi-perfil-inicio-rol` (hoy se está en `main`: crearla antes de cualquier commit), commits convencionales, un commit por fase | ✅ |

Re-evaluación después del diseño: sin cambios y sin violaciones que justificar.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/011-mi-perfil-inicio-rol/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-perfil.md
│   └── portal-perfil.md
├── checklists/requirements.md
└── tasks.md            (lo crea /speckit-tasks)
```

### Código fuente

```text
docs/06-contrato-api/openapi.yaml                 (GET /perfil, PerfilPropio, cambiar-clave, matriz)
packages/contracts/                               (tipos regenerados)

apps/api/src/modulos/seguridad/
├── aplicacion/obtener-mi-perfil.ts               (nuevo)
├── presentacion/perfil.controller.ts             (nuevo: GET /perfil, no-store)
├── presentacion/respuestas.ts                    (aPerfilRespuesta)
└── seguridad.module.ts                           (registra caso de uso y controlador)
apps/api/test/
├── unit/modulos/seguridad/aplicacion/obtener-mi-perfil.spec.ts
└── integracion/
    ├── perfil.e2e-spec.ts
    ├── matriz-permisos-011.e2e-spec.ts
    └── datos-personales.e2e-spec.ts            (casos del perfil y del cambio de clave)

apps/web/src/
├── sesion/inicio.ts (+ inicio.test.ts)          (inicioDe, destinoDespuesDeIngresar, PERMISOS_PANTALLA)
├── componentes/Menu.tsx (+ test)                 ("Mi perfil")
├── componentes/roles.ts                          (nombreDelRol, movido desde paginas/admin)
├── paginas/personal/MiPerfil.tsx (+ test)        (nueva)
├── paginas/CambiarClave.tsx (+ test)             (voluntario → /perfil)
├── paginas/Ingresar.tsx (+ test)                 (usa destinoDespuesDeIngresar)
├── servicios/clienteApi.ts                       (obtenerMiPerfil)
├── estilos/                                      (menú a 360 px)
└── Aplicacion.tsx                                (ruta /perfil)

tests/e2e/                                        (llegada por rol; flujo Mi perfil → cambiar clave)
tests/postman/humo.postman_collection.json        (GET /perfil sin token → 401)
README.md, docs/03-diseno-de-software/...         (caso de uso "Ver mi perfil")
```

**Decisión de estructura**: la misma de las funcionalidades anteriores. No hay módulos ni esquemas
nuevos.

## Riesgos

- **Pruebas que esperan `/` después de ingresar** (portal y E2E): se ajustan en la misma fase que
  cambia `inicioDe`.
- **La tabla `PERMISOS_PANTALLA` se desincroniza de `Aplicacion.tsx`**: una prueba recorre las rutas
  protegidas declaradas y comprueba que todas tienen una entrada en la tabla. Si una ruta futura no
  tiene entrada, el regreso cae en la pantalla del rol (falla cerrado).

## Seguimiento de complejidad

Sin violaciones de la constitución que justificar.
