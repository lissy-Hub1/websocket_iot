/* Joystick circular con Pointer Events (mouse y táctil) y teclado. Solo traduce gestos a una
   dirección y avisa cuando cambia: no sabe nada de comandos ni de la API. */
const ZONA_NEUTRAL = 0.3;
const HISTERESIS_GRADOS = 12;
const EJES = { derecha: 0, atras: 90, izquierda: 180, adelante: -90 };
const TECLAS = { ArrowUp: 'adelante', ArrowDown: 'atras', ArrowLeft: 'izquierda', ArrowRight: 'derecha' };

const distanciaAngular = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export function crearJoystick({ base, perilla, alCambiar, alSinComando }) {
  let disponibles = new Set();
  let habilitado = false;
  let puntero = null;
  let gestoAnulado = false;
  let direccion = null;
  let tecla = null;

  function fijarDireccion(nueva) {
    if (nueva === direccion) return;
    direccion = nueva;
    base.dataset.direccion = nueva ?? 'neutral';
    alCambiar(nueva);
  }

  function colocarPerilla(x = 0, y = 0) {
    perilla.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  function direccionDesde(angulo, distancia) {
    if (distancia < ZONA_NEUTRAL) return null;
    if (direccion && distanciaAngular(angulo, EJES[direccion]) <= 45 + HISTERESIS_GRADOS) return direccion;
    return Object.keys(EJES).reduce((mejor, d) => (
      distanciaAngular(angulo, EJES[d]) < distanciaAngular(angulo, EJES[mejor]) ? d : mejor
    ));
  }

  function aplicarPunto(evento) {
    const caja = base.getBoundingClientRect();
    const radio = (caja.width - perilla.offsetWidth) / 2;
    let dx = evento.clientX - (caja.left + caja.width / 2);
    let dy = evento.clientY - (caja.top + caja.height / 2);
    const largo = Math.hypot(dx, dy);
    if (largo > radio) { dx = dx * radio / largo; dy = dy * radio / largo; }
    colocarPerilla(dx, dy);

    const elegida = direccionDesde(Math.atan2(dy, dx) * 180 / Math.PI, Math.min(largo / radio, 1));
    if (elegida && !disponibles.has(elegida)) {
      if (elegida !== base.dataset.sinComando) alSinComando?.(elegida);
      base.dataset.sinComando = elegida;
      fijarDireccion(null);
      return;
    }
    delete base.dataset.sinComando;
    fijarDireccion(elegida);
  }

  function soltar() {
    if (puntero !== null && base.hasPointerCapture?.(puntero)) base.releasePointerCapture(puntero);
    puntero = null;
    tecla = null;
    delete base.dataset.sinComando;
    base.classList.remove('activo');
    colocarPerilla();
    fijarDireccion(null);
  }

  base.addEventListener('pointerdown', (evento) => {
    if (!habilitado || puntero !== null) return;
    puntero = evento.pointerId;
    gestoAnulado = false;
    base.setPointerCapture(puntero);
    base.classList.add('activo');
    aplicarPunto(evento);
    evento.preventDefault();
  });
  base.addEventListener('pointermove', (evento) => {
    if (evento.pointerId !== puntero || gestoAnulado) return;
    aplicarPunto(evento);
  });
  for (const nombre of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    base.addEventListener(nombre, (evento) => {
      if (evento.pointerId !== puntero) return;
      gestoAnulado = false;
      soltar();
    });
  }

  base.addEventListener('keydown', (evento) => {
    const elegida = TECLAS[evento.key];
    if (!elegida) return;
    evento.preventDefault();
    if (!habilitado || evento.repeat || tecla === evento.key) return;
    if (!disponibles.has(elegida)) { alSinComando?.(elegida); return; }
    tecla = evento.key;
    base.classList.add('activo');
    const paso = (base.offsetWidth - perilla.offsetWidth) / 2;
    colocarPerilla(Math.round(Math.cos(EJES[elegida] * Math.PI / 180) * paso), Math.round(Math.sin(EJES[elegida] * Math.PI / 180) * paso));
    fijarDireccion(elegida);
  });
  base.addEventListener('keyup', (evento) => { if (evento.key === tecla) soltar(); });
  base.addEventListener('blur', () => { if (tecla) soltar(); });

  // Perder la ventana equivale a soltar: el vehículo no debe quedarse con la última orden.
  const alPerderFoco = () => { if (puntero !== null || tecla) soltar(); };
  window.addEventListener('blur', alPerderFoco);
  document.addEventListener('visibilitychange', () => { if (document.hidden) alPerderFoco(); });

  colocarPerilla();
  return {
    fijarDisponibles(lista) { disponibles = new Set(lista); },
    habilitar(valor) {
      habilitado = valor;
      base.setAttribute('aria-disabled', String(!valor));
      base.tabIndex = valor ? 0 : -1;
      if (!valor) alPerderFoco();
    },
    /** DETENER oprimido durante el gesto: vuelve al centro y no avisa de nuevo hasta otro gesto. */
    anularGesto() {
      gestoAnulado = puntero !== null;
      direccion = null;
      base.dataset.direccion = 'neutral';
      tecla = null;
      base.classList.remove('activo');
      colocarPerilla();
    },
    activo: () => puntero !== null || tecla !== null,
  };
}
