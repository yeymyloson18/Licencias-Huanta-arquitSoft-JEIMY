# Modelo de datos: Mi perfil del personal y pantalla de inicio por rol (011)

**No hay cambios de esquema ni migraciones.** Todo se arma con tablas que ya existen en el esquema
`seguridad` (002 y 009). `docs/05-modelo-de-datos/` no cambia.

## Perfil propio (solo lectura, no se guarda)

| Campo | Origen | Regla |
| --- | --- | --- |
| `nombreCompleto` | `seguridad.usuario.nombre_completo` | tal cual |
| `correo` | `seguridad.usuario.correo` | completo; solo lo ve su dueño |
| `celularEnmascarado` | `seguridad.usuario.celular_cifrado` → `Celular.enmascarado()` | primer dígito y 3 últimos (`9*****321`); nunca completo |
| `roles` | asignaciones vigentes (sin `retirado_en`) | códigos `Rol`; el portal muestra el nombre |
| `ultimoIngreso` | `RepositorioAuditoria.ultimoIngreso(usuarioId)` | último `INGRESO_CORRECTO`; `null` si no hay |
| `sesionesAbiertas` | `ConsultaPanel.sesionesAbiertasDe(usuarioId, ahora)` | no revocadas ni vencidas, incluida la actual |

**Nunca incluye**: `id`, `clave_hash`, códigos de 6 dígitos ni su HMAC, celular completo, HMAC del
correo o del celular, ni datos de otra persona.

**Identidad**: el `usuarioId` sale **solo** de la sesión validada por `JwtAuthGuard`; no hay
parámetro de entrada.

## Pantalla principal por rol (constante del portal)

| Prioridad | Rol | Pantalla |
| --- | --- | --- |
| 1 | `ADMINISTRADOR` | `/admin` |
| 2 | `MESA_PARTES` | `/personal/expedientes` |
| 3 | `EVALUADOR` | `/personal/expedientes` |
| 4 | `CAJA` | `/personal/caja` |
| 5 | `INSPECTOR` | `/personal/inspecciones` |
| 6 | `JEFATURA` | `/personal/tablero` |
| — | sin roles | `/perfil` con el aviso de FR-014 |

## Permisos por pantalla (para el regreso después de ingresar)

Se buscan por prefijo, de la ruta más específica a la menos específica. Copian los `roles` de las
rutas de `Aplicacion.tsx`.

| Prefijo | Roles |
| --- | --- |
| `/perfil`, `/cambiar-clave` | cualquiera con sesión |
| `/admin` | `ADMINISTRADOR` |
| `/personal/mesa-partes` | `MESA_PARTES` |
| `/personal/expedientes` | `MESA_PARTES`, `EVALUADOR`, `JEFATURA` |
| `/personal/caja` | `CAJA` |
| `/personal/inspecciones/<id>/resultado` | `INSPECTOR` |
| `/personal/inspecciones` | `JEFATURA`, `INSPECTOR` |
| `/personal/tablero`, `/personal/alertas`, `/personal/auditoria` | `JEFATURA` |
| cualquier otra | ninguno → pantalla del rol |

## Evento de auditoría

Sin acciones nuevas. El cambio voluntario genera `CLAVE_CAMBIADA` (grupo Ingresos, ya existente),
con `actor = afectado = usuario` y sin la clave, en la misma transacción que el cambio.
