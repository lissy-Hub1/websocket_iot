/* Sesión WSS real del navegador. Su estado NO indica que el vehículo físico esté conectado.
   4.3: el primer mensaje autentica el canal con el token de sesión; la API comprueba el permiso sobre la
   unidad y cierra con 4401 (sesión inválida), 4403 (sin permiso o permiso revocado) o 4404 (no existe). */
const NO_REINTENTAR = { 4401: 'Tu sesión venció.', 4403: 'Ya no tienes permiso sobre esta unidad.', 4404: 'El servidor no reconoce este vehículo.' };

export function crearConexionWs({ url, tiempos, alEstado, alMensaje, obtenerToken = () => '', alSinPermiso, CrearSocket = globalThis.WebSocket }) {
  let socket = null;
  let intento = 0;
  let detenida = false;
  let temporizadorReintento = null;
  let temporizadorLatido = null;
  let temporizadorRespuesta = null;

  const limpiarLatido = () => {
    clearInterval(temporizadorLatido);
    clearTimeout(temporizadorRespuesta);
    temporizadorRespuesta = null;
  };

  function soltarSocket() {
    limpiarLatido();
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try { socket.close(); } catch { /* ya estaba cerrado */ }
    socket = null;
  }

  function programarReintento() {
    clearTimeout(temporizadorReintento);
    if (globalThis.navigator?.onLine === false) {
      alEstado('desconectado', { motivo: 'El dispositivo no tiene red.' });
      return; // el evento "online" reanuda
    }
    alEstado('reconectando', { intento: intento + 1 });
    const espera = Math.min(1000 * 2 ** intento, tiempos.WS_ESPERA_MAX_MS) * (0.8 + Math.random() * 0.4);
    intento += 1;
    temporizadorReintento = setTimeout(abrir, espera);
  }

  function perderSesion() {
    soltarSocket();
    if (!detenida) programarReintento();
  }

  function iniciarLatido() {
    temporizadorLatido = setInterval(() => {
      if (socket?.readyState !== 1) return;
      socket.send('ping');
      clearTimeout(temporizadorRespuesta);
      temporizadorRespuesta = setTimeout(perderSesion, tiempos.WS_RESPUESTA_MS); // sesión muerta sin cierre
    }, tiempos.WS_LATIDO_MS);
  }

  function abrir() {
    if (detenida) return;
    soltarSocket();
    if (intento === 0) alEstado('conectando', {});
    try {
      socket = new CrearSocket(url);
    } catch {
      alEstado('desconectado', { motivo: 'No se pudo abrir la sesión WSS.' });
      return;
    }
    socket.onopen = () => {
      socket.send(JSON.stringify({ tipo: 'auth', token: obtenerToken() }));
      intento = 0;
      alEstado('en_linea', {});
      iniciarLatido();
    };
    socket.onmessage = (mensaje) => {
      clearTimeout(temporizadorRespuesta);
      temporizadorRespuesta = null;
      if (mensaje.data === 'pong') return;
      let datos;
      try { datos = JSON.parse(mensaje.data); } catch { return; }
      if (datos && typeof datos === 'object') alMensaje(datos);
    };
    socket.onclose = (evento) => {
      if (NO_REINTENTAR[evento.code]) {
        soltarSocket();
        detenida = true;
        alEstado('desconectado', { motivo: NO_REINTENTAR[evento.code] });
        alSinPermiso?.(evento.code);
        return;
      }
      perderSesion();
    };
    socket.onerror = () => { /* siempre le sigue onclose, que decide */ };
  }

  const reanudar = () => {
    if (detenida || socket?.readyState === 0 || socket?.readyState === 1) return;
    intento = 0;
    clearTimeout(temporizadorReintento);
    abrir();
  };
  const alPerderRed = () => {
    if (detenida) return;
    soltarSocket();
    clearTimeout(temporizadorReintento);
    alEstado('desconectado', { motivo: 'El dispositivo no tiene red.' });
  };

  globalThis.addEventListener?.('online', reanudar);
  globalThis.addEventListener?.('offline', alPerderRed);
  return { abrir, reanudar };
}
