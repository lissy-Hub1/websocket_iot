/* Configuración compartida por CONTROL, MONITOREO y ADMINISTRACIÓN. Este archivo se publica tal cual en
   GitHub Pages: nunca pongas aquí credenciales de RDS/MySQL, claves de AWS ni la X-API-Key.
   4.3: ya no hay clave en el navegador. Cada persona inicia sesión con Google (o prueba como Invitado)
   y la API decide qué unidades puede ver u operar. El Client ID de Google se lee de GET /auth/config. */
export const CONFIG = Object.freeze({
  // URL base HTTPS de tu API en AWS, sin diagonal final. Ejemplo: 'https://miiot.duckdns.org'
  API_BASE_URL: 'https://miwebiot.duckdns.org',
  // Zona horaria en la que RDS guarda fecha_hora/fecha_actualizacion (sin desfase en el JSON)
  // y zona en la que se muestran fecha y hora en MONITOREO.
  ZONA_HORARIA_BD: 'UTC',
  ZONA_HORARIA_VISTA: 'America/Mexico_City',
  // Máximo de movimientos individuales en la tabla de MONITOREO.
  LIMITE_HISTORIAL: 10,
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
    // Pausa para agrupar varios eventos WSS seguidos en una sola consulta del historial.
    SINCRONIZAR_HISTORIAL_MS: 350,
  }),
});

/* Contrato real de la API (Swagger). Cualquier ruta nueva se agrega aquí, no en los módulos. */
export const RUTAS = Object.freeze({
  // /openapi.json responde sin tocar la base de datos: solo comprueba que el servidor HTTP atiende.
  saludApi: () => '/openapi.json',
  // 4.3: diagnóstico real del backend. 200 = RDS ejecutó sp_salud; 503 = RDS no disponible.
  // Pon null para mostrar siempre «Sin verificar».
  diagnosticoRds: () => '/salud',
  vehiculo: (id) => `/vehiculos/${id}`,
  estado: (id) => `/vehiculos/${id}/estado`,
  historial: (id, limite) => `/vehiculos/${id}/historial?limite=${limite}`,
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

export function urlWebSocket(id) {
  return CONFIG.API_BASE_URL.replace(/^http/, 'ws') + RUTAS.websocket(id);
}
