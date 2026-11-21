/* Práctica 4.3: aviso de la prueba de Invitado con el tiempo restante.
   El tiempo lo dice la API (GET /invitados/sesion); aquí solo se cuenta hacia atrás entre consultas.
   Al llegar a cero la API ya cerró la sesión y detuvo la unidad. */
import * as plataforma from '../api/plataforma.js';
import { $ } from '../ui/componentes.js';
import { mensajeDeError } from '../utilidades/errores.js';
import { avisar } from '../ui/avisos.js';

const formato = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export async function iniciarAvisoInvitado({ alTerminar }) {
  const aviso = $('avisoInvitado');
  aviso.hidden = false;
  let restantes = 0;
  let intervalo = null;

  const terminar = (motivo) => {
    clearInterval(intervalo);
    alTerminar(motivo);
  };

  async function sincronizar() {
    try {
      const s = await plataforma.estadoInvitado();
      restantes = s.segundos_restantes;
      $('invitadoTiempo').textContent = formato(restantes);
    } catch {
      terminar('Tu prueba terminó y la unidad se detuvo.');
    }
  }

  await sincronizar();
  intervalo = setInterval(() => {
    restantes = Math.max(0, restantes - 1);
    $('invitadoTiempo').textContent = formato(restantes);
    aviso.dataset.urgente = String(restantes <= 30);
    if (restantes === 0 || restantes % 30 === 0) sincronizar();
  }, 1000);

  $('invitadoTerminar').addEventListener('click', async () => {
    try {
      await plataforma.terminarInvitado();
    } catch (error) {
      avisar('error', mensajeDeError(error));
    }
    terminar('Terminaste la prueba. La unidad se detuvo.');
  });
}
