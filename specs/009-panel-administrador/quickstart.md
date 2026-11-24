# Guía de validación: Panel del administrador, auditoría de seguridad y buzón (009)

## En local (poca memoria: sin imágenes ni sistema completo)

```bash
npm run lint && npm run typecheck && npm run formato
npm run contrato && npm run generar
npm run regla-dependencia
npm run cobertura   # API: dominio y aplicación ≥ 80 % por archivo
npm test -w apps/web
```

Resultado esperado: todo en verde; las pruebas unitarias nuevas de `seguridad` (acciones, evento,
reglas, panel, casos de uso) y del portal (Panel, Auditoría, Ficha, Confirmación, Menú, Ingresar).

## En GitHub Actions

- Job `pruebas` (integración con PostgreSQL y Redis reales):
  - `auditoria-seguridad.e2e-spec.ts`: cada una de las 21 acciones aparece al ocurrir; el intento con
    correo inexistente no identifica a nadie; la tabla rechaza `UPDATE` y `DELETE`;
  - `administrador.e2e-spec.ts`: panel, ficha, cerrar sesiones (la sesión deja de servir y el
    usuario sigue activo), desbloquear (puede volver a intentar), "no a sí mismo";
  - `matriz-permisos-009.e2e-spec.ts`: 5 operaciones × (sin sesión + 5 roles);
  - `privacidad-009.e2e-spec.ts`: ni correo, ni celular, ni clave, ni código, ni IP en la tabla, el
    CSV ni los registros;
  - consumo idempotente de los eventos de catálogo y feriados (el mismo evento dos veces → una fila);
  - buzón: con un servidor SMTP de prueba en proceso, el adaptador entrega el mensaje con el destino
    enmascarado y deja el código en Redis;
  - `esquema-equivalente`: migración 0012 = `docs/05`.
- Flujos `E2E` y `Postman`: siguen en verde (Postman suma 3 peticiones 401 de los endpoints nuevos).

## Recorrido manual por el enlace (cuando se levante el sistema)

1. `docker compose -f infra/docker-compose.yml up -d --build`.
2. Crear el primer administrador (único paso de terminal):
   `docker compose -f infra/docker-compose.yml exec api npm run crear-administrador`.
3. Abrir `http://localhost:8080/ingresar`, escribir correo y clave, y abrir `http://localhost:8025`:
   llega "Código de ingreso para 9•••••…" con el código. Escribirlo.
4. Se abre `/admin` con las tarjetas. Crear un usuario, equivocarse 5 veces con su clave y ver la
   tarjeta "Cuentas bloqueadas" en 1.
5. Abrir su ficha, "Desbloquear cuenta" → confirmar → entra en el acto.
6. Abrir `/admin/auditoria`, filtrar por "Cuenta desbloqueada" y descargar el CSV.
