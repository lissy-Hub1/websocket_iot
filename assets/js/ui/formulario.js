/* Práctica 4.3: formularios accesibles dentro de un <dialog> reutilizable (#dlgForm).
   Cada campo tiene etiqueta, se valida antes de enviar y los errores de la API se muestran dentro del
   formulario (sin cerrar). Todo texto entra como textContent. */
import { mensajeDeError } from '../utilidades/errores.js';
import { $, elemento } from './componentes.js';

let enviarActual = null;

function campo(c, i) {
  const id = `dlgCampo${i}`;
  const comunes = { id, name: c.nombre };
  let control;
  if (c.tipo === 'select') {
    control = elemento('select', { ...comunes, class: 'form-select', required: c.requerido },
      (c.opciones ?? []).map((o) => elemento('option', { value: o.valor, selected: String(o.valor) === String(c.valor ?? '') }, o.texto)));
  } else if (c.tipo === 'checkbox') {
    control = elemento('input', { ...comunes, type: 'checkbox', checked: Boolean(c.valor) });
    return elemento('label', { class: 'dlg-check' }, control, ` ${c.etiqueta}`);
  } else {
    control = elemento('input', {
      ...comunes, class: 'form-control', type: c.tipo ?? 'text', required: c.requerido,
      maxlength: c.max, pattern: c.patron, placeholder: c.ejemplo, autocomplete: 'off',
    });
    control.value = c.valor ?? '';
  }
  return elemento('div', { class: 'dlg-campo' },
    elemento('label', { class: 'form-label', for: id }, c.etiqueta, c.requerido ? elemento('span', { class: 'requerido', 'aria-hidden': 'true' }, ' *') : null),
    control,
    c.ayuda ? elemento('p', { class: 'nota mb-0', id: `${id}Ayuda` }, c.ayuda) : null);
}

function leerValores(form, campos) {
  const valores = {};
  for (const c of campos) {
    const el = form.elements.namedItem(c.nombre);
    if (!el) continue;
    if (c.tipo === 'checkbox') valores[c.nombre] = el.checked;
    else if (c.tipo === 'number' || c.numero) valores[c.nombre] = el.value === '' ? null : Number(el.value);
    else valores[c.nombre] = el.value.trim() === '' ? null : el.value.trim();
  }
  return valores;
}

/** Abre el formulario. `enviar(valores)` debe devolver una promesa; si lanza un error, se muestra y no se cierra. */
export function abrirFormulario({ titulo, campos = [], texto, boton = 'Guardar', peligro = false, enviar }) {
  const dialogo = $('dlgForm');
  const form = $('dlgFormCuerpo');
  $('dlgFormTitulo').textContent = titulo;
  const error = elemento('p', { class: 'editor-error', role: 'alert', hidden: true });
  const botonEnviar = elemento('button', { type: 'submit', class: `btn ${peligro ? 'boton-peligro' : 'boton-principal'}` }, boton);
  form.replaceChildren(
    texto ? elemento('p', { class: 'texto-suave' }, texto) : null,
    ...campos.map(campo),
    error,
    elemento('div', { class: 'editor-acciones' },
      elemento('button', { type: 'button', class: 'btn boton-secundario', onclick: () => dialogo.close() }, 'Cancelar'),
      botonEnviar),
  );
  enviarActual = async (evento) => {
    evento.preventDefault();
    error.hidden = true;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    botonEnviar.disabled = true;
    try {
      await enviar(leerValores(form, campos));
      dialogo.close();
    } catch (e) {
      error.textContent = mensajeDeError(e);
      error.hidden = false;
    } finally {
      botonEnviar.disabled = false;
    }
  };
  dialogo.showModal();
  form.querySelector('input:not([type=checkbox]), select')?.focus();
}

export function confirmar({ titulo, texto, boton = 'Confirmar', peligro = true, enviar }) {
  abrirFormulario({ titulo, texto, boton, peligro, enviar: () => enviar() });
}

export function enlazarFormulario() {
  const dialogo = $('dlgForm');
  $('dlgFormCuerpo').addEventListener('submit', (e) => enviarActual?.(e));
  $('dlgFormCerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });
}
