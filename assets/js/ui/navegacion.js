/* Navegación entre vistas dentro de la misma página (hash #control, #monitoreo, #unidades,
   #administracion, #acceso). Las vistas comparten una sola conexión WSS: cambiar de vista no abre ni
   cierra conexiones.
   4.3: el menú se arma según el rol. OJO: esto solo ordena la interfaz; la seguridad real la aplica la
   API en cada petición y en el WebSocket. */
const VISTAS_POR_ROL = {
  ANONIMO: ['acceso'],
  INVITADO: ['control', 'monitoreo'],
  USUARIO: ['control', 'monitoreo', 'unidades'],
  ADMIN: ['control', 'monitoreo', 'unidades', 'administracion'],
};
const TITULOS = {
  acceso: 'Acceso', control: 'Control', monitoreo: 'Monitoreo', unidades: 'Mis vehículos', administracion: 'Administración',
};

export function crearNavegacion({ rol = 'ANONIMO', predeterminada, alCambiar }) {
  const permitidas = VISTAS_POR_ROL[rol] ?? VISTAS_POR_ROL.ANONIMO;
  const inicial = permitidas.includes(predeterminada) ? predeterminada : permitidas[0];
  let actual = null;

  const vistaDelHash = () => {
    const nombre = location.hash.replace('#', '');
    return permitidas.includes(nombre) ? nombre : inicial;
  };

  // Solo se muestran los enlaces del rol; el menú se oculta si hay una sola vista.
  for (const enlace of document.querySelectorAll('.nav-enlace[data-vista]')) {
    enlace.hidden = !permitidas.includes(enlace.dataset.vista);
  }
  const menu = document.querySelector('.navegacion');
  if (menu) menu.hidden = permitidas.length < 2;

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
    document.title = `${TITULOS[vista] ?? 'Inicio'} · RIG·OS`;
    if (enfocar) document.querySelector(`.vista[data-vista="${vista}"]`)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    alCambiar?.(vista);
  }

  window.addEventListener('hashchange', () => mostrar(vistaDelHash(), { enfocar: true }));
  return {
    iniciar: () => mostrar(vistaDelHash()),
    actual: () => actual,
    ir: (vista) => { if (permitidas.includes(vista)) location.hash = `#${vista}`; },
  };
}
