# Validación del TUPA

Este documento explica **cómo se asegura que el sistema aplica las reglas reales del TUPA** y registra el resultado de
comparar el catálogo de recetas con el TUPA oficial.

## Fuente oficial

| Documento | Detalle |
|---|---|
| TUPA de la Municipalidad Provincial de Huanta | Aprobado por la Ordenanza Municipal N.° 001-2024-MPH/CM (13/07/2024) y modificado por el Decreto de Alcaldía N.° 009-2024-MPH/A (14/10/2024) |
| Archivo | [`docs/fuentes/tupa-2024.pdf`](../fuentes/tupa-2024.pdf) |
| Cómo citar las páginas | Se usa la numeración impresa del TUPA ("pág."); en el PDF es esa página **+ 8** (por ejemplo, la pág. 368 está en la página 376 del PDF) |
| Normas que el TUPA debe respetar | TUO de la Ley N.° 28976, D.S. N.° 002-2018-PCM y TUO de la Ley N.° 27444 (RC02, RC03 y RC04). Si el TUPA contradice la ley, prevalece la ley. |

## Método de validación

1. **Fuentes completas:** el TUPA vigente con todas sus modificaciones y las leyes que lo enmarcan.
2. **Una ficha por procedimiento:** cada dato de la receta (requisitos, tasa, plazo, calificación, orden del ITSE y vigencia) se anota con la página del TUPA de donde sale. Lo que no se puede citar se registra como **duda**.
3. **Validación con la Municipalidad:** las fichas y las dudas se revisan con la Subgerencia de Comercio, Licencias y Control Sanitario (responsable de aprobar las licencias según el TUPA), el área de ITSE, caja y la Oficina General de Asesoría Jurídica. La jefatura firma un **acta de validación**.
4. **Prueba con expedientes reales:** unos 30 expedientes ya resueltos se pasan por el asistente y el catálogo; el resultado (licencia, tasa, ruta y plazo) debe coincidir con lo que decidió la Municipalidad. Esos casos quedan como pruebas automáticas (Jest, EQ-06).
5. **Mantenimiento:** cuando se publique una modificación del TUPA, el administrador actualiza las recetas (HU14, RF21) y se vuelven a correr las pruebas.

## Fichas de las nueve licencias

Todos los datos se tomaron del TUPA. Los nueve procedimientos se pagan en la **Caja de la Entidad, en efectivo (soles)**, no
admiten reconsideración ni apelación ("No aplica") y los aprueba la Subgerencia de Comercio, Licencias y Control Sanitario.

| N.° | Licencia | Código TUPA | Pág. | Tasa (S/) | Plazo | Calificación | ITSE | Vigencia | ¿Coincide con el catálogo? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Riesgo bajo | PE1027344C1 | 368 | 159.50 | 2 días hábiles | Aprobación automática | Posterior, hasta 9 días hábiles | Indeterminada | ✅ Sí |
| 2 | Riesgo medio | PE102730761 | 370 | 177.10 | 2 días hábiles | Aprobación automática | Posterior, hasta 9 días hábiles | Indeterminada | ✅ Sí |
| 3 | Riesgo alto | PE102735B77 | 372 | 305.90 | 8 días hábiles | Evaluación previa con silencio positivo | Previa, hasta 7 días hábiles | Indeterminada | ✅ Sí |
| 4 | Riesgo muy alto | PE102735FC9 | 374 | 538.90 | 8 días hábiles | Evaluación previa con silencio positivo | Previa, hasta 7 días hábiles | Indeterminada | ✅ Sí |
| 5 | Corporativa (mercados, galerías y centros comerciales) | PE102738869 | 376 | 529.20 | 8 días hábiles | Evaluación previa con silencio positivo | Previa, hasta 7 días hábiles | Indeterminada | ✅ Sí |
| 6 | Cesionarios, riesgo medio | PE102734ABB | 378 | 180.40 | 2 días hábiles | Aprobación automática | Posterior, hasta 9 días hábiles | Indeterminada | ✅ Sí |
| 7 | Cesionarios, riesgo alto | PE10273750E | 380 | 309.20 | 8 días hábiles | Evaluación previa con silencio positivo | Previa, hasta 7 días hábiles | Indeterminada | ✅ Sí |
| 8 | Cesionarios, riesgo muy alto | PE10273BF60 | 382 | 542.20 | 8 días hábiles | Evaluación previa con silencio positivo | Previa, hasta 7 días hábiles | Indeterminada | ✅ Sí |
| 9 | Provisional para bodegas | PE102739212 | 388 | Gratuito | 5 días hábiles | Aprobación automática | Se notifica dentro de 6 meses | Provisional de 12 meses | ✅ Sí |

En todas las licencias con ITSE, el certificado ITSE se renueva cada 2 años.

### Requisitos por grupo

| Grupo | Licencias | Requisitos del TUPA |
|---|---|---|
| ITSE posterior | 1, 2 y 6 | 1) Solicitud con declaración jurada (RUC y DNI o carné de extranjería; del representante legal si es persona jurídica). 2) Declaración jurada de vigencia de poder (SUNARP) o carta poder si actúa un representante. 3) Declaración jurada de condiciones de seguridad. 4) Requisitos especiales según el caso (salud, autorización sectorial, patrimonio cultural). |
| ITSE previa | 3, 4, 5, 7 y 8 | Los requisitos 1 y 2 anteriores, más: croquis de ubicación; plano de arquitectura y cálculo de aforo; plano de tableros eléctricos, diagramas unifilares y cuadro de cargas; certificado de puesta a tierra; plan de seguridad; protocolos de los equipos contra incendio; y los requisitos especiales. Los planos no se exigen si se presentaron en los últimos 5 años y la edificación no cambió. |
| Bodega | 9 | 1) Solicitud de licencia provisional con declaración jurada. 2) Declaración jurada de condiciones de seguridad de la bodega. Solo para bodegas de hasta 50 m², de riesgo bajo, en el primer o segundo piso de una vivienda con acceso directo a la calle, y con conformidad de zonificación. |

## Fichas de los trámites conectados (RF15)

| Trámite | Código TUPA | Pág. | Tasa (S/) | Plazo | Calificación | Requisitos |
|---|---|---|---|---|---|---|
| Transferencia de licencia o cambio de denominación | PE10273B979 | 384 | 45.10 | — | Aprobación automática | Declaración jurada y copia del contrato de transferencia. Se mantienen los giros y la zonificación. |
| Cambio de giro | PE1027380A2 | 390 | 46.20 | — | Aprobación automática | Declaración jurada. Solo para licencias de riesgo bajo o medio, y sin subir el riesgo a alto o muy alto. |
| Duplicado del certificado | SE6450ABA0 | 499 | 41.40 | 3 días hábiles | Servicio prestado en exclusividad | Solicitud con el número del certificado, más la fecha y el número de la constancia de pago. |

## Resultado de la comparación

**Coincide con el diseño:** las 9 licencias, sus tasas, plazos, calificación, orden del ITSE y vigencia; el pago solo en caja
(RC11); la licencia gratuita de la bodega; que no hay reconsideración ni apelación; y la regla de los trámites conectados
(si un cambio de giro sube el riesgo, se tramita como licencia nueva).

**Diferencias encontradas (decisiones pendientes).** El diseño todavía no se cambió; cada punto se decide y, si corresponde,
se actualiza en los documentos del proyecto:

| N.° | Lo que dice el TUPA | Lo que dice hoy el diseño | Decisión pendiente |
|---|---|---|---|
| D1 | "La municipalidad, **previa presentación** de la solicitud, determina el nivel de riesgo en función a la matriz de riesgo". El plazo corre desde la presentación. El duplicado pide la constancia de pago **al presentar**. | El riesgo se confirma después de presentar y la esquela se genera después; el pago ocurre en medio del trámite. | Confirmar con la Municipalidad si el pago se hace **antes de presentar**. Si es así, la esquela se generaría al determinar el riesgo, antes de presentar, y la duda sobre los días de espera del pago desaparecería. |
| D2 | Se identifica con **RUC y DNI o carné de extranjería**, también para personas naturales; con representante, carta poder o poder inscrito en SUNARP. | DNI con fecha de emisión, o RUC con el DNI del representante legal. | Agregar el carné de extranjería, el RUC de la persona natural y la representación. |
| D3 | Ruta B: verificación de requisitos e ITSE con certificado en **máximo 7 días hábiles**, y licencia en **1 día hábil**. | El reparto de los 8 días figura como "por validar". | Usar el reparto del TUPA en lugar de "por validar". |
| D4 | Bodega: la licencia definitiva se emite **dentro de 10 días calendario** después de vencer la provisional; requiere conformidad de zonificación. | Definitiva a los 12 meses, sin el plazo de 10 días ni la zonificación. | Agregar esas dos condiciones a la receta 9. |
| D5 | El duplicado es un **servicio prestado en exclusividad**, con plazo de 3 días hábiles, y se presenta en Atención al Ciudadano. | Se trata como un trámite conectado más. | Confirmar si sigue el mismo camino que los otros trámites conectados. |

## Registro de dudas

| N.° | Duda | A quién consultar | Estado |
|---|---|---|---|
| 1 | ¿El derecho de trámite se paga antes de presentar la solicitud? (D1) | Subgerencia de Comercio, Licencias y Control Sanitario; caja | Pendiente |
| 2 | ¿Quién aplica la matriz de riesgo antes de la presentación y con qué preguntas? (base del asistente de tres preguntas) | Subgerencia de Comercio, Licencias y Control Sanitario; área de ITSE | Pendiente |
| 3 | ¿Las tasas son montos fijos o se recalculan con la UIT cada año? El TUPA las publica en soles. | Oficina General de Planeamiento y Presupuesto | Pendiente |
| 4 | ¿Qué días toma cada etapa dentro del plazo de la ruta B en la práctica? (D3) | Área de ITSE | Pendiente |
| 5 | ¿Con cuántos días de anticipación se alerta un plazo? (EQ-07) | Jefatura | Pendiente |

Cuando una duda se resuelve, se anota la respuesta, quién respondió y la fecha.
