// Preguntar a varios documentos a la vez, con historial de conversaciones.
import { el, icono, confirmar, dialogo } from '../ui.js';
import { db } from '../db.js';
import { fechaRelativa } from '../logica.js';
import { panelConversacion } from './conversacion.js';
import { crearVisor } from './visor.js';

export async function vistaPreguntar(raiz, { conversacionId, docsIniciales = [], ir }) {
  document.title = 'Preguntar · Margen';
  const documentos = await db.documentos();
  if (!documentos.length) {
    raiz.replaceChildren(el('div', { class: 'vacio' },
      el('h1', {}, 'Todavía no hay documentos'),
      el('p', { class: 'lectura' }, 'Subí uno o más PDFs a la biblioteca y después preguntales lo que quieras.'),
      el('a', { class: 'boton boton--primario', href: '#/' }, 'Ir a la biblioteca')));
    return;
  }
  const conversaciones = await db.conversaciones();
  let conv = conversacionId ? conversaciones.find((c) => c.id === conversacionId) || null : null;
  const existentes = new Set(documentos.map((d) => d.id));
  let elegidos = new Set((conv?.docIds || (docsIniciales.length ? docsIniciales : [documentos[0].id])).filter((i) => existentes.has(i)));
  if (!elegidos.size) elegidos = new Set([documentos[0].id]);
  const titulos = Object.fromEntries(documentos.map((d) => [d.id, d.titulo]));
  const controlador = new AbortController();
  const zonaChat = el('div', { class: 'preguntar__chat' });

  const selector = el('fieldset', { class: 'selector-docs' },
    el('legend', {}, 'Buscar en'),
    documentos.map((d) => el('label', { class: 'selector-docs__item' },
      el('input', { type: 'checkbox', value: d.id, checked: elegidos.has(d.id), onchange: (e) => {
        if (e.target.checked) elegidos.add(d.id); else elegidos.delete(d.id);
        if (!elegidos.size) { e.target.checked = true; elegidos.add(d.id); return; }
        conv = null; // otra combinación de documentos = conversación nueva
        montar();
      } }),
      el('span', {}, d.titulo))));

  const historial = el('nav', { class: 'historial', 'aria-label': 'Conversaciones anteriores' },
    el('div', { class: 'historial__cabecera' },
      el('h2', {}, 'Conversaciones'),
      el('button', { type: 'button', class: 'boton boton--texto', onclick: () => { conv = null; montar(); history.replaceState(null, '', '#/preguntar'); } }, icono('mas', { tamano: 16 }), 'Nueva')),
    conversaciones.length ? el('ul', {}, conversaciones.slice(0, 30).map((c) => el('li', { class: c.id === conv?.id ? 'activa' : '' },
      el('a', { href: `#/preguntar/${c.id}` }, el('span', {}, c.titulo), el('small', {}, fechaRelativa(c.actualizada))),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': `Borrar conversación: ${c.titulo}`, onclick: async () => {
        if (!await confirmar('¿Borrar esta conversación?', c.titulo, { texto: 'Borrar', peligro: true })) return;
        await db.borrarConversacion(c.id);
        ir(c.id === conv?.id ? '#/preguntar' : location.hash, { forzar: true });
      } }, icono('basura', { tamano: 16 })))))
      : el('p', { class: 'vacio-chico' }, 'Acá van a quedar tus conversaciones.'));

  function montar() {
    const ids = [...elegidos];
    zonaChat.replaceChildren(panelConversacion({
      docIds: ids,
      titulos: ids.length > 1 ? titulos : null,
      conversacion: conv,
      sugerencias: ids.length > 1 ? ['¿En qué coinciden estos documentos?', '¿En qué se contradicen?', 'Compará los puntos principales de cada uno'] : [],
      alIr: (c) => abrirPagina(documentos.find((d) => d.id === (c.doc || ids[0])), c),
      alCambiar: (c) => { conv = c; history.replaceState(null, '', `#/preguntar/${c.id}`); },
      senal: () => controlador.signal,
    }));
  }

  raiz.replaceChildren(el('div', { class: 'preguntar' },
    el('aside', { class: 'preguntar__lateral' }, selector, historial),
    el('section', { class: 'preguntar__principal', 'aria-label': 'Conversación' }, el('h1', { class: 'solo-lectores' }, 'Preguntar'), zonaChat)));
  montar();
  return () => controlador.abort();
}

/** Abre el PDF en un diálogo, en la página citada y con el extracto resaltado. */
function abrirPagina(doc, cita) {
  if (!doc) return;
  const visor = crearVisor(doc);
  dialogo({
    titulo: doc.titulo,
    clase: 'dialogo--visor',
    contenido: el('div', { class: 'dialogo-visor' }, visor.nodo,
      el('p', { class: 'dialogo-visor__pie' }, el('a', { href: `#/doc/${doc.id}`, onclick: (e) => e.target.closest('dialog')?.cerrar(null) }, 'Abrir el documento completo'))),
    botones: [],
  }).then(() => visor.destruir());
  visor.irA(cita.pagina, cita.extracto);
}
