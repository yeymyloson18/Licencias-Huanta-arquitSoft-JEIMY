import { CIcon } from '@coreui/icons-react';
import { useState } from 'react';
import { useModoColor } from '../../sesion/useModoColor';
import { iconoLuna, iconoSol } from './iconos';

/**
 * Botón del modo de color (013, US6; FR-019 corregido; contracts/portal-diseno.md): alterna entre
 * claro y oscuro. Muestra el modo al que cambia (la luna en claro, el sol en oscuro) y su nombre
 * accesible lo dice. El cambio se anuncia con `aria-live`, sin `role="status"` para no confundirse con
 * el estado de cada pantalla.
 */
export function SelectorModo() {
  const { modo, alternar } = useModoColor();
  const [anuncio, setAnuncio] = useState('');
  const aOscuro = modo === 'claro';

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost-secondary selector-modo"
        aria-label={aOscuro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
        onClick={() => {
          alternar();
          setAnuncio(aOscuro ? 'Modo oscuro activado' : 'Modo claro activado');
        }}
      >
        <CIcon
          icon={aOscuro ? iconoLuna : iconoSol}
          className="selector-modo__icono"
          data-icono={aOscuro ? 'luna' : 'sol'}
        />
      </button>
      <span className="visually-hidden" aria-live="polite">
        {anuncio}
      </span>
    </>
  );
}
