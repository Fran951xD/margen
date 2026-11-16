// Lectura y dibujo de PDFs con pdf.js (incluido en vendor/, sin depender de internet).
import { limpiarTextoPagina } from './logica.js';

let pdfjs;
async function cargar() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}

const recursos = () => ({
  cMapUrl: new URL('../vendor/pdfjs/cmaps/', import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
  wasmUrl: new URL('../vendor/pdfjs/wasm/', import.meta.url).href,
  iccUrl: new URL('../vendor/pdfjs/iccs/', import.meta.url).href,
});

export async function abrirPdf(datos, contrasena) {
  const lib = await cargar();
  const tarea = lib.getDocument({ data: new Uint8Array(datos), password: contrasena, ...recursos() });
  try {
    const pdf = await tarea.promise;
    // En pdf.js 6 se libera desde la tarea de carga; dejamos un único método para todas las versiones.
    if (typeof pdf.destroy !== 'function') pdf.destroy = () => tarea.destroy();
    return pdf;
  } catch (e) {
    if (e?.name === 'PasswordException') {
      const error = new Error(contrasena ? 'La contraseña no es correcta.' : 'Este PDF tiene contraseña.');
      error.tipo = 'contrasena';
      throw error;
    }
    const error = new Error('No se pudo abrir el archivo. ¿Es un PDF válido?');
    error.tipo = 'invalido';
    throw error;
  }
}

/** Texto de cada página, respetando saltos de línea. `alAvanzar(hechas, total)`. */
export async function extraerPaginas(pdf, alAvanzar) {
  const paginas = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const contenido = await pagina.getTextContent();
    let texto = '';
    for (const item of contenido.items) {
      if (!('str' in item)) continue;
      texto += item.str + (item.hasEOL ? '\n' : (item.str && !item.str.endsWith(' ') ? ' ' : ''));
    }
    paginas.push({ numero: n, texto: limpiarTextoPagina(texto), origen: 'pdf' });
    pagina.cleanup();
    alAvanzar?.(n, pdf.numPages);
  }
  return paginas;
}

export async function metadatos(pdf) {
  try {
    const { info } = await pdf.getMetadata();
    return { titulo: (info?.Title || '').trim(), autor: (info?.Author || '').trim() };
  } catch { return { titulo: '', autor: '' }; }
}

/** Páginas que casi no tienen texto: probablemente escaneadas. */
export const paginasSinTexto = (paginas) => paginas.filter((p) => p.texto.replace(/\s/g, '').length < 25).map((p) => p.numero);

/** Dibuja una página en un canvas al ancho pedido (en px CSS), nítido en pantallas de alta densidad. */
export async function dibujarPagina(pdf, numero, canvas, anchoCss) {
  const pagina = await pdf.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  const escala = anchoCss / base.width;
  const densidad = Math.min(window.devicePixelRatio || 1, 2);
  const vista = pagina.getViewport({ scale: escala * densidad });
  canvas.width = Math.floor(vista.width);
  canvas.height = Math.floor(vista.height);
  canvas.style.width = `${Math.floor(vista.width / densidad)}px`;
  canvas.style.height = `${Math.floor(vista.height / densidad)}px`;
  const tarea = pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vista, canvas });
  await tarea.promise;
  return { ancho: vista.width / densidad, alto: vista.height / densidad, cancelar: () => tarea.cancel() };
}

/** Imagen JPEG en base64 de una página, para que Gemini la lea si está escaneada. */
export async function imagenDePagina(pdf, numero, anchoPx = 1600) {
  const pagina = await pdf.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  const vista = pagina.getViewport({ scale: Math.min(anchoPx / base.width, 3) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vista.width);
  canvas.height = Math.floor(vista.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: ctx, viewport: vista, canvas }).promise;
  const url = canvas.toDataURL('image/jpeg', 0.82);
  canvas.width = canvas.height = 0;
  return url.slice(url.indexOf(',') + 1);
}

/** Capa de texto seleccionable sobre la página (permite copiar y resaltar citas). */
export async function dibujarTextos(pdf, numero, contenedor, anchoCss) {
  const lib = await cargar();
  const pagina = await pdf.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  const vista = pagina.getViewport({ scale: anchoCss / base.width });
  contenedor.replaceChildren();
  contenedor.style.setProperty('--total-scale-factor', String(vista.scale));
  const capa = new lib.TextLayer({ textContentSource: pagina.streamTextContent(), container: contenedor, viewport: vista });
  await capa.render();
  return capa.textDivs;
}
