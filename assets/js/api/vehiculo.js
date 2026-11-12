/* Operaciones de la API que usan CONTROL y MONITOREO. Los datos remotos se validan antes de entrar a la app. */
import { CONFIG, RUTAS } from '../config.js';
import { ApiError } from '../utilidades/errores.js';
import { solicitar } from './cliente.js';

const ID = CONFIG.VEHICLE_ID;
const esId = (v) => Number.isInteger(v) && v > 0;
const texto = (v) => (typeof v === 'string' ? v : '');

function normalizarVehiculo(datos) {
  if (!datos || !esId(datos.id_vehiculo) || !Array.isArray(datos.comandos) || !Array.isArray(datos.demos)) {
    throw new ApiError('formato');
  }
  return {
    id: datos.id_vehiculo,
    nombre: texto(datos.nombre) || `Vehículo ${datos.id_vehiculo}`,
    modelo: texto(datos.modelo),
    activo: datos.activo === true,
    comandos: datos.comandos
      .filter((c) => c && esId(c.id_comando) && Number.isInteger(c.codigo) && texto(c.nombre))
      .map((c) => ({ id: c.id_comando, nombre: c.nombre, codigo: c.codigo, descripcion: texto(c.descripcion), activo: c.activo === true })),
    demos: datos.demos
      .filter((d) => d && esId(d.id_demo) && texto(d.nombre))
      .map((d) => ({ id: d.id_demo, nombre: d.nombre, descripcion: texto(d.descripcion), activo: d.activo === true })),
  };
}

export async function obtenerVehiculo() {
  return normalizarVehiculo(await solicitar(RUTAS.vehiculo(ID)));
}

/* ---- MONITOREO: solo lectura ---- */
const entero = (v) => (Number.isInteger(v) ? v : null);

/** Último estado guardado (estado_vehiculo). La API responde null si el vehículo aún no tiene estado. */
export async function obtenerEstado() {
  const datos = await solicitar(RUTAS.estado(ID));
  if (datos === null) return null;
  if (!datos || datos.id_vehiculo !== ID || typeof datos.fecha_actualizacion !== 'string') throw new ApiError('formato');
  return {
    idVehiculo: datos.id_vehiculo,
    vehiculo: texto(datos.vehiculo),
    idComando: entero(datos.id_comando),
    comando: texto(datos.comando),
    codigo: entero(datos.codigo),
    fecha: datos.fecha_actualizacion,
  };
}

/** Últimos movimientos individuales persistidos en RDS (historial_comandos), del más reciente al más antiguo. */
export async function obtenerHistorial(limite = CONFIG.LIMITE_HISTORIAL) {
  const datos = await solicitar(RUTAS.historial(ID, limite));
  if (!datos || datos.id_vehiculo !== ID || !Array.isArray(datos.movimientos)) throw new ApiError('formato');
  return datos.movimientos
    .filter((m) => m && esId(m.id_historial) && m.id_vehiculo === ID && typeof m.fecha_hora === 'string')
    .map((m) => ({ id: m.id_historial, comando: texto(m.comando), codigo: entero(m.codigo), fecha: m.fecha_hora, origen: texto(m.origen) }));
}

export function registrarMovimiento(comando, { timeoutMs } = {}) {
  return solicitar(RUTAS.movimiento(ID), {
    metodo: 'POST',
    protegido: true,
    cuerpo: { id_comando: comando.id, origen: CONFIG.ORIGEN },
    timeoutMs,
  });
}

export async function obtenerMovimientosDemo(idDemo) {
  const datos = await solicitar(RUTAS.movimientosDemo(ID, idDemo));
  return Array.isArray(datos) ? datos : [];
}

export function iniciarDemo(idDemo) {
  return solicitar(RUTAS.iniciarDemo(ID, idDemo), { metodo: 'POST', protegido: true });
}

export function cancelarDemo() {
  return solicitar(RUTAS.cancelarDemo(ID), { metodo: 'POST', protegido: true, timeoutMs: CONFIG.TIEMPOS.CANCELAR_DEMO_MS });
}

export function comprobarApi() {
  return solicitar(RUTAS.saludApi(), { timeoutMs: CONFIG.TIEMPOS.SALUD_MS });
}

export const hayDiagnosticoRds = () => Boolean(RUTAS.diagnosticoRds);

export function comprobarRds() {
  return solicitar(RUTAS.diagnosticoRds(ID), { timeoutMs: CONFIG.TIEMPOS.SALUD_MS });
}
