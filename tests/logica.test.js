import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logica.js';

const paginas = [
  { numero: 1, texto: 'La repetición espaciada distribuye las sesiones de estudio en el tiempo.\nAyuda a recordar a largo plazo.' },
  { numero: 2, texto: 'La práctica de recuperación consiste en intentar recordar sin mirar los apuntes. Es más efectiva que releer.' },
  { numero: 3, texto: 'El intercalado mezcla distintos tipos de problemas en una misma sesión.' },
];

test('limpiarTextoPagina une palabras cortadas con guion y espacios', () => {
  assert.equal(L.limpiarTextoPagina('estu-\ndiantes   aprenden\n\n\n\nmás'), 'estudiantes aprenden\n\nmás');
});

test('tokenizar quita tildes, vacías y plurales', () => {
  assert.deepEqual(L.tokenizar('Las técnicas de estudio más efectivas'), ['tecnica', 'estudio', 'efectiva']);
});

test('partirEnFragmentos no cruza páginas y respeta el tamaño', () => {
  const largo = { numero: 7, texto: 'Oración de prueba número uno. '.repeat(200) };
  const f = L.partirEnFragmentos('d1', [...paginas, largo], { tamano: 500, solape: 50 });
  assert.ok(f.every((x) => x.texto.length <= 500));
  assert.deepEqual([...new Set(f.map((x) => x.pagina))], [1, 2, 3, 7]);
  assert.ok(f.filter((x) => x.pagina === 7).length > 10);
  assert.ok(f.filter((x) => x.pagina === 7).every((x) => x.texto.endsWith('.')));
});

test('buscar (BM25) encuentra la página correcta', () => {
  const indice = L.crearIndice(L.partirEnFragmentos('d1', paginas));
  assert.equal(L.buscar(indice, '¿Qué es la práctica de recuperación?')[0].pagina, 2);
  assert.equal(L.buscar(indice, 'intercalar problemas')[0]?.pagina ?? 3, 3);
  assert.deepEqual(L.buscar(indice, 'el de la'), []);
});

test('elegirContexto manda todo si entra y fragmentos si no', () => {
  const docs = [{ id: 'd1', titulo: 'Guía', paginas }];
  const todo = L.elegirContexto(docs, 'recuperación');
  assert.equal(todo.modo, 'completo');
  assert.equal(todo.bloques.length, 3);
  const parcial = L.elegirContexto(docs, 'recuperación recordar', { presupuesto: 10, maxFragmentos: 1 });
  assert.equal(parcial.modo, 'fragmentos');
  assert.equal(parcial.bloques[0].pagina, 2);
  const ctx = L.formatearContexto(parcial.bloques);
  assert.match(ctx, /<fuente doc="d1" titulo="Guía" pagina="2">/);
});

test('verificarExtracto distingue exacta, aproximada y no encontrada', () => {
  const p = paginas[1].texto;
  assert.equal(L.verificarExtracto('consiste en intentar recordar sin mirar los apuntes', p), 'exacta');
  assert.equal(L.verificarExtracto('"Es más efectiva que releer."', p), 'exacta');
  assert.equal(L.verificarExtracto('La práctica de recuperación consiste en tratar de recordar sin mirar los apuntes', p), 'aproximada');
  assert.equal(L.verificarExtracto('La memoria funciona mejor de noche según estudios recientes', p), 'no-encontrada');
  assert.equal(L.verificarExtracto('', p), 'no-encontrada');
});

test('validarCitas descarta citas inválidas y renumera por aparición', () => {
  const mapa = L.mapaDePaginas([{ id: 'd1', paginas }]);
  const r = L.validarCitas('Primero esto [3]. Después [1, 9]. Inventado [2].', [
    { n: 1, doc: 'd1', pagina: 1, extracto: 'distribuye las sesiones de estudio en el tiempo' },
    { n: 2, doc: 'd1', pagina: 99, extracto: 'x' },
    { n: 3, doc: 'd1', pagina: 2, extracto: 'Es más efectiva que releer' },
    { n: 9, doc: 'otro', pagina: 1, extracto: 'x' },
  ], mapa);
  assert.equal(r.texto, 'Primero esto [1]. Después [2]. Inventado.');
  assert.deepEqual(r.citas.map((c) => [c.n, c.pagina, c.verificacion]), [[1, 2, 'exacta'], [2, 1, 'exacta']]);
});

test('markdownAHtml escapa HTML y arma listas y citas', () => {
  const html = L.markdownAHtml('Hola **mundo** <script>alert(1)</script> [2]\n\n- uno\n- dos *tres*\n\n1. a\n2. b');
  assert.match(html, /<p>Hola <strong>mundo<\/strong> &lt;script&gt;/);
  assert.match(html, /data-cita="2"/);
  assert.match(html, /<ul><li>uno<\/li><li>dos <em>tres<\/em><\/li><\/ul><ol><li>a<\/li><li>b<\/li><\/ol>/);
  assert.doesNotMatch(html, /<script>/);
});

test('validarRepaso filtra preguntas mal formadas', () => {
  const r = L.validarRepaso({
    preguntas: [
      { pregunta: 'ok', opciones: ['a', 'b', 'c', 'd'], correcta: 2, explicacion: '', pagina: 1 },
      { pregunta: 'tres opciones', opciones: ['a', 'b', 'c'], correcta: 0 },
      { pregunta: 'índice malo', opciones: ['a', 'b', 'c', 'd'], correcta: 4 },
      { pregunta: 'repetidas', opciones: ['a', 'a', 'c', 'd'], correcta: 0 },
    ],
    tarjetas: [{ frente: 'f', dorso: 'd', pagina: 1 }, { frente: '', dorso: 'x' }],
  });
  assert.equal(r.preguntas.length, 1);
  assert.equal(r.tarjetas.length, 1);
});

test('repaso espaciado (Leitner)', () => {
  const ahora = new Date(2026, 10, 16, 15).getTime();
  const dia = 86400000;
  let t = L.programarTarjeta({ id: 1 }, true, ahora);
  assert.equal(t.caja, 1);
  assert.equal(t.proxima, new Date(2026, 10, 17).getTime());
  t = L.programarTarjeta(t, true, ahora);
  assert.equal(t.caja, 2);
  t = L.programarTarjeta(t, false, ahora);
  assert.equal(t.caja, 1);
  assert.equal(t.repasos, 3); assert.equal(t.aciertos, 2);
  const lista = [{ id: 'a', caja: 2, proxima: ahora - dia }, { id: 'b' }, { id: 'c', proxima: ahora + dia }];
  assert.deepEqual(L.tarjetasPendientes(lista, ahora).map((x) => x.id), ['b', 'a']);
});

test('resultadoCuestionario', () => {
  const p = [{ correcta: 0, pagina: 3 }, { correcta: 1, pagina: 1 }, { correcta: 2, pagina: 3 }];
  assert.deepEqual(L.resultadoCuestionario(p, [0, 0, 1]), { correctas: 1, total: 3, porcentaje: 33, repasar: [1, 3] });
});

test('exportarMarkdown con notas al pie', () => {
  const md = L.exportarMarkdown({ titulo: 'G', nombreArchivo: 'g.pdf', paginas: 3 },
    { titulo: 'Guía', resumen: 'Algo [1] y más [5].', puntosClave: [{ texto: 'P', pagina: 2 }], citas: [{ n: 1, pagina: 1, extracto: 'x' }] },
    { terminos: [{ termino: 'T', definicion: 'D', pagina: 3 }] });
  assert.match(md, /^# Guía/);
  assert.match(md, /Algo \[\^1\] y más \./);
  assert.match(md, /\[\^1\]: p\. 1: "x"/);
  assert.match(md, /- \*\*T\*\*: D \(p\. 3\)/);
});

test('ordenarModelos prefiere Flash estable más nuevo', () => {
  const r = L.ordenarModelos(['gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemini-3.8-flash-tts',
    'gemini-embedding-2', 'gemini-3.6-flash', 'gemini-2.5-pro', 'gemini-flash-latest', 'gemini-3.1-flash-image']);
  assert.deepEqual(r, ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-pro', 'gemini-3.5-flash-lite', 'gemini-3-flash-preview']);
});

test('formatos', () => {
  assert.equal(L.formatearBytes(2_500_000), '2,4 MB');
  assert.equal(L.tituloDesdeArchivo('apunte_historia-argentina.PDF'), 'Apunte historia argentina');
  assert.equal(L.plural(1, 'página', 'páginas'), '1 página');
  const ahora = new Date(2026, 10, 16, 12).getTime();
  assert.equal(L.fechaRelativa(ahora - 3600e3, ahora), 'hoy');
  assert.equal(L.fechaRelativa(ahora - 86400e3, ahora), 'ayer');
  assert.equal(L.estimarTokens('abcdefgh'), 2);
});

test('partesDelExtracto ubica la cita en los spans de la página', async () => {
  const { partesDelExtracto } = await import('../js/resaltar.js');
  const partes = ['La práctica de ', 'recuperación consiste en intentar', ' recordar la información', ' sin mirar el material.', 'Otra cosa'];
  assert.deepEqual(partesDelExtracto(partes, 'consiste en intentar recordar la información'), [1, 2]);
  assert.deepEqual(partesDelExtracto(partes, 'práctica de recuperación consiste en intentar algo distinto que no está'), [0, 1]);
  assert.deepEqual(partesDelExtracto(partes, 'nada que ver con esto acá'), []);
});

test('tramosDelExtracto marca solo los caracteres citados', async () => {
  const { tramosDelExtracto } = await import('../js/resaltar.js');
  const partes = ['Esta guía resume cuatro técnicas: la práctica de ', 'recuperación y la repetición. Ninguna requiere talento.'];
  const t = tramosDelExtracto(partes, 'la práctica de recuperación y la repetición');
  assert.equal(partes[0].slice(t[0].desde, t[0].hasta), 'la práctica de');
  assert.equal(partes[1].slice(t[1].desde, t[1].hasta), 'recuperación y la repetición');
});
