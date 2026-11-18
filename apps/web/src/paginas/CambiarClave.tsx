import { type SyntheticEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { CampoFormulario } from '../componentes/CampoFormulario';
import { cambiarClave } from '../servicios/clienteApi';
import { useSesion } from '../sesion/ProveedorSesion';

type Campo = 'claveActual' | 'claveNueva' | 'repetir';
type Errores = Partial<Record<Campo, string>>;

const POLITICA = 'Al menos 12 caracteres, con letras y números.';

/** Cambio de clave; obligatorio con clave temporal (FR-022, contracts/portal-seguridad.md). */
export function CambiarClave() {
  const { entrar } = useSesion();
  const navegar = useNavigate();
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [alerta, setAlerta] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const alEnviar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    setAlerta(null);
    if (claveNueva !== repetir) {
      setErrores({ repetir: 'Las claves nuevas no coinciden' });
      return;
    }
    setErrores({});
    setEnviando(true);
    const resultado = await cambiarClave(claveActual, claveNueva);
    setEnviando(false);

    switch (resultado.tipo) {
      case 'ok':
        setClaveActual('');
        setClaveNueva('');
        setRepetir('');
        entrar(resultado.datos);
        void navegar('/', { replace: true, state: { aviso: 'Su clave se cambió' } });
        return;
      case 'invalido': {
        const porCampo: Errores = {};
        for (const { campo, mensaje } of resultado.errores) {
          const clave: Campo = campo === 'claveActual' ? 'claveActual' : 'claveNueva';
          porCampo[clave] = porCampo[clave] ? `${porCampo[clave]}. ${mensaje}` : mensaje;
        }
        setErrores(porCampo);
        return;
      }
      case 'credenciales':
        setErrores({ claveActual: 'La clave actual no es correcta' });
        return;
      case 'bloqueado':
        setAlerta('Demasiados intentos. Vuelva a intentarlo más tarde.');
        return;
      case 'no-disponible':
        setAlerta('No se pudo cambiar la clave en este momento. Inténtelo en unos minutos.');
    }
  };

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Cambiar clave</h1>
        <p className="cabecera__descripcion">Defina su nueva clave para continuar.</p>
      </header>

      <main className="contenido">
        <section className="tarjeta formulario">
          {alerta && (
            <p className="aviso aviso--error" role="alert">
              {alerta}
            </p>
          )}
          <form onSubmit={(evento) => void alEnviar(evento)} noValidate>
            <CampoFormulario
              etiqueta="Clave actual"
              type="password"
              autoComplete="current-password"
              required
              value={claveActual}
              error={errores.claveActual}
              onChange={(evento) => {
                setClaveActual(evento.target.value);
              }}
            />
            <CampoFormulario
              etiqueta="Clave nueva"
              type="password"
              autoComplete="new-password"
              required
              value={claveNueva}
              ayuda={POLITICA}
              error={errores.claveNueva}
              onChange={(evento) => {
                setClaveNueva(evento.target.value);
              }}
            />
            <CampoFormulario
              etiqueta="Repetir clave nueva"
              type="password"
              autoComplete="new-password"
              required
              value={repetir}
              error={errores.repetir}
              onChange={(evento) => {
                setRepetir(evento.target.value);
              }}
            />
            <button type="submit" className="boton" disabled={enviando}>
              Cambiar clave
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
