/* Service worker: deixa o app abrir sem internet (dentro do mercado o sinal cai).
   Só guarda os arquivos do app — a lista em si fica no IndexedDB do aparelho. */

var CACHE = 'compras-v4';

/* O motor de leitura (vendor/ocr, ~4 MB por aparelho) fica FORA desta lista de
   propósito: ele é guardado pelo tratador de fetch na primeira vez que o usuário
   pede para ler uma foto, para a instalação do app continuar leve. */
var ARQUIVOS = [
  './',
  './index.html',
  './css/styles.css',
  './js/db.js',
  './js/texto.js',
  './js/ocr.js',
  './js/nuvem.js',
  './js/app.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-180.png',
  './assets/favicon.png'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ARQUIVOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (nome) {
        return nome === CACHE ? null : caches.delete(nome);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evento) {
  var pedido = evento.request;
  if (pedido.method !== 'GET') return;

  // Chamadas à API do GitHub passam direto: nunca guardar resposta de dado vivo
  // (e muito menos uma resposta autenticada) no cache do app.
  if (pedido.url.indexOf(self.registration.scope) !== 0) return;

  // Rede primeiro para o HTML (pega atualizações), cache como rede de segurança.
  if (pedido.mode === 'navigate') {
    evento.respondWith(
      fetch(pedido)
        .then(function (resposta) {
          var copia = resposta.clone();
          caches.open(CACHE).then(function (c) { c.put(pedido, copia); });
          return resposta;
        })
        .catch(function () {
          return caches.match(pedido).then(function (r) {
            return r || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Demais arquivos: cache primeiro, é o que faz abrir instantâneo e offline.
  evento.respondWith(
    caches.match(pedido).then(function (achado) {
      return achado || fetch(pedido).then(function (resposta) {
        if (resposta.ok && pedido.url.indexOf(self.registration.scope) === 0) {
          var copia = resposta.clone();
          caches.open(CACHE).then(function (c) { c.put(pedido, copia); });
        }
        return resposta;
      });
    })
  );
});
