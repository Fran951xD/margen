// Visor de PDF: páginas que se dibujan a medida que aparecen, capa de texto y resaltado de citas.
import { el, icono } from '../ui.js';
import { db } from '../db.js';
import { abrirPdf, dibujarPagina, dibujarTextos } from '../lector.js';
import { tramosDelExtracto } from '../resaltar.js';

export function crearVisor(doc) {
  const hojas = new Map(); // numero -> { nodo, canvas, textos, dibujada }
  const indicador = el('span', { class: 'visor__indicador', 'aria-live': 'polite' }, `p. 1 de ${doc.paginas}`);
  const campoPagina = el('input', { type: 'number', min: 1, max: doc.paginas, value: 1, class: 'visor__campo', 'aria-label': 'Ir a la página' });
  const papel = el('div', { class: 'visor__papel', tabindex: '0', 'aria-label': `Páginas de ${doc.titulo}` });
  const nodo = el('section', { class: 'visor', 'aria-label': 'Documento' },
    el('div', { class: 'visor__barra' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Página anterior', onclick: () => irA(actual - 1) }, icono('atras')),
      el('label', { class: 'visor__ir' }, campoPagina, indicador),
      el('button', { type: 'button', class: 'boton-icono visor__siguiente', 'aria-label': 'Página siguiente', onclick: () => irA(actual + 1) }, icono('atras'))),
    papel);

  let pdf = null;
  let ancho = 0;
  let actual = 1;
  let destruido = false;
  let pendienteResaltar = null;

  campoPagina.addEventListener('change', () => irA(Number(campoPagina.value)));

  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) if (e.isIntersecting) dibujar(Number(e.target.dataset.pagina));
  }, { root: papel, rootMargin: '600px 0px' });

  const visibilidad = new Map();
  const seguidor = new IntersectionObserver((entradas) => {
    for (const e of entradas) visibilidad.set(Number(e.target.dataset.pagina), e.isIntersecting ? e.intersectionRect.height : 0);
    const [pagina, alto] = [...visibilidad.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] || [];
    if (!alto) return;
    actual = pagina;
    indicador.textContent = `p. ${actual} de ${doc.paginas}`;
    if (document.activeElement !== campoPagina) campoPagina.value = actual;
  }, { root: papel, threshold: [0, 0.25, 0.5, 0.75, 1] });

  let proporcion = 1.414;

  async function iniciar() {
    const blob = await db.archivo(doc.id);
    if (!blob) { papel.append(el('p', { class: 'visor__vacio' }, 'No se encontró el archivo original.')); return; }
    pdf = await abrirPdf(await blob.arrayBuffer());
    if (destruido) { pdf.destroy(); return; }
    const vista = (await pdf.getPage(1)).getViewport({ scale: 1 });
    proporcion = vista.height / vista.width;
    for (let n = 1; n <= doc.paginas; n++) {
      const canvas = el('canvas', { class: 'visor__lienzo' });
      const textos = el('div', { class: 'textLayer' });
      const hoja = el('div', { class: 'visor__hoja', dataset: { pagina: n } }, canvas, textos, el('span', { class: 'visor__numero' }, String(n)));
      hojas.set(n, { nodo: hoja, canvas, textos, dibujada: false });
      papel.append(hoja);
    }
    medir();
    redimensionador.observe(papel);
  }

  /** Ajusta el ancho de las páginas al espacio disponible (también cuando el visor estaba oculto). */
  function medir() {
    const disponible = papel.clientWidth - (matchMedia('(max-width: 40rem)').matches ? 16 : 48);
    if (disponible <= 0) return false;
    const nuevo = Math.round(Math.min(disponible, 900));
    if (Math.abs(nuevo - ancho) < 24) return true;
    ancho = nuevo;
    for (const h of hojas.values()) {
      h.nodo.style.width = `${ancho}px`;
      h.nodo.style.height = `${Math.round(ancho * proporcion)}px`;
      h.dibujada = false;
      h.divs = null;
      observador.unobserve(h.nodo); observador.observe(h.nodo);
      seguidor.unobserve(h.nodo); seguidor.observe(h.nodo);
    }
    return true;
  }

  const redimensionador = new ResizeObserver(() => {
    if (!ancho && medir() && pendienteResaltar) irA(pendienteResaltar.pagina, pendienteResaltar.extracto);
    else medir();
  });

  async function dibujar(n) {
    const h = hojas.get(n);
    if (!h || h.dibujada || !pdf || !ancho) return;
    h.dibujada = true;
    try {
      const r = await dibujarPagina(pdf, n, h.canvas, ancho);
      h.nodo.style.height = `${Math.round(r.alto)}px`;
      h.divs = await dibujarTextos(pdf, n, h.textos, ancho);
      if (pendienteResaltar?.pagina === n) marcar(n, pendienteResaltar.extracto);
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') h.dibujada = false;
    }
  }

  function limpiarResaltado() {
    for (const m of papel.querySelectorAll('mark.resaltado')) m.replaceWith(document.createTextNode(m.textContent));
    for (const h of hojas.values()) h.divs?.forEach((d) => d.normalize());
  }

  function marcar(n, extracto) {
    limpiarResaltado();
    const h = hojas.get(n);
    if (!h?.divs || !extracto) return;
    const tramos = tramosDelExtracto(h.divs.map((d) => d.textContent), extracto);
    let primero = null;
    for (const t of tramos) {
      const div = h.divs[t.indice];
      const texto = div.textContent;
      const marca = el('mark', { class: 'resaltado' }, texto.slice(t.desde, t.hasta));
      div.replaceChildren(texto.slice(0, t.desde), marca, texto.slice(t.hasta));
      primero ??= marca;
    }
    if (primero) {
      const arriba = primero.getBoundingClientRect().top - papel.getBoundingClientRect().top + papel.scrollTop - 80;
      papel.scrollTo({ top: Math.max(0, arriba), behavior: preferenciaMovimiento() });
    }
    pendienteResaltar = null;
  }

  function irA(n, extracto) {
    if (!Number.isFinite(n)) return;
    n = Math.min(Math.max(1, Math.round(n)), doc.paginas);
    const h = hojas.get(n);
    if (!h || !ancho) { pendienteResaltar = { pagina: n, extracto }; return; }
    papel.scrollTo({ top: h.nodo.offsetTop - papel.offsetTop - 12, behavior: preferenciaMovimiento() });
    h.nodo.classList.remove('visor__hoja--destello');
    void h.nodo.offsetWidth;
    h.nodo.classList.add('visor__hoja--destello');
    if (extracto) {
      if (h.divs) marcar(n, extracto);
      else { pendienteResaltar = { pagina: n, extracto }; dibujar(n); }
    }
  }

  papel.addEventListener('keydown', (e) => {
    if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !e.target.closest('input'))) { e.preventDefault(); irA(actual + 1); }
    if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !e.target.closest('input'))) { e.preventDefault(); irA(actual - 1); }
  });

  const listo = iniciar().catch((e) => papel.append(el('p', { class: 'visor__vacio' }, e?.tipo === 'contrasena'
    ? 'Este PDF tiene contraseña. Su texto ya se leyó y podés resumirlo y preguntarle, pero para ver las páginas abrilo con tu lector de PDF.'
    : 'No se pudo mostrar el PDF.')));

  return {
    nodo,
    listo,
    irA: async (n, extracto) => { await listo; irA(n, extracto); },
    destruir() {
      destruido = true;
      observador.disconnect();
      seguidor.disconnect();
      redimensionador.disconnect();
      pdf?.destroy();
    },
  };
}

function preferenciaMovimiento() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
