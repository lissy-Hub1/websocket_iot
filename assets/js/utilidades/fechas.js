/* Fechas del backend: se interpretan sin inventar nada y se muestran en la zona configurada.
   - Los eventos WSS traen timestamp ISO 8601 en UTC con «Z».
   - RDS devuelve fecha_hora / fecha_actualizacion sin desfase: se interpretan en CONFIG.ZONA_HORARIA_BD. */
const CON_DESFASE = /([zZ]|[+-]\d{2}:?\d{2})$/;
const ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?/;

/** Convierte el texto del backend en Date. Devuelve null si falta o no es una fecha válida. */
export function interpretarFecha(valor, zonaBd = 'UTC') {
  if (typeof valor !== 'string' || !ISO.test(valor)) return null;
  let texto = valor.trim().replace(' ', 'T');
  if (!CON_DESFASE.test(texto) && zonaBd === 'UTC') texto += 'Z';
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function formatearFecha(fecha, zona) {
  if (!fecha) return '—';
  return fecha.toLocaleDateString('es-MX', { timeZone: zona, day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatearHora(fecha, zona) {
  if (!fecha) return '—';
  return fecha.toLocaleTimeString('es-MX', { timeZone: zona, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** Fecha y hora en el formato ISO-like con nombre de zona, para el atributo title/datetime. */
export function fechaCompleta(fecha, zona) {
  if (!fecha) return '';
  return `${formatearFecha(fecha, zona)} ${formatearHora(fecha, zona)} (${zona})`;
}
