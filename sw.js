/*
 * Solitaire Collection — offline service worker.
 *
 * The whole game is a handful of static files, so everything is precached on
 * install and served from the cache first. Once installed the game runs with
 * no network at all: on a plane, in a tunnel, in aeroplane mode.
 *
 * Bump CACHE whenever a file below changes — the new worker installs a fresh
 * cache, deletes the old one, and takes over.
 */
var CACHE = 'solitaire-collection-v1';

var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/cards.js',
  './js/game.js',
  './js/rules/klondike.js',
  './js/rules/spider.js',
  './js/rules/freecell.js',
  './js/rules/pyramid.js',
  './js/score.js',
  './js/fx.js',
  './js/sound.js',
  './js/view.js',
  './js/app.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations may carry query strings (?game=spider&deal=42); always answer
  // them with the cached shell so a deep link works offline too.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(function (hit) {
        return hit || fetch(request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        // keep anything else we fetch, so a later flight has it too
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
