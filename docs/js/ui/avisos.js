/* Mensajes de acción breves (toasts). */
import { $, elemento, icono } from './componentes.js';

const ICONOS = { exito: 'check', error: 'alerta', info: 'info' };
const MAXIMO = 3;

export function avisar(tipo, texto) {
  const caja = $('avisos');
  const quitar = () => nodo.remove();
  const nodo = elemento('div', { class: `aviso aviso-${tipo}`, role: tipo === 'error' ? 'alert' : 'status' },
    icono(ICONOS[tipo] ?? 'info'),
    elemento('span', {}, texto),
    elemento('button', { type: 'button', class: 'aviso-cerrar', 'aria-label': 'Cerrar mensaje', onclick: quitar }, '×'));
  caja.append(nodo);
  while (caja.children.length > MAXIMO) caja.firstElementChild.remove();
  setTimeout(quitar, tipo === 'error' ? 6000 : 3500);
}
