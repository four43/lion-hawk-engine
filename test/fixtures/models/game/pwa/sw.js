const CACHE = 'fixture-__VERSION__';
const PRECACHE = __PRECACHE__;
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE))));
