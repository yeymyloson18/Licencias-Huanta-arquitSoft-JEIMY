import { CDropdown, CDropdownItem, CDropdownMenu, CDropdownToggle } from '@coreui/react';
import { CIcon } from '@coreui/icons-react';
import { useState } from 'react';
import type { ModoColor } from '../../sesion/modo-color';
import { useModoColor } from '../../sesion/useModoColor';
import { iconoLuna, iconoSistema, iconoSol, type Icono } from './iconos';

const OPCIONES: readonly {
  readonly modo: ModoColor;
  readonly texto: string;
  readonly icono: Icono;
  readonly anuncio: string;
}[] = [
  { modo: 'claro', texto: 'Claro', icono: iconoSol, anuncio: 'Modo claro activado' },
  { modo: 'oscuro', texto: 'Oscuro', icono: iconoLuna, anuncio: 'Modo oscuro activado' },
  {
    modo: 'sistema',
    texto: 'Como el sistema',
    icono: iconoSistema,
    anuncio: 'Modo como el sistema activado',
  },
];

/**
 * Selector del modo de color (013, US6; contracts/portal-diseno.md): "Claro", "Oscuro" o "Como el
 * sistema", como opciones `menuitemradio`. El cambio se anuncia en una región `aria-live`. El menú se
 * dibuja como `<div>` para que las opciones sean hijas directas del `role="menu"`.
 */
export function SelectorModo() {
  const { modo, elegir } = useModoColor();
  const [anuncio, setAnuncio] = useState('');
  const actual = OPCIONES.find((opcion) => opcion.modo === modo) ?? OPCIONES[2];

  return (
    <>
      <CDropdown alignment="end" className="selector-modo">
        <CDropdownToggle color="secondary" variant="ghost" caret={false} aria-label="Modo de color">
          {actual !== undefined && <CIcon icon={actual.icono} className="selector-modo__icono" />}
        </CDropdownToggle>
        <CDropdownMenu as="div">
          {OPCIONES.map((opcion) => (
            <CDropdownItem
              key={opcion.modo}
              as="button"
              type="button"
              role="menuitemradio"
              aria-checked={opcion.modo === modo}
              onClick={() => {
                elegir(opcion.modo);
                setAnuncio(opcion.anuncio);
              }}
            >
              {opcion.texto}
            </CDropdownItem>
          ))}
        </CDropdownMenu>
      </CDropdown>
      {/* Sin role="status": cada pantalla ya tiene su propio estado, y este anuncio no debe
          confundirse con él. aria-live basta para que se lea. */}
      <span className="visually-hidden selector-modo__anuncio" aria-live="polite">
        {anuncio}
      </span>
    </>
  );
}
