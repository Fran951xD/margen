// Conversación con uno o varios documentos: mensajes, respuestas con citas y caja para preguntar.
import { el, icono, trabajando, cajaError, desplazarA } from '../ui.js';
import { preguntar } from '../servicio.js';
import { nota } from './nota.js';

/**
 * docIds: documentos consultados. titulos: { id: título } (si hay varios, para rotular citas).
 * conversacion: la existente o null. alCambiar(conv): avisa la conversación actualizada.
 * senal(): devuelve una AbortSignal para cancelar al salir.
 */
export function panelConversacion({ docIds, titulos, conversacion, sugerencias = [], alIr, alCambiar, senal, cabecera = null }) {
  let conv = conversacion;
  const hilo = el('div', { class: 'hilo', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const campo = el('textarea', {
    class: 'entrada caja-pregunta__campo', rows: 1, maxlength: 2000, id: `pregunta-${Math.random().toString(36).slice(2, 7)}`,
    placeholder: docIds.length > 1 ? `Preguntá sobre estos ${docIds.length} documentos` : 'Preguntá algo sobre este documento',
  });
  const enviar = el('button', { type: 'submit', class: 'boton boton--primario caja-pregunta__enviar', 'aria-label': 'Preguntar' }, icono('enviar'));
  const formulario = el('form', { class: 'caja-pregunta' },
    el('label', { for: campo.id, class: 'solo-lectores' }, 'Tu pregunta'), campo, enviar);

  campo.addEventListener('input', ajustarAlto);
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); formulario.requestSubmit(); } });
  campo.addEventListener('preguntar', (e) => { campo.value = e.detail; ajustarAlto(); formulario.requestSubmit(); });
  formulario.addEventListener('submit', (e) => { e.preventDefault(); const q = campo.value.trim(); if (q) enviarPregunta(q); });

  function ajustarAlto() { campo.style.height = 'auto'; campo.style.height = `${Math.min(campo.scrollHeight, 200)}px`; }

  function mensaje(m) {
    if (m.rol === 'usuario') return el('div', { class: 'mensaje mensaje--usuario' }, el('p', {}, m.texto));
    return el('div', { class: `mensaje mensaje--margen ${m.encontrado === false ? 'mensaje--sin-respuesta' : ''}` },
      m.encontrado === false && !m.aviso ? el('p', { class: 'mensaje__estado' }, 'No está en los documentos') : null,
      nota({ texto: m.texto, citas: m.citas, titulos, alIr }),
      m.modo === 'fragmentos' ? el('p', { class: 'mensaje__nota' }, 'Documentos largos: respondí con las partes más relacionadas con tu pregunta.') : null,
      m.seguimiento?.length ? el('div', { class: 'sugeridas__lista' }, m.seguimiento.map((q) => el('button', { type: 'button', class: 'sugerencia', onclick: () => enviarPregunta(q) }, q))) : null);
  }

  function dibujar() {
    if (!conv?.mensajes?.length) {
      hilo.replaceChildren(el('div', { class: 'hilo__vacio' },
        el('p', { class: 'lectura' }, 'Preguntá lo que quieras saber. Margen responde solo con lo que dicen los documentos y te muestra de qué página sale cada cosa.'),
        sugerencias.length ? el('div', { class: 'sugeridas__lista' }, sugerencias.map((q) => el('button', { type: 'button', class: 'sugerencia', onclick: () => enviarPregunta(q) }, q))) : null));
      return;
    }
    hilo.replaceChildren(...conv.mensajes.map(mensaje));
  }

  async function enviarPregunta(q) {
    campo.value = '';
    ajustarAlto();
    enviar.disabled = true;
    if (!conv?.mensajes?.length) hilo.replaceChildren();
    hilo.append(mensaje({ rol: 'usuario', texto: q }));
    const t = trabajando(docIds.length > 1 ? 'Buscando en los documentos…' : 'Buscando en el documento…');
    hilo.append(t);
    desplazarA(t, { bloque: 'nearest' });
    try {
      conv = await preguntar({ conversacion: conv, docIds, pregunta: q, senal: senal?.(), alAvisar: (m) => t.actualizar(m) });
      alCambiar?.(conv);
      t.remove();
      const ultimo = mensaje(conv.mensajes[conv.mensajes.length - 1]);
      hilo.append(ultimo);
      desplazarA(ultimo.previousElementSibling || ultimo);
    } catch (e) {
      t.remove();
      if (e.name === 'AbortError') return;
      hilo.lastChild?.remove(); // la pregunta que falló vuelve al campo
      campo.value = q;
      ajustarAlto();
      hilo.append(cajaError(e, { reintentar: () => { hilo.lastChild?.remove(); enviarPregunta(q); } }));
    } finally {
      enviar.disabled = false;
      campo.focus();
    }
  }

  dibujar();
  return el('div', { class: 'conversacion' }, cabecera, hilo,
    el('div', { class: 'conversacion__pie' }, formulario,
      el('p', { class: 'conversacion__aviso' }, 'Las respuestas las genera una IA: revisá las citas antes de usarlas en algo importante.')));
}
