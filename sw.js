// Guarda la aplicación para abrirla sin conexión (los pedidos a Gemini siempre van a la red).
const VERSION = 'margen-v2';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/margen.css',
  'js/app.js', 'js/ui.js', 'js/db.js', 'js/logica.js', 'js/gemini.js', 'js/lector.js', 'js/resaltar.js', 'js/servicio.js', 'js/demo.js', 'js/demo-paginas.js',
  'js/vistas/biblioteca.js', 'js/vistas/documento.js', 'js/vistas/preguntar.js', 'js/vistas/ajustes.js', 'js/vistas/conversacion.js', 'js/vistas/nota.js', 'js/vistas/visor.js',
  'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs',
  'fonts/lora.woff', 'fonts/lora-italica.woff', 'fonts/inter-regular.woff', 'fonts/inter-medium.woff', 'fonts/inter-semibold.woff',
  'assets/icono.svg', 'assets/ejemplo.pdf',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Primero la red (para recibir actualizaciones); si no hay conexión, lo guardado.
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
