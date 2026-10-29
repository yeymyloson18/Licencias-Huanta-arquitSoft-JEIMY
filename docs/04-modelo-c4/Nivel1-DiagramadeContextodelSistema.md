# C4 – Nivel 1: Diagrama de contexto del sistema

**Qué muestra:** el sistema como una sola caja, las personas que lo usan y los sistemas externos con
los que se comunica.

```mermaid
flowchart TB
    Adm(["Administrado<br/>[Persona]<br/>persona o empresa que abre un negocio"])
    Per(["Personal municipal<br/>[Persona]<br/>mesa de partes y evaluador"])
    Insp(["Inspector ITSE<br/>[Persona]<br/>registra la ITSE desde su celular"])
    Caja(["Personal de caja<br/>[Persona]<br/>cobra y registra el pago"])
    Jef(["Jefatura<br/>[Persona]<br/>supervisa plazos e ingresos"])
    AdmS(["Administrador del sistema<br/>[Persona]<br/>usuarios, roles y catálogo"])

    Sis["Sistema de Trámite de Licencias de Funcionamiento<br/>[Sistema de software]<br/>orienta, recibe solicitudes, genera la esquela de pago,<br/>gestiona la ITSE, emite licencias con QR y controla plazos"]

    Ident["Validación DNI / RUC<br/>[Sistema externo]"]
    Msg["Servicio de correo y SMS<br/>[Sistema externo]"]
    WA["WhatsApp Business API<br/>[Sistema externo - Fase 2]"]

    Adm -->|"consulta, presenta, descarga su esquela y su licencia"| Sis
    Per -->|"registra solicitudes presenciales y evalúa expedientes"| Sis
    Insp -->|"registra el resultado de la ITSE"| Sis
    Caja -->|"registra el pago de la esquela"| Sis
    Jef -->|"revisa alertas, tiempos e ingresos"| Sis
    AdmS -->|"gestiona usuarios y el catálogo"| Sis

    Sis -->|"valida la identidad"| Ident
    Sis -->|"envía avisos"| Msg
    Sis -.->|"atiende consultas por chat"| WA
```

## Elementos

| Elemento | Tipo | Relación con el sistema |
|---|---|---|
| Administrado | Persona | Hace su trámite desde el Portal Web y paga en caja con su esquela. |
| Personal municipal | Persona | Registra solicitudes presenciales y evalúa expedientes. |
| Inspector ITSE | Persona | Registra la inspección con fotos desde su celular, con internet. |
| Personal de caja | Persona | Cobra la tasa y registra el pago con el código de la esquela. |
| Jefatura | Persona | Supervisa plazos, tiempos de atención e ingresos. |
| Administrador del sistema | Persona | Gestiona usuarios, roles y el catálogo de recetas. |
| Validación DNI / RUC | Sistema externo | Valida la identidad del solicitante. |
| Correo y SMS | Sistema externo | Envía las notificaciones. |
| WhatsApp Business API | Sistema externo (Fase 2) | Canal del asistente virtual. |

**Límite del sistema:** no procesa pagos digitales, no define el TUPA ni la matriz de riesgo y no hace la fiscalización en campo.