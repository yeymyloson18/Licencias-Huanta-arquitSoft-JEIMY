import { CDropdown, CDropdownItem, CDropdownMenu, CDropdownToggle } from '@coreui/react';
import { CIcon } from '@coreui/icons-react';
import { NavLink, useNavigate } from 'react-router';
import { useSesion } from '../../sesion/ProveedorSesion';
import { iconoUsuario } from './iconos';

/**
 * Desplegable del usuario en la barra (013, US1): el nombre completo, "Mi perfil" (011) y "Cerrar
 * sesión" con la misma lógica que tenía el menú. CoreUI lo abre con Enter o Espacio, lo recorre con
 * las flechas y lo cierra con Escape devolviendo el foco al botón.
 */
export function DesplegableUsuario() {
  const { sesion, salir } = useSesion();
  const navegar = useNavigate();

  if (sesion === null) {
    return null;
  }

  const nombre = sesion.usuario.nombreCompleto;
  const cerrar = async () => {
    await salir();
    void navegar('/ingresar', { replace: true });
  };

  return (
    <CDropdown alignment="end" className="desplegable-usuario">
      <CDropdownToggle color="secondary" variant="ghost" title={nombre}>
        <CIcon icon={iconoUsuario} className="desplegable-usuario__icono" />
        <span className="desplegable-usuario__nombre">{nombre}</span>
      </CDropdownToggle>
      <CDropdownMenu>
        <CDropdownItem as={NavLink} to="/perfil" end>
          Mi perfil
        </CDropdownItem>
        <CDropdownItem as="button" type="button" onClick={() => void cerrar()}>
          Cerrar sesión
        </CDropdownItem>
      </CDropdownMenu>
    </CDropdown>
  );
}
