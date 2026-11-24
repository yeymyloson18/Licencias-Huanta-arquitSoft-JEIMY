import { EnviadorBuzon } from '../../../../../src/modulos/notificaciones/infraestructura/enviador-buzon';

describe('EnviadorBuzon (009)', () => {
  it('deja el aviso como el simulado y lo entrega con el destino enmascarado', async () => {
    const simulados: string[] = [];
    const mensajes: { asunto: string; texto: string }[] = [];
    const enviador = new EnviadorBuzon(
      {
        enviar: (mensaje) => {
          simulados.push(mensaje.id);
          return Promise.resolve();
        },
      },
      {
        enviar: (mensaje) => {
          mensajes.push(mensaje);
          return Promise.resolve();
        },
      },
    );

    await enviador.enviar({
      id: 'a-1',
      canal: 'SMS',
      destino: '987654321',
      texto: 'Su trámite avanzó',
    });
    await enviador.enviar({
      id: 'a-2',
      canal: 'CORREO',
      destino: 'juana@correo.pe',
      texto: 'Su licencia está lista',
    });

    expect(simulados).toEqual(['a-1', 'a-2']);
    expect(mensajes).toEqual([
      { asunto: 'Aviso de su trámite (SMS) para 9*****321', texto: 'Su trámite avanzó' },
      {
        asunto: 'Aviso de su trámite (correo) para ju***@correo.pe',
        texto: 'Su licencia está lista',
      },
    ]);
  });

  it('si el buzón falla, el error sube (el aviso queda para reintentar)', async () => {
    const enviador = new EnviadorBuzon(
      { enviar: () => Promise.resolve() },
      { enviar: () => Promise.reject(new Error('ECONNREFUSED')) },
    );

    await expect(
      enviador.enviar({ id: 'a-1', canal: 'SMS', destino: '987654321', texto: 't' }),
    ).rejects.toThrow('ECONNREFUSED');
  });
});
