/* Práctica 4.3: «Mis vehículos» y editor de demos.
   - Usuario: solo sus unidades (la API filtra). Puede autorizar soporte temporal al Administrador.
   - Administrador: unidades de la empresa (no vendidas) y las vendidas con soporte autorizado.
   - Editor: demos de FÁBRICA (Admin) o PRIVADAS (comprador), con pasos ordenados y límites seguros.
     La API vuelve a validar todo (comandos de ESA unidad, duraciones y permisos). */
import * as plataforma from '../api/plataforma.js';
import { guardarUnidad, obtenerSesion, obtenerUnidad } from '../api/sesion.js';
import { avisar } from '../ui/avisos.js';
import { $, elemento, icono } from '../ui/componentes.js';
import { abrirFormulario, confirmar } from '../ui/formulario.js';
import { mensajeDeError } from '../utilidades/errores.js';

const LIMITES = { pasos: 30, duracion: 5000, pausa: 5000, total: 120000 };
const MOTIVOS = { PROPIETARIO: 'Tuya', EMPRESA: 'De la empresa', SOPORTE: 'Soporte autorizado' };

let comandos = [];
let pasos = [];
let demoEditando = null; // id_demo o null (nueva)

const segundos = (ms) => `${(ms / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} s`;

// ------------------------------------------------------------------ Mis vehículos
function usarUnidad(u) {
  guardarUnidad({ id: u.id_vehiculo, nombre: u.nombre, serie: u.numero_serie });
  location.hash = '#control';
  location.reload();
}

function accionesSoporte(u) {
  if (obtenerSesion()?.tipo !== 'USUARIO') return [];
  const autorizar = elemento('button', { type: 'button', class: 'btn boton-secundario btn-chico' }, 'Autorizar soporte');
  autorizar.addEventListener('click', () => abrirFormulario({
    titulo: 'Autorizar soporte',
    texto: 'Un Administrador de la empresa podrá ver y operar esta unidad durante el tiempo que elijas. Puedes retirarlo antes.',
    campos: [{ nombre: 'minutos', etiqueta: 'Minutos', tipo: 'number', valor: 30, requerido: true, numero: true }],
    boton: 'Autorizar',
    enviar: async ({ minutos }) => {
      await plataforma.otorgarSoporte(u.id_vehiculo, minutos);
      avisar('exito', `Soporte autorizado por ${minutos} minutos.`);
    },
  }));
  const retirar = elemento('button', { type: 'button', class: 'btn boton-secundario btn-chico' }, 'Retirar soporte');
  retirar.addEventListener('click', async () => {
    try {
      await plataforma.revocarSoporte(u.id_vehiculo);
      avisar('exito', 'Soporte retirado.');
    } catch (error) { avisar('error', mensajeDeError(error)); }
  });
  return [autorizar, retirar];
}

async function pintarUnidades() {
  const caja = $('unidadesLista');
  const sesion = obtenerSesion();
  $('tituloMisVehiculosTexto').textContent = sesion?.tipo === 'ADMIN' ? 'Unidades que puedes operar' : 'Mis vehículos';
  let lista;
  try {
    lista = await plataforma.misVehiculos();
  } catch (error) {
    caja.replaceChildren(elemento('p', { class: 'nota' }, mensajeDeError(error)));
    return [];
  }
  if (!lista.length) {
    caja.replaceChildren(elemento('p', { class: 'nota' }, sesion?.tipo === 'ADMIN'
      ? 'No hay unidades de la empresa disponibles ni soporte autorizado.'
      : 'Aún no tienes vehículos asignados. La empresa te los asigna desde Administración.'));
    return [];
  }
  const actual = obtenerUnidad()?.id;
  caja.replaceChildren(...lista.map((u) => {
    const enUso = u.id_vehiculo === actual;
    const usar = elemento('button', { type: 'button', class: `btn ${enUso ? 'boton-secundario' : 'boton-principal'} btn-chico`, disabled: enUso },
      enUso ? 'En uso' : 'Usar en Control');
    usar.addEventListener('click', () => usarUnidad(u));
    return elemento('article', { class: `unidad-tarjeta${enUso ? ' en-uso' : ''}` },
      elemento('div', { class: 'unidad-icono', 'aria-hidden': 'true' }, icono('coche')),
      elemento('div', { class: 'unidad-info' },
        elemento('h4', {}, u.nombre),
        elemento('p', { class: 'nota mb-1' }, [u.numero_serie, u.modelo].filter(Boolean).join(' · ')),
        elemento('span', { class: 'chip' }, MOTIVOS[u.motivo] ?? u.motivo)),
      elemento('div', { class: 'unidad-acciones' }, usar, ...accionesSoporte(u)));
  }));
  return lista;
}

// ------------------------------------------------------------------ editor de demos
function totalMs() {
  return pasos.reduce((t, p) => t + (Number(p.duracion_ms) || 0) + (Number(p.pausa_ms) || 0), 0);
}

function pintarTotal() {
  const total = totalMs();
  const caja = $('editorTotal');
  caja.textContent = `${pasos.length} de ${LIMITES.pasos} pasos · duración total ${segundos(total)} de ${segundos(LIMITES.total)} máx.`;
  caja.dataset.excedido = String(total > LIMITES.total || pasos.length > LIMITES.pasos);
}

function moverPaso(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= pasos.length) return;
  [pasos[i], pasos[j]] = [pasos[j], pasos[i]];
  pintarPasos(j);
}

function pintarPasos(enfocar) {
  const lista = $('pasosLista');
  lista.replaceChildren(...pasos.map((p, i) => {
    const select = elemento('select', { class: 'form-select', id: `paso${i}Comando`, 'aria-label': `Comando del paso ${i + 1}` },
      comandos.map((c) => elemento('option', { value: c.id_comando, selected: c.id_comando === p.id_comando }, c.nombre)));
    select.addEventListener('change', () => { p.id_comando = Number(select.value); });
    const numero = (campo, etiqueta, max, min) => {
      const input = elemento('input', {
        class: 'form-control', type: 'number', min, max, step: 100, inputmode: 'numeric',
        'aria-label': `${etiqueta} del paso ${i + 1} en milisegundos`,
      });
      input.value = p[campo];
      input.addEventListener('input', () => { p[campo] = Number(input.value); pintarTotal(); });
      return elemento('label', { class: 'paso-num' }, elemento('span', {}, etiqueta), input, elemento('span', { class: 'nota' }, 'ms'));
    };
    const boton = (nombre, etiqueta, accion, deshabilitado) => {
      const b = elemento('button', { type: 'button', class: 'paso-boton', 'aria-label': `${etiqueta} el paso ${i + 1}`, disabled: deshabilitado }, icono(nombre));
      b.addEventListener('click', accion);
      return b;
    };
    const arriba = boton('flecha', 'Subir', () => moverPaso(i, -1), i === 0);
    const abajo = boton('abajo', 'Bajar', () => moverPaso(i, 1), i === pasos.length - 1);
    const quitar = boton('basura', 'Quitar', () => { pasos.splice(i, 1); pintarPasos(); }, false);
    return elemento('li', { class: 'paso' },
      elemento('span', { class: 'paso-orden', 'aria-hidden': 'true' }, String(i + 1)),
      select,
      numero('duracion_ms', 'Duración', LIMITES.duracion, 100),
      numero('pausa_ms', 'Pausa', LIMITES.pausa, 0),
      elemento('span', { class: 'paso-botones' }, arriba, abajo, quitar));
  }));
  if (enfocar != null) $(`paso${enfocar}Comando`)?.focus();
  pintarTotal();
}

function validarEditor() {
  const nombre = $('editorNombre').value.trim();
  if (!nombre) return 'Escribe un nombre para la demo.';
  if (!pasos.length) return 'Agrega al menos un paso.';
  if (pasos.length > LIMITES.pasos) return `Máximo ${LIMITES.pasos} pasos.`;
  for (const [i, p] of pasos.entries()) {
    if (!(p.duracion_ms >= 100 && p.duracion_ms <= LIMITES.duracion)) return `Paso ${i + 1}: la duración va de 100 a ${LIMITES.duracion} ms.`;
    if (!(p.pausa_ms >= 0 && p.pausa_ms <= LIMITES.pausa)) return `Paso ${i + 1}: la pausa va de 0 a ${LIMITES.pausa} ms.`;
  }
  if (totalMs() > LIMITES.total) return `La demo dura ${segundos(totalMs())}; el máximo es ${segundos(LIMITES.total)}.`;
  return null;
}

async function abrirEditor(idUnidad, demo) {
  demoEditando = demo?.id_demo ?? null;
  $('editorTitulo').textContent = demo ? `Editar «${demo.nombre}»` : 'Nueva demo';
  $('editorNombre').value = demo?.nombre ?? '';
  $('editorDescripcion').value = demo?.descripcion ?? '';
  $('editorActivo').checked = demo ? Boolean(demo.activo) : true;
  $('editorError').hidden = true;
  pasos = [];
  if (demo) {
    try {
      pasos = (await plataforma.pasosDemo(idUnidad, demo.id_demo))
        .map((m) => ({ id_comando: m.id_comando, duracion_ms: m.duracion_ms, pausa_ms: m.pausa_ms }));
    } catch (error) {
      avisar('error', mensajeDeError(error));
      return;
    }
  }
  $('editorDemo').hidden = false;
  pintarPasos();
  $('editorNombre').focus();
}

async function pintarDemos(idUnidad) {
  const caja = $('demosLista');
  let demos;
  try {
    demos = await plataforma.demosEditor(idUnidad);
  } catch (error) {
    caja.replaceChildren(elemento('p', { class: 'nota' }, mensajeDeError(error)));
    return;
  }
  if (!demos.length) {
    caja.replaceChildren(elemento('p', { class: 'nota' }, 'Esta unidad aún no tiene demos.'));
    return;
  }
  caja.replaceChildren(elemento('ul', { class: 'demos list-unstyled' }, demos.map((d) => {
    const acciones = [];
    if (d.editable) {
      const editar = elemento('button', { type: 'button', class: 'paso-boton', 'aria-label': `Editar ${d.nombre}` }, icono('editar'));
      editar.addEventListener('click', () => abrirEditor(idUnidad, d));
      const borrar = elemento('button', { type: 'button', class: 'paso-boton peligro', 'aria-label': `Eliminar ${d.nombre}` }, icono('basura'));
      borrar.addEventListener('click', () => confirmar({
        titulo: 'Eliminar demo',
        texto: `Se eliminará «${d.nombre}» y sus ${d.pasos} pasos. No afecta el historial de movimientos.`,
        boton: 'Eliminar',
        enviar: async () => {
          await plataforma.eliminarDemo(idUnidad, d.id_demo);
          avisar('exito', 'Demo eliminada.');
          pintarDemos(idUnidad);
        },
      }));
      acciones.push(editar, borrar);
    } else {
      acciones.push(elemento('span', { class: 'nota' }, 'Solo lectura'));
    }
    return elemento('li', { class: 'demo-fila-editor' },
      elemento('span', { class: `chip-estado ${d.tipo === 'PRIVADA' ? 'privada' : 'fabrica'}` }, d.tipo === 'PRIVADA' ? 'Privada' : 'Fábrica'),
      elemento('span', { class: 'demo-nombre' }, elemento('strong', {}, d.nombre),
        elemento('span', { class: 'nota' }, `${d.pasos} pasos · ${segundos(d.duracion_total_ms)}${d.activo ? '' : ' · inactiva'}`)),
      elemento('span', { class: 'demo-acciones' }, acciones));
  })));
}

function enlazarEditor(idUnidad) {
  $('demoNueva').addEventListener('click', () => abrirEditor(idUnidad, null));
  $('pasoAgregar').addEventListener('click', () => {
    if (pasos.length >= LIMITES.pasos) return avisar('info', `Máximo ${LIMITES.pasos} pasos.`);
    if (!comandos.length) return avisar('error', 'La unidad no tiene comandos activos.');
    const inicial = comandos.find((c) => c.nombre.toUpperCase() !== 'DETENER') ?? comandos[0];
    pasos.push({ id_comando: inicial.id_comando, duracion_ms: 1000, pausa_ms: 200 });
    pintarPasos(pasos.length - 1);
  });
  $('editorCancelar').addEventListener('click', () => { $('editorDemo').hidden = true; });
  $('editorDemo').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const error = $('editorError');
    const problema = validarEditor();
    if (problema) {
      error.textContent = problema;
      error.hidden = false;
      return;
    }
    error.hidden = true;
    const demo = {
      nombre: $('editorNombre').value.trim(),
      descripcion: $('editorDescripcion').value.trim() || null,
      activo: $('editorActivo').checked,
      pasos: pasos.map((p) => ({ id_comando: p.id_comando, duracion_ms: p.duracion_ms, pausa_ms: p.pausa_ms })),
    };
    $('editorGuardar').disabled = true;
    try {
      if (demoEditando) await plataforma.guardarDemo(idUnidad, demoEditando, demo);
      else await plataforma.crearDemo(idUnidad, demo);
      avisar('exito', 'Demo guardada en la base de datos.');
      $('editorDemo').hidden = true;
      pintarDemos(idUnidad);
    } catch (e) {
      error.textContent = mensajeDeError(e);
      error.hidden = false;
    } finally {
      $('editorGuardar').disabled = false;
    }
  });
}

export async function iniciarUnidades() {
  await pintarUnidades();
  const unidad = obtenerUnidad();
  if (!unidad) return;
  $('demosSeccion').hidden = false;
  $('tituloDemosTexto').textContent = `Demos de ${unidad.nombre || `la unidad ${unidad.id}`}`;
  try {
    comandos = (await plataforma.comandosUnidad(unidad.id)).filter((c) => c.activo);
  } catch (error) {
    $('demosLista').replaceChildren(elemento('p', { class: 'nota' }, mensajeDeError(error)));
    return;
  }
  enlazarEditor(unidad.id);
  pintarDemos(unidad.id);
}

/** Unidades que puede operar la cuenta (para elegir una automáticamente si solo hay una). */
export const listarOperables = () => plataforma.misVehiculos();
