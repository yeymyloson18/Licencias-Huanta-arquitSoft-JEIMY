## Cambios de alcance (simplificación)

Para hacer el proyecto más viable se tomaron estas decisiones:

| Cambio | Motivo |
|---|---|
| Sin pagos digitales: el sistema genera una **esquela de pago** y se paga en la caja de la Municipalidad | El TUPA indica el pago en caja; se evita integrar una pasarela de pago (ADR-004) |
| El inspector registra la ITSE desde su celular **con internet** | Se elimina la complejidad de trabajar sin conexión |
| Sin recursos de reconsideración ni apelación | Se reduce el alcance de la primera versión |
| Sin bitácora de auditoría ni versionado del catálogo | Se simplifica el diseño; el catálogo se actualiza directamente |
| Sin integración con SIAF-SP | No es necesaria para el trámite de licencias |
| 6 atributos de calidad: rendimiento, seguridad, disponibilidad, escalabilidad, usabilidad y mantenibilidad | Se enfocan los atributos que realmente guían el diseño |