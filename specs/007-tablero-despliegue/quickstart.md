# Guía de validación: 007

Datos ficticios. Las pruebas automáticas usan los contenedores temporales `pg-pruebas-007` (puerto
5433) y `redis-pruebas-007` (puerto 16379), nunca el stack principal.

## 1. Tablero y reporte (local)

1. Ejecutar `npm run test:integracion -w apps/api -- reportes`. Pasan las suites de tablero, reporte y
   CSV, caché, matriz 401/403 y privacidad.
2. Con el sistema de desarrollo levantado, entrar como JEFATURA y abrir `/personal/tablero`:
   - se ven el mes actual, las tres secciones con sus tablas y los gráficos con texto alternativo;
   - a 360 px no hay desplazamiento horizontal.
3. Elegir "Vigentes" y luego "Descargar CSV". Al abrirlo en Excel se ven las columnas separadas, con
   tildes correctas, sin documento, RUC, celular, correo ni dirección.
4. Si se detiene Redis, el tablero sigue respondiendo.

## 2. E2E (local o CI)

1. Levantar el sistema con `docker compose -f infra/docker-compose.yml up -d --build`.
2. Ejecutar `npm run e2e`. Pasan `ruta-a` y `ruta-b` en los proyectos `celular` y `escritorio`.
3. En GitHub, el flujo `E2E` aparece en el PR. Los 5 checks obligatorios no cambian.

## 3. Producción en local (sin servidor)

1. Ejecutar `infra/produccion/verificar-local.sh`. Levanta el proyecto aislado `prod007` con
   `DOMINIO=localhost` en puertos libres, y al terminar lo baja con `-v`. Comprueba:
   - que solo Caddy publica puertos;
   - las cabeceras de caché y de seguridad, y la compresión;
   - la redirección de HTTP a HTTPS;
   - que con `api-a` detenida, 20 de 20 consultas a `/api/v1/salud` y al catálogo responden 200;
   - que las conexiones de PgBouncer a PostgreSQL son ≤ 20 con carga en las 2 réplicas;
   - que `respaldo.sh` deja el dump y el tar, y que `restaurar.sh` compara los conteos con todo
     `ok`;
   - que `desplegar.sh` funciona con una versión buena (código 0) y con una que no arranca (código
     1 y vuelta a la anterior).
2. El resultado esperado es una línea "OK" por cada comprobación y el código de salida 0.

## 4. En el servidor (cuando exista) **[servidor]**

1. Seguir `docs/07-despliegue/guia-vps.md`: droplet, llave, ufw, Docker, usuario `despliegue`,
   `.env`, secretos en GitHub y primer despliegue.
2. Abrir `https://<ip-con-guiones>.sslip.io`: certificado válido y solo TLS 1.3.
3. Ejecutar `verificar-puertos.sh <ip>` desde la PC. Solo responden 22, 80 y 443.
4. Hacer un cambio pequeño en `main`: el flujo `CD` lo despliega en 15 minutos o menos, sin cortes.
5. Ejecutar a mano `k6.yml` (`eq01-100`, `eq01-1000` y `eq02-picos` con 1 y 2 réplicas) y
   `calidad-produccion.yml`, y copiar los resultados en `docs/07-despliegue/resultados.md` y en el
   README.
6. Sembrar los datos de demostración con
   `docker compose exec api-a node dist/scripts/sembrar-demostracion.js`. Las claves aparecen una sola
   vez.
7. Aplicar el SUS a 5 personas (`docs/07-despliegue/sus.md`) y anotar el puntaje.
