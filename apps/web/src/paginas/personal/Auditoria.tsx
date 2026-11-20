import { type SyntheticEvent, useCallback, useEffect, useState } from 'react';
import { CampoFormulario } from '../../componentes/CampoFormulario';
import {
  consultarAuditoriaPagos,
  corregirRecibo,
  type RegistroAuditoria,
} from '../../servicios/clienteApi';
import { formatearFecha } from './Expedientes';

// Auditoría de pagos para la jefatura (historia 6 de la 005, contracts/portal-evaluacion-pago.md):
// filtro por fechas, paginación y "Corregir recibo" con motivo.

const ACCIONES: Record<string, string> = {
  REGISTRAR_PAGO: 'Pago registrado',
  CORREGIR_RECIBO: 'Recibo corregido',
};

type Carga =
  | { readonly tipo: 'cargando' }
  | {
      readonly tipo: 'lista';
      readonly datos: readonly RegistroAuditoria[];
      readonly total: number;
      readonly porPagina: number;
    }
  | { readonly tipo: 'error'; readonly mensaje: string };

interface Detalle {
  readonly reciboAnterior?: string | null;
  readonly reciboNuevo?: string;
  readonly motivo?: string | null;
}

/** Página `/personal/auditoria`. */
export function Auditoria() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [filtro, setFiltro] = useState<{ desde: string | null; hasta: string | null }>({
    desde: null,
    hasta: null,
  });
  const [pagina, setPagina] = useState(1);
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null);
  const [recibo, setRecibo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errorCorreccion, setErrorCorreccion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setCarga({ tipo: 'cargando' });
    const resultado = await consultarAuditoriaPagos({ ...filtro, pagina });
    switch (resultado.tipo) {
      case 'ok':
        setCarga({
          tipo: 'lista',
          datos: resultado.datos,
          total: resultado.total,
          porPagina: resultado.porPagina,
        });
        return;
      case 'invalido':
        setCarga({ tipo: 'error', mensaje: resultado.mensaje });
        return;
      case 'sin-permiso':
        setCarga({ tipo: 'error', mensaje: 'Tu usuario no tiene permiso para ver la auditoría.' });
        return;
      case 'no-disponible':
        setCarga({
          tipo: 'error',
          mensaje: 'No se pudo cargar la auditoría. Vuelve a intentarlo.',
        });
        return;
    }
  }, [filtro, pagina]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    setPagina(1);
    setFiltro({ desde: desde === '' ? null : desde, hasta: hasta === '' ? null : hasta });
  };

  const abrirCorreccion = (codigo: string) => {
    setCorrigiendo(codigo);
    setRecibo('');
    setMotivo('');
    setErrorCorreccion(null);
    setAviso(null);
  };

  const enviarCorreccion = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (corrigiendo === null) {
      return;
    }
    if (motivo.trim().length < 10) {
      setErrorCorreccion('Escribe un motivo de al menos 10 caracteres.');
      return;
    }
    setEnviando(true);
    const resultado = await corregirRecibo(corrigiendo, recibo, motivo.trim());
    setEnviando(false);
    switch (resultado.tipo) {
      case 'ok':
        setAviso(`Recibo de ${corrigiendo} corregido a ${resultado.esquela.numeroRecibo ?? ''}.`);
        setCorrigiendo(null);
        void cargar();
        return;
      case 'invalido':
      case 'conflicto':
        setErrorCorreccion(resultado.mensaje);
        return;
      case 'no-encontrada':
        setErrorCorreccion('La esquela ya no existe.');
        return;
      case 'sin-permiso':
        setErrorCorreccion('Tu usuario no tiene permiso para corregir recibos.');
        return;
      case 'no-disponible':
        setErrorCorreccion('No se pudo corregir. Vuelve a intentarlo.');
        return;
    }
  };

  const paginas =
    carga.tipo === 'lista' ? Math.max(1, Math.ceil(carga.total / carga.porPagina)) : 1;

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Auditoría de pagos</h1>
        <p className="cabecera__descripcion">Pagos registrados y recibos corregidos.</p>
      </header>

      <main className="contenido">
        <form className="tarjeta formulario" onSubmit={filtrar} noValidate>
          <CampoFormulario
            etiqueta="Desde"
            type="date"
            value={desde}
            onChange={(evento) => {
              setDesde(evento.target.value);
            }}
          />
          <CampoFormulario
            etiqueta="Hasta"
            type="date"
            value={hasta}
            onChange={(evento) => {
              setHasta(evento.target.value);
            }}
          />
          <div className="formulario__acciones">
            <button type="submit" className="boton">
              Filtrar
            </button>
          </div>
        </form>

        {aviso && (
          <p className="aviso aviso--info" role="status">
            {aviso}
          </p>
        )}
        {carga.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando…
          </p>
        )}
        {carga.tipo === 'error' && (
          <p className="aviso aviso--error" role="alert">
            {carga.mensaje}
          </p>
        )}

        {carga.tipo === 'lista' && carga.datos.length === 0 && (
          <p className="aviso">No hay registros en ese periodo.</p>
        )}
        {carga.tipo === 'lista' && carga.datos.length > 0 && (
          <table className="bandeja__tabla">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Acción</th>
                <th scope="col">Esquela</th>
                <th scope="col">Recibo</th>
                <th scope="col">Usuario</th>
                <th scope="col">Motivo</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {carga.datos.map((registro, indice) => {
                const detalle = (registro.detalle ?? {}) as Detalle;
                return (
                  <tr key={`${registro.ocurridoEn}-${String(indice)}`}>
                    <td>{formatearFecha(registro.ocurridoEn)}</td>
                    <td>{ACCIONES[registro.accion] ?? registro.accion}</td>
                    <td>{registro.referencia}</td>
                    <td>
                      {detalle.reciboAnterior
                        ? `${detalle.reciboAnterior} → ${detalle.reciboNuevo ?? ''}`
                        : detalle.reciboNuevo}
                    </td>
                    <td>{registro.nombreUsuario ?? '—'}</td>
                    <td>{detalle.motivo ?? '—'}</td>
                    <td>
                      {registro.accion === 'REGISTRAR_PAGO' && registro.referencia && (
                        <button
                          type="button"
                          className="boton boton--claro"
                          onClick={() => {
                            abrirCorreccion(registro.referencia ?? '');
                          }}
                        >
                          Corregir recibo
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {carga.tipo === 'lista' && paginas > 1 && (
          <nav className="paginacion" aria-label="Páginas">
            <button
              type="button"
              className="boton boton--claro"
              disabled={pagina <= 1}
              onClick={() => {
                setPagina(pagina - 1);
              }}
            >
              Anterior
            </button>
            <span>
              Página {pagina} de {paginas}
            </span>
            <button
              type="button"
              className="boton boton--claro"
              disabled={pagina >= paginas}
              onClick={() => {
                setPagina(pagina + 1);
              }}
            >
              Siguiente
            </button>
          </nav>
        )}

        {corrigiendo !== null && (
          <form
            className="tarjeta formulario"
            aria-label={`Corregir recibo de ${corrigiendo}`}
            onSubmit={(evento) => void enviarCorreccion(evento)}
            noValidate
          >
            <h2 className="ficha__subtitulo">Corregir recibo de {corrigiendo}</h2>
            {errorCorreccion && (
              <p className="aviso aviso--error" role="alert">
                {errorCorreccion}
              </p>
            )}
            <CampoFormulario
              etiqueta="Número de recibo correcto"
              autoComplete="off"
              value={recibo}
              onChange={(evento) => {
                setRecibo(evento.target.value);
              }}
            />
            <CampoFormulario
              etiqueta="Motivo de la corrección"
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value);
              }}
            />
            <div className="formulario__acciones">
              <button type="submit" className="boton" disabled={enviando}>
                {enviando ? 'Guardando…' : 'Guardar corrección'}
              </button>
              <button
                type="button"
                className="boton boton--claro"
                onClick={() => {
                  setCorrigiendo(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
