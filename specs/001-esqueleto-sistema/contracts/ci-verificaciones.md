# Contrato: verificaciones del CI (`.github/workflows/ci.yml`)

Se ejecuta en cada `pull_request` y en cada `push` a `main`. Los **nombres de los jobs** son parte
del contrato: la protección de `main` (FR-019a) los exige por nombre, así que no deben cambiarse sin
actualizar esa configuración y el README.

| Job (check requerido) | Qué ejecuta | Falla si… |
|---|---|---|
| `compilacion` | `npm ci`; `npm run generar -w packages/contracts`; `tsc --noEmit` en los 3 workspaces (strict); `eslint .`; `prettier --check .`; `vite build` del portal | hay errores de tipos, de lint o de formato, o el código no coincide con los tipos del contrato |
| `pruebas` | Servicios `postgres:16-alpine` y `redis:7-alpine`; `prisma migrate deploy`; prueba que compara las migraciones con `docs/05-modelo-de-datos/`; Jest unitarias + integración (Supertest + validación contra `openapi.yaml`) del backend; Jest del portal | alguna prueba falla o una respuesta no cumple el contrato |
| `cobertura` | Jest unitarias del backend con `--coverage` y `coverageThreshold` | líneas o ramas < 80 % en `src/**/dominio/**` o `src/**/aplicacion/**` |
| `regla-dependencia` | `depcruise apps/api/src --config .dependency-cruiser.cjs --output-type err-long` | `dominio` importa algo externo u otra capa; `aplicacion` importa infraestructura/presentación/npm; un módulo importa el interior de otro; hay ciclos. El mensaje indica archivo y regla |
| `contrato` | `redocly lint docs/06-contrato-api/openapi.yaml` | el contrato tiene errores (referencias rotas, esquemas inválidos, ejemplos incorrectos) |

## Protección de `main` (última tarea)

Después de la primera ejecución verde:

- Checks requeridos: `compilacion`, `pruebas`, `cobertura`, `regla-dependencia`, `contrato`
  (rama actualizada antes de fusionar).
- Cambios solo mediante pull request; push directo y push forzado rechazados, también para
  administradores.
- Documentado en el README con el comando `gh api` usado y cómo comprobarlo.
