# Guía de validación (006)

Datos FICTICIOS. En desarrollo el código OTP y los avisos quedan en Redis (`dev:otp:<id>` y
`dev:aviso:<id>`).

## Requisitos

- Sistema levantado (`docker compose -f infra/docker-compose.yml up -d --build`), con migraciones
  hasta la 0010 (la API las aplica al arrancar).
- Usuarios ficticios del personal con los roles EVALUADOR, CAJA, JEFATURA, INSPECTOR y ADMINISTRADOR.
- Pruebas automáticas: PostgreSQL temporal en 5433 y Redis en 16379 (ver el README).

## Escenario 1 - Ruta A completa (historias 1 y 2)

1. Presentar una solicitud de LIC-02 (004): el comprobante y la consulta muestran el vencimiento en días
   hábiles.
2. Evaluador: empezar revisión y confirmar riesgo (005). Caja: registrar el pago.
3. Evaluador: aprobar. En segundos la consulta muestra LICENCIA_EMITIDA y luego
   ITSE_POSTERIOR_PENDIENTE, con el número `LF-2026-NNNNNN` y "Descargar licencia".
4. Descargar el PDF; abrir la URL del QR sin sesión: datos mínimos, sin documento ni dirección.
5. Jefatura: `/personal/inspecciones`, asignar la inspección POSTERIOR a un inspector para hoy.
6. Inspector (celular a 360 px): registrar FAVORABLE con 2 fotos y el certificado. El expediente pasa a
   FINALIZADO y la verificación muestra el ITSE vigente.

Resultado esperado: un aviso por cada cambio de estado (`dev:aviso:*`), sin documento ni dirección.

## Escenario 2 - Ruta B (favorable y desfavorable)

1. Presentar LIC-03, confirmar riesgo y pagar: el expediente pasa a EN_INSPECCION con una inspección
   PREVIA pendiente.
2. Asignar e inspeccionar con FAVORABLE: licencia DEFINITIVA con certificado; LICENCIA_EMITIDA y luego
   FINALIZADO.
3. Con otro expediente, resultado DESFAVORABLE con observaciones: DENEGADO con ese motivo.

## Escenario 3 - Ruta C (bodega)

1. Presentar LIC-09, confirmar riesgo (pasa a PAGADO sin esquela) y aprobar: licencia PROVISIONAL
   vigente 12 meses, LICENCIA_PROVISIONAL e inspección BODEGA pendiente.

## Escenario 4 - Feriados, plazos y alertas (historias 3 y 4)

1. Administrador: `/admin/feriados`, ver los 16 feriados de 2026, registrar uno y eliminarlo.
2. Con un expediente EN_EVALUACION que vence en 1 día hábil, correr el reloj (o esperar la pasada):
   una alerta. Jefatura: `/personal/alertas`, marcarla como atendida.
3. Observar un expediente y subsanarlo: el vencimiento se corre los días hábiles que quedaban.

## Escenario 5 - Aviso del ITSE (historia 5)

1. Registrar un certificado que vence en menos de 30 días y correr el reloj dos veces: un solo aviso
   `ITSE_POR_VENCER`.

## Pruebas automáticas

```bash
npm run test:unit -w apps/api
DATABASE_URL=postgresql://licencias:cambiar_en_produccion_solo_desarrollo@127.0.0.1:5433/licencias \
REDIS_URL=redis://127.0.0.1:16379 npm run test:integracion -w apps/api
npm test -w apps/web
```
