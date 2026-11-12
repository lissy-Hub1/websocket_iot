/* Sesión WSS real del navegador. Su estado NO indica que el vehículo físico esté conectado. */
const NO_REINTENTAR = 4404; // el backend cierra así cuando el vehículo no existe

export function crearConexionWs({ url, tiempos, alEstado, alMensaje, CrearSocket = globalThis.WebSocket }) {
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
      if (evento.code === NO_REINTENTAR) {
        soltarSocket();
        detenida = true;
        alEstado('desconectado', { motivo: 'El servidor no reconoce este vehículo.' });
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
