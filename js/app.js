// Arranque y navegación por hash: #/  #/doc/:id/:pestaña  #/preguntar[/:id][?docs=a,b]  #/ajustes
import { $, $$, el, avisar } from './ui.js';
import { vistaBiblioteca } from './vistas/biblioteca.js';
import { vistaDocumento } from './vistas/documento.js';
import { vistaPreguntar } from './vistas/preguntar.js';
import { vistaAjustes } from './vistas/ajustes.js';

const raiz = $('#vista');
let limpiar = null;
let ultimaRuta = '';

function ir(hash, { forzar = false } = {}) {
  if (location.hash === hash && forzar) { route(); return; }
  location.hash = hash;
}

async function route() {
  const hash = location.hash || '#/';
  const [ruta, consulta = ''] = hash.slice(1).split('?');
  const partes = ruta.split('/').filter(Boolean);
  const params = new URLSearchParams(consulta);

  // Cambiar de pestaña dentro del mismo documento no recarga la vista (lo maneja la vista).
  const clave = partes[0] === 'doc' ? `doc/${partes[1]}` : ruta;
  if (clave === ultimaRuta && partes[0] === 'doc') return;
  ultimaRuta = clave;

  try { limpiar?.(); } catch { /* nada */ }
  limpiar = null;
  for (const a of $$('.nav a')) a.toggleAttribute('aria-current', a.dataset.seccion === (partes[0] || 'biblioteca') || (a.dataset.seccion === 'biblioteca' && partes[0] === 'doc'));
  if (a11yAnunciar) a11yAnunciar.textContent = '';
  document.body.dataset.vista = partes[0] || 'biblioteca';

  try {
    if (partes[0] === 'doc' && partes[1]) limpiar = await vistaDocumento(raiz, { id: decodeURIComponent(partes[1]), pestana: partes[2], ir });
    else if (partes[0] === 'preguntar') limpiar = await vistaPreguntar(raiz, { conversacionId: partes[1], docsIniciales: (params.get('docs') || '').split(',').filter(Boolean), ir });
    else if (partes[0] === 'ajustes') limpiar = await vistaAjustes(raiz, { ir });
    else limpiar = await vistaBiblioteca(raiz, { ir });
  } catch (e) {
    console.error(e);
    raiz.replaceChildren(el('div', { class: 'vacio' }, el('h1', {}, 'No se pudo abrir esta pantalla'), el('p', {}, e.message), el('a', { class: 'boton boton--primario', href: '#/' }, 'Volver a la biblioteca')));
  }
  const titulo = raiz.querySelector('h1');
  if (titulo && document.activeElement === document.body) { titulo.tabIndex = -1; titulo.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}

const a11yAnunciar = document.getElementById('anuncios');

window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/doc/') || !ultimaRuta.startsWith('doc/') || location.hash.split('/')[2] !== ultimaRuta.split('/')[1]) route(); });
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); avisar(e.reason?.message || 'Ocurrió un error inesperado.', { tipo: 'error' }); });

// Pedir almacenamiento persistente: así el navegador no borra los PDFs si falta espacio.
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});

route();
