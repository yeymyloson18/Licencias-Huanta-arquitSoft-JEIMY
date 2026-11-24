# Guía de validación: Monitoreo de los códigos enviados (010)

## En local (sin imágenes ni sistema completo)

```bash
npm run lint && npm run typecheck && npm run formato
npm run contrato && npm run generar
npm run regla-dependencia
npm run cobertura      # API: dominio y aplicación ≥ 80 % por archivo
npm test -w apps/web
```

## En GitHub Actions (job `pruebas`)

- `codigos-enviados.e2e-spec.ts`:
  - el ingreso del personal registra `CODIGO_ENVIADO` sobre la cuenta con el celular enmascarado;
  - la identidad del administrado lo registra con `IDENTIDAD_ADMINISTRADO`, sin documento ni RUC;
  - el desenlace: ingreso correcto, código incorrecto y pendiente;
  - el cuarto código registra `CODIGO_LIMITE_ALCANZADO`;
  - el código no aparece en la tabla, la lista, el CSV, el panel ni los registros;
  - el panel trae `codigosEnviados` según el contrato.
- La matriz de permisos de la 009 y el resto siguen en verde; `esquema-equivalente` compara la 0013.

## A mano (cuando se levante el sistema)

1. Ingrese como personal; lea el código en el buzón.
2. Como administrador, abra `/admin`: la tarjeta "Códigos enviados" cuenta 1 con ingreso correcto.
3. En la auditoría, filtre por "Código enviado": se ve el medio, `9*****…` y "Ingreso correcto".
