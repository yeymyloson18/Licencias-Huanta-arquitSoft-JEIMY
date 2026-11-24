# Modelo de datos: Panel del administrador, auditoría de seguridad y buzón de pruebas (009)

## 1. Tabla nueva `seguridad.auditoria` (migración `0012_auditoria_seguridad`)

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `id` | `bigint` identidad | no | clave primaria |
| `ocurrido_en` | `timestamptz` | no | `DEFAULT now()` |
| `accion` | `varchar(30)` | no | `CHECK (accion IN (…las 21 acciones…))` |
| `actor_usuario_id` | `uuid` | sí | ref. lógica a `seguridad.usuario` (sin FK: el historial no se pierde) |
| `afectado_usuario_id` | `uuid` | sí | ídem |
| `objeto` | `varchar(40)` | sí | código de receta o fecha `AAAA-MM-DD`; nunca un dato personal |
| `resultado` | `varchar(10)` | no | `CHECK (resultado IN ('EXITO','RECHAZADO'))` |
| `origen_hmac` | `char(64)` | sí | HMAC-SHA256 hexadecimal de la IP; solo eventos de ingreso |
| `detalle` | `jsonb` | no | `DEFAULT '{}'`; claves permitidas por acción (§3) |
| `evento_origen_id` | `bigint` | sí | `UNIQUE`; id de `comun.evento_pendiente` para la idempotencia |

**Índices**:

- `ix_auditoria_seg_ocurrido (ocurrido_en DESC, id DESC)`: lista y CSV.
- `ix_auditoria_seg_accion (accion, ocurrido_en DESC)`: filtro por acción y cifras del panel.
- `ix_auditoria_seg_afectado (afectado_usuario_id, ocurrido_en DESC) WHERE afectado_usuario_id IS NOT NULL`:
  ficha y último ingreso.
- `ix_auditoria_seg_actor (actor_usuario_id, ocurrido_en DESC) WHERE actor_usuario_id IS NOT NULL`.
- `UNIQUE (evento_origen_id)` (los nulos no chocan).

**Solo de agregar**: función `seguridad.auditoria_solo_agregar()` que lanza
`'La auditoría de seguridad no se puede modificar ni borrar'`, con disparadores `BEFORE UPDATE OR
DELETE … FOR EACH ROW` y `BEFORE TRUNCATE … FOR EACH STATEMENT`.

**Retención**: sin borrado automático (aclaración). Estimación: ~3,000 eventos por mes → < 40,000
por año, unos pocos MB.

Se refleja en `docs/05-modelo-de-datos/esquema.sql` y `modelo-entidad-relacion.md` en el mismo commit
(la prueba `esquema-equivalente` compara). `prisma/schema.prisma` suma el modelo `AuditoriaSeguridad`
(`@@map("auditoria")`, `@@schema("seguridad")`).

## 2. Acción de auditoría (dominio, lista cerrada)

| Grupo | Código | Texto en pantalla |
| --- | --- | --- |
| Ingresos | `INGRESO_CORRECTO` | Ingreso correcto |
| | `CLAVE_INCORRECTA` | Clave incorrecta |
| | `CODIGO_INCORRECTO` | Código incorrecto |
| | `CUENTA_BLOQUEADA` | Cuenta bloqueada por intentos |
| | `ORIGEN_BLOQUEADO` | Origen bloqueado por intentos |
| | `CIERRE_SESION` | Cierre de sesión |
| | `CLAVE_CAMBIADA` | Clave cambiada |
| Gestión de usuarios | `USUARIO_CREADO` | Usuario creado |
| | `USUARIO_EDITADO` | Usuario editado |
| | `USUARIO_DESACTIVADO` | Usuario desactivado |
| | `USUARIO_REACTIVADO` | Usuario reactivado |
| | `ROL_ASIGNADO` | Rol asignado |
| | `ROL_QUITADO` | Rol quitado |
| | `CLAVE_TEMPORAL_ASIGNADA` | Clave temporal asignada |
| | `SESIONES_CERRADAS` | Sesiones cerradas por el administrador |
| | `CUENTA_DESBLOQUEADA` | Cuenta desbloqueada |
| Configuración | `RECETA_ACTUALIZADA` | Receta actualizada |
| | `RECETA_DESACTIVADA` | Receta desactivada |
| | `RECETA_REACTIVADA` | Receta reactivada |
| | `FERIADO_REGISTRADO` | Feriado registrado |
| | `FERIADO_ELIMINADO` | Feriado eliminado |

Los fallos de ingreso para el panel son `CLAVE_INCORRECTA`, `CODIGO_INCORRECTO`, `CUENTA_BLOQUEADA` y
`ORIGEN_BLOQUEADO`.

## 3. Evento de auditoría (dominio)

```text
EventoAuditoria {
  accion: AccionAuditoria
  actorUsuarioId: string | null
  afectadoUsuarioId: string | null
  objeto: string | null          (≤ 40, solo [A-Z0-9_-] o fecha AAAA-MM-DD)
  resultado: 'EXITO' | 'RECHAZADO'
  origenHmac: string | null      (64 hex)
  detalle: DetalleAuditoria
  eventoOrigenId: bigint | null
  ocurridoEn: Date
}
```

**Detalle permitido** (cualquier otra clave se rechaza al crear el evento):

| Clave | Valores | Acciones |
| --- | --- | --- |
| `motivo` | `CLAVE`, `CUENTA_INACTIVA`, `CORREO_NO_REGISTRADO`, `DESAFIO_NO_VALIDO` | `CLAVE_INCORRECTA`, `CODIGO_INCORRECTO` |
| `rol` | uno de los 6 roles | `ROL_ASIGNADO`, `ROL_QUITADO`, `USUARIO_CREADO` (lista `roles`) |
| `roles` | lista de roles | `USUARIO_CREADO` |
| `campos` | `nombreCompleto`, `celular` | `USUARIO_EDITADO` |
| `sesiones` | entero ≥ 0 | `SESIONES_CERRADAS` |
| `segundos` | entero ≥ 0 | `CUENTA_BLOQUEADA`, `ORIGEN_BLOQUEADO` |

Así ningún valor libre (que podría traer un correo o un nombre de otro) entra al `jsonb`.

## 4. Eventos de la cola publicados por otros módulos

| Tipo | Lo publica | Datos (`comun.evento_pendiente.datos`) | Acción |
| --- | --- | --- | --- |
| `RecetaActualizada` | catálogo | `{ codigoReceta, usuarioId, en }` | `RECETA_ACTUALIZADA` |
| `RecetaDesactivada` | catálogo | ídem | `RECETA_DESACTIVADA` |
| `RecetaReactivada` | catálogo | ídem | `RECETA_REACTIVADA` |
| `FeriadoRegistrado` | plazos | `{ fecha, usuarioId, en }` | `FERIADO_REGISTRADO` |
| `FeriadoEliminado` | plazos | ídem | `FERIADO_ELIMINADO` |

`en` es la hora del cambio y pasa a `ocurrido_en` (no la hora de consumo).

## 5. Lecturas (sin tablas nuevas)

- **Panel**: `PanelAdministrador { usuarios: {activos, inactivos}, porRol: Record<Rol, number>,
  bloqueos: {cuentas, origenes} | null, sesionesAbiertas, ingresosFallidos: {hoy, ultimos7Dias},
  ultimosEventos: FilaAuditoria[10] }`.
- **Ficha**: `FichaUsuario { usuario (como hoy), ultimoIngreso: Date | null, sesionesAbiertas,
  bloqueo: {bloqueada, hasta} | null, historialRoles: [{rol, asignadoPor, asignadoEn, retiradoPor?,
  retiradoEn?}] (con nombres), ultimosEventos: FilaAuditoria[10] }`.
- **Fila de auditoría**: `{ id, ocurridoEn, accion, textoAccion, actor: {id, nombre} | null,
  afectado: {id, nombre} | null, objeto, resultado }`. `detalle` y `origen_hmac` no se exponen.

## 6. Mensaje del buzón (solo desarrollo, sin persistencia propia)

| Campo | Valor |
| --- | --- |
| De | `buzon@licencias.local` |
| Para | `pruebas@licencias.local` |
| Asunto | `Código de ingreso para 9•••••123`, `Código de verificación de identidad para 9•••••123` o `Aviso de su trámite para ju•••@correo.pe` |
| Cuerpo | el código de 6 dígitos y su vigencia, o el texto del aviso |
