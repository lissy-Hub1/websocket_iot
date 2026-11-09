/* Clave de operación (X-API-Key): la escribe la persona que opera y vive solo en esta pestaña.
   No se guarda en el repositorio ni en localStorage. */
const LLAVE = 'control_iot_clave';
let clave = '';

try { clave = sessionStorage.getItem(LLAVE) || ''; } catch { /* almacenamiento bloqueado: queda en memoria */ }

export function obtenerClave() {
  return clave;
}

export function guardarClave(valor) {
  clave = valor.trim();
  try {
    if (clave) sessionStorage.setItem(LLAVE, clave);
    else sessionStorage.removeItem(LLAVE);
  } catch { /* almacenamiento bloqueado: queda en memoria */ }
}
