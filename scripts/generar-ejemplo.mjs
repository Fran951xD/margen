// Genera assets/ejemplo.pdf y js/demo-paginas.js a partir de scripts/contenido-ejemplo.mjs.
// Uso: node scripts/generar-ejemplo.mjs   (requiere pdf-lib)
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { TITULO, SUBTITULO, PAGINAS, textoDePagina } from './contenido-ejemplo.mjs';

const require = createRequire(import.meta.url);
let PDFLib;
try { PDFLib = require('pdf-lib'); } catch { PDFLib = require('/opt/npm-tools/node_modules/pdf-lib'); }
const { PDFDocument, StandardFonts, rgb } = PDFLib;

const pdf = await PDFDocument.create();
pdf.setTitle(TITULO);
pdf.setAuthor('Margen (documento de ejemplo)');
const serif = await pdf.embedFont(StandardFonts.TimesRoman);
const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
const sans = await pdf.embedFont(StandardFonts.Helvetica);
const tinta = rgb(0.14, 0.15, 0.17);
const gris = rgb(0.42, 0.44, 0.48);

const A4 = [595.28, 841.89];
const margen = 72;
const ancho = A4[0] - margen * 2;

function lineas(texto, fuente, tam) {
  const palabras = texto.split(' ');
  const salida = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) > ancho) { salida.push(actual); actual = p; } else actual = prueba;
  }
  if (actual) salida.push(actual);
  return salida;
}

PAGINAS.forEach((p, i) => {
  const hoja = pdf.addPage(A4);
  let y = A4[1] - margen;
  if (i === 0) {
    for (const l of lineas(TITULO, negrita, 22)) { hoja.drawText(l, { x: margen, y, size: 22, font: negrita, color: tinta }); y -= 28; }
    hoja.drawText(SUBTITULO, { x: margen, y, size: 12, font: sans, color: gris }); y -= 40;
  }
  hoja.drawText(p.titulo, { x: margen, y, size: 15, font: negrita, color: tinta }); y -= 26;
  for (const parrafo of p.parrafos) {
    for (const l of lineas(parrafo, serif, 12)) { hoja.drawText(l, { x: margen, y, size: 12, font: serif, color: tinta }); y -= 17; }
    y -= 9;
  }
  hoja.drawText(`${i + 1}`, { x: A4[0] / 2 - 3, y: 40, size: 10, font: sans, color: gris });
});

writeFileSync(new URL('../assets/ejemplo.pdf', import.meta.url), await pdf.save());
const paginas = PAGINAS.map((p, i) => ({ numero: i + 1, texto: textoDePagina(p, i), origen: 'pdf' }));
writeFileSync(new URL('../js/demo-paginas.js', import.meta.url),
  `// Generado por scripts/generar-ejemplo.mjs. No editar a mano.\nexport const PAGINAS_EJEMPLO = ${JSON.stringify(paginas, null, 2)};\n`);
console.log('ok:', PAGINAS.length, 'páginas');
