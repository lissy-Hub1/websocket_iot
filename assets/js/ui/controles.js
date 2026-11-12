/* Botones del mando (grupos y funciones) y selector de DEMO.
   Solo dispara callbacks: las reglas de envío viven en dominio/control.js, igual que para el joystick. */
import { etiquetaCorta, normalizarNombre } from '../dominio/catalogo.js';
import { $, elemento, icono } from './componentes.js';

const TEXTO_ESTADO = { enviando: 'Enviando…', aceptado: 'Aceptado', recibido: 'Recibido', error: 'Error' };
export function iconoDeComando(nombre) {
  const n = normalizarNombre(nombre);
  if (/360/.test(n)) return 'giro-360';
  if (/IZQ|LEFT/.test(n)) return 'giro-izq';
  if (/DER|RIGHT/.test(n)) return 'giro-der';
  if (/EXCAV|BAJAR|CERRAR/.test(n)) return 'excavar';
  if (/DESCARG|SUBIR|ABRIR/.test(n)) return 'descargar';
  if (/LUZ|LUCES/.test(n)) return 'luz';
  if (/MUSICA|CLAXON|BOCINA/.test(n)) return 'musica';
  if (/DEMO/.test(n)) return 'demo';
  if (/ENCENDER|APAGAR/.test(n)) return 'encender';
  return 'rayo';
}

/** Botón de un comando real. El nombre del catálogo siempre forma parte del nombre accesible. */
function botonComando(comando, { clase, nombreIcono, texto, textoDentro = false, alOprimir }) {
  const estado = elemento('span', { class: 'm-estado', 'aria-live': 'off' });
  const visible = texto ? elemento('span', { class: 'm-texto' }, texto) : null;
  return elemento('button', {
    type: 'button',
    class: `m-btn ${clase}`,
    'data-comando': comando.id,
    title: `${comando.nombre} · código ${comando.codigo}`,
    onclick: () => alOprimir(comando),
  }, elemento('span', { class: 'm-forma' }, icono(nombreIcono), textoDentro ? visible : null), textoDentro ? null : visible,
  elemento('span', { class: 'visually-hidden' }, texto ? ` (${comando.nombre})` : comando.nombre), estado);
}

export function pintarMando(catalogo, { alComando }) {
  const laterales = catalogo.grupos.filter((g) => g.id !== 'funciones');
  $('mandoGrupos').replaceChildren(...laterales.map((grupo) => elemento('div', { class: 'grupo', role: 'group', 'aria-label': grupo.titulo, 'data-grupo': grupo.id },
    elemento('p', { class: 'grupo-titulo', 'aria-hidden': 'true' }, grupo.titulo),
    elemento('div', { class: 'grupo-botones' }, grupo.comandos.map((comando) => botonComando(comando, {
      clase: 'par-btn',
      nombreIcono: iconoDeComando(comando.nombre),
      texto: etiquetaCorta(comando.nombre, grupo.id),
      textoDentro: true,
      alOprimir: alComando,
    }))))));
  $('mandoGrupos').hidden = !laterales.length;

  const funciones = catalogo.grupos.find((g) => g.id === 'funciones')?.comandos ?? [];
  $('mandoFunciones').replaceChildren(...funciones.map((comando) => botonComando(comando, {
    clase: 'fun-btn',
    nombreIcono: iconoDeComando(comando.nombre),
    texto: etiquetaCorta(comando.nombre, 'funciones'),
    alOprimir: alComando,
  })));
  $('mandoFunciones').hidden = !funciones.length;
}

/** Marca en cada botón el estado de la última acción: enviando, aceptado, recibido o error. */
export function pintarEstadoMando(actual, deshabilitados) {
  for (const boton of document.querySelectorAll('#mando [data-comando]')) {
    boton.disabled = deshabilitados;
    let estado = 'normal';
    if (actual && String(actual.comando.id) === boton.dataset.comando) {
      if (actual.error) estado = 'error';
      else if (actual.evento) estado = 'recibido';
      else if (actual.aceptado) estado = 'aceptado';
      else estado = 'enviando';
    }
    boton.dataset.estado = estado;
    boton.setAttribute('aria-busy', String(estado === 'enviando'));
    boton.querySelector('.m-estado').textContent = TEXTO_ESTADO[estado] ? `, ${TEXTO_ESTADO[estado]}` : '';
  }
}

export function pintarDemos(demos) {
  const selector = $('demoSelector');
  const activas = demos.filter((d) => d.activo);
  selector.replaceChildren(...(activas.length
    ? activas.map((d) => elemento('option', { value: d.id }, d.nombre))
    : [elemento('option', { value: '' }, 'Sin DEMO disponibles')]));
  selector.disabled = !activas.length;
}

const FASES = {
  libre: 'Sin DEMO en ejecución.',
  iniciando: 'Solicitando inicio…',
  ejecutando: 'DEMO en ejecución en el backend.',
  cancelando: 'Solicitando cancelación…',
};

export function pintarEstadoDemo(estado, { puedeIniciar }) {
  const ocupada = estado.fase !== 'libre';
  $('demoSelector').disabled = ocupada || !$('demoSelector').value;
  $('demoIniciar').disabled = !puedeIniciar || ocupada || !$('demoSelector').value;
  $('demoCancelar').disabled = !ocupada || estado.fase === 'cancelando';
  const detalle = estado.total && estado.indice
    ? `Movimiento ${estado.indice} de ${estado.total}${estado.comando ? ` · ${estado.comando}` : ''}`
    : FASES[estado.fase];
  $('demoEstado').textContent = detalle;
  const barra = $('demoBarra');
  barra.hidden = !ocupada;
  const porcentaje = estado.total ? Math.round((estado.indice / estado.total) * 100) : 0;
  barra.setAttribute('aria-valuenow', porcentaje);
  barra.firstElementChild.style.width = `${porcentaje}%`;
}
