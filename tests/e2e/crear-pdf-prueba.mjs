// PDF de prueba: 2 páginas con texto y 1 "escaneada" (sin texto), para las pruebas punta a punta.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PDFLib = require('pdf-lib'); // devDependency: npm install
const { PDFDocument, StandardFonts, rgb } = PDFLib;
const pdf = await PDFDocument.create();
pdf.setTitle('Contrato de locación de prueba');
const f = await pdf.embedFont(StandardFonts.TimesRoman);
const textos = [
  ['CONTRATO DE LOCACIÓN', 'Cláusula primera. El plazo del contrato es de veinticuatro meses a partir de la firma.', 'Cláusula segunda. El precio mensual se actualiza cada seis meses según el índice acordado.'],
  ['Cláusula tercera. El depósito en garantía equivale a un mes de alquiler.', 'Cláusula cuarta. Las expensas ordinarias están a cargo del inquilino.'],
];
for (const lineas of textos) {
  const p = pdf.addPage([595, 842]);
  lineas.forEach((l, i) => p.drawText(l, { x: 60, y: 760 - i * 24, size: 12, font: f, color: rgb(0, 0, 0) }));
}
const escaneada = pdf.addPage([595, 842]);
escaneada.drawRectangle({ x: 60, y: 600, width: 400, height: 120, color: rgb(0.85, 0.85, 0.85) });
writeFileSync(process.argv[2] || 'tests/e2e/contrato.pdf', await pdf.save());
console.log('ok');
