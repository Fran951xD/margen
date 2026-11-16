// Piezas de interfaz compartidas: elementos, avisos, diálogos e íconos.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** Crea un elemento. Los hijos de texto se insertan como texto, nunca como HTML. */
export function el(tag, atributos = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') nodo.className = v;
    else if (k === 'dataset') Object.assign(nodo.dataset, v);
    else if (k === 'html') nodo.innerHTML = v; // solo con HTML generado por markdownAHtml (escapado)
    else if (k.startsWith('on') && typeof v === 'function') nodo.addEventListener(k.slice(2), v);
    else if (k === 'value') nodo.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') nodo[k] = Boolean(v);
    else nodo.setAttribute(k, v === true ? '' : v);
  }
  nodo.append(...hijos.flat(Infinity).filter((h) => h != null && h !== false));
  return nodo;
}

const SVG = 'http://www.w3.org/2000/svg';
const TRAZOS = {
  cerrar: 'M6 6l12 12M18 6L6 18',
  subir: 'M12 16V4m0 0l-5 5m5-5l5 5M5 20h14',
  documento: 'M7 3h7l5 5v13H7zM14 3v5h5',
  preguntar: 'M5 5h14v10H9l-4 4z',
  ajustes: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
  atras: 'M15 5l-7 7 7 7',
  descargar: 'M12 4v12m0 0l-5-5m5 5l5-5M5 20h14',
  basura: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  enviar: 'M4 12l16-8-6 16-3-7z',
  ok: 'M5 12l5 5 9-10',
  aprox: 'M5 10c3-3 5 3 8 0s5-3 6 0M5 15c3-3 5 3 8 0s5-3 6 0',
  alerta: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  libro: 'M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1zM12 6v14',
  ojo: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  mas: 'M12 5v14M5 12h14',
  girar: 'M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2M20 4v5h-5M4 20v-5h5',
  lupa: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
  pagina: 'M8 4h8v16H8z',
};

export function icono(nombre, { tamano = 20, clase = '' } = {}) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', tamano);
  s.setAttribute('height', tamano);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', `icono ${clase}`);
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', TRAZOS[nombre] || '');
  s.append(p);
  return s;
}

/** Aviso breve. tipo: ok | error | info. */
export function avisar(mensaje, { tipo = 'ok', accion = null, duracion = 5000 } = {}) {
  const zona = $('#avisos');
  const aviso = el('div', { class: `aviso aviso--${tipo}`, role: tipo === 'error' ? 'alert' : 'status' }, el('span', {}, mensaje));
  if (accion) aviso.append(el('button', { type: 'button', class: 'aviso__accion', onclick: () => { accion.alHacer(); aviso.remove(); } }, accion.texto));
  zona.append(aviso);
  while (zona.children.length > 2) zona.firstElementChild.remove();
  setTimeout(() => aviso.classList.add('aviso--saliendo'), duracion);
  setTimeout(() => aviso.remove(), duracion + 300);
}

/** Diálogo modal nativo. botones: [{ texto, valor, tipo, alHacer }]. Devuelve el valor elegido. */
export function dialogo({ titulo, descripcion = null, contenido = null, botones = [{ texto: 'Cerrar', valor: null }], clase = '' }) {
  return new Promise((resolver) => {
    const anterior = document.activeElement;
    const tituloId = `d-${Math.random().toString(36).slice(2, 8)}`;
    const caja = el('dialog', { class: `dialogo ${clase}`, 'aria-labelledby': tituloId });
    let resuelto = false;
    const cerrar = (valor) => {
      if (resuelto) return;
      resuelto = true;
      caja.close();
      caja.remove();
      anterior?.focus?.();
      resolver(valor);
    };
    const pie = el('div', { class: 'dialogo__pie' }, botones.map((b) => el('button', {
      type: 'button', class: `boton boton--${b.tipo ?? 'secundario'}`,
      onclick: async (e) => {
        const boton = e.currentTarget;
        if (b.alHacer) {
          boton.disabled = true;
          const seguir = await Promise.resolve().then(() => b.alHacer(caja)).catch((error) => { avisar(error.message, { tipo: 'error' }); return false; });
          boton.disabled = false;
          if (seguir === false) return;
        }
        cerrar(b.valor);
      },
    }, b.texto)));
    caja.append(
      el('div', { class: 'dialogo__cabecera' },
        el('h2', { id: tituloId }, titulo),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => cerrar(null) }, icono('cerrar'))),
      descripcion ? el('p', { class: 'dialogo__descripcion' }, descripcion) : null,
      contenido ? el('div', { class: 'dialogo__cuerpo' }, contenido) : null,
      botones.length ? pie : null,
    );
    caja.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(null); });
    document.body.append(caja);
    caja.showModal();
    (caja.querySelector('input:not([type=hidden]), select, textarea') ?? caja.querySelector('.boton--primario') ?? caja.querySelector('button'))?.focus();
    caja.cerrar = cerrar;
  });
}

export const confirmar = (titulo, descripcion, { texto = 'Confirmar', peligro = false } = {}) => dialogo({
  titulo, descripcion,
  botones: [{ texto: 'Cancelar', valor: false }, { texto, valor: true, tipo: peligro ? 'peligro' : 'primario' }],
});

/** Indicador de trabajo en curso dentro de un contenedor, con botón para cancelar. */
export function trabajando(texto, { alCancelar } = {}) {
  const estado = el('p', { class: 'trabajando__texto' }, texto);
  const nodo = el('div', { class: 'trabajando', role: 'status', 'aria-live': 'polite' },
    el('span', { class: 'trabajando__lapiz', 'aria-hidden': 'true' }),
    estado,
    alCancelar ? el('button', { type: 'button', class: 'boton boton--texto', onclick: alCancelar }, 'Cancelar') : null);
  nodo.actualizar = (t) => { estado.textContent = t; };
  return nodo;
}

/** Mensaje de error con acción para resolverlo. */
export function cajaError(error, { reintentar } = {}) {
  const sinClave = error?.tipo === 'sin-clave' || error?.tipo === 'clave';
  return el('div', { class: 'caja-error', role: 'alert' },
    icono('alerta'),
    el('div', {},
      el('p', {}, error?.message || 'Algo salió mal.'),
      el('div', { class: 'caja-error__acciones' },
        sinClave ? el('a', { class: 'boton boton--primario', href: '#/ajustes' }, 'Conectar Gemini') : null,
        reintentar && !sinClave ? el('button', { type: 'button', class: 'boton boton--secundario', onclick: reintentar }, 'Probar de nuevo') : null)));
}

/** Desplaza solo el contenedor con scroll más cercano (nunca la ventana), para no esconder la cabecera. */
export function desplazarA(nodo, { bloque = 'start', margen = 16 } = {}) {
  let c = nodo.parentElement;
  while (c && c !== document.body) {
    const estilo = getComputedStyle(c);
    if (/(auto|scroll)/.test(estilo.overflowY) && c.scrollHeight > c.clientHeight) break;
    c = c.parentElement;
  }
  const suave = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  if (!c || c === document.body) { nodo.scrollIntoView({ block: bloque === 'start' ? 'start' : 'nearest', behavior: suave }); return; }
  const delta = nodo.getBoundingClientRect().top - c.getBoundingClientRect().top;
  const destino = bloque === 'start' ? c.scrollTop + delta - margen
    : delta < 0 ? c.scrollTop + delta - margen
    : delta + nodo.offsetHeight > c.clientHeight ? c.scrollTop + delta + nodo.offsetHeight - c.clientHeight + margen : c.scrollTop;
  c.scrollTo({ top: Math.max(0, destino), behavior: suave });
}
