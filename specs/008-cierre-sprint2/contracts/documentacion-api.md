# Contrato: documentación interactiva de la API (008)

| Ruta | Respuesta | Cabeceras |
| --- | --- | --- |
| `GET /api/docs` y `GET /api/docs/` | Página de Swagger UI (`index.html` propio) | `Content-Security-Policy` de la documentación (research §R-03), `Cache-Control: no-cache` |
| `GET /api/docs/<archivo>` | Archivos de `swagger-ui-dist` y `inicializador.js` | La misma CSP, `Cache-Control: public, max-age=86400` |
| `GET /api/docs/openapi.json` | El contrato `docs/06-contrato-api/openapi.yaml` convertido a JSON, idéntico | `Content-Type: application/json`, `Cache-Control: no-cache` |

- **Configuración**:
  - `DOCS_API`: `true` por defecto, salvo con `NODE_ENV=production`, donde es `false`.
  - `DOCS_API_CONTRATO`: ruta del YAML. Por defecto, la del repositorio o la de la imagen.
- **Apagada**: las tres rutas responden 404 (`problem+json` del filtro de errores).
- **"Authorize"**: usa el esquema `bearerPersonal` del contrato. El token no se guarda en el navegador.
- **Enlaces**: el pie del portal ("Documentación de la API", solo fuera de producción, según la
  variable del build `VITE_DOCS_API`, que vale `true` por defecto en desarrollo) y el README.
- **Sin cambios**: las rutas `/api/v1/**` y el resto del portal mantienen exactamente sus cabeceras. Lo
  comprueban una prueba de integración, para la API, y una de configuración, para nginx y Caddy.
