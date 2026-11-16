// Ajustes: conexión con Gemini, modelo, detalle, uso y datos guardados.
import { el, icono, avisar, confirmar } from '../ui.js';
import { db, ajustes } from '../db.js';
import { probarClave, MODELOS_RESPALDO } from '../gemini.js';
import { formatearBytes, plural } from '../logica.js';

export async function vistaAjustes(raiz, { ir }) {
  document.title = 'Ajustes · Margen';
  const clave = ajustes.leer('clave', '');
  const campoClave = el('input', { type: 'password', class: 'entrada', id: 'clave', autocomplete: 'off', spellcheck: 'false', value: clave, placeholder: 'AIza…', 'aria-describedby': 'clave-ayuda clave-estado' });
  const estado = el('p', { class: 'estado-clave', id: 'clave-estado', 'aria-live': 'polite' }, clave ? 'Clave guardada en este navegador.' : '');
  const ver = el('button', { type: 'button', class: 'boton boton--secundario', 'aria-pressed': 'false', onclick: () => {
    const mostrar = campoClave.type === 'password';
    campoClave.type = mostrar ? 'text' : 'password';
    ver.setAttribute('aria-pressed', String(mostrar));
    ver.lastChild.textContent = mostrar ? 'Ocultar' : 'Mostrar';
  } }, icono('ojo', { tamano: 18 }), el('span', {}, 'Mostrar'));

  const selectorModelo = el('select', { class: 'entrada', id: 'modelo' });
  const dibujarModelos = () => {
    const disponibles = ajustes.leer('modelosDisponibles', []);
    const lista = disponibles.length ? disponibles : MODELOS_RESPALDO;
    const elegido = ajustes.leer('modelo', '') || lista[0];
    selectorModelo.replaceChildren(...lista.map((m, i) => el('option', { value: m, selected: m === elegido }, i === 0 ? `${m} (recomendado)` : m)));
  };
  dibujarModelos();
  selectorModelo.addEventListener('change', () => { ajustes.guardar('modelo', selectorModelo.value); avisar(`Modelo: ${selectorModelo.value}`); });

  const nivel = el('select', { class: 'entrada', id: 'nivel-defecto' },
    [['breve', 'Breve'], ['normal', 'Normal'], ['detallado', 'Detallado']].map(([v, t]) => el('option', { value: v, selected: v === ajustes.leer('nivel', 'normal') }, t)));
  nivel.addEventListener('change', () => { ajustes.guardar('nivel', nivel.value); avisar('Guardado.'); });

  const formulario = el('form', { class: 'formulario-clave', onsubmit: async (e) => {
    e.preventDefault();
    const valor = campoClave.value.trim();
    if (!valor) { ajustes.guardar('clave', ''); estado.textContent = 'Clave borrada.'; return; }
    const boton = formulario.querySelector('[type=submit]');
    boton.disabled = true;
    estado.className = 'estado-clave';
    estado.textContent = 'Probando la clave…';
    try {
      const modelos = await probarClave(valor);
      ajustes.guardar('clave', valor);
      ajustes.guardar('modelosDisponibles', modelos);
      if (!modelos.includes(ajustes.leer('modelo', ''))) ajustes.guardar('modelo', modelos[0]);
      dibujarModelos();
      estado.className = 'estado-clave estado-clave--ok';
      estado.textContent = `Conectado. ${plural(modelos.length, 'modelo disponible', 'modelos disponibles')}; vamos a usar ${modelos[0]}.`;
      avisar('Gemini conectado.');
    } catch (error) {
      estado.className = 'estado-clave estado-clave--error';
      estado.textContent = error.message;
    } finally {
      boton.disabled = false;
    }
  } },
    el('label', { for: 'clave' }, 'Clave de API de Gemini'),
    el('div', { class: 'formulario-clave__fila' }, campoClave, ver),
    el('p', { class: 'campo__ayuda', id: 'clave-ayuda' }, 'Se guarda solo en este navegador y se envía únicamente a Google.'),
    estado,
    el('div', { class: 'formulario-clave__acciones' },
      el('button', { type: 'submit', class: 'boton boton--primario' }, 'Guardar y probar'),
      clave ? el('button', { type: 'button', class: 'boton boton--texto', onclick: () => { ajustes.guardar('clave', ''); campoClave.value = ''; estado.className = 'estado-clave'; estado.textContent = 'Clave borrada de este navegador.'; } }, 'Borrar clave') : null));

  const uso = ajustes.leer('uso', {});
  const hoy = new Date().toISOString().slice(0, 10);
  const espacio = await db.espacio();
  const documentos = await db.documentos();

  raiz.replaceChildren(el('div', { class: 'ajustes' },
    el('h1', {}, 'Ajustes'),

    el('section', { class: 'bloque', 'aria-labelledby': 'ajustes-gemini' },
      el('h2', { id: 'ajustes-gemini' }, 'Conexión con Gemini'),
      el('p', { class: 'lectura' }, 'Margen usa Gemini, la IA de Google, con tu propia clave. El nivel gratuito alcanza para uso personal y no pide tarjeta.'),
      el('ol', { class: 'pasos' },
        el('li', {}, 'Entrá a ', el('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'Google AI Studio'), ' con tu cuenta de Google.'),
        el('li', {}, 'Tocá "Crear clave de API" (Create API key) y copiala.'),
        el('li', {}, 'Pegala acá abajo y tocá "Guardar y probar".')),
      formulario),

    el('section', { class: 'bloque', 'aria-labelledby': 'ajustes-preferencias' },
      el('h2', { id: 'ajustes-preferencias' }, 'Preferencias'),
      el('div', { class: 'campos-dobles' },
        el('div', { class: 'campo' }, el('label', { for: 'modelo' }, 'Modelo'), selectorModelo,
          el('p', { class: 'campo__ayuda' }, 'Si un modelo no responde o se agota el cupo, Margen prueba con el siguiente.')),
        el('div', { class: 'campo' }, el('label', { for: 'nivel-defecto' }, 'Detalle de los resúmenes'), nivel))),

    el('section', { class: 'bloque', 'aria-labelledby': 'ajustes-uso' },
      el('h2', { id: 'ajustes-uso' }, 'Uso de hoy'),
      el('p', { class: 'lectura' }, uso.dia === hoy
        ? `${plural(uso.pedidos, 'pedido', 'pedidos')} a Gemini, unas ${uso.tokens.toLocaleString('es-AR')} unidades de texto (tokens).`
        : 'Todavía no hiciste pedidos hoy.'),
      el('p', { class: 'campo__ayuda' }, 'Los límites gratuitos de Google se renuevan cada día. Podés ver los tuyos en Google AI Studio.')),

    el('section', { class: 'bloque', 'aria-labelledby': 'ajustes-privacidad' },
      el('h2', { id: 'ajustes-privacidad' }, 'Privacidad'),
      el('ul', { class: 'lista-simple lectura' },
        el('li', {}, 'Tus PDFs, resúmenes y conversaciones se guardan solo en este navegador. No hay servidor de Margen.'),
        el('li', {}, 'Cuando pedís un resumen o hacés una pregunta, el texto del documento se envía a Google para procesarlo.'),
        el('li', {}, 'En el nivel gratuito, Google puede usar ese contenido para mejorar sus productos. Evitá subir documentos confidenciales o activá la facturación en Google para que no se usen.'))),

    el('section', { class: 'bloque', 'aria-labelledby': 'ajustes-datos' },
      el('h2', { id: 'ajustes-datos' }, 'Datos guardados'),
      el('p', { class: 'lectura' }, `${plural(documentos.length, 'documento', 'documentos')}${espacio ? `, ${formatearBytes(espacio.usado)} usados` : ''}.`),
      el('button', { type: 'button', class: 'boton boton--peligro', onclick: async () => {
        if (!await confirmar('¿Borrar todo?', 'Se borran todos los documentos, resúmenes, tarjetas y conversaciones de este navegador. La clave de Gemini se mantiene.', { texto: 'Borrar todo', peligro: true })) return;
        await db.borrarTodo();
        avisar('Se borraron todos los datos.');
        ir('#/');
      } }, 'Borrar todos los datos')),
  ));
}
