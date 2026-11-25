# Guía de validación: Mi perfil del personal y pantalla de inicio por rol (011)

## En local (poca memoria: sin imágenes ni sistema completo)

```bash
npm run lint && npm run typecheck && npm run formato
npm run contrato && npm run generar     # primero el contrato (contracts/api-perfil.md)
npm run regla-dependencia
npm run cobertura                       # API: dominio y aplicación ≥ 80 %
npm test -w apps/web
```

Resultado esperado: todo en verde, incluidas las pruebas unitarias nuevas:

- API: `obtener-mi-perfil.spec.ts`. Devuelve los datos del usuario de la sesión, el celular
  enmascarado, el último ingreso y las sesiones abiertas de los puertos compartidos con la ficha.
  Con un usuario inexistente lanza `ErrorAutenticacion`.
- Portal:
  - `inicio.test.ts`: tabla de prioridad de roles y combinaciones; sin roles → `/perfil`;
    **todas las entradas de redirección abierta** de `contracts/portal-perfil.md` terminan en la
    pantalla del rol; las válidas se respetan.
  - `Ingresar.test.tsx`: con `volverA = '//evil.example'` termina en la pantalla del rol.
  - `Menu.test.tsx`: "Mi perfil" aparece para los 6 roles y sin roles.
  - `MiPerfil.test.tsx`: datos, celular enmascarado, "Sin registro", "1 sesión abierta", avisos y
    error con reintento.
  - `CambiarClave.test.tsx`: un cambio voluntario vuelve a `/perfil` con el aviso; uno obligatorio
    va a la pantalla del rol.

## En GitHub Actions

- Job `pruebas` (integración con PostgreSQL y Redis reales):
  - `perfil.e2e-spec.ts`:
    - 200 con los datos propios, que cumplen el contrato, y `Cache-Control: no-store`;
    - dos sesiones → `sesionesAbiertas = 2`;
    - después de cambiar la clave → 1;
    - el cambio voluntario registra `CLAVE_CAMBIADA` con actor = afectado.
  - `matriz-permisos-011.e2e-spec.ts`:
    - sin token → 401;
    - clave temporal → 403 `debe-cambiar-clave`;
    - cada uno de los 6 roles → 200 con **su** perfil;
    - `GET /perfil?usuarioId=<otro>` → su propio perfil;
    - `GET /perfil/<otro-id>` → 404 sin datos;
    - sesión cerrada o usuario desactivado → 401.
  - `privacidad-011` (en `datos-personales.e2e-spec.ts`):
    - la respuesta no trae `id`, la huella de la clave, el código ni el celular completo;
    - los registros capturados al pedir el perfil y al cambiar la clave no contienen el correo, el
      nombre, el celular ni la clave.
- Flujo `E2E` (Playwright, `tests/e2e/perfil.spec.ts`): ingresar con CAJA llega a
  `/personal/caja`; "Mi perfil" → "Cambiar mi clave" → vuelve al perfil con el aviso y "1 sesión
  abierta". La clave nueva se guarda en `tests/e2e/.datos/usuarios-demo.json` para los recorridos
  siguientes. Ninguna prueba de las rutas A y B esperaba `/` después de ingresar, así que no
  cambiaron.
- `Postman`: suma `GET /perfil` sin token → 401.
- Flujo `E2E`:
  - `tests/e2e/perfil.spec.ts` comprueba que no hay desplazamiento horizontal a 360 px;
  - Lighthouse móvil (`@lhci/cli@0.14.0`, 360×740) con sesión en `/perfil` y `/cambiar-clave` da
    accesibilidad ≥ 0.9;
  - el resultado se anota en `docs/08-sprint-2/README.md`.

### Medida de accesibilidad con sesión (T035): pendiente de medir

**Estado: pendiente de medir.** En el cierre de la 011 no se corrió Lighthouse en local. El único
sistema levantado en la máquina era el de desarrollo, con imágenes anteriores a la 011, y el E2E
regenera las claves de los usuarios de demostración. Por eso no hay puntajes todavía; no se anotó
ningún valor.

Cómo se mide (paso "Lighthouse móvil con sesión" de `.github/workflows/e2e.yml`, después de
Playwright):

- Configuración: `tests/e2e/lighthouserc.json`:
  - `http://localhost:8080/perfil` y `/cambiar-clave`;
  - `formFactor: mobile`, 360×740, `deviceScaleFactor: 2`;
  - `disableStorageReset: true` y `numberOfRuns: 1`;
  - aserción `categories:accessibility` ≥ 0.9.
- Ingreso: `tests/e2e/apoyo/lighthouse-ingreso.cjs` (`puppeteerScript`). Ingresa una vez como el
  usuario de demostración de CAJA, con la clave que dejó el E2E y el código simulado de Redis.
- Comando: `npx --yes -p @lhci/cli@0.14.0 -p puppeteer@23.11.1 lhci collect|upload|assert
  --config=tests/e2e/lighthouserc.json`. Los informes quedan en el artefacto `lighthouse-011`.
- Para medir en local, levantar un compose **de pruebas** con el código de la 011 y
  `ENVIO_OTP=simulado`, correr `npm run e2e` y luego los tres comandos anteriores.

Si alguna pantalla da menos de 0.9, se corrige en `apps/web/src/estilos/global.css` o en el
componente y se vuelve a medir. El puntaje y el enlace a la corrida se anotan en
`docs/08-sprint-2/README.md` §8.

## Recorrido manual (cuando se levante el sistema)

1. `docker compose -f infra/docker-compose.yml up -d --build` y crear usuarios de cada rol desde
   `/admin/usuarios`.
2. Ingresar con cada uno y comprobar la pantalla de llegada:
   - administrador → panel;
   - mesa de partes y evaluador → Expedientes;
   - caja → Caja;
   - inspector → Inspecciones;
   - jefatura → Tablero;
   - inspector y caja juntos → Caja.
3. Pulsar "Mi perfil": aparecen el nombre, el correo, `9*****321`, los roles, el último ingreso y
   "1 sesión abierta". Ingresar desde otra ventana privada y recargar: aparecen "2 sesiones
   abiertas".
4. "Cambiar mi clave" con las dos claves nuevas distintas → "Las claves nuevas no coinciden". Con
   datos correctos → vuelve al perfil con "Su clave se cambió" y "1 sesión abierta". La otra ventana
   queda sin sesión.
5. Como administrador, en `/admin/auditoria`, aparece "Clave cambiada" con la persona como actor.
6. Sin sesión, abrir `/ingresar` con `volverA = //evil.example` en el estado de navegación (o seguir
   un enlace preparado): después de ingresar se queda en el portal, en la pantalla del rol.
7. Con DevTools en 360 px: menú, perfil y formulario sin desplazamiento horizontal.
