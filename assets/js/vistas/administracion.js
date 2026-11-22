/* Práctica 4.3: ADMINISTRACIÓN comercial (solo se muestra al rol ADMIN; la API lo vuelve a exigir).
   Dashboard con métricas reales, inventario de unidades, modelos, clientes/roles y bitácora. */
import { admin, comandosUnidad } from '../api/plataforma.js';
import { obtenerSesion } from '../api/sesion.js';
import { avisar } from '../ui/avisos.js';
import { $, elemento, icono } from '../ui/componentes.js';
import { abrirFormulario, confirmar } from '../ui/formulario.js';
import { formatearFecha, formatearHora, interpretarFecha } from '../utilidades/fechas.js';
import { mensajeDeError } from '../utilidades/errores.js';
import { CONFIG } from '../config.js';

const ESTADOS = { DISPONIBLE: 'Disponible', ASIGNADO: 'Vendido / asignado', EXHIBICION: 'Exhibición', INACTIVO: 'Inactivo' };
const DASH = [
  ['modelos', 'Modelos activos'], ['unidades', 'Unidades'], ['unidades_asignadas', 'Vendidas / asignadas'],
  ['unidades_disponibles', 'Disponibles'], ['unidades_exhibicion', 'En exhibición'], ['unidades_inactivas', 'Inactivas'],
  ['clientes', 'Clientes'], ['demos', 'Demos'], ['invitados_activos', 'Invitados en prueba'],
];
const PAGINA_BITACORA = 25;

let unidades = [];
let modelos = [];
let usuarios = [];
let desdeBitacora = 0;

const fechaHora = (v, zonaBd = CONFIG.ZONA_HORARIA_BD) => {
  const f = interpretarFecha(v, zonaBd);
  return f ? `${formatearFecha(f, CONFIG.ZONA_HORARIA_VISTA)} ${formatearHora(f, CONFIG.ZONA_HORARIA_VISTA)}` : '—';
};

function tabla(id, columnas, filas, vacio) {
  const t = $(id);
  t.replaceChildren(
    t.querySelector('caption') ?? '',
    elemento('thead', {}, elemento('tr', {}, columnas.map((c) => elemento('th', { scope: 'col', class: c.clase }, c.titulo)))),
    elemento('tbody', {}, filas.length
      ? filas.map((f) => elemento('tr', {}, columnas.map((c) => {
        const v = c.valor(f);
        return elemento('td', { class: c.clase }, v instanceof Node || Array.isArray(v) ? v : String(v ?? '—'));
      })))
      : elemento('tr', { class: 'fila-vacia' }, elemento('td', { colspan: String(columnas.length) }, vacio))),
  );
}

function botonAccion(texto, nombreIcono, accion, peligro = false) {
  const b = elemento('button', { type: 'button', class: `accion${peligro ? ' peligro' : ''}` }, icono(nombreIcono), elemento('span', {}, texto));
  b.addEventListener('click', accion);
  return b;
}

const chipEstado = (estado) => elemento('span', { class: `chip-estado estado-${estado.toLowerCase()}` }, ESTADOS[estado] ?? estado);

async function cargar(funcion, destino, mensaje) {
  try {
    return await funcion();
  } catch (error) {
    destino?.replaceChildren?.(elemento('p', { class: 'nota' }, `${mensaje}: ${mensajeDeError(error)}`));
    avisar('error', `${mensaje}: ${mensajeDeError(error)}`);
    return null;
  }
}

// ------------------------------------------------------------------ dashboard
async function pintarDashboard() {
  const d = await cargar(admin.dashboard, $('dashboard'), 'No se pudo cargar el dashboard');
  if (!d) return;
  $('dashboard').replaceChildren(...DASH.map(([clave, titulo]) =>
    elemento('div', { class: 'dash-tarjeta' }, elemento('span', { class: 'dash-valor' }, String(d[clave])), elemento('span', { class: 'dash-titulo' }, titulo))));
}

// ------------------------------------------------------------------ unidades
const opcionesModelos = (soloActivos = true) => modelos.filter((m) => !soloActivos || m.activo)
  .map((m) => ({ valor: m.id_modelo, texto: m.nombre }));

function formularioUnidad(u) {
  const estados = u ? ['DISPONIBLE', 'EXHIBICION', 'INACTIVO'] : ['DISPONIBLE', 'EXHIBICION'];
  abrirFormulario({
    titulo: u ? `Editar unidad ${u.numero_serie ?? u.id_vehiculo}` : 'Nueva unidad',
    texto: u ? 'INACTIVO es baja lógica: la unidad y su historial se conservan.' : 'Copia los comandos de otra unidad del mismo modelo (capacidades del hardware).',
    campos: [
      { nombre: 'id_modelo', etiqueta: 'Modelo comercial', tipo: 'select', opciones: opcionesModelos(!u), valor: u?.id_modelo, requerido: true, numero: true },
      { nombre: 'numero_serie', etiqueta: 'Número de serie (único)', valor: u?.numero_serie, requerido: true, max: 40, patron: '[A-Za-z0-9._-]{3,40}', ejemplo: 'UNI-0002', ayuda: 'Letras, números, punto, guion o guion bajo.' },
      { nombre: 'nombre', etiqueta: 'Nombre', valor: u?.nombre, requerido: true, max: 80 },
      { nombre: 'microcontrolador', etiqueta: 'Microcontrolador', valor: u?.microcontrolador, max: 50, ejemplo: 'ESP32' },
      { nombre: 'estado', etiqueta: 'Estado comercial', tipo: 'select', valor: u?.estado === 'ASIGNADO' ? '' : u?.estado,
        opciones: estados.map((e) => ({ valor: e, texto: ESTADOS[e] })), requerido: true },
    ],
    enviar: async (v) => {
      if (u) await admin.editarUnidad(u.id_vehiculo, { ...v, descripcion: null });
      else await admin.crearUnidad({ ...v, descripcion: null });
      avisar('exito', u ? 'Unidad actualizada.' : 'Unidad registrada.');
      refrescarTodo();
    },
  });
}

function formularioAsignar(u) {
  const compradores = usuarios.filter((x) => x.rol === 'USUARIO' && x.activo && x.id_usuario !== u.id_propietario);
  if (!compradores.length) return avisar('info', 'Primero da de alta un cliente (pestaña Clientes).');
  abrirFormulario({
    titulo: `${u.id_propietario ? 'Reasignar' : 'Asignar'} ${u.numero_serie ?? u.nombre}`,
    texto: u.id_propietario ? `Hoy pertenece a ${u.propietario_email}. Perderá el acceso de inmediato; el historial se conserva.` : 'El comprador podrá operarla y monitorearla desde «Mis vehículos».',
    campos: [{ nombre: 'id_usuario', etiqueta: 'Comprador', tipo: 'select', requerido: true, numero: true,
      opciones: compradores.map((x) => ({ valor: x.id_usuario, texto: `${x.nombre ?? ''} <${x.email}>`.trim() })) }],
    boton: 'Asignar',
    enviar: async ({ id_usuario: idUsuario }) => {
      await admin.asignar(u.id_vehiculo, idUsuario);
      avisar('exito', 'Unidad asignada.');
      refrescarTodo();
    },
  });
}

function formularioRevocar(u) {
  abrirFormulario({
    titulo: `Quitar propietario de ${u.numero_serie ?? u.nombre}`,
    texto: `${u.propietario_email} perderá el acceso de inmediato. El historial de asignaciones se conserva.`,
    campos: [{ nombre: 'estado', etiqueta: 'Nuevo estado', tipo: 'select', requerido: true,
      opciones: ['DISPONIBLE', 'EXHIBICION', 'INACTIVO'].map((e) => ({ valor: e, texto: ESTADOS[e] })) }],
    boton: 'Revocar', peligro: true,
    enviar: async ({ estado }) => {
      await admin.revocar(u.id_vehiculo, estado);
      avisar('exito', 'Asignación revocada.');
      refrescarTodo();
    },
  });
}

async function formularioComandosInvitado(u) {
  let lista;
  try {
    lista = await comandosUnidad(u.id_vehiculo);
  } catch (error) {
    return avisar('error', mensajeDeError(error));
  }
  abrirFormulario({
    titulo: `Comandos para Invitado · ${u.numero_serie ?? u.nombre}`,
    texto: 'Marca los comandos que puede usar un Invitado en su prueba. Recomendado: movimiento básico y DETENER.',
    campos: lista.filter((c) => c.activo).map((c) => ({ nombre: `c${c.id_comando}`, etiqueta: c.nombre, tipo: 'checkbox', valor: c.permitido_invitado })),
    enviar: async (v) => {
      const cambios = lista.filter((c) => c.activo && Boolean(v[`c${c.id_comando}`]) !== Boolean(c.permitido_invitado));
      for (const c of cambios) await admin.comandoInvitado(u.id_vehiculo, c.id_comando, Boolean(v[`c${c.id_comando}`]));
      avisar('exito', cambios.length ? 'Comandos actualizados.' : 'Sin cambios.');
    },
  });
}

function pintarUnidades() {
  const estado = $('filtroEstado').value;
  const buscar = $('filtroBuscar').value.trim().toLowerCase();
  const filas = unidades.filter((u) => (!estado || u.estado === estado)
    && (!buscar || [u.numero_serie, u.nombre, u.modelo, u.propietario_email].some((x) => (x ?? '').toLowerCase().includes(buscar))));
  tabla('tablaUnidades', [
    { titulo: 'Serie', valor: (u) => u.numero_serie ?? `#${u.id_vehiculo}` },
    { titulo: 'Unidad', valor: (u) => elemento('span', { class: 'mov-texto' }, elemento('span', { class: 'mov-nombre' }, u.nombre), elemento('span', { class: 'mov-detalle' }, u.modelo ?? 'Sin modelo')) },
    { titulo: 'Estado', valor: (u) => chipEstado(u.estado) },
    { titulo: 'Propietario', clase: 'col-ocultable', valor: (u) => u.propietario_email ?? '—' },
    { titulo: 'Conectividad', clase: 'col-ocultable', valor: (u) => (u.conectado == null ? 'Sin verificar' : (u.conectado ? 'Última: conectado' : 'Última: sin conexión')) },
    { titulo: 'Acciones', clase: 'col-acciones', valor: (u) => [
      botonAccion('Editar', 'editar', () => formularioUnidad(u)),
      u.estado === 'ASIGNADO'
        ? botonAccion('Revocar', 'cerrar', () => formularioRevocar(u), true)
        : (u.estado !== 'INACTIVO' ? botonAccion('Asignar', 'usuario', () => formularioAsignar(u)) : null),
      u.estado === 'ASIGNADO' ? botonAccion('Reasignar', 'usuario', () => formularioAsignar(u)) : null,
      u.estado === 'EXHIBICION' ? botonAccion('Invitado', 'tienda', () => formularioComandosInvitado(u)) : null,
    ].filter(Boolean) },
  ], filas, unidades.length ? 'Ninguna unidad coincide con el filtro.' : 'Sin unidades registradas.');
}

// ------------------------------------------------------------------ modelos
function formularioModelo(m) {
  abrirFormulario({
    titulo: m ? `Editar modelo ${m.nombre}` : 'Nuevo modelo comercial',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', valor: m?.nombre, requerido: true, max: 80, ejemplo: 'Vehículo Batman IoT' },
      { nombre: 'descripcion', etiqueta: 'Descripción (catálogo público)', valor: m?.descripcion, max: 500 },
      { nombre: 'imagen_url', etiqueta: 'Imagen (https://… o assets/…)', valor: m?.imagen_url, max: 255, patron: '(https://|assets/|\\./).*', ayuda: 'Opcional. Se muestra en «Prueba nuestros vehículos».' },
      ...(m ? [{ nombre: 'activo', etiqueta: 'Activo (aparece en el catálogo)', tipo: 'checkbox', valor: m.activo }] : []),
    ],
    enviar: async (v) => {
      if (m) await admin.editarModelo(m.id_modelo, v);
      else await admin.crearModelo(v);
      avisar('exito', m ? 'Modelo actualizado.' : 'Modelo registrado.');
      refrescarTodo();
    },
  });
}

function pintarModelos() {
  tabla('tablaModelos', [
    { titulo: 'Modelo', valor: (m) => elemento('span', { class: 'mov-texto' }, elemento('span', { class: 'mov-nombre' }, m.nombre), elemento('span', { class: 'mov-detalle' }, m.descripcion ?? '')) },
    { titulo: 'Unidades', valor: (m) => m.unidades },
    { titulo: 'Estado', valor: (m) => elemento('span', { class: `chip-estado ${m.activo ? 'ok' : 'estado-inactivo'}` }, m.activo ? 'Activo' : 'Inactivo') },
    { titulo: 'Acciones', clase: 'col-acciones', valor: (m) => [botonAccion('Editar', 'editar', () => formularioModelo(m))] },
  ], modelos, 'Sin modelos registrados.');
}

// ------------------------------------------------------------------ clientes
function formularioUsuario(u) {
  const yo = obtenerSesion()?.usuario?.id_usuario;
  abrirFormulario({
    titulo: u ? `Editar ${u.email}` : 'Nueva cuenta',
    texto: u ? 'Al cambiar el rol o dar de baja, se cierran sus sesiones abiertas.' : 'La persona entrará con la cuenta de Google de este correo.',
    campos: [
      ...(u ? [] : [{ nombre: 'email', etiqueta: 'Correo de Google', tipo: 'email', requerido: true, max: 254, ejemplo: 'cliente@gmail.com' }]),
      { nombre: 'nombre', etiqueta: 'Nombre', valor: u?.nombre, max: 120 },
      { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', valor: u?.rol ?? 'USUARIO', requerido: true,
        opciones: [{ valor: 'USUARIO', texto: 'Usuario (comprador)' }, { valor: 'ADMIN', texto: 'Administrador' }] },
      ...(u ? [{ nombre: 'activo', etiqueta: u.id_usuario === yo ? 'Activa (no puedes darte de baja a ti misma)' : 'Cuenta activa', tipo: 'checkbox', valor: u.activo }] : []),
    ],
    enviar: async (v) => {
      if (u) await admin.editarUsuario(u.id_usuario, { nombre: v.nombre, rol: v.rol, activo: v.activo });
      else await admin.crearUsuario(v);
      avisar('exito', u ? 'Cuenta actualizada.' : 'Cuenta registrada.');
      refrescarTodo();
    },
  });
}

function cambiarActivo(u) {
  const activar = !u.activo;
  confirmar({
    titulo: activar ? `Reactivar ${u.email}` : `Dar de baja ${u.email}`,
    texto: activar
      ? 'Podrá volver a iniciar sesión con su cuenta de Google.'
      : 'No podrá iniciar sesión y se cierran sus sesiones abiertas. Su historial (asignaciones, demos y bitácora) se conserva.',
    boton: activar ? 'Reactivar' : 'Dar de baja',
    peligro: !activar,
    enviar: async () => {
      await admin.editarUsuario(u.id_usuario, { nombre: u.nombre, rol: u.rol, activo: activar });
      avisar('exito', activar ? 'Cuenta reactivada.' : 'Cuenta dada de baja.');
      refrescarTodo();
    },
  });
}

function eliminarUsuario(u) {
  confirmar({
    titulo: `Eliminar ${u.email}`,
    texto: 'Se borrará la cuenta de forma permanente. Solo es posible si nunca tuvo unidades, demos ni soporte '
      + '(por ejemplo, un correo mal escrito). Si tiene historial, la API te pedirá darla de baja.',
    boton: 'Eliminar',
    enviar: async () => {
      await admin.eliminarUsuario(u.id_usuario);
      avisar('exito', 'Cuenta eliminada.');
      refrescarTodo();
    },
  });
}

function pintarUsuarios() {
  tabla('tablaUsuarios', [
    { titulo: 'Cuenta', valor: (u) => elemento('span', { class: 'mov-texto' }, elemento('span', { class: 'mov-nombre' }, u.nombre ?? u.email), elemento('span', { class: 'mov-detalle' }, u.email)) },
    { titulo: 'Rol', valor: (u) => elemento('span', { class: `chip-estado ${u.rol === 'ADMIN' ? 'privada' : 'fabrica'}` }, u.rol === 'ADMIN' ? 'Administrador' : 'Usuario') },
    { titulo: 'Unidades', valor: (u) => u.unidades },
    { titulo: 'Último acceso', clase: 'col-ocultable', valor: (u) => fechaHora(u.ultimo_acceso) },
    { titulo: 'Estado', valor: (u) => elemento('span', { class: `chip-estado ${u.activo ? 'ok' : 'estado-inactivo'}` }, u.activo ? 'Activa' : 'Baja') },
    { titulo: 'Acciones', clase: 'col-acciones', valor: (u) => {
      const yo = u.id_usuario === obtenerSesion()?.usuario?.id_usuario;
      return [
        botonAccion('Editar', 'editar', () => formularioUsuario(u)),
        yo ? null : botonAccion(u.activo ? 'Dar de baja' : 'Reactivar', u.activo ? 'cerrar' : 'check', () => cambiarActivo(u), u.activo),
        yo || u.unidades > 0 ? null : botonAccion('Eliminar', 'basura', () => eliminarUsuario(u), true),
      ].filter(Boolean);
    } },
  ], usuarios, 'Sin cuentas registradas.');
}

// ------------------------------------------------------------------ bitácora
async function pintarBitacora() {
  const filas = await cargar(() => admin.auditoria(PAGINA_BITACORA, desdeBitacora), null, 'No se pudo cargar la bitácora');
  if (!filas) return;
  $('bitacoraAntiguos').disabled = filas.length < PAGINA_BITACORA;
  $('bitacoraRecientes').disabled = desdeBitacora === 0;
  tabla('tablaBitacora', [
    { titulo: 'Fecha', valor: (a) => fechaHora(a.fecha) },
    { titulo: 'Actor', valor: (a) => elemento('span', { class: 'mov-texto' }, elemento('span', { class: 'mov-nombre' }, a.actor_email ?? (a.actor_rol === 'INVITADO' ? 'Invitado' : 'Sistema')), elemento('span', { class: 'mov-detalle' }, a.actor_rol)) },
    { titulo: 'Acción', valor: (a) => `${a.accion} · ${a.recurso}${a.id_recurso ? ` #${a.id_recurso}` : ''}` },
    { titulo: 'Resultado', valor: (a) => elemento('span', { class: `chip-estado ${a.resultado === 'OK' ? 'ok' : 'estado-inactivo'}` }, a.resultado) },
  ], filas, 'Sin registros.');
}

// ------------------------------------------------------------------ general
async function refrescarTodo() {
  const [u, m, us] = await Promise.all([
    cargar(admin.unidades, null, 'No se pudo cargar el inventario'),
    cargar(admin.modelos, null, 'No se pudieron cargar los modelos'),
    cargar(admin.usuarios, null, 'No se pudieron cargar las cuentas'),
  ]);
  unidades = u ?? unidades;
  modelos = m ?? modelos;
  usuarios = us ?? usuarios;
  pintarUnidades();
  pintarModelos();
  pintarUsuarios();
  pintarDashboard();
}

function enlazarPestanas() {
  const pestanas = ['Unidades', 'Modelos', 'Clientes', 'Bitacora'];
  const elegir = (nombre) => {
    for (const p of pestanas) {
      const activa = p === nombre;
      $(`tab${p}`).setAttribute('aria-selected', String(activa));
      $(`tab${p}`).tabIndex = activa ? 0 : -1;
      $(`panel${p}`).hidden = !activa;
    }
    if (nombre === 'Bitacora') { desdeBitacora = 0; pintarBitacora(); }
  };
  pestanas.forEach((p, i) => {
    $(`tab${p}`).addEventListener('click', () => elegir(p));
    $(`tab${p}`).addEventListener('keydown', (e) => {
      const delta = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!delta) return;
      const siguiente = pestanas[(i + delta + pestanas.length) % pestanas.length];
      elegir(siguiente);
      $(`tab${siguiente}`).focus();
    });
  });
  elegir('Unidades');
}

let iniciada = false;
export function iniciarAdministracion() {
  if (iniciada) { refrescarTodo(); return; }
  iniciada = true;
  enlazarPestanas();
  $('filtroEstado').addEventListener('change', pintarUnidades);
  $('filtroBuscar').addEventListener('input', pintarUnidades);
  $('unidadNueva').addEventListener('click', () => (modelos.some((m) => m.activo) ? formularioUnidad(null) : avisar('info', 'Primero registra un modelo activo.')));
  $('modeloNuevo').addEventListener('click', () => formularioModelo(null));
  $('usuarioNuevo').addEventListener('click', () => formularioUsuario(null));
  $('bitacoraAntiguos').addEventListener('click', () => { desdeBitacora += PAGINA_BITACORA; pintarBitacora(); });
  $('bitacoraRecientes').addEventListener('click', () => { desdeBitacora = Math.max(0, desdeBitacora - PAGINA_BITACORA); pintarBitacora(); });
  refrescarTodo();
}
