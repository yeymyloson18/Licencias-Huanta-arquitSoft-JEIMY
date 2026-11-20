// Variables de entorno de las pruebas de integración. Mismos valores FICTICIOS de .env.example; solo
// se aplican si la variable no existe, así el CI (o quien ejecute las pruebas) puede reemplazarlos.
const PREDETERMINADOS: Readonly<Record<string, string>> = {
  DATABASE_URL:
    'postgresql://licencias:cambiar_en_produccion_solo_desarrollo@localhost:5432/licencias',
  REDIS_URL: 'redis://localhost:6379',
  NODE_ENV: 'test',
  JWT_SECRETO: 'desarrollo-jwt-solo-no-usar-en-produccion',
  CLAVE_CIFRADO_DATOS: 'ZGVzYXJyb2xsby1jaWZyYWRvLW5vLXVzYXItcHJvZCE=',
  CLAVE_HMAC_DATOS: 'ZGVzYXJyb2xsby1obWFjLXNvbG8tbm8tdXNhci1lbi1wcm9kdWNjaW9u',
  ENVIO_OTP: 'simulado',
  TRUST_PROXY_SALTOS: '1',
  // Sin temporizador: las pruebas procesan la cola de eventos a mano (005).
  DESPACHADOR_INTERVALO_MS: '0',
};

for (const [variable, valor] of Object.entries(PREDETERMINADOS)) {
  process.env[variable] ??= valor;
}
