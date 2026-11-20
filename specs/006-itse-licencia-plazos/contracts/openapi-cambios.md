# Cambios en `docs/06-contrato-api/openapi.yaml` (006)

El contrato ya declara las operaciones de inspecciones, licencias, feriados y alertas. Se ajusta solo
lo necesario (principio II); los cambios se hacen en la fase 2, antes de los controladores.

## Operaciones existentes que se ajustan

| Operación | Cambio |
| --- | --- |
| `GET /inspecciones` (`listarInspecciones`) | Roles JEFATURA (todas) e INSPECTOR (solo las suyas). Agrega 422 (filtro inválido). |
| `POST /inspecciones/{id}/asignar` | Rol JEFATURA. 409 si ya tiene resultado; 422 si el usuario no es inspector activo o la fecha es pasada. |
| `POST /inspecciones/{id}/resultado` | Rol INSPECTOR (solo el asignado: 403 si no). `fotos` de 1 a **5** (antes 10); `observaciones` hasta 4000, obligatorias si es DESFAVORABLE; `numeroCertificado` con patrón `^[A-Za-z0-9/ -]{4,30}$` y nuevo `certificadoEmitidoEn` (fecha), ambos obligatorios si es FAVORABLE. 404 si no existe. |
| `GET /licencias/verificar/{codigo}` | Agrega 503 (no se pueden contar los intentos). `Cache-Control: no-store`. |
| `GET /licencias/{numero}` | Roles MESA_PARTES, EVALUADOR y JEFATURA, o `tokenConsulta` del mismo expediente. Agrega 403. |
| `GET /licencias/{numero}/pdf` | Igual que el anterior; agrega 403 y las cabeceras `Content-Disposition`, `X-Content-Type-Options` y `Cache-Control`. Se quita el 202 (el PDF se genera al pedirlo). |
| `GET /feriados` | Cualquier sesión del personal. Agrega 422 (año inválido). |
| `POST /feriados` | Rol ADMINISTRADOR. Agrega 422. |
| `GET /plazos/alertas` | Rol JEFATURA. Orden: más urgente primero. |
| `POST /expedientes/{n}/observar` | `plazoSubsanarEn` se marca como ignorado: el sistema lo calcula con 2 días hábiles. |
| `POST /expedientes/consultar` | `tokenConsulta` también en los estados con licencia; se llena `numeroLicencia`. |

## Operaciones nuevas

| Operación | Rol | Respuestas |
| --- | --- | --- |
| `GET /inspecciones/inspectores` (`listarInspectores`) | JEFATURA | 200 `[{id, nombre}]`, 401, 403 |
| `POST /plazos/alertas/{alertaId}/atender` (`atenderAlerta`) | JEFATURA | 200 `AlertaPlazo`, 401, 403, 404, 409 (ya atendida) |

## Esquemas

- `Inspeccion`: agrega `nombreLicencia`, `nombreInspector` (`string|null`), `numeroCertificado` y
  `certificadoEmitidoEn` (`null` si no hay); `direccion` solo para el inspector asignado.
- `AlertaPlazo`: agrega `id` (entero) y `atendidaPor` (`uuid|null`).
- `Expediente`: agrega `numeroLicencia` (`string|null`) para el detalle del personal.
- `LicenciaPublica`: `itseVenceEn` ya existe; se agrega `itseEstado` (`SIN_CERTIFICADO`, `VIGENTE`,
  `VENCIDO`).
