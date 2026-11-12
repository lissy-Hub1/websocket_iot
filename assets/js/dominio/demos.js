/* Ciclo de vida de una DEMO en la interfaz. La secuencia y sus tiempos los ejecuta el backend;
   aquí solo se inicia, se cancela y se reflejan los eventos del WebSocket. */
const MARGEN_FIN_MS = 5000;
const SIN_EVENTOS_MS = 15000;
const ESPERA_CANCELADA_MS = 4000;

export function crearDemos({ iniciarApi, cancelarApi, movimientosApi, alCambiar, alAvisar }) {
  const inicial = () => ({ fase: 'libre', idDemo: null, indice: 0, total: 0, comando: null });
  let estado = inicial();
  let vigilante = null;
  let duracionConocida = false;

  const publicar = () => alCambiar?.({ ...estado });

  function liberar(aviso) {
    clearTimeout(vigilante);
    estado = inicial();
    duracionConocida = false;
    publicar();
    if (aviso) alAvisar?.(aviso.tipo, aviso.texto);
  }

  /* Sin WebSocket no llegaría el evento final: la interfaz no se puede quedar bloqueada. */
  function vigilar(ms) {
    clearTimeout(vigilante);
    vigilante = setTimeout(() => {
      liberar({ tipo: 'error', texto: 'No se recibió el evento final de la DEMO. Su resultado no está confirmado.' });
    }, ms);
  }

  return {
    obtener: () => ({ ...estado }),
    async iniciar(demo) {
      if (estado.fase !== 'libre') return { ok: false, motivo: 'ocupado' };
      estado = { ...inicial(), fase: 'iniciando', idDemo: demo.id };
      publicar();
      const definicion = movimientosApi(demo.id).catch(() => null);
      try {
        const respuesta = await iniciarApi(demo.id);
        const pasos = await definicion;
        if (estado.fase === 'iniciando' || estado.fase === 'ejecutando') {
          estado = { ...estado, fase: 'ejecutando', total: estado.total || respuesta?.total_movimientos || 0 };
          duracionConocida = Array.isArray(pasos);
          const totalMs = duracionConocida
            ? pasos.reduce((suma, p) => suma + (p.duracion_ms || 0) + (p.pausa_ms || 0), 0)
            : 0;
          vigilar(duracionConocida ? totalMs + MARGEN_FIN_MS : SIN_EVENTOS_MS);
          publicar();
        }
        return { ok: true };
      } catch (error) {
        liberar();
        return { ok: false, error };
      }
    },
    async cancelar() {
      if (estado.fase === 'libre' || estado.fase === 'cancelando') return { ok: false, motivo: 'sin_demo' };
      const previo = estado;
      estado = { ...estado, fase: 'cancelando' };
      publicar();
      try {
        await cancelarApi();
        if (estado.fase === 'cancelando') vigilar(ESPERA_CANCELADA_MS);
        return { ok: true };
      } catch (error) {
        if (error.status === 404) liberar();
        else if (estado.fase === 'cancelando') {
          estado = previo;
          publicar();
        }
        return { ok: false, error };
      }
    },
    /** Procesa eventos `demo_*`; devuelve true si el evento era de DEMO. */
    procesarEvento(evento) {
      switch (evento.tipo) {
        case 'demo_inicio':
          estado = { ...estado, fase: estado.fase === 'cancelando' ? 'cancelando' : 'ejecutando', idDemo: evento.id_demo ?? estado.idDemo, total: evento.total ?? estado.total };
          if (estado.fase === 'ejecutando' && !duracionConocida) vigilar(SIN_EVENTOS_MS);
          publicar();
          return true;
        case 'demo_movimiento':
          estado = {
            ...estado,
            fase: estado.fase === 'libre' || estado.fase === 'iniciando' ? 'ejecutando' : estado.fase,
            idDemo: evento.id_demo ?? estado.idDemo,
            indice: evento.indice ?? estado.indice,
            total: evento.total ?? estado.total,
            comando: typeof evento.comando === 'string' ? evento.comando : estado.comando,
          };
          if (!duracionConocida && estado.fase === 'ejecutando') {
            vigilar((evento.duracion_ms || 0) + (evento.pausa_ms || 0) + SIN_EVENTOS_MS);
          }
          publicar();
          return true;
        case 'demo_fin':
          liberar({ tipo: 'exito', texto: 'La API informó el fin de la DEMO.' });
          return true;
        case 'demo_cancelada':
          liberar({ tipo: 'info', texto: 'La API informó la cancelación de la DEMO.' });
          return true;
        case 'demo_error':
          liberar({ tipo: 'error', texto: 'La API informó un error durante la DEMO.' });
          return true;
        default:
          return false;
      }
    },
  };
}
