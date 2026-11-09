/* Cliente HTTP único: URL base, encabezados, tiempo de espera, errores y lectura de JSON. */
import { CONFIG } from '../config.js';
import { ApiError } from '../utilidades/errores.js';
import { obtenerClave } from './sesion.js';

export async function solicitar(ruta, { metodo = 'GET', cuerpo, protegido = false, timeoutMs = CONFIG.TIEMPOS.PETICION_MS } = {}) {
  const encabezados = { Accept: 'application/json' };
  if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json';
  if (protegido) {
    const clave = obtenerClave();
    if (!clave) throw new ApiError('clave');
    encabezados['X-API-Key'] = clave;
  }

  const abortador = new AbortController();
  const temporizador = setTimeout(() => abortador.abort(), timeoutMs);
  let respuesta;
  let texto;
  try {
    respuesta = await fetch(CONFIG.API_BASE_URL + ruta, {
      method: metodo,
      headers: encabezados,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: abortador.signal,
      cache: 'no-store',
    });
    texto = await respuesta.text();
  } catch (error) {
    throw new ApiError(error?.name === 'AbortError' ? 'timeout' : 'red');
  } finally {
    clearTimeout(temporizador);
  }

  let datos = null;
  let esJson = true;
  if (texto) {
    try { datos = JSON.parse(texto); } catch { esJson = false; }
  }
  if (!respuesta.ok) {
    const detalle = esJson && typeof datos?.detail === 'string' ? datos.detail : null;
    throw new ApiError('http', { status: respuesta.status, detalle });
  }
  if (!esJson) throw new ApiError('formato', { status: respuesta.status });
  return datos;
}
