/* Coordinador único de comandos: joystick y botones pasan por aquí.
   - Solo hay un movimiento en vuelo; mientras tanto se conserva únicamente el más reciente.
   - DETENER no espera a nadie: vacía la cola y sale de inmediato.
   - Una respuesta tardía de un comando anterior no reactiva la interfaz, y si el backend la
     registró después de DETENER, se repite DETENER para que sea la última orden. */
export function crearControl({ enviar, origen, alCambiar }) {
  let secuencia = 0;
  let comandoDetener = null;
  let enVuelo = null;
  let pendiente = null;
  let actual = null;
  let bloqueado = false;
  let parada = null; // { traza, promesa } del DETENER en curso
  let ultimaParada = null;
  const recientes = [];

  const notificar = () => alCambiar?.(instantanea());

  function instantanea() {
    return {
      actual: actual && { ...actual },
      ocupado: Boolean(enVuelo || parada || pendiente),
      bloqueado,
    };
  }

  function nuevaTraza(comando, fuente) {
    const traza = {
      id: ++secuencia, comando, fuente,
      aceptado: false, evento: false, error: null, obsoleta: false, respuesta: null, datosEvento: null,
    };
    recientes.push(traza);
    if (recientes.length > 16) recientes.shift();
    actual = traza;
    return traza;
  }

  function drenar() {
    if (enVuelo || parada || !pendiente) return;
    const siguiente = pendiente;
    pendiente = null;
    if (bloqueado) return;
    lanzar(siguiente.comando, siguiente.fuente);
  }

  async function lanzar(comando, fuente) {
    const traza = nuevaTraza(comando, fuente);
    enVuelo = traza;
    notificar();
    try {
      traza.respuesta = await enviar(comando, { esDetener: false });
      traza.aceptado = true;
    } catch (error) {
      traza.error = error;
    }
    if (enVuelo === traza) enVuelo = null;
    if (traza.obsoleta) await reconciliar(traza);
    notificar();
    drenar();
  }

  /* El comando anterior pudo registrarse después del DETENER: se decide con la hora del backend. */
  async function reconciliar(traza) {
    if (parada) await parada.promesa;
    if (!traza.aceptado || !ultimaParada?.aceptado) return;
    if (actual !== ultimaParada || enVuelo || pendiente) return; // ya hay una orden más nueva
    const delAnterior = Date.parse(traza.respuesta?.fecha_hora);
    const deParada = Date.parse(ultimaParada.respuesta?.fecha_hora);
    if (delAnterior < deParada) return;
    await enviarParada(ultimaParada.fuente);
  }

  async function enviarConReintento(traza) {
    try {
      traza.respuesta = await enviar(traza.comando, { esDetener: true });
      traza.aceptado = true;
    } catch (error) {
      if (!error?.reintentable) throw error;
      traza.respuesta = await enviar(traza.comando, { esDetener: true }); // una sola repetición
      traza.aceptado = true;
    }
  }

  function enviarParada(fuente) {
    if (parada) return parada.promesa;
    const traza = nuevaTraza(comandoDetener, fuente);
    ultimaParada = traza;
    const promesa = (async () => {
      try {
        await enviarConReintento(traza);
      } catch (error) {
        traza.error = error;
      }
      parada = null;
      notificar();
      drenar();
      return { ok: traza.aceptado, error: traza.error };
    })();
    parada = { traza, promesa };
    notificar();
    return promesa;
  }

  return {
    fijarDetener(comando) { comandoDetener = comando; },
    bloquear(valor) {
      bloqueado = valor;
      if (valor) pendiente = null;
      notificar();
    },
    /** Pide un movimiento que no sea DETENER. */
    solicitar(comando, fuente) {
      if (bloqueado) return { ok: false, motivo: 'bloqueado' };
      if (enVuelo?.comando.id === comando.id && !pendiente) return { ok: false, motivo: 'duplicado' };
      if (pendiente?.comando.id === comando.id) return { ok: false, motivo: 'duplicado' };
      if (enVuelo || parada) {
        pendiente = { comando, fuente };
        notificar();
        return { ok: true, enCola: true };
      }
      lanzar(comando, fuente);
      return { ok: true, enCola: false };
    },
    /** DETENER funciona aunque haya DEMO o solicitudes pendientes. */
    detener(fuente) {
      if (!comandoDetener) return Promise.resolve({ ok: false, motivo: 'sin_detener' });
      pendiente = null;
      if (enVuelo) {
        enVuelo.obsoleta = true;
        enVuelo = null;
      }
      return enviarParada(fuente);
    },
    /** Asocia un evento `movimiento` del WebSocket con la solicitud que lo produjo. */
    registrarEvento(evento) {
      if (evento.tipo !== 'movimiento' || evento.origen !== origen) return null;
      const traza = recientes.findLast((t) => !t.evento && !t.error && t.comando.id === evento.id_comando);
      if (!traza) return null;
      traza.evento = true;
      traza.datosEvento = evento;
      notificar();
      return traza;
    },
    instantanea,
  };
}
