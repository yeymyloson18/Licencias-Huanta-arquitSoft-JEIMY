# Contrato: identidad del administrado, documentos y presentación

Fuente de verdad: `openapi.yaml` (ver [openapi-cambios.md](./openapi-cambios.md)). Decisiones:
[research.md](../research.md) §R-01 a §R-11.

## Identidad en línea

| Paso | Petición | Resultado |
|---|---|---|
| 1 | `POST /identidad/verificar` con RUC, DNI + fecha de emisión (o CE), celular y, si actúa, el representante | El servicio de identificación compara. `COINCIDE` → se crea la verificación, se envía el código (5 min) y responde 200 `DesafioOtp` con el celular enmascarado. `NO_COINCIDE` → 422 con un mensaje que no dice qué dato falló. `NO_DISPONIBLE` → 503 "No pudimos verificar tu identidad en este momento. Puedes acudir a mesa de partes" |
| 2 | `POST /identidad/verificar-otp` con `desafioId` y `codigo` | Correcto → 200 `TokenCorto` (`tokenIdentidad`, 900 s, un solo uso). Incorrecto o vencido → 401 |

- **Intentos** (§R-07): 5 por huella del documento y 5 por origen en 15 min para cada paso; 3 envíos
  de código por huella del celular en 15 min. El 6.º → 429 con `Retry-After`. Si Redis no responde →
  503 (falla cerrado).
- **Token**: audiencia `identidad-administrado`, `jti` = id de la verificación; no se acepta como
  token del personal ni al revés. Sin datos personales.

## Documentos

`POST /documentos` (multipart `archivo`):

| Caso | Respuesta |
|---|---|
| PDF, JPG o PNG reales de hasta 10 MB | 201 `{ documentoId, sha256 }` |
| Más de 10 MB | 413 |
| Contenido que no es PDF, JPG ni PNG (aunque la extensión diga `.pdf`) | 415 |
| Sin archivo o vacío | 422 |
| Sin `tokenIdentidad` ni sesión | 401 |
| Sesión del personal sin rol MESA_PARTES | 403 |

Un documento solo sirve para quien lo subió (misma verificación o mismo usuario) y vence a las 24 h.

## Presentación

`POST /expedientes` con `Idempotency-Key` (UUID) y `NuevaSolicitud`, en este orden:

1. **Autorización**: con `tokenIdentidad` válido (canal `EN_LINEA`) o sesión con rol MESA_PARTES
   (canal `MESA_PARTES`). Sin ninguno → 401; otro rol → 403.
2. **Idempotencia**: si la clave ya existe con el mismo cuerpo → 200 con el mismo
   `ExpedienteRegistrado`; con otro cuerpo → 422 en `Idempotency-Key`.
3. **Identidad**: en línea, `identidad` debe coincidir con la confirmada (huellas) → si no, 403. En
   mesa de partes se comprueba con el servicio: `NO_COINCIDE` → 422, `NO_DISPONIBLE` → 503.
4. **Receta**: licencia activa del catálogo (`expedienteOrigen = null`); si no → 422 en
   `codigoReceta`.
5. **Datos**: titular, establecimiento y área (bodega ≤ 50 m²) → 422 por campo.
6. **Requisitos**: cada obligatorio que aplica con su documento; cada `documentoId` subido por el
   mismo solicitante, con menos de 24 h y de un requisito de la receta. Faltantes o inválidos → 422
   con `campo = documentos.requisito.<id>`.
7. **Transacción**: número `EXP-AAAA-NNNNNN`, expediente REGISTRADO con `receta_al_presentar`,
   documentos, historial, auditoría, evento `SolicitudPresentada` y clave de idempotencia. Un
   permiso ya usado en otra solicitud → 409.
8. **Respuesta**: 201 `ExpedienteRegistrado` con `Location: /api/v1/expedientes/<número>`.

Ningún mensaje de error repite documento, RUC, celular, correo ni dirección.
