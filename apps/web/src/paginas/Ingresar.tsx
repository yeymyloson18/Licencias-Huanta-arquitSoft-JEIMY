import { type SyntheticEvent, useState } from 'react';
import { Navigate } from 'react-router';
import { CampoFormulario } from '../componentes/CampoFormulario';
import {
  type DesafioOtp,
  iniciarSesion,
  type ResultadoAuth,
  verificarOtp,
} from '../servicios/clienteApi';
import { useSesion } from '../sesion/ProveedorSesion';

const MENSAJE_CREDENCIALES = 'Correo, clave o código incorrectos.';
const MENSAJE_NO_DISPONIBLE =
  'El inicio de sesión no está disponible en este momento. Inténtelo en unos minutos.';

const dosDigitos = (numero: number) => String(numero).padStart(2, '0');

/** Mensaje para la persona; nunca dice qué dato falló ni repite el correo (FR-005). */
const mensajeDeError = (resultado: Exclude<ResultadoAuth<unknown>, { tipo: 'ok' }>): string => {
  switch (resultado.tipo) {
    case 'credenciales':
    case 'invalido':
      return MENSAJE_CREDENCIALES;
    case 'bloqueado': {
      const hora = `${dosDigitos(resultado.reintentarEn.getHours())}:${dosDigitos(resultado.reintentarEn.getMinutes())}`;
      return `Demasiados intentos. Puede volver a intentarlo a las ${hora}.`;
    }
    case 'no-disponible':
      return MENSAJE_NO_DISPONIBLE;
  }
};

/** Inicio de sesión del personal en dos pasos (FR-001, FR-025; contracts/portal-seguridad.md). */
export function Ingresar() {
  const { estado, sesion, entrar } = useSesion();
  const [desafio, setDesafio] = useState<DesafioOtp | null>(null);
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (sesion !== null) {
    return <Navigate to={sesion.debeCambiarClave ? '/cambiar-clave' : '/'} replace />;
  }

  const pedirCodigo = async () => {
    setEnviando(true);
    setError(null);
    const resultado = await iniciarSesion(correo, clave);
    setEnviando(false);
    if (resultado.tipo === 'ok') {
      setDesafio(resultado.datos);
      setCodigo('');
    } else {
      setError(mensajeDeError(resultado));
    }
  };

  const alEnviarCredenciales = (evento: SyntheticEvent) => {
    evento.preventDefault();
    void pedirCodigo();
  };

  const alEnviarCodigo = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (desafio === null) {
      return;
    }
    setEnviando(true);
    setError(null);
    const resultado = await verificarOtp(desafio.desafioId, codigo);
    setEnviando(false);
    if (resultado.tipo === 'ok') {
      // La clave y el código no se conservan en memoria una vez dentro.
      setClave('');
      setCodigo('');
      entrar(resultado.datos);
    } else {
      setError(mensajeDeError(resultado));
    }
  };

  const volver = () => {
    setDesafio(null);
    setClave('');
    setCodigo('');
    setError(null);
  };

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Ingresar al sistema</h1>
        <p className="cabecera__descripcion">Acceso del personal municipal.</p>
      </header>

      <main className="contenido">
        {estado === 'cargando' ? (
          <p className="aviso" role="status">
            Cargando…
          </p>
        ) : (
          <section className="tarjeta formulario">
            {error && (
              <p className="aviso aviso--error" role="alert">
                {error}
              </p>
            )}

            {desafio === null ? (
              <form onSubmit={alEnviarCredenciales} noValidate>
                <CampoFormulario
                  etiqueta="Correo"
                  type="email"
                  autoComplete="username"
                  required
                  value={correo}
                  onChange={(evento) => {
                    setCorreo(evento.target.value);
                  }}
                />
                <CampoFormulario
                  etiqueta="Clave"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={clave}
                  onChange={(evento) => {
                    setClave(evento.target.value);
                  }}
                />
                <button type="submit" className="boton" disabled={enviando}>
                  Continuar
                </button>
              </form>
            ) : (
              <form onSubmit={(evento) => void alEnviarCodigo(evento)} noValidate>
                <p>Enviamos un código al celular {desafio.celularEnmascarado}</p>
                <CampoFormulario
                  etiqueta="Código"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={codigo}
                  onChange={(evento) => {
                    setCodigo(evento.target.value.replace(/\D/g, ''));
                  }}
                />
                <div className="formulario__acciones">
                  <button type="submit" className="boton" disabled={enviando}>
                    Ingresar
                  </button>
                  <button
                    type="button"
                    className="boton boton--secundario"
                    disabled={enviando}
                    onClick={() => void pedirCodigo()}
                  >
                    Enviar otro código
                  </button>
                  <button type="button" className="boton boton--secundario" onClick={volver}>
                    Volver
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </main>
    </>
  );
}
