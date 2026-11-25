# Diagrama de casos de uso

El sistema tiene **32 casos de uso** repartidos entre 7 actores humanos y 2 sistemas externos de la
Fase 1 (ver [01-actores.md](../01-analisis-de-sistema/01-actores.md)). Cada caso de uso se traza a
sus historias de usuario y requisitos funcionales, y a la funcionalidad SDD que lo construye.

Para que se lea bien, el diagrama se divide en tres vistas: el administrado, el personal operativo y
la supervisión y administración. Las flechas punteadas marcan las relaciones entre casos de uso:

- **«include»** (flecha del caso base al incluido): el caso base **siempre** ejecuta el otro. Por
  ejemplo, presentar una solicitud siempre verifica la identidad.
- **«extend»** (flecha del caso opcional al caso base): el caso opcional agrega su comportamiento
  al base **solo cuando se cumple una condición**. Por ejemplo, emitir la licencia extiende el
  registro del pago solo en la ruta A.

## Vista 1: el administrado

```mermaid
flowchart LR
    ADM["Administrado<br/>(persona o empresa)"]
    DNI["Servicio de validación<br/>DNI / RUC"]
    SMS["Servicio de<br/>correo y SMS"]

    subgraph SIS["Sistema de Licencias de Funcionamiento – Fase 1"]
        CU01(["CU01 Usar el asistente<br/>de ruta"])
        CU02(["CU02 Consultar requisitos,<br/>tasa y plazo"])
        CU03(["CU03 Verificar identidad<br/>con OTP"])
        CU04(["CU04 Presentar solicitud<br/>en línea"])
        CU05(["CU05 Subsanar observación"])
        CU06(["CU06 Consultar estado<br/>del trámite"])
        CU07(["CU07 Descargar esquela<br/>de pago"])
        CU08(["CU08 Descargar licencia<br/>con QR"])
        CU09(["CU09 Verificar licencia<br/>por QR"])
        CU10(["CU10 Recibir avisos<br/>del trámite"])
        CU32(["CU32 Preguntar al chat<br/>de orientación"])
    end

    ADM --- CU01
    ADM --- CU04
    ADM --- CU05
    ADM --- CU06
    ADM --- CU09
    ADM --- CU32
    CU32 -.->|«extend»<br/>si no sabe qué licencia| CU01
    CU01 -.->|«include»| CU02
    CU04 -.->|«include»| CU03
    CU05 -.->|«include»| CU03
    CU07 -.->|«extend»| CU06
    CU08 -.->|«extend»| CU06
    CU03 --- DNI
    CU03 --- SMS
    CU10 --- SMS
    CU10 --- ADM
```

Cualquier persona (por ejemplo, un fiscalizador o un cliente del negocio) puede usar CU09 sin
cuenta: la página pública del QR muestra solo datos mínimos (ADR-007).

## Vista 2: el personal operativo

```mermaid
flowchart LR
    PM["Personal municipal<br/>(los 6 roles)"]
    MP["Personal de<br/>mesa de partes"]
    EV["Evaluador"]
    IN["Inspector ITSE"]
    CA["Personal de caja"]

    subgraph SIS["Sistema de Licencias de Funcionamiento – Fase 1"]
        CU11(["CU11 Iniciar sesión<br/>con OTP"])
        CU12(["CU12 Registrar solicitud<br/>presencial"])
        CU13(["CU13 Evaluar expediente<br/>(confirmar riesgo, aprobar,<br/>observar o denegar)"])
        CU14(["CU14 Generar esquela<br/>de pago"])
        CU15(["CU15 Registrar resultado<br/>ITSE con fotos"])
        CU16(["CU16 Registrar pago<br/>en caja"])
        CU17(["CU17 Emitir licencia<br/>con QR"])
        CU30(["CU30 Ver mi perfil"])
        CU31(["CU31 Cambiar mi clave"])
    end

    PM --- CU11
    PM --- CU30
    PM --- CU31
    CU31 -.->|«extend»<br/>desde el perfil| CU30
    MP --- CU12
    EV --- CU13
    IN --- CU15
    CA --- CU16
    CU13 -.->|«include»<br/>al confirmar el riesgo| CU14
    CU17 -.->|«extend»<br/>ruta A| CU16
    CU17 -.->|«extend»<br/>ruta B, ITSE favorable| CU15
```

**Personal municipal** es un actor general: mesa de partes, evaluador, inspector, caja, jefatura y
administrador son casos particulares de él (generalización de actores), así que todos usan CU11
para entrar. El código OTP lo envía el servicio de correo y SMS. Desde la 011, al entrar cada rol
llega a su pantalla principal, y todo el personal puede ver su propio perfil (CU30) y cambiar su
clave cuando quiera desde ahí (CU31). Nadie ve el perfil de otra persona.

## Vista 3: supervisión y administración

```mermaid
flowchart LR
    JE["Jefatura"]
    AD["Administrador<br/>del sistema"]
    SMS["Servicio de<br/>correo y SMS"]

    subgraph SIS["Sistema de Licencias de Funcionamiento – Fase 1"]
        CU18(["CU18 Asignar inspector"])
        CU19(["CU19 Recibir alertas<br/>de plazos"])
        CU20(["CU20 Ver tablero<br/>y reportes"])
        CU21(["CU21 Corregir número<br/>de recibo"])
        CU22(["CU22 Consultar auditoría"])
        CU23(["CU23 Gestionar usuarios<br/>y roles"])
        CU24(["CU24 Actualizar recetas<br/>del catálogo"])
        CU25(["CU25 Registrar feriados"])
        CU26(["CU26 Ver panel<br/>del administrador"])
        CU27(["CU27 Consultar auditoría<br/>de seguridad"])
        CU28(["CU28 Cerrar sesiones<br/>de un usuario"])
        CU29(["CU29 Desbloquear cuenta"])
    end

    JE --- CU18
    JE --- CU19
    JE --- CU20
    JE --- CU21
    JE --- CU22
    AD --- CU23
    AD --- CU24
    AD --- CU25
    AD --- CU26
    AD --- CU27
    AD --- CU28
    AD --- CU29
    CU28 -.->|«extend»<br/>desde la ficha| CU23
    CU29 -.->|«extend»<br/>desde la ficha| CU23
    CU19 --- SMS
```

La jefatura y el administrador también entran con CU11 (vista 2), como todo el personal municipal.
Desde la 009 el administrador entra directo a su panel (CU26). Su auditoría de seguridad (CU27:
accesos, usuarios y configuración) está separada de la auditoría de la jefatura (CU22: pagos y
decisiones), por separación de funciones.

## Trazabilidad

| CU | Caso de uso | Actor principal | HU | RF | Funcionalidad SDD | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| CU01 | Usar el asistente de ruta | Administrado | HU01 | RF01 | 003 | ✅ Hecho |
| CU02 | Consultar requisitos, tasa y plazo | Administrado | HU01, HU03 | RF02, RF05 | 001 (lista) y 003 (detalle) | ✅ Hecho |
| CU03 | Verificar identidad con OTP | Administrado | HU02 | RF06 | 004 | ✅ Hecho |
| CU04 | Presentar solicitud en línea | Administrado | HU02 | RF04, RF06, RF07 | 004 | ✅ Hecho |
| CU05 | Subsanar observación | Administrado | HU02, HU07 | RF04, RF09 | 005 (el plazo en días hábiles, 006) | ✅ Hecho |
| CU06 | Consultar estado del trámite | Administrado | HU05 | RF03 | 004 | ✅ Hecho |
| CU07 | Descargar esquela de pago | Administrado | HU04 | RF11 | 005 | ✅ Hecho |
| CU08 | Descargar licencia con QR | Administrado | HU06 | RF13 | 006 | ✅ Hecho |
| CU09 | Verificar licencia por QR | Cualquier persona | HU06 | RF13 | 006 | ✅ Hecho |
| CU10 | Recibir avisos del trámite | Administrado | HU05, HU11 | RF14, RF20 | 006 | ✅ Hecho |
| CU11 | Iniciar sesión con OTP | Todo el personal | HU15 | RF16 | 002 | ✅ Hecho |
| CU12 | Registrar solicitud presencial | Mesa de partes | HU02 | RF04, RF07 | 004 | ✅ Hecho |
| CU13 | Evaluar expediente | Evaluador | HU07 | RF07, RF09 | 005 (ruta B con inspección, 006) | ✅ Hecho |
| CU14 | Generar esquela de pago | Sistema (desde CU13) | HU04 | RF05, RF11 | 005 | ✅ Hecho |
| CU15 | Registrar resultado ITSE con fotos | Inspector ITSE | HU08 | RF10 | 006 | ✅ Hecho |
| CU16 | Registrar pago en caja | Personal de caja | HU13 | RF12 | 005 | ✅ Hecho |
| CU17 | Emitir licencia con QR | Sistema (desde CU15 o CU16) | HU06 | RF13, RF25 | 006 | ✅ Hecho |
| CU18 | Asignar inspector | Jefatura | HU08 | RF10 | 006 | ✅ Hecho |
| CU19 | Recibir alertas de plazos | Jefatura | HU09 | RF08 | 006 | ✅ Hecho |
| CU20 | Ver tablero y reportes | Jefatura | HU10 | RF18, RF19 | 007 | ✅ Hecho |
| CU21 | Corregir número de recibo | Jefatura | HU17 | RF24 | 005 | ✅ Hecho |
| CU22 | Consultar auditoría | Jefatura | HU17 | RF25 | 007 | ✅ Hecho |
| CU23 | Gestionar usuarios y roles | Administrador | HU15 | RF17, RF22 | 002 | ✅ Hecho |
| CU24 | Actualizar recetas del catálogo | Administrador | HU14 | RF21 | 003 | ✅ Hecho |
| CU25 | Registrar feriados | Administrador | HU16 | RF23 | 006 | ✅ Hecho |
| CU26 | Ver panel del administrador | Administrador | HU15 | RF17, RF22 | 009 | ✅ Hecho |
| CU27 | Consultar auditoría de seguridad | Administrador | HU15 | RF16, RF22 | 009 | ✅ Hecho |
| CU28 | Cerrar sesiones de un usuario | Administrador | HU15 | RF16, RF22 | 009 | ✅ Hecho |
| CU29 | Desbloquear cuenta | Administrador | HU15 | RF16, RF22 | 009 | ✅ Hecho |
| CU30 | Ver mi perfil | Todo el personal | HU15 | RF16, RF17 | 011 | ✅ Hecho |
| CU31 | Cambiar mi clave | Todo el personal | HU15 | RF16 | 011 | ✅ Hecho |
| CU32 | Preguntar al chat de orientación | Administrado | HU01, HU03 | RF01, RF02 | 012 | ✅ Hecho |

**Cobertura:** las 17 historias de usuario y los 25 requisitos funcionales tienen al menos un caso de
uso, salvo **HU12 / RF15** (transferencia, cambio de giro y duplicado), que queda como trabajo futuro
por alcance del semestre.

## Fuera de la Fase 1

- **Asistente por chat** (WhatsApp Business API, RC13): en la Fase 2 será otro adaptador de entrada
  sobre los mismos casos de uso CU01, CU02 y CU06, sin rehacer la Fase 1 (ADR-003).
- **Trámites conectados** (HU12, RF15): transferencia, cambio de giro y duplicado.
