/* Punto de entrada: conecta interfaz, dominio y conexiones de CONTROL, MONITOREO y (4.3) ADMINISTRACIÓN.
   Aquí no hay reglas de negocio. Una sola sesión WSS alimenta a CONTROL y MONITOREO.
   4.3: primero se valida la sesión con la API y se arma el menú según el rol; la seguridad real la aplica
   la API en cada petición y en el WebSocket. */
import { CONFIG, problemaDeConfiguracion, urlWebSocket } from './config.js';
import * as api from './api/vehiculo.js';
import * as plataforma from './api/plataforma.js';
import { borrarSesion, guardarSesion, guardarUnidad, obtenerSesion, obtenerToken, obtenerUnidad } from './api/sesion.js';
import { enlazarFormulario } from './ui/formulario.js';
import { iniciarAcceso } from './vistas/acceso.js';
import { iniciarAdministracion } from './vistas/administracion.js';
import { iniciarAvisoInvitado } from './vistas/invitado.js';
import { iniciarUnidades, listarOperables } from './vistas/unidades.js';
import { crearConexionWs } from './conexion/websocket.js';
import { crearMonitorSalud } from './conexion/salud.js';
import { clasificarCatalogo, etiquetaCorta } from './dominio/catalogo.js';
import { crearControl } from './dominio/control.js';
import { crearDemos } from './dominio/demos.js';
import { crearMonitoreo } from './dominio/monitoreo.js';
import { avisar } from './ui/avisos.js';
import { $ } from './ui/componentes.js';
import { pintarDemos, pintarEstadoDemo, pintarEstadoMando, pintarMando } from './ui/controles.js';
import { pintarSalud, pintarWebSocket } from './ui/indicadores.js';
import { crearJoystick } from './ui/joystick.js';
import { pintarHistorial, pintarUltimo } from './ui/monitoreo.js';
import { crearNavegacion } from './ui/navegacion.js';
import { mensajeDeError } from './utilidades/errores.js';

const UNIDAD = obtenerUnidad();          // unidad elegida (al cambiarla, la app se recarga)
const ID_UNIDAD = UNIDAD?.id ?? null;
const LLAVE_MOTIVO = 'iot_motivo';
const ROLES = { ADMIN: 'Administrador', USUARIO: 'Usuario', INVITADO: 'Prueba temporal' };
let navegacion = null;

const NOMBRES_DIRECCION = { adelante: 'avanzar', atras: 'retroceder', izquierda: 'izquierda', derecha: 'derecha' };

let vehiculo = null;
let catalogo = null;
let cargando = false;
let estadoWs = 'desconectado';
let wsYaConectada = false;
let primeraCargaHecha = false;

const monitoreo = crearMonitoreo({
  obtenerEstado: api.obtenerEstado,
  obtenerHistorial: api.obtenerHistorial,
  idVehiculo: ID_UNIDAD,
  zonaBd: CONFIG.ZONA_HORARIA_BD,
  limite: CONFIG.LIMITE_HISTORIAL,
  retrasoHistorialMs: CONFIG.TIEMPOS.SINCRONIZAR_HISTORIAL_MS,
  alCambiar: pintarVistaMonitoreo,
});

function pintarVistaMonitoreo(estado = monitoreo.instantanea()) {
  const opciones = { wsEnLinea: estadoWs === 'en_linea', zona: CONFIG.ZONA_HORARIA_VISTA, nombreVehiculo: vehiculo?.nombre ?? '' };
  pintarUltimo(estado, opciones);
  pintarHistorial(estado, { zona: CONFIG.ZONA_HORARIA_VISTA, limite: CONFIG.LIMITE_HISTORIAL });
}

/** Al cambiar de vista: MONITOREO se resincroniza por REST; Administración y Mis vehículos se cargan al abrirse. */
function alCambiarVista(vista) {
  const operacion = vista === 'control' || vista === 'monitoreo';
  $('sinUnidad').hidden = !(operacion && ID_UNIDAD == null);
  if (operacion && ID_UNIDAD == null) {
    $('zonaControl').hidden = true;
    $('vistaMonitoreo').hidden = true;
  }
  if (vista === 'monitoreo' && primeraCargaHecha) monitoreo.resincronizar();
  if (vista === 'administracion') iniciarAdministracion();
  if (vista === 'unidades') iniciarUnidades();
}

/** Cierra la sesión local y vuelve a ACCESO mostrando el motivo. */
async function salir(motivo, { avisarApi = false } = {}) {
  const sesion = obtenerSesion();
  if (avisarApi && sesion?.token) {
    try {
      if (sesion.tipo === 'INVITADO') await plataforma.terminarInvitado();
      else await plataforma.logout();
    } catch { /* la sesión ya no era válida */ }
  }
  borrarSesion();
  try { sessionStorage.setItem(LLAVE_MOTIVO, motivo ?? ''); } catch { /* sin almacenamiento */ }
  location.hash = '#acceso';
  location.reload();
}

function pintarCuenta(sesion) {
  if (!sesion) return;
  const nombre = sesion.tipo === 'INVITADO' ? 'Invitado' : (sesion.usuario?.nombre || sesion.usuario?.email || '');
  $('cuenta').hidden = false;
  $('cuentaAvatar').textContent = nombre.charAt(0).toUpperCase() || '?';
  $('cuentaNombre').textContent = nombre;
  $('cuentaNombre').title = sesion.usuario?.email ?? '';
  $('cuentaRol').textContent = ROLES[sesion.tipo] ?? sesion.tipo;
  $('cuentaSalir').title = sesion.tipo === 'INVITADO' ? 'Terminar prueba' : 'Cerrar sesión';
  $('cuentaSalir').addEventListener('click', () => salir(
    sesion.tipo === 'INVITADO' ? 'Terminaste la prueba. La unidad se detuvo.' : 'Cerraste sesión.', { avisarApi: true }));
}

/** Pide a la API la cuenta de la sesión guardada. Devuelve la sesión válida o null. */
async function validarSesion() {
  const sesion = obtenerSesion();
  if (!sesion?.token) return null;
  if (sesion.tipo === 'INVITADO') {
    try {
      await plataforma.estadoInvitado();
      return sesion;
    } catch { return null; }
  }
  try {
    const usuario = await plataforma.yo();
    const actualizada = { ...sesion, tipo: usuario.rol, usuario };
    guardarSesion(actualizada);
    return actualizada;
  } catch { return null; }
}

/** El indicador WSS se pinta en ambas vistas; tras una reconexión se recupera lo perdido por REST. */
function alEstadoWs(estado, datos) {
  estadoWs = estado;
  pintarWebSocket(estado, datos);
  if (estado === 'en_linea') {
    if (wsYaConectada) monitoreo.resincronizar();
    wsYaConectada = true;
  }
  pintarVistaMonitoreo();
}

const control = crearControl({
  origen: CONFIG.ORIGEN,
  enviar: (comando, { esDetener }) => api.registrarMovimiento(comando, esDetener ? { timeoutMs: CONFIG.TIEMPOS.DETENER_MS } : {}),
  alCambiar: refrescar,
});

const demos = crearDemos({
  iniciarApi: api.iniciarDemo,
  cancelarApi: api.cancelarDemo,
  movimientosApi: api.obtenerMovimientosDemo,
  alCambiar: (estado) => {
    control.bloquear(estado.fase !== 'libre');
    refrescar();
  },
  alAvisar: avisar,
});

const joystick = crearJoystick({
  base: $('joystick'),
  perilla: $('perilla'),
  alCambiar: alCambiarDireccion,
  alSinComando: (direccion) => avisar('info', `El catálogo no tiene un comando para ${NOMBRES_DIRECCION[direccion]}.`),
});

function alCambiarDireccion(direccion) {
  refrescar();
  if (direccion) control.solicitar(catalogo.direcciones[direccion], 'joystick');
  else detener('joystick');
}

async function detener(fuente) {
  const hayDemo = demos.obtener().fase !== 'libre';
  const pendientes = [control.detener(fuente)];
  if (hayDemo) pendientes.push(demos.cancelar());
  const [resultado] = await Promise.all(pendientes);
  if (resultado.motivo === 'sin_detener') avisar('error', 'El catálogo de este vehículo no tiene un comando para detener.');
  else if (!resultado.ok) avisar('error', `DETENER no fue aceptado. ${mensajeDeError(resultado.error)}`);
}

function oprimirDetener() {
  joystick.anularGesto();
  detener('boton');
}

function refrescar() {
  const { actual } = control.instantanea();
  const faseDemo = demos.obtener();
  const hayDemo = faseDemo.fase !== 'libre';
  const listo = Boolean(catalogo) && vehiculo?.activo === true;

  joystick.habilitar(listo && !hayDemo);
  pintarEstadoMando(actual, !listo || hayDemo || joystick.activo());
  pintarEstadoDemo(faseDemo, { puedeIniciar: listo && !joystick.activo() });
  $('detener').disabled = !catalogo?.detener;
  $('zonaControl').dataset.demo = String(hayDemo);
  // El botón Demo muestra en vivo el comando que la DEMO está ejecutando y su avance.
  const paso = faseDemo.indice && faseDemo.total ? ` · ${faseDemo.indice}/${faseDemo.total}` : '';
  $('demoAbrirTexto').textContent = !hayDemo ? 'Demo'
    : faseDemo.comando ? `${faseDemo.comando}${paso}`
    : faseDemo.fase === 'cancelando' ? 'Cancelando…' : 'Iniciando…';
  $('demoAbrirAvance').style.width = hayDemo && faseDemo.total ? `${Math.round((faseDemo.indice / faseDemo.total) * 100)}%` : '0%';
  $('demoAbrir').setAttribute('aria-label', hayDemo ? 'DEMO en curso: ver avance o cancelar' : 'Elegir e iniciar una DEMO');
  $('joystickNota').textContent = hayDemo
    ? 'Joystick bloqueado durante la DEMO. DETENER sigue disponible.'
    : 'Arrastra para mover; al soltar se solicita DETENER.';
}

function pintarVehiculo() {
  $('vehNombre').textContent = vehiculo.nombre;
  $('vehDetalle').textContent = [
    `ID ${vehiculo.id}`,
    vehiculo.modelo,
    vehiculo.activo ? null : 'Vehículo inactivo en el catálogo',
  ].filter(Boolean).join(' · ');
  for (const [direccion, comando] of Object.entries(catalogo.direcciones)) {
    const etiqueta = $(`dir-${direccion}`);
    etiqueta.textContent = comando ? etiquetaCorta(comando.nombre, 'direccion') : 'Sin comando';
    etiqueta.title = comando?.nombre ?? '';
    etiqueta.dataset.vacio = String(!comando);
  }
  joystick.fijarDisponibles(Object.keys(catalogo.direcciones).filter((d) => catalogo.direcciones[d]));
  control.fijarDetener(catalogo.detener);
  pintarMando(catalogo, {
    alComando: (comando) => {
      const resultado = control.solicitar(comando, 'boton');
      if (!resultado.ok && resultado.motivo === 'bloqueado') avisar('info', 'Comando bloqueado durante la DEMO.');
    },
  });
  pintarDemos(vehiculo.demos);
}

async function cargarVehiculo() {
  if (cargando || vehiculo) return;
  cargando = true;
  $('alertaCarga').hidden = true;
  try {
    vehiculo = await api.obtenerVehiculo();
    catalogo = clasificarCatalogo(vehiculo.comandos);
    pintarVehiculo();
    refrescar();
    pintarVistaMonitoreo();
  } catch (error) {
    $('vehNombre').textContent = 'Vehículo sin cargar';
    $('alertaCargaTexto').textContent = mensajeDeError(error);
    $('alertaCarga').hidden = false;
  } finally {
    cargando = false;
  }
}

function alRecibirEvento(evento) {
  if (evento.id_vehiculo !== ID_UNIDAD || typeof evento.tipo !== 'string') return;
  control.registrarEvento(evento);
  demos.procesarEvento(evento);
  monitoreo.procesarEvento(evento);
}

function enlazarEventos() {
  $('detener').addEventListener('click', oprimirDetener);
  document.addEventListener('keydown', (evento) => {
    // Con el modal de DEMO abierto, Esc solo lo cierra (no dispara DETENER).
    if (evento.key === 'Escape' && !$('demoDialogo').open && !$('dlgForm').open && navegacion?.actual() === 'control' && !$('detener').disabled) $('detener').click();
  });
  $('demoIniciar').addEventListener('click', async () => {
    const demo = vehiculo?.demos.find((d) => String(d.id) === $('demoSelector').value);
    if (!demo) return;
    const resultado = await demos.iniciar(demo);
    if (resultado.error) avisar('error', mensajeDeError(resultado.error));
    else if (resultado.ok) {
      avisar('info', 'La API aceptó iniciar la DEMO.');
      $('demoDialogo').close();
    }
  });
  $('demoCancelar').addEventListener('click', async () => {
    const resultado = await demos.cancelar();
    if (resultado.error) avisar(resultado.error.status === 404 ? 'info' : 'error', mensajeDeError(resultado.error));
  });
  $('reintentarCarga').addEventListener('click', cargarVehiculo);

  // Modal de DEMO: el botón compacto del mando lo abre; se cierra con ×, Esc o tocando fuera.
  const dialogo = $('demoDialogo');
  $('demoAbrir').addEventListener('click', () => {
    dialogo.showModal();
    (demos.obtener().fase !== 'libre' ? $('demoCancelar') : $('demoSelector')).focus();
  });
  $('demoCerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (evento) => { if (evento.target === dialogo) dialogo.close(); });
  dialogo.addEventListener('close', () => $('demoAbrir').focus());
  $('historialRecargar').addEventListener('click', () => monitoreo.resincronizar());
}

function iniciarOperacion(sesion) {
  pintarWebSocket('desconectado', {});
  pintarSalud({ api: 'comprobando', rds: 'sin_verificar', verificado: null });
  enlazarEventos();
  refrescar();
  pintarVistaMonitoreo();
  if (sesion.tipo === 'INVITADO') $('demoAbrir').hidden = true; // la prueba de Invitado no incluye DEMO

  const problema = problemaDeConfiguracion();
  if (problema) {
    $('vehNombre').textContent = 'Aplicación sin configurar';
    pintarVistaMonitoreo();
    $('alertaCargaTexto').textContent = problema;
    $('alertaCarga').hidden = false;
    $('reintentarCarga').hidden = true;
    pintarSalud({ api: 'no_disponible', rds: 'sin_verificar', verificado: null });
    return;
  }

  const ws = crearConexionWs({
    url: urlWebSocket(ID_UNIDAD),
    tiempos: CONFIG.TIEMPOS,
    alEstado: alEstadoWs,
    alMensaje: alRecibirEvento,
    obtenerToken,
    alSinPermiso: (codigo) => {
      if (codigo === 4401 || sesion.tipo === 'INVITADO') {
        salir(sesion.tipo === 'INVITADO' ? 'Tu prueba terminó y la unidad se detuvo.' : 'Tu sesión venció. Vuelve a iniciar sesión.');
      } else if (codigo === 4403) {
        avisar('error', 'Ya no tienes permiso sobre esta unidad.');
        guardarUnidad(null);
        location.hash = '#unidades';
        setTimeout(() => location.reload(), 1500);
      }
    },
  });
  const salud = crearMonitorSalud({
    comprobarApi: api.comprobarApi,
    comprobarRds: api.comprobarRds,
    hayDiagnosticoRds: api.hayDiagnosticoRds,
    tiempos: CONFIG.TIEMPOS,
    alCambiar: (estado) => {
      pintarSalud(estado);
      if (estado.recuperada) {
        cargarVehiculo();
        ws.reanudar();
        if (primeraCargaHecha) monitoreo.resincronizar();
      }
    },
  });

  cargarVehiculo();
  monitoreo.resincronizar(); // carga inicial por REST: último estado + diez movimientos
  primeraCargaHecha = true;
  ws.abrir();
  salud.iniciar();
}

async function arrancar() {
  $('creditos').textContent = `Desarrollado por ${CONFIG.ALUMNO} · ${CONFIG.ANIO}`;
  enlazarFormulario();
  let motivo = '';
  try { motivo = sessionStorage.getItem(LLAVE_MOTIVO) ?? ''; sessionStorage.removeItem(LLAVE_MOTIVO); } catch { /* sin almacenamiento */ }

  const sesion = await validarSesion();
  if (!sesion) {
    if (obtenerSesion()) borrarSesion();
    $('vehNombre').textContent = 'Plataforma de vehículos IoT';
    $('vehDetalle').textContent = 'Control · Monitoreo · Administración';
    navegacion = crearNavegacion({ rol: 'ANONIMO', alCambiar: alCambiarVista });
    navegacion.iniciar();
    iniciarAcceso({ motivo });
    return;
  }
  // A partir de aquí, cualquier 401 de la API significa que la sesión ya no sirve.
  globalThis.addEventListener('sesion-vencida', () => salir(sesion.tipo === 'INVITADO'
    ? 'Tu prueba terminó y la unidad se detuvo.' : 'Tu sesión venció. Vuelve a iniciar sesión.'));
  pintarCuenta(sesion);
  if (motivo) avisar('info', motivo);

  // Unidad: el Invitado usa la reservada; si la cuenta opera una sola unidad, se elige sola.
  if (sesion.tipo === 'INVITADO' && ID_UNIDAD !== sesion.id_vehiculo) {
    guardarUnidad({ id: sesion.id_vehiculo, nombre: '', serie: '' });
    location.reload();
    return;
  }
  if (ID_UNIDAD == null && sesion.tipo === 'USUARIO') {
    try {
      const operables = await listarOperables();
      if (operables.length === 1) {
        guardarUnidad({ id: operables[0].id_vehiculo, nombre: operables[0].nombre, serie: operables[0].numero_serie });
        location.reload();
        return;
      }
    } catch { /* se queda sin unidad; «Mis vehículos» muestra el motivo */ }
  }

  navegacion = crearNavegacion({
    rol: sesion.tipo,
    predeterminada: ID_UNIDAD != null ? 'control' : (sesion.tipo === 'ADMIN' ? 'administracion' : 'unidades'),
    alCambiar: alCambiarVista,
  });
  if (sesion.tipo === 'INVITADO') iniciarAvisoInvitado({ alTerminar: (m) => salir(m) });
  if (ID_UNIDAD == null) {
    $('vehNombre').textContent = sesion.tipo === 'ADMIN' ? 'Panel de administración' : 'Mis vehículos';
    $('sinUnidadTexto').textContent = sesion.tipo === 'ADMIN'
      ? 'Para operar una unidad de la empresa, elígela en «Mis vehículos».'
      : 'Elige una de tus unidades en «Mis vehículos».';
    navegacion.iniciar();
    return;
  }
  navegacion.iniciar();
  iniciarOperacion(sesion);
}

arrancar();
