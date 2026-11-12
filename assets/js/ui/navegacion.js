/* Navegación entre CONTROL y MONITOREO dentro de la misma página (hash #control / #monitoreo).
   Las dos vistas comparten la misma conexión WSS: cambiar de vista no abre ni cierra conexiones. */
const VISTAS = ['control', 'monitoreo'];
const PREDETERMINADA = 'control';

const vistaDelHash = () => {
  const nombre = location.hash.replace('#', '');
  return VISTAS.includes(nombre) ? nombre : PREDETERMINADA;
};

export function crearNavegacion({ alCambiar }) {
  let actual = null;

  function mostrar(vista, { enfocar = false } = {}) {
    if (vista === actual) return;
    actual = vista;
    document.documentElement.dataset.vista = vista;
    for (const seccion of document.querySelectorAll('.vista[data-vista]')) {
      seccion.hidden = seccion.dataset.vista !== vista;
    }
    for (const enlace of document.querySelectorAll('.nav-enlace[data-vista]')) {
      if (enlace.dataset.vista === vista) enlace.setAttribute('aria-current', 'page');
      else enlace.removeAttribute('aria-current');
    }
    document.title = vista === 'monitoreo' ? 'Monitoreo · vehículo IoT' : 'Control · vehículo IoT';
    if (enfocar) document.querySelector(`.vista[data-vista="${vista}"]`)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    alCambiar?.(vista);
  }

  window.addEventListener('hashchange', () => mostrar(vistaDelHash(), { enfocar: true }));
  return {
    iniciar: () => mostrar(vistaDelHash()),
    actual: () => actual,
  };
}
