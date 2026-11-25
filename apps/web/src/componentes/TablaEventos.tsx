import type { AccionAuditoriaSeguridad, EventoAuditoriaSeguridad } from '../servicios/clienteApi';
import { TablaAdaptable } from './TablaAdaptable';

// Tabla de eventos de la auditoría de seguridad (009, contracts/portal-administrador.md). La usan el
// panel, la auditoría y la ficha del usuario. En pantallas angostas cada fila se apila y cada celda
// muestra su etiqueta (`data-etiqueta`), así no hay desplazamiento horizontal a 360 px.

export const GRUPOS_ACCIONES: readonly {
  readonly grupo: string;
  readonly acciones: readonly {
    readonly valor: AccionAuditoriaSeguridad;
    readonly texto: string;
  }[];
}[] = [
  {
    grupo: 'Ingresos',
    acciones: [
      { valor: 'INGRESO_CORRECTO', texto: 'Ingreso correcto' },
      { valor: 'CLAVE_INCORRECTA', texto: 'Clave incorrecta' },
      { valor: 'CODIGO_INCORRECTO', texto: 'Código incorrecto' },
      { valor: 'CUENTA_BLOQUEADA', texto: 'Cuenta bloqueada por intentos' },
      { valor: 'ORIGEN_BLOQUEADO', texto: 'Origen bloqueado por intentos' },
      { valor: 'CIERRE_SESION', texto: 'Cierre de sesión' },
      { valor: 'CLAVE_CAMBIADA', texto: 'Clave cambiada' },
      { valor: 'CODIGO_ENVIADO', texto: 'Código enviado' },
      { valor: 'CODIGO_LIMITE_ALCANZADO', texto: 'Límite de códigos alcanzado' },
    ],
  },
  {
    grupo: 'Gestión de usuarios',
    acciones: [
      { valor: 'USUARIO_CREADO', texto: 'Usuario creado' },
      { valor: 'USUARIO_EDITADO', texto: 'Usuario editado' },
      { valor: 'USUARIO_DESACTIVADO', texto: 'Usuario desactivado' },
      { valor: 'USUARIO_REACTIVADO', texto: 'Usuario reactivado' },
      { valor: 'ROL_ASIGNADO', texto: 'Rol asignado' },
      { valor: 'ROL_QUITADO', texto: 'Rol quitado' },
      { valor: 'CLAVE_TEMPORAL_ASIGNADA', texto: 'Clave temporal asignada' },
      { valor: 'SESIONES_CERRADAS', texto: 'Sesiones cerradas por el administrador' },
      { valor: 'CUENTA_DESBLOQUEADA', texto: 'Cuenta desbloqueada' },
    ],
  },
  {
    grupo: 'Configuración',
    acciones: [
      { valor: 'RECETA_ACTUALIZADA', texto: 'Receta actualizada' },
      { valor: 'RECETA_DESACTIVADA', texto: 'Receta desactivada' },
      { valor: 'RECETA_REACTIVADA', texto: 'Receta reactivada' },
      { valor: 'FERIADO_REGISTRADO', texto: 'Feriado registrado' },
      { valor: 'FERIADO_ELIMINADO', texto: 'Feriado eliminado' },
    ],
  },
];

const INGRESOS = new Set<string>(GRUPOS_ACCIONES[0]?.acciones.map((accion) => accion.valor) ?? []);

const fechaHora = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** Fecha y hora de Lima, como `23/11/26, 15:05`. */
export const formatearFechaHora = (iso: string): string => fechaHora.format(new Date(iso));

/** Quién actuó; sin actor, "Sin sesión" en los ingresos y "Sistema" en lo demás. */
export const quienActuo = (evento: EventoAuditoriaSeguridad): string =>
  evento.actor?.nombre ?? (INGRESOS.has(evento.accion) ? 'Sin sesión' : 'Sistema');

const OBJETOS: Readonly<Record<string, string>> = {
  IDENTIDAD_ADMINISTRADO: 'Identidad del administrado',
};

const sobreQue = (evento: EventoAuditoriaSeguridad): string =>
  evento.afectado?.nombre ?? (evento.objeto ? (OBJETOS[evento.objeto] ?? evento.objeto) : '—');

const CANALES: Readonly<Record<string, string>> = {
  SIMULADO: 'simulado',
  BUZON: 'buzón de pruebas',
  SMS: 'SMS',
  CORREO: 'correo',
};

const DESENLACES: Readonly<Record<string, string>> = {
  INGRESO_CORRECTO: 'terminó en ingreso correcto',
  CODIGO_INCORRECTO: 'terminó en código incorrecto',
  BLOQUEO: 'terminó en bloqueo',
  SIN_USAR: 'sin usar',
  PENDIENTE: 'pendiente',
  ENVIO_FALLIDO: 'el envío falló',
};

/** Medio, destino enmascarado y desenlace de un código enviado (010); nunca el código. */
export const detalleCodigo = (codigo: NonNullable<EventoAuditoriaSeguridad['codigoEnviado']>) =>
  [
    `por ${CANALES[codigo.canal] ?? codigo.canal} a ${codigo.destino}`,
    codigo.desenlace === null ? null : (DESENLACES[codigo.desenlace] ?? codigo.desenlace),
  ]
    .filter((parte) => parte !== null)
    .join(' · ');

interface Propiedades {
  readonly eventos: readonly EventoAuditoriaSeguridad[];
  /** Nombre accesible de la región que contiene la tabla. */
  readonly etiqueta: string;
}

export function TablaEventos({ eventos, etiqueta }: Propiedades) {
  if (eventos.length === 0) {
    return <p className="aviso">No hay eventos para mostrar.</p>;
  }
  return (
    <TablaAdaptable etiqueta={etiqueta}>
      <table className="table table-hover tabla tabla--apilable">
        <thead>
          <tr>
            <th scope="col">Fecha y hora</th>
            <th scope="col">Acción</th>
            <th scope="col">Quién</th>
            <th scope="col">Sobre quién o qué</th>
            <th scope="col">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((evento) => (
            <tr key={evento.id}>
              <td data-etiqueta="Fecha y hora">{formatearFechaHora(evento.ocurridoEn)}</td>
              <td data-etiqueta="Acción">
                {evento.textoAccion}
                {evento.codigoEnviado && (
                  <span className="tabla__detalle"> ({detalleCodigo(evento.codigoEnviado)})</span>
                )}
              </td>
              <td data-etiqueta="Quién">{quienActuo(evento)}</td>
              <td data-etiqueta="Sobre quién o qué">{sobreQue(evento)}</td>
              <td data-etiqueta="Resultado">
                {evento.resultado === 'EXITO' ? 'Éxito' : 'Rechazado'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TablaAdaptable>
  );
}
