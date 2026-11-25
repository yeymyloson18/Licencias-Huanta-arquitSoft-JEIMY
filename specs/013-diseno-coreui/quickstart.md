# Guía de validación: Diseño visual del portal con CoreUI (013)

## 0. Antes de cambiar nada: línea base y capturas "antes"

Se toma en un compose **aislado**, para no tocar los datos de desarrollo y sin usar el proveedor de
IA. La línea `ORIENTACION_API_KEY=` vacía del entorno manda sobre `infra/.env`.

```bash
export PUERTO_WEB=8090 PUERTO_API=3001 PUERTO_POSTGRES=5434 PUERTO_REDIS=6381 PUERTO_BUZON=8026
ORIENTACION_API_KEY= docker compose -f infra/docker-compose.yml -p licencias-medida up -d --build --wait
E2E_PROYECTO=licencias-medida E2E_URL=http://localhost:8090 CAPTURAS=antes \
  npx playwright test -c tests/e2e/playwright.config.ts capturas.spec.ts
node tests/e2e/apoyo/lighthouse-medida.mjs --url http://localhost:8090 --proyecto licencias-medida \
  --corridas 3 --salida docs/08-sprint-2/evidencias/diseno-013/linea-base.md
```

Resultado:

- `docs/08-sprint-2/evidencias/diseno-013/antes/`: 6 pantallas × 2 tamaños;
- `linea-base.md`: rendimiento y accesibilidad (mediana de 3 corridas) de cada pantalla.

Esta medida fija el piso de SC-003.

## 1. En local (puertas)

```bash
npm ci
npm run lint && npm run typecheck && npm run formato
npm test -w apps/web       # 497 actuales + las nuevas, todas en verde
npm run build -w apps/web  # Sass compila; revisar el tamaño del CSS y del JS en la salida de Vite
```

Pruebas nuevas del portal:

- `useModoColor` y `aplicarModoGuardado`: elección guardada y almacenamiento bloqueado;
- `migasDe`: sin datos personales;
- `opcionesDe`: las mismas opciones por rol;
- `InsigniaEstado`: los 13 estados;
- contraste de las parejas del tema, en ambos modos;
- `DisenoPersonal` y `DisenoPublico`:
  - botón del menú con `aria-expanded`;
  - desplegable con "Mi perfil" y "Cerrar sesión";
  - "Acceso del personal" o "Ir a mi trabajo".

## 2. Después: medidas y capturas

Con el mismo compose aislado, reconstruido con el diseño nuevo:

```bash
CAPTURAS=despues E2E_PROYECTO=licencias-medida E2E_URL=http://localhost:8090 \
  npx playwright test -c tests/e2e/playwright.config.ts capturas.spec.ts
node tests/e2e/apoyo/lighthouse-medida.mjs --url http://localhost:8090 --proyecto licencias-medida \
  --corridas 3 --modos claro,oscuro --salida docs/08-sprint-2/evidencias/diseno-013/despues.md
```

Resultado esperado:

- **SC-002**: accesibilidad ≥ 90 en modo claro y oscuro (también con el chat abierto);
- **SC-003**: rendimiento de cada pantalla ≥ el de la línea base (medianas);
- **SC-004**: sin fallas de `color-contrast` en ningún modo;
- capturas "después" en `despues/claro/` y `despues/oscuro/`.

Al terminar:

```bash
docker compose -p licencias-medida down -v
```

## 3. En GitHub Actions

Flujo `E2E`:

- los 4 recorridos × 2 tamaños en verde, con los ajustes justificados de research R-11;
- `tests/e2e/diseno.spec.ts`:
  - menú lateral por rol;
  - a 360 px, botón del menú y sin desplazamiento horizontal;
  - primer pintado oscuro sin elección guardada (SC-006) y con la elección contraria al sistema;
  - ninguna violación de la CSP en ninguna página;
- Lighthouse del chat en modo snapshot, en ambos modos.

## 4. Recorrido manual

1. Con el sistema en modo oscuro, abrir `/` en una ventana privada: aparece oscuro desde el primer
   momento.
2. Elegir "Claro" en el selector y recargar: sigue claro.
3. Ingresar como JEFATURA:
   - el menú lateral tiene las opciones de hoy;
   - el desplegable del nombre tiene "Mi perfil" y "Cerrar sesión";
   - las migas dicen "Tablero";
   - el tablero muestra tarjetas.
4. A 360 px, abrir y cerrar el menú con el botón y con Escape.
5. En la bandeja, los estados se ven como insignias con texto.
6. Abrir "Pregúntanos" en ambos modos.
