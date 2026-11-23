# Colecciones de Postman (008)

- `licencias-huanta.postman_collection.json`: todos los endpoints, generada desde
  `docs/06-contrato-api/openapi.yaml` con `npm run postman:generar`. Para probar la API desde Postman.
- `humo.postman_collection.json`: recorrido de humo con pruebas (públicos con éxito, protegidos con
  401 y 403). Lo ejecuta Newman en el flujo `.github/workflows/postman.yml`.
- `desarrollo.postman_environment.json`: `baseUrl` (`http://localhost:8080/api/v1`) y los tokens
  **vacíos**. Ninguna clave ni token se guarda aquí: en el CI los genera `preparar-entorno.mjs` con
  usuarios de demostración creados en el ejecutor.
