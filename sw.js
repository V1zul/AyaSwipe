// sw.js
const CACHE = 'ayaswipe-v3';
const B = self.registration.scope; // e.g. https://v1zul.github.io/QuranApp/

const ASSETS = [
  `${B}`,                   // index
  `${B}index.html`,
  `${B}style.css`,
  `${B}script.js`,
  `${B}manifest.webmanifest`,
  `${B}icons/icon-192.png`,
  `${B}icons/icon-512.png`,
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
});

self.addEventListener('fetch', e=>{
  const { request } = e;
  if (request.url.includes('api.quran.com') || request.url.match(/\.mp3($|\?)/)) {
    e.respondWith(fetch(request).catch(()=>caches.match(request)));
  } else {
    e.respondWith(caches.match(request).then(r=>r||fetch(request)));
  }
});
