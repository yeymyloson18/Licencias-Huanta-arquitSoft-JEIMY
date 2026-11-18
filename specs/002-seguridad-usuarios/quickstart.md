# Guía de validación: Seguridad y usuarios del personal municipal

Escenarios ejecutables que demuestran la funcionalidad 002 de punta a punta. Los detalles de cada
interfaz están en [contracts/](./contracts/) y las entidades en [data-model.md](./data-model.md).
Los ejemplos usan `curl` desde bash (Git Bash en Windows) contra el portal (`localhost:8080`, mismo
origen que el navegador) y datos **ficticios**.

## Requisitos previos

- La funcionalidad 001 funcionando (`docker compose -f infra/docker-compose.yml up -d --build`, los
  4 servicios `healthy`). La API aplica la migración `0003` al arrancar.
- Variables de abreviatura para esta guía:

```bash
C="docker compose -f infra/docker-compose.yml"
API=http://localhost:8080/api/v1
otp() { $C exec -T redis redis-cli GET "dev:otp:$1"; }   # código simulado (solo desarrollo)
```

## 1. Primer administrador (historia 3, FR-023, FR-024)

```bash
$C exec -T -e ADMIN_CORREO=admin@ejemplo.pe -e ADMIN_NOMBRE="Admin de Prueba" \
  -e ADMIN_CELULAR=987654321 -e ADMIN_CLAVE=ClaveTemporal2026 api npm run crear-administrador
$C exec -T -e ADMIN_CORREO=otro@ejemplo.pe -e ADMIN_NOMBRE="Otro" \
  -e ADMIN_CELULAR=987654322 -e ADMIN_CLAVE=OtraClave20260 api npm run crear-administrador
```

**Esperado**: la primera ejecución imprime `Administrador creado. Id: <uuid>…`; la segunda,
`Ya existe un administrador activo; no se hizo ningún cambio.` Guardar el id: `ADMIN_ID=<uuid>`.
`gitleaks` sobre el repositorio sigue en 0 hallazgos.

## 2. Inicio de sesión en dos pasos y cambio de clave temporal (historia 1)

```bash
curl -s -X POST $API/auth/iniciar-sesion -H 'Content-Type: application/json' \
  -d '{"correo":"admin@ejemplo.pe","clave":"ClaveTemporal2026"}'          # → desafioId
curl -s -c cookies.txt -X POST $API/auth/verificar-otp -H 'Content-Type: application/json' \
  -d "{\"desafioId\":\"<desafioId>\",\"codigo\":\"$(otp $ADMIN_ID)\"}"      # → accessToken
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer <accessToken>" $API/usuarios
```

**Esperado**: 200 con `celularEnmascarado` `9*****321`; 200 con `debeCambiarClave: true` y la
cookie `refresh_personal` (`HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`) en `cookies.txt`, sin
`refreshToken` en el cuerpo; `GET /usuarios` → **403** `debe-cambiar-clave`.

```bash
curl -s -b cookies.txt -c cookies.txt -X POST $API/auth/cambiar-clave \
  -H "Authorization: Bearer <accessToken>" -H 'Content-Type: application/json' \
  -d '{"claveActual":"ClaveTemporal2026","claveNueva":"ClaveDefinitiva2026"}'
```

**Esperado**: 200 con un `accessToken` nuevo y `debeCambiarClave: false`; con ese token,
`GET /usuarios` → 200. Probar también `claveNueva` = `"corta1"` → 422 sin la clave en el cuerpo.

## 3. Renovar, reutilización y cierre (FR-003, FR-004, research §R-06)

```bash
cp cookies.txt cookies-viejas.txt
curl -s -b cookies.txt -c cookies.txt -X POST $API/auth/renovar        # 200 y cookie nueva
sleep 11
curl -s -o /dev/null -w '%{http_code}\n' -b cookies-viejas.txt -X POST $API/auth/renovar   # 401
curl -s -o /dev/null -w '%{http_code}\n' -b cookies.txt -X POST $API/auth/renovar          # 401
```

**Esperado**: reutilizar la cookie rotada responde 401 y cierra **todas** las sesiones del usuario,
así que la cookie vigente también deja de servir. Iniciar sesión otra vez y luego
`POST /auth/cerrar-sesion` → 204; un `renovar` posterior → 401, y `GET /usuarios` con el
`accessToken` de esa sesión (aunque no haya vencido) → **401** (FR-004, FR-013).

## 4. Fuerza bruta y límite de códigos (historia 4, EQ-04, SC-003)

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "$i: %{http_code}\n" -X POST $API/auth/iniciar-sesion \
    -H 'Content-Type: application/json' -d '{"correo":"admin@ejemplo.pe","clave":"Incorrecta123"}'
done
curl -s -i -X POST $API/auth/iniciar-sesion -H 'Content-Type: application/json' \
  -d '{"correo":"admin@ejemplo.pe","clave":"ClaveDefinitiva2026"}' | grep -iE '^HTTP|retry-after'
```

**Esperado**: intentos 1–5 → 401; el 6.º y el intento con la clave correcta → **429** con
`Retry-After`. Repetir con `noexiste@ejemplo.pe`: mismas respuestas (no se distingue el correo).
Para volver a empezar: `$C exec -T redis redis-cli --scan --pattern 'lim:*' | xargs -r $C exec -T redis redis-cli DEL`.
Pedir el código 4 veces seguidas con credenciales correctas → el 4.º responde 429 (FR-002a).

## 5. Permisos por rol y efecto inmediato (historia 2, FR-011, FR-015)

Como administrador, crear un usuario `caja@ejemplo.pe` con rol `CAJA` (`POST /usuarios`), iniciar
sesión con él (cambiando su clave temporal) y luego:

- `GET /usuarios` con su token → **403** `sin-permiso`; sin token → **401**.
- El administrador lo desactiva (`PATCH /usuarios/{id}` con `{"activo":false}`): la siguiente
  petición de `caja` con el mismo token → **401**; `renovar` con su cookie → **401**.
- Reactivarlo, darle `JEFATURA` además de `CAJA` y luego quitarle `JEFATURA`: una operación de
  jefatura responde 403 en su siguiente petición, sin que cierre sesión.

**Esperado**: lo anterior, y la matriz automática en verde:
`npm run test:integracion -w apps/api -- matriz-permisos-usuarios`.

## 6. Nunca sin administrador (FR-020, SC-006)

Con un solo administrador activo: `PUT /usuarios/{ADMIN_ID}/roles` con `{"roles":["JEFATURA"]}` o
`PATCH` con `{"activo":false}` → **409** `ultimo-administrador`. La prueba de concurrencia
(`npm run test:integracion -w apps/api -- ultimo-administrador`) termina en verde.

## 7. Historial de roles (FR-019)

```bash
$C exec -T postgres psql -U licencias -d licencias -c \
  "SELECT rol_codigo, asignado_en IS NOT NULL AS asignado, retirado_en IS NOT NULL AS retirado
   FROM seguridad.usuario_rol ORDER BY asignado_en;"
```

**Esperado**: la asignación de `JEFATURA` del escenario 5 aparece retirada (con `retirado_por`), no
borrada.

## 8. Datos personales protegidos (FR-027 a FR-029, SC-007)

```bash
$C exec -T postgres psql -U licencias -d licencias -c \
  "SELECT position(convert_to('admin@ejemplo.pe','UTF8') IN correo_cifrado) = 0 AS correo_oculto,
          position(convert_to('987654321','UTF8') IN celular_cifrado) = 0 AS celular_oculto,
          clave_hash LIKE '\$argon2id\$%' AS clave_con_argon2id
   FROM seguridad.usuario WHERE id = '$ADMIN_ID';"
$C logs api web 2>&1 | grep -ciE 'ejemplo\.pe|98765432|Clave(Temporal|Definitiva)2026'
```

**Esperado**: las tres columnas en `t` (el correo y el celular no aparecen en claro; la clave solo
como huella argon2id); el `grep` de logs devuelve **0**. La prueba automática de SC-007 termina en
verde.

## 9. Envío simulado prohibido en producción (FR-031)

```bash
$C run --rm -e NODE_ENV=production -e ENVIO_OTP=simulado api node dist/main.js; echo "salida=$?"
```

**Esperado**: la API no arranca (salida ≠ 0) y el mensaje nombra `ENVIO_OTP` sin mostrar valores.

## 10. Portal desde el celular (FR-025, FR-026, SC-001, SC-008 a SC-010)

Abrir http://localhost:8080/ingresar con las herramientas de desarrollo a 360 px:

- Iniciar sesión en dos pasos en menos de 1 minuto, cronometrado desde que se abre `/ingresar`
  (SC-001); con clave temporal, el portal lleva a `/cambiar-clave`.
- Con un usuario recién creado, cronometrar desde su primer ingreso hasta tener la clave cambiada y
  ver el menú: menos de 2 minutos (SC-008).
- Como administrador, crear un usuario con dos roles en `/admin/usuarios` en menos de 2 minutos
  (SC-009).
- Anotar los tres tiempos en la sección de verificación del `README.md`.
- Recargar la página: la sesión se mantiene (renovación con la cookie); en DevTools > Application,
  ni `localStorage` ni `sessionStorage` contienen tokens.
- Lighthouse móvil en `/ingresar`, `/cambiar-clave` y `/admin/usuarios`: accesibilidad ≥ 90 y buenas
  prácticas ≥ 90.

## 11. Escaneo OWASP ZAP (EQ-04, research §R-18)

```bash
docker run --rm -t -v "$PWD:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable   zap-baseline.py -t http://host.docker.internal:8080 -r zap-informe.html
```

**Esperado**: 0 alertas de riesgo medio o alto sin corregir ni justificar (las justificadas quedan
anotadas en el README); `zap-informe.html` no se versiona.

## 12. Calidad (CI)

```bash
npm run build && npm run lint && npm run formato && npm test && npm run cobertura \
  && npm run regla-dependencia && npm run contrato
```

**Esperado**: todo en verde, incluida la prueba de equivalencia entre la base migrada y
`docs/05-modelo-de-datos/esquema.sql` (research §R-15); los 5 checks del PR en verde.
