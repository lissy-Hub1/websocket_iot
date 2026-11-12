/* Errores de la comunicación con la API y su traducción a mensajes para el operador. */
export class ApiError extends Error {
  /** @param {'clave'|'red'|'timeout'|'http'|'formato'} tipo */
  constructor(tipo, { status = null, detalle = null } = {}) {
    super(tipo);
    this.name = 'ApiError';
    this.tipo = tipo;
    this.status = status;
    this.detalle = detalle;
  }

  /** Solo se reintenta cuando no sabemos si la solicitud llegó: nunca ante un rechazo de la API. */
  get reintentable() {
    return this.tipo === 'red' || this.tipo === 'timeout';
  }
}

export function mensajeDeError(error) {
  if (!(error instanceof ApiError)) return 'Ocurrió un error inesperado en la aplicación.';
  switch (error.tipo) {
    case 'clave': return 'Falta la clave de la API en config.js.';
    case 'red': return 'No se pudo contactar a la API. Revisa tu conexión o el servidor.';
    case 'timeout': return 'La API tardó demasiado en responder.';
    case 'formato': return 'La API envió una respuesta que no se pudo interpretar.';
    default: break;
  }
  switch (error.status) {
    case 401: return 'La API pide una clave y config.js no la envía.';
    case 403: return 'La clave de config.js no coincide con la del servidor.';
    case 422: return 'La API rechazó los datos enviados.';
    case 503: return 'La API informa que la base de datos no está disponible.';
    default: break;
  }
  if (error.status === 404 || error.status === 409) return error.detalle || `La API rechazó la operación (${error.status}).`;
  return `La API respondió con un error (${error.status}).`;
}
