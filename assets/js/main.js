/* Punto de entrada: conecta interfaz, dominio y conexiones de CONTROL y MONITOREO.
   Aquí no hay reglas de negocio. Una sola sesión WSS alimenta a las dos vistas. */
import { CONFIG, problemaDeConfiguracion, urlWebSocket } from './config.js';
import * as api from './api/vehiculo.js';
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
  idVehiculo: CONFIG.VEHICLE_ID,
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

const navegacion = crearNavegacion({
  // Al volver a MONITOREO se resincroniza por REST (no hay polling mientras está abierta).
  alCambiar: (vista) => { if (vista === 'monitoreo' && primeraCargaHecha) monitoreo.resincronizar(); },
});

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
  if (evento.id_vehiculo !== CONFIG.VEHICLE_ID || typeof evento.tipo !== 'string') return;
  control.registrarEvento(evento);
  demos.procesarEvento(evento);
  monitoreo.procesarEvento(evento);
}

function enlazarEventos() {
  $('detener').addEventListener('click', oprimirDetener);
  document.addEventListener('keydown', (evento) => {
    // Con el modal de DEMO abierto, Esc solo lo cierra (no dispara DETENER).
    if (evento.key === 'Escape' && !$('demoDialogo').open && navegacion.actual() === 'control' && !$('detener').disabled) $('detener').click();
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

function iniciar() {
  $('creditos').textContent = `Desarrollado por ${CONFIG.ALUMNO} · ${CONFIG.ANIO}`;
  pintarWebSocket('desconectado', {});
  pintarSalud({ api: 'comprobando', rds: 'sin_verificar', verificado: null });
  enlazarEventos();
  navegacion.iniciar();
  refrescar();
  pintarVistaMonitoreo();

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
    url: urlWebSocket(),
    tiempos: CONFIG.TIEMPOS,
    alEstado: alEstadoWs,
    alMensaje: alRecibirEvento,
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

iniciar();
