/* Piezas de interfaz reutilizables. Todo dato remoto entra como textContent, nunca como HTML. */
const NS_SVG = 'http://www.w3.org/2000/svg';

export const $ = (id) => document.getElementById(id);

export function icono(nombre) {
  const svg = document.createElementNS(NS_SVG, 'svg');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  const uso = document.createElementNS(NS_SVG, 'use');
  uso.setAttribute('href', `#i-${nombre}`);
  svg.append(uso);
  return svg;
}

export function elemento(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (clave === 'class') nodo.className = valor;
    else if (clave.startsWith('on')) nodo[clave] = valor;
    else if (valor === true) nodo.setAttribute(clave, '');
    else if (valor !== false && valor != null) nodo.setAttribute(clave, valor);
  }
  nodo.append(...hijos.flat().filter((h) => h != null));
  return nodo;
}
