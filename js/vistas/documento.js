// Documento: visor del PDF a la izquierda y la mesa de estudio a la derecha.
import { el, icono, avisar, confirmar, trabajando, cajaError } from '../ui.js';
import { db, ajustes } from '../db.js';
import * as S from '../servicio.js';
import { plural, exportarMarkdown, estimarTokens, tarjetasPendientes, resultadoCuestionario } from '../logica.js';
import { crearVisor } from './visor.js';
import { nota } from './nota.js';
import { panelConversacion } from './conversacion.js';

const PESTANAS = [
  { id: 'resumen', texto: 'Resumen' },
  { id: 'glosario', texto: 'Glosario' },
  { id: 'repaso', texto: 'Repaso' },
  { id: 'preguntas', texto: 'Preguntas' },
];

export async function vistaDocumento(raiz, { id, pestana = 'resumen', ir }) {
  let doc = await db.documento(id);
  if (!doc) {
    raiz.replaceChildren(el('div', { class: 'vacio' }, el('h1', {}, 'No encontramos ese documento'), el('p', {}, 'Puede que lo hayas borrado.'), el('a', { class: 'boton boton--primario', href: '#/' }, 'Volver a la biblioteca')));
    return;
  }
  doc = { ...doc, abierto: Date.now() };
  db.actualizarDocumento(doc);
  document.title = `${doc.titulo} · Margen`;

  const visor = crearVisor(doc);
  const panel = el('div', { class: 'estudio__panel', role: 'tabpanel', tabindex: '0' });
  let controlador = null; // para cancelar pedidos en curso al cambiar de pestaña
  let actual = PESTANAS.some((p) => p.id === pestana) ? pestana : 'resumen';
  let conversacion = null;

  const pestanas = el('div', { class: 'pestanas', role: 'tablist', 'aria-label': 'Herramientas de estudio' }, PESTANAS.map((p) => el('button', {
    type: 'button', role: 'tab', id: `pestana-${p.id}`, class: 'pestana', 'aria-controls': 'panel-estudio',
    onclick: () => cambiar(p.id), onkeydown: moverConFlechas,
  }, p.texto)));
  panel.id = 'panel-estudio';

  const alIr = (c) => { mostrarVisorEnMovil(); visor.irA(c.pagina, c.extracto); };

  const aviso = doc.paginasSinTexto?.length ? avisoEscaneado() : null;
  const conmutador = el('button', { type: 'button', class: 'boton boton--secundario conmutar-visor', 'aria-expanded': 'false', onclick: () => alternarVisor() }, icono('pagina'), 'Ver PDF');

  raiz.replaceChildren(el('div', { class: 'documento' },
    el('header', { class: 'documento__cabecera' },
      el('a', { class: 'boton-icono', href: '#/', 'aria-label': 'Volver a la biblioteca' }, icono('atras')),
      el('div', { class: 'documento__titulos' },
        el('h1', { class: 'documento__titulo' }, doc.titulo),
        el('p', { class: 'documento__meta' }, plural(doc.paginas, 'página', 'páginas'), doc.autor ? `, ${doc.autor}` : '')),
      el('div', { class: 'documento__acciones' },
        conmutador,
        el('button', { type: 'button', class: 'boton boton--secundario', onclick: exportar }, icono('descargar'), el('span', { class: 'ocultar-movil' }, 'Exportar')),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Borrar documento', onclick: borrar }, icono('basura')))),
    aviso,
    el('div', { class: 'documento__cuerpo' }, visor.nodo, el('section', { class: 'estudio', 'aria-label': 'Estudio' }, pestanas, panel)),
  ));

  await cambiar(actual, { enfocar: false });

  // Limpieza cuando se sale de la vista.
  return () => { controlador?.abort(); visor.destruir(); };

  // --------------------------------------------------------------------------------

  async function cambiar(id, { enfocar = true } = {}) {
    controlador?.abort();
    controlador = new AbortController();
    actual = id;
    for (const b of pestanas.children) {
      const activa = b.id === `pestana-${id}`;
      b.setAttribute('aria-selected', String(activa));
      b.tabIndex = activa ? 0 : -1;
      if (activa && enfocar) b.focus();
    }
    panel.setAttribute('aria-labelledby', `pestana-${id}`);
    history.replaceState(null, '', `#/doc/${doc.id}/${id}`);
    const estudio = await db.estudio(doc.id);
    ({ resumen: panelResumen, glosario: panelGlosario, repaso: panelRepaso, preguntas: panelPreguntas })[id](estudio);
  }

  function moverConFlechas(e) {
    const i = PESTANAS.findIndex((p) => p.id === actual);
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: PESTANAS.length - 1 }[e.key];
    if (destino == null) return;
    e.preventDefault();
    cambiar(PESTANAS[(destino + PESTANAS.length) % PESTANAS.length].id);
  }

  /** Corre un pedido a Gemini mostrando progreso y errores, y vuelve a dibujar la pestaña al terminar. */
  async function ejecutar(texto, tarea) {
    const t = trabajando(texto, { alCancelar: () => controlador?.abort() });
    panel.replaceChildren(t);
    const senal = controlador.signal;
    try {
      await tarea({ senal, alAvisar: (m) => t.actualizar(m) });
      if (!senal.aborted) cambiar(actual, { enfocar: false });
    } catch (e) {
      if (e.name === 'AbortError') { cambiar(actual, { enfocar: false }); return; }
      panel.replaceChildren(cajaError(e, { reintentar: () => ejecutar(texto, tarea) }));
    }
  }

  function invitacion({ titulo, texto, boton, alHacer, extra = null }) {
    return el('div', { class: 'invitacion' },
      el('h2', {}, titulo),
      el('p', { class: 'lectura' }, texto),
      extra,
      el('button', { type: 'button', class: 'boton boton--primario', onclick: alHacer }, boton),
      !S.hayClave() && !doc.demo ? el('p', { class: 'invitacion__nota' }, 'Necesitás conectar tu clave de Gemini. ', el('a', { href: '#/ajustes' }, 'Conectar')) : null);
  }

  // ------------------------------------------------------------------ Resumen

  function panelResumen(estudio) {
    const a = estudio.analisis;
    if (!a) {
      const nivel = el('select', { class: 'entrada entrada--chica', id: 'nivel' },
        [['breve', 'Breve'], ['normal', 'Normal'], ['detallado', 'Detallado']].map(([v, t]) => el('option', { value: v, selected: v === ajustes.leer('nivel', 'normal') }, t)));
      const tokens = estimarTokens('x'.repeat((doc.palabras || 0) * 6));
      panel.replaceChildren(invitacion({
        titulo: 'Resumen con fuentes',
        texto: `Margen lee ${doc.paginas === 1 ? 'la página' : `las ${doc.paginas} páginas`} y te arma un resumen, los puntos clave y las preguntas que conviene hacerse, con la página de cada cosa.`,
        extra: el('div', { class: 'invitacion__opciones' },
          el('label', { for: 'nivel' }, 'Nivel de detalle'), nivel,
          tokens > 150000 ? el('p', { class: 'invitacion__nota' }, 'Documento muy largo: el resumen se arma con una muestra de cada página.') : null),
        boton: 'Resumir este documento',
        alHacer: () => { ajustes.guardar('nivel', nivel.value); ejecutar('Leyendo el documento…', (o) => S.analizar(doc, { nivel: nivel.value, ...o })); },
      }));
      return;
    }
    panel.replaceChildren(
      el('div', { class: 'resumen' },
        el('div', { class: 'resumen__temas' }, el('span', { class: 'sello' }, capital(a.tipo)), (a.temas || []).map((t) => el('span', { class: 'tema' }, t))),
        el('h2', { class: 'titulo-seccion' }, 'Resumen'),
        nota({ texto: a.resumen, citas: a.citas, alIr }),
        el('h2', { class: 'titulo-seccion' }, 'Puntos clave'),
        el('ul', { class: 'puntos' }, a.puntosClave.map((p) => el('li', {},
          el('span', { class: 'lectura' }, p.texto),
          p.pagina ? el('button', { type: 'button', class: 'pagina-ref', onclick: () => alIr({ pagina: p.pagina }), 'aria-label': `Ir a la página ${p.pagina}` }, `p. ${p.pagina}`) : null))),
        a.preguntasSugeridas?.length ? el('div', { class: 'sugeridas' },
          el('h2', { class: 'titulo-seccion' }, 'Preguntas para hacerle'),
          el('div', { class: 'sugeridas__lista' }, a.preguntasSugeridas.map((q) => el('button', { type: 'button', class: 'sugerencia', onclick: () => preguntarDesdeResumen(q) }, q)))) : null,
        pie(a, () => ejecutar('Rehaciendo el resumen…', (o) => S.analizar(doc, { nivel: a.nivel, ...o }))),
      ));
  }

  function preguntarDesdeResumen(q) {
    cambiar('preguntas').then(() => panel.querySelector('textarea')?.dispatchEvent(new CustomEvent('preguntar', { detail: q })));
  }

  // ------------------------------------------------------------------ Glosario

  function panelGlosario(estudio) {
    const g = estudio.glosario;
    if (!g) {
      panel.replaceChildren(invitacion({
        titulo: 'Glosario del documento',
        texto: 'Los términos técnicos, siglas y conceptos propios del texto, definidos como los usa el documento y con la página donde aparecen.',
        boton: 'Armar glosario',
        alHacer: () => ejecutar('Buscando los términos importantes…', (o) => S.crearGlosario(doc, o)),
      }));
      return;
    }
    const filtro = el('input', { type: 'search', class: 'entrada', placeholder: 'Buscar un término', 'aria-label': 'Buscar en el glosario' });
    const lista = el('dl', { class: 'glosario' });
    const dibujar = () => {
      const q = filtro.value.trim().toLowerCase();
      const visibles = g.terminos.filter((t) => !q || `${t.termino} ${t.definicion}`.toLowerCase().includes(q));
      lista.replaceChildren(...(visibles.length ? visibles.map((t) => el('div', { class: 'glosario__item' },
        el('dt', {}, t.termino),
        el('dd', { class: 'lectura' }, t.definicion, ' ', el('button', { type: 'button', class: 'pagina-ref', onclick: () => alIr({ pagina: t.pagina, extracto: t.termino }) }, `p. ${t.pagina}`)))) : [el('p', { class: 'vacio-chico' }, 'Ningún término coincide.')]));
    };
    filtro.addEventListener('input', dibujar);
    dibujar();
    panel.replaceChildren(el('div', {}, el('div', { class: 'barra-panel' }, el('h2', { class: 'titulo-seccion' }, plural(g.terminos.length, 'término', 'términos')), filtro), lista,
      pie(g, () => ejecutar('Rehaciendo el glosario…', (o) => S.crearGlosario(doc, o)))));
  }

  // ------------------------------------------------------------------ Repaso

  function panelRepaso(estudio) {
    if (!estudio.repaso) {
      panel.replaceChildren(invitacion({
        titulo: 'Repaso activo',
        texto: 'Un cuestionario de opción múltiple y tarjetas de memoria sobre el documento. Recordar sin mirar es la forma más efectiva de estudiar, y las tarjetas vuelven justo cuando estás por olvidarlas.',
        boton: 'Crear preguntas',
        alHacer: () => ejecutar('Escribiendo preguntas…', (o) => S.crearRepaso(doc, o)),
      }));
      return;
    }
    const tarjetasHoy = tarjetasPendientes(estudio.tarjetas || []);
    const ultimo = (estudio.cuestionarios || []).slice(-1)[0];
    panel.replaceChildren(el('div', { class: 'repaso' },
      el('div', { class: 'repaso__opciones' },
        el('button', { type: 'button', class: 'opcion-repaso', onclick: () => cuestionario(estudio.repaso.preguntas) },
          el('strong', {}, 'Cuestionario'),
          el('span', {}, plural(estudio.repaso.preguntas.length, 'pregunta', 'preguntas')),
          ultimo ? el('span', { class: 'opcion-repaso__dato' }, `Último: ${ultimo.correctas} de ${ultimo.total}`) : null),
        el('button', { type: 'button', class: 'opcion-repaso', disabled: !tarjetasHoy.length, onclick: () => tarjetas(tarjetasHoy) },
          el('strong', {}, 'Tarjetas'),
          el('span', {}, tarjetasHoy.length ? plural(tarjetasHoy.length, 'para hoy', 'para hoy') : 'Nada pendiente hoy'),
          el('span', { class: 'opcion-repaso__dato' }, `${(estudio.tarjetas || []).filter((t) => t.caja >= 3).length} de ${(estudio.tarjetas || []).length} bien aprendidas`))),
      cajasLeitner(estudio.tarjetas || []),
      pie({ ...estudio.repaso }, () => ejecutar('Escribiendo más preguntas…', (o) => S.crearRepaso(doc, o)), 'Crear más preguntas')));
  }

  function cajasLeitner(lista) {
    const cajas = [0, 1, 2, 3, 4, 5].map((c) => lista.filter((t) => (t.caja || 0) === c).length);
    const total = lista.length || 1;
    const nombres = ['Nuevas', 'Mañana', '3 días', '1 semana', '16 días', '35 días'];
    return el('figure', { class: 'cajas' },
      el('figcaption', {}, 'Dónde está cada tarjeta'),
      el('div', { class: 'cajas__barras' }, cajas.map((n, i) => el('div', { class: 'cajas__caja' },
        el('span', { class: 'cajas__barra', style: `--alto:${Math.round((n / total) * 100)}%` }),
        el('span', { class: 'cajas__n' }, String(n)),
        el('span', { class: 'cajas__nombre' }, nombres[i])))));
  }

  function cuestionario(preguntas) {
    const respuestas = [];
    let i = 0;
    const mostrar = () => {
      if (i >= preguntas.length) return final();
      const p = preguntas[i];
      let elegida = null;
      const explicacion = el('div', { class: 'explicacion', hidden: true, 'aria-live': 'polite' });
      const siguiente = el('button', { type: 'button', class: 'boton boton--primario', hidden: true, onclick: () => { i++; mostrar(); } }, i === preguntas.length - 1 ? 'Ver resultado' : 'Siguiente');
      const opciones = el('div', { class: 'opciones', role: 'radiogroup', 'aria-labelledby': 'pregunta-actual' }, p.opciones.map((o, k) => el('button', {
        type: 'button', class: 'opcion', role: 'radio', 'aria-checked': 'false',
        onclick: (e) => {
          if (elegida != null) return;
          elegida = k;
          respuestas[i] = k;
          for (const [j, b] of [...opciones.children].entries()) {
            b.disabled = true;
            if (j === p.correcta) b.classList.add('opcion--correcta');
            if (j === k) b.setAttribute('aria-checked', 'true');
          }
          if (k !== p.correcta) e.currentTarget.classList.add('opcion--incorrecta');
          explicacion.replaceChildren(
            el('strong', {}, k === p.correcta ? 'Correcto. ' : `La correcta es "${p.opciones[p.correcta]}". `),
            el('span', {}, p.explicacion, ' '),
            el('button', { type: 'button', class: 'pagina-ref', onclick: () => alIr({ pagina: p.pagina }) }, `p. ${p.pagina}`));
          explicacion.hidden = false;
          siguiente.hidden = false;
          siguiente.focus();
        },
      }, el('span', { class: 'opcion__letra', 'aria-hidden': 'true' }, 'ABCD'[k]), el('span', {}, o))));
      panel.replaceChildren(el('div', { class: 'cuestionario' },
        el('div', { class: 'cuestionario__avance' }, el('span', {}, `Pregunta ${i + 1} de ${preguntas.length}`),
          el('progress', { max: preguntas.length, value: i, 'aria-label': 'Avance' }),
          el('button', { type: 'button', class: 'boton boton--texto', onclick: () => cambiar('repaso', { enfocar: false }) }, 'Salir')),
        el('h2', { class: 'cuestionario__pregunta', id: 'pregunta-actual', tabindex: '-1' }, p.pregunta),
        opciones, explicacion, siguiente));
      panel.querySelector('#pregunta-actual').focus();
    };
    const final = async () => {
      const r = resultadoCuestionario(preguntas, respuestas);
      await S.guardarResultadoCuestionario(doc.id, r);
      panel.replaceChildren(el('div', { class: 'resultado' },
        el('p', { class: 'resultado__nota' }, el('span', { class: 'resultado__numero' }, `${r.correctas}`), ` de ${r.total}`),
        el('p', { class: 'lectura' }, r.porcentaje >= 80 ? 'Muy bien. Para fijarlo, volvé a hacerlo en unos días.' : r.porcentaje >= 50 ? 'Vas bien. Repasá las páginas de las que fallaste y probá de nuevo mañana.' : 'Conviene volver al texto. Empezá por estas páginas.'),
        r.repasar.length ? el('div', { class: 'resultado__paginas' }, el('span', {}, 'Para repasar:'), r.repasar.map((n) => el('button', { type: 'button', class: 'pagina-ref', onclick: () => alIr({ pagina: n }) }, `p. ${n}`))) : null,
        el('div', { class: 'resultado__acciones' },
          el('button', { type: 'button', class: 'boton boton--primario', onclick: () => cuestionario(mezclar(preguntas)) }, 'Hacerlo de nuevo'),
          el('button', { type: 'button', class: 'boton boton--secundario', onclick: () => cambiar('repaso', { enfocar: false }) }, 'Volver al repaso'))));
    };
    mostrar();
  }

  function tarjetas(lista) {
    let i = 0;
    let bien = 0;
    const mostrar = () => {
      if (i >= lista.length) {
        panel.replaceChildren(el('div', { class: 'resultado' },
          el('p', { class: 'resultado__nota' }, el('span', { class: 'resultado__numero' }, String(bien)), ` de ${lista.length}`),
          el('p', { class: 'lectura' }, 'Listo por hoy. Las que no recordaste vuelven mañana; las otras, más adelante.'),
          el('button', { type: 'button', class: 'boton boton--primario', onclick: () => cambiar('repaso', { enfocar: false }) }, 'Volver al repaso')));
        return;
      }
      const t = lista[i];
      const dorso = el('div', { class: 'tarjeta__dorso', hidden: true }, el('p', { class: 'lectura' }, t.dorso),
        el('button', { type: 'button', class: 'pagina-ref', onclick: () => alIr({ pagina: t.pagina }) }, `p. ${t.pagina}`));
      const calificar = el('div', { class: 'tarjeta__calificar', hidden: true },
        el('button', { type: 'button', class: 'boton boton--secundario', onclick: () => responder(false) }, 'No me acordaba'),
        el('button', { type: 'button', class: 'boton boton--primario', onclick: () => responder(true) }, 'Me acordaba'));
      const girar = el('button', { type: 'button', class: 'boton boton--primario', onclick: () => { dorso.hidden = false; calificar.hidden = false; girar.hidden = true; calificar.lastChild.focus(); } }, 'Mostrar respuesta');
      const responder = async (acerto) => { if (acerto) bien++; await S.calificarTarjeta(doc.id, t.id, acerto); i++; mostrar(); };
      panel.replaceChildren(el('div', { class: 'tarjetas' },
        el('div', { class: 'cuestionario__avance' }, el('span', {}, `Tarjeta ${i + 1} de ${lista.length}`),
          el('progress', { max: lista.length, value: i, 'aria-label': 'Avance' }),
          el('button', { type: 'button', class: 'boton boton--texto', onclick: () => cambiar('repaso', { enfocar: false }) }, 'Salir')),
        el('article', { class: 'tarjeta' }, el('p', { class: 'tarjeta__frente' }, t.frente), dorso),
        el('p', { class: 'tarjeta__ayuda' }, 'Intentá responder en voz alta o en una hoja antes de ver la respuesta.'),
        girar, calificar));
      girar.focus();
    };
    mostrar();
  }

  // ------------------------------------------------------------------ Preguntas

  async function panelPreguntas() {
    const previas = (await db.conversaciones()).filter((c) => c.docIds.length === 1 && c.docIds[0] === doc.id);
    conversacion = conversacion || previas[0] || null;
    panel.replaceChildren(panelConversacion({
      docIds: [doc.id],
      titulos: null,
      conversacion,
      sugerencias: (await db.estudio(doc.id)).analisis?.preguntasSugeridas || (doc.demo ? ['¿Por qué releer no funciona tan bien?', '¿Qué es el intercalado?'] : []),
      alIr,
      alCambiar: (c) => { conversacion = c; },
      senal: () => controlador.signal,
    }));
  }

  // ------------------------------------------------------------------ Otros

  function pie(dato, rehacer, textoRehacer = 'Rehacer') {
    return el('footer', { class: 'pie-panel' },
      el('span', {}, dato.modelo === 'demo' ? 'Resultado de ejemplo' : `Hecho con ${dato.modelo || 'Gemini'}`),
      el('button', { type: 'button', class: 'boton boton--texto', onclick: rehacer }, icono('girar', { tamano: 16 }), textoRehacer));
  }

  function avisoEscaneado() {
    const n = doc.paginasSinTexto.length;
    const nodo = el('div', { class: 'aviso-fijo aviso-fijo--escaneado' },
      el('p', {}, `${plural(n, 'página no tiene', 'páginas no tienen')} texto: parecen escaneadas. Gemini puede leerlas para que también entren en el resumen y las respuestas.`),
      el('button', {
        type: 'button', class: 'boton boton--primario',
        onclick: async () => {
          const t = trabajando('Preparando…', { alCancelar: () => ctrl.abort() });
          const ctrl = new AbortController();
          nodo.replaceChildren(t);
          try {
            doc = await S.leerEscaneadas(doc, { senal: ctrl.signal, alAvanzar: (m) => t.actualizar(m) });
            nodo.remove();
            avisar('Listo: ya se puede buscar y resumir todo el documento.');
          } catch (e) {
            nodo.replaceChildren(cajaError(e.name === 'AbortError' ? { message: 'Lectura cancelada. Lo que ya se leyó quedó guardado.' } : e));
          }
        },
      }, `Leer ${n === 1 ? 'la página' : `las ${n} páginas`} con IA`));
    return nodo;
  }

  async function exportar() {
    const estudio = await db.estudio(doc.id);
    if (!estudio.analisis && !estudio.glosario) { avisar('Primero creá un resumen o un glosario para exportar.', { tipo: 'info' }); return; }
    const md = exportarMarkdown(doc, estudio.analisis, estudio.glosario);
    const enlace = el('a', { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: `${doc.titulo.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80)} - resumen.md` });
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 5000);
    avisar('Resumen exportado en Markdown.');
  }

  async function borrar() {
    if (!await confirmar(`¿Borrar "${doc.titulo}"?`, 'Se borran el PDF, el resumen, el repaso y las conversaciones que lo usan. No se puede deshacer.', { texto: 'Borrar', peligro: true })) return;
    await db.borrarDocumento(doc.id);
    avisar('Documento borrado.');
    ir('#/');
  }

  function alternarVisor(forzar) {
    const cuerpo = raiz.querySelector('.documento__cuerpo');
    const abierto = forzar ?? !cuerpo.classList.contains('documento__cuerpo--visor');
    cuerpo.classList.toggle('documento__cuerpo--visor', abierto);
    conmutador.setAttribute('aria-expanded', String(abierto));
    conmutador.lastChild.textContent = abierto ? 'Ver estudio' : 'Ver PDF';
  }

  function mostrarVisorEnMovil() {
    if (matchMedia('(max-width: 59.99rem)').matches) alternarVisor(true);
  }
}

function capital(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Documento'; }

function mezclar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copia[i], copia[j]] = [copia[j], copia[i]]; }
  return copia;
}
