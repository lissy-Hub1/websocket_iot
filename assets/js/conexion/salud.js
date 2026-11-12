/* Comprobación periódica de la API y de RDS. Cada estado sale de una respuesta real:
   una falla de la API deja a RDS en «Sin verificar», nunca se le atribuye a la base de datos. */
export function crearMonitorSalud({ comprobarApi, comprobarRds, hayDiagnosticoRds, tiempos, alCambiar }) {
  const estado = { api: 'comprobando', rds: 'sin_verificar', verificado: null };
  let enCurso = false;
  let temporizador = null;

  async function ciclo() {
    if (enCurso) return;
    enCurso = true;
    clearTimeout(temporizador);
    if (estado.api !== 'disponible') {
      estado.api = 'comprobando';
      alCambiar({ ...estado });
    }

    const anterior = estado.api;
    try {
      await comprobarApi();
      estado.api = 'disponible';
    } catch {
      estado.api = 'no_disponible';
      estado.rds = 'sin_verificar';
    }

    if (estado.api === 'disponible' && hayDiagnosticoRds()) {
      try {
        await comprobarRds();
        estado.rds = 'disponible';
      } catch (error) {
        if (error.status === 503) estado.rds = 'no_disponible';
        else if (error.status === 404) estado.rds = 'disponible'; // la consulta llegó a RDS: el vehículo no existe
        else estado.rds = 'sin_verificar';
      }
    }

    estado.verificado = new Date();
    alCambiar({ ...estado, recuperada: anterior !== 'disponible' && estado.api === 'disponible' });
    enCurso = false;
    programar();
  }

  function programar() {
    clearTimeout(temporizador);
    const espera = estado.api === 'disponible' ? tiempos.CICLO_SALUD_MS : tiempos.CICLO_SALUD_FALLA_MS;
    temporizador = setTimeout(() => (document.hidden ? programar() : ciclo()), espera);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) ciclo(); });
  globalThis.addEventListener('online', ciclo);
  globalThis.addEventListener('offline', ciclo);
  return { iniciar: ciclo };
}
