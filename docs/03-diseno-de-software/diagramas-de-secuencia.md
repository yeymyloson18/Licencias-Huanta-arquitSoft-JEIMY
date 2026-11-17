# Diagramas de secuencia

Muestran, paso a paso, cómo colaboran el Portal, la API y los módulos en los dos flujos más críticos del sistema.
Los nombres de las operaciones coinciden con el contrato [`openapi.yaml`](../06-contrato-api/openapi.yaml) y con
los casos de uso del [diseño interno de módulos](diseno-interno/diseno-interno-de-modulos.md).

## 1. Presentar una solicitud en línea (HU01, HU02, RF01, RF04, RF06, RF07)

El administrado elige su licencia con el asistente, confirma su identidad y presenta. Nadie puede presentar a nombre
de otra persona porque la solicitud exige el `tokenIdentidad` que solo se obtiene con el OTP enviado al celular.

```mermaid
sequenceDiagram
    autonumber
    actor A as Administrado
    participant P as Portal Web
    participant API as API (NestJS)
    participant CAT as Catálogo
    participant SEG as Seguridad
    participant EXT as Validación DNI/RUC
    participant SMS as Proveedor SMS
    participant TRA as Trámites
    participant OBJ as Almacén de documentos
    participant BD as PostgreSQL

    A->>P: Responde las 3 preguntas
    P->>API: POST /asistente/proponer
    API->>CAT: ProponerLicencia(respuestas)
    CAT->>CAT: Lee recetas y reglas (caché Redis)
    CAT-->>P: Receta: requisitos, tasa, plazo y ruta
    A->>P: Ingresa RUC, DNI con fecha de emisión y celular
    P->>API: POST /identidad/verificar
    API->>SEG: EnviarCodigoAdministrado
    SEG->>EXT: Validar RUC y DNI
    alt Servicio caído
        EXT-->>SEG: Sin respuesta
        SEG-->>P: 503: acudir a mesa de partes
    else Identidad válida
        EXT-->>SEG: Válido
        SEG->>SMS: Envía OTP (directo, sin cola)
        SEG-->>P: desafioId
    end
    A->>P: Ingresa el código OTP
    P->>API: POST /identidad/verificar-otp
    API->>SEG: VerificarCodigoAdministrado (máx. 5 intentos)
    SEG-->>P: tokenIdentidad (15 minutos)
    loop Por cada requisito
        P->>API: POST /documentos (archivo)
        API->>OBJ: Guarda cifrado
        API-->>P: documentoId
    end
    P->>API: POST /expedientes + Idempotency-Key
    API->>TRA: RegistrarSolicitud
    TRA->>CAT: ConsultarReceta (requisitos obligatorios)
    TRA->>TRA: Verifica documentos y asigna la ruta (RF07)
    TRA->>BD: Transacción: expediente + documentos + historial + evento EstadoExpedienteCambiado
    TRA-->>P: 201: EXP-2026-000001, ruta y vencimiento del plazo
    Note over BD: Un worker toma el evento y Notificaciones envía el correo o SMS (RF20)
```

## 2. Registrar el pago en caja (HU13, RF11, RF12, ADR-004)

El cajero ve el expediente, el titular y el monto antes de confirmar. El pago, la auditoría y el evento se guardan
en **una sola transacción** (outbox), y la base de datos impide que dos cajeros paguen la misma esquela.

```mermaid
sequenceDiagram
    autonumber
    actor C as Cajero
    participant P as Portal Web
    participant API as API (NestJS)
    participant PAG as Pagos en caja
    participant TRA as Trámites
    participant BD as PostgreSQL
    participant W as Worker
    participant LIC as Licencias

    C->>P: Digita el código de la esquela
    par Datos de la esquela
        P->>API: GET /esquelas/{codigo}
        API->>PAG: ConsultarEsquela
        PAG-->>P: Expediente, monto y si ya está pagada
    and Titular
        P->>API: GET /expedientes/{n}/titular
        API->>TRA: ConsultarEstado (rol caja)
        TRA-->>P: Nombre del titular
    end
    P-->>C: Pantalla de confirmación
    C->>P: Confirma e ingresa el número de recibo
    P->>API: POST /esquelas/{codigo}/pago + Idempotency-Key
    API->>PAG: RegistrarPagoEnCaja
    PAG->>PAG: Esquela.registrarPago() (1.ª defensa)
    PAG->>BD: UPDATE … WHERE numero_recibo IS NULL + auditoría + evento PagoRegistrado
    alt 0 filas actualizadas (otro cajero se adelantó)
        BD-->>PAG: Sin cambios
        PAG-->>P: 409: esta esquela ya fue pagada
    else 1 fila actualizada
        BD-->>PAG: OK (una sola transacción)
        PAG-->>P: 201: pago registrado
        W->>BD: Lee comun.evento_pendiente
        W->>TRA: Avanza el expediente a PAGADO
        alt Ruta A
            TRA->>LIC: EmitirLicencia
            LIC->>BD: Licencia + código de verificación del QR
            Note over W,LIC: El PDF con QR se genera en segundo plano
        else Ruta B
            TRA->>TRA: Pasa a EN_INSPECCION (ITSE previa)
        end
        W->>BD: Marca el evento como procesado
    end
```

## Qué demuestran

| Escenario | Dónde se ve |
|---|---|
| EQ-04 Seguridad | La solicitud exige `tokenIdentidad`; el OTP tiene límite de intentos; solo el rol caja registra pagos. |
| EQ-03 Disponibilidad | Si el servicio de DNI/RUC cae, el sistema responde 503 y deriva a mesa de partes; el evento del pago no se pierde gracias al outbox. |
| EQ-01 Rendimiento | El catálogo se lee de Redis; los PDF y los mensajes se generan fuera de la petición. |
| ADR-004 | Un solo pago por esquela, protegido por la regla del dominio y por la base de datos. |
