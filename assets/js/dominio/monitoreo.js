/* Estado de MONITOREO: último movimiento reportado + diez movimientos persistidos.
   Reglas (práctica 4.2):
   - REST hace la carga inicial y la recuperación; WSS DISPARA la actualización en vivo.
   - Un evento `movimiento` actualiza la tarjeta y pide el historial confirmado a la API (no se
     inserta la fila a mano: recibir el evento no prueba que quedó guardado).
   - Los pasos de una DEMO solo cambian la tarjeta; nunca entran a la tabla.
   - Se ignoran eventos de otro vehículo, duplicados, eventos fuera de orden y respuestas REST
     atrasadas que pisarían un dato más nuevo. Sin polling: no hay temporizador periódico. */
import { interpretarFecha } from '../utilidades/fechas.js';

const VISTOS_MAX = 100;
const tiempo = (fecha) => (fecha ? fecha.getTime() : 0);

export function crearMonitoreo({ obtenerEstado, obtenerHistorial, idVehiculo, zonaBd, limite, retrasoHistorialMs, alCambiar }) {
  const ultimo = { fase: 'cargando', dato: null, error: null };
  const historial = { fase: 'cargando', filas: [], error: null, sincronizado: null, sincronizando: false };
  let demo = null;

  let versionEvento = 0; // sube con cada evento que cambia la tarjeta
  let secUltimo = 0; // solo vale la respuesta REST más reciente del estado
  let historialEnCurso = null;
  let historialOtraVez = false;
  let temporizadorHistorial = null;
  const vistos = [];

  const notificar = () => alCambiar?.(instantanea());

  function instantanea() {
    return {
      ultimo: { ...ultimo, dato: ultimo.dato && { ...ultimo.dato } },
      historial: { ...historial, filas: historial.filas.map((f) => ({ ...f })) },
      demo: demo && { ...demo },
    };
  }

  /** Aplica un nuevo «último movimiento» si no es más viejo que el que ya se muestra. */
  function aplicarUltimo(nuevo, { desdeApi = false, versionAlPedir = versionEvento } = {}) {
    const actual = ultimo.dato;
    if (actual) {
      // REST atrasada: mientras viajaba llegó un evento con dato igual o más nuevo.
      if (desdeApi && versionAlPedir !== versionEvento && tiempo(nuevo.fecha) <= tiempo(actual.fecha)) return false;
      // Evento fuera de orden: es anterior al que ya se muestra.
      if (!desdeApi && nuevo.fecha && actual.fecha && nuevo.fecha < actual.fecha) return false;
    }
    ultimo.dato = nuevo;
    ultimo.fase = 'listo';
    ultimo.error = null;
    return true;
  }

  async function cargarUltimo() {
    const sec = ++secUltimo;
    const versionAlPedir = versionEvento;
    if (!ultimo.dato) {
      ultimo.fase = 'cargando';
      notificar();
    }
    try {
      const estado = await obtenerEstado();
      if (sec !== secUltimo) return;
      if (!estado || !estado.comando) {
        if (!ultimo.dato) ultimo.fase = 'vacio';
        ultimo.error = null;
      } else {
        aplicarUltimo({
          comando: estado.comando,
          codigo: estado.codigo,
          idComando: estado.idComando,
          vehiculo: estado.vehiculo,
          fecha: interpretarFecha(estado.fecha, zonaBd),
          fuente: 'api',
          origen: '',
          demo: null,
        }, { desdeApi: true, versionAlPedir });
      }
    } catch (error) {
      if (sec !== secUltimo) return;
      ultimo.error = error;
      if (!ultimo.dato) ultimo.fase = 'error';
    }
    notificar();
  }

  function ordenarYLimitar(filas) {
    const porId = new Map();
    for (const fila of filas) porId.set(fila.id, { ...fila, fecha: interpretarFecha(fila.fecha, zonaBd) });
    return [...porId.values()]
      .sort((a, b) => tiempo(b.fecha) - tiempo(a.fecha) || b.id - a.id)
      .slice(0, limite);
  }

  /** Una sola consulta a la vez; si piden otra mientras tanto, se repite una vez al terminar. */
  function sincronizarHistorial() {
    clearTimeout(temporizadorHistorial);
    temporizadorHistorial = null;
    if (historialEnCurso) {
      historialOtraVez = true;
      return historialEnCurso;
    }
    historial.sincronizando = true;
    if (historial.fase !== 'listo' && !historial.filas.length) historial.fase = 'cargando';
    notificar();
    historialEnCurso = (async () => {
      try {
        historial.filas = ordenarYLimitar(await obtenerHistorial(limite));
        historial.fase = 'listo';
        historial.error = null;
        historial.sincronizado = new Date();
      } catch (error) {
        historial.error = error;
        historial.fase = 'error';
      } finally {
        historial.sincronizando = false;
        historialEnCurso = null;
        notificar();
        if (historialOtraVez) {
          historialOtraVez = false;
          sincronizarHistorial();
        }
      }
    })();
    return historialEnCurso;
  }

  /** Agrupa ráfagas de eventos en una sola consulta del historial. */
  function programarHistorial() {
    clearTimeout(temporizadorHistorial);
    temporizadorHistorial = setTimeout(sincronizarHistorial, retrasoHistorialMs);
  }

  function procesarEvento(evento) {
    if (!evento || evento.id_vehiculo !== idVehiculo || typeof evento.tipo !== 'string') return;
    const clave = [evento.tipo, evento.timestamp, evento.id_comando, evento.id_demo, evento.indice].join('|');
    if (vistos.includes(clave)) return;
    vistos.push(clave);
    if (vistos.length > VISTOS_MAX) vistos.shift();

    const fecha = interpretarFecha(evento.timestamp, 'UTC'); // los eventos WSS siempre vienen en UTC
    const texto = (v) => (typeof v === 'string' ? v : '');
    const entero = (v) => (Number.isInteger(v) ? v : null);

    switch (evento.tipo) {
      case 'estado_inicial':
        // Llega al (re)conectar. Su timestamp es el de la conexión, no el del estado: se consulta la API.
        cargarUltimo();
        sincronizarHistorial();
        return;
      case 'movimiento':
        if (!texto(evento.comando)) return;
        versionEvento += 1;
        aplicarUltimo({
          comando: evento.comando, codigo: entero(evento.codigo), idComando: entero(evento.id_comando),
          vehiculo: ultimo.dato?.vehiculo ?? '', fecha, fuente: 'movimiento', origen: texto(evento.origen), demo: null,
        });
        programarHistorial();
        break;
      case 'demo_inicio':
        demo = { fase: 'en_curso', id: entero(evento.id_demo), indice: 0, total: entero(evento.total) };
        break;
      case 'demo_movimiento':
        if (!texto(evento.comando)) return;
        versionEvento += 1;
        demo = { fase: 'en_curso', id: entero(evento.id_demo), indice: entero(evento.indice), total: entero(evento.total) };
        aplicarUltimo({
          comando: evento.comando, codigo: entero(evento.codigo), idComando: entero(evento.id_comando),
          vehiculo: ultimo.dato?.vehiculo ?? '', fecha, fuente: 'demo', origen: '',
          demo: { indice: demo.indice, total: demo.total },
        });
        break;
      case 'demo_fin':
      case 'demo_cancelada':
      case 'demo_error':
        demo = { fase: { demo_fin: 'fin', demo_cancelada: 'cancelada', demo_error: 'error' }[evento.tipo], id: entero(evento.id_demo), indice: null, total: entero(evento.total) };
        // Al terminar o cancelar, el backend puede dejar DETENER como estado sin emitir un evento:
        // se recupera el estado guardado. El historial no cambia con una DEMO.
        cargarUltimo();
        break;
      default:
        return;
    }
    notificar();
  }

  function resincronizar() {
    cargarUltimo();
    sincronizarHistorial();
  }

  return { procesarEvento, resincronizar, sincronizarHistorial, instantanea };
}
