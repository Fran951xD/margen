// Busca un extracto dentro de los fragmentos de texto de una página y devuelve qué tramos resaltar.
import { sinTildes } from './logica.js';

/** Normaliza un texto conservando, para cada carácter normalizado, su posición en el original. */
function normalizarConMapa(texto) {
  let salida = '';
  const posiciones = [];
  for (let i = 0; i < texto.length; i++) {
    const n = sinTildes(texto[i]).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    for (const c of n) { salida += c; posiciones.push(i); }
  }
  return { salida, posiciones };
}

/**
 * `partes`: textos de cada span de la capa de texto, en orden.
 * Devuelve [{ indice, desde, hasta }]: qué span y qué caracteres de ese span cubre el extracto.
 * Si el extracto no aparece entero, prueba con su comienzo (por si el modelo cambió el final).
 */
export function tramosDelExtracto(partes, extracto) {
  const objetivo = normalizarConMapa(String(extracto ?? '')).salida;
  if (objetivo.length < 6) return [];
  let unido = '';
  const dueno = []; // por cada carácter normalizado: [indiceSpan, posicionEnSpan]
  partes.forEach((p, i) => {
    const { salida, posiciones } = normalizarConMapa(p);
    unido += salida;
    posiciones.forEach((pos) => dueno.push([i, pos]));
  });
  let inicio = unido.indexOf(objetivo);
  let largo = objetivo.length;
  for (let l = Math.floor(objetivo.length * 0.8); inicio < 0 && l >= 20; l = Math.floor(l * 0.8)) {
    inicio = unido.indexOf(objetivo.slice(0, l));
    largo = l;
  }
  if (inicio < 0) return [];
  const tramos = new Map();
  for (const [i, pos] of dueno.slice(inicio, inicio + largo)) {
    const t = tramos.get(i);
    if (t) t.hasta = pos + 1; else tramos.set(i, { indice: i, desde: pos, hasta: pos + 1 });
  }
  return [...tramos.values()];
}

/** Compatibilidad: solo los índices de los spans. */
export function partesDelExtracto(partes, extracto) {
  return tramosDelExtracto(partes, extracto).map((t) => t.indice);
}
