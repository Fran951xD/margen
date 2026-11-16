// Biblioteca: subir PDFs, ver los documentos y lo pendiente de repaso.
import { el, icono, avisar, confirmar, dialogo, trabajando } from '../ui.js';
import { db } from '../db.js';
import { importarPdf, cargarEjemplo, hayClave, LIMITE_MB } from '../servicio.js';
import { plural, fechaRelativa, formatearBytes, tarjetasPendientes } from '../logica.js';

export async function vistaBiblioteca(raiz, { ir }) {
  const documentos = await db.documentos();
  const estudios = await Promise.all(documentos.map((d) => db.estudio(d.id)));
  const pendientes = estudios.reduce((s, e) => s + tarjetasPendientes(e.tarjetas || []).length, 0);

  const entrada = el('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, class: 'solo-lectores', id: 'archivo-pdf' });
  entrada.addEventListener('change', () => { subir([...entrada.files]); entrada.value = ''; });
  const progreso = el('div', { class: 'progreso-subida', 'aria-live': 'polite' });

  async function subir(archivos) {
    if (!archivos.length) return;
    let ultimo = null;
    for (const archivo of archivos) {
      const t = trabajando(`Preparando "${archivo.name}"…`);
      progreso.append(t);
      try {
        ultimo = await importarConContrasena(archivo, (texto) => t.actualizar(`${archivo.name}: ${texto}`));
        const sinTexto = ultimo.paginasSinTexto.length;
        if (archivos.length > 1) avisar(sinTexto
          ? `"${ultimo.titulo}" tiene ${plural(sinTexto, 'página escaneada', 'páginas escaneadas')}. Abrilo para leerlas con IA.`
          : `Listo: "${ultimo.titulo}", ${plural(ultimo.paginas, 'página', 'páginas')}.`, { tipo: sinTexto ? 'info' : 'ok' });
      } catch (e) {
        if (e.tipo !== 'cancelado') avisar(e.message, { tipo: 'error', duracion: 8000 });
      } finally {
        t.remove();
      }
    }
    if (archivos.length === 1 && ultimo) ir(`#/doc/${ultimo.id}`);
    else vistaBiblioteca(raiz, { ir });
  }

  const zona = el('label', { class: `zona-pdf ${documentos.length ? 'zona-pdf--compacta' : ''}`, for: 'archivo-pdf' },
    icono('subir', { tamano: documentos.length ? 20 : 28 }),
    el('span', { class: 'zona-pdf__titulo' }, documentos.length ? 'Agregar PDFs' : 'Elegí o arrastrá tus PDFs'),
    documentos.length ? null : el('span', { class: 'zona-pdf__ayuda' }, `Apuntes, papers, manuales, contratos o leyes. Hasta ${LIMITE_MB} MB cada uno. Se guardan solo en este navegador.`));
  for (const tipo of ['dragenter', 'dragover']) zona.addEventListener(tipo, (e) => { e.preventDefault(); zona.classList.add('zona-pdf--encima'); });
  for (const tipo of ['dragleave', 'drop']) zona.addEventListener(tipo, () => zona.classList.remove('zona-pdf--encima'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); subir([...e.dataTransfer.files]); });

  const contenido = [];

  if (!documentos.length) {
    contenido.push(
      el('section', { class: 'portada' },
        el('h1', { class: 'portada__titulo' }, 'Leé menos veces.', el('br'), 'Entendé más.'),
        el('p', { class: 'portada__bajada lectura' },
          'Margen lee tus PDFs con vos: te arma un resumen, un glosario y preguntas para estudiar, y responde lo que le preguntes ',
          'diciendo en qué página lo encontró. Cada cita se compara con el texto original para que sepas cuándo confiar.'),
        el('div', { class: 'portada__acciones' }, entrada, zona,
          el('button', { type: 'button', class: 'boton boton--texto', onclick: probarEjemplo }, 'Probar con un documento de ejemplo')),
        progreso),
      el('section', { class: 'como', 'aria-labelledby': 'como-titulo' },
        el('h2', { id: 'como-titulo', class: 'solo-lectores' }, 'Qué hace Margen'),
        el('dl', { class: 'como__lista' },
          el('div', {}, el('dt', {}, 'Resumen con fuentes'), el('dd', {}, 'Puntos clave con la página de cada uno. Tocás una cita y ves el párrafo resaltado en el PDF.')),
          el('div', {}, el('dt', {}, 'Preguntas a tus documentos'), el('dd', {}, 'Preguntá sobre uno o varios PDFs a la vez. Si la respuesta no está, te lo dice en vez de inventar.')),
          el('div', {}, el('dt', {}, 'Estudio que se acuerda'), el('dd', {}, 'Cuestionarios y tarjetas con repaso espaciado: te muestra cada tarjeta justo cuando estás por olvidarla.')))),
    );
  } else {
    contenido.push(el('div', { class: 'encabezado' },
      el('h1', {}, 'Biblioteca'),
      el('div', { class: 'encabezado__acciones' }, entrada, zona)), progreso);

    if (!hayClave()) {
      contenido.push(el('div', { class: 'aviso-fijo' },
        el('p', {}, 'Para resumir y preguntar sobre tus propios documentos, conectá Gemini. Es gratis y tarda un minuto.'),
        el('a', { class: 'boton boton--primario', href: '#/ajustes' }, 'Conectar Gemini')));
    }
    if (pendientes) {
      const primero = documentos.find((d, i) => tarjetasPendientes(estudios[i].tarjetas || []).length);
      contenido.push(el('a', { class: 'repaso-hoy', href: `#/doc/${primero.id}/repaso` },
        el('strong', {}, plural(pendientes, 'tarjeta para repasar hoy', 'tarjetas para repasar hoy')),
        el('span', {}, 'Cinco minutos ahora te ahorran releer después.')));
    }

    contenido.push(el('ul', { class: 'lista-docs', 'aria-label': 'Documentos' }, documentos.map((d, i) => filaDocumento(d, estudios[i]))));
  }

  raiz.replaceChildren(...contenido);
  document.title = 'Margen: leé y estudiá tus PDFs';

  function filaDocumento(d, estudio) {
    const estado = [];
    if (estudio.analisis) estado.push(el('span', { class: 'sello sello--ok' }, 'Resumido'));
    if (d.paginasSinTexto?.length) estado.push(el('span', { class: 'sello sello--aviso' }, `${d.paginasSinTexto.length} sin texto`));
    if (d.demo) estado.push(el('span', { class: 'sello' }, 'Ejemplo'));
    const tarjetas = tarjetasPendientes(estudio.tarjetas || []).length;
    if (tarjetas) estado.push(el('span', { class: 'sello sello--tinta' }, plural(tarjetas, 'tarjeta hoy', 'tarjetas hoy')));
    return el('li', { class: 'doc' },
      el('a', { class: 'doc__enlace', href: `#/doc/${d.id}` },
        el('span', { class: 'doc__titulo' }, d.titulo),
        el('span', { class: 'doc__meta' },
          el('span', {}, plural(d.paginas, 'página', 'páginas')),
          el('span', {}, formatearBytes(d.tamano || 0)),
          el('span', {}, `Abierto ${fechaRelativa(d.abierto || d.creado)}`))),
      el('div', { class: 'doc__estado' }, estado),
      el('div', { class: 'doc__acciones' },
        el('a', { class: 'boton boton--texto', href: `#/preguntar?docs=${d.id}` }, 'Preguntar'),
        el('button', {
          type: 'button', class: 'boton-icono', 'aria-label': `Borrar ${d.titulo}`,
          onclick: async () => {
            if (!await confirmar(`¿Borrar "${d.titulo}"?`, 'Se borran el PDF, el resumen, el repaso y las conversaciones que lo usan. No se puede deshacer.', { texto: 'Borrar', peligro: true })) return;
            await db.borrarDocumento(d.id);
            avisar('Documento borrado.');
            vistaBiblioteca(raiz, { ir });
          },
        }, icono('basura'))));
  }

  async function probarEjemplo() {
    const doc = await cargarEjemplo();
    ir(`#/doc/${doc.id}`);
  }
}

async function importarConContrasena(archivo, alAvanzar) {
  try {
    return await importarPdf(archivo, { alAvanzar });
  } catch (e) {
    if (e.tipo !== 'contrasena') throw e;
    let contrasena = null;
    const campo = el('input', { type: 'password', autocomplete: 'off', class: 'entrada' });
    const ok = await dialogo({
      titulo: 'PDF con contraseña',
      descripcion: `"${archivo.name}" está protegido. Escribí la contraseña para abrirlo. No se guarda.`,
      contenido: el('label', { class: 'campo' }, el('span', {}, 'Contraseña'), campo),
      botones: [{ texto: 'Cancelar', valor: false }, { texto: 'Abrir', valor: true, tipo: 'primario', alHacer: () => { contrasena = campo.value; return Boolean(contrasena); } }],
    });
    if (!ok) { const c = new Error('cancelado'); c.tipo = 'cancelado'; throw c; }
    return importarPdf(archivo, { alAvanzar, contrasena });
  }
}
