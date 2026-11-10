/* Punto de entrada: conecta interfaz, dominio y conexiones. Aquí no hay reglas de negocio. */
import { CONFIG, problemaDeConfiguracion, urlWebSocket } from './config.js';
import { guardarClave, obtenerClave } from './api/sesion.js';
import * as api from './api/vehiculo.js';
import { crearConexionWs } from './conexion/websocket.js';
import { crearMonitorSalud } from './conexion/salud.js';
import { clasificarCatalogo, etiquetaCorta } from './dominio/catalogo.js';
import { crearControl } from './dominio/control.js';
import { crearDemos } from './dominio/demos.js';
import { avisar } from './ui/avisos.js';
import { $ } from './ui/componentes.js';
import { pintarDemos, pintarEstadoDemo, pintarEstadoMando, pintarMando } from './ui/controles.js';
import { pintarSalud, pintarWebSocket } from './ui/indicadores.js';
import { crearJoystick } from './ui/joystick.js';
import { mensajeDeError } from './utilidades/errores.js';

const NOMBRES_DIRECCION = { adelante: 'avanzar', atras: 'retroceder', izquierda: 'izquierda', derecha: 'derecha' };

let vehiculo = null;
let catalogo = null;
let cargando = false;

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
}

function enlazarEventos() {
  $('detener').addEventListener('click', oprimirDetener);
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !$('detener').disabled) $('detener').click();
  });
  $('demoIniciar').addEventListener('click', async () => {
    const demo = vehiculo?.demos.find((d) => String(d.id) === $('demoSelector').value);
    if (!demo) return;
    const resultado = await demos.iniciar(demo);
    if (resultado.error) avisar('error', mensajeDeError(resultado.error));
    else if (resultado.ok) avisar('info', 'La API aceptó iniciar la DEMO.');
  });
  $('demoCancelar').addEventListener('click', async () => {
    const resultado = await demos.cancelar();
    if (resultado.error) avisar(resultado.error.status === 404 ? 'info' : 'error', mensajeDeError(resultado.error));
  });
  $('reintentarCarga').addEventListener('click', cargarVehiculo);

  const campoClave = $('clave');
  campoClave.value = obtenerClave();
  campoClave.addEventListener('input', () => guardarClave(campoClave.value));
  $('ajustes').open = !obtenerClave();
}

function iniciar() {
  $('creditos').textContent = `Desarrollado por ${CONFIG.ALUMNO} · ${CONFIG.ANIO}`;
  pintarWebSocket('desconectado', {});
  pintarSalud({ api: 'comprobando', rds: 'sin_verificar', verificado: null });
  enlazarEventos();
  refrescar();

  const problema = problemaDeConfiguracion();
  if (problema) {
    $('vehNombre').textContent = 'Aplicación sin configurar';
    $('alertaCargaTexto').textContent = problema;
    $('alertaCarga').hidden = false;
    $('reintentarCarga').hidden = true;
    pintarSalud({ api: 'no_disponible', rds: 'sin_verificar', verificado: null });
    return;
  }

  const ws = crearConexionWs({
    url: urlWebSocket(),
    tiempos: CONFIG.TIEMPOS,
    alEstado: pintarWebSocket,
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
      }
    },
  });

  cargarVehiculo();
  ws.abrir();
  salud.iniciar();
}

iniciar();
