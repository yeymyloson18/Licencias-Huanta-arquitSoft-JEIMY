# C4 – Nivel 1: Diagrama de contexto del sistema

**Qué muestra:** el sistema como una sola caja, las personas que lo usan y los sistemas externos con
los que se comunica. Sirve para explicar el alcance a cualquier persona, incluso no técnica.

```mermaid
flowchart TB
    Adm(["Administrado<br/>[Persona]<br/>persona o empresa que abre un negocio"])
    Per(["Personal municipal<br/>[Persona]<br/>mesa de partes y evaluador"])
    Insp(["Inspector ITSE<br/>[Persona]<br/>inspecciona locales en campo"])
    Jef(["Jefatura<br/>[Persona]<br/>supervisa plazos e ingresos"])
    AdmF(["Administrador funcional<br/>[Persona]<br/>mantiene el catálogo del TUPA"])

    Sis["Sistema de Trámite de Licencias de Funcionamiento<br/>[Sistema de software]<br/>orienta, recibe solicitudes, cobra tasas, gestiona la ITSE,<br/>emite licencias con QR y controla plazos"]

    Pasarela["Pasarela de pago<br/>[Sistema externo]"]
    Ident["Validación DNI / RUC<br/>[Sistema externo]"]
    IdDig["Identidad digital del Estado<br/>[Sistema externo]"]
    Msg["Servicio de correo y SMS<br/>[Sistema externo]"]
    WA["WhatsApp Business API<br/>[Sistema externo - Fase 2]"]
    SIAF["SIAF-SP / Trámite documentario<br/>[Sistemas municipales]"]

    Adm -->|"consulta qué licencia le toca, presenta, paga y descarga su licencia"| Sis
    Per -->|"registra solicitudes presenciales y evalúa expedientes"| Sis
    Insp -->|"registra el resultado de la ITSE, incluso sin señal"| Sis
    Jef -->|"revisa alertas, tiempos e ingresos"| Sis
    AdmF -->|"publica versiones del catálogo"| Sis

    Sis -->|"cobra la tasa"| Pasarela
    Sis -->|"valida la identidad"| Ident
    Sis -.->|"inicio de sesión, cuando se habilite"| IdDig
    Sis -->|"envía avisos"| Msg
    Sis -.->|"atiende consultas por chat"| WA
    Sis -->|"registra ingresos y expedientes - API"| SIAF
```

## Elementos

| Elemento | Tipo | Relación con el sistema |
|---|---|---|
| Administrado | Persona | Usa el Portal Web o el celular para hacer su trámite. |
| Personal municipal | Persona | Registra solicitudes presenciales y evalúa expedientes. |
| Inspector ITSE | Persona | Registra inspecciones desde la PWA, incluso sin señal. |
| Jefatura | Persona | Supervisa plazos, tiempos de atención e ingresos. |
| Administrador funcional | Persona | Mantiene las 9 recetas y sus versiones. |
| Pasarela de pago | Sistema externo | Procesa los pagos digitales. |
| Validación DNI / RUC | Sistema externo | Valida la identidad del solicitante. |
| Identidad digital del Estado | Sistema externo | Inicio de sesión del administrado, cuando la Municipalidad lo habilite. |
| Correo y SMS | Sistema externo | Envía las notificaciones. |
| WhatsApp Business API | Sistema externo (Fase 2) | Canal del asistente virtual. |
| SIAF-SP / Trámite documentario | Sistemas municipales | Integración por API; no se modernizan (fuera de alcance). |

**Límite del sistema:** el TUPA, la matriz de riesgo y la fiscalización en campo quedan fuera; el
sistema los lee o registra su resultado, pero no los define.