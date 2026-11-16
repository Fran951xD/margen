// Almacenamiento local en IndexedDB. Nada sale del navegador salvo lo que se manda a Gemini.

const NOMBRE = 'margen';
const VERSION = 1;
let conexion;

function abrir() {
  if (conexion) return conexion;
  conexion = new Promise((ok, mal) => {
    const pedido = indexedDB.open(NOMBRE, VERSION);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      db.createObjectStore('documentos', { keyPath: 'id' });
      db.createObjectStore('archivos', { keyPath: 'id' });
      db.createObjectStore('paginas', { keyPath: ['docId', 'numero'] }).createIndex('porDoc', 'docId');
      db.createObjectStore('estudio', { keyPath: 'docId' }); // análisis, glosario, repaso, tarjetas
      db.createObjectStore('conversaciones', { keyPath: 'id' });
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => mal(pedido.error);
    pedido.onblocked = () => mal(new Error('Cerrá las otras pestañas de Margen y recargá.'));
  });
  return conexion;
}

function promesa(pedido) {
  return new Promise((ok, mal) => { pedido.onsuccess = () => ok(pedido.result); pedido.onerror = () => mal(pedido.error); });
}

async function transaccion(almacenes, modo, trabajo) {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const tx = db.transaction(almacenes, modo);
    let resultado;
    Promise.resolve(trabajo(tx)).then((r) => { resultado = r; }, (e) => { mal(e); try { tx.abort(); } catch { /* ya cerrada */ } });
    tx.oncomplete = () => ok(resultado);
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error || new Error('Operación cancelada'));
  });
}

export const db = {
  async documentos() {
    const lista = await transaccion(['documentos'], 'readonly', (tx) => promesa(tx.objectStore('documentos').getAll()));
    return lista.sort((a, b) => (b.abierto || b.creado) - (a.abierto || a.creado));
  },
  documento: (id) => transaccion(['documentos'], 'readonly', (tx) => promesa(tx.objectStore('documentos').get(id))),
  archivo: (id) => transaccion(['archivos'], 'readonly', (tx) => promesa(tx.objectStore('archivos').get(id))).then((r) => r?.blob),
  paginas: (docId) => transaccion(['paginas'], 'readonly', (tx) => promesa(tx.objectStore('paginas').index('porDoc').getAll(docId)))
    .then((l) => l.sort((a, b) => a.numero - b.numero)),
  estudio: (docId) => transaccion(['estudio'], 'readonly', (tx) => promesa(tx.objectStore('estudio').get(docId))).then((r) => r || { docId }),
  conversaciones: () => transaccion(['conversaciones'], 'readonly', (tx) => promesa(tx.objectStore('conversaciones').getAll()))
    .then((l) => l.sort((a, b) => b.actualizada - a.actualizada)),
  conversacion: (id) => transaccion(['conversaciones'], 'readonly', (tx) => promesa(tx.objectStore('conversaciones').get(id))),

  /** Guarda documento, archivo y páginas juntos: o se guarda todo o nada. */
  guardarDocumento(doc, blob, paginas) {
    return transaccion(['documentos', 'archivos', 'paginas'], 'readwrite', (tx) => {
      tx.objectStore('documentos').put(doc);
      if (blob) tx.objectStore('archivos').put({ id: doc.id, blob });
      for (const p of paginas || []) tx.objectStore('paginas').put({ docId: doc.id, numero: p.numero, texto: p.texto, origen: p.origen || 'pdf' });
    });
  },
  actualizarDocumento: (doc) => transaccion(['documentos'], 'readwrite', (tx) => { tx.objectStore('documentos').put(doc); }),
  guardarPaginas: (docId, paginas) => transaccion(['paginas'], 'readwrite', (tx) => {
    for (const p of paginas) tx.objectStore('paginas').put({ docId, numero: p.numero, texto: p.texto, origen: p.origen || 'pdf' });
  }),
  async actualizarEstudio(docId, cambios) {
    return transaccion(['estudio'], 'readwrite', async (tx) => {
      const almacen = tx.objectStore('estudio');
      const actual = (await promesa(almacen.get(docId))) || { docId };
      const nuevo = { ...actual, ...cambios };
      almacen.put(nuevo);
      return nuevo;
    });
  },
  guardarConversacion: (c) => transaccion(['conversaciones'], 'readwrite', (tx) => { tx.objectStore('conversaciones').put(c); }),
  borrarConversacion: (id) => transaccion(['conversaciones'], 'readwrite', (tx) => { tx.objectStore('conversaciones').delete(id); }),

  async borrarDocumento(id) {
    const paginas = await this.paginas(id);
    const conversaciones = await this.conversaciones();
    return transaccion(['documentos', 'archivos', 'paginas', 'estudio', 'conversaciones'], 'readwrite', (tx) => {
      tx.objectStore('documentos').delete(id);
      tx.objectStore('archivos').delete(id);
      tx.objectStore('estudio').delete(id);
      for (const p of paginas) tx.objectStore('paginas').delete([id, p.numero]);
      for (const c of conversaciones) {
        if (!c.docIds.includes(id)) continue;
        const resto = c.docIds.filter((d) => d !== id);
        if (resto.length) tx.objectStore('conversaciones').put({ ...c, docIds: resto });
        else tx.objectStore('conversaciones').delete(c.id);
      }
    });
  },

  borrarTodo: () => transaccion(['documentos', 'archivos', 'paginas', 'estudio', 'conversaciones'], 'readwrite', (tx) => {
    for (const n of ['documentos', 'archivos', 'paginas', 'estudio', 'conversaciones']) tx.objectStore(n).clear();
  }),

  async espacio() {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usado: usage, total: quota };
  },
};

// Ajustes simples en localStorage (la clave queda solo en este navegador).
const PREFIJO = 'margen.';
export const ajustes = {
  leer(nombre, porDefecto = null) {
    try { const v = localStorage.getItem(PREFIJO + nombre); return v == null ? porDefecto : JSON.parse(v); } catch { return porDefecto; }
  },
  guardar(nombre, valor) {
    try {
      if (valor == null || valor === '') localStorage.removeItem(PREFIJO + nombre);
      else localStorage.setItem(PREFIJO + nombre, JSON.stringify(valor));
    } catch { /* modo privado: queda en memoria esta sesión */ }
  },
};
