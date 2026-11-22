/* Práctica 4.3: pantalla de ACCESO.
   - Login con Google Identity Services (botón oficial). El ID token se manda a la API, que lo verifica.
   - «Prueba nuestros vehículos IoT»: catálogo público y sesión temporal de Invitado. */
import * as plataforma from '../api/plataforma.js';
import { guardarSesion, guardarUnidad } from '../api/sesion.js';
import { avisar } from '../ui/avisos.js';
import { $, elemento, icono } from '../ui/componentes.js';
import { mensajeDeError } from '../utilidades/errores.js';

const SCRIPT_GOOGLE = 'https://accounts.google.com/gsi/client';

function cargarScriptGoogle() {
  return new Promise((resolver, rechazar) => {
    if (globalThis.google?.accounts?.id) return resolver();
    const s = document.createElement('script');
    s.src = SCRIPT_GOOGLE;
    s.async = true;
    s.onload = resolver;
    s.onerror = () => rechazar(new Error('No se pudo cargar Google'));
    document.head.append(s);
  });
}

async function alCredencialGoogle(respuesta) {
  const estado = $('loginEstado');
  estado.textContent = 'Verificando tu cuenta…';
  try {
    const sesion = await plataforma.loginGoogle(respuesta.credential);
    guardarSesion({ token: sesion.token, tipo: sesion.usuario.rol, usuario: sesion.usuario, expira_en: sesion.expira_en });
    guardarUnidad(null);
    location.hash = sesion.usuario.rol === 'ADMIN' ? '#administracion' : '#unidades';
    location.reload();
  } catch (error) {
    estado.textContent = mensajeDeError(error);
  }
}

async function prepararLogin(config) {
  const estado = $('loginEstado');
  if (!config?.google_client_id) {
    estado.textContent = 'El inicio de sesión con Google aún no está configurado en el servidor (falta GOOGLE_CLIENT_ID).';
    return;
  }
  try {
    await cargarScriptGoogle();
    google.accounts.id.initialize({ client_id: config.google_client_id, callback: alCredencialGoogle, ux_mode: 'popup' });
    // El botón oficial acepta 200–400 px: ocupa el ancho de la tarjeta sin pasarse.
    const ancho = Math.round(Math.max(200, Math.min(300, $('googleBoton').clientWidth || 280)));
    google.accounts.id.renderButton($('googleBoton'), {
      theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'es', width: ancho,
      logo_alignment: 'center',
    });
  } catch {
    estado.textContent = 'No se pudo cargar el botón de Google. Revisa tu conexión y recarga la página.';
  }
}

async function probar(unidad, boton) {
  boton.disabled = true;
  try {
    const s = await plataforma.iniciarInvitado(unidad.id_vehiculo);
    guardarSesion({ token: s.token, tipo: 'INVITADO', id_vehiculo: s.id_vehiculo, expira_en: s.expira_en });
    guardarUnidad({ id: s.id_vehiculo, nombre: unidad.modelo, serie: unidad.numero_serie });
    location.hash = '#control';
    location.reload();
  } catch (error) {
    avisar('error', mensajeDeError(error));
    boton.disabled = false;
    pintarCatalogo();
  }
}

async function pintarCatalogo() {
  const caja = $('catalogo');
  let modelos;
  try {
    modelos = await plataforma.catalogo();
  } catch (error) {
    caja.replaceChildren(elemento('p', { class: 'nota' }, `No se pudo cargar el catálogo: ${mensajeDeError(error)}`));
    return;
  }
  if (!modelos.length) {
    caja.replaceChildren(elemento('p', { class: 'nota' }, 'Sin modelos en el catálogo por ahora.'));
    return;
  }
  caja.replaceChildren(...modelos.map((m) => {
    const imagen = m.imagen_url
      ? elemento('img', { class: 'catalogo-img', src: m.imagen_url, alt: `Foto de ${m.nombre}`, loading: 'lazy' })
      : elemento('div', { class: 'catalogo-img catalogo-img-vacia', 'aria-hidden': 'true' }, icono('coche'));
    const unidades = m.unidades_exhibicion.length
      ? m.unidades_exhibicion.map((u) => {
        const boton = elemento('button', { type: 'button', class: 'btn boton-principal btn-chico', disabled: !u.libre },
          u.libre ? 'Probar' : 'Ocupada');
        boton.addEventListener('click', () => probar({ ...u, modelo: m.nombre }, boton));
        return elemento('li', { class: 'catalogo-unidad' },
          elemento('span', {}, elemento('strong', {}, u.numero_serie ?? `Unidad ${u.id_vehiculo}`),
            elemento('span', { class: `chip-estado ${u.libre ? 'ok' : 'ocupada'}` }, u.libre ? 'Libre' : 'En prueba')),
          boton);
      })
      : [elemento('li', { class: 'nota' }, 'Sin unidades de exhibición disponibles.')];
    return elemento('article', { class: 'catalogo-modelo' },
      imagen,
      elemento('div', { class: 'catalogo-info' },
        elemento('h4', {}, m.nombre),
        m.descripcion ? elemento('p', { class: 'nota' }, m.descripcion) : null,
        elemento('ul', { class: 'catalogo-unidades list-unstyled' }, unidades)));
  }));
}

export async function iniciarAcceso({ motivo } = {}) {
  if (motivo) $('loginEstado').textContent = motivo;
  let config = null;
  try {
    config = await plataforma.configPublica();
    $('catalogoChip').textContent = `Sin cuenta · ${config.invitado_minutos} min`;
  } catch (error) {
    $('loginEstado').textContent = `La API no responde: ${mensajeDeError(error)}`;
  }
  await Promise.all([prepararLogin(config), pintarCatalogo()]);
}
