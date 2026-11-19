# Cambios en `docs/06-contrato-api/openapi.yaml` (antes de programar)

Principio II: estos cambios se hacen primero, en el mismo PR. Después se regeneran los tipos de
`packages/contracts`, se pasa `redocly lint` y se actualiza la matriz de permisos de
`docs/06-contrato-api/README.md`. Decisiones: [research.md](../research.md).

## Operaciones

| Operación | Cambio | Seguridad | Respuestas |
|---|---|---|---|
| `POST /identidad/verificar` (`verificarIdentidadAdministrado`) | Descripción: valida al titular y, si viene, al representante (§R-01). El 422 de datos que no coinciden usa el mismo mensaje para cualquier dato (FR-007). Agrega `Cache-Control: no-store` | pública | 200 `DesafioOtp`, 422, 429 (`Retry-After`), 503 |
| `POST /identidad/verificar-otp` (`verificarOtpAdministrado`) | Descripción: el token es de un solo uso para presentar una solicitud (aclaración 2); `expiraEn = 900` | pública | 200 `TokenCorto`, 401, 429 |
| `POST /documentos` (`subirDocumento`) | Descripción: el tipo se comprueba por el contenido; los documentos vencen a las 24 h. En mesa de partes exige rol MESA_PARTES (403 con otro rol). Agrega 403 y 422 (archivo vacío o sin campo `archivo`) | `tokenIdentidad` o `bearerPersonal` (MESA_PARTES) | 201, 401, 403, 413, 415, 422 |
| `POST /expedientes` (`presentarSolicitud`) | `Idempotency-Key` **obligatoria** (nuevo parámetro `ClaveIdempotenciaObligatoria`). Agrega 409 (permiso ya usado en otra solicitud), 403 (la identidad enviada no es la confirmada, o el rol no es MESA_PARTES) y 503 (servicio de identificación caído en mesa de partes). El 422 lista cada requisito faltante en `errores[]` con `campo = documentos.requisito.<id>`; misma clave con otro cuerpo → 422 `campo = Idempotency-Key`. Agrega `Cache-Control: no-store` | `tokenIdentidad` o `bearerPersonal` (MESA_PARTES) | 201 `ExpedienteRegistrado` (+ `Location`), 200 `ExpedienteRegistrado` (reintento con la misma clave), 401, 403, 409, 422, 503 |
| `GET /expedientes` (`listarExpedientes`) | Descripción: roles MESA_PARTES, EVALUADOR y JEFATURA; todos los expedientes (aclaración 5); orden del más reciente al más antiguo; `porPagina` máximo 50. `asignadosAMi` y `vencenAntesDe`: "disponibles desde la 006 y la 008; en la 004 responden 422". `Cache-Control: no-store` | `bearerPersonal` | 200, 401, 403, 422 |
| `POST /expedientes/consultar` (`consultarEstado`) | Responde `EstadoPublico` (modificado abajo); 404 con el mismo cuerpo para cualquier dato que no coincida; 429 con `Retry-After` tras 5 fallos por origen en 15 min (aclaración 1). `Cache-Control: no-store` | pública | 200, 404, 422, 429 |
| `GET /expedientes/{numeroExpediente}` (`obtenerExpediente`) | Descripción: roles MESA_PARTES, EVALUADOR y JEFATURA; registra `VER_DETALLE`. En `Expediente.direccion`, la descripción pasa a "Solo para el personal con acceso al detalle (mesa de partes, evaluador y jefatura); la consulta pública nunca la muestra". `Cache-Control: no-store` | `bearerPersonal` | 200 `Expediente`, 401, 403, 404 |
| `GET /expedientes/{numeroExpediente}/documentos/{documentoId}` (`descargarDocumento`) | Cambia de 302 (URL firmada) a **200** con el archivo (`application/pdf`, `image/jpeg` o `image/png`), `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` y `Cache-Control: no-store` (§R-13). En la 004 solo `bearerPersonal` con los roles de la bandeja; `tokenConsulta` queda para la 005 y la 009 | `bearerPersonal` | 200, 401, 403, 404 |

## Esquemas

```yaml
# Renombra el campo `identidadPresencial` a `identidad` y lo hace obligatorio (§R-05): en línea
# debe coincidir con la identidad confirmada; en mesa de partes se valida con el servicio.
NuevaSolicitud:
  required: [codigoReceta, identidad, nombreTitular, giro, direccion, zona, documentos]
  properties:
    identidad: { $ref: '#/components/schemas/SolicitudVerificacionIdentidad' }
    expedienteOrigen: # sin cambios; en la 004 debe ser null (trámites conectados fuera de alcance)
    documentos:
      type: array
      maxItems: 30
      items: { $ref: '#/components/schemas/DocumentoAdjunto' }
  additionalProperties: false

ExpedienteRegistrado:          # se agregan campos para el comprobante (FR-021)
  required: [numero, estado, ruta, codigoReceta, nombreLicencia, canal, presentadoEn, vencePlazoEn, siguientePaso]
  properties:
    nombreLicencia: { type: string }
    canal: { type: string, enum: [EN_LINEA, MESA_PARTES] }
    presentadoEn: { type: string, format: date-time }
    siguientePaso: { type: string }

EstadoPublico:
  required: [numero, estado, descripcionEstado, ruta, nombreLicencia, presentadoEn, historial]   # tokenConsulta deja de ser obligatorio
  properties:
    descripcionEstado: { type: string, example: Tu solicitud fue registrada y espera evaluación }
    presentadoEn: { type: string, format: date-time }
    historial:
      type: array
      items:
        type: object
        required: [estado, descripcion, ocurridoEn]
        properties:
          estado: { $ref: '#/components/schemas/EstadoExpediente' }
          descripcion: { type: string }
          ocurridoEn: { type: string, format: date-time }
  additionalProperties: false   # nunca documento, RUC, celular, correo ni dirección (FR-033)
```

Parámetro nuevo `ClaveIdempotenciaObligatoria` (igual a `ClaveIdempotencia`, con
`required: true`); el existente sigue opcional para las operaciones de pagos.

## Matriz de permisos (README del contrato)

| Operación | Sin sesión | MESA_PARTES | EVALUADOR | JEFATURA | INSPECTOR / CAJA / ADMINISTRADOR |
|---|---|---|---|---|---|
| `verificarIdentidadAdministrado`, `verificarOtpAdministrado`, `consultarEstado` | pública | pública | pública | pública | pública |
| `subirDocumento`, `presentarSolicitud` | solo con `tokenIdentidad` | ✅ | 403 | 403 | 403 |
| `listarExpedientes`, `obtenerExpediente`, `descargarDocumento` | 401 | ✅ | ✅ | ✅ | 403 |
