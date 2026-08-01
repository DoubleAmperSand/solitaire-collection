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
var CACHE = 'solitaire-collection-v5';

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

/**
 * The page itself, from the network when there is one.
 *
 * Answering it from the cache first is what made a published fix invisible on
 * a device that already had a copy: the old page came back, and the old page
 * is what decides whether to look for a new one. Going to the network first
 * means being online is enough. The cache still answers when the network does
 * not, which is what keeps the game playable on a plane — and it answers
 * quickly rather than after a long wait on a bad connection.
 */
function freshShell(request) {
  return new Promise(function (resolve) {
    var settled = false;
    function fromCache() {
      if (settled) return;
      settled = true;
      caches.match('./index.html').then(function (hit) {
        resolve(hit || fetch(request));
      });
    }
    var timer = setTimeout(fromCache, 2500);

    fetch(request).then(function (response) {
      clearTimeout(timer);
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put('./index.html', copy); });
      }
      if (settled) return;          // the cache already answered; keep the copy
      settled = true;
      resolve(response);
    }).catch(function () {
      clearTimeout(timer);
      fromCache();
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations may carry query strings (?game=spider&deal=42), and deep
  // links have to work offline too, so the fallback is the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(freshShell(request));
    return;
  }

  event.respondWith(
    // ignoreSearch so the version-stamped URLs in index.html — style.css?v=5
    // and the rest, which exist to defeat the browser's own HTTP cache —
    // still match the plain paths that were precached
    caches.match(request, { ignoreSearch: true }).then(function (hit) {
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
