/* ==========================================================
   AyaSwipe — reels UX + Tajwīd + translation + mobile polish
   ========================================================== */
(() => {
    // DOM
    const feed = document.getElementById('feed');
    const gate = document.getElementById('gate');
    const startBtn = document.getElementById('startBtn');
    const muteBtn = document.getElementById('muteBtn');
    const fontBtn = document.getElementById('fontBtn');
    const whoami = document.getElementById('whoami');
    const usernameInput = document.getElementById('username');
    const saveUserBtn = document.getElementById('saveUserBtn');

    // Bottom nav
    const bTabs = Array.from(document.querySelectorAll('#bottombar .btab'));
    const pill = document.getElementById('pillIndicator');

    // Drawer
    const drawer = document.getElementById('drawer');
    const drawerBtn = document.getElementById('drawerBtn');
    const closeDrawer = document.getElementById('closeDrawer');
    const scrim = document.getElementById('scrim');
    const surahListEl = document.getElementById('surahList');
    const surahSearch = document.getElementById('surahSearch');

    // API endpoints
    const CHAPTERS_URL = (lang = 'en') =>
        `https://api.quran.com/api/v4/chapters?language=${lang}`;
    const TAJWEED_URL = (s, a) =>
        `https://api.quran.com/api/v4/quran/verses/uthmani_tajweed?verse_key=${s}:${a}`;
    const AUDIO_URL = (s, a) =>
        `https://api.quran.com/api/v4/recitations/7/by_ayah/${s}:${a}`;

    // Translation: primary + fallback (Saheeh International #131)
    async function fetchTranslation(s, a) {
        const url1 = `https://api.quran.com/api/v4/verses/by_key/${s}:${a}?language=en&translations=131`;
        try {
            const r1 = await fetch(url1, { cache: 'force-cache' });
            if (!r1.ok) console.warn('TR primary not OK', s, a, r1.status);
            if (r1.ok) {
                const j1 = await r1.json();
                const t = j1?.verse?.translations?.[0]?.text || '';
                if (t) return t;
                console.warn('TR primary missing text', s, a, j1);
            }
        } catch (e) { console.warn('TR primary error', s, a, e); }

        const url2 = `https://api.quran.com/api/v4/quran/translations/131?verse_key=${s}:${a}`;
        try {
            const r2 = await fetch(url2, { cache: 'force-cache' });
            if (!r2.ok) console.warn('TR fallback not OK', s, a, r2.status);
            if (r2.ok) {
                const j2 = await r2.json();
                const t = j2?.translations?.[0]?.text || '';
                if (t) return t;
                console.warn('TR fallback missing text', s, a, j2);
            }
        } catch (e) { console.warn('TR fallback error', s, a, e); }

        return '';
    }

    // Audio CDN normalize (API sometimes returns relative paths)
    const CDN_BASE = 'https://verses.quran.foundation/';
    const normalizeAudioUrl = (u) =>
        (u ? (/^https?:\/\//i.test(u) ? u : CDN_BASE + u.replace(/^\/+/, '')) : null);

    // Surah sizes
    const ayahsPerSurah = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6];

    // State
    let unlocked = false, muted = false;
    let mode = 'foryou'; // main feed
    let currentSurah = 1, currentAyah = 1;
    let loadingMore = false;
    const PAGE_SIZE = 5;

    // Chapters
    let chapters = []; let chapterById = new Map();

    // Audio elements per card
    const audioMap = new Map();

    // Playback scheduler
    let currentElId = null, playRequestToken = 0;

    // —— Auth stub (local) —— //
    const saveUser = (u) => localStorage.setItem('qs_user', u || '');
    const getUser = () => localStorage.getItem('qs_user') || '';
    function refreshWhoAmI() {
        const u = getUser();
        whoami.textContent = u ? `Hi, ${u}` : '';
        if (u && !usernameInput.value) usernameInput.value = u;
    }
    saveUserBtn?.addEventListener('click', () => {
        saveUser(usernameInput.value.trim());
        refreshWhoAmI();
    });

    // —— Helpers —— //
    const escapeHTML = (s) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    const getNextPointer = (s, a) => { let ns = s, na = a + 1; if (na > ayahsPerSurah[s - 1]) { ns = s + 1; na = 1 } return { s: ns, a: na } };
    const hasMore = (s, a) => s <= 114 && a <= ayahsPerSurah[s - 1];
    function surahLabel(id) { const c = chapterById.get(id); return (c?.name_simple || `${id}`).toLowerCase(); }

    // Deterministic / random starts
    function ayahOfTheDay() {
        const total = ayahsPerSurah.reduce((a, b) => a + b, 0);
        const day = Math.floor(Date.now() / 86400000);
        let idx = (day % total) + 1, acc = 0;
        for (let s = 1; s <= 114; s++) { if (idx <= acc + ayahsPerSurah[s - 1]) return { s, a: idx - acc }; acc += ayahsPerSurah[s - 1]; }
        return { s: 1, a: 1 };
    }
    function surahOfTheWeek() { const week = Math.floor((Date.now() / 86400000) / 7); return { s: (week % 114) + 1, a: 1 }; }
    function randomStart() { const s = Math.floor(Math.random() * 114) + 1; const a = Math.floor(Math.random() * ayahsPerSurah[s - 1]) + 1; return { s, a }; }

    // —— API —— //
    async function fetchChapters() {
        const r = await fetch(CHAPTERS_URL('en'));
        if (!r.ok) throw new Error('chapters');
        const j = await r.json();
        chapters = j?.chapters || [];
        chapterById = new Map(chapters.map(c => [c.id, c]));
        renderSurahList('');
    }
    async function fetchTajweedHTML(s, a) {
        const r = await fetch(TAJWEED_URL(s, a), { cache: 'force-cache' });
        if (!r.ok) throw new Error(`tajweed ${s}:${a}`);
        const j = await r.json();
        return j?.verses?.[0]?.text_uthmani_tajweed || '';
    }
    async function fetchAudioUrl(s, a) {
        const r = await fetch(AUDIO_URL(s, a), { cache: 'no-store' });
        if (!r.ok) throw new Error(`audio ${s}:${a}`);
        const j = await r.json();
        const item = (j.audio_files && j.audio_files[0]) || null;
        return normalizeAudioUrl(item?.url || item?.audio_url || null);
    }

    // —— UI —— //
    function makeAyahCard({ s, a, html, audioUrl, translation }) {
        const el = document.createElement('section');
        el.className = 'ayah';
        el.dataset.surah = s; el.dataset.ayah = a; el.dataset.elid = `ayah-${s}-${a}`;
        const label = `${surahLabel(s)}:${a}`;
        const trHTML = translation
            ? `<div class="tr">${escapeHTML(translation)}</div>`
            : `<div class="tr" style="display:none;"></div>`;
        el.innerHTML = `
      <div class="ayah-inner">
        <div class="text-ar">${html || ''}</div>
        <div class="meta">(${label})</div>
        ${trHTML}
      </div>
    `;
        const audio = new Audio();
        audio.preload = 'auto'; audio.setAttribute('playsinline', ''); audio.crossOrigin = 'anonymous';
        audio.src = audioUrl || ''; audio.muted = muted;
        audioMap.set(el.dataset.elid, audio);
        io.observe(el);
        return el;
    }

    function clearFeed() {
        audioMap.forEach(a => { try { a.pause() } catch { } });
        audioMap.clear();
        feed.innerHTML = '';
    }

    async function loadMore(count = PAGE_SIZE) {
        if (loadingMore) return; loadingMore = true;
        let s = currentSurah, a = currentAyah;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
            if (!hasMore(s, a)) break;
            try {
                const [html, url] = await Promise.all([
                    fetchTajweedHTML(s, a),
                    fetchAudioUrl(s, a)
                ]);
                let tr = ''; try { tr = await fetchTranslation(s, a); } catch { }
                frag.appendChild(makeAyahCard({ s, a, html: html, audioUrl: url, translation: tr }));
            } catch (_) {
                frag.appendChild(makeAyahCard({ s, a, html: '‎', audioUrl: '', translation: '' }));
            }
            const nxt = getNextPointer(s, a); s = nxt.s; a = nxt.a;
        }
        feed.appendChild(frag);
        feed.setAttribute('aria-busy', 'false');
        currentSurah = s; currentAyah = a; loadingMore = false;
    }

    // —— Playback —— //
    function pauseAllExcept(except) {
        audioMap.forEach(a => { if (a !== except) { try { a.pause(); a.currentTime = 0; } catch { } } });
    }
    function requestPlayFor(el) {
        if (!el || !unlocked || muted) return;
        const id = el.dataset.elid, audio = audioMap.get(id); if (!audio) return;
        if (currentElId === id && !audio.paused) return;
        const token = ++playRequestToken;
        setTimeout(async () => {
            if (token !== playRequestToken) return;
            const a = audioMap.get(id); if (!a) return;
            pauseAllExcept(a); currentElId = id;
            try { a.load(); } catch { }
            try { await a.play(); } catch { }
            try {
                a.volume = 0; let i = 0, steps = 8; const step = Math.max(10, Math.floor(150 / steps));
                const t = setInterval(() => { i++; a.volume = Math.min(1, i / steps); if (i >= steps) clearInterval(t); }, step);
            } catch { }
        }, 20);
    }

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const el = entry.target;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                requestPlayFor(el); maybeQueueMore(el);
            } else {
                const a = audioMap.get(el.dataset.elid);
                if (a) { if (currentElId === el.dataset.elid) currentElId = null; try { a.pause(); a.currentTime = 0; } catch { } }
            }
        });
    }, { root: feed, threshold: [0, 0.6] });

    function maybeQueueMore(el) {
        const all = [...feed.children]; const idx = all.indexOf(el);
        if (idx >= all.length - 3) loadMore(PAGE_SIZE);
    }

    // Debounced scroll settle
    let scrollTimer = null;
    feed.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            if (!unlocked || muted) return;
            const visible = getMostVisible(); requestPlayFor(visible);
        }, 80);
    }, { passive: true });
    function getMostVisible() {
        const cards = [...feed.children]; const st = feed.scrollTop;
        let best = null, bestDelta = Infinity;
        for (const el of cards) { const d = Math.abs(el.offsetTop - st); if (d < bestDelta) { bestDelta = d; best = el; } }
        return best;
    }

    // —— Modes —— //
    function computeStartForMode(m) {
        if (m === 'foryou') return randomStart();
        if (m === 'aotd') return ayahOfTheDay();
        if (m === 'sotw') return surahOfTheWeek();
        return randomStart();
    }

    async function setMode(nextMode, opts = {}) {
        mode = nextMode;

        // highlight current tab (ensure aria-current="page")
        document.querySelectorAll('#bottombar .btab[data-mode]').forEach(b => {
            if (b.dataset.mode === mode) b.setAttribute('aria-current', 'page');
            else b.removeAttribute('aria-current');
        });
        syncPillToActive();

        // haptic tap (supported devices only)
        if ('vibrate' in navigator) { try { navigator.vibrate(10); } catch { } }

        // load content
        const start = opts.start || computeStartForMode(mode);
        clearFeed();
        currentSurah = start.s; currentAyah = start.a;
        await loadMore(PAGE_SIZE);
        const first = feed.querySelector('.ayah');
        if (first) first.scrollIntoView({ block: 'start' });
        if (unlocked && !muted) requestPlayFor(first);
    }

    // Bottom bar clicks
    bTabs.forEach(btn => {
        const m = btn.dataset.mode; if (!m) return;
        btn.addEventListener('click', (ev) => {
            const r = btn.getBoundingClientRect();
            btn.style.setProperty('--rx', `${ev.clientX - r.left}px`);
            btn.style.setProperty('--ry', `${ev.clientY - r.top}px`);
            setMode(m);
        });
    });

    // Drawer interactions
    function openDrawer() { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); scrim.classList.add('show'); }
    function closeDrawerFn() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); scrim.classList.remove('show'); }

    drawerBtn.addEventListener('click', openDrawer);
    closeDrawer.addEventListener('click', closeDrawerFn);
    scrim.addEventListener('click', closeDrawerFn);

    function renderSurahList(filter) {
        const q = (filter || '').trim().toLowerCase();
        surahListEl.innerHTML = '';
        chapters.forEach(c => {
            const en = (c.name_simple || '').toLowerCase();
            const ar = (c.name_arabic || '');
            if (q && !(en.includes(q) || ar.includes(filter))) return;
            const li = document.createElement('li');
            li.innerHTML = `<span class="en">${c.id}. ${c.name_simple}</span><span class="ar">${c.name_arabic}</span>`;
            li.addEventListener('click', async () => {
                closeDrawerFn();
                clearFeed();
                currentSurah = c.id; currentAyah = 1;
                await loadMore(PAGE_SIZE);
                const first = feed.querySelector('.ayah');
                if (first) first.scrollIntoView({ block: 'start' });
                if (unlocked && !muted) requestPlayFor(first);
            });
            surahListEl.appendChild(li);
        });
    }
    surahSearch.addEventListener('input', e => renderSurahList(e.target.value || ''));

    // Moving glow pill
    function movePillTo(btn) {
        if (!btn) return;
        const bar = document.getElementById('bottombar');
        const rBar = bar.getBoundingClientRect();
        const rBtn = btn.getBoundingClientRect();
        const pad = 24;
        const targetWidth = Math.max(110, Math.round(rBtn.width + pad));
        pill.style.width = `${targetWidth}px`;
        const centerX = rBtn.left - rBar.left + (rBtn.width / 2);
        const leftX = Math.round(centerX - (targetWidth / 2));
        pill.style.setProperty('--pill-x', `${leftX}px`);
    }
    function syncPillToActive() {
        const active = document.querySelector('#bottombar .btab[aria-current="page"]');
        requestAnimationFrame(() => movePillTo(active));
    }
    const ro = new ResizeObserver(() => { syncPillToActive(); });
    ro.observe(document.getElementById('bottombar'));
    window.addEventListener('orientationchange', () => { syncPillToActive(); });

    // Font size toggle
    const FONT_KEY = 'qs_font_lg';
    function applyFontPref() {
        const lg = localStorage.getItem(FONT_KEY) === '1';
        document.body.classList.toggle('text-lg', lg);
        fontBtn.textContent = '📖';
    }
    fontBtn.addEventListener('click', () => {
        const newLg = !(localStorage.getItem(FONT_KEY) === '1');
        localStorage.setItem(FONT_KEY, newLg ? '1' : '0');
        applyFontPref();
    });

    // Start gate & audio unlock
    let audioCtx = null;
    async function unlockAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch { } }
        try {
            const b = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
            const s = audioCtx.createBufferSource();
            s.buffer = b; s.connect(audioCtx.destination); s.start(0);
        } catch { }
    }

    muteBtn.addEventListener('click', () => {
        muted = !muted; muteBtn.textContent = muted ? '🔇' : '🔊';
        audioMap.forEach(a => { a.muted = muted; if (muted) try { a.pause(); } catch { } });
        if (!muted && unlocked) { const v = getMostVisible(); requestPlayFor(v); }
    });

    // Init
    (async function init() {
        refreshWhoAmI();
        await fetchChapters();
        applyFontPref();
    })();

    startBtn.addEventListener('click', async () => {
        await unlockAudio(); unlocked = true;
        gate.style.display = 'none';
        muteBtn.hidden = false; fontBtn.hidden = false;
        await setMode('foryou');
        syncPillToActive();
    });

})();
