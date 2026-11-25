# Después: medidas y capturas del diseño con CoreUI (013)

Medido en el compose aislado `licencias-medida`, recreado desde cero (`down -v` y `up --build`),
sin el proveedor de IA y sin tocar los datos de desarrollo. Misma herramienta y mismas opciones que
la [línea base](linea-base.md): Lighthouse 12.2.1 en modo móvil 360×740, mediana de 3 corridas por
pantalla, caché vacía en cada navegación. En modo oscuro, el dispositivo emula
`prefers-color-scheme: dark` sin elección guardada. Resultados **tal como salieron**.

Capturas: [`despues/claro/`](despues/claro/) y [`despues/oscuro/`](despues/oscuro/), 6 pantallas ×
celular y escritorio, frente a [`antes/claro/`](antes/claro/).

## Resultado vigente frente a la línea base (medida 4, con `modo-inicial.js`)

La medida 4 (2026-11-25 21:23 UTC) es la del código actual, con el script que evita el destello al
cargar (T049). La medida 3, sin ese script, queda en el historial.

| Pantalla | Línea base (claro) | Medida 3 (claro / oscuro) | Medida 4 (claro / oscuro) | Diferencia con la base | Accesibilidad (medida 4) |
| --- | --- | --- | --- | --- | --- |
| Portada | 97 | 98 / 98 | 95 / 94 | **−2 / −3** | 100 / 100 |
| Asistente | 98 | 98 / 98 | 98 / 97 | 0 / **−1** | 100 / 100 |
| Consulta | 98 | 98 / 98 | 98 / 98 | 0 / 0 | 100 / 100 |
| Ingresar | 99 | 98 / 98 | 98 / 97 | **−1 / −2** | 100 / 100 |
| Chat abierto (snapshot) | — | — | — | — | 100 / 100 |
| Bandeja (EVALUADOR) | 98 | 96 / 96 | 95 / 94 | **−3 / −4** | 100 / 100 |
| Tablero (JEFATURA) | 98 | 96 / 96 | 94 / 94 | **−4 / −4** | 100 / 100 |

| Criterio | Meta | Resultado (medida 4) |
| --- | --- | --- |
| SC-002 | Accesibilidad ≥ 90 en ambos modos | **Se cumple**: 100 en todas las pantallas y en el chat abierto, en claro y en oscuro. |
| SC-003 | Rendimiento ≥ la línea base | **No se cumple**: solo la consulta queda igual (y el asistente en claro); las demás bajan de 1 a 4 puntos. |
| SC-004 | Sin fallas de `color-contrast` | **Se cumple** en ambos modos. |

### Por qué bajó de la medida 3 a la medida 4

- **`modo-inicial.js` bloquea el primer pintado.** Es un script externo en el `<head>`, sin `async`
  ni `defer`, a propósito: si no bloquea, no evita el destello. El navegador espera esa petición
  antes de pintar.
- **Lo que mide Lighthouse en la portada**: en dos corridas de diagnóstico, FCP de **1.9 s**, frente
  a 1.7 s en la medida 3, y LCP de 2.2 s; CLS sigue en 0. El JS transferido pasa de 156.8 a 158.6 KB
  (el script pesa menos de 1 KB, más las cabeceras). El efecto es más la espera de la petición en la
  red lenta simulada que el tamaño.
- **Variación entre corridas**: la portada en oscuro dio 96, sin puntaje y 92. Lighthouse dio puntaje
  en 2 de las 3 corridas.
- **El intercambio**: con el script no hay destello (el E2E lo exige); sin él, la portada vuelve a 98
  pero los primeros cuadros salen en el modo del dispositivo.
- **Una alternativa que no se aplicó**: evitar la petición extra exige un script en línea, permitido
  en la CSP con su hash (`script-src 'self' 'sha256-…'`). Eso cambia la política de seguridad de
  nginx y de Caddy, y la especificación lo prohíbe; necesitaría la decisión de la usuaria.

### Por qué sigue por debajo de la línea base (lo mismo que en la medida 3)

- **CSS que bloquea el primer pintado**: el portal público descarga 25.4 KB de CSS transferido
  (122.1 KB sin comprimir) frente a 5.4 KB (17.0 KB) antes de CoreUI.
- **El área del personal se carga aparte**: la bandeja y el tablero descargan además el módulo de
  `DisenoPersonal` (15.6 KB de JS y 6.1 KB de CSS con gzip). Por eso pesan 34.0 KB de CSS y 176.7 KB
  de JS transferidos, frente a 5.4 KB y 151.0 KB antes.
- **No es la accesibilidad ni los desplazamientos**: CLS 0 en las páginas públicas y 0.008 en el
  tablero, y accesibilidad 100.

Lo que queda para recuperar puntos, sin hacer: recortar más el Sass de CoreUI o dividir el CSS por
diseño. Se deja registrado como pendiente.

## Historial de las medidas (las tres, tal como salieron)

Las medidas 2 y 3 se repitieron después de corregir lo que mostró la anterior. La 4 se tomó
después de agregar `modo-inicial.js` (T049).

### Medida 1 (2026-11-25 20:21 UTC): desplazamientos y contraste

| Pantalla | Claro | Oscuro | Accesibilidad (claro / oscuro) |
| --- | --- | --- | --- |
| Portada | 80 | 79 | 100 / 100 |
| Asistente | 88 | 88 | 100 / 100 |
| Consulta | 89 | 89 | 100 / 100 |
| Ingresar | 98 | 98 | 100 / 100 |
| Bandeja | 95 | 95 | 100 / **96** (`color-contrast`) |
| Tablero | 82 | 82 | 100 / **96** (`color-contrast`) |

- **Rendimiento**: lo bajaban los desplazamientos del diseño. En dos corridas de diagnóstico de la
  portada, el CLS fue de 0.368 y 0.955, con FCP 1.7 s y TBT 60 ms. Las causas, medidas con
  `PerformanceObserver`:
  - el pie nuevo empezaba dentro de la pantalla y bajaba al llegar el contenido;
  - la barra pública crecía cuando aparecía "Acceso del personal" (al terminar de comprobar la
    sesión): a 360 px, el nombre de la Municipalidad pasaba a dos líneas;
  - en el tablero, el reporte de abajo saltaba al llegar los datos.

  En la portada en claro, Lighthouse dio puntaje solo en 1 de las 3 corridas.
- **Contraste**: el nombre del usuario en la barra del personal usaba el gris #6b7785 de la variante
  `ghost-secondary` de CoreUI: 3.32:1 sobre el fondo oscuro.
- **Correcciones**:
  - el contenido ocupa al menos una pantalla de alto, así el pie empieza fuera de la vista;
  - mientras se comprueba la sesión, se reserva el lugar del enlace con un texto invisible;
  - el tablero reserva una pantalla de alto mientras carga;
  - el nombre del usuario usa el color del texto, y "Plegar menú" el secundario del tema.

### Medida 2 (2026-11-25 20:35 UTC): CSS

| Pantalla | Claro | Oscuro | Accesibilidad (claro / oscuro) |
| --- | --- | --- | --- |
| Portada | 95 | 96 | 100 / 100 |
| Asistente | 98 | 98 | 100 / 100 |
| Consulta | 98 | 98 | 100 / 100 |
| Ingresar | 98 | 98 | 100 / 100 |
| Bandeja | 95 | 96 | 100 / 100 |
| Tablero | 95 | 96 | 100 / 100 |

- En la portada en oscuro, Lighthouse dio puntaje en 2 de las 3 corridas.
- **Correcciones**:
  - el CSS del desplegable pasó a `tema-personal.scss`: en el portal público ya no hace falta,
    porque el selector de modo es un botón;
  - el bloque oscuro del sistema emite solo las variantes de botón que se usan.

  El CSS del portal público bajó de 21.5 a 19.8 KB con gzip.

### Medida 3 (2026-11-25 20:45 UTC): antes de `modo-inicial.js`

Fecha: 2026-11-25 20:45 UTC. Sistema: http://localhost:8090 (compose
aislado `licencias-medida`, sin el proveedor de IA). Lighthouse en modo móvil 360×740,
`deviceScaleFactor: 2`, con la mediana de 3 corridas por pantalla. Resultados tal
como salieron.

| Pantalla | Modo | Rendimiento (mediana) | Corridas | Accesibilidad (mediana) | Auditorías de accesibilidad fallidas |
| --- | --- | --- | --- | --- | --- |
| Portada | claro | 98 | 98, 98, 97 | 100 | — |
| Asistente | claro | 98 | 98, 98, 98 | 100 | — |
| Consulta | claro | 98 | 98, 98, 98 | 100 | — |
| Ingresar | claro | 98 | 98, 98, 98 | 100 | — |
| Chat abierto (snapshot) | claro | — | —, —, — | 100 | — |
| Bandeja (EVALUADOR) | claro | 96 | 96, 96, 96 | 100 | — |
| Tablero (JEFATURA) | claro | 96 | 96, 96, 96 | 100 | — |
| Portada | oscuro | 98 | 97, 98, 98 | 100 | — |
| Asistente | oscuro | 98 | 98, 98, 97 | 100 | — |
| Consulta | oscuro | 98 | 98, 98, 99 | 100 | — |
| Ingresar | oscuro | 98 | 98, 98, 98 | 100 | — |
| Chat abierto (snapshot) | oscuro | — | —, —, — | 100 | — |
| Bandeja (EVALUADOR) | oscuro | 96 | 95, 96, 96 | 100 | — |
| Tablero (JEFATURA) | oscuro | 96 | 96, 96, 96 | 100 | — |

El chat abierto se mide en modo snapshot: Lighthouse no da rendimiento en ese modo.

### Peso descargado (primera corrida de cada pantalla, con la caché vacía)

| Pantalla | Modo | CSS transferido | CSS sin comprimir | JS transferido | JS sin comprimir |
| --- | --- | --- | --- | --- | --- |
| Portada | claro | 25.4 KB | 122.1 KB | 156.8 KB | 459.5 KB |
| Asistente | claro | 25.4 KB | 122.1 KB | 156.8 KB | 459.5 KB |
| Consulta | claro | 25.4 KB | 122.1 KB | 156.8 KB | 459.5 KB |
| Ingresar | claro | 25.4 KB | 122.1 KB | 156.8 KB | 459.5 KB |
| Bandeja (EVALUADOR) | claro | 34.0 KB | 159.2 KB | 175.0 KB | 505.2 KB |
| Tablero (JEFATURA) | claro | 34.0 KB | 159.2 KB | 175.0 KB | 505.2 KB |
| Portada | oscuro | 25.4 KB | 122.1 KB | 156.8 KB | 459.5 KB |
| Asistente | oscuro | 25.4 KB | 122.1 KB | 156.8 KB | 459.5 KB |
| Consulta | oscuro | 25.4 KB | 122.1 KB | 156.8 KB | 459.5 KB |
| Ingresar | oscuro | 25.4 KB | 122.1 KB | 156.8 KB | 459.5 KB |
| Bandeja (EVALUADOR) | oscuro | 34.0 KB | 159.2 KB | 175.0 KB | 505.2 KB |
| Tablero (JEFATURA) | oscuro | 34.0 KB | 159.2 KB | 175.0 KB | 505.2 KB |

### Medida 4 (2026-11-25 21:23 UTC): con `modo-inicial.js` (vigente)

Fecha: 2026-11-25 21:23 UTC. Sistema: http://localhost:8090 (compose
aislado `licencias-medida`, sin el proveedor de IA). Lighthouse en modo móvil 360×740,
`deviceScaleFactor: 2`, con la mediana de 3 corridas por pantalla. Resultados tal
como salieron.

| Pantalla | Modo | Rendimiento (mediana) | Corridas | Accesibilidad (mediana) | Auditorías de accesibilidad fallidas |
| --- | --- | --- | --- | --- | --- |
| Portada | claro | 95 | 96, 95, 94 | 100 | — |
| Asistente | claro | 98 | 97, 98, 98 | 100 | — |
| Consulta | claro | 98 | 98, 98, 98 | 100 | — |
| Ingresar | claro | 98 | 98, 98, 97 | 100 | — |
| Chat abierto (snapshot) | claro | — | —, —, — | 100 | — |
| Bandeja (EVALUADOR) | claro | 95 | 94, 95, 95 | 100 | — |
| Tablero (JEFATURA) | claro | 94 | 94, 94, 94 | 100 | — |
| Portada | oscuro | 94 | 96, —, 92 | 100 | — |
| Asistente | oscuro | 97 | 97, 97, 97 | 100 | — |
| Consulta | oscuro | 98 | 98, 97, 98 | 100 | — |
| Ingresar | oscuro | 97 | 97, 98, 97 | 100 | — |
| Chat abierto (snapshot) | oscuro | — | —, —, — | 100 | — |
| Bandeja (EVALUADOR) | oscuro | 94 | 95, 94, 94 | 100 | — |
| Tablero (JEFATURA) | oscuro | 94 | 95, 94, 94 | 100 | — |

El chat abierto se mide en modo snapshot: Lighthouse no da rendimiento en ese modo.

#### Peso descargado (primera corrida de cada pantalla, con la caché vacía)

| Pantalla | Modo | CSS transferido | CSS sin comprimir | JS transferido | JS sin comprimir |
| --- | --- | --- | --- | --- | --- |
| Portada | claro | 25.4 KB | 122.1 KB | 158.6 KB | 460.4 KB |
| Asistente | claro | 25.4 KB | 122.1 KB | 158.6 KB | 460.4 KB |
| Consulta | claro | 25.4 KB | 122.1 KB | 158.6 KB | 460.4 KB |
| Ingresar | claro | 25.4 KB | 122.1 KB | 158.6 KB | 460.4 KB |
| Bandeja (EVALUADOR) | claro | 34.0 KB | 159.2 KB | 176.7 KB | 506.1 KB |
| Tablero (JEFATURA) | claro | 34.0 KB | 159.2 KB | 176.7 KB | 506.1 KB |
| Portada | oscuro | 25.4 KB | 122.1 KB | 158.6 KB | 460.4 KB |
| Asistente | oscuro | 25.4 KB | 122.1 KB | 158.6 KB | 460.4 KB |
| Consulta | oscuro | 25.4 KB | 122.1 KB | 158.6 KB | 460.4 KB |
| Ingresar | oscuro | 25.4 KB | 122.1 KB | 158.6 KB | 460.4 KB |
| Bandeja (EVALUADOR) | oscuro | 34.0 KB | 159.2 KB | 176.7 KB | 506.1 KB |
| Tablero (JEFATURA) | oscuro | 34.0 KB | 159.2 KB | 176.7 KB | 506.1 KB |

## Tamaño de la compilación (`npm run build -w apps/web`)

| Archivo | Antes de CoreUI | Al instalar CoreUI (T006) | Final |
| --- | --- | --- | --- |
| CSS del portal (`index-*.css`) | 17.0 KB (5.4 KB transferidos) | 116.34 KB (18.62 KB gzip) | 124.98 KB (19.76 KB gzip) |
| JS del portal (`index-*.js`) | 446.5 KB (151.0 KB transferidos) | 457.26 KB (127.78 KB gzip) | 470.48 KB (133.15 KB gzip) |
| CSS del área del personal (`DisenoPersonal-*.css`) | — | — | 38.08 KB (6.11 KB gzip) |
| JS del área del personal (`DisenoPersonal-*.js`) | — | — | 46.78 KB (15.62 KB gzip) |

El portal público **no** descarga `tema-personal.scss` ni el código de `DisenoPersonal` (se cargan
con `React.lazy` solo en las rutas del personal): la tabla de peso muestra lo mismo para la portada,
el asistente, la consulta y el ingreso.

## Otras medidas de la fase 9

- **Chat abierto (T044)**: Lighthouse en modo snapshot con `--modo claro` y `--modo oscuro`:
  accesibilidad **1** en los dos (y 1 en la portada).
- **E2E `diseno.spec.ts` (T043)**: 23 pruebas en verde entre celular y escritorio (3 más se omiten
  porque son de un solo proyecto). El E2E completo da 31 en verde. Cubre:
  - opciones del menú por rol;
  - menú a 360 px sin desplazamiento horizontal;
  - primer pintado oscuro sin elección;
  - sin violaciones de la CSP;
  - teclado del desplegable;
  - corte de 768 px.
- **Destello con una elección contraria al dispositivo (T043 d)**: en la fase 9 **había destello**,
  en celular y en escritorio, en los dos sentidos ("claro" guardado con el dispositivo oscuro, y al
  revés). Los primeros 3 a 5 cuadros salían con el fondo del dispositivo, antes de que `main.tsx`
  aplicara la elección.
  - **Corregido en T049**, con la aprobación de la usuaria: el script externo `public/modo-inicial.js`
    en el `<head>` aplica la elección antes del primer pintado, y sigue cumpliendo la CSP.
  - El E2E ahora **exige** que no haya ningún cuadro con el fondo contrario. Pasa en los 4 casos, en
    tres corridas seguidas.
  - **Medido después de T049 (medida 4)**: el script agrega una petición pequeña que bloquea el
    primer pintado, y el rendimiento baja de 1 a 3 puntos frente a la medida 3 (ver arriba).
