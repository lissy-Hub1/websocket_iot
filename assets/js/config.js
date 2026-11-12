/* Configuración compartida por CONTROL y MONITOREO. Este archivo se publica tal cual en
   GitHub Pages: nunca pongas aquí credenciales de RDS/MySQL ni claves de AWS. */
export const CONFIG = Object.freeze({
  // URL base HTTPS de tu API en AWS, sin diagonal final. Ejemplo: 'https://miiot.duckdns.org'
  API_BASE_URL: 'https://miwebiot.duckdns.org',
  VEHICLE_ID: 1,
  // Clave X-API-Key que la API exige para mover el vehículo y para iniciar/cancelar DEMO.
  // Por decisión del proyecto la web ya no la pide: va aquí y, por lo tanto, ES PÚBLICA.
  // La misma clave protege los /eliminar de la API: cámbiala en el .env del servidor si se filtra.
  API_KEY: 'veiculo_iot_api_key',
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
  // No existe una ruta de salud en la API. /openapi.json está documentada, responde sin tocar
  // la base de datos y por eso solo comprueba que el servidor HTTP atiende.
  saludApi: () => '/openapi.json',
  // Consulta de solo lectura que ejecuta sp_obtener_estado: 200 demuestra que RDS respondió y
  // 503 es el código documentado para "RDS no disponible". Pon null para mostrar «Sin verificar».
  diagnosticoRds: (id) => `/vehiculos/${id}/estado`,
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

export function urlWebSocket(id = CONFIG.VEHICLE_ID) {
  return CONFIG.API_BASE_URL.replace(/^http/, 'ws') + RUTAS.websocket(id);
}
