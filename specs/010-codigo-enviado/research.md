# Investigación: Monitoreo de los códigos enviados (010)

## R-01. Acción para el límite de códigos

- **Decisión**: acción nueva `CODIGO_LIMITE_ALCANZADO` (aclaración 1), grupo Ingresos, resultado
  `RECHAZADO`, detalle `{ proposito, segundos }`. No suma a los ingresos fallidos del panel
  (`ACCIONES_INGRESO_FALLIDO` no cambia).
- **Alternativa**: `CUENTA_BLOQUEADA` — mezclaría "demasiados intentos" con "demasiados envíos".

## R-02. Vínculo entre el envío y su resultado

- **Decisión**: columna `seguridad.auditoria.intento_id uuid NULL` con índice parcial. Lleva el id
  del desafío (`codigo_otp.id`) en `CODIGO_ENVIADO` (personal) y en los eventos de `VerificarOtp`
  (`INGRESO_CORRECTO`, `CODIGO_INCORRECTO`, `CUENTA_BLOQUEADA`, `ORIGEN_BLOQUEADO`).
- **Por qué columna y no `detalle`**: la consulta de la lista busca los eventos posteriores de cada
  envío; con índice es barata. El id no es un dato personal y la API no lo expone (sin él y sin el
  código no se puede ingresar, pero tampoco hace falta mostrarlo).
- **Identidad del administrado**: no se vincula (no hay ingreso posterior ni cuenta); desenlace nulo.

## R-03. Desenlace

- **Decisión**: función pura `desenlaceDelCodigo({ entrega, posteriores, enviadoEn, ahora })`:
  1. envío fallido → `ENVIO_FALLIDO`;
  2. algún `INGRESO_CORRECTO` → `INGRESO_CORRECTO`;
  3. algún `CUENTA_BLOQUEADA` u `ORIGEN_BLOQUEADO` → `BLOQUEO`;
  4. algún `CODIGO_INCORRECTO` → `CODIGO_INCORRECTO`;
  5. pasaron 5 minutos (vigencia del código) → `SIN_USAR`;
  6. si no → `PENDIENTE`.
- Un código reemplazado por otro antes de los 5 minutos queda `PENDIENTE` hasta que vence y luego
  `SIN_USAR`; se documenta (el vencimiento anticipado no deja evento propio).
- El repositorio trae `array_agg` de las acciones posteriores con el mismo `intento_id` en la misma
  consulta (subconsulta correlacionada sobre el índice).

## R-04. Medio del envío

- **Decisión**: el puerto `EnviadorOTP` suma `readonly canal: 'SIMULADO' | 'BUZON' | 'SMS' | 'CORREO'`.
  Cada adaptador lo declara (`EnviadorOtpSimulado` → `SIMULADO`, `EnviadorOtpBuzon` → `BUZON`). El
  correo y el SMS reales del Sprint 3 serán otros adaptadores con su valor.
- **Alternativa**: leer `ENVIO_OTP` de la configuración en el caso de uso — acoplaría la aplicación a
  la configuración.

## R-05. Momento del registro

- **Decisión**: `CODIGO_ENVIADO` se registra después del intento de envío, con `registrarSinFallar`
  (si la auditoría falla, se avisa sin datos y la persona sigue: puede entrar con su código). El envío
  es a un servicio externo y su resultado solo se conoce al terminar; no hay transacción que lo
  incluya.
- Si el envío falla: `resultado = 'RECHAZADO'`, `detalle.entrega = 'FALLIDO'`, y la respuesta sigue
  siendo `ErrorEnvioOtp` (503, el mismo mensaje).

## R-06. Objeto de la identidad del administrado

- **Decisión**: `objeto = 'IDENTIDAD_ADMINISTRADO'` (cabe en la regla de objetos de la 009: código en
  mayúsculas). La pantalla lo muestra como "Identidad del administrado". Sin documento, RUC ni
  huellas; el destino es el celular enmascarado; el origen, la huella HMAC de la IP.

## R-07. Panel

- `ResumenCodigos { entregados, conIngreso, fallidos }` desde un instante, con una consulta:
  `count(*) FILTER (...)` sobre `CODIGO_ENVIADO` (propósito personal y administrado) y `EXISTS` de un
  `INGRESO_CORRECTO` con el mismo `intento_id`.
- La tarjeta muestra: entregados hoy y en 7 días, con ingreso correcto (hoy y 7 días) y fallidos hoy.

## R-08. CSV

- Se agrega la columna final `desenlace` (texto en español: "Ingreso correcto", "Sin usar", …; vacía
  en las demás acciones). Las 6 columnas de la 009 no cambian (aclaración 3).
