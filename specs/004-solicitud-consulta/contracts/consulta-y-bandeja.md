# Contrato: consulta pública y bandeja del personal

Fuente de verdad: `openapi.yaml` (ver [openapi-cambios.md](./openapi-cambios.md)). Decisiones:
[research.md](../research.md) §R-12 y §R-13.

## Consulta pública: `POST /expedientes/consultar`

| Situación | Respuesta |
|---|---|
| Número y DNI, CE o RUC del titular coinciden | 200 `EstadoPublico`: número, estado, descripción y siguiente paso en lenguaje sencillo, licencia, ruta, fecha de presentación e historial. `Cache-Control: no-store` |
| No coinciden, o el número no existe | 404 con el mismo cuerpo en todos los casos |
| Formato inválido del número o del documento | 422 (no cuenta como intento fallido de adivinar) |
| 5 fallos (404) desde el mismo origen en 15 min | El 6.º intento, aunque sea correcto → 429 con `Retry-After` |
| Contador de intentos no disponible | 503 (falla cerrado) |

El número se acepta con espacios alrededor y en minúsculas. El documento del representante no
sirve para consultar. La respuesta nunca incluye documento, RUC, celular, correo ni dirección.

### Textos del estado (dominio, `TEXTO_ESTADO_PUBLICO`)

| Estado | Descripción | Siguiente paso |
|---|---|---|
| `REGISTRADO` | Tu solicitud fue registrada y espera evaluación | La municipalidad revisará tus documentos y confirmará el nivel de riesgo |

Los demás estados de `EstadoExpediente` tienen su texto en la misma tabla, aunque se alcancen en
funcionalidades posteriores; una prueba comprueba que ningún estado queda sin texto.

## Bandeja: `GET /expedientes`

- Roles MESA_PARTES, EVALUADOR y JEFATURA: todos los expedientes (aclaración 5). Otros roles → 403;
  sin sesión → 401.
- Filtros `estado` y `ruta` (se combinan); `pagina` y `porPagina` (1 a 50, por defecto 20); orden
  `presentadoEn` descendente.
- `asignadosAMi` o `vencenAntesDe` → 422 "todavía no disponible" (006 y 008).
- Cada fila: número, licencia, ruta, estado, titular, giro y fecha de presentación.

## Detalle: `GET /expedientes/{numeroExpediente}`

- Mismos roles. Registra `VER_DETALLE` en la auditoría (usuario, número, fecha).
- Incluye el documento del titular enmascarado (`4*****21`), dirección, zona, área, canal,
  historial y documentos por requisito (en el orden de la receta al presentar).

## Documento: `GET /expedientes/{numeroExpediente}/documentos/{documentoId}`

- Mismos roles. 200 con el archivo, `Content-Disposition: attachment; filename="<nombre limpio>"`,
  `X-Content-Type-Options: nosniff` y `Cache-Control: no-store`.
- Un documento de otro expediente o inexistente → 404.
