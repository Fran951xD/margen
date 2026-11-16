// Casos de uso: importar, leer escaneados, analizar, glosario, repaso y preguntas.
// Une lector (pdf.js), almacenamiento (IndexedDB) y Gemini, usando la lógica pura.
import { db, ajustes } from './db.js';
import { generar, MODELOS_RESPALDO, ErrorGemini } from './gemini.js';
import { abrirPdf, extraerPaginas, metadatos, paginasSinTexto, imagenDePagina } from './lector.js';
import * as L from './logica.js';
import { DEMO } from './demo.js';

export const LIMITE_MB = 60;

const id = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function claveGemini() { return ajustes.leer('clave', ''); }
export function hayClave() { return Boolean(claveGemini()); }

function modelos() {
  const elegido = ajustes.leer('modelo', '');
  const disponibles = ajustes.leer('modelosDisponibles', []);
  return [elegido, ...disponibles.slice(0, 3), ...MODELOS_RESPALDO].filter(Boolean);
}

function exigirClave() {
  const clave = claveGemini();
  if (!clave) throw new ErrorGemini('Conectá tu clave de Gemini en Ajustes para usar esta función.', { tipo: 'sin-clave' });
  return clave;
}

async function pedirAGemini(opciones) {
  const r = await generar({ clave: exigirClave(), modelos: modelos(), ...opciones });
  registrarUso(r.uso);
  return r;
}

function registrarUso(uso) {
  const hoy = new Date().toISOString().slice(0, 10);
  const actual = ajustes.leer('uso', {});
  const dia = actual.dia === hoy ? actual : { dia: hoy, pedidos: 0, tokens: 0 };
  ajustes.guardar('uso', { dia: hoy, pedidos: dia.pedidos + 1, tokens: dia.tokens + (uso.totalTokenCount || 0) });
}

// ---------------------------------------------------------------- Importar

/** Lee un PDF y lo guarda. `alAvanzar(texto, fraccion)`. Devuelve el documento creado. */
export async function importarPdf(archivo, { alAvanzar, contrasena } = {}) {
  if (!/pdf$/i.test(archivo.type) && !/\.pdf$/i.test(archivo.name)) throw new Error(`"${archivo.name}" no es un PDF.`);
  if (archivo.size > LIMITE_MB * 1024 * 1024) throw new Error(`"${archivo.name}" pesa más de ${LIMITE_MB} MB.`);
  const datos = await archivo.arrayBuffer();
  alAvanzar?.('Abriendo…', 0);
  const pdf = await abrirPdf(datos.slice(0), contrasena);
  try {
    const paginas = await extraerPaginas(pdf, (n, total) => alAvanzar?.(`Leyendo página ${n} de ${total}`, n / total));
    const meta = await metadatos(pdf);
    const vacias = paginasSinTexto(paginas);
    const doc = {
      id: id(),
      titulo: meta.titulo && meta.titulo.length > 3 && !/^(untitled|microsoft word|documento)/i.test(meta.titulo) ? meta.titulo : L.tituloDesdeArchivo(archivo.name),
      autor: meta.autor,
      nombreArchivo: archivo.name,
      tamano: archivo.size,
      paginas: pdf.numPages,
      paginasSinTexto: vacias,
      palabras: paginas.reduce((s, p) => s + (p.texto.match(/\S+/g)?.length || 0), 0),
      creado: Date.now(),
      abierto: Date.now(),
    };
    await db.guardarDocumento(doc, new Blob([datos], { type: 'application/pdf' }), paginas);
    return doc;
  } finally {
    pdf.destroy();
  }
}

/** Le pide a Gemini que transcriba las páginas escaneadas (sin texto). */
export async function leerEscaneadas(doc, { alAvanzar, senal } = {}) {
  const blob = await db.archivo(doc.id);
  const pdf = await abrirPdf(await blob.arrayBuffer());
  const pendientes = [...doc.paginasSinTexto];
  const leidas = [];
  try {
    for (let i = 0; i < pendientes.length; i++) {
      const n = pendientes[i];
      alAvanzar?.(`Leyendo con IA la página ${n} (${i + 1} de ${pendientes.length})`, i / pendientes.length);
      const imagen = await imagenDePagina(pdf, n);
      const { datos } = await pedirAGemini({
        senal,
        temperatura: 0,
        partes: [
          { inlineData: { mimeType: 'image/jpeg', data: imagen } },
          { text: 'Transcribí todo el texto de esta página escaneada, tal cual, respetando párrafos y títulos. Las tablas, como texto con " | ". Si no hay texto, devolvé exactamente: [página sin texto]. No agregues comentarios.' },
        ],
      });
      const pagina = { numero: n, texto: L.limpiarTextoPagina(String(datos).replace(/^\[página sin texto\]$/i, '')), origen: 'ocr' };
      await db.guardarPaginas(doc.id, [pagina]);
      leidas.push(n);
    }
  } finally {
    pdf.destroy();
    // Aunque se cancele a mitad de camino, lo leído queda registrado y no se vuelve a pedir.
    const actualizado = { ...doc, paginasSinTexto: pendientes.filter((n) => !leidas.includes(n)), paginasOcr: [...(doc.paginasOcr || []), ...leidas] };
    actualizado.palabras = (await db.paginas(doc.id)).reduce((s, p) => s + (p.texto.match(/\S+/g)?.length || 0), 0);
    await db.actualizarDocumento(actualizado);
    doc = actualizado;
  }
  return doc;
}

// ---------------------------------------------------------------- Análisis del documento

async function documentoConPaginas(doc) {
  return { id: doc.id, titulo: doc.titulo, paginas: await db.paginas(doc.id) };
}

/** Para análisis de documentos enormes, usa los fragmentos más representativos de cada parte. */
function contextoDeDocumento(d, presupuesto = 180000) {
  const total = d.paginas.reduce((s, p) => s + L.estimarTokens(p.texto), 0);
  if (total <= presupuesto) return L.formatearContexto(d.paginas.filter((p) => p.texto.trim()).map((p) => ({ docId: d.id, titulo: d.titulo, pagina: p.numero, texto: p.texto })));
  // Recorte uniforme: el comienzo de cada página, para cubrir todo el documento.
  const porPagina = Math.max(200, Math.floor((presupuesto * 4) / d.paginas.length));
  return L.formatearContexto(d.paginas.filter((p) => p.texto.trim()).map((p) => ({ docId: d.id, titulo: d.titulo, pagina: p.numero, texto: p.texto.slice(0, porPagina) })));
}

function esDemo(doc) { return doc.demo === true; }

export async function analizar(doc, { nivel = ajustes.leer('nivel', 'normal'), senal, alAvisar } = {}) {
  if (esDemo(doc) && !hayClave()) return db.actualizarEstudio(doc.id, { analisis: DEMO.analisis });
  const d = await documentoConPaginas(doc);
  const { datos, modelo } = await pedirAGemini({ senal, alAvisar, esquema: L.ESQUEMAS.analisis, partes: [{ text: L.promptAnalisis(contextoDeDocumento(d), nivel) }] });
  const { texto, citas } = L.validarCitas(datos.resumen, datos.citas, L.mapaDePaginas([d]));
  const paginasValidas = new Set(d.paginas.map((p) => p.numero));
  const analisis = {
    ...datos,
    resumen: texto,
    citas,
    puntosClave: (datos.puntosClave || []).filter((p) => p.texto).map((p) => ({ ...p, pagina: paginasValidas.has(p.pagina) ? p.pagina : null })),
    nivel, modelo, creado: Date.now(),
  };
  return db.actualizarEstudio(doc.id, { analisis });
}

export async function crearGlosario(doc, { senal, alAvisar } = {}) {
  if (esDemo(doc) && !hayClave()) return db.actualizarEstudio(doc.id, { glosario: DEMO.glosario });
  const d = await documentoConPaginas(doc);
  const { datos, modelo } = await pedirAGemini({ senal, alAvisar, esquema: L.ESQUEMAS.glosario, partes: [{ text: L.promptGlosario(contextoDeDocumento(d)) }] });
  const terminos = (datos.terminos || []).filter((t) => t.termino && t.definicion)
    .sort((a, b) => a.termino.localeCompare(b.termino, 'es', { sensitivity: 'base' }));
  return db.actualizarEstudio(doc.id, { glosario: { terminos, modelo, creado: Date.now() } });
}

export async function crearRepaso(doc, { senal, alAvisar } = {}) {
  let preguntas, tarjetas, modelo = 'demo';
  if (esDemo(doc) && !hayClave()) ({ preguntas, tarjetas } = DEMO.repaso);
  else {
    const d = await documentoConPaginas(doc);
    const r = await pedirAGemini({ senal, alAvisar, temperatura: 0.5, esquema: L.ESQUEMAS.repaso, partes: [{ text: L.promptRepaso(contextoDeDocumento(d)) }] });
    ({ preguntas, tarjetas } = L.validarRepaso(r.datos));
    modelo = r.modelo;
    if (!preguntas.length && !tarjetas.length) throw new ErrorGemini('Gemini no pudo armar preguntas con este documento. Probá de nuevo.', { tipo: 'json' });
  }
  const estudio = await db.estudio(doc.id);
  const previas = estudio.tarjetas || [];
  const vistas = new Set(previas.map((t) => L.sinTildes(t.frente).toLowerCase().trim()));
  const nuevas = tarjetas.filter((t) => !vistas.has(L.sinTildes(t.frente).toLowerCase().trim())).map((t) => ({ ...t, id: id(), caja: 0, proxima: 0 }));
  return db.actualizarEstudio(doc.id, {
    repaso: { preguntas, modelo, creado: Date.now() },
    tarjetas: [...previas, ...nuevas],
  });
}

export async function calificarTarjeta(docId, tarjetaId, acerto) {
  const estudio = await db.estudio(docId);
  const tarjetas = (estudio.tarjetas || []).map((t) => (t.id === tarjetaId ? L.programarTarjeta(t, acerto) : t));
  return db.actualizarEstudio(docId, { tarjetas });
}

export async function guardarResultadoCuestionario(docId, resultado) {
  const estudio = await db.estudio(docId);
  const historial = [...(estudio.cuestionarios || []), { ...resultado, fecha: Date.now() }].slice(-20);
  return db.actualizarEstudio(docId, { cuestionarios: historial });
}

// ---------------------------------------------------------------- Preguntas

/**
 * Responde una pregunta sobre uno o varios documentos y guarda la conversación.
 * Devuelve la conversación actualizada.
 */
export async function preguntar({ conversacion, docIds, pregunta, senal, alAvisar }) {
  const docs = (await Promise.all(docIds.map((i) => db.documento(i)))).filter(Boolean);
  if (!docs.length) throw new Error('Elegí al menos un documento.');
  const conv = conversacion || { id: id(), docIds, mensajes: [], creada: Date.now() };
  const historial = conv.mensajes.map((m) => ({ rol: m.rol, texto: m.texto }));
  conv.mensajes = [...conv.mensajes, { rol: 'usuario', texto: pregunta, fecha: Date.now() }];
  conv.docIds = docIds;
  conv.titulo = conv.titulo || pregunta.slice(0, 80);

  let respuesta;
  const demo = docs.every(esDemo) && !hayClave();
  if (demo) {
    const r = DEMO.respuestas.find((x) => L.sinTildes(x.pregunta).toLowerCase() === L.sinTildes(pregunta.trim()).toLowerCase());
    respuesta = r
      ? { rol: 'margen', ...r.respuesta, modo: 'completo', fecha: Date.now(), modelo: 'demo' }
      : { rol: 'margen', texto: 'En el modo de ejemplo solo puedo responder las preguntas sugeridas. Conectá tu clave de Gemini (gratis) en Ajustes para preguntar lo que quieras sobre tus documentos.', citas: [], encontrado: false, seguimiento: DEMO.respuestas.map((x) => x.pregunta), fecha: Date.now(), modelo: 'demo', aviso: true };
  } else {
    const conPaginas = await Promise.all(docs.map(documentoConPaginas));
    const contexto = L.elegirContexto(conPaginas, `${historial.filter((m) => m.rol === 'usuario').slice(-1).map((m) => m.texto).join(' ')} ${pregunta}`);
    if (!contexto.bloques.length) throw new Error('Estos documentos no tienen texto legible. Si son escaneados, abrilos y usá "Leer con IA".');
    const { datos, modelo } = await pedirAGemini({
      senal, alAvisar,
      esquema: L.ESQUEMAS.respuesta,
      partes: [{ text: L.promptPregunta(L.formatearContexto(contexto.bloques), pregunta, historial) }],
    });
    const { texto, citas } = L.validarCitas(datos.respuesta, datos.citas, L.mapaDePaginas(conPaginas));
    respuesta = {
      rol: 'margen', texto, citas, encontrado: datos.encontrado !== false,
      seguimiento: (datos.seguimiento || []).slice(0, 3), modo: contexto.modo, fecha: Date.now(), modelo,
    };
  }
  conv.mensajes.push(respuesta);
  conv.actualizada = Date.now();
  await db.guardarConversacion(conv);
  return conv;
}

// ---------------------------------------------------------------- Ejemplo

export async function cargarEjemplo() {
  const existente = (await db.documentos()).find(esDemo);
  if (existente) return existente;
  const r = await fetch(new URL('../assets/ejemplo.pdf', import.meta.url));
  const blob = await r.blob();
  const doc = { ...DEMO.documento, id: 'ejemplo', creado: Date.now(), abierto: Date.now(), tamano: blob.size };
  await db.guardarDocumento(doc, blob, DEMO.paginas);
  return doc;
}
