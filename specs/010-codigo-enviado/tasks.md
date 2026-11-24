# Tareas: Monitoreo de los códigos enviados

**Entrada**: `specs/010-codigo-enviado/` (plan.md, spec.md, research.md, data-model.md, contracts/)

**Pruebas**: obligatorias (principio V). Unitarias en local; integración en GitHub Actions.

**Organización**: por historia. Un commit al terminar cada fase.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Preparación (contrato primero)

- [ ] T001 Editar `docs/06-contrato-api/openapi.yaml` según `contracts/api-codigos.md`: enum
      `AccionAuditoriaSeguridad` (+`CODIGO_ENVIADO`, `CODIGO_LIMITE_ALCANZADO`), esquema
      `CodigoEnviado` y propiedad requerida `codigoEnviado` (nula) en `EventoAuditoriaSeguridad`,
      `ResumenCodigos` y `codigosEnviados` en `PanelAdministrador`, columnas del CSV con `desenlace`;
      `npm run contrato` (sin advertencias nuevas) y `npm run generar`

---

## Fase 2: Base (bloquea todas las historias)

- [ ] T002 Migración `apps/api/prisma/migrations/0013_codigos_enviados/migration.sql`: reemplazar
      `ck_auditoria_seg_accion` con las 23 acciones, columna `intento_id uuid NULL` e índice parcial
      `ix_auditoria_seg_intento`; reflejarlo en `docs/05-modelo-de-datos/esquema.sql`,
      `modelo-entidad-relacion.md` y `apps/api/prisma/schema.prisma` (mismo commit)
- [ ] T003 [P] Dominio `apps/api/src/modulos/seguridad/dominio/accion-auditoria.ts`: las 2 acciones
      (grupo Ingresos, textos "Código enviado" y "Límite de códigos alcanzado"); pruebas en
      `test/unit/modulos/seguridad/dominio/accion-auditoria.spec.ts`
- [ ] T004 [P] Dominio `dominio/evento-auditoria.ts`: detalle `proposito`, `canal`, `destino`
      (celular `9*****321` o correo `ju***@dominio`), `entrega`; `segundos` también en el límite;
      `intentoId` (identificador interno, solo en las acciones de research §R-02); fábricas
      `eventoCodigoEnviado` y `eventoLimiteCodigos`; pruebas en `evento-auditoria.spec.ts`
- [ ] T005 [P] Dominio `dominio/desenlace-codigo.ts` (research §R-03) con prueba unitaria
- [ ] T006 Puerto `dominio/puertos/enviador-otp.ts`: `readonly canal`; adaptadores simulado
      (`SIMULADO`) y buzón (`BUZON`); dobles de prueba
- [ ] T007 Repositorio de auditoría (puerto y `infraestructura/repositorio-auditoria-postgres.ts`):
      guardar `intento_id`; en `buscar`, las acciones posteriores con el mismo intento y el detalle
      del código para armar `codigoEnviado` con el desenlace; `resumenCodigos(desde)`; doble en
      `test/unit/modulos/seguridad/aplicacion/dobles.ts`

**Punto de control**: compila; pruebas unitarias en verde.

---

## Fase 3: Historias 1 y 4 - Registro de los códigos enviados y del límite (P1)

- [ ] T008 [US1] `aplicacion/iniciar-sesion.ts`: `CODIGO_ENVIADO` (entregado o fallido) con el
      `intento_id` del desafío y el celular enmascarado; `CODIGO_LIMITE_ALCANZADO` al llegar al cupo;
      con `registrarSinFallar`; pruebas unitarias
- [ ] T009 [US1] `aplicacion/verificar-identidad-administrado.ts`: dependencias `auditoria` y
      `eventos`; `CODIGO_ENVIADO` con objeto `IDENTIDAD_ADMINISTRADO` y `CODIGO_LIMITE_ALCANZADO`, con
      la huella del origen; módulo actualizado; pruebas unitarias
- [ ] T010 [US2] `aplicacion/verificar-otp.ts`: `intento_id` en `INGRESO_CORRECTO`,
      `CODIGO_INCORRECTO` y bloqueos con desafío conocido; pruebas unitarias
- [ ] T011 [US2] CSV `dominio/csv-auditoria.ts` con la columna `desenlace` y la respuesta del
      controlador con `codigoEnviado`; pruebas unitarias
- [ ] T012 [US1] Integración `apps/api/test/integracion/codigos-enviados.e2e-spec.ts`: los dos
      propósitos, envío fallido (buzón sin servidor no aplica en el CI: se usa un enviador que falla
      vía `ajustar`), desenlaces, límite, privacidad del código (tabla, lista, CSV, panel, registros),
      respuestas validadas con `validarContrato`

- [ ] T012b [US1] Actualizar las expectativas de las pruebas de integración de la 009 que cuentan o
      listan los eventos de una cuenta que ingresa (`auditoria-seguridad.e2e-spec.ts`,
      `administrador.e2e-spec.ts`, `privacidad-009.e2e-spec.ts`): ahora cada código enviado agrega un
      `CODIGO_ENVIADO`

---

## Fase 4: Historia 3 - Panel y portal (P2)

- [ ] T013 [US3] Dominio `panel-administrador.ts` y `aplicacion/obtener-panel.ts`: `codigosEnviados`
      (hoy y 7 días); pruebas unitarias; panel en la integración de T012; la prueba de 10,000 eventos de
      `administrador.e2e-spec.ts` sigue midiendo SC-004
- [ ] T014 [P] [US3] Portal: tarjeta "Códigos enviados" con enlace a
      `/admin/auditoria?accion=CODIGO_ENVIADO` en `apps/web/src/paginas/admin/Panel.tsx`; las 2
      acciones en `componentes/TablaEventos.tsx` (grupos, medio, destino, desenlace e "Identidad del
      administrado"); pruebas en `Panel.test.tsx` y `TablaEventos.test.tsx`

---

## Fase 5: Pulido

- [ ] T015 [P] README (panel y auditoría) y una línea en `docs/08-sprint-2/README.md`;
      `node tests/analisis/verificar-citas.mjs`
- [ ] T016 Verificaciones finales: lint, typecheck, formato, contrato, regla de dependencia,
      cobertura, portal y build

## Dependencias

Fase 1 → Fase 2 → Fases 3 y 4 → Fase 5. La ficha (FR-009) no necesita cambios: ya lista los eventos
del afectado.
