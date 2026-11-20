import { useEffect, useState } from 'react';

// Tiempo que le queda al permiso de identidad (30 minutos, aclaración de la prueba manual de la
// 004). Se actualiza cada 15 segundos; a 5 minutos o menos avisa que conviene presentar ya.

export const MINUTOS_AVISO = 5;
const INTERVALO_MS = 15_000;

const minutosRestantes = (venceEn: Date, ahora: number): number =>
  Math.max(0, Math.ceil((venceEn.getTime() - ahora) / 60_000));

const enMinutos = (minutos: number) => (minutos === 1 ? '1 minuto' : `${String(minutos)} minutos`);

export function TiempoRestante({ venceEn }: { readonly venceEn: Date }) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const temporizador = setInterval(() => {
      setAhora(Date.now());
    }, INTERVALO_MS);
    return () => {
      clearInterval(temporizador);
    };
  }, []);

  const minutos = minutosRestantes(venceEn, ahora);

  if (minutos === 0) {
    return (
      <p className="aviso aviso--error" role="alert">
        Tu confirmación de identidad venció. Al presentar te pediremos confirmarla de nuevo; lo que
        escribiste se conserva.
      </p>
    );
  }
  if (minutos <= MINUTOS_AVISO) {
    return (
      <p className="aviso aviso--error" role="alert">
        Te quedan {enMinutos(minutos)} para presentar la solicitud. Si se acaba el tiempo, tendrás
        que confirmar tu identidad de nuevo.
      </p>
    );
  }
  return (
    <p className="aviso aviso--info" role="status">
      Te quedan {enMinutos(minutos)} para presentar la solicitud.
    </p>
  );
}
