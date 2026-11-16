import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO } from '../js/demo.js';
import { verificarExtracto, validarRepaso, validarCitas, mapaDePaginas } from '../js/logica.js';

const pagina = (n) => DEMO.paginas.find((p) => p.numero === n).texto;
const todasLasCitas = [...DEMO.analisis.citas, ...DEMO.respuestas.flatMap((r) => r.respuesta.citas)];

test('cada cita del ejemplo es textual en su página', () => {
  for (const c of todasLasCitas) assert.equal(verificarExtracto(c.extracto, pagina(c.pagina)), 'exacta', c.extracto);
});

test('los textos del ejemplo usan todas sus citas y ninguna de más', () => {
  const mapa = mapaDePaginas([{ id: 'ejemplo', paginas: DEMO.paginas }]);
  for (const { texto, citas } of [{ texto: DEMO.analisis.resumen, citas: DEMO.analisis.citas }, ...DEMO.respuestas.map((r) => r.respuesta)]) {
    const r = validarCitas(texto, citas, mapa);
    assert.equal(r.citas.length, citas.length);
    assert.equal(r.texto, texto);
  }
});

test('repaso de ejemplo bien formado', () => {
  const r = validarRepaso(DEMO.repaso);
  assert.equal(r.preguntas.length, DEMO.repaso.preguntas.length);
  assert.equal(r.tarjetas.length, DEMO.repaso.tarjetas.length);
  for (const p of [...DEMO.repaso.preguntas, ...DEMO.repaso.tarjetas, ...DEMO.glosario.terminos, ...DEMO.analisis.puntosClave]) {
    assert.ok(p.pagina >= 1 && p.pagina <= 5);
  }
});

test('las preguntas sugeridas tienen respuesta en el modo ejemplo', () => {
  const conRespuesta = new Set(DEMO.respuestas.map((r) => r.pregunta));
  for (const p of DEMO.analisis.preguntasSugeridas) assert.ok(conRespuesta.has(p), p);
});
