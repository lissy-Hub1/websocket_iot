/* Evidencia de la última acción: solicitado → aceptado por API → evento recibido.
   Ningún paso significa que los motores se hayan movido. */
import { mensajeDeError } from '../utilidades/errores.js';
import { $, elemento, icono } from './componentes.js';

const PASOS = [
  ['solicitado', 'Solicitado'],
  ['aceptado', 'Aceptado por API'],
  ['evento', 'Evento recibido'],
];

export function pintarTraza(actual) {
  const titulo = $('trazaComando');
  const lista = $('trazaPasos');
  const error = $('trazaError');
  if (!actual) {
    titulo.textContent = 'Sin acciones todavía';
    lista.replaceChildren(...PASOS.map(([, texto]) => paso(texto, 'pendiente', 'circulo')));
    error.hidden = true;
    return;
  }
  titulo.textContent = actual.comando.nombre;
  const fallo = Boolean(actual.error);
  lista.replaceChildren(
    paso('Solicitado', 'hecho', 'check'),
    paso('Aceptado por API', actual.aceptado ? 'hecho' : (fallo ? 'fallo' : 'pendiente'), actual.aceptado ? 'check' : (fallo ? 'alerta' : 'reloj')),
    paso('Evento recibido', actual.evento ? 'hecho' : 'pendiente', actual.evento ? 'check' : 'circulo'),
  );
  error.hidden = !fallo;
  error.textContent = fallo ? mensajeDeError(actual.error) : '';
}

function paso(texto, estado, nombreIcono) {
  return elemento('li', { class: `paso paso-${estado}` }, icono(nombreIcono), elemento('span', {}, texto));
}

const SIN_DATO = '—';

export function pintarUltimoEvento(evento) {
  const hora = Date.parse(evento.timestamp);
  const partes = [
    evento.tipo,
    typeof evento.comando === 'string' ? evento.comando : null,
    Number.isInteger(evento.codigo) ? `código ${evento.codigo}` : null,
    `vehículo ${evento.id_vehiculo}`,
    Number.isNaN(hora) ? null : new Date(hora).toLocaleTimeString('es-MX'),
  ].filter(Boolean);
  $('trazaEvento').textContent = partes.join(' · ') || SIN_DATO;
}
