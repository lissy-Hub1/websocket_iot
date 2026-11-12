/* Los tres indicadores independientes: texto + icono + color, nunca solo color. */
import { icono } from './componentes.js';

const VISTA = {
  ws: {
    en_linea: ['En línea', 'bien', 'check'],
    conectando: ['Conectando…', 'espera', 'reloj'],
    reconectando: ['Reconectando…', 'espera', 'reloj'],
    desconectado: ['Desconectado', 'mal', 'alerta'],
  },
  api: {
    disponible: ['Disponible', 'bien', 'check'],
    comprobando: ['Comprobando…', 'espera', 'reloj'],
    no_disponible: ['No disponible', 'mal', 'alerta'],
  },
  rds: {
    disponible: ['Disponible', 'bien', 'check'],
    no_disponible: ['No disponible', 'mal', 'alerta'],
    sin_verificar: ['Sin verificar', 'neutro', 'info'],
  },
};

/* El mismo indicador aparece en CONTROL y en MONITOREO: se pintan todas sus copias. */
function pintar(nombre, estado, detalle) {
  const [texto, tono, nombreIcono] = VISTA[nombre][estado];
  for (const caja of document.querySelectorAll(`[data-indicador="${nombre}"]`)) {
    caja.dataset.tono = tono;
    caja.querySelector('.ind-icono').replaceChildren(icono(nombreIcono));
    caja.querySelector('.ind-texto').textContent = texto;
    caja.title = detalle || texto;
  }
}

export function pintarWebSocket(estado, datos = {}) {
  const detalle = datos.motivo || (datos.intento ? `Intento de reconexión ${datos.intento}` : 'Sesión WSS de este navegador.');
  pintar('ws', estado, detalle);
}

export function pintarSalud({ api, rds, verificado }) {
  const hora = verificado ? verificado.toLocaleTimeString('es-MX') : '';
  pintar('api', api, hora ? `Servicio de salud comprobado a las ${hora}. No demuestra que funcionen las 21 operaciones.` : '');
  pintar('rds', rds, rds === 'sin_verificar' ? 'No hay una comprobación válida de la base de datos en este momento.' : `Diagnóstico mediante la API a las ${hora}.`);
}
