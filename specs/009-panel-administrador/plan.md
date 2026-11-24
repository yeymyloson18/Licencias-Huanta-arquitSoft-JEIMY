# Plan de implementación: Panel del administrador, auditoría de seguridad y buzón de pruebas

**Rama**: `009-panel-administrador` | **Fecha**: 2026-11-23 | **Especificación**: [spec.md](./spec.md)

**Entrada**: la especificación (con las aclaraciones del 2026-11-23) y la sección "Cómo construirlo" de
`docs/sdd/009-panel-administrador.md`.

## Resumen

1. **Auditoría de seguridad** en el módulo `seguridad`:
   - tabla nueva `seguridad.auditoria`, solo de agregar (migración `0012`, con un disparador que impide
     `UPDATE` y `DELETE`);
   - catálogo cerrado de 21 acciones en el dominio, con su texto en español;
   - los casos de uso de ingreso y de gestión de usuarios escriben el evento **en la misma
     transacción** que su cambio (los repositorios reciben los eventos a guardar);
   - catálogo y feriados **publican eventos** en `comun.evento_pendiente` dentro de su transacción y
     `seguridad` los consume con un manejador idempotente (clave única por id del evento de origen).
2. **Panel y ficha**:
   - `GET /admin/panel`: cifras del dominio puro, con conteos en PostgreSQL y bloqueos leídos de
     Redis por un puerto que no expone correos;
   - `GET /usuarios/{usuarioId}`: ficha con último ingreso, sesiones abiertas, bloqueo, historial de
     roles con nombres y últimos eventos;
   - `POST /usuarios/{usuarioId}/cerrar-sesiones` y `POST /usuarios/{usuarioId}/desbloquear`, con las
     reglas "no a sí mismo" del dominio.
3. **Consulta de la auditoría**: `GET /admin/auditoria` paginada con filtros y `formato=csv` (máximo
   10,000 filas, cabecera `X-Auditoria-Truncada`), con el mismo formato CSV de la 007.
4. **Buzón de pruebas**: servicio Mailpit en `infra/docker-compose.yml` (no en producción) y
   adaptadores SMTP con `nodemailer` para `EnviadorOTP` y `EnviadorMensajes`. Los adaptadores del
   buzón **también** dejan el código o el aviso en Redis como el simulado, para que pruebas, E2E,
   Postman y carga sigan leyendo el código. Configuración nueva `ENVIO_OTP=buzon` y
   `ENVIO_AVISOS=simulado|buzon`, rechazadas en producción según la aclaración.
5. **Portal**: `/admin` (panel, inicio del administrador), `/admin/auditoria` y
   `/admin/usuarios/:id` (ficha con botones y confirmaciones). El menú suma "Panel" y "Auditoría".
6. **Documentación**: README (panel, auditoría, buzón y recorrido por el enlace), diagrama de casos de
   uso, `docs/05` (esquema), contrato y su matriz de permisos, `docs/08-sprint-2/README.md`.

**Lo que no se ejecuta en local** (por la memoria del equipo): no se construyen imágenes ni se levanta
el sistema. En local corren lint, tipos, formato, contrato, regla de dependencia y pruebas unitarias
de la API y del portal. Las pruebas de integración (PostgreSQL y Redis reales), el E2E y Postman
corren en GitHub Actions.

**Dónde este plan se aparta de la entrada**:

| Entrada | Plan | Motivo |
| --- | --- | --- |
| "Leer los eventos de catálogo y feriados por las fachadas" como alternativa | Eventos en la cola consumidos por `seguridad` | Un solo lugar para filtrar, paginar y exportar; sin consultas cruzadas al paginar (research §R-02) |
| "El E2E fija `ENVIO_OTP=simulado`" o el buzón deja el código en Redis | Las dos cosas | El adaptador del buzón decora al simulado (Postman y carga siguen igual) y `e2e.yml` fija `simulado` como dice la aclaración |
| `CLAVE_INCORRECTA` para todo fallo de clave | Mismo código, con `detalle.motivo` (`CLAVE`, `CUENTA_INACTIVA`, `CORREO_NO_REGISTRADO`) | La lista de 21 acciones queda cerrada; el motivo distingue sin datos personales |

## Contexto técnico

**Lenguaje/versión**: TypeScript 5 estricto, Node.js 24 LTS.

**Dependencias nuevas**:

- API: `nodemailer` 10.4.0 (producción) y `@types/nodemailer` 8.0.2 (desarrollo). Ver research §R-07.
- Imagen `axllent/mailpit:v1.33.0` solo en el compose de desarrollo.

**Almacenamiento**: PostgreSQL 16 (tabla nueva `seguridad.auditoria`), Redis 7 (se leen y borran las
claves `lim:fallos:correo:*` por un puerto).

**Pruebas**: Jest + Supertest (API), Jest + Testing Library (portal), Playwright (E2E sin cambios),
Newman (humo, suma 3 peticiones 401 de los endpoints nuevos).

**Plataforma**: Docker Compose (desarrollo), mismo `docker-compose.prod.yml` sin Mailpit.

**Tipo de proyecto**: monorepo web (API NestJS + portal React).

**Metas de rendimiento**: panel y primera página de la auditoría en < 2 s con 10,000 eventos
(SC-001): índices por `ocurrido_en`, `accion` y `afectado_usuario_id`.

**Restricciones**: datos personales nunca en la auditoría, en los registros ni en la URL (los filtros
usan identificadores internos); la auditoría solo se agrega; poca memoria local.

**Escala**: 6 roles fijos, decenas de usuarios del personal, miles de eventos por mes.

## Verificación constitucional

| Principio | Cómo se cumple | Estado |
| --- | --- | --- |
| I. Monolito modular + Clean Architecture | Todo lo nuevo de auditoría vive en `seguridad`. Catálogo y plazos no importan nada de `seguridad`: solo insertan en `comun.evento_pendiente` (reaccionar a eventos está permitido). Dominio puro: acciones, reglas "no a sí mismo", cálculo del panel, enmascarado del destino del buzón | ✅ |
| II. Contrato primero | Se editan primero `openapi.yaml` (5 operaciones nuevas o ampliadas, esquemas y matriz de permisos) y se regeneran los tipos | ✅ |
| III. Un esquema por módulo | `seguridad.auditoria` en su esquema. `objeto` guarda el código de receta o la fecha (identificadores de negocio, sin FK). Migración `0012` y `docs/05` en el mismo commit | ✅ |
| IV. TypeScript estricto, español | Nombres en español: `EventoAuditoria`, `AccionAuditoria`, `CerrarSesionesDeUsuario`, `DesbloquearCuenta`, `EnviadorOtpBuzon` | ✅ |
| V. Toda tarea con prueba | Unitarias por cada pieza del dominio y caso de uso (≥ 80 %); integración por acción registrada, permisos, privacidad e idempotencia; portal por pantalla | ✅ |
| VI. Escenarios de calidad | EQ-04 (seguridad: matriz 401/403, privacidad, bloqueo/desbloqueo), EQ-05 (360 px y accesibilidad de 3 pantallas), EQ-06 (regla de dependencia en verde). EQ-01 no empeora: el ingreso suma un `INSERT` por intento | ✅ |
| VII. Datos personales | Auditoría con ids y nombres; origen solo como HMAC; destino del buzón enmascarado en el asunto; búsquedas por id; pruebas de privacidad de la tabla, el CSV y los registros | ✅ |
| VIII. Git | Rama propia, commits convencionales, un commit por fase, sin push ni PR | ✅ |

**Datos personales**: la ficha devuelve el correo en el cuerpo (ya lo hace la lista) y el celular
enmascarado. El buzón de desarrollo contiene el código y el aviso, que es su propósito; está
prohibido en producción.

Re-evaluación después del diseño: sin cambios, sin violaciones que justificar.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/009-panel-administrador/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-administrador.md
│   └── portal-administrador.md
├── checklists/requirements.md
└── tasks.md
```

### Código fuente

```text
apps/api/
├── prisma/migrations/0012_auditoria_seguridad/migration.sql
├── prisma/schema.prisma                                   (modelo AuditoriaSeguridad)
├── src/compartido/infraestructura/configuracion.ts        (ENVIO_OTP=buzon, ENVIO_AVISOS, SMTP_*)
├── src/compartido/dominio/destino-enmascarado.ts          (enmascarar celular o correo)
├── src/modulos/seguridad/
│   ├── dominio/
│   │   ├── accion-auditoria.ts          (21 acciones, grupos y textos)
│   │   ├── evento-auditoria.ts          (creación validada, sin datos personales)
│   │   ├── reglas-acciones-administrador.ts (no a sí mismo)
│   │   ├── panel-administrador.ts       (cálculo de cifras)
│   │   └── puertos/
│   │       ├── repositorio-auditoria.ts
│   │       ├── consulta-panel.ts
│   │       └── bloqueos-cuentas.ts
│   ├── aplicacion/
│   │   ├── obtener-panel.ts
│   │   ├── consultar-auditoria.ts
│   │   ├── obtener-ficha-usuario.ts
│   │   ├── cerrar-sesiones-de-usuario.ts
│   │   ├── desbloquear-cuenta.ts
│   │   ├── registrar-evento-configuracion.ts (consumo de eventos de catálogo y feriados)
│   │   └── (ingreso y gestión: registran su evento)
│   ├── infraestructura/
│   │   ├── repositorio-auditoria-postgres.ts
│   │   ├── consulta-panel-postgres.ts
│   │   ├── bloqueos-cuentas-redis.ts
│   │   ├── enviador-otp-buzon.ts
│   │   └── manejadores-configuracion.ts
│   └── presentacion/
│       ├── administrador.controller.ts  (/admin/panel, /admin/auditoria)
│       └── usuarios.controller.ts       (ficha, cerrar sesiones, desbloquear)
├── src/modulos/catalogo/infraestructura/unidad-de-trabajo-catalogo-postgres.ts (publica eventos)
├── src/modulos/plazos/infraestructura/repositorio-feriados-postgres.ts        (publica eventos)
├── src/modulos/notificaciones/infraestructura/enviador-buzon.ts
└── test/{unit,integracion}/...

apps/web/src/
├── paginas/admin/Panel.tsx, Auditoria.tsx, FichaUsuario.tsx (+ pruebas)
├── componentes/Confirmacion.tsx
├── servicios/clienteApi.ts             (panel, auditoría, ficha, acciones)
├── componentes/Menu.tsx, paginas/Ingresar.tsx, paginas/CambiarClave.tsx, Aplicacion.tsx
└── paginas/admin/Usuarios.tsx          (enlace "Ver ficha")

infra/docker-compose.yml                 (servicio mailpit, ENVIO_OTP/ENVIO_AVISOS=buzon)
docs/05-modelo-de-datos/esquema.sql, modelo-entidad-relacion.md
docs/06-contrato-api/openapi.yaml, README.md
docs/03-diseno-de-software/... (casos de uso)
tests/postman/humo.postman_collection.json
.github/workflows/e2e.yml                (ENVIO_OTP/ENVIO_AVISOS=simulado)
```

**Decisión de estructura**: la misma de las funcionalidades anteriores. No hay módulos nuevos.

## Seguimiento de complejidad

Sin violaciones de la constitución que justificar.
