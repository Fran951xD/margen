// Texto con citas numeradas y sus glosas al margen: la pieza central de Margen.
import { el, icono, desplazarA } from '../ui.js';
import { markdownAHtml } from '../logica.js';

const VERIFICACION = {
  exacta: { texto: 'Cita textual verificada', icono: 'ok' },
  aproximada: { texto: 'Cita casi textual', icono: 'aprox' },
  'no-encontrada': { texto: 'No se encontró este texto exacto en la página', icono: 'alerta' },
};

/**
 * texto: markdown con [n]. citas: [{ n, doc, pagina, extracto, verificacion }].
 * titulos: { docId: título } para mostrar de qué documento es cada cita (solo si hay varios).
 * alIr(cita): abrir el documento en esa página.
 */
export function nota({ texto, citas = [], titulos = null, alIr, clase = '' }) {
  const cuerpo = el('div', { class: 'nota__texto lectura', html: markdownAHtml(texto) });
  const glosas = new Map();
  const margen = el('ol', { class: 'nota__margen', 'aria-label': 'Citas' }, citas.map((c) => {
    const v = VERIFICACION[c.verificacion] || VERIFICACION.exacta;
    const glosa = el('li', { class: `glosa glosa--${c.verificacion || 'exacta'}`, id: '', dataset: { n: c.n } },
      el('span', { class: 'glosa__n', 'aria-hidden': 'true' }, String(c.n)),
      el('div', { class: 'glosa__cuerpo' },
        el('blockquote', { class: 'glosa__extracto' }, el('mark', {}, c.extracto)),
        el('div', { class: 'glosa__pie' },
          el('button', { type: 'button', class: 'glosa__ir', onclick: () => alIr?.(c) },
            titulos && titulos[c.doc] ? `${titulos[c.doc]}, p. ${c.pagina}` : `Página ${c.pagina}`),
          el('span', { class: 'glosa__verificacion', title: v.texto }, icono(v.icono, { tamano: 16 }), el('span', { class: 'solo-lectores' }, v.texto)))));
    glosas.set(String(c.n), glosa);
    return glosa;
  }));

  cuerpo.addEventListener('click', (e) => {
    const boton = e.target.closest('.cita');
    if (!boton) return;
    const glosa = glosas.get(boton.dataset.cita);
    if (!glosa) return;
    for (const g of glosas.values()) g.classList.remove('glosa--activa');
    glosa.classList.add('glosa--activa');
    desplazarA(glosa, { bloque: 'nearest' });
    const cita = citas.find((c) => String(c.n) === boton.dataset.cita);
    if (cita) alIr?.(cita);
  });

  // Marca las citas que no se pudieron verificar también en el texto.
  for (const b of cuerpo.querySelectorAll('.cita')) {
    const c = citas.find((x) => String(x.n) === b.dataset.cita);
    if (c?.verificacion === 'no-encontrada') b.classList.add('cita--dudosa');
  }

  return el('div', { class: `nota ${citas.length ? 'nota--con-margen' : ''} ${clase}` }, cuerpo, citas.length ? margen : null);
}
