/* Clave de operación (X-API-Key). Por decisión del proyecto la web ya no la pide al operador:
   se toma de config.js, que es público. Ver la advertencia en ese archivo. */
import { CONFIG } from '../config.js';

export function obtenerClave() {
  return typeof CONFIG.API_KEY === 'string' ? CONFIG.API_KEY.trim() : '';
}
