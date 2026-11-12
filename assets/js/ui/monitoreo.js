/* Vista MONITOREO: tarjeta del último movimiento y tabla de diez movimientos.
   Todo dato remoto entra como textContent. La tabla reutiliza las filas por id_historial
   y solo marca como nuevas las que no estaban antes. */
import { normalizarNombre } from '../dominio/catalogo.js';
import { mensajeDeError } from '../utilidades/errores.js';
import { fechaCompleta, formatearFecha, formatearHora } from '../utilidades/fechas.js';
import { iconoDeComando } from './controles.js';
import { $, elemento, icono } from './componentes.js';

const FUENTES = {
  api: 'API · estado guardado en RDS',
  movimiento: 'WSS · movimiento individual',
  demo: 'WSS · paso de DEMO',
};
const DEMO = {
  fin: 'La DEMO terminó.',
  cancelada: 'La DEMO se canceló.',
  error: 'La DEMO reportó un error en el backend.',
};

const filas = new Map(); // id_historial → <tr>
let primeraTabla = true;
let firmaUltimo = '';

/** Icono según el nombre real del comando; las direcciones usan una flecha girada. */
function iconoMovimiento(nombre) {
  const n = normalizarNombre(nombre || '');
  if (/^(MOVER_)?(AVANZAR|AVANZA|ADELANTE|FRENTE|FORWARD)$/.test(n)) return { nombre: 'flecha', giro: 0 };
  if (/^(MOVER_)?(RETROCEDER|RETROCEDE|ATRAS|REVERSA|BACKWARD|BACK)$/.test(n)) return { nombre: 'flecha', giro: 180 };
  if (/^(GIRAR_|GIRO_|VUELTA_|MOVER_)?(A_LA_)?(IZQUIERDA|IZQ|LEFT)$/.test(n)) return { nombre: 'flecha', giro: -90 };
  if (/^(GIRAR_|GIRO_|VUELTA_|MOVER_)?(A_LA_)?(DERECHA|DER|RIGHT)$/.test(n)) return { nombre: 'flecha', giro: 90 };
  if (/^(DETENER|DETENTE|PARAR|ALTO|STOP)$/.test(n)) return { nombre: 'parar', giro: 0 };
  return { nombre: iconoDeComando(nombre || ''), giro: 0 };
}

function nodoIcono(nombre) {
  const { nombre: id, giro } = iconoMovimiento(nombre);
  const svg = icono(id);
  if (giro) svg.style.transform = `rotate(${giro}deg)`;
  return svg;
}

export function pintarUltimo({ ultimo, demo }, { wsEnLinea, zona, nombreVehiculo }) {
  const caja = $('ultimo');
  const { fase, dato, error } = ultimo;
  caja.dataset.fase = fase;
  caja.dataset.desactualizado = String(fase === 'listo' && !wsEnLinea);

  const chip = $('ultimoFuente');
  const nombre = $('ultimoNombre');
  if (fase === 'cargando') {
    chip.textContent = 'Cargando…';
    nombre.textContent = 'Cargando…';
  } else if (fase === 'vacio') {
    chip.textContent = 'Sin datos';
    nombre.textContent = 'Sin movimientos';
  } else if (fase === 'error') {
    chip.textContent = 'Error';
    nombre.textContent = 'Sin datos actualizados';
  } else {
    chip.textContent = wsEnLinea ? FUENTES[dato.fuente] : `Último valor conocido · ${FUENTES[dato.fuente]}`;
    nombre.textContent = dato.comando;
  }
  caja.dataset.fuente = dato?.fuente ?? '';
  $('ultimoIcono').replaceChildren(dato ? nodoIcono(dato.comando) : icono(fase === 'error' ? 'alerta' : 'actividad'));

  $('ultimoVehiculo').textContent = dato?.vehiculo || nombreVehiculo || '—';
  $('ultimoFecha').textContent = formatearFecha(dato?.fecha ?? null, zona);
  $('ultimoHora').textContent = formatearHora(dato?.fecha ?? null, zona);
  $('ultimoHora').title = fechaCompleta(dato?.fecha ?? null, zona);
  $('ultimoCodigo').textContent = dato?.codigo != null ? String(dato.codigo) : '—';

  const avisoDemo = $('ultimoDemo');
  if (demo?.fase === 'en_curso') {
    avisoDemo.textContent = demo.indice && demo.total ? `DEMO en curso · paso ${demo.indice} de ${demo.total}` : 'DEMO en curso';
  } else if (demo) {
    avisoDemo.textContent = DEMO[demo.fase];
  }
  avisoDemo.hidden = !demo;
  avisoDemo.dataset.fase = demo?.fase ?? '';

  let nota = 'Último movimiento reportado por la API o por WebSocket. No confirma que el vehículo lo haya ejecutado físicamente.';
  if (fase === 'error') nota = `No se pudo consultar el estado: ${mensajeDeError(error)}`;
  else if (fase === 'listo' && !wsEnLinea) nota = 'Sin conexión WSS: se muestra el último valor conocido hasta reconectar.';
  else if (dato?.fuente === 'demo') nota = 'Paso interno de una DEMO: actualiza este panel, pero no se guarda en el historial.';
  $('ultimoNota').textContent = nota;

  // Pequeño destello solo cuando cambia el movimiento mostrado.
  const firma = dato ? `${dato.comando}|${dato.fecha?.getTime() ?? ''}|${dato.fuente}` : fase;
  if (firmaUltimo && firma !== firmaUltimo && dato) {
    caja.classList.remove('recien');
    void caja.offsetWidth; // reinicia la animación
    caja.classList.add('recien');
  }
  firmaUltimo = firma;
}

function crearFila(fila, zona) {
  const celdaNum = elemento('td', { class: 'col-num' });
  const celdaMov = elemento('td', { class: 'col-mov' });
  const celdaFecha = elemento('td', { class: 'col-fecha' });
  const celdaHora = elemento('td', { class: 'col-hora' });
  const celdaOrigen = elemento('td', { class: 'col-origen' });
  const tr = elemento('tr', { 'data-id': fila.id }, celdaNum, celdaMov, celdaFecha, celdaHora, celdaOrigen);
  celdaMov.append(
    elemento('span', { class: 'mov-icono', 'aria-hidden': 'true' }, nodoIcono(fila.comando)),
    elemento('span', { class: 'mov-texto' },
      elemento('span', { class: 'mov-nombre' }, fila.comando || 'Comando sin nombre'),
      elemento('span', { class: 'mov-detalle' }, [`Registro ${fila.id}`, fila.codigo != null ? `código ${fila.codigo}` : null].filter(Boolean).join(' · '))),
  );
  celdaFecha.textContent = formatearFecha(fila.fecha, zona);
  celdaHora.textContent = formatearHora(fila.fecha, zona);
  celdaHora.title = fechaCompleta(fila.fecha, zona);
  celdaOrigen.textContent = fila.origen || '—';
  return tr;
}

export function pintarHistorial({ historial }, { zona, limite }) {
  const cuerpo = $('historialCuerpo');
  const { fase, filas: datos, error, sincronizado, sincronizando } = historial;
  const estado = $('historialEstado');
  $('historialRecargar').disabled = sincronizando;
  estado.dataset.fase = fase;

  if (fase === 'cargando' && !datos.length) {
    estado.textContent = 'Cargando movimientos…';
    cuerpo.replaceChildren(elemento('tr', { class: 'fila-vacia' }, elemento('td', { colspan: '5' }, 'Cargando movimientos…')));
    filas.clear();
    return;
  }

  if (fase === 'error') {
    estado.textContent = `Error al consultar el historial: ${mensajeDeError(error)}${datos.length ? ' Se muestran los últimos datos obtenidos.' : ''}`;
  } else if (sincronizando) {
    estado.textContent = 'Sincronizando con la API…';
  } else if (!datos.length) {
    estado.textContent = 'Sin movimientos registrados para este vehículo.';
  } else {
    estado.textContent = `${datos.length} de máx. ${limite} · sincronizado a las ${formatearHora(sincronizado, undefined)}`;
  }

  if (!datos.length) {
    if (fase === 'listo' || !cuerpo.querySelector('tr[data-id]')) {
      const texto = fase === 'error' ? 'Sin datos: no se pudo consultar el historial.' : 'Sin movimientos';
      cuerpo.replaceChildren(elemento('tr', { class: 'fila-vacia' }, elemento('td', { colspan: '5' }, texto)));
      filas.clear();
    }
    return;
  }

  // Reutiliza filas existentes por id; crea solo las nuevas y quita las que salieron del top 10.
  const ids = new Set(datos.map((f) => f.id));
  for (const [id, tr] of filas) {
    if (!ids.has(id)) {
      tr.remove();
      filas.delete(id);
    }
  }
  cuerpo.querySelectorAll('.fila-vacia').forEach((tr) => tr.remove());
  datos.forEach((fila, indice) => {
    let tr = filas.get(fila.id);
    if (!tr) {
      tr = crearFila(fila, zona);
      if (!primeraTabla) tr.classList.add('fila-nueva');
      filas.set(fila.id, tr);
    }
    tr.firstElementChild.textContent = String(indice + 1);
    if (cuerpo.children[indice] !== tr) cuerpo.insertBefore(tr, cuerpo.children[indice] ?? null);
  });
  primeraTabla = false;
}
