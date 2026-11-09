// Pruebas de las reglas de comandos, sin navegador ni red: node --test pruebas_frontend/control.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clasificarCatalogo, etiquetaCorta } from '../docs/js/dominio/catalogo.js';
import { crearControl } from '../docs/js/dominio/control.js';
import { crearDemos } from '../docs/js/dominio/demos.js';
import { crearConexionWs } from '../docs/js/conexion/websocket.js';

const cmd = (id, nombre, activo = true) => ({ id, nombre, codigo: id, activo });
const ADELANTE = cmd(1, 'ADELANTE');
const IZQ = cmd(3, 'IZQUIERDA');
const DERECHA = cmd(4, 'DERECHA');
const DETENER = cmd(5, 'DETENER');

function promesaManual() {
  let resolver; let rechazar;
  const promesa = new Promise((a, b) => { resolver = a; rechazar = b; });
  return { promesa, resolver, rechazar };
}

function arnes() {
  const envios = [];
  const control = crearControl({
    origen: 'WEB',
    enviar: (comando) => {
      const p = promesaManual();
      envios.push({ comando, ...p });
      return p.promesa;
    },
  });
  control.fijarDetener(DETENER);
  return { control, envios };
}
const vaciar = () => new Promise((r) => setTimeout(r, 0));

test('el catálogo separa joystick, DETENER y botones sin confundir giros', () => {
  const r = clasificarCatalogo([cmd(1, 'Avanzar'), cmd(2, 'ATRÁS'), IZQ, DERECHA, DETENER, cmd(6, 'GIRO_DERECHA_90'), cmd(7, 'GIRO 360'), cmd(8, 'ADELANTE_OFF', false)]);
  assert.equal(r.direcciones.adelante.id, 1);
  assert.equal(r.direcciones.atras.id, 2);
  assert.equal(r.direcciones.derecha.id, 4);
  assert.equal(r.detener.id, 5);
  assert.deepEqual(r.extras.map((c) => c.id), [6, 7]);
});

test('el catálogo de la excavadora se agrupa como el control físico', () => {
  const nombres = ['DETENER', 'AVANZAR', 'RETROCEDER', 'GIRAR_IZQUIERDA', 'GIRAR_DERECHA', 'TORRETA_DERECHA', 'TORRETA_IZQUIERDA',
    'EXCAVAR', 'LUCES', 'MUSICA', 'DEMO_AUTO', 'DESCARGAR', 'SALTAR'];
  const r = clasificarCatalogo(nombres.map((n, i) => cmd(i + 1, n)));
  assert.deepEqual(Object.values(r.direcciones).map((c) => c.nombre), ['AVANZAR', 'RETROCEDER', 'GIRAR_IZQUIERDA', 'GIRAR_DERECHA']);
  assert.deepEqual(r.grupos.map((g) => [g.id, g.comandos.map((c) => c.nombre)]), [
    ['torreta', ['TORRETA_IZQUIERDA', 'TORRETA_DERECHA']],
    ['brazo', ['EXCAVAR', 'DESCARGAR']],
    ['funciones', ['LUCES', 'MUSICA', 'DEMO_AUTO']],
    ['otros', ['SALTAR']],
  ]);
  assert.equal(etiquetaCorta('TORRETA_IZQUIERDA', 'torreta'), 'Izquierda');
  assert.equal(etiquetaCorta('DEMO_AUTO', 'funciones'), 'Demo auto');
  assert.equal(etiquetaCorta('GIRAR_IZQUIERDA', 'direccion'), 'Izquierda');
});

test('una dirección ausente del catálogo no se inventa', () => {
  assert.equal(clasificarCatalogo([ADELANTE]).direcciones.atras, null);
  assert.equal(clasificarCatalogo([ADELANTE]).detener, null);
});

test('solo hay un movimiento en vuelo y gana el más reciente de la cola', async () => {
  const { control, envios } = arnes();
  control.solicitar(ADELANTE, 'j');
  control.solicitar(IZQ, 'j');
  control.solicitar(DERECHA, 'j');
  assert.equal(envios.length, 1);
  envios[0].resolver({});
  await vaciar();
  assert.deepEqual(envios.map((e) => e.comando.id), [1, 4]);
});

test('no duplica el comando que ya está en vuelo', () => {
  const { control, envios } = arnes();
  control.solicitar(ADELANTE, 'j');
  assert.equal(control.solicitar(ADELANTE, 'j').motivo, 'duplicado');
  assert.equal(envios.length, 1);
});

test('DETENER sale de inmediato, vacía la cola y la respuesta tardía no reactiva la interfaz', async () => {
  const { control, envios } = arnes();
  control.solicitar(ADELANTE, 'j');
  control.solicitar(IZQ, 'j');
  control.detener('b');
  assert.deepEqual(envios.map((e) => e.comando.id), [1, 5]);
  envios[1].resolver({ fecha_hora: '2026-01-01T00:00:02Z' });
  await vaciar();
  envios[0].resolver({ fecha_hora: '2026-01-01T00:00:01Z' });
  await vaciar();
  assert.equal(control.instantanea().actual.comando.id, 5);
  assert.equal(envios.length, 2, 'el anterior quedó antes de DETENER: no se repite');
});

test('si el backend registró el comando viejo después de DETENER, repite DETENER', async () => {
  const { control, envios } = arnes();
  control.solicitar(ADELANTE, 'j');
  control.detener('b');
  envios[1].resolver({ fecha_hora: '2026-01-01T00:00:01Z' });
  await vaciar();
  envios[0].resolver({ fecha_hora: '2026-01-01T00:00:02Z' });
  await vaciar();
  assert.deepEqual(envios.map((e) => e.comando.id), [1, 5, 5]);
});

test('DETENER reintenta una vez ante una falla de red, pero no ante un rechazo', async () => {
  const red = arnes();
  red.control.detener('b');
  red.envios[0].rechazar({ reintentable: true });
  await vaciar();
  assert.equal(red.envios.length, 2);

  const rechazo = arnes();
  rechazo.control.detener('b');
  rechazo.envios[0].rechazar({ reintentable: false, status: 403 });
  await vaciar();
  assert.equal(rechazo.envios.length, 1);
});

test('durante la DEMO los movimientos se bloquean y DETENER no', () => {
  const { control, envios } = arnes();
  control.bloquear(true);
  assert.equal(control.solicitar(ADELANTE, 'j').motivo, 'bloqueado');
  control.detener('b');
  assert.deepEqual(envios.map((e) => e.comando.id), [5]);
});

test('un evento solo marca la solicitud de este cliente y del mismo comando', async () => {
  const { control, envios } = arnes();
  control.solicitar(ADELANTE, 'j');
  assert.equal(control.registrarEvento({ tipo: 'movimiento', id_comando: 1, origen: 'OTRO' }), null);
  assert.equal(control.registrarEvento({ tipo: 'movimiento', id_comando: 2, origen: 'WEB' }), null);
  assert.ok(control.registrarEvento({ tipo: 'movimiento', id_comando: 1, origen: 'WEB' }));
  assert.equal(control.instantanea().actual.evento, true);
  assert.equal(control.instantanea().actual.aceptado, false, 'el evento llega antes que la respuesta HTTP');
  envios[0].resolver({});
});

test('una DEMO no se inicia dos veces y se libera con su evento final', async () => {
  let iniciadas = 0;
  const demos = crearDemos({
    iniciarApi: async () => { iniciadas += 1; return { total_movimientos: 2 }; },
    cancelarApi: async () => ({}),
    movimientosApi: async () => [{ duracion_ms: 10, pausa_ms: 0 }],
  });
  const primera = demos.iniciar({ id: 1 });
  assert.equal((await demos.iniciar({ id: 1 })).motivo, 'ocupado');
  await primera;
  assert.equal(iniciadas, 1);
  assert.equal(demos.obtener().fase, 'ejecutando');
  assert.equal(demos.procesarEvento({ tipo: 'demo_fin' }), true);
  assert.equal(demos.obtener().fase, 'libre');
});

test('cancelar una DEMO que el backend ya no tiene libera la interfaz', async () => {
  const demos = crearDemos({
    iniciarApi: async () => ({ total_movimientos: 1 }),
    cancelarApi: async () => { throw Object.assign(new Error(), { status: 404 }); },
    movimientosApi: async () => [],
  });
  await demos.iniciar({ id: 1 });
  await demos.cancelar();
  assert.equal(demos.obtener().fase, 'libre');
});

function wsDePrueba() {
  const estados = [];
  const sockets = [];
  class SocketFalso {
    constructor() { this.readyState = 0; this.enviados = []; sockets.push(this); }
    send(texto) { this.enviados.push(texto); }
    close() { this.readyState = 3; }
    abrir() { this.readyState = 1; this.onopen(); }
  }
  const conexion = crearConexionWs({
    url: 'wss://prueba',
    tiempos: { WS_LATIDO_MS: 5, WS_RESPUESTA_MS: 5, WS_ESPERA_MAX_MS: 10 },
    alEstado: (e) => estados.push(e),
    alMensaje: () => {},
    CrearSocket: SocketFalso,
  });
  return { conexion, estados, sockets };
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test('una sesión WSS que deja de contestar abandona «En línea» y se reconecta', async () => {
  const { conexion, estados, sockets } = wsDePrueba();
  conexion.abrir();
  sockets[0].abrir();
  assert.deepEqual(estados, ['conectando', 'en_linea']);
  await esperar(40);
  assert.equal(sockets[0].enviados[0], 'ping');
  assert.ok(estados.includes('reconectando'));
  assert.ok(sockets.length >= 2, 'abrió una sesión nueva');
  sockets.at(-1).onclose?.({ code: 4404 });
});

test('si el servidor no reconoce el vehículo queda Desconectado y no reintenta', async () => {
  const { conexion, estados, sockets } = wsDePrueba();
  conexion.abrir();
  sockets[0].onclose({ code: 4404 });
  await esperar(30);
  assert.equal(estados.at(-1), 'desconectado');
  assert.equal(sockets.length, 1);
});
