/* Configuración pública de la aplicación. NUNCA pongas aquí claves, tokens ni datos de RDS:
   este archivo se publica tal cual en GitHub Pages. */
export const CONFIG = Object.freeze({
  // URL base HTTPS de tu API en AWS, sin diagonal final. Ejemplo: 'https://miiot.duckdns.org'
  API_BASE_URL: 'https://miwebiot.duckdns.org',
  VEHICLE_ID: 1,
  ALUMNO: 'Lisset Gutiérrez Cruz',
  ANIO: 2026,

  // Valor del campo `origen` del POST de movimiento (máximo 30 caracteres).
  ORIGEN: 'CONTROL_WEB',

  TIEMPOS: Object.freeze({
    PETICION_MS: 8000,
    DETENER_MS: 6000,
    CANCELAR_DEMO_MS: 10000, // el backend espera hasta 5 s el paro seguro
    SALUD_MS: 5000,
    CICLO_SALUD_MS: 30000,
    CICLO_SALUD_FALLA_MS: 15000,
    WS_LATIDO_MS: 25000,
    WS_RESPUESTA_MS: 10000,
    WS_ESPERA_MAX_MS: 15000,
  }),
});

/* Contrato real de la API (Swagger). Cualquier ruta nueva se agrega aquí, no en los módulos. */
export const RUTAS = Object.freeze({
  // No existe una ruta de salud en la API. /openapi.json está documentada, responde sin tocar
  // la base de datos y por eso solo comprueba que el servidor HTTP atiende.
  saludApi: () => '/openapi.json',
  // Consulta de solo lectura que ejecuta sp_obtener_estado: 200 demuestra que RDS respondió y
  // 503 es el código documentado para "RDS no disponible". Pon null para mostrar «Sin verificar».
  diagnosticoRds: (id) => `/vehiculos/${id}/estado`,
  vehiculo: (id) => `/vehiculos/${id}`,
  movimiento: (id) => `/vehiculos/${id}/movimientos`,
  movimientosDemo: (id, idDemo) => `/vehiculos/${id}/demos/${idDemo}/movimientos`,
  iniciarDemo: (id, idDemo) => `/vehiculos/${id}/demos/${idDemo}/iniciar`,
  cancelarDemo: (id) => `/vehiculos/${id}/demos/cancelar`,
  websocket: (id) => `/ws/vehiculos/${id}`,
});

export function problemaDeConfiguracion(protocoloPagina = globalThis.location?.protocol) {
  let url;
  try { url = new URL(CONFIG.API_BASE_URL); } catch { return 'La URL base de la API no es válida.'; }
  if (url.hostname === 'TU_DOMINIO'.toLowerCase()) return 'Falta poner la URL de tu API en js/config.js.';
  if (protocoloPagina === 'https:' && url.protocol !== 'https:') {
    return 'La página usa HTTPS y la API no: el navegador bloquearía el contenido mixto.';
  }
  return null;
}

export function urlWebSocket(id = CONFIG.VEHICLE_ID) {
  return CONFIG.API_BASE_URL.replace(/^http/, 'ws') + RUTAS.websocket(id);
}
