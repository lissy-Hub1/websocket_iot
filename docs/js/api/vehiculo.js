/* Operaciones de la API que usa CONTROL. Los datos remotos se validan antes de entrar a la app. */
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
