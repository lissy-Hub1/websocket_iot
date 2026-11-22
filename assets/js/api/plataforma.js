/* Práctica 4.3: llamadas de autenticación, administración, Mis vehículos, editor de demos e Invitado.
   Mismo cliente HTTP que CONTROL/MONITOREO (timeout, errores, token Bearer). Contratos: Swagger /docs. */
import { solicitar } from './cliente.js';

const json = (metodo, cuerpo) => ({ metodo, cuerpo });

// ---- autenticación
export const configPublica = () => solicitar('/auth/config');
export const loginGoogle = (credential) => solicitar('/auth/google', json('POST', { credential }));
export const yo = () => solicitar('/auth/yo');
export const logout = () => solicitar('/auth/logout', json('POST'));

// ---- Mis vehículos y soporte
export const misVehiculos = () => solicitar('/mis-vehiculos');
export const otorgarSoporte = (id, minutos) => solicitar(`/mis-vehiculos/${id}/soporte`, json('POST', { minutos }));
export const revocarSoporte = (id) => solicitar(`/mis-vehiculos/${id}/soporte`, json('DELETE'));

// ---- editor de demos
export const demosEditor = (id) => solicitar(`/vehiculos/${id}/demos-editor`);
export const comandosUnidad = (id) => solicitar(`/vehiculos/${id}/comandos`);
export const pasosDemo = (id, idDemo) => solicitar(`/vehiculos/${id}/demos/${idDemo}/movimientos`);
export const crearDemo = (id, demo) => solicitar(`/vehiculos/${id}/demos-editor`, json('POST', demo));
export const guardarDemo = (id, idDemo, demo) => solicitar(`/vehiculos/${id}/demos-editor/${idDemo}`, json('PUT', demo));
export const eliminarDemo = (id, idDemo) => solicitar(`/vehiculos/${id}/demos-editor/${idDemo}`, json('DELETE'));

// ---- Invitado
export const catalogo = () => solicitar('/catalogo');
export const iniciarInvitado = (idVehiculo) => solicitar('/invitados/sesiones', json('POST', { id_vehiculo: idVehiculo }));
export const estadoInvitado = () => solicitar('/invitados/sesion');
export const terminarInvitado = () => solicitar('/invitados/sesion', json('DELETE'));

// ---- Administración
export const admin = {
  dashboard: () => solicitar('/admin/dashboard'),
  unidades: () => solicitar('/admin/unidades'),
  crearUnidad: (u) => solicitar('/admin/unidades', json('POST', u)),
  editarUnidad: (id, u) => solicitar(`/admin/unidades/${id}`, json('PUT', u)),
  asignar: (id, idUsuario) => solicitar(`/admin/unidades/${id}/asignar`, json('POST', { id_usuario: idUsuario })),
  revocar: (id, estado) => solicitar(`/admin/unidades/${id}/revocar`, json('POST', { estado })),
  comandoInvitado: (id, idComando, permitido) =>
    solicitar(`/admin/unidades/${id}/comandos/${idComando}/invitado`, json('PUT', { permitido })),
  modelos: () => solicitar('/admin/modelos'),
  crearModelo: (m) => solicitar('/admin/modelos', json('POST', m)),
  editarModelo: (id, m) => solicitar(`/admin/modelos/${id}`, json('PUT', m)),
  usuarios: () => solicitar('/admin/usuarios'),
  crearUsuario: (u) => solicitar('/admin/usuarios', json('POST', u)),
  editarUsuario: (id, u) => solicitar(`/admin/usuarios/${id}`, json('PUT', u)),
  eliminarUsuario: (id) => solicitar(`/admin/usuarios/${id}`, json('DELETE')),
  auditoria: (limite, desde) => solicitar(`/admin/auditoria?limite=${limite}&desde=${desde}`),
};
