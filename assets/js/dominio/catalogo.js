/* Reparte el catálogo REAL del vehículo entre joystick, DETENER y botones. Nunca crea comandos:
   si el catálogo no trae una dirección, esa dirección queda deshabilitada. */
const PATRONES = {
  adelante: /^(MOVER_)?(AVANZAR|AVANZA|ADELANTE|FRENTE|FORWARD)$/,
  atras: /^(MOVER_)?(RETROCEDER|RETROCEDE|ATRAS|REVERSA|BACKWARD|BACK)$/,
  izquierda: /^(GIRAR_|GIRO_|VUELTA_|MOVER_)?(A_LA_)?(IZQUIERDA|IZQ|LEFT)$/,
  derecha: /^(GIRAR_|GIRO_|VUELTA_|MOVER_)?(A_LA_)?(DERECHA|DER|RIGHT)$/,
};
const PATRON_DETENER = /^(DETENER|DETENTE|PARAR|ALTO|STOP)$/;

/* Grupos visuales del mando. Un comando que no encaje en ninguno va a «Más movimientos». */
const GRUPOS = [
  { id: 'torreta', titulo: 'Torreta', patron: /^(TORRETA|CABINA)_/, prefijo: /^(TORRETA|CABINA)_/ },
  { id: 'giros', titulo: 'Giros', patron: /(90|180|360)/, prefijo: /^(GIRO|GIRAR|VUELTA)_/ },
  { id: 'brazo', titulo: 'Brazo', patron: /^(EXCAVAR|DESCARGAR|(SUBIR|BAJAR)_BRAZO|(ABRIR|CERRAR)_PALA|(BRAZO|PALA)_\w+)$/, prefijo: /^(BRAZO|PALA)_/ },
  { id: 'funciones', titulo: 'Funciones', patron: /^(LUCES|LUZ|MUSICA|CLAXON|BOCINA|DEMO_AUTO|ENCENDER|APAGAR|ENCENDER_APAGAR|VELOCIDAD\w*)$/ },
];
const OTROS = { id: 'otros', titulo: 'Más movimientos' };
const lado = (nombre) => (/IZQ|LEFT/.test(nombre) ? 0 : /DER|RIGHT/.test(nombre) ? 2 : 1);

/** Texto corto para el botón, derivado del nombre real: TORRETA_IZQUIERDA → «Izquierda». */
export function etiquetaCorta(nombre, idGrupo) {
  const prefijo = idGrupo === 'direccion' ? /^(GIRAR|GIRO|VUELTA|MOVER)_(A_LA_)?/ : GRUPOS.find((g) => g.id === idGrupo)?.prefijo;
  const base = normalizarNombre(nombre).replace(prefijo ?? /^$/, '').replaceAll('_', ' ').toLowerCase();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function agrupar(extras) {
  const grupos = new Map();
  for (const comando of extras) {
    const nombre = normalizarNombre(comando.nombre);
    const grupo = GRUPOS.find((g) => g.patron.test(nombre)) ?? OTROS;
    if (!grupos.has(grupo.id)) grupos.set(grupo.id, { id: grupo.id, titulo: grupo.titulo, comandos: [] });
    grupos.get(grupo.id).comandos.push(comando);
  }
  const orden = [...GRUPOS, OTROS].map((g) => g.id);
  return [...grupos.values()]
    .sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id))
    .map((g) => ({ ...g, comandos: g.comandos.sort((a, b) => lado(normalizarNombre(a.nombre)) - lado(normalizarNombre(b.nombre))) }));
}

export function normalizarNombre(nombre) {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/[\s-]+/g, '_');
}

export function clasificarCatalogo(comandos) {
  const activos = comandos.filter((c) => c.activo);
  const direcciones = { adelante: null, atras: null, izquierda: null, derecha: null };
  let detener = null;
  const extras = [];

  for (const comando of activos) {
    const nombre = normalizarNombre(comando.nombre);
    if (PATRON_DETENER.test(nombre)) {
      detener ??= comando;
      continue;
    }
    const direccion = Object.keys(PATRONES).find((d) => PATRONES[d].test(nombre) && !direcciones[d]);
    if (direccion) direcciones[direccion] = comando;
    else extras.push(comando);
  }
  return { direcciones, detener, extras, grupos: agrupar(extras) };
}
