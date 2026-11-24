# Plan de implementación: Monitoreo de los códigos enviados

**Rama**: `010-codigo-enviado` | **Fecha**: 2026-11-24 | **Especificación**: [spec.md](./spec.md)

**Entrada**: la especificación (con las aclaraciones del 2026-11-24) y la sección "Cómo construirlo"
de `docs/sdd/010-codigo-enviado.md`.

## Resumen

1. **Dos acciones nuevas** en la auditoría de seguridad (grupo Ingresos): `CODIGO_ENVIADO` y
   `CODIGO_LIMITE_ALCANZADO`. La migración `0013` amplía el `CHECK` y agrega la columna
   `intento_id` (uuid, nulo), que vincula el envío con lo que pasó después.
2. **Registro en los casos de uso que envían el código**:
   - `IniciarSesion` (002): `CODIGO_ENVIADO` sobre la cuenta, con `intento_id` = id del desafío;
     `CODIGO_LIMITE_ALCANZADO` cuando se alcanza el cupo de 3 envíos.
   - `VerificarIdentidadAdministrado` (004): `CODIGO_ENVIADO` con objeto `IDENTIDAD_ADMINISTRADO`,
     sin cuenta; `CODIGO_LIMITE_ALCANZADO` en el cupo del celular.
   - `VerificarOtp` (002): `INGRESO_CORRECTO`, `CODIGO_INCORRECTO` y los bloqueos llevan el mismo
     `intento_id`.
   - El detalle lleva propósito, medio, destino enmascarado y entrega (`ENTREGADO` o `FALLIDO`). Nunca
     el código. El medio lo informa el propio adaptador (`EnviadorOTP.canal`).
3. **Desenlace** de cada código del personal (`INGRESO_CORRECTO`, `CODIGO_INCORRECTO`, `BLOQUEO`,
   `SIN_USAR`, `PENDIENTE` o `ENVIO_FALLIDO`): función pura del dominio a partir de las acciones
   posteriores con el mismo `intento_id` y de la hora. El repositorio las trae en la misma consulta.
4. **Contrato**: el enum suma las 2 acciones; `EventoAuditoriaSeguridad` suma `codigoEnviado`
   (nulo salvo en `CODIGO_ENVIADO`); `PanelAdministrador` suma `codigosEnviados`; el CSV suma la
   columna `desenlace`.
5. **Panel**: tarjeta "Códigos enviados" (hoy, 7 días, con ingreso correcto y fallidos de hoy) con
   enlace a la auditoría filtrada. **Portal**: la tabla de eventos muestra medio, destino y desenlace.
6. **Documentación**: README, `docs/05`, matriz de permisos sin cambios e informe del Sprint 2.

**Lo que no se ejecuta en local**: no se construyen imágenes ni se levanta el sistema. Las pruebas de
integración corren en GitHub Actions.

**Dónde este plan se aparta de la entrada**:

| Entrada | Plan | Motivo |
| --- | --- | --- |
| "Registrar en la misma transacción cuando la haya" | `CODIGO_ENVIADO` se registra después del intento de envío, sin transacción | El envío es a un servicio externo (no transaccional) y el resultado (entregado o fallido) solo se conoce después; se registra con `registrarSinFallar` como los intentos de la 009 |
| Destino `***-***-321` (ejemplo) | `9*****321` | Aclaración 4: el formato del resto del sistema |
| Vínculo "puede resolverse con un identificador del intento" | Columna `intento_id` indexada, no expuesta en la API | Búsqueda eficiente de los eventos posteriores; el id del desafío no se muestra al administrador |

## Contexto técnico

**Lenguaje/versión**: TypeScript 5 estricto, Node.js 24 LTS. **Dependencias nuevas**: ninguna.

**Almacenamiento**: PostgreSQL 16 (`seguridad.auditoria`: `CHECK` ampliado y columna `intento_id`).

**Pruebas**: Jest + Supertest, Jest + Testing Library. Postman sin cambios (no prueba estas formas).

**Metas de rendimiento**: el panel sigue en < 2 s con 10,000 eventos (índice parcial por
`intento_id` y por `accion`).

**Restricciones**: el código nunca se guarda; destino enmascarado; poca memoria local.

## Verificación constitucional

| Principio | Cómo se cumple | Estado |
| --- | --- | --- |
| I. Clean Architecture | Todo en `seguridad`. Desenlace, enmascarado y validación del detalle en el dominio; el medio se lee del puerto `EnviadorOTP` | ✅ |
| II. Contrato primero | Se edita `openapi.yaml` (enum, `codigoEnviado`, `codigosEnviados`, columnas del CSV) antes del código | ✅ |
| III. Un esquema por módulo | Migración `0013` en `seguridad`; `docs/05` en el mismo commit; 0001 a 0012 intactas | ✅ |
| IV. Lenguaje del dominio | `CODIGO_ENVIADO`, `desenlaceDelCodigo`, `ResumenCodigos` | ✅ |
| V. Toda tarea con prueba | Unitarias del dominio y de los casos de uso; integración de los dos propósitos, falla, privacidad, desenlace y panel | ✅ |
| VI. Escenarios de calidad | EQ-04 (monitoreo y privacidad), EQ-01 (el panel sigue < 2 s) | ✅ |
| VII. Datos personales | Sin código, sin documento ni RUC, destino enmascarado, `intento_id` no expuesto; prueba de privacidad del código | ✅ |
| VIII. Git | Rama propia, commit por fase, sin push ni PR | ✅ |

Re-evaluación después del diseño: sin cambios.

## Estructura

```text
apps/api/prisma/migrations/0013_codigos_enviados/migration.sql
apps/api/prisma/schema.prisma                    (intento_id)
docs/05-modelo-de-datos/esquema.sql, modelo-entidad-relacion.md
docs/06-contrato-api/openapi.yaml
apps/api/src/compartido/dominio/destino-enmascarado.ts   (reutilizado)
apps/api/src/modulos/seguridad/
├── dominio/accion-auditoria.ts            (+2 acciones)
├── dominio/evento-auditoria.ts            (detalle del código, intentoId, fábricas)
├── dominio/desenlace-codigo.ts            (nuevo)
├── dominio/csv-auditoria.ts               (columna desenlace)
├── dominio/panel-administrador.ts         (códigos enviados)
├── dominio/puertos/enviador-otp.ts        (canal)
├── dominio/puertos/repositorio-auditoria.ts (resumenCodigos, fila con código)
├── aplicacion/iniciar-sesion.ts, verificar-otp.ts, verificar-identidad-administrado.ts
├── aplicacion/obtener-panel.ts
├── infraestructura/repositorio-auditoria-postgres.ts, enviador-otp-*.ts
└── presentacion/administrador.controller.ts
apps/web/src/componentes/TablaEventos.tsx, paginas/admin/Panel.tsx, servicios/clienteApi.ts
```

## Seguimiento de complejidad

Sin violaciones que justificar.
