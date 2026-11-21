/* Sesión de la pestaña (práctica 4.3).
   Guarda el token que entrega la API después del login con Google (o el de una prueba de Invitado)
   y la unidad elegida. Vive en sessionStorage: al cerrar la pestaña se olvida.
   El rol y los permisos NO se deciden aquí: la API los verifica en cada petición. */
const LLAVE = 'iot_sesion';
const LLAVE_UNIDAD = 'iot_unidad';

let sesion = leer(LLAVE);
let unidad = leer(LLAVE_UNIDAD);

function leer(llave) {
  try { return JSON.parse(sessionStorage.getItem(llave)) ?? null; } catch { return null; }
}

function escribir(llave, valor) {
  try {
    if (valor == null) sessionStorage.removeItem(llave);
    else sessionStorage.setItem(llave, JSON.stringify(valor));
  } catch { /* almacenamiento bloqueado: queda en memoria */ }
}

/** { token, tipo: 'ADMIN'|'USUARIO'|'INVITADO', usuario?, id_vehiculo?, expira_en } */
export function obtenerSesion() {
  return sesion;
}

export function obtenerToken() {
  return sesion?.token ?? '';
}

export function guardarSesion(datos) {
  sesion = datos;
  escribir(LLAVE, datos);
}

export function borrarSesion() {
  sesion = null;
  unidad = null;
  escribir(LLAVE, null);
  escribir(LLAVE_UNIDAD, null);
}

/** Unidad (id_vehiculo) que usan CONTROL y MONITOREO. */
export function obtenerUnidad() {
  return Number.isInteger(unidad?.id) ? unidad : null;
}

export function guardarUnidad(datos) {
  unidad = datos ? { id: datos.id, nombre: datos.nombre ?? '', serie: datos.serie ?? '' } : null;
  escribir(LLAVE_UNIDAD, unidad);
}

/* Compatibilidad con 4.1/4.2: la clave ya no existe en el navegador. */
export function obtenerClave() {
  return '';
}
